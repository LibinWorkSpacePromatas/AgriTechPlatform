import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  BlockInsightsContract,
  blockInsightsSchema,
  SatelliteTimeseriesContract,
  timeseriesSchema
} from '../../shared/satellite-contract.schemas';

export type DashboardMetricKey = 'ndvi' | 'ndwi' | 'ndre' | 'evi' | 'lai';
export type DashboardMetricStatus = 'Normal' | 'Low' | 'High';
export type DashboardMetricColor = 'good' | 'warning' | 'error';
export type BackendInsightStatus = 'fresh' | 'stale' | 'updating';
export type BackendInsightSource = 'real' | 'simulated';
export type BackendDataQuality = 'good' | 'degraded' | 'no_data';
export type DashboardTrendDirection = 'improving' | 'declining' | 'stable' | 'insufficient_data';

export interface DashboardMetricHistory {
  hours: Array<number | null>;
  days: Array<number | null>;
  weeks: Array<number | null>;
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
  status: string;
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
  riskScore: number | null;
  riskLevel: 'Low' | 'Moderate' | 'High';
  sensorAnalysis: DashboardAnalysisItem[];
  actions: DashboardActionItem[];
  riskExplanations: string[];
}

export interface DashboardTimeseriesPoint {
  date: string;
  observedOn: string | null;
  ndvi: number | null;
  ndwi: number | null;
  ndre: number | null;
  evi: number | null;
  lai: number | null;
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
  ndre: DashboardTrendSignal;
  evi: DashboardTrendSignal;
  lai: DashboardTrendSignal;
  anomalyMessage: string | null;
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
  lastSatelliteUpdate: string | null;
  mapTileType: 'ndvi' | null;
  limitations: string[];
  acquisitionMetadata: {
    imageCount: number;
    actualDates: string[];
  };
  metrics: Record<DashboardMetricKey, DashboardMetric>;
  advisor: DashboardAdvisorData;
  nutrient: DashboardNutrientData;
  yieldImpact: DashboardYieldImpact;
  alternativeCrops: DashboardAlternativeCrop[];
  decision: DashboardDecisionData;
  insights: Array<{ metric: DashboardMetricKey; status: string; value: number | null }>;
  timeseries: DashboardTimeseriesPoint[];
  trends: DashboardTrendSummary;
}

interface MetricPresentation {
  title: string;
  analysisLabel: string;
  unit: string;
  display: (value: number) => number;
}

const METRIC_ORDER: DashboardMetricKey[] = ['ndvi', 'ndwi', 'ndre', 'evi', 'lai'];
const HISTORY_RECENT_LIMIT = 7;
const HISTORY_DAILY_LIMIT = 7;
const HISTORY_WEEKLY_LIMIT = 8;

const METRIC_PRESENTATION: Record<DashboardMetricKey, MetricPresentation> = {
  ndvi: {
    title: 'Vegetation Health',
    analysisLabel: 'Primary Signal - NDVI',
    unit: '',
    display: value => Number(value.toFixed(4))
  },
  ndwi: {
    title: 'Water Stress',
    analysisLabel: 'Secondary Insight - NDWI',
    unit: '',
    display: value => Number(value.toFixed(4))
  },
  ndre: {
    title: 'Nutrient Status',
    analysisLabel: 'Secondary Insight - NDRE',
    unit: '',
    display: value => Number(value.toFixed(4))
  },
  evi: {
    title: 'Canopy Density',
    analysisLabel: 'Secondary Insight - EVI',
    unit: '',
    display: value => Number(value.toFixed(4))
  },
  lai: {
    title: 'Yield Potential',
    analysisLabel: 'Secondary Insight - LAI',
    unit: '',
    display: value => Number(value.toFixed(2))
  }
};

