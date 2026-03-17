import { Component, OnInit, OnDestroy, AfterViewInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Droplet, Waves, Calendar, Activity, AlertCircle, MapPin, Search, Layers } from 'lucide-angular';
import { WaterIrrigationService, IrrigationStatus } from '../../services/water-irrigation/water-irrigation.service';
import { BlockService } from '../../shared/services/block.service';
import { AuthService } from '../../core/services/auth.service';
import { Block } from '../../shared/models';
import { Subject, takeUntil, interval, startWith, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import * as L from 'leaflet';

@Component({
  selector: 'app-water-irrigation',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule],
  templateUrl: './water-irrigation.component.html',
  styleUrl: './water-irrigation.component.css'
})
export class WaterIrrigationComponent implements OnInit, OnDestroy, AfterViewInit {
  DropletIcon = Droplet;
  WavesIcon = Waves;
  CalendarIcon = Calendar;
  ActivityIcon = Activity;
  AlertIcon = AlertCircle;
  MapPinIcon = MapPin;
  SearchIcon = Search;
  LayersIcon = Layers;

  irrigationStatus: IrrigationStatus | null = null;
  isLoading = true;
  error: string | null = null;
  blocks: Block[] = [];

  // Coordinates for search - will be initialized from BlockService
  latitude: number = 0;
  longitude: number = 0;
  currentLan: string = "";
  selectedBlockName: string = "";
  selectedBlockLan: string = "";

  // Map properties
  private map!: L.Map;
  private marker!: L.Marker;
  private isBrowser: boolean;

  // Australia Bounds
  private readonly AUS_BOUNDS = {
    latMin: -44,
    latMax: -10,
    lngMin: 112,
    lngMax: 154
  };

  private destroy$ = new Subject<void>();

