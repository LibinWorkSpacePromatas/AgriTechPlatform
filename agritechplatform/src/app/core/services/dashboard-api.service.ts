import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export type DashboardMetricKey = 'ndvi' | 'ndwi' | 'ndre' | 'evi' | 'lai';

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
  raw: number;
  label: string;
  value: number;
  unit: string;
  status: 'Normal' | 'Low' | 'High';
  message: string;
  colorClass: 'good' | 'warning' | 'error';
  history: DashboardMetricHistory;
}

export interface DashboardAnalysisItem {
  label: string;
  value: string;
  status: 'GOOD' | 'WARNING' | 'CRITICAL';
  message: string;
  colorClass: 'good' | 'warning' | 'error';
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

export interface BlockInsightsResponse {
  blockId: string;
  lanslu: string;
  crop: string;
  areaHa: number;
  source: 'api' | 'fallback';
  warning: string | null;
  composite_date_to: string;
  metrics: Record<DashboardMetricKey, DashboardMetric>;
  advisor: DashboardAdvisorData;
  nutrient: DashboardNutrientData;
  yieldImpact: DashboardYieldImpact;
  alternativeCrops: DashboardAlternativeCrop[];
  decision: DashboardDecisionData;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardApiService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');
  private readonly hourLabels = Array.from({ length: 24 }, (_, index) => index === 23 ? 'Now' : `-${23 - index}h`);
  private readonly dayLabels = ['-6d', '-5d', '-4d', '-3d', '-2d', 'Yesterday', 'Today'];
  private readonly weekLabels = ['-3 Weeks', '-2 Weeks', 'Last Week', 'This Week'];

  constructor(private http: HttpClient) { }

  getBlockInsights(blockId: string): Observable<BlockInsightsResponse> {
    return this.http.get<unknown>(`${this.baseUrl}/block/${blockId}/insights`).pipe(
      map(payload => this.normalizeResponse(payload)),
      catchError(futureEndpointError =>
        this.http.get<unknown>(`${this.baseUrl}/blocks/${blockId}`).pipe(
          map(payload => this.normalizeResponse(payload)),
          catchError(legacyEndpointError => {
            console.warn('Dashboard insights API unavailable. Using fallback dashboard insights.', {
              futureEndpointError,
              legacyEndpointError
            });
            return of(this.buildFallbackInsights(blockId));
          })
        )
      )
    );
  }

  private normalizeResponse(payload: unknown): BlockInsightsResponse {
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
      throw new Error('Dashboard insights payload was not an object.');
    }

    const candidate = payload as Partial<BlockInsightsResponse>;
    if (!candidate.metrics || !candidate.advisor || !candidate.nutrient || !candidate.yieldImpact || !candidate.decision) {
      throw new Error('Dashboard insights payload was missing required sections.');
    }

    return {
      ...candidate,
      source: candidate.source === 'fallback' ? 'fallback' : 'api',
      warning: candidate.warning ?? null
    } as BlockInsightsResponse;
  }

