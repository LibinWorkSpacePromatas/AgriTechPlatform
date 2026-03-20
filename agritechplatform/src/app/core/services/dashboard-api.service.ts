import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export type DashboardMetricKey = 'ndvi' | 'ndwi' | 'ndre' | 'evi' | 'lai';
export type DashboardMetricStatus = 'Normal' | 'Low' | 'High';
export type DashboardMetricColor = 'good' | 'warning' | 'error';
export type BackendInsightStatus = 'fresh' | 'stale' | 'updating';
export type BackendInsightSource = 'real' | 'simulated';
export type BackendDataQuality = 'good' | 'degraded' | 'no_data';
export type DashboardTrendDirection = 'improving' | 'declining' | 'stable' | 'insufficient_data';
export type MetricStatusCode =
  | 'no_data'
  | 'normal'
  | 'warning'
  | 'irrigation_alert'
  | 'urgent_irrigation'
  | 'nutrient_issue'
  | 'canopy_alert'
  | 'high_yield'
  | 'low_yield';

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
  statusCode?: MetricStatusCode;
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

export interface DashboardTimeseriesPoint {
  date: string;
  observedOn?: string | null;
  ndvi: number | null;
  ndwi: number | null;
}

export interface DashboardTrendSignal {
  direction: DashboardTrendDirection;
  delta: number | null;
  message: string;
  anomaly: boolean;
}

export interface DashboardTrendSummary {
  hasData: boolean;
  latestDate: string | null;
  ndvi: DashboardTrendSignal;
  ndwi: DashboardTrendSignal;
  anomalyMessage: string | null;
}

export interface BackendSatelliteAlert {
  metric: DashboardMetricKey;
  code: MetricStatusCode;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  value: number;
  threshold: string;
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
  data_age_days?: number;
  confidence?: string;
  reason?: string;
  insights?: any[];
  warning?: string | null;
  metrics?: Record<DashboardMetricKey, DashboardMetric>;
  ndvi_status?: MetricStatusCode;
  ndwi_status?: MetricStatusCode;
  ndre_status?: MetricStatusCode;
  evi_status?: MetricStatusCode;
  lai_status?: MetricStatusCode;
  alerts?: BackendSatelliteAlert[];
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
  insights: any[];
  timeseries: DashboardTimeseriesPoint[];
  trends: DashboardTrendSummary;
}

interface MetricPresentation {
  title: string;
  analysisLabel: string;
  unit: string;
  display: (value: number) => number;
}

const SNAPSHOT_LABEL = 'Latest';
const HISTORY_RECENT_LIMIT = 7;
const TREND_DELTA_THRESHOLD = 0.03;
const TREND_ANOMALY_THRESHOLD = 0.12;

