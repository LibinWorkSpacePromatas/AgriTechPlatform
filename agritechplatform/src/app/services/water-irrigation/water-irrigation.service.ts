import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WaterResponseContract, waterResponseSchema } from '../../shared/satellite-contract.schemas';

export interface IrrigationStatus {
  status: 'Well-watered' | 'Mild stress' | 'Moderate stress' | 'Severe stress' | 'No data';
  ndwi: number | null;
  recommendation: string;
  date: string | null;
  dataQuality: 'good' | 'degraded' | 'no_data';
  lanslu: string;
  blockId: string;
  mapTileUrl: string | null;
  mapTileType: 'ndvi' | 'ndwi' | null;
  pixelCount: number;
  lastSatelliteUpdate: string | null;
  limitations: string[];
}

@Injectable({
  providedIn: 'root'
})
export class WaterIrrigationService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  getIrrigationStatus(blockId: string): Observable<IrrigationStatus> {
    return this.http.get<unknown>(`${this.baseUrl}/api/water/${blockId}`).pipe(
      map(payload => this.mapResponse(waterResponseSchema.parse(payload))),
      catchError(error => {
        console.error('WaterIrrigationService error:', error);
        return of(this.getFallbackStatus(blockId));
      })
    );
  }

  refreshData(blockId: string): Observable<IrrigationStatus> {
    return this.getIrrigationStatus(blockId);
  }

  private mapResponse(data: WaterResponseContract): IrrigationStatus {
    return {
      status: data.status,
      ndwi: data.ndwi,
      recommendation: data.recommendation,
      date: data.date,
      dataQuality: data.data_quality,
      lanslu: data.lanslu,
      blockId: data.block_id,
      mapTileUrl: data.map_tile_url,
      mapTileType: data.map_tile_type,
      pixelCount: data.pixel_count,
      lastSatelliteUpdate: data.last_satellite_update,
      limitations: [...data.limitations]
    };
  }

  private getFallbackStatus(blockId: string): IrrigationStatus {
    return {
      status: 'No data',
      ndwi: null,
      recommendation: 'Unable to fetch water data. Please check connection.',
      date: null,
      dataQuality: 'no_data',
      lanslu: 'N/A',
      blockId,
      mapTileUrl: null,
      mapTileType: null,
      pixelCount: 0,
      lastSatelliteUpdate: null,
      limitations: []
    };
  }
}
