import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export type DashboardMetricKey = 'ndvi' | 'ndwi' | 'ndre' | 'evi' | 'lai';
export type DashboardMetricStatus = 'Normal' | 'Low' | 'High';
export type DashboardMetricColor = 'good' | 'warning' | 'error';
export type BackendInsightStatus = 'fresh' | 'stale' | 'updating';
export type BackendInsightSource = 'cache' | 'gee';
export type BackendDataQuality = 'good' | 'degraded' | 'no_data';

export interface DashboardMetricHistory {
  hours: number[];
  days: number[];
  weeks: number[];
  labelsHours: string[];
  labelsDays: string[];
  labelsWeeks: string[];
}

export interface DashboardMetric {
  key: DashboardMetricKey;
  title: string;
  raw: number | null;
  label: string;
  value: number | string;
  unit: string;
  status: DashboardMetricStatus;
  message: string;
  colorClass: DashboardMetricColor;
  history: DashboardMetricHistory;
}

export interface DashboardAnalysisItem {
  label: string;
  value: string;
  status: 'GOOD' | 'WARNING' | 'CRITICAL';
  message: string;
  colorClass: DashboardMetricColor;
}

export interface DashboardActionItem {
  priority: number;
  label: string;
  items: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  estimatedCost?: string;
  estimatedTime?: string;
}

export interface DashboardNutrientData {
  status: 'High' | 'Medium' | 'Low';
  reason: string;
  score: number;
  details: string[];
}

export interface DashboardYieldImpact {
  currentYieldPercent: number;
  projectedLoss: number;
  baseProfit: number;
  factors: Array<{ name: string; impact: number; severity: string }>;
}

export interface DashboardAlternativeCrop {
  cropName: string;
  suitabilityScore: number;
  profitPerHa: number;
  waterRequirement: number;
  reasons: string[];
  compatible: boolean;
  moistureCompatible: boolean;
  compatibilityNote: string;
}

export interface DashboardDecisionData {
  totalArea: number;
  current: {
    crop: string;
    lossPerHa: number;
    totalLoss: number;
    yieldLossDetails: string;
  };
  switch: {
    crop: string;
    area: number;
    profitPerHa: number;
    totalProfit: number;
    allocationMatch: number;
    validated: boolean;
    validationText: string;
  };
  keep: {
    crop: string;
    area: number;
    profitPerHa: number;
    totalProfit: number;
  };
}

export interface DashboardAdvisorData {
  riskScore: number;
  riskLevel: 'Low' | 'Moderate' | 'High';
  sensorAnalysis: DashboardAnalysisItem[];
  actions: DashboardActionItem[];
  riskExplanations: string[];
}

export interface BackendBlockInsightsResponse {
  block_id: string;
  ndvi: number | null;
  ndwi: number | null;
  ndre: number | null;
  evi: number | null;
  lai: number | null;
  status: BackendInsightStatus;
  latency_ms: number;
  source: BackendInsightSource;
  error: string | null;
  data_quality: BackendDataQuality;
  composite_date_from: string | null;
  composite_date_to: string | null;
}

export interface DashboardInsightsResponse {
  blockId: string;
  status: BackendInsightStatus;
  latencyMs: number;
  source: BackendInsightSource;
  error: string | null;
  dataQuality: BackendDataQuality;
  warning: string | null;
  compositeDateFrom: string | null;
  compositeDateTo: string | null;
  metrics: Record<DashboardMetricKey, DashboardMetric>;
  advisor: DashboardAdvisorData;
  nutrient: DashboardNutrientData;
  yieldImpact: DashboardYieldImpact;
  alternativeCrops: DashboardAlternativeCrop[];
  decision: DashboardDecisionData;
}

interface MetricPresentation {
  title: string;
  analysisLabel: string;
  unit: string;
  display: (value: number) => number;
  messageSuffix: string;
  ranges: {
    low: number;
    high: number;
  };
  labels: {
    low: string;
    medium: string;
    high: string;
  };
}

