import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface IrrigationStatus {
  status: 'well_watered' | 'mild_stress' | 'moderate_stress' | 'severe_stress' | 'no_data';
  ndwi: number | null;
  recommendation: string;
  date: string | null;
  dataQuality: string;
  lanslu: string;
  blockId: string;
}

interface WaterApiResponse {
  status: 'well_watered' | 'mild_stress' | 'moderate_stress' | 'severe_stress' | 'no_data';
  ndwi: number | null;
  recommendation: string;
  date: string | null;
  data_quality: string;
  lanslu: string;
  block_id: string;
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
        ndwi: data.ndwi,
        recommendation: data.recommendation,
        date: data.date,
        dataQuality: data.data_quality,
        lanslu: data.lanslu,
        blockId: data.block_id
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