  constructor(
    private waterIrrigationService: WaterIrrigationService,
    private blockService: BlockService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    // Subscribe to active user and map their blocks
    this.authService.activeUser$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      if (user) {
        this.syncBlocksFromGlobal(user);
      }
    });

    // Initialize from the currently selected block
    const initialBlock = this.blockService.getSelectedBlock();
    if (initialBlock) {
      this.latitude = initialBlock.lat;
      this.longitude = initialBlock.lon;
      this.currentLan = initialBlock.lan;
      this.selectedBlockName = initialBlock.name;
      this.selectedBlockLan = initialBlock.lan;
      console.log('WaterIrrigationComponent: Initialized with block:', initialBlock.name);
    }
  }

  ngOnInit(): void {
    // Listen for global block selection changes
    this.blockService.selectedBlock$
      .pipe(takeUntil(this.destroy$))
      .subscribe(block => {
        if (block) {
          // If blocks list is empty (e.g. user just logged in), sync it first
          if (this.blocks.length === 0) {
            const currentUser = this.authService.getCurrentUser();
            if (currentUser) {
              this.syncBlocksFromGlobal(currentUser);
            }
          }

          console.log('=== WaterIrrigationComponent: Block Change Event ===');
          console.log('Block received:', block);
          console.log('Block name:', block.name);
          console.log('Block lat:', block.lat);
          console.log('Block lon:', block.lon);
          console.log('Block lan:', block.lan);
          console.log('Current blocks array:', this.blocks);

          this.latitude = block.lat;
          this.longitude = block.lon;
          this.currentLan = block.lan;
          this.selectedBlockName = block.name;
          this.selectedBlockLan = block.lan;

          console.log('Updated component values:');
          console.log('  latitude:', this.latitude);
          console.log('  longitude:', this.longitude);
          console.log('  selectedBlockName:', this.selectedBlockName);
          console.log('  selectedBlockLan:', this.selectedBlockLan);

          // Trigger change detection to update the UI (lat/lon inputs and dropdown)
          this.cdr.detectChanges();
          console.log('Change detection triggered');

          // Update map immediately if it exists
          if (this.map && this.marker) {
            console.log('Updating map to coordinates:', this.latitude, this.longitude);
            this.map.setView([this.latitude, this.longitude], 16);
            this.marker.setLatLng([this.latitude, this.longitude]);
            this.map.invalidateSize();
          } else {
            console.log('Map not yet initialized');
          }

          // Refresh data and update map focus
          this.refreshData(true);
        }
      });

    // Auto-refresh every 15 minutes for current location
    interval(15 * 60 * 1000)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => {
          // Get current block to extract crop name for auto-refresh
          const currentBlock = this.blocks.find(b => b.lan === this.currentLan);
          const cropName = currentBlock?.crop || 'Shiraz';
          return this.waterIrrigationService.getIrrigationStatus(this.latitude, this.longitude, this.currentLan, cropName);
        })
      )
      .subscribe({
        next: (status) => {
          this.irrigationStatus = status;
          this.error = null;
        },
        error: (error) => {
          console.error('Auto-refresh failed:', error);
        }
      });

    // Load initial data for the selected block
    this.refreshData(true);
  }

  private isInsideAustralia(lat: number, lng: number): boolean {
    return lat >= this.AUS_BOUNDS.latMin &&
      lat <= this.AUS_BOUNDS.latMax &&
      lng >= this.AUS_BOUNDS.lngMin &&
      lng <= this.AUS_BOUNDS.lngMax;
  }

  private initMap(): void {
    // Fix for Leaflet default marker icons using CDN
    const iconDefault = L.icon({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      tooltipAnchor: [16, -28],
      shadowSize: [41, 41]
    });
    L.Marker.prototype.options.icon = iconDefault;

    this.map = L.map('map').setView([this.latitude, this.longitude], 16);

    // Set map boundaries to Australia region
    const corner1 = L.latLng(this.AUS_BOUNDS.latMin - 5, this.AUS_BOUNDS.lngMin - 5);
    const corner2 = L.latLng(this.AUS_BOUNDS.latMax + 5, this.AUS_BOUNDS.lngMax + 5);
    const bounds = L.latLngBounds(corner1, corner2);
    this.map.setMaxBounds(bounds);
    this.map.on('drag', () => {
      this.map.panInsideBounds(bounds, { animate: false });
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      minZoom: 3
    }).addTo(this.map);

    this.marker = L.marker([this.latitude, this.longitude], { draggable: true }).addTo(this.map);

    // Map click to select location
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(4));
      const lng = Number(e.latlng.lng.toFixed(4));

      if (this.isInsideAustralia(lat, lng)) {
        this.latitude = lat;
        this.longitude = lng;
        // Update marker only, don't move map view immediately to avoid "jumping"
        this.marker.setLatLng([this.latitude, this.longitude]);
        this.refreshData(false); // Refresh data but don't re-init map
      } else {
        this.error = "Please select a location within Australia.";
      }
    });

    // Marker drag to select location
    this.marker.on('dragend', () => {
      const position = this.marker.getLatLng();
      const lat = Number(position.lat.toFixed(4));
      const lng = Number(position.lng.toFixed(4));

      if (this.isInsideAustralia(lat, lng)) {
        this.latitude = lat;
        this.longitude = lng;
        this.refreshData(false); // Refresh data but don't re-init map
      } else {
        // Snap back to previous valid position
        this.marker.setLatLng([this.latitude, this.longitude]);
        this.error = "Please drag the marker to a location within Australia.";
      }
    });
  }

  onBlockChange(blockLan: string): void {
    const block = this.blocks.find(b => b.lan === blockLan);
    if (block) {
      this.blockService.setSelectedBlock(block);
    }
  }

  // Helper method to sync blocks from global service
  private syncBlocksFromGlobal(user: any): void {
    if (!user) return;

    // Map user blocks to Block interface with unique coordinates
    this.blocks = user.blocks.map((block: any, index: number) => {
      const blockNumber = index + 1;

      // Get real vineyard location based on coordinates
      let vineyardLocation = user.farmLocation;
      if (block.latitude && block.longitude) {
        // Map coordinates to real vineyard locations
        if (block.latitude === -34.171 && block.longitude === 140.738) {
          vineyardLocation = 'Angove\'s Winery, Renmark';
        } else if (block.latitude === -34.2 && block.longitude === 140.745) {
          vineyardLocation = 'Mallee Estate, Renmark Ave';
        } else if (block.latitude === -34.524 && block.longitude === 138.963) {
          vineyardLocation = 'Château Tanunda, Tanunda';
        } else if (block.latitude === -34.536 && block.longitude === 138.985) {
          vineyardLocation = 'Yalumba, Angaston';
        } else if (block.latitude === -35.219 && block.longitude === 138.547) {
          vineyardLocation = 'd\'Arenberg, McLaren Vale';
        } else if (block.latitude === -35.225 && block.longitude === 138.553) {
          vineyardLocation = 'Willunga area, McLaren Vale';
        } else if (block.latitude === -34.178 && block.longitude === 139.987) {
          vineyardLocation = 'Waikerie area, Riverland';
        } else if (block.latitude === -34.185 && block.longitude === 139.995) {
          vineyardLocation = 'Near Waikerie, Riverland';
        } else if (block.latitude === -34.536 && block.longitude === 138.985) {
          vineyardLocation = 'Penfolds, Nuriootpa';
        } else if (block.latitude === -34.542 && block.longitude === 138.993) {
          vineyardLocation = 'Wolf Blass, Nuriootpa';
        }
      }

      return {
        id: block.lanslu,
        name: `BLOCK ${blockNumber} - ${block.crop || user.primaryCropName}`,
        location: vineyardLocation,
        coordinates: '',
        size: block.area,
        sizeUnit: 'ha',
        grapeVariety: block.crop || user.primaryCropName,
        crop: block.crop || user.primaryCropName,
        soilType: block.primarySoilClass,
        soilDescription: block.description,
        // Use actual coordinates from user data instead of generated ones
        lat: block.latitude || environment.irrigation.defaultLatitude,
        lon: block.longitude || environment.irrigation.defaultLongitude,
        lan: block.lanslu
      } as Block;
    });

    console.log('WaterIrrigationComponent: Synced blocks:', this.blocks);
  }

  updateLocationOnMap(): void {
    if (!this.isInsideAustralia(this.latitude, this.longitude)) {
      this.error = "Please enter coordinates within Australia (Lat: -44 to -10, Lon: 112 to 154).";
      return;
    }
    if (this.map && this.marker) {
      this.map.setView([this.latitude, this.longitude]);
      this.marker.setLatLng([this.latitude, this.longitude]);
      this.refreshData(false);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.map) {
      this.map.remove();
    }
  }

  refreshData(updateMapView: boolean = true): void {
    this.isLoading = true;
    this.error = null;

    // Get current block to extract crop name
    const currentBlock = this.blocks.find(b => b.lan === this.currentLan);
    const cropName = currentBlock?.crop || 'Shiraz';

    this.waterIrrigationService.getIrrigationStatus(this.latitude, this.longitude, this.currentLan, cropName).subscribe({
      next: (status) => {
        console.log('Final Processed Irrigation Status:', status);
        this.irrigationStatus = status;
        this.isLoading = false;
        this.error = null;

        // Handle map updates
        if (this.isBrowser) {
          // No timeout needed if map container is always in DOM
          if (!this.map) {
            this.initMap();
          } else if (updateMapView) {
            this.map.setView([this.latitude, this.longitude], 16);
            this.marker.setLatLng([this.latitude, this.longitude]);
            this.map.invalidateSize();
          }
        }
      },
      error: (error: any) => {
        console.error('Failed to load irrigation data:', error);
        this.error = error.message || 'Failed to load irrigation data. Please check your connection.';
        this.isLoading = false;
        // If it's a validation error, alert the user
        if (error.message === 'Location must be within Australia.') {
          alert(error.message);
        }
      }
    });
  }

  ngAfterViewInit(): void {
    // We handle map initialization in refreshData after content is rendered
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'urgent': return 'text-red-600';
      case 'saturated': return 'text-blue-600';
      case 'monitor': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  }

  getStatusBgColor(status: string): string {
    switch (status) {
      case 'urgent': return 'bg-red-100 border-red-200';
      case 'saturated': return 'bg-blue-100 border-blue-200';
      case 'monitor': return 'bg-yellow-100 border-yellow-200';
      default: return 'bg-gray-100 border-gray-200';
    }
  }

  getWaterHoldingLabel(factor: number): string {
    if (factor > 1.1) return 'High';
    if (factor < 0.9) return 'Low';
    return 'Medium';
  }

  getWaterHoldingClass(factor: number): string {
    if (factor > 1.1) return 'text-green-600 font-bold';
    if (factor < 0.9) return 'text-orange-600 font-bold';
    return 'text-blue-600 font-bold';
  }
}