const SNAPSHOT_LABEL = 'Latest';

const METRIC_PRESENTATION: Record<DashboardMetricKey, MetricPresentation> = {
  ndvi: {
    title: 'Crop Health',
    analysisLabel: 'CROP HEALTH',
    unit: '%',
    display: value => Math.round(value * 100),
    messageSuffix: 'crop vigor',
    ranges: { low: 0.4, high: 0.7 },
    labels: { low: 'Poor', medium: 'Moderate', high: 'Healthy' }
  },
  ndwi: {
    title: 'Water Status',
    analysisLabel: 'WATER STATUS',
    unit: '%',
    display: value => Math.round(value * 100),
    messageSuffix: 'water availability',
    ranges: { low: 0.22, high: 0.35 },
    labels: { low: 'Dry', medium: 'Watch', high: 'Adequate' }
  },
  ndre: {
    title: 'Nutrient Status',
    analysisLabel: 'NUTRIENT STATUS',
    unit: '%',
    display: value => Math.round(value * 100),
    messageSuffix: 'nutrient activity',
    ranges: { low: 0.45, high: 0.58 },
    labels: { low: 'Constrained', medium: 'Moderate', high: 'Strong' }
  },
  evi: {
    title: 'Vegetation Strength',
    analysisLabel: 'VEGETATION STRENGTH',
    unit: '%',
    display: value => Math.round(value * 100),
    messageSuffix: 'vegetation strength',
    ranges: { low: 0.4, high: 0.55 },
    labels: { low: 'Weak', medium: 'Building', high: 'Strong' }
  },
  lai: {
    title: 'Growth Density',
    analysisLabel: 'GROWTH DENSITY',
    unit: ' LAI',
    display: value => Number(value.toFixed(1)),
    messageSuffix: 'growth density',
    ranges: { low: 2.3, high: 3.8 },
    labels: { low: 'Sparse', medium: 'Steady', high: 'Dense' }
  }
};

const METRIC_ORDER: DashboardMetricKey[] = ['ndvi', 'ndwi', 'ndre', 'evi', 'lai'];

