import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export type GrowingOpportunitySeverity = 'critical' | 'warning' | 'info' | 'positive';
export type GrowingOpportunityCategory = 'nutrient' | 'canopy' | 'irrigation' | 'trend' | 'system';

export interface GrowingOpportunityRecommendation {
  id: string;
  title: string;
  category: GrowingOpportunityCategory;
  severity: GrowingOpportunitySeverity;
  metric_key: string;
  metric_label: string;
  current_value: number | string | null;
  threshold: string;
  recommended_action: string;
  message: string;
  detail: string;
  trend_note: string | null;
  message_to_farmer: string;
}

export interface GrowingOpportunitiesResponse {
  block_id: string;
  crop: string | null;
  status: 'fresh' | 'stale' | 'updating';
  freshness_status: 'fresh' | 'stale' | 'updating';
  source: 'real' | 'simulated' | 'cache' | 'gee';
  search_window_from: string | null;
  search_window_to: string | null;
  data_quality: 'good' | 'degraded' | 'no_data';
  composite_date_from: string | null;
  composite_date_to: string | null;
  last_satellite_update: string | null;
  data_age_days: number | null;
  ndvi: number | null;
  ndwi: number | null;
  evi: number | null;
  ndre: number | null;
  lai: number | null;
  cloud_cover_pct: number | null;
  pixel_count: number;
  map_tile_url: string | null;
  confidence: string;
  warning: string | null;
  trend_summary: string | null;
  recommendations: GrowingOpportunityRecommendation[];
  feedback_enabled: boolean;
}

export interface GrowingOpportunityFeedbackRequest {
  recommendation_id: string;
  helpful: boolean;
  notes?: string | null;
}

export interface GrowingOpportunityFeedbackResponse {
  saved: boolean;
  feedback_id: string;
}

@Injectable({
  providedIn: 'root'
})
export class GrowingOpportunitiesService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  getPageData(blockId: string): Observable<GrowingOpportunitiesResponse> {
    return this.http
      .get<GrowingOpportunitiesResponse>(`${this.baseUrl}/api/blocks/${blockId}/growing-opportunities`)
      .pipe(catchError(error => this.handleError('load Growing Opportunities', error)));
  }

  sendFeedback(blockId: string, payload: GrowingOpportunityFeedbackRequest): Observable<GrowingOpportunityFeedbackResponse> {
    return this.http
      .post<GrowingOpportunityFeedbackResponse>(`${this.baseUrl}/api/blocks/${blockId}/growing-opportunities/feedback`, payload)
      .pipe(catchError(error => this.handleError('save Growing Opportunities feedback', error)));
  }

  private handleError(operation: string, error: unknown): Observable<never> {
    console.error(`Failed to ${operation}.`, error);
    return throwError(() => error instanceof Error ? error : new Error(`Failed to ${operation}.`));
  }
}
