import { Component, OnInit, OnDestroy, AfterViewInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Droplet, Waves, Calendar, Activity, AlertCircle, MapPin, Layers } from 'lucide-angular';
import { WaterIrrigationService, IrrigationStatus } from '../../services/water-irrigation/water-irrigation.service';
import { BlockService } from '../../shared/services/block.service';
import { Block } from '../../shared/models';
import { Subject, takeUntil, interval } from 'rxjs';
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
  selectedBlock: Block | null = null;

  private map!: L.Map;
  private centroidMarker?: L.CircleMarker;
  private polygonLayer?: L.GeoJSON;
  private mapTileLayer?: L.TileLayer;
  private isBrowser: boolean;

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

        if (this.map) {
          this.renderSpatialLayers();
          this.map.invalidateSize();
        }

        this.refreshData(true);
      });

    interval(15 * 60 * 1000)
      .pipe(
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.refreshData(false);
      });

    this.refreshData(true);
  }

  private applyBlockSelection(block: Block): void {
    this.selectedBlock = block;
    this.latitude = block.lat;
    this.longitude = block.lon;
    this.currentLan = block.lan;
    this.selectedBlockName = block.name;
    this.selectedBlockLan = block.lan;
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

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      minZoom: 3
    }).addTo(this.map);
    this.renderSpatialLayers();
  }

  onBlockChange(blockLan: string): void {
    const block = this.blocks.find(b => b.lan === blockLan);
    if (block) {
      this.blockService.setBlock(block);
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
          } else {
            this.renderSpatialLayers();
            if (updateMapView) {
              this.map.invalidateSize();
            }
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
    if (status === 'Severe stress') return 'text-red-600';
    if (status === 'Moderate stress' || status === 'Mild stress') return 'text-orange-600';
    if (status === 'Well-watered') return 'text-blue-600';
    return 'text-gray-600';
  }

  getStatusBgColor(status: string): string {
    if (status === 'Severe stress') return 'bg-red-100 border-red-200';
    if (status === 'Moderate stress' || status === 'Mild stress') return 'bg-orange-100 border-orange-200';
    if (status === 'Well-watered') return 'bg-blue-100 border-blue-200';
    return 'bg-gray-100 border-gray-200';
  }

  getStatusIndicatorClass(status: string): string {
    if (status === 'Severe stress') return 'urgent';
    if (status === 'Moderate stress' || status === 'Mild stress') return 'monitor';
    if (status === 'Well-watered') return 'saturated';
    return '';
  }

  formatStatusLabel(status: string): string {
    return status || 'No data';
  }

  getInsightTone(status: string): string {
    switch (status) {
      case 'degraded':
        return 'warning';
      case 'no_data':
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
    return level;
  }

  private renderSpatialLayers(): void {
    if (!this.map || !this.selectedBlock) {
      return;
    }

    if (this.mapTileLayer) {
      this.map.removeLayer(this.mapTileLayer);
      this.mapTileLayer = undefined;
    }
    if (this.polygonLayer) {
      this.map.removeLayer(this.polygonLayer);
      this.polygonLayer = undefined;
    }
    if (this.centroidMarker) {
      this.map.removeLayer(this.centroidMarker);
      this.centroidMarker = undefined;
    }

    if (this.selectedBlock.polygon) {
      this.polygonLayer = L.geoJSON(
        {
          type: 'Feature',
          geometry: this.selectedBlock.polygon,
          properties: {
            name: this.selectedBlock.name
          }
        } as any,
        {
          style: {
            color: '#16a34a',
            weight: 3,
            fillColor: '#22c55e',
            fillOpacity: 0.08
          }
        }
      ).addTo(this.map);

      const bounds = this.polygonLayer.getBounds();
      if (bounds.isValid()) {
        this.map.fitBounds(bounds.pad(0.25));
      }
    } else if (this.latitude && this.longitude) {
      this.map.setView([this.latitude, this.longitude], 16);
    }

    if (this.latitude && this.longitude) {
      this.centroidMarker = L.circleMarker([this.latitude, this.longitude], {
        radius: 7,
        color: '#14532d',
        weight: 2,
        fillColor: '#22c55e',
        fillOpacity: 0.95
      })
        .bindPopup(`${this.selectedBlock.name}<br>Centroid`)
        .addTo(this.map);
    }

    if (this.irrigationStatus?.mapTileUrl) {
      const tileLabel = this.irrigationStatus.mapTileType?.toUpperCase() || 'NDWI';
      this.mapTileLayer = L.tileLayer(this.irrigationStatus.mapTileUrl, {
        opacity: 0.7,
        zIndex: 1000,
        attribution: `${tileLabel} overlay © Sentinel-2 / Google Earth Engine`
      }).addTo(this.map);
      this.mapTileLayer.bringToFront();
    }
  }
}
