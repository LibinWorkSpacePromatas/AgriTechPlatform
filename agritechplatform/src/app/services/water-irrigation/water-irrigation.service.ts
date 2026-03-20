import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface IrrigationStatus {
  status: 'well_watered' | 'mild_stress' | 'moderate_stress' | 'severe_stress' | 'no_data';
  ndwi: number | null;
  recommendation: string;
  date: string | null;
  dataQuality: string;
  lanslu: string;
  blockId: string;
  map_tile_url?: string | null;
}

interface WaterApiResponse {
  status: 'well_watered' | 'mild_stress' | 'moderate_stress' | 'severe_stress' | 'no_data';
  ndwi: number | null;
  recommendation: string;
  date: string | null;
  data_quality: string;
  lanslu: string;
  block_id: string;
  map_tile_url?: string | null;
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
    return this.fetchIrrigationStatus(blockId).pipe(
      switchMap(status => {
        // Force refresh if no data OR if we're on the water page and missing the map tile URL
        const needsRefresh = status.status === 'no_data' || !status.map_tile_url;
        return needsRefresh
          ? this.fetchIrrigationStatus(blockId, true)
          : of(status);
      }),
      catchError(err => {
        console.error('WaterIrrigationService error:', err);
        return of(this.getFallbackStatus(blockId));
      })
    );
  }

  private fetchIrrigationStatus(
    blockId: string,
    forceRefresh: boolean = false
  ): Observable<IrrigationStatus> {
    const params = forceRefresh
      ? new HttpParams().set('refresh', 'true')
      : undefined;

    return this.http.get<WaterApiResponse>(`${this.baseUrl}/api/water/${blockId}`, { params }).pipe(
      map((data: WaterApiResponse) => ({
        status: data.status,
        ndwi: data.ndwi,
        recommendation: data.recommendation,
        date: data.date,
        dataQuality: data.data_quality,
        lanslu: data.lanslu,
        blockId: data.block_id,
        map_tile_url: data.map_tile_url
      }))
    );
  }

  private getFallbackStatus(blockId: string): IrrigationStatus {
    return {
      status: 'no_data',
      ndwi: null,
      recommendation: 'Unable to fetch water data. Please check connection.',
      date: null,
      dataQuality: 'no_data',
      lanslu: 'N/A',
      blockId: blockId
    };
  }

  refreshData(blockId: string): Observable<IrrigationStatus> {
    return this.getIrrigationStatus(blockId);
  }
}
