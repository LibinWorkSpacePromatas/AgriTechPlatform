import { Injectable } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { SoilData } from '../../model/soil.model';
import {
  BackendDataQuality,
  BackendInsightStatus,
  DashboardApiService,
  DashboardInsightsResponse
} from '../../core/services/dashboard-api.service';
import { SensorService } from '../../core/services/sensor.service';
import { SoilService } from '../soil/soil.service';
import { WeatherData, WeatherService } from '../weather-service/weather.service';

export type MoistureSource = 'satellite' | 'legacy-fallback';
export type NdwiMoistureBand = 'high' | 'moderate' | 'dry' | 'unknown';
export type IrrigationRecommendationLevel = 'low' | 'moderate' | 'high';

export interface SoilDepthReading {
  depth: number;
  moisture: number;
  status: 'optimal' | 'low' | 'high';
}

export interface IrrigationStatus {
  currentHydration: number;
  irrigationNeeded: number;
  irrigationMessage: string;
  et0Today: number;
  rainToday: number;
  netIrrigation: number;
  weatherAdjustedNeed: number;
  ndwiDrivenNeed: number;
  hybridIrrigationMm: number;
  kcValue: number;
  status: 'urgent' | 'monitor' | 'saturated';
  recommendationLevel: IrrigationRecommendationLevel;
  soilReadings: SoilDepthReading[];
  nextIrrigationTime: Date;
  confidence: number;
  ndwi: number | null;
  ndwiLabel: string;
  ndwiBand: NdwiMoistureBand;
  moistureSource: MoistureSource;
  sourceLabel: string;
  isUsingFallbackMoisture: boolean;
  insightsStatus: BackendInsightStatus;
  insightsDataQuality: BackendDataQuality;
  insightsWarning: string | null;
  compositeDateLabel: string | null;
  soilData?: SoilData;
  soilFactor?: number;
  bomStation?: {
    station_id: number;
    name: string;
    distance_km: number;
    state_code?: string;
  };
}

interface NdwiSignal {
  band: NdwiMoistureBand;
  label: string;
  baseHydration: number;
  ndwiDrivenNeed: number;
  recommendationLevel: IrrigationRecommendationLevel;
}

@Injectable({
  providedIn: 'root'
})
export class WaterIrrigationService {
  private readonly DEPTH_LEVELS = [30, 60, 90];
  private readonly OPTIMAL_RANGES = {
    30: { min: 35, max: 65 },
    60: { min: 30, max: 60 },
    90: { min: 25, max: 55 }
  };

  constructor(
    private weatherService: WeatherService,
    private soilService: SoilService,
    private sensorService: SensorService,
    private dashboardApiService: DashboardApiService
  ) {}

  private getCropSpecificKc(cropName: string): number {
    const cropKcMap: { [key: string]: number } = {
      'Shiraz': 0.85,
      'Cabernet Sauvignon': 0.88,
      'Grenache': 0.80,
      'Merlot': 0.85,
      'Chardonnay': 0.78,
      'Riesling': 0.75,
      'Semillon': 0.80,
      'Pinot Grigio': 0.78
    };

    return cropKcMap[cropName] || 0.85;
  }

  getIrrigationStatus(
    lat?: number,
    lon?: number,
    lanslu: string = 'BCPKFB',
    cropName?: string
  ): Observable<IrrigationStatus> {
    const latitude = lat || -34.53;
    const longitude = lon || 138.96;

    return forkJoin({
      soilLoaded: this.soilService.loadSoilData(),
      insights: this.dashboardApiService.getBlockInsights(lanslu),
      weather: this.weatherService.getWeather(latitude, longitude).pipe(
        map(data => {
          console.log('Weather Service: Data fetched for coordinates:', latitude, longitude);
          return data;
        })
      )
    }).pipe(
      map(({ weather, insights }) => {
        const soil = this.soilService.getSoilByLANSLU(lanslu);
        const fallbackRain = this.calculateDailyRain(weather.rain);
        const status = this.calculateIrrigationStatus(weather, insights, soil, fallbackRain, cropName);

        status.bomStation = {
          station_id: 24048,
          name: 'RENMARK AERO (Mocked)',
          distance_km: 12.4,
          state_code: 'SA'
        };

        return status;
      }),
      catchError(err => {
        console.error('WaterIrrigationService error:', err);
        return of(this.getFallbackStatus());
      })
    );
  }