@Injectable({
  providedIn: 'root'
})
export class DashboardApiService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) { }

  getBlockInsights(blockId: string): Observable<DashboardInsightsResponse> {
    return this.http.get<unknown>(`${this.baseUrl}/api/block/${blockId}/insights`).pipe(
      map(payload => this.mapToDashboardInsights(this.normalizeResponse(payload))),
      catchError(primaryError =>
        this.http.get<unknown>(`${this.baseUrl}/block/${blockId}/insights`).pipe(
          map(payload => this.mapToDashboardInsights(this.normalizeResponse(payload))),
          catchError(legacyError => {
            console.warn('Satellite insights API unavailable. Showing placeholder intelligence state.', {
              primaryError,
              legacyError
            });
            return of(this.mapToDashboardInsights(this.buildUnavailableResponse(blockId, legacyError)));
          })
        )
      )
    );
  }

  private normalizeResponse(payload: unknown): BackendBlockInsightsResponse {
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
      throw new Error('Satellite insights payload was not an object.');
    }

    const candidate = payload as Partial<BackendBlockInsightsResponse> & {
      blockId?: string;
      latencyMs?: number;
      dataQuality?: BackendDataQuality;
      compositeDateFrom?: string | null;
      compositeDateTo?: string | null;
    };

    const blockId = this.asString(candidate.block_id ?? candidate.blockId);
    if (!blockId) {
      throw new Error('Satellite insights payload was missing block_id.');
    }

    return {
      block_id: blockId,
      ndvi: this.asNullableNumber(candidate.ndvi),
      ndwi: this.asNullableNumber(candidate.ndwi),
      ndre: this.asNullableNumber(candidate.ndre),
      evi: this.asNullableNumber(candidate.evi),
      lai: this.asNullableNumber(candidate.lai),
      status: this.normalizeStatus(candidate.status),
      latency_ms: this.asNumber(candidate.latency_ms ?? candidate.latencyMs, 0),
      source: candidate.source === 'gee' ? 'gee' : 'cache',
      error: this.asNullableString(candidate.error),
      data_quality: this.normalizeDataQuality(candidate.data_quality ?? candidate.dataQuality),
      composite_date_from: this.asNullableString(candidate.composite_date_from ?? candidate.compositeDateFrom),
      composite_date_to: this.asNullableString(candidate.composite_date_to ?? candidate.compositeDateTo)
    };
  }

  private mapToDashboardInsights(response: BackendBlockInsightsResponse): DashboardInsightsResponse {
    const metrics = this.buildMetrics(response);
    const warning = this.buildWarning(response);
    const advisor = this.buildAdvisor(response, metrics);
    const nutrient = this.buildNutrient(metrics.ndre, response);
    const vitality = this.computeVitalityScore(metrics);
    const yieldImpact = this.buildYieldImpact(vitality, metrics);

    return {
      blockId: response.block_id,
      status: response.status,
      latencyMs: response.latency_ms,
      source: response.source,
      error: response.error,
      dataQuality: response.data_quality,
      warning,
      compositeDateFrom: response.composite_date_from,
      compositeDateTo: response.composite_date_to,
      metrics,
      advisor,
      nutrient,
      yieldImpact,
      alternativeCrops: [],
      decision: {
        totalArea: 0,
        current: {
          crop: 'Current Block',
          lossPerHa: Math.min(100, 100 - vitality),
          totalLoss: Math.min(100, advisor.riskScore),
          yieldLossDetails: warning || 'Satellite intelligence is within the preferred range.'
        },
        switch: {
          crop: response.status === 'fresh' ? 'Field Review' : 'Refresh Focus',
          area: 0,
          profitPerHa: vitality,
          totalProfit: vitality,
          allocationMatch: Math.max(35, 100 - advisor.riskScore),
          validated: response.data_quality !== 'no_data',
          validationText: `Source ${response.source.toUpperCase()} with ${response.data_quality.toUpperCase()} data quality.`
        },
        keep: {
          crop: 'Current Program',
          area: 0,
          profitPerHa: vitality,
          totalProfit: Math.max(25, vitality - 10)
        }
      }
    };
  }

  private buildMetrics(response: BackendBlockInsightsResponse): Record<DashboardMetricKey, DashboardMetric> {
    return METRIC_ORDER.reduce((accumulator, key) => {
      accumulator[key] = this.buildMetric(key, response[key], response);
      return accumulator;
    }, {} as Record<DashboardMetricKey, DashboardMetric>);
  }

  private buildMetric(
    key: DashboardMetricKey,
    rawValue: number | null,
    response: BackendBlockInsightsResponse
  ): DashboardMetric {
    const presentation = METRIC_PRESENTATION[key];

    if (rawValue === null) {
      return {
        key,
        title: presentation.title,
        raw: null,
        label: response.status === 'updating' ? 'Updating' : 'Unavailable',
        value: '--',
        unit: presentation.unit,
        status: 'Low',
        message: response.error || 'No satellite value is available for this metric yet.',
        colorClass: response.status === 'updating' ? 'warning' : 'error',
        history: this.buildSnapshotHistory(null)
      };
    }

    const displayValue = presentation.display(rawValue);
    const band = this.resolveMetricBand(rawValue, presentation.ranges);
    const label = band === 'good'
      ? presentation.labels.high
      : band === 'warning'
        ? presentation.labels.medium
        : presentation.labels.low;
    const status: DashboardMetricStatus = band === 'good' ? 'Normal' : 'Low';
    const message = this.buildMetricMessage(response, presentation.messageSuffix, label, band);

    return {
      key,
      title: presentation.title,
      raw: Number(rawValue.toFixed(4)),
      label,
      value: displayValue,
      unit: presentation.unit,
      status,
      message,
      colorClass: band,
      history: this.buildSnapshotHistory(typeof displayValue === 'number' ? displayValue : null)
    };
  }

  private buildAdvisor(
    response: BackendBlockInsightsResponse,
    metrics: Record<DashboardMetricKey, DashboardMetric>
  ): DashboardAdvisorData {
    const riskScore = this.computeRiskScore(response, metrics);
    const riskLevel = riskScore >= 70 ? 'High' : riskScore >= 35 ? 'Moderate' : 'Low';
    const sensorAnalysis = METRIC_ORDER.map(key => this.buildAnalysisItem(metrics[key]));
    const riskExplanations = this.buildRiskExplanations(response, metrics);

    return {
      riskScore,
      riskLevel,
      sensorAnalysis,
      actions: this.buildActions(response, metrics),
      riskExplanations
    };
  }

  private buildAnalysisItem(metric: DashboardMetric): DashboardAnalysisItem {
    return {
      label: METRIC_PRESENTATION[metric.key].analysisLabel,
      value: `${metric.value}${metric.unit}`.trim(),
      status: metric.colorClass === 'good' ? 'GOOD' : metric.colorClass === 'warning' ? 'WARNING' : 'CRITICAL',
      message: metric.message,
      colorClass: metric.colorClass
    };
  }

  private buildNutrient(metric: DashboardMetric, response: BackendBlockInsightsResponse): DashboardNutrientData {
    const ndreValue = typeof metric.value === 'number' ? metric.value : 0;
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(ndreValue * 0.8 + (response.data_quality === 'good' ? 20 : response.data_quality === 'degraded' ? 10 : 0))
      )
    );

    if (score >= 75) {
      return {
        status: 'High',
        reason: 'NDRE indicates strong nutrient activity across the latest satellite snapshot.',
        score,
        details: [
          `NDRE measured ${ndreValue}%.`,
          `Data source: ${response.source.toUpperCase()} with ${response.status.toUpperCase()} freshness.`,
          `Composite quality is ${response.data_quality.toUpperCase()}.`
        ]
      };
    }

    if (score >= 50) {
      return {
        status: 'Medium',
        reason: 'Nutrient activity is present but should be reviewed alongside the next refresh cycle.',
        score,
        details: [
          `NDRE measured ${ndreValue}%.`,
          'Monitor the next satellite refresh for movement in chlorophyll intensity.',
          `Backend latency for this response was ${response.latency_ms} ms.`
        ]
      };
    }

    return {
      status: 'Low',
      reason: 'The current NDRE signal is constrained and should be checked in the field.',
      score,
      details: [
        `NDRE measured ${ndreValue}%.`,
        `Current backend status is ${response.status.toUpperCase()}.`,
        response.error || 'Use the next refresh cycle to confirm whether this constraint persists.'
      ]
    };
  }

  private buildYieldImpact(
    vitalityScore: number,
    metrics: Record<DashboardMetricKey, DashboardMetric>
  ): DashboardYieldImpact {
    const factors = METRIC_ORDER
      .filter(key => metrics[key].colorClass !== 'good')
      .map(key => ({
        name: metrics[key].title,
        impact: metrics[key].colorClass === 'error' ? 18 : 9,
        severity: metrics[key].colorClass === 'error' ? 'high' : 'medium'
      }));

    const projectedLoss = Math.max(0, 100 - vitalityScore);

    return {
      currentYieldPercent: vitalityScore,
      projectedLoss,
      baseProfit: 100,
      factors
    };
  }

  private buildActions(
    response: BackendBlockInsightsResponse,
    metrics: Record<DashboardMetricKey, DashboardMetric>
  ): DashboardActionItem[] {
    const actions: DashboardActionItem[] = [];

    if (response.status === 'updating') {
      actions.push({
        priority: 1,
        label: 'BACKGROUND REFRESH',
        items: [
          'The backend is generating a fresh satellite composite for this block.',
          'Keep the dashboard open or refresh shortly to pick up the new intelligence state.',
          'Use current weather conditions as the live context until the refresh completes.'
        ],
        severity: 'medium',
        estimatedCost: '$0',
        estimatedTime: `${Math.max(1, Math.round(response.latency_ms / 1000))} min`
      });
    }

    if (response.status === 'stale' || response.source === 'gee') {
      actions.push({
        priority: actions.length + 1,
        label: 'CACHE REVIEW',
        items: [
          'The dashboard is showing the last successful satellite snapshot.',
          'A background refresh has been requested, so this state may improve on the next load.',
          `Current source is ${response.source.toUpperCase()} with ${response.data_quality.toUpperCase()} imagery quality.`
        ],
        severity: 'high',
        estimatedCost: '$0',
        estimatedTime: '5 min'
      });
    }

    const weakestMetrics = METRIC_ORDER.filter(key => metrics[key].colorClass !== 'good').slice(0, 2);
    weakestMetrics.forEach(key => {
      const metric = metrics[key];
      actions.push({
        priority: actions.length + 1,
        label: metric.title.toUpperCase(),
        items: [
          metric.message,
          `Current value is ${metric.value}${metric.unit}.`,
          'Validate the highlighted zone against field observations before acting on the next cycle.'
        ],
        severity: metric.colorClass === 'error' ? 'critical' : 'medium',
        estimatedCost: '$0',
        estimatedTime: '15 min'
      });
    });

    if (!actions.length) {
      actions.push({
        priority: 1,
        label: 'STABLE CONDITIONS',
        items: [
          'All available satellite signals are inside their preferred ranges.',
          'Continue monitoring weather and backend refresh metadata for any drift.',
          `Latest backend retrieval completed in ${response.latency_ms} ms.`
        ],
        severity: 'low',
        estimatedCost: '$0',
        estimatedTime: '5 min'
      });
    }

    return actions.slice(0, 3);
  }

  private buildRiskExplanations(
    response: BackendBlockInsightsResponse,
    metrics: Record<DashboardMetricKey, DashboardMetric>
  ): string[] {
    const explanations = METRIC_ORDER
      .filter(key => metrics[key].colorClass !== 'good')
      .map(key => `${metrics[key].title}: ${metrics[key].message}`);

    if (response.status === 'stale') {
      explanations.unshift('This response is coming from stale cache data while a refresh is requested in the background.');
    }

    if (response.status === 'updating') {
      explanations.unshift('This block does not yet have a fresh cached composite. The backend is updating it now.');
    }

    if (response.data_quality === 'degraded') {
      explanations.push('Imagery quality is degraded, so low-confidence interpretations should be checked against the field.');
    }

    if (response.error) {
      explanations.push(response.error);
    }

    if (!explanations.length) {
      explanations.push('Satellite intelligence is fresh, cache-served, and within the preferred operating range.');
    }

    return explanations;
  }

  private buildWarning(response: BackendBlockInsightsResponse): string | null {
    if (response.error) {
      return response.error;
    }

    if (response.status === 'updating') {
      return 'Satellite intelligence is being generated for this block.';
    }

    if (response.status === 'stale') {
      return 'Showing stale cache while the backend refreshes this block.';
    }

    if (response.source === 'gee') {
      return 'This response was refreshed directly from Google Earth Engine.';
    }

    if (response.data_quality === 'degraded') {
      return 'Cloud-heavy imagery reduced confidence in the latest composite.';
    }

    if (response.data_quality === 'no_data') {
      return 'No usable pixels were available for this composite window.';
    }

    return null;
  }

  private buildSnapshotHistory(value: number | null): DashboardMetricHistory {
    if (value === null) {
      return {
        hours: [],
        days: [],
        weeks: [],
        labelsHours: [],
        labelsDays: [],
        labelsWeeks: []
      };
    }

    return {
      hours: [value],
      days: [value],
      weeks: [value],
      labelsHours: [SNAPSHOT_LABEL],
      labelsDays: [SNAPSHOT_LABEL],
      labelsWeeks: [SNAPSHOT_LABEL]
    };
  }

  private buildUnavailableResponse(blockId: string, error: unknown): BackendBlockInsightsResponse {
    const message = this.extractErrorMessage(error);

    return {
      block_id: blockId,
      ndvi: null,
      ndwi: null,
      ndre: null,
      evi: null,
      lai: null,
      status: 'updating',
      latency_ms: 0,
      source: 'cache',
      error: message,
      data_quality: 'no_data',
      composite_date_from: null,
      composite_date_to: null
    };
  }

  private computeRiskScore(
    response: BackendBlockInsightsResponse,
    metrics: Record<DashboardMetricKey, DashboardMetric>
  ): number {
    const metricScore = METRIC_ORDER.reduce((total, key) => {
      if (metrics[key].colorClass === 'error') {
        return total + 22;
      }
      if (metrics[key].colorClass === 'warning') {
        return total + 10;
      }
      return total;
    }, 0);

    const freshnessPenalty = response.status === 'fresh' ? 0 : response.status === 'stale' ? 12 : 20;
    const qualityPenalty = response.data_quality === 'good' ? 0 : response.data_quality === 'degraded' ? 12 : 18;
    const errorPenalty = response.error ? 14 : 0;

    return Math.min(100, metricScore + freshnessPenalty + qualityPenalty + errorPenalty);
  }

  private computeVitalityScore(metrics: Record<DashboardMetricKey, DashboardMetric>): number {
    const numericValues = METRIC_ORDER.map(key => {
      const metric = metrics[key];
      if (metric.raw === null) {
        return 25;
      }
      if (key === 'lai') {
        return Math.min(100, Math.round((metric.raw / 5) * 100));
      }
      return Math.round(metric.raw * 100);
    });

    return Math.max(0, Math.min(100, Math.round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length)));
  }

  private resolveMetricBand(value: number, ranges: { low: number; high: number }): DashboardMetricColor {
    if (value < ranges.low) {
      return 'error';
    }
    if (value < ranges.high) {
      return 'warning';
    }
    return 'good';
  }

  private buildMetricMessage(
    response: BackendBlockInsightsResponse,
    messageSuffix: string,
    label: string,
    band: DashboardMetricColor
  ): string {
    if (response.status === 'updating') {
      return `Latest ${messageSuffix} is still being prepared by the backend.`;
    }

    if (response.status === 'stale') {
      return `Showing stale cache for ${messageSuffix} while a fresh refresh is queued.`;
    }

    if (response.data_quality === 'degraded') {
      return `${label} ${messageSuffix}, but cloud-heavy imagery reduced confidence.`;
    }

    if (band === 'good') {
      return `${label} ${messageSuffix} from the latest backend composite.`;
    }

    return `${label} ${messageSuffix} from the latest backend composite.`;
  }

  private normalizeStatus(status: unknown): BackendInsightStatus {
    return status === 'stale' || status === 'updating' ? status : 'fresh';
  }

  private normalizeDataQuality(dataQuality: unknown): BackendDataQuality {
    return dataQuality === 'degraded' || dataQuality === 'no_data' ? dataQuality : 'good';
  }

  private extractErrorMessage(error: unknown): string {
    if (typeof error === 'string' && error.trim()) {
      return error;
    }

    if (error && typeof error === 'object') {
      const candidate = error as { message?: unknown; error?: { detail?: unknown } };
      if (typeof candidate.error?.detail === 'string' && candidate.error.detail.trim()) {
        return candidate.error.detail;
      }
      if (typeof candidate.message === 'string' && candidate.message.trim()) {
        return candidate.message;
      }
    }

    return 'Satellite intelligence is temporarily unavailable.';
  }

  private asNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  private asNumber(value: unknown, fallback: number): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private asNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
  }
}
