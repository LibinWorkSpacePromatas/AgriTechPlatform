import { Component, OnInit, OnDestroy, AfterViewInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Droplet, Waves, Calendar, Activity, AlertCircle, MapPin, Layers, Info } from 'lucide-angular';
import { WaterIrrigationService, IrrigationStatus } from '../../services/water-irrigation/water-irrigation.service';
import { BlockService } from '../../shared/services/block.service';
import { Block } from '../../shared/models';
import { Subject, takeUntil, interval, of } from 'rxjs';
import { switchMap, takeWhile, take, finalize } from 'rxjs/operators';
import * as L from 'leaflet';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { UserDataService } from '../../core/services/user-data.service';

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
  InfoIcon = Info;

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
  private drawLayerGroup?: L.FeatureGroup;
  private drawControl?: L.Control.Draw;
  private movePreviewMarker?: L.CircleMarker;
  private leafletDrawLoading?: Promise<void>;
  private leafletDrawLoaded = false;
  private isBrowser: boolean;
  isMoveMode = false;
  pendingLat: number | null = null;
  pendingLon: number | null = null;
  showCalculationDetails = false;

  private destroy$ = new Subject<void>();

  constructor(
    private waterIrrigationService: WaterIrrigationService,
    private blockService: BlockService,
    private http: HttpClient,
    private userDataService: UserDataService,
    private authService: AuthService,
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
    this.configureDrawingTools();
    this.renderSpatialLayers();
  }

  private configureDrawingTools(): void {
    if (!this.map || this.drawControl) {
      return;
    }

    if (!this.leafletDrawLoaded && !(L as any).Control?.Draw) {
      this.ensureLeafletDrawLoaded()
        .then(() => this.configureDrawingTools())
        .catch((error) => console.error('Failed to load leaflet-draw', error));
      return;
    }

    this.drawLayerGroup = new L.FeatureGroup();
    this.map.addLayer(this.drawLayerGroup);

    this.drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        marker: false,
        circle: false,
        circlemarker: false,
        polyline: false,
        polygon: {
          allowIntersection: false,
          showArea: true
        },
        rectangle: {}
      },
      edit: {
        featureGroup: this.drawLayerGroup,
        edit: false,
        remove: true
      }
    });

    this.map.addControl(this.drawControl);

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      if (!this.isMoveMode) return;
      const { lat, lng } = e.latlng;
      this.pendingLat = lat;
      this.pendingLon = lng;
      if (this.movePreviewMarker) {
        this.movePreviewMarker.setLatLng([lat, lng]);
      } else {
        this.movePreviewMarker = L.circleMarker([lat, lng], {
          radius: 6,
          color: '#1d4ed8',
          weight: 2,
          fillColor: '#93c5fd',
          fillOpacity: 0.92
        }).bindPopup('New location preview').addTo(this.map);
      }
    });

    this.map.on(L.Draw.Event.CREATED, (event: any) => {
      console.log('DRAW CREATED EVENT FIRED ✅');
      const layer = event.layer as L.Layer & { toGeoJSON: () => any };
      if (!this.drawLayerGroup) {
        return;
      }
      const geojson = layer.toGeoJSON();
      console.log('Saving geometry:', geojson?.geometry);
      if (!this.validateBoundaryGeometry(geojson?.geometry)) {
        alert('Please draw at least 4 points for accurate boundary');
        this.enablePolygonDraw();
        return;
      }
      this.drawLayerGroup.clearLayers();
      this.drawLayerGroup.addLayer(layer);
      this.saveBlockGeometry(geojson?.geometry);
    });
  }

  private ensureLeafletDrawLoaded(): Promise<void> {
    if (this.leafletDrawLoaded) {
      return Promise.resolve();
    }
    if (this.leafletDrawLoading) {
      return this.leafletDrawLoading;
    }
    if (typeof window !== 'undefined' && !('type' in window)) {
      (window as any).type = undefined;
    }
    this.leafletDrawLoading = import('leaflet-draw')
      .then(() => {
        this.leafletDrawLoaded = true;
      })
      .finally(() => {
        this.leafletDrawLoading = undefined;
      });
    return this.leafletDrawLoading;
  }

  private saveBlockGeometry(geometry: any): void {
    if (!geometry || !this.selectedBlock) {
      return;
    }

    const selectedUser = this.authService.getCurrentUser() || this.userDataService.getUsers()[0];
    if (!selectedUser) {
      return;
    }

    const baseUrl = environment.apiBaseUrl.replace(/\/$/, '');
    this.http
      .post<any>(`${baseUrl}/api/blocks`, {
        user_id: selectedUser.userId,
        lanslu: this.selectedBlock.lan,
        crop: this.selectedBlock.crop,
        description: this.selectedBlock.soilDescription,
        geometry
      })
      .subscribe({
        next: (result) => {
          console.log('API RESPONSE:', result);
          const updated = result?.block;
          if (!updated) {
            return;
          }

          const blocks = this.blockService.getBlocks();
          const nextBlocks = blocks.map((block) => {
            if (block.lan !== updated.lanslu) {
              return block;
            }

            return {
              ...block,
              size: updated.area_ha ?? block.size,
              lat: updated.centroid_lat ?? block.lat,
              lon: updated.centroid_lon ?? block.lon,
              polygon: updated.block_polygon ?? block.polygon
            };
          });

          this.blockService.setBlocks(nextBlocks);
          this.renderSpatialLayers();
          this.map.invalidateSize();
          this.refreshAfterGeometryChange();
        },
        error: (error: any) => {
          console.error('Failed to save block geometry', error);
          const serverMessage = error?.error?.detail || error?.message || 'Unknown error';
          alert(`Failed to save boundary: ${serverMessage}`);
          this.enablePolygonDraw();
        }
      });
  }

  private validateBoundaryGeometry(geometry: any): boolean {
    if (!geometry || geometry.type !== 'Polygon') {
      return false;
    }
    try {
      const ring = geometry.coordinates?.[0] || [];
      const withoutClosing = ring.slice(0, -1);
      const uniqueVertices = new Set(
        withoutClosing.map((coord: number[]) => `${coord[0]},${coord[1]}`)
      );
      return uniqueVertices.size >= 4;
    } catch {
      return false;
    }
  }

  private enablePolygonDraw(): void {
    if (!this.map || !this.drawControl) {
      return;
    }
    try {
      const polygonOptions = (this.drawControl as any).options?.draw?.polygon || {};
      new (L as any).Draw.Polygon(this.map, polygonOptions).enable();
    } catch {
      return;
    }
  }

  toggleMoveMode(): void {
    this.isMoveMode = !this.isMoveMode;
    if (!this.isMoveMode) {
      this.pendingLat = null;
      this.pendingLon = null;
      if (this.movePreviewMarker) {
        this.map.removeLayer(this.movePreviewMarker);
        this.movePreviewMarker = undefined;
      }
    }
  }

  saveNewLocation(): void {
    if (!this.selectedBlock || this.pendingLat === null || this.pendingLon === null) {
      return;
    }

    const selectedUser = this.authService.getCurrentUser() || this.userDataService.getUsers()[0];
    if (!selectedUser) {
      return;
    }

    const baseUrl = environment.apiBaseUrl.replace(/\/$/, '');
    this.http
      .post<any>(`${baseUrl}/api/blocks/location`, {
        user_id: selectedUser.userId,
        lanslu: this.selectedBlock.lan,
        lat: this.pendingLat,
        lon: this.pendingLon
      })
      .subscribe({
        next: (result) => {
          const updated = result?.block;
          if (!updated) {
            return;
          }

          this.latitude = updated.centroid_lat ?? this.latitude;
          this.longitude = updated.centroid_lon ?? this.longitude;

          const blocks = this.blockService.getBlocks();
          const nextBlocks = blocks.map((block) => {
            if (block.lan !== updated.lanslu) {
              return block;
            }
            return {
              ...block,
              size: updated.area_ha ?? block.size,
              lat: updated.centroid_lat ?? block.lat,
              lon: updated.centroid_lon ?? block.lon,
              polygon: updated.block_polygon ?? block.polygon
            };
          });
          this.blockService.setBlocks(nextBlocks);
          this.toggleMoveMode();
          this.renderSpatialLayers();
          this.map.invalidateSize();
          this.refreshAfterGeometryChange();
        },
        error: (error: any) => {
          console.error('Failed to set block location', error);
        }
      });
  }

  clearBoundary(): void {
    if (!this.selectedBlock) {
      return;
    }
    const selectedUser = this.authService.getCurrentUser() || this.userDataService.getUsers()[0];
    if (!selectedUser) {
      return;
    }
    const baseUrl = environment.apiBaseUrl.replace(/\/$/, '');
    this.http
      .delete<any>(`${baseUrl}/api/blocks/geometry`, {
        params: {
          user_id: selectedUser.userId,
          lanslu: this.selectedBlock.lan
        }
      })
      .subscribe({
        next: (result) => {
          const updated = result?.block;
          if (!updated) {
            return;
          }
          const blocks = this.blockService.getBlocks();
          const nextBlocks = blocks.map((block) => {
            if (block.lan !== updated.lanslu) {
              return block;
            }
            return {
              ...block,
              size: updated.area_ha ?? block.size,
              lat: updated.centroid_lat ?? block.lat,
              lon: updated.centroid_lon ?? block.lon,
              polygon: updated.block_polygon ?? null
            };
          });
          this.blockService.setBlocks(nextBlocks);
          if (this.drawLayerGroup) {
            this.drawLayerGroup.clearLayers();
          }
          this.renderSpatialLayers();
          this.map.invalidateSize();
          this.refreshAfterGeometryChange();
        },
        error: (error: any) => {
          console.error('Failed to clear block geometry', error);
        }
      });
  }
  uploadShapefile(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file || !this.selectedBlock) {
      return;
    }
    const selectedUser = this.authService.getCurrentUser() || this.userDataService.getUsers()[0];
    if (!selectedUser) {
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', selectedUser.userId);
    formData.append('lanslu', this.selectedBlock.lan);
    formData.append('crop', this.selectedBlock.crop || '');
    formData.append('description', this.selectedBlock.soilDescription || '');

    const baseUrl = environment.apiBaseUrl.replace(/\/$/, '');
    this.http.post<any>(`${baseUrl}/api/blocks/upload-shapefile`, formData).subscribe({
      next: (result) => {
        if (input) {
          input.value = '';
        }
        const updated = result?.block;
        if (!updated) {
          return;
        }
        const blocks = this.blockService.getBlocks();
        const nextBlocks = blocks.map((block) => {
          if (block.lan !== updated.lanslu) {
            return block;
          }
          return {
            ...block,
            size: updated.area_ha ?? block.size,
            lat: updated.centroid_lat ?? block.lat,
            lon: updated.centroid_lon ?? block.lon,
            polygon: updated.block_polygon ?? block.polygon
          };
        });
        this.blockService.setBlocks(nextBlocks);
        this.renderSpatialLayers();
        this.map.invalidateSize();
        this.refreshAfterGeometryChange();
      },
      error: (error: any) => {
        if (input) {
          input.value = '';
        }
        console.error('Shapefile upload failed', error);
        const serverMessage = error?.error?.detail || error?.message || 'Unknown error';
        alert(`Failed to upload shapefile: ${serverMessage}`);
      }
    });
  }
  deleteSelectedBlock(): void {
    if (!this.selectedBlock) {
      return;
    }

    const selectedUser = this.authService.getCurrentUser() || this.userDataService.getUsers()[0];
    if (!selectedUser) {
      return;
    }

    const confirmed = window.confirm(`Delete block ${this.selectedBlock.lan}? This will remove the block and its cached satellite data.`);
    if (!confirmed) {
      return;
    }

    const baseUrl = environment.apiBaseUrl.replace(/\/$/, '');
    this.http
      .delete<any>(`${baseUrl}/api/blocks`, {
        params: {
          user_id: selectedUser.userId,
          lanslu: this.selectedBlock.lan
        }
      })
      .subscribe({
        next: () => {
          const remainingBlocks = this.blockService.getBlocks().filter((block) => block.lan !== this.selectedBlock?.lan);
          if (this.drawLayerGroup) {
            this.drawLayerGroup.clearLayers();
          }
          this.blockService.setBlocks(remainingBlocks);
        },
        error: (error: any) => {
          console.error('Failed to delete block', error);
        }
      });
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

  private refreshAfterGeometryChange(): void {
    const blockId = this.currentLan;
    // Do not flip global loading; keep UX stable and only update map/values.

    this.waterIrrigationService.getIrrigationStatus(blockId, true).pipe(
      switchMap((initial) => {
        this.irrigationStatus = initial;
        this.updateTileFromStatus();
        const needsPolling = initial.dataQuality === 'no_data' || initial.ndwi === null;
        if (!needsPolling) {
          return of(initial);
        }
        return interval(5000).pipe(
          take(24),
          switchMap(() => this.waterIrrigationService.getIrrigationStatus(blockId, false)),
          takeWhile((status) => status.dataQuality === 'no_data' || status.ndwi === null, true)
        );
      }),
      finalize(() => {
        // No global re-render here; keep experience smooth
      })
    ).subscribe({
      next: (status) => {
        this.irrigationStatus = status;
        this.updateTileFromStatus();
      },
      error: (error: any) => {
        console.error('Failed to refresh irrigation data after geometry change:', error);
        // Do not surface a global error; keep the map stable
      }
    });
  }

  private updateTileFromStatus(): void {
    if (!this.map) return;
    const url = this.irrigationStatus?.mapTileUrl || null;
    if (url) {
      if (this.mapTileLayer && typeof (this.mapTileLayer as any).setUrl === 'function') {
        (this.mapTileLayer as any).setUrl(url);
      } else {
        if (this.mapTileLayer) {
          this.map.removeLayer(this.mapTileLayer);
        }
        const tileLabel = this.irrigationStatus?.mapTileType?.toUpperCase() || 'NDWI';
        this.mapTileLayer = L.tileLayer(url, {
          opacity: 0.7,
          zIndex: 1000,
          attribution: `${tileLabel} overlay © Sentinel-2 / Google Earth Engine`
        }).addTo(this.map);
        this.mapTileLayer.bringToFront();
      }
    } else if (this.mapTileLayer) {
      this.map.removeLayer(this.mapTileLayer);
      this.mapTileLayer = undefined;
    }
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

  toggleCalculationDetails(): void {
    this.showCalculationDetails = !this.showCalculationDetails;
  }

  getNdwiTone(status: IrrigationStatus['status']): 'well-watered' | 'stress' | 'severe' | 'neutral' {
    if (status === 'Well-watered') return 'well-watered';
    if (status === 'Mild stress' || status === 'Moderate stress') return 'stress';
    if (status === 'Severe stress') return 'severe';
    return 'neutral';
  }

  getStatusHeadline(status: IrrigationStatus['status']): string {
    if (status === 'Severe stress') return 'Severe Water Stress';
    if (status === 'Moderate stress') return 'Moderate Stress';
    if (status === 'Mild stress') return 'Mild Stress';
    if (status === 'Well-watered') return 'Well-watered';
    return 'No data';
  }

  getStatusExplanation(status: IrrigationStatus['status']): string {
    if (status === 'Severe stress') {
      return 'Low NDWI indicates insufficient leaf water content.';
    }
    if (status === 'Moderate stress') {
      return 'NDWI suggests the crop is losing moisture and needs attention soon.';
    }
    if (status === 'Mild stress') {
      return 'NDWI shows early signs of water stress, so keep a close watch on the block.';
    }
    if (status === 'Well-watered') {
      return 'NDWI suggests the crop currently has healthy leaf water content.';
    }
    return 'NDWI is not available yet for this block.';
  }

  getWaterFillLevel(ndwi: number | null): number {
    if (ndwi === null) {
      return 12;
    }
    const normalized = ((ndwi + 1) / 2) * 100;
    return Math.max(10, Math.min(92, Math.round(normalized)));
  }

  getUrgencyLabel(status: IrrigationStatus['status']): string {
    if (status === 'Severe stress') return 'Irrigate now';
    if (status === 'Moderate stress') return 'Irrigate soon';
    if (status === 'Mild stress') return 'Watch closely';
    if (status === 'Well-watered') return 'Moisture stable';
    return 'Waiting for data';
  }

  getUrgencyTone(status: IrrigationStatus['status']): 'well-watered' | 'stress' | 'severe' | 'neutral' {
    return this.getNdwiTone(status);
  }

  getCropDisplayName(): string {
    const crop = (this.selectedBlock?.crop || '').trim();
    return crop || 'Crop';
  }

  getCropVisualClass(): 'shiraz' | 'generic' {
    const crop = (this.selectedBlock?.crop || '').toLowerCase();
    if (crop.includes('shiraz')) {
      return 'shiraz';
    }
    return 'generic';
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