  private calculateIrrigationStatus(
    weatherData: WeatherData,
    insights: DashboardInsightsResponse,
    soil?: SoilData,
    bomRain?: number | null,
    cropName?: string
  ): IrrigationStatus {
    const todayET0 = this.calculateDailyET0(weatherData.et0);
    const kc = this.getCropSpecificKc(cropName || 'Shiraz');
    const todayETc = todayET0 * kc;
    const openMeteoRain = this.calculateDailyRain(weatherData.rain);

    let rainToUse = openMeteoRain;
    if (bomRain !== null && bomRain !== undefined && bomRain > 0) {
      rainToUse = bomRain;
    }

    const effectiveRain = rainToUse * 0.8;
    const deficit = Math.max(0, todayETc - effectiveRain);

    let soilFactor = 1.0;
    if (soil) {
      soilFactor = this.soilService.calculateSoilFactor(soil);
    }

    const weatherAdjustedNeed = Number((deficit / soilFactor).toFixed(2));
    const ndwi = insights.metrics.ndwi.raw;
    const shouldUseSatellite = ndwi !== null;
    const ndwiSignal = shouldUseSatellite ? this.interpretNdwi(ndwi) : this.getFallbackNdwiSignal();
    const legacyHydration = this.sensorService.getSoilMoisture();
    const et0Penalty = this.calculateEt0Penalty(todayET0, soilFactor);
    const rainRecharge = Math.min(10, effectiveRain * 0.9);
    const currentHydration = shouldUseSatellite
      ? this.clamp(Math.round(ndwiSignal.baseHydration - et0Penalty + rainRecharge), 5, 95)
      : legacyHydration;
    const ndwiDrivenNeed = shouldUseSatellite ? ndwiSignal.ndwiDrivenNeed : weatherAdjustedNeed;
    const hybridIrrigationMm = shouldUseSatellite
      ? Number((ndwiDrivenNeed * 0.7 + weatherAdjustedNeed * 0.3).toFixed(2))
      : weatherAdjustedNeed;
    const irrigationNeeded = Number((hybridIrrigationMm * 0.01).toFixed(3));
    const recommendationLevel = shouldUseSatellite
      ? this.combineRecommendationLevel(ndwiSignal.recommendationLevel, weatherAdjustedNeed)
      : this.mapLegacyHydrationToRecommendation(currentHydration);
    const soilReadings = this.generateSoilReadings(currentHydration, soilFactor, recommendationLevel);
    const status = this.mapRecommendationToStatus(recommendationLevel);
    const irrigationMessage = this.generateIrrigationMessage(
      recommendationLevel,
      shouldUseSatellite ? ndwiSignal.label : 'Legacy moisture baseline',
      todayET0,
      insights
    );
    const nextIrrigationTime = this.calculateNextIrrigationTime(status);
    const confidence = this.calculateConfidence(weatherData, shouldUseSatellite, insights);

    return {
      currentHydration,
      irrigationNeeded,
      irrigationMessage,
      et0Today: todayET0,
      rainToday: rainToUse,
      netIrrigation: Number(deficit.toFixed(2)),
      weatherAdjustedNeed,
      ndwiDrivenNeed: Number(ndwiDrivenNeed.toFixed(2)),
      hybridIrrigationMm,
      kcValue: kc,
      status,
      recommendationLevel,
      soilReadings,
      nextIrrigationTime,
      confidence,
      ndwi,
      ndwiLabel: shouldUseSatellite ? ndwiSignal.label : 'Fallback moisture model',
      ndwiBand: shouldUseSatellite ? ndwiSignal.band : 'unknown',
      moistureSource: shouldUseSatellite ? 'satellite' : 'legacy-fallback',
      sourceLabel: shouldUseSatellite ? 'Satellite NDWI + ET0 hybrid' : 'Legacy weather + sensor fallback',
      isUsingFallbackMoisture: !shouldUseSatellite,
      insightsStatus: insights.status,
      insightsDataQuality: insights.dataQuality,
      insightsWarning: shouldUseSatellite
        ? insights.warning
        : 'Satellite NDWI unavailable. Using legacy irrigation logic until insights recover.',
      compositeDateLabel: insights.compositeDateTo,
      soilData: soil,
      soilFactor
    };
  }

