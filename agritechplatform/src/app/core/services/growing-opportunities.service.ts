import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, finalize, of, shareReplay, tap, throwError } from 'rxjs';
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
  news_items: GrowingOpportunityNewsItem[];
  news_warning: string | null;
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

export interface GrowingOpportunityNewsResponse {
  block_id: string;
  news_items: GrowingOpportunityNewsItem[];
  news_warning: string | null;
}

export interface GrowingOpportunityNewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  source_url: string;
  published_at: string | null;
  region: string;
  category: 'funding' | 'tools' | 'help' | 'general' | string;
  tags: string[];
}

@Injectable({
  providedIn: 'root'
})
export class GrowingOpportunitiesService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');
  private readonly cacheTtlMs = 5 * 60 * 1000;
  private readonly responseCache = new Map<string, { expiresAt: number; value: GrowingOpportunitiesResponse }>();
  private readonly newsCache = new Map<string, { expiresAt: number; value: GrowingOpportunityNewsResponse }>();
  private readonly inflightRequests = new Map<string, Observable<GrowingOpportunitiesResponse>>();
  private readonly inflightNewsRequests = new Map<string, Observable<GrowingOpportunityNewsResponse>>();

  constructor(private http: HttpClient) {}

  getPageData(blockId: string, forceRefresh = false): Observable<GrowingOpportunitiesResponse> {
    const cacheKey = this.buildResponseCacheKey(blockId);
    const cached = forceRefresh ? null : this.getCachedResponse(blockId);

    if (cached) {
      return of(cached);
    }

    if (forceRefresh) {
      this.responseCache.delete(cacheKey);
    }

    const inflight = forceRefresh ? undefined : this.inflightRequests.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request$ = this.http
      .get<GrowingOpportunitiesResponse>(`${this.baseUrl}/api/blocks/${blockId}/growing-opportunities`)
      .pipe(
        tap(response => this.storeCachedResponse(blockId, response)),
        finalize(() => this.inflightRequests.delete(cacheKey)),
        shareReplay(1),
        catchError(error => this.handleError('load Growing Opportunities', error))
      );

    this.inflightRequests.set(cacheKey, request$);

    return request$;
  }

  getNewsData(blockId: string, forceRefresh = false): Observable<GrowingOpportunityNewsResponse> {
    const cacheKey = this.buildNewsCacheKey(blockId);
    const cached = forceRefresh ? null : this.getCachedNews(blockId);

    if (cached) {
      return of(cached);
    }

    if (forceRefresh) {
      this.newsCache.delete(cacheKey);
    }

    const inflight = forceRefresh ? undefined : this.inflightNewsRequests.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request$ = this.http
      .get<GrowingOpportunityNewsResponse>(`${this.baseUrl}/api/blocks/${blockId}/growing-opportunities/news`, {
        params: forceRefresh ? { force_refresh: 'true' } : {}
      })
      .pipe(
        tap(response => this.storeCachedNews(blockId, response)),
        finalize(() => this.inflightNewsRequests.delete(cacheKey)),
        shareReplay(1),
        catchError(error => this.handleError('load Growing Opportunities news', error))
      );

    this.inflightNewsRequests.set(cacheKey, request$);

    return request$;
  }

  private buildResponseCacheKey(blockId: string): string {
    return `${blockId}::page`;
  }

  private buildNewsCacheKey(blockId: string): string {
    return `${blockId}::news`;
  }

  private getCachedResponse(blockId: string): GrowingOpportunitiesResponse | null {
    const now = Date.now();
    const exactEntry = this.responseCache.get(this.buildResponseCacheKey(blockId));

    if (exactEntry && exactEntry.expiresAt > now) {
      return exactEntry.value;
    }

    if (exactEntry) {
      this.responseCache.delete(this.buildResponseCacheKey(blockId));
    }

    return null;
  }

  private getCachedNews(blockId: string): GrowingOpportunityNewsResponse | null {
    const now = Date.now();
    const exactEntry = this.newsCache.get(this.buildNewsCacheKey(blockId));

    if (exactEntry && exactEntry.expiresAt > now) {
      return exactEntry.value;
    }

    if (exactEntry) {
      this.newsCache.delete(this.buildNewsCacheKey(blockId));
    }

    return null;
  }

  private storeCachedResponse(blockId: string, response: GrowingOpportunitiesResponse): void {
    const expiresAt = Date.now() + this.cacheTtlMs;

    this.responseCache.set(this.buildResponseCacheKey(blockId), {
      expiresAt,
      value: response
    });
  }

  private storeCachedNews(blockId: string, response: GrowingOpportunityNewsResponse): void {
    const expiresAt = Date.now() + this.cacheTtlMs;

    this.newsCache.set(this.buildNewsCacheKey(blockId), {
      expiresAt,
      value: response
    });
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
