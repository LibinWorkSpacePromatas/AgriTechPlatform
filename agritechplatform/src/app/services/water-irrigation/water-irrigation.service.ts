import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface IrrigationStatus {
  status: 'normal' | 'irrigation_alert' | 'urgent_irrigation' | 'no_data';
  ndvi: number | null;
  ndwi: number | null;
  recommendation: string;
  date: string | null;
  dataQuality: string;
  lanslu: string;
  blockId: string;
  mapTileUrl: string | null;
  pixelCount: number;
  alerts: Array<{ metric: string; code: string; severity: string; message: string; value: number; threshold: string }>;
}

interface WaterApiResponse {
  status: 'normal' | 'irrigation_alert' | 'urgent_irrigation' | 'no_data';
  ndvi: number | null;
  ndwi: number | null;
  recommendation: string;
  date: string | null;
  data_quality: string;
  lanslu: string;
  block_id: string;
  map_tile_url?: string | null;
  pixel_count?: number;
  alerts?: Array<{ metric: string; code: string; severity: string; message: string; value: number; threshold: string }>;
}

@Injectable({
  providedIn: 'root'
})
export class WaterIrrigationService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(
    private http: HttpClient
  ) {}

  getIrrigationStatus(
    blockId: string
  ): Observable<IrrigationStatus> {
    return this.http.get<WaterApiResponse>(`${this.baseUrl}/api/water/${blockId}`).pipe(
      map((data: WaterApiResponse) => ({
        status: data.status,
        ndvi: data.ndvi,
        ndwi: data.ndwi,
        recommendation: data.recommendation,
        date: data.date,
        dataQuality: data.data_quality,
        lanslu: data.lanslu,
        blockId: data.block_id,
        mapTileUrl: data.map_tile_url || null,
        pixelCount: typeof data.pixel_count === 'number' ? data.pixel_count : 0,
        alerts: data.alerts || []
      })),
      catchError(err => {
        console.error('WaterIrrigationService error:', err);
        return of(this.getFallbackStatus(blockId));
      })
    );
  }

  private getFallbackStatus(blockId: string): IrrigationStatus {
    return {
      status: 'no_data',
      ndvi: null,
      ndwi: null,
      recommendation: 'Unable to fetch water data. Please check connection.',
      date: null,
      dataQuality: 'no_data',
      lanslu: 'N/A',
      blockId: blockId,
      mapTileUrl: null,
      pixelCount: 0,
      alerts: []
    };
  }

  refreshData(blockId: string): Observable<IrrigationStatus> {
    return this.getIrrigationStatus(blockId);
  }
}