  private calculateDailyET0(et0Array: Float32Array): number {
    const hoursToConsider = Math.min(24, et0Array.length);
    let sum = 0;
    for (let i = 0; i < hoursToConsider; i++) {
      sum += et0Array[i] || 0;
    }
    return sum;
  }

  private calculateDailyRain(rainArray: Float32Array): number {
    const hoursToConsider = Math.min(24, rainArray.length);
    let sum = 0;
    for (let i = 0; i < hoursToConsider; i++) {
      sum += rainArray[i] || 0;
    }
    return sum;
  }

  private interpretNdwi(ndwi: number): NdwiSignal {
    if (ndwi < 0) {
      const severity = this.clamp(Math.abs(ndwi) / 0.3, 0, 1);
      return {
        band: 'dry',
        label: 'Dry',
        baseHydration: 40 - severity * 25,
        ndwiDrivenNeed: 6 + severity * 3,
        recommendationLevel: 'high'
      };
    }

    if (ndwi <= 0.2) {
      const ratio = this.clamp(ndwi / 0.2, 0, 1);
      return {
        band: 'moderate',
        label: 'Moderate moisture',
        baseHydration: 45 + ratio * 25,
        ndwiDrivenNeed: 4.5 - ratio * 2.5,
        recommendationLevel: 'moderate'
      };
    }

    const ratio = this.clamp((ndwi - 0.2) / 0.3, 0, 1);
    return {
      band: 'high',
      label: 'High moisture',
      baseHydration: 72 + ratio * 18,
      ndwiDrivenNeed: 1.8 - ratio,
      recommendationLevel: 'low'
    };
  }

  private getFallbackNdwiSignal(): NdwiSignal {
    const hydration = this.sensorService.getSoilMoisture();
    return {
      band: 'unknown',
      label: 'Fallback moisture model',
      baseHydration: hydration,
      ndwiDrivenNeed: 0,
      recommendationLevel: this.mapLegacyHydrationToRecommendation(hydration)
    };
  }

  private calculateEt0Penalty(todayET0: number, soilFactor: number): number {
    const soilAdjustedEt0 = todayET0 / Math.max(soilFactor, 0.7);
    return this.clamp(Number((soilAdjustedEt0 * 1.4).toFixed(1)), 0, 14);
  }

  private combineRecommendationLevel(
    ndwiLevel: IrrigationRecommendationLevel,
    weatherAdjustedNeed: number
  ): IrrigationRecommendationLevel {
    const ndwiScore = ndwiLevel === 'high' ? 1 : ndwiLevel === 'moderate' ? 0.55 : 0.15;
    const et0Score = this.clamp(weatherAdjustedNeed / 8, 0, 1);
    const hybridScore = ndwiScore * 0.7 + et0Score * 0.3;

    if (hybridScore >= 0.67) {
      return 'high';
    }
    if (hybridScore >= 0.34) {
      return 'moderate';
    }
    return 'low';
  }

  private mapLegacyHydrationToRecommendation(hydration: number): IrrigationRecommendationLevel {
    if (hydration < 20) {
      return 'high';
    }
    if (hydration > 80) {
      return 'low';
    }
    return 'moderate';
  }

  private generateSoilReadings(
    currentHydration: number,
    soilFactor: number,
    recommendationLevel: IrrigationRecommendationLevel
  ): SoilDepthReading[] {
    const surfacePenalty = recommendationLevel === 'high' ? 8 : recommendationLevel === 'moderate' ? 4 : 1;
    const deepRetention = (soilFactor - 1) * 10;

    return this.DEPTH_LEVELS.map(depth => {
      const moisture = depth === 30
        ? currentHydration - surfacePenalty + 4
        : depth === 60
          ? currentHydration
          : currentHydration - 5 + deepRetention;
      const clampedMoisture = Math.round(this.clamp(moisture, 5, 95));
      const optimal = this.OPTIMAL_RANGES[depth as keyof typeof this.OPTIMAL_RANGES];

      let status: 'optimal' | 'low' | 'high';
      if (clampedMoisture < optimal.min) {
        status = 'low';
      } else if (clampedMoisture > optimal.max) {
        status = 'high';
      } else {
        status = 'optimal';
      }

      return {
        depth,
        moisture: clampedMoisture,
        status
      };
    });
  }