const METRIC_PRESENTATION: Record<DashboardMetricKey, MetricPresentation> = {
  ndvi: {
    title: 'Crop Health',
    analysisLabel: 'CROP HEALTH',
    unit: '%',
    display: value => Math.round(value * 100)
  },
  ndwi: {
    title: 'Water Status',
    analysisLabel: 'WATER STATUS',
    unit: '%',
    display: value => Math.round(value * 100)
  },
  ndre: {
    title: 'Nutrient Status',
    analysisLabel: 'NUTRIENT STATUS',
    unit: '%',
    display: value => Math.round(value * 100)
  },
  evi: {
    title: 'Vegetation Strength',
    analysisLabel: 'VEGETATION STRENGTH',
    unit: '%',
    display: value => Math.round(value * 100)
  },
  lai: {
    title: 'Growth Density',
    analysisLabel: 'GROWTH DENSITY',
    unit: ' LAI',
    display: value => Number(value.toFixed(1))
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
    return forkJoin({
      insights: this.fetchBlockInsights(blockId),
      timeseries: this.fetchBlockTimeseries(blockId)
    }).pipe(
      map(({ insights, timeseries }) => this.mapToDashboardInsights(insights, timeseries))
    );
  }

  private fetchBlockInsights(blockId: string): Observable<BackendBlockInsightsResponse> {
    return this.http.get<unknown>(`${this.baseUrl}/api/blocks/${blockId}/insights`).pipe(
      map(payload => this.normalizeResponse(payload)),
      catchError(primaryError =>
        this.http.get<unknown>(`${this.baseUrl}/api/block/${blockId}/insights`).pipe(
          map(payload => this.normalizeResponse(payload)),
          catchError(legacyError => {
            console.warn('Satellite insights API unavailable. Showing an explicit simulated empty state.', {
              primaryError,
              legacyError
            });
            return of(this.buildUnavailableResponse(blockId, legacyError));
          })
        )
      )
    );
  }

  private fetchBlockTimeseries(blockId: string): Observable<DashboardTimeseriesPoint[]> {
    return this.http.get<unknown>(`${this.baseUrl}/api/block/${blockId}/timeseries`).pipe(
      map(payload => this.normalizeTimeseries(payload)),
      catchError(error => {
        console.warn('Satellite time-series API unavailable. Continuing without historical trends.', error);
        return of([]);
      })
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
      insights?: any[];
      warning?: string | null;
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
      source: candidate.source === 'simulated' ? 'simulated' : 'real',
      error: this.asNullableString(candidate.error),
      data_quality: this.normalizeDataQuality(candidate.data_quality ?? candidate.dataQuality),
      composite_date_from: this.asNullableString(candidate.composite_date_from ?? candidate.compositeDateFrom),
      composite_date_to: this.asNullableString(candidate.composite_date_to ?? candidate.compositeDateTo),
      insights: candidate.insights || [],
      data_age_days: candidate.data_age_days ?? 0,
      confidence: candidate.confidence || 'high',
      reason: candidate.reason || '',
      warning: this.asNullableString(candidate.warning),
      metrics: this.normalizeMetrics(candidate.metrics),
      ndvi_status: this.normalizeMetricStatus(candidate.ndvi_status),
      ndwi_status: this.normalizeMetricStatus(candidate.ndwi_status),
      ndre_status: this.normalizeMetricStatus(candidate.ndre_status),
      evi_status: this.normalizeMetricStatus(candidate.evi_status),
      lai_status: this.normalizeMetricStatus(candidate.lai_status),
      alerts: this.normalizeAlerts(candidate.alerts)
    };
  }

  private normalizeTimeseries(payload: unknown): DashboardTimeseriesPoint[] {
    if (!Array.isArray(payload)) {
      throw new Error('Satellite time-series payload was not an array.');
    }

    const normalized = payload
      .map(entry => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const candidate = entry as Partial<DashboardTimeseriesPoint> & { observed_on?: string | null; recorded_at?: string | null };
        const date = this.asNullableString(candidate.date ?? candidate.recorded_at ?? candidate.observed_on);
        if (!date) {
          return null;
        }

        return {
          date,
          observedOn: this.asNullableString(candidate.observedOn ?? candidate.observed_on),
          ndvi: this.asNullableNumber(candidate.ndvi),
          ndwi: this.asNullableNumber(candidate.ndwi)
        };
      });

    return normalized
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((left, right) => this.parseDateValue(left.date).getTime() - this.parseDateValue(right.date).getTime());
  }

  private mapToDashboardInsights(
    response: BackendBlockInsightsResponse,
    timeseries: DashboardTimeseriesPoint[]
  ): DashboardInsightsResponse {
    if (!this.hasUsableRealData(response)) {
      return this.buildNoRealDataInsights(response, timeseries);
    }

    const trends = this.buildTrendSummary(timeseries);
    const metrics = response.metrics ? this.cloneMetrics(response.metrics) : this.buildMetrics(response, timeseries);
    const warning = this.buildWarning(response, trends);
    const advisor = this.buildAdvisor(response, metrics, trends);
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
      timeseries,
      trends,
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
          validationText: `Data source ${response.source.toUpperCase()} with ${response.data_quality.toUpperCase()} quality.`
        },
        keep: {
          crop: 'Current Program',
          area: 0,
          profitPerHa: vitality,
          totalProfit: Math.max(25, vitality - 10)
        }
      },
      insights: (response as any).insights || []
    };
  }

  private buildMetrics(
    response: BackendBlockInsightsResponse,
    timeseries: DashboardTimeseriesPoint[]
  ): Record<DashboardMetricKey, DashboardMetric> {
    return METRIC_ORDER.reduce((accumulator, key) => {
      accumulator[key] = this.buildMetric(key, response[key], response, timeseries);
      return accumulator;
    }, {} as Record<DashboardMetricKey, DashboardMetric>);
  }

  private buildMetric(
    key: DashboardMetricKey,
    rawValue: number | null,
    response: BackendBlockInsightsResponse,
    timeseries: DashboardTimeseriesPoint[]
  ): DashboardMetric {
    const presentation = METRIC_PRESENTATION[key];
    const statusCode = this.getMetricStatusCode(response, key);
    const statusMeta = this.getMetricStatusMeta(key, statusCode);
    const matchingAlert = response.alerts?.find(alert => alert.metric === key && alert.code === statusCode) || null;

    if (rawValue === null) {
      return {
        key,
        title: presentation.title,
        raw: null,
        label: response.status === 'updating' ? 'Updating' : statusMeta.label,
        value: '--',
        unit: presentation.unit,
        status: response.status === 'updating' ? 'Low' : statusMeta.status,
        message: response.error || matchingAlert?.message || statusMeta.message,
        colorClass: response.status === 'updating' ? 'warning' : statusMeta.colorClass,
        statusCode,
        history: this.buildMetricHistory(key, null, timeseries)
      };
    }

    const displayValue = presentation.display(rawValue);

    return {
      key,
      title: presentation.title,
      raw: Number(rawValue.toFixed(4)),
      label: statusMeta.label,
      value: displayValue,
      unit: presentation.unit,
      status: statusMeta.status,
      message: this.buildMetricMessage(response, statusMeta.message, matchingAlert?.message),
      colorClass: statusMeta.colorClass,
      statusCode,
      history: this.buildMetricHistory(key, typeof displayValue === 'number' ? displayValue : null, timeseries)
    };
  }

  private buildAdvisor(
    response: BackendBlockInsightsResponse,
    metrics: Record<DashboardMetricKey, DashboardMetric>,
    trends: DashboardTrendSummary
  ): DashboardAdvisorData {
    const riskScore = this.computeRiskScore(response, metrics, trends);
    const riskLevel = riskScore >= 70 ? 'High' : riskScore >= 35 ? 'Moderate' : 'Low';
    const sensorAnalysis = METRIC_ORDER.map(key => this.buildAnalysisItem(metrics[key]));
    const riskExplanations = this.buildRiskExplanations(response, metrics, trends);

    return {
      riskScore,
      riskLevel,
      sensorAnalysis,
      actions: this.buildActions(response, metrics, trends),
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
    metrics: Record<DashboardMetricKey, DashboardMetric>,
    trends: DashboardTrendSummary
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

    if (response.status === 'stale') {
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

    if (trends.anomalyMessage) {
      actions.push({
        priority: actions.length + 1,
        label: 'TREND ANOMALY',
        items: [
          trends.anomalyMessage,
          'Compare this movement against weather, irrigation, and field notes before making a major change.',
          'Use the next refresh cycle to confirm whether the anomaly persists or corrects.'
        ],
        severity: 'high',
        estimatedCost: '$0',
        estimatedTime: '20 min'
      });
    }

    if (trends.ndvi.direction === 'declining' || trends.ndwi.direction === 'declining') {
      const decliningMetrics = [
        trends.ndvi.direction === 'declining' ? 'NDVI' : null,
        trends.ndwi.direction === 'declining' ? 'NDWI' : null
      ].filter((metric): metric is string => !!metric);

      actions.push({
        priority: actions.length + 1,
        label: 'TREND REVIEW',
        items: [
          `${decliningMetrics.join(' and ')} are trending downward over the recent historical series.`,
          'Inspect irrigation coverage, plant stress, and recent management changes in the affected block.',
          'Escalate only if the next satellite refresh confirms the same direction of change.'
        ],
        severity: 'critical',
        estimatedCost: '$0',
        estimatedTime: '30 min'
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
    metrics: Record<DashboardMetricKey, DashboardMetric>,
    trends: DashboardTrendSummary
  ): string[] {
    const explanations = METRIC_ORDER
      .filter(key => metrics[key].colorClass !== 'good')
      .map(key => `${metrics[key].title}: ${metrics[key].message}`);

    if (trends.ndvi.direction !== 'insufficient_data') {
      explanations.unshift(trends.ndvi.message);
    }

    if (trends.ndwi.direction !== 'insufficient_data') {
      explanations.unshift(trends.ndwi.message);
    }

    if (trends.anomalyMessage) {
      explanations.unshift(trends.anomalyMessage);
    }

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

  private buildWarning(response: BackendBlockInsightsResponse, trends: DashboardTrendSummary): string | null {
    if (response.source === 'simulated') {
      return 'Simulated Data: backend intelligence is unavailable. No real satellite values are being shown.';
    }

    if (response.warning) {
      return response.warning;
    }

    if (response.error) {
      return response.error;
    }

    if (trends.anomalyMessage) {
      return trends.anomalyMessage;
    }

    if (response.status === 'updating') {
      return 'Satellite intelligence is being generated for this block.';
    }

    if (response.status === 'stale') {
      return 'Showing stale cache while the backend refreshes this block.';
    }

    if (response.data_quality === 'degraded') {
      return 'Cloud-heavy imagery reduced confidence in the latest composite.';
    }

    if (response.data_quality === 'no_data') {
      return 'No usable pixels were available for this composite window.';
    }

    const actionableAlert = response.alerts?.find(alert => alert.severity !== 'info');
    if (actionableAlert) {
      return actionableAlert.message;
    }

    if (response.source === 'real') {
      return 'This response is based on real satellite pipeline output.';
    }

    return null;
  }

  private buildMetricHistory(
    key: DashboardMetricKey,
    value: number | null,
    timeseries: DashboardTimeseriesPoint[]
  ): DashboardMetricHistory {
    if (key !== 'ndvi' && key !== 'ndwi') {
      return this.buildSnapshotHistory(value);
    }

    const points = timeseries
      .map(point => ({
        date: point.date,
        value: key === 'ndvi' ? point.ndvi : point.ndwi
      }))
      .filter((point): point is { date: string; value: number } => point.value !== null);

    if (!points.length) {
      return this.buildSnapshotHistory(value);
    }

    const recent = points.slice(-HISTORY_RECENT_LIMIT);
    const weekly = this.buildWeeklyHistory(points);

    return {
      hours: recent.map(point => this.toDisplayHistoryValue(key, point.value)),
      days: points.map(point => this.toDisplayHistoryValue(key, point.value)),
      weeks: weekly.values.map(point => this.toDisplayHistoryValue(key, point.value)),
      labelsHours: recent.map(point => this.formatChartDate(point.date)),
      labelsDays: points.map(point => this.formatChartDate(point.date)),
      labelsWeeks: weekly.labels
    };
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
      source: 'simulated',
      error: message,
      data_quality: 'no_data',
      composite_date_from: null,
      composite_date_to: null,
      ndvi_status: 'no_data',
      ndwi_status: 'no_data',
      ndre_status: 'no_data',
      evi_status: 'no_data',
      lai_status: 'no_data',
      alerts: []
    };
  }

  private buildNoRealDataInsights(
    response: BackendBlockInsightsResponse,
    timeseries: DashboardTimeseriesPoint[]
  ): DashboardInsightsResponse {
    const trends = this.buildTrendSummary(timeseries);
    const metrics = this.buildMetrics(response, timeseries);
    const warning = this.buildWarning(response, trends)
      || 'No real satellite intelligence is available for this block yet.';
    const sensorAnalysis = METRIC_ORDER.map(key => ({
      label: METRIC_PRESENTATION[key].analysisLabel,
      value: '--',
      status: 'WARNING' as const,
      message: 'Awaiting real satellite intelligence.',
      colorClass: 'warning' as const
    }));

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
      advisor: {
        riskScore: 0,
        riskLevel: 'Low',
        sensorAnalysis,
        actions: [
          {
            priority: 1,
            label: response.source === 'simulated' ? 'SIMULATED DATA' : 'WAIT FOR REAL DATA',
            items: [
              warning,
              'No agronomic recommendations are being inferred from placeholder or missing values.',
              'Return after the next successful satellite refresh to view real block intelligence.'
            ],
            severity: 'low'
          }
        ],
        riskExplanations: [warning]
      },
      nutrient: {
        status: 'Low',
        reason: 'Nutrient intelligence is unavailable until real satellite data is returned.',
        score: 0,
        details: ['No real NDRE, NDWI, or LAI values are available for this block yet.']
      },
      yieldImpact: {
        currentYieldPercent: 0,
        projectedLoss: 0,
        baseProfit: 0,
        factors: []
      },
      alternativeCrops: [],
      decision: {
        totalArea: 0,
        current: {
          crop: 'Current Block',
          lossPerHa: 0,
          totalLoss: 0,
          yieldLossDetails: 'Waiting for real satellite intelligence.'
        },
        switch: {
          crop: 'Await Real Data',
          area: 0,
          profitPerHa: 0,
          totalProfit: 0,
          allocationMatch: 0,
          validated: false,
          validationText: 'Real satellite intelligence is required before decision support is shown.'
        },
        keep: {
          crop: 'Current Program',
          area: 0,
          profitPerHa: 0,
          totalProfit: 0
        }
      },
      insights: response.alerts || [],
      timeseries,
      trends
    };
  }

  private hasUsableRealData(response: BackendBlockInsightsResponse): boolean {
    if (response.source !== 'real') {
      return false;
    }

    if (response.data_quality === 'no_data') {
      return false;
    }

    return METRIC_ORDER.some(key => response[key] !== null);
  }

  private computeRiskScore(
    response: BackendBlockInsightsResponse,
    metrics: Record<DashboardMetricKey, DashboardMetric>,
    trends: DashboardTrendSummary
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
    const trendPenalty = [trends.ndvi, trends.ndwi].reduce((total, trend) => {
      if (trend.direction === 'declining') {
        return total + 8;
      }
      return trend.anomaly ? total + 10 : total;
    }, 0);

    return Math.min(100, metricScore + freshnessPenalty + qualityPenalty + errorPenalty + trendPenalty);
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

  private buildMetricMessage(
    response: BackendBlockInsightsResponse,
    defaultMessage: string,
    alertMessage?: string | null
  ): string {
    if (response.status === 'updating') {
      return 'Latest interpretation is still being prepared by the backend.';
    }

    if (response.status === 'stale') {
      return 'Showing stale cache while a fresh refresh is queued.';
    }

    if (response.data_quality === 'degraded') {
      return alertMessage || `${defaultMessage} Cloud-heavy imagery reduced confidence.`;
    }

    return alertMessage || defaultMessage;
  }

  private buildTrendSummary(timeseries: DashboardTimeseriesPoint[]): DashboardTrendSummary {
    const ndviSignal = this.buildTrendSignal(
      'NDVI',
      timeseries
        .filter(point => point.ndvi !== null)
        .map(point => ({ date: point.date, value: point.ndvi as number }))
    );
    const ndwiSignal = this.buildTrendSignal(
      'NDWI',
      timeseries
        .filter(point => point.ndwi !== null)
        .map(point => ({ date: point.date, value: point.ndwi as number }))
    );

    const anomalySignals = [ndviSignal, ndwiSignal].filter(signal => signal.anomaly);
    const anomalyMessage = anomalySignals.length
      ? `Recent satellite history shows an unusual shift in ${anomalySignals.map(signal => signal.message.split(' ')[0]).join(' and ')}.`
      : null;
    const hasData = timeseries.some(point => point.ndvi !== null || point.ndwi !== null);

    return {
      hasData,
      latestDate: timeseries.length ? timeseries[timeseries.length - 1].date : null,
      ndvi: ndviSignal,
      ndwi: ndwiSignal,
      anomalyMessage
    };
  }

  private buildTrendSignal(
    metricLabel: 'NDVI' | 'NDWI',
    values: Array<{ date: string; value: number }>
  ): DashboardTrendSignal {
    if (values.length < 2) {
      return {
        direction: 'insufficient_data',
        delta: null,
        message: `${metricLabel} is collecting history. At least two refresh cycles are needed before a trend can be shown.`,
        anomaly: false
      };
    }

    const baselineWindow = values.slice(0, Math.min(3, values.length - 1));
    const recentWindow = values.slice(-Math.min(3, values.length));
    const baseline = this.average(baselineWindow.map(point => point.value));
    const recent = this.average(recentWindow.map(point => point.value));
    const delta = Number((recent - baseline).toFixed(4));
    const previousWindow = values.slice(0, -1).slice(-Math.min(5, values.length - 1));
    const anomalyBaseline = previousWindow.length ? this.average(previousWindow.map(point => point.value)) : baseline;
    const anomaly = Math.abs(values[values.length - 1].value - anomalyBaseline) >= TREND_ANOMALY_THRESHOLD;

    let direction: DashboardTrendDirection = 'stable';
    if (delta >= TREND_DELTA_THRESHOLD) {
      direction = 'improving';
    } else if (delta <= -TREND_DELTA_THRESHOLD) {
      direction = 'declining';
    }

    const directionText = direction === 'stable'
      ? 'is stable'
      : direction === 'improving'
        ? 'is improving'
        : 'is declining';
    const deltaText = direction === 'stable' ? '' : ` (${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`;

    return {
      direction,
      delta,
      anomaly,
      message: `${metricLabel} ${directionText} across the recent time series${deltaText}.${anomaly ? ' Latest reading is outside its recent baseline.' : ''}`
    };
  }

  private buildWeeklyHistory(points: Array<{ date: string; value: number }>): { labels: string[]; values: Array<{ key: string; value: number }> } {
    const weeklyMap = new Map<string, { label: string; total: number; count: number }>();

    points.forEach(point => {
      const weekKey = this.getWeekKey(point.date);
      const existing = weeklyMap.get(weekKey);
      if (existing) {
        existing.total += point.value;
        existing.count += 1;
        return;
      }

      weeklyMap.set(weekKey, {
        label: this.formatWeekLabel(point.date),
        total: point.value,
        count: 1
      });
    });

    const sortedEntries = Array.from(weeklyMap.entries()).sort(([left], [right]) => left.localeCompare(right));

    return {
      labels: sortedEntries.map(([, value]) => value.label),
      values: sortedEntries.map(([key, value]) => ({
        key,
        value: Number((value.total / value.count).toFixed(4))
      }))
    };
  }

  private toDisplayHistoryValue(key: DashboardMetricKey, value: number): number {
    return key === 'lai' ? Number(value.toFixed(1)) : Math.round(value * 100);
  }

  private formatChartDate(dateValue: string): string {
    const parsed = this.parseDateValue(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return dateValue;
    }

    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private formatWeekLabel(dateValue: string): string {
    const parsed = this.parseDateValue(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return dateValue;
    }

    return `Week of ${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  private getWeekKey(dateValue: string): string {
    const parsed = this.parseDateValue(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return dateValue;
    }

    const utcDate = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    const day = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 1 - day);
    return utcDate.toISOString().slice(0, 10);
  }

  private average(values: number[]): number {
    if (!values.length) {
      return 0;
    }

    return values.reduce((total, value) => total + value, 0) / values.length;
  }

  private parseDateValue(value: string): Date {
    return new Date(value.includes('T') ? value : `${value}T00:00:00`);
  }

  private normalizeStatus(status: unknown): BackendInsightStatus {
    return status === 'stale' || status === 'updating' ? status : 'fresh';
  }

  private normalizeDataQuality(dataQuality: unknown): BackendDataQuality {
    return dataQuality === 'degraded' || dataQuality === 'no_data' ? dataQuality : 'good';
  }

  private normalizeMetricStatus(status: unknown): MetricStatusCode {
    switch (status) {
      case 'normal':
      case 'warning':
      case 'irrigation_alert':
      case 'urgent_irrigation':
      case 'nutrient_issue':
      case 'canopy_alert':
      case 'high_yield':
      case 'low_yield':
      case 'no_data':
        return status;
      default:
        return 'no_data';
    }
  }

  private normalizeAlerts(alerts: unknown): BackendSatelliteAlert[] {
    if (!Array.isArray(alerts)) {
      return [];
    }

    return alerts
      .map(alert => {
        if (!alert || typeof alert !== 'object') {
          return null;
        }

        const candidate = alert as Partial<BackendSatelliteAlert>;
        if (!candidate.metric || !candidate.code || !candidate.message || typeof candidate.value !== 'number' || !candidate.threshold) {
          return null;
        }

        return {
          metric: candidate.metric,
          code: this.normalizeMetricStatus(candidate.code),
          severity: candidate.severity === 'critical' ? 'critical' : candidate.severity === 'warning' ? 'warning' : 'info',
          message: candidate.message,
          value: candidate.value,
          threshold: candidate.threshold
        } as BackendSatelliteAlert;
      })
      .filter((alert): alert is BackendSatelliteAlert => alert !== null);
  }

  private normalizeMetrics(metrics: unknown): Record<DashboardMetricKey, DashboardMetric> | undefined {
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
      return undefined;
    }

    const candidate = metrics as Partial<Record<DashboardMetricKey, DashboardMetric>>;
    const normalized = {} as Record<DashboardMetricKey, DashboardMetric>;

    for (const key of METRIC_ORDER) {
      const metric = candidate[key];
      if (!metric) {
        return undefined;
      }

      normalized[key] = {
        key,
        title: this.asString(metric.title) || METRIC_PRESENTATION[key].title,
        raw: this.asNullableNumber(metric.raw),
        label: this.asString(metric.label) || 'No Data',
        value: typeof metric.value === 'number' || typeof metric.value === 'string' ? metric.value : '--',
        unit: this.asString(metric.unit) || METRIC_PRESENTATION[key].unit,
        status: metric.status === 'High' ? 'High' : metric.status === 'Normal' ? 'Normal' : 'Low',
        message: this.asString(metric.message) || 'No interpretation available.',
        colorClass: metric.colorClass === 'good' || metric.colorClass === 'warning' ? metric.colorClass : 'error',
        statusCode: this.normalizeMetricStatus(metric.statusCode),
        history: metric.history || { hours: [], days: [], weeks: [], labelsHours: [], labelsDays: [], labelsWeeks: [] }
      };
    }

    return normalized;
  }

  private cloneMetrics(metrics: Record<DashboardMetricKey, DashboardMetric>): Record<DashboardMetricKey, DashboardMetric> {
    return METRIC_ORDER.reduce((copy, key) => {
      const metric = metrics[key];
      copy[key] = {
        ...metric,
        history: {
          hours: [...metric.history.hours],
          days: [...metric.history.days],
          weeks: [...metric.history.weeks],
          labelsHours: [...metric.history.labelsHours],
          labelsDays: [...metric.history.labelsDays],
          labelsWeeks: [...metric.history.labelsWeeks]
        }
      };
      return copy;
    }, {} as Record<DashboardMetricKey, DashboardMetric>);
  }

  private getMetricStatusCode(response: BackendBlockInsightsResponse, key: DashboardMetricKey): MetricStatusCode {
    switch (key) {
      case 'ndvi':
        return response.ndvi_status || 'no_data';
      case 'ndwi':
        return response.ndwi_status || 'no_data';
      case 'ndre':
        return response.ndre_status || 'no_data';
      case 'evi':
        return response.evi_status || 'no_data';
      case 'lai':
        return response.lai_status || 'no_data';
    }
  }

  private getMetricStatusMeta(
    key: DashboardMetricKey,
    statusCode: MetricStatusCode
  ): { label: string; colorClass: DashboardMetricColor; status: DashboardMetricStatus; message: string } {
    const labels: Record<MetricStatusCode, { label: string; colorClass: DashboardMetricColor; status: DashboardMetricStatus; message: string }> = {
      no_data: { label: 'No Data', colorClass: 'error', status: 'Low', message: 'No satellite value is available for this metric yet.' },
      normal: { label: 'Normal', colorClass: 'good', status: 'Normal', message: `${METRIC_PRESENTATION[key].title} is within the canonical range.` },
      warning: { label: 'Warning', colorClass: 'warning', status: 'Low', message: 'Canonical backend warning triggered.' },
      irrigation_alert: { label: 'Irrigation Alert', colorClass: 'warning', status: 'Low', message: 'Canonical irrigation alert triggered.' },
      urgent_irrigation: { label: 'Urgent Irrigation', colorClass: 'error', status: 'Low', message: 'Canonical urgent irrigation alert triggered.' },
      nutrient_issue: { label: 'Nutrient Issue', colorClass: 'warning', status: 'Low', message: 'Canonical nutrient issue triggered.' },
      canopy_alert: { label: 'Canopy Alert', colorClass: 'warning', status: 'High', message: 'Canonical canopy alert triggered.' },
      high_yield: { label: 'High Yield', colorClass: 'good', status: 'High', message: 'Canonical high-yield signal detected.' },
      low_yield: { label: 'Low Yield', colorClass: 'error', status: 'Low', message: 'Canonical low-yield warning triggered.' }
    };

    return labels[statusCode];
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