  private buildFallbackInsights(blockId: string): BlockInsightsResponse {
    const ndvi = this.buildMetric(blockId, 'ndvi', 'Crop Health', 62, '%', 'Healthy', 'Normal', 'good', 'Fallback crop health estimate is stable.');
    const ndwi = this.buildMetric(blockId, 'ndwi', 'Water Status', 36, '%', 'Adequate', 'Normal', 'good', 'Fallback water balance remains in range.');
    const ndre = this.buildMetric(blockId, 'ndre', 'Nutrient Status', 55, '%', 'Moderate', 'Low', 'warning', 'Fallback nutrient signal needs monitoring.');
    const evi = this.buildMetric(blockId, 'evi', 'Canopy Density', 58, '%', 'Building', 'Low', 'warning', 'Fallback canopy density is still building.');
    const lai = this.buildMetric(blockId, 'lai', 'Yield Estimate', 3.7, ' LAI', 'Steady', 'Normal', 'good', 'Fallback leaf area supports a stable yield outlook.');
    const riskScore = 28;

    return {
      blockId,
      lanslu: blockId,
      crop: 'Current Block',
      areaHa: 0,
      source: 'fallback',
      warning: 'Live backend insights are temporarily unavailable. Showing fallback dashboard data.',
      composite_date_to: new Date().toISOString(),
      metrics: { ndvi, ndwi, ndre, evi, lai },
      advisor: {
        riskScore,
        riskLevel: 'Moderate',
        sensorAnalysis: [
          this.buildAnalysisItem('CROP HEALTH', ndvi),
          this.buildAnalysisItem('WATER STATUS', ndwi),
          this.buildAnalysisItem('NUTRIENT STATUS', ndre),
          this.buildAnalysisItem('CANOPY DENSITY', evi),
          this.buildAnalysisItem('YIELD ESTIMATE', lai)
        ],
        actions: [
          {
            priority: 1,
            label: 'IMMEDIATE ACTION',
            items: [
              'Validate the latest block condition with a field walk before making changes.',
              'Confirm irrigation and fertigation records against the last healthy composite.',
              'Retry the backend insights service once connectivity is restored.'
            ],
            severity: 'high',
            estimatedCost: '$0',
            estimatedTime: '1 hour'
          }
        ],
        riskExplanations: [
          'Fallback mode is active, so risk is based on the last known stable dashboard profile.',
          'Reconnect the backend insights endpoint to restore live block intelligence.'
        ]
      },
      nutrient: {
        status: 'Medium',
        reason: 'Fallback nutrient signal is serviceable but should be confirmed from live insights.',
        score: 59,
        details: [
          'Fallback NDRE suggests moderate chlorophyll activity.',
          'Fallback NDWI suggests nutrients can still move through the profile.',
          'Backend reconnection is required for fresh satellite-backed validation.'
        ]
      },
      yieldImpact: {
        currentYieldPercent: 81,
        projectedLoss: 18000,
        baseProfit: 94000,
        factors: [
          { name: 'Fallback Nutrient Constraint', impact: 11, severity: 'medium' },
          { name: 'Fallback Canopy Variability', impact: 8, severity: 'medium' }
        ]
      },
      alternativeCrops: [
        {
          cropName: 'Olives',
          suitabilityScore: 83,
          profitPerHa: 76000,
          waterRequirement: 5.5,
          reasons: ['Lower water requirement', 'Strong fallback profitability', 'Well suited during water pressure'],
          compatible: true,
          moistureCompatible: true,
          compatibilityNote: 'Compatible with fallback conditions'
        },
        {
          cropName: 'Riesling',
          suitabilityScore: 72,
          profitPerHa: 15000,
          waterRequirement: 6.3,
          reasons: ['Moderate water demand', 'Good fit for stable canopy goals'],
          compatible: true,
          moistureCompatible: true,
          compatibilityNote: 'Compatible with fallback conditions'
        }
      ],
      decision: {
        totalArea: 0,
        current: {
          crop: 'Current Block',
          lossPerHa: -2200,
          totalLoss: -18000,
          yieldLossDetails: 'Fallback yield estimate shows moderate pressure until live insights return'
        },
        switch: {
          crop: 'Olives',
          area: 0,
          profitPerHa: 76000,
          totalProfit: 0,
          allocationMatch: 83,
          validated: true,
          validationText: 'Fallback NDRE remains supportive of the switch scenario'
        },
        keep: {
          crop: 'Current Block',
          area: 0,
          profitPerHa: 14000,
          totalProfit: 0
        }
      }
    };
  }

  private buildMetric(
    blockId: string,
    key: DashboardMetricKey,
    title: string,
    value: number,
    unit: string,
    label: string,
    status: 'Normal' | 'Low' | 'High',
    colorClass: 'good' | 'warning' | 'error',
    message: string
  ): DashboardMetric {
    return {
      key,
      title,
      raw: unit === '%' ? Number((value / 100).toFixed(3)) : value,
      label,
      value,
      unit,
      status,
      message,
      colorClass,
      history: {
        hours: this.buildHistory(blockId, `${key}-hours`, value, 24, unit === '%' ? 6 : 0.3, 1),
        days: this.buildHistory(blockId, `${key}-days`, value, 7, unit === '%' ? 9 : 0.5, 1),
        weeks: this.buildHistory(blockId, `${key}-weeks`, value, 4, unit === '%' ? 11 : 0.7, 1),
        labelsHours: [...this.hourLabels],
        labelsDays: [...this.dayLabels],
        labelsWeeks: [...this.weekLabels]
      }
    };
  }

  private buildAnalysisItem(label: string, metric: DashboardMetric): DashboardAnalysisItem {
    return {
      label,
      value: `${metric.value}${metric.unit}`,
      status: metric.colorClass === 'good' ? 'GOOD' : metric.colorClass === 'warning' ? 'WARNING' : 'CRITICAL',
      message: metric.message,
      colorClass: metric.colorClass
    };
  }

  private buildHistory(blockId: string, salt: string, center: number, points: number, amplitude: number, decimals: number): number[] {
    return Array.from({ length: points }, (_, index) => {
      const wave = Math.sin((Math.PI * 2 * index) / Math.max(points - 1, 1)) * amplitude * 0.7;
      const drift = ((index / Math.max(points - 1, 1)) - 0.5) * amplitude * 0.2;
      const noise = this.noise(blockId, `${salt}-${index}`) * amplitude * 0.25;
      return Number((center + wave + drift + noise).toFixed(decimals));
    });
  }

  private noise(blockId: string, salt: string): number {
    const input = `${blockId}:${salt}`;
    let hash = 0;
    for (let index = 0; index < input.length; index++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(index);
      hash |= 0;
    }
    return (Math.abs(hash) % 2000) / 1000 - 1;
  }
}
