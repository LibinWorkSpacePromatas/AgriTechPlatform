import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  OpportunitiesResponseContract,
  opportunitiesResponseSchema
} from '../../shared/satellite-contract.schemas';

export interface SatelliteOpportunity {
  id: string;
  title: string;
  description: string;
  full_description: string;
  key_points: string[];
  tags: string[];
  priority: 'high' | 'medium' | 'low';
  driver_indices: Array<'ndre' | 'evi'>;
}

export interface OpportunitiesResponse {
  block_id: string;
  crop: string | null;
  source: 'real' | 'simulated';
  composite_date_from: string | null;
  composite_date_to: string | null;
  last_satellite_update: string | null;
  ndre: number | null;
  evi: number | null;
  ndre_status: string;
  evi_status: string;
  data_quality: 'good' | 'degraded' | 'no_data';
  warning: string | null;
  limitations: string[];
  opportunities: SatelliteOpportunity[];
}

@Injectable({
  providedIn: 'root'
})
export class GrowingOpportunitiesService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  getOpportunities(blockId: string): Observable<OpportunitiesResponse> {
    return this.http.get<unknown>(`${this.baseUrl}/api/opportunities/${blockId}`).pipe(
      map(payload => this.mapResponse(opportunitiesResponseSchema.parse(payload))),
      catchError(error => {
        console.error('GrowingOpportunitiesService error:', error);
        return of<OpportunitiesResponse>({
          block_id: blockId,
          crop: null,
          source: 'simulated',
          composite_date_from: null,
          composite_date_to: null,
          last_satellite_update: null,
          ndre: null,
          evi: null,
          ndre_status: 'No data',
          evi_status: 'No data',
          data_quality: 'no_data',
          warning: 'Unable to load NDRE/EVI opportunities right now.',
          limitations: [],
          opportunities: []
        });
      })
    );
  }

  private mapResponse(response: OpportunitiesResponseContract): OpportunitiesResponse {
    return {
      block_id: response.block_id,
      crop: response.crop,
      source: response.source,
      composite_date_from: response.composite_date_from,
      composite_date_to: response.composite_date_to,
      last_satellite_update: response.last_satellite_update,
      ndre: response.ndre,
      evi: response.evi,
      ndre_status: response.ndre_status,
      evi_status: response.evi_status,
      data_quality: response.data_quality,
      warning: response.warning,
      limitations: [...response.limitations],
      opportunities: response.opportunities.map(opportunity => ({
        id: opportunity.id,
        title: opportunity.title,
        description: opportunity.description,
        full_description: opportunity.full_description,
        key_points: [...opportunity.key_points],
        tags: [...opportunity.tags],
        priority: opportunity.priority,
        driver_indices: [...opportunity.driver_indices]
      }))
    };
  }
}