  private mapRecommendationToStatus(level: IrrigationRecommendationLevel): 'urgent' | 'monitor' | 'saturated' {
    if (level === 'high') {
      return 'urgent';
    }
    if (level === 'low') {
      return 'saturated';
    }
    return 'monitor';
  }

  private generateIrrigationMessage(
    level: IrrigationRecommendationLevel,
    ndwiLabel: string,
    todayET0: number,
    insights: DashboardInsightsResponse
  ): string {
    const freshnessSuffix = insights.status === 'stale'
      ? ' Satellite data is stale, so confirm against field checks.'
      : insights.status === 'updating'
        ? ' Satellite refresh is still running; fallback behavior is active if NDWI is missing.'
        : '';

    switch (level) {
      case 'high':
        return `${ndwiLabel} conditions with ET0 at ${todayET0.toFixed(1)} mm/day indicate high irrigation need.${freshnessSuffix}`;
      case 'low':
        return `${ndwiLabel} conditions indicate low irrigation demand. Maintain observation rather than immediate watering.${freshnessSuffix}`;
      default:
        return `${ndwiLabel} conditions suggest a moderate irrigation adjustment. Recheck after the next weather cycle.${freshnessSuffix}`;
    }
  }

  private calculateNextIrrigationTime(status: string): Date {
    const now = new Date();

    if (status === 'urgent') {
      const nextMorning = new Date(now);
      nextMorning.setHours(5, 0, 0, 0);
      if (nextMorning <= now) {
        nextMorning.setDate(nextMorning.getDate() + 1);
      }
      return nextMorning;
    }

    if (status === 'monitor') {
      const future = new Date(now);
      future.setHours(future.getHours() + 48);
      return future;
    }

    const future = new Date(now);
    future.setHours(future.getHours() + 72);
    return future;
  }

  private calculateConfidence(
    weatherData: WeatherData,
    usingSatellite: boolean,
    insights: DashboardInsightsResponse
  ): number {
    const hasAllData = weatherData.soilMoisture.length > 0 &&
      weatherData.et0.length > 0 &&
      weatherData.rain.length > 0;

    if (!hasAllData) {
      return 0;
    }

    if (!usingSatellite) {
      return 0.6;
    }

    if (insights.status === 'fresh' && insights.dataQuality === 'good') {
      return weatherData.soilMoisture.length >= 24 ? 0.96 : 0.88;
    }

    if (insights.status === 'stale' || insights.dataQuality === 'degraded') {
      return 0.75;
    }

    return 0.65;
  }

  private getFallbackStatus(): IrrigationStatus {
    return {
      currentHydration: 64.2,
      irrigationNeeded: 0,
      irrigationMessage: 'Using cached data - check connection',
      et0Today: 0,
      rainToday: 0,
      netIrrigation: 0,
      weatherAdjustedNeed: 0,
      ndwiDrivenNeed: 0,
      hybridIrrigationMm: 0,
      kcValue: 0.85,
      status: 'monitor',
      recommendationLevel: 'moderate',
      soilReadings: [
        { depth: 30, moisture: 75, status: 'optimal' },
        { depth: 60, moisture: 58, status: 'optimal' },
        { depth: 90, moisture: 42, status: 'low' }
      ],
      nextIrrigationTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      confidence: 0.5,
      ndwi: null,
      ndwiLabel: 'Fallback moisture model',
      ndwiBand: 'unknown',
      moistureSource: 'legacy-fallback',
      sourceLabel: 'Legacy weather + sensor fallback',
      isUsingFallbackMoisture: true,
      insightsStatus: 'updating',
      insightsDataQuality: 'no_data',
      insightsWarning: 'Satellite NDWI unavailable. Using cached irrigation fallback.',
      compositeDateLabel: null
    };
  }

  refreshData(lat?: number, lon?: number): Observable<IrrigationStatus> {
    this.weatherService.clearCache();
    return this.getIrrigationStatus(lat, lon);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
