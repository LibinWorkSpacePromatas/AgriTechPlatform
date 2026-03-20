import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';

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
  ndre: number | null;
  evi: number | null;
  ndre_status: string;
  evi_status: string;
  data_quality: 'good' | 'degraded' | 'no_data';
  warning: string | null;
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
      map(payload => this.normalize(payload, blockId)),
      catchError(error => {
        console.error('GrowingOpportunitiesService error:', error);
        return of<OpportunitiesResponse>({
          block_id: blockId,
          crop: null,
          source: 'simulated',
          composite_date_from: null,
          composite_date_to: null,
          ndre: null,
          evi: null,
          ndre_status: 'no_data',
          evi_status: 'no_data',
          data_quality: 'no_data',
          warning: 'Unable to load NDRE/EVI opportunities right now.',
          opportunities: []
        });
      })
    );
  }

  private normalize(payload: unknown, blockId: string): OpportunitiesResponse {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Opportunities payload was not an object.');
    }

    const candidate = payload as Partial<OpportunitiesResponse>;
    return {
      block_id: typeof candidate.block_id === 'string' ? candidate.block_id : blockId,
      crop: typeof candidate.crop === 'string' ? candidate.crop : null,
      source: candidate.source === 'simulated' ? 'simulated' : 'real',
      composite_date_from: typeof candidate.composite_date_from === 'string' ? candidate.composite_date_from : null,
      composite_date_to: typeof candidate.composite_date_to === 'string' ? candidate.composite_date_to : null,
      ndre: typeof candidate.ndre === 'number' ? candidate.ndre : null,
      evi: typeof candidate.evi === 'number' ? candidate.evi : null,
      ndre_status: typeof candidate.ndre_status === 'string' ? candidate.ndre_status : 'no_data',
      evi_status: typeof candidate.evi_status === 'string' ? candidate.evi_status : 'no_data',
      data_quality: candidate.data_quality === 'degraded' || candidate.data_quality === 'no_data' ? candidate.data_quality : 'good',
      warning: typeof candidate.warning === 'string' ? candidate.warning : null,
      opportunities: Array.isArray(candidate.opportunities)
        ? candidate.opportunities.map(item => ({
            id: typeof item.id === 'string' ? item.id : 'opportunity',
            title: typeof item.title === 'string' ? item.title : 'Satellite Opportunity',
            description: typeof item.description === 'string' ? item.description : '',
            full_description: typeof item.full_description === 'string' ? item.full_description : '',
            key_points: Array.isArray(item.key_points) ? item.key_points.filter((value): value is string => typeof value === 'string') : [],
            tags: Array.isArray(item.tags) ? item.tags.filter((value): value is string => typeof value === 'string') : [],
            priority: item.priority === 'high' || item.priority === 'low' ? item.priority : 'medium',
            driver_indices: Array.isArray(item.driver_indices)
              ? item.driver_indices.filter((value): value is 'ndre' | 'evi' => value === 'ndre' || value === 'evi')
              : []
          }))
        : []
    };
  }
}
