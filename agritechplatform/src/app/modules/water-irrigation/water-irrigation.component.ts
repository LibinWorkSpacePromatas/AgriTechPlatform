import { Component, OnInit, OnDestroy, AfterViewInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Droplet, Waves, Calendar, Activity, AlertCircle, MapPin, Search, Layers } from 'lucide-angular';
import { WaterIrrigationService, IrrigationStatus } from '../../services/water-irrigation/water-irrigation.service';
import { BlockService } from '../../shared/services/block.service';
import { Block } from '../../shared/models';
import { Subject, takeUntil, interval, switchMap } from 'rxjs';
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

  latitude = 0;
  longitude = 0;
  currentLan = '';
  selectedBlockName = '';
  selectedBlockLan = '';

  private map!: L.Map;
  private marker!: L.Marker;
  private isBrowser: boolean;

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
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    this.blockService.blocks$
      .pipe(takeUntil(this.destroy$))
      .subscribe(blocks => {
        this.blocks = blocks;
      });

    const initialBlock = this.blockService.getBlock();
    if (initialBlock) {
      this.applyBlockSelection(initialBlock);
      console.log('WaterIrrigationComponent: Initialized with block:', initialBlock.name);
    }
  }

  ngOnInit(): void {
    this.blockService.block$
      .pipe(takeUntil(this.destroy$))
      .subscribe(block => {
        if (!block) return;

        console.log('=== WaterIrrigationComponent: Block Change Event ===');
        console.log('Block received:', block);

        this.applyBlockSelection(block);
        this.cdr.detectChanges();

        if (this.map && this.marker) {
          this.map.setView([this.latitude, this.longitude], 16);
          this.marker.setLatLng([this.latitude, this.longitude]);
          this.map.invalidateSize();
        }

        this.refreshData(true);
      });

    interval(15 * 60 * 1000)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => {
          return this.waterIrrigationService.getIrrigationStatus(this.currentLan);
        })
      )
      .subscribe({
        next: status => {
          this.irrigationStatus = status;
          this.error = null;
        },
        error: error => {
          console.error('Auto-refresh failed:', error);
        }
      });

    this.refreshData(true);
  }

  private applyBlockSelection(block: Block): void {
    this.latitude = block.lat;
    this.longitude = block.lon;
    this.currentLan = block.lan;
    this.selectedBlockName = block.name;
    this.selectedBlockLan = block.lan;
  }

  private isInsideAustralia(lat: number, lng: number): boolean {
    return lat >= this.AUS_BOUNDS.latMin &&
      lat <= this.AUS_BOUNDS.latMax &&
      lng >= this.AUS_BOUNDS.lngMin &&
      lng <= this.AUS_BOUNDS.lngMax;
  }

  private initMap(): void {
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

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Number(e.latlng.lat.toFixed(4));
      const lng = Number(e.latlng.lng.toFixed(4));

      if (this.isInsideAustralia(lat, lng)) {
        this.latitude = lat;
        this.longitude = lng;
        this.marker.setLatLng([this.latitude, this.longitude]);
        this.refreshData(false);
      } else {
        this.error = 'Please select a location within Australia.';
      }
    });

    this.marker.on('dragend', () => {
      const position = this.marker.getLatLng();
      const lat = Number(position.lat.toFixed(4));
      const lng = Number(position.lng.toFixed(4));

      if (this.isInsideAustralia(lat, lng)) {
        this.latitude = lat;
        this.longitude = lng;
        this.refreshData(false);
      } else {
        this.marker.setLatLng([this.latitude, this.longitude]);
        this.error = 'Please drag the marker to a location within Australia.';
      }
    });
  }

  onBlockChange(blockLan: string): void {
    const block = this.blocks.find(b => b.lan === blockLan);
    if (block) {
      this.blockService.setBlock(block);
    }
  }

  updateLocationOnMap(): void {
    if (!this.isInsideAustralia(this.latitude, this.longitude)) {
      this.error = 'Please enter coordinates within Australia (Lat: -44 to -10, Lon: 112 to 154).';
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

    this.waterIrrigationService.getIrrigationStatus(this.currentLan).subscribe({
      next: status => {
        console.log('Final Processed Irrigation Status:', status);
        this.irrigationStatus = status;
        this.isLoading = false;
        this.error = null;

        if (this.isBrowser) {
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
      }
    });
  }

  ngAfterViewInit(): void {
    // Map initialization is handled in refreshData after state is ready.
  }

  getStatusColor(status: string): string {
    if (status.includes('severe_stress')) return 'text-red-600';
    if (status.includes('moderate_stress')) return 'text-orange-600';
    if (status.includes('mild_stress')) return 'text-yellow-600';
    if (status.includes('well_watered')) return 'text-blue-600';
    return 'text-gray-600';
  }

  getStatusBgColor(status: string): string {
    if (status.includes('severe_stress')) return 'bg-red-100 border-red-200';
    if (status.includes('moderate_stress')) return 'bg-orange-100 border-orange-200';
    if (status.includes('mild_stress')) return 'bg-yellow-100 border-yellow-200';
    if (status.includes('well_watered')) return 'bg-blue-100 border-blue-200';
    return 'bg-gray-100 border-gray-200';
  }

  getInsightTone(status: string): string {
    switch (status) {
      case 'stale':
        return 'warning';
      case 'updating':
        return 'info';
      default:
        return 'success';
    }
  }

  getInsightStatusLabel(status: string): string {
    switch (status) {
      case 'stale':
        return 'Satellite stale';
      case 'updating':
        return 'Satellite updating';
      default:
        return 'Satellite fresh';
    }
  }

  getRecommendationLabel(level: string): string {
    switch (level) {
      case 'high':
        return 'High irrigation';
      case 'low':
        return 'Low irrigation';
      default:
        return 'Moderate irrigation';
    }
  }
}
