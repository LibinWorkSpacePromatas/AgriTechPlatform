import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WaterMinimalResponseContract, waterMinimalResponseSchema } from '../../shared/satellite-contract.schemas';

export interface IrrigationStatus {
  status: 'Well-watered' | 'Mild stress' | 'Moderate stress' | 'Severe stress' | 'No data';
  ndwi: number | null;
  recommendation: string;
  date: string | null;
  dataQuality: 'good' | 'degraded' | 'no_data';
  blockId: string;
  compositeDateFrom: string | null;
  compositeDateTo: string | null;
  mapTileUrl: string | null;
  mapTileType: 'ndvi' | 'ndwi' | null;
  pixelCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class WaterIrrigationService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  getIrrigationStatus(blockId: string, refresh: boolean = false): Observable<IrrigationStatus> {
    return this.http.get<unknown>(`${this.baseUrl}/api/water/${blockId}/minimal`, { params: { refresh } }).pipe(
      map(payload => this.mapResponse(waterMinimalResponseSchema.parse(payload))),
      catchError(error => {
        console.error('WaterIrrigationService error:', error);
        return of(this.getFallbackStatus(blockId));
      })
    );
  }

  refreshData(blockId: string, refresh: boolean = false): Observable<IrrigationStatus> {
    return this.getIrrigationStatus(blockId, refresh);
  }

  private mapResponse(data: WaterMinimalResponseContract): IrrigationStatus {
    const status = this.classifyWaterStatus(data.ndwi);
    return {
      status,
      ndwi: data.ndwi,
      recommendation: this.actionForStatus(status),
      date: data.composite_date_to,
      dataQuality: data.data_quality,
      blockId: data.block_id,
      compositeDateFrom: data.composite_date_from,
      compositeDateTo: data.composite_date_to,
      mapTileUrl: data.map_tile_url,
      mapTileType: data.map_tile_url ? 'ndwi' : null,
      pixelCount: data.pixel_count
    };
  }

  private getFallbackStatus(blockId: string): IrrigationStatus {
    return {
      status: 'No data',
      ndwi: null,
      recommendation: 'Unable to fetch water data. Please check connection.',
      date: null,
      dataQuality: 'no_data',
      blockId,
      compositeDateFrom: null,
      compositeDateTo: null,
      mapTileUrl: null,
      mapTileType: null,
      pixelCount: 0
    };
  }

  private classifyWaterStatus(ndwi: number | null): IrrigationStatus['status'] {
    if (ndwi === null) return 'No data';
    if (ndwi > 0.1) return 'Well-watered';
    if (ndwi > -0.1) return 'Mild stress';
    if (ndwi > -0.3) return 'Moderate stress';
    return 'Severe stress';
  }

  private actionForStatus(status: IrrigationStatus['status']): string {
    if (status === 'Well-watered') return 'Check over-irrigation';
    if (status === 'Mild stress') return 'Consider irrigation in 2-3 days';
    if (status === 'Moderate stress') return 'Irrigate today';
    if (status === 'Severe stress') return 'Immediate irrigation required';
    return 'No irrigation recommendation is available until satellite data is ready.';
  }
}