@Injectable({
  providedIn: 'root'
})
export class DashboardApiService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  getBlockInsights(blockId: string): Observable<DashboardInsightsResponse> {
    return forkJoin({
      insights: this.fetchBlockInsights(blockId),
      timeseries: this.fetchBlockTimeseries(blockId)
    }).pipe(
      map(({ insights, timeseries }) => this.mapToDashboardInsights(insights, timeseries))
    );
  }

  private fetchBlockInsights(blockId: string): Observable<BlockInsightsContract> {
    return this.http.get<unknown>(`${this.baseUrl}/api/blocks/${blockId}/insights`).pipe(
      map(payload => blockInsightsSchema.parse(payload)),
      catchError(primaryError =>
        this.http.get<unknown>(`${this.baseUrl}/api/block/${blockId}/insights`).pipe(
          map(payload => blockInsightsSchema.parse(payload)),
          catchError(legacyError => {
            console.warn('Satellite insights API unavailable. Showing explicit empty state.', { primaryError, legacyError });
            return of(this.buildUnavailableResponse(blockId, legacyError));
          })
        )
      )
    );
  }

  private fetchBlockTimeseries(blockId: string): Observable<DashboardTimeseriesPoint[]> {
    return this.http.get<unknown>(`${this.baseUrl}/api/block/${blockId}/timeseries`).pipe(
      map(payload => timeseriesSchema.parse(payload)
        .map(point => this.mapTimeseriesPoint(point))
        .sort((left, right) => {
          const observationOrder = this.getObservationDateValue(left).localeCompare(this.getObservationDateValue(right));
          return observationOrder !== 0 ? observationOrder : left.date.localeCompare(right.date);
        })),
      catchError(error => {
        console.warn('Satellite time-series API unavailable. Continuing without historical trends.', error);
        return of([]);
      })
    );
  }

  private mapToDashboardInsights(
    response: BlockInsightsContract,
    timeseries: DashboardTimeseriesPoint[]
  ): DashboardInsightsResponse {
    const metrics = this.buildMetrics(response, timeseries);
    const trends = this.buildTrendSummary(timeseries);
    const limitations = [...response.limitations];
    const warning = response.error || response.alerts[0]?.message || limitations[0] || null;
    const ndreInterpretation = response.interpretations.ndre.status;

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
      lastSatelliteUpdate: response.last_satellite_update,
      mapTileType: response.map_tile_type,
      limitations,
      acquisitionMetadata: {
        imageCount: response.acquisition_metadata.image_count,
        actualDates: [...response.acquisition_metadata.actual_dates]
      },
      metrics,
      advisor: {
        riskScore: null,
        riskLevel: 'Low',
        sensorAnalysis: METRIC_ORDER.map(key => this.buildAnalysisItem(metrics[key], key === 'ndvi')),
        actions: this.buildActionItems(response),
        riskExplanations: response.alerts.length
          ? response.alerts.map(alert => `${alert.message} Threshold: ${alert.threshold}.`)
          : limitations.length
            ? limitations
          : [`Primary NDVI interpretation: ${response.interpretations.ndvi.status}.`]
      },
      nutrient: {
        status: ndreInterpretation,
        reason: `NDRE interpretation: ${ndreInterpretation}.`,
        score: 0,
        details: [
          `NDRE value: ${response.ndre ?? 'N/A'}.`,
          `Backend interpretation: ${ndreInterpretation}.`
        ]
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
          yieldLossDetails: 'Strict Sentinel-2 mode does not infer financial decisions from satellite data alone.'
        },
        switch: {
          crop: 'Unavailable',
          area: 0,
          profitPerHa: 0,
          totalProfit: 0,
          allocationMatch: 0,
          validated: false,
          validationText: 'Strict Sentinel-2 mode does not generate crop switching advice.'
        },
        keep: {
          crop: 'Current Block',
          area: 0,
          profitPerHa: 0,
          totalProfit: 0
        }
      },
      insights: METRIC_ORDER.map(metric => ({
        metric,
        status: response.interpretations[metric].status,
        value: response.interpretations[metric].value
      })),
      timeseries,
      trends
    };
  }

  private buildMetrics(
    response: BlockInsightsContract,
    timeseries: DashboardTimeseriesPoint[]
  ): Record<DashboardMetricKey, DashboardMetric> {
    return METRIC_ORDER.reduce((accumulator, key) => {
      const interpretation = response.interpretations[key];
      const rawValue = response[key];
      const presentation = METRIC_PRESENTATION[key];
      const tone = this.getMetricTone(key, interpretation.status);

      accumulator[key] = {
        key,
        title: presentation.title,
        raw: rawValue,
        label: interpretation.status,
        value: rawValue === null ? '--' : presentation.display(rawValue),
        unit: presentation.unit,
        status: tone.status,
        message: `${key.toUpperCase()}: ${interpretation.status}.`,
        colorClass: tone.colorClass,
        history: this.buildMetricHistory(key, timeseries)
      };
      return accumulator;
    }, {} as Record<DashboardMetricKey, DashboardMetric>);
  }

  private buildMetricHistory(key: DashboardMetricKey, points: DashboardTimeseriesPoint[]): DashboardMetricHistory {
    const recentPoints = points
      .map(point => ({
        timestamp: point.date,
        observedDate: this.getObservationDateValue(point),
        value: point[key]
      }))
      .filter((point): point is { timestamp: string; observedDate: string; value: number } => typeof point.value === 'number');

    const recent = this.buildRecentHourlyHistory(recentPoints);
    const daily = this.buildDailyHistory(recentPoints);
    const calendarPoints = [...recentPoints].sort((left, right) => left.observedDate.localeCompare(right.observedDate));
    const weekly = this.buildWeeklyHistory(calendarPoints.map(point => ({ date: point.observedDate, value: point.value })));

    return {
      hours: recent.values,
      days: daily.values,
      weeks: weekly.values.slice(-HISTORY_WEEKLY_LIMIT),
      labelsHours: recent.labels,
      labelsDays: daily.labels,
      labelsWeeks: weekly.labels.slice(-HISTORY_WEEKLY_LIMIT)
    };
  }

  private buildAnalysisItem(metric: DashboardMetric, isPrimary: boolean): DashboardAnalysisItem {
    return {
      label: isPrimary ? 'Primary Signal - NDVI' : METRIC_PRESENTATION[metric.key].analysisLabel,
      value: `${metric.value}${metric.unit}`.trim(),
      status: metric.colorClass === 'good' ? 'GOOD' : metric.colorClass === 'warning' ? 'WARNING' : 'CRITICAL',
      message: isPrimary
        ? `${metric.title}: ${metric.label}.`
        : `${metric.title}: ${metric.label}.`,
      colorClass: metric.colorClass
    };
  }

  private buildActionItems(response: BlockInsightsContract): DashboardActionItem[] {
    if (response.alerts.length) {
      return response.alerts.map((alert, index) => ({
        priority: index + 1,
        label: `${alert.metric.toUpperCase()} ALERT`,
        items: [alert.message, `Threshold: ${alert.threshold}`],
        severity: this.mapAlertSeverity(alert.severity)
      }));
    }

    if (response.limitations.length) {
      return response.limitations.map((limitation, index) => ({
        priority: index + 1,
        label: index === 0 ? 'SCIENTIFIC LIMITATION' : 'ADDITIONAL LIMITATION',
        items: [limitation],
        severity: limitation.includes('accuracy') || limitation.includes('reliability') ? 'medium' : 'low'
      }));
    }

    return [
      {
        priority: 1,
        label: 'PRIMARY INTERPRETATION',
        items: [`NDVI is the primary dashboard signal: ${response.interpretations.ndvi.status}.`],
        severity: 'low'
      }
    ];
  }

  private mapAlertSeverity(severity: 'info' | 'warning' | 'critical'): DashboardActionItem['severity'] {
    if (severity === 'critical') {
      return 'critical';
    }
    if (severity === 'warning') {
      return 'high';
    }
    return 'low';
  }

  private buildTrendSummary(timeseries: DashboardTimeseriesPoint[]): DashboardTrendSummary {
    const signals = {
      ndvi: this.buildTrendSignal('NDVI', timeseries.map(point => ({ date: this.getObservationDateValue(point), value: point.ndvi }))),
      ndwi: this.buildTrendSignal('NDWI', timeseries.map(point => ({ date: this.getObservationDateValue(point), value: point.ndwi }))),
      ndre: this.buildTrendSignal('NDRE', timeseries.map(point => ({ date: this.getObservationDateValue(point), value: point.ndre }))),
      evi: this.buildTrendSignal('EVI', timeseries.map(point => ({ date: this.getObservationDateValue(point), value: point.evi }))),
      lai: this.buildTrendSignal('LAI', timeseries.map(point => ({ date: this.getObservationDateValue(point), value: point.lai })))
    };

    const anomalySignals = Object.values(signals).filter(signal => signal.anomaly);

    return {
      hasData: timeseries.some(point => METRIC_ORDER.some(metric => point[metric] !== null)),
      latestDate: timeseries.length ? this.getObservationDateValue(timeseries[timeseries.length - 1]) : null,
      ...signals,
      anomalyMessage: anomalySignals.length ? 'Recent satellite history shows an unusual shift in one or more indices.' : null
    };
  }

  private buildTrendSignal(
    metricLabel: string,
    values: Array<{ date: string; value: number | null }>
  ): DashboardTrendSignal {
    const numericValues = values.filter((value): value is { date: string; value: number } => typeof value.value === 'number');
    if (numericValues.length < 2) {
      return {
        direction: 'insufficient_data',
        delta: null,
        message: `${metricLabel} is collecting history.`,
        anomaly: false
      };
    }

    const first = numericValues[0].value;
    const last = numericValues[numericValues.length - 1].value;
    const delta = Number((last - first).toFixed(4));
    const direction: DashboardTrendDirection = delta > 0 ? 'improving' : delta < 0 ? 'declining' : 'stable';

    return {
      direction,
      delta,
      anomaly: false,
      message: `${metricLabel} is ${direction === 'stable' ? 'stable' : direction}.`
    };
  }

  private buildWeeklyHistory(points: Array<{ date: string; value: number }>): { labels: string[]; values: number[] } {
    const weeklyMap = new Map<string, { label: string; total: number; count: number }>();

    points.forEach(point => {
      const key = this.getWeekKey(point.date);
      const existing = weeklyMap.get(key);
      if (existing) {
        existing.total += point.value;
        existing.count += 1;
        return;
      }

      weeklyMap.set(key, {
        label: this.formatWeekLabel(key),
        total: point.value,
        count: 1
      });
    });

    const sortedEntries = Array.from(weeklyMap.entries()).sort(([left], [right]) => left.localeCompare(right));
    return {
      labels: sortedEntries.map(([, value]) => value.label),
      values: sortedEntries.map(([, value]) => Number((value.total / value.count).toFixed(4)))
    };
  }

  private buildRecentHourlyHistory(
    points: Array<{ timestamp: string; observedDate: string; value: number }>
  ): { labels: string[]; values: Array<number | null> } {
    if (!points.length) {
      return { labels: [], values: [] };
    }

    const sorted = [...points].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    const latestSeven = sorted.slice(-HISTORY_RECENT_LIMIT);
    const sameDayCounts = latestSeven.reduce((accumulator, point) => {
      accumulator.set(point.observedDate, (accumulator.get(point.observedDate) || 0) + 1);
      return accumulator;
    }, new Map<string, number>());

    return {
      labels: latestSeven.map((point, index) => this.formatRecentObservationLabel(
        point.observedDate,
        point.timestamp,
        (sameDayCounts.get(point.observedDate) || 0) > 1,
        index === latestSeven.length - 1
      )),
      values: latestSeven.map(point => point.value)
    };
  }

  private buildDailyHistory(
    points: Array<{ timestamp: string; observedDate: string; value: number }>
  ): { labels: string[]; values: Array<number | null> } {
    if (!points.length) {
      return { labels: [], values: [] };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const defaultStartDate = new Date(today);
    defaultStartDate.setDate(defaultStartDate.getDate() - (HISTORY_DAILY_LIMIT - 1));
    const startKey = this.toDateKey(defaultStartDate);
    const todayKey = this.toDateKey(today);

    const dailyAverages = Array.from(
      [...points]
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
        .reduce((accumulator, point) => {
          const existing = accumulator.get(point.observedDate);
          if (existing) {
            existing.total += point.value;
            existing.count += 1;
            return accumulator;
          }

          accumulator.set(point.observedDate, {
            total: point.value,
            count: 1
          });
          return accumulator;
        }, new Map<string, { total: number; count: number }>())
        .entries()
    )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, aggregate]) => ({
        date,
        average: Number((aggregate.total / aggregate.count).toFixed(4))
      }));

    const labels: string[] = [];
    const values: Array<number | null> = [];
    let pointIndex = 0;
    let lastKnownValue: number | null = null;

    while (pointIndex < dailyAverages.length && dailyAverages[pointIndex].date < startKey) {
      lastKnownValue = dailyAverages[pointIndex].average;
      pointIndex += 1;
    }

    for (const bucket = new Date(defaultStartDate); bucket <= today; bucket.setDate(bucket.getDate() + 1)) {
      const key = this.toDateKey(bucket);

      while (pointIndex < dailyAverages.length && dailyAverages[pointIndex].date <= key) {
        lastKnownValue = dailyAverages[pointIndex].average;
        pointIndex += 1;
      }

      labels.push(key === todayKey ? 'Today' : this.formatChartDate(key));
      values.push(lastKnownValue);
    }

    return { labels, values };
  }

  private buildUnavailableResponse(blockId: string, error: unknown): BlockInsightsContract {
    const message = this.extractErrorMessage(error);

    return blockInsightsSchema.parse({
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
      last_satellite_update: null,
      map_tile_url: null,
      map_tile_type: null,
      acquisition_metadata: { image_count: 0, actual_dates: [] },
      interpretations: {
        ndvi: { value: null, status: 'No data' },
        ndwi: { value: null, status: 'No data' },
        ndre: { value: null, status: 'No data' },
        evi: { value: null, status: 'No data' },
        lai: { value: null, status: 'No data' }
      },
      limitations: []
    });
  }

  private mapTimeseriesPoint(point: SatelliteTimeseriesContract): DashboardTimeseriesPoint {
    return {
      date: point.date,
      observedOn: point.observed_on,
      ndvi: point.ndvi,
      ndwi: point.ndwi,
      ndre: point.ndre,
      evi: point.evi,
      lai: point.lai
    };
  }

  private getMetricTone(
    key: DashboardMetricKey,
    status: string
  ): { colorClass: DashboardMetricColor; status: DashboardMetricStatus } {
    const goodStatuses: Record<DashboardMetricKey, string[]> = {
      ndvi: ['Dense healthy canopy', 'Moderate health'],
      ndwi: ['Well-watered'],
      ndre: ['High chlorophyll', 'Moderate'],
      evi: ['Healthy'],
      lai: ['High yield', 'Good yield']
    };
    const warningStatuses: Record<DashboardMetricKey, string[]> = {
      ndvi: ['Stress detected', 'Significant stress'],
      ndwi: ['Mild stress', 'Moderate stress'],
      ndre: ['Low'],
      evi: ['Sparse canopy', 'Moderate', 'Dense canopy'],
      lai: ['Low yield']
    };

    if (goodStatuses[key].includes(status)) {
      return { colorClass: 'good', status: 'Normal' };
    }
    if (warningStatuses[key].includes(status)) {
      return { colorClass: 'warning', status: 'Low' };
    }
    return { colorClass: 'error', status: status === 'No data' ? 'Low' : 'High' };
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

  private formatChartDate(dateValue: string): string {
    const parsed = this.parseDateValue(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return dateValue;
    }

    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private formatRecentChartDate(dateValue: string): string {
    const parsed = this.parseDateValue(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return dateValue;
    }

    return parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      hour12: true
    });
  }

  private formatRecentHourLabel(dateValue: string): string {
    const parsed = this.parseDateValue(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return dateValue;
    }

    return parsed.toLocaleTimeString('en-US', {
      hour: 'numeric',
      hour12: true
    });
  }

  private formatRecentObservationLabel(
    observedDateValue: string,
    timestampValue: string,
    includeTime: boolean,
    isLatest: boolean
  ): string {
    const observedDate = this.parseDateValue(observedDateValue);
    if (Number.isNaN(observedDate.getTime())) {
      return isLatest ? 'Latest' : observedDateValue;
    }

    const dateLabel = observedDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    if (!includeTime) {
      return isLatest ? `${dateLabel}` : dateLabel;
    }

    const timeLabel = this.formatRecentHourLabel(timestampValue);
    return isLatest ? `${dateLabel}, ${timeLabel}` : `${dateLabel}, ${timeLabel}`;
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

  private getObservationDateValue(point: DashboardTimeseriesPoint): string {
    return point.observedOn || point.date;
  }

  private toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDateValue(value: string): Date {
    return new Date(value.includes('T') ? value : `${value}T00:00:00`);
  }
}
