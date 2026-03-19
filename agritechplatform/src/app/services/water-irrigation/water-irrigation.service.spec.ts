import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';

import { SoilData } from '../../model/soil.model';
import {
  DashboardApiService,
  DashboardInsightsResponse,
  DashboardMetric
} from '../../core/services/dashboard-api.service';
import { SensorService } from '../../core/services/sensor.service';
import { SoilService } from '../soil/soil.service';
import { WeatherData, WeatherService } from '../weather-service/weather.service';
import { WaterIrrigationService } from './water-irrigation.service';

describe('WaterIrrigationService', () => {
  let service: WaterIrrigationService;
  let weatherService: jasmine.SpyObj<WeatherService>;
  let soilService: jasmine.SpyObj<SoilService>;
  let sensorService: jasmine.SpyObj<SensorService>;
  let dashboardApiService: jasmine.SpyObj<DashboardApiService>;

  const soilData = {
    LANSLU: 'LAN-001',
    Region: 'Riverland',
    Primary_Soil_Classification: 'A4',
    Primary_Soil_Value: 60,
    Secondary_Soil_Classification: 'A5',
    Secondary_Soil_Value: 30,
    Tertiary_Soil_Classification: 'D3',
    Tertiary_Soil_Value: 10
  } as SoilData;

  beforeEach(() => {
    weatherService = jasmine.createSpyObj<WeatherService>('WeatherService', ['getWeather', 'clearCache']);
    soilService = jasmine.createSpyObj<SoilService>('SoilService', ['loadSoilData', 'getSoilByLANSLU', 'calculateSoilFactor']);
    sensorService = jasmine.createSpyObj<SensorService>('SensorService', ['getSoilMoisture']);
    dashboardApiService = jasmine.createSpyObj<DashboardApiService>('DashboardApiService', ['getBlockInsights']);

    TestBed.configureTestingModule({
      providers: [
        WaterIrrigationService,
        { provide: WeatherService, useValue: weatherService },
        { provide: SoilService, useValue: soilService },
        { provide: SensorService, useValue: sensorService },
        { provide: DashboardApiService, useValue: dashboardApiService }
      ]
    });

    service = TestBed.inject(WaterIrrigationService);

    soilService.loadSoilData.and.returnValue(Promise.resolve());
    soilService.getSoilByLANSLU.and.returnValue(soilData);
    soilService.calculateSoilFactor.and.returnValue(1.05);
    sensorService.getSoilMoisture.and.returnValue(32.5);
    weatherService.getWeather.and.returnValue(of(buildWeatherData()));
  });

  it('recommends low irrigation when NDWI is high', async () => {
    dashboardApiService.getBlockInsights.and.returnValue(of(buildInsightsResponse(0.34)));

    const result = await firstValueFrom(service.getIrrigationStatus(-34.1, 140.7, 'LAN-001', 'Shiraz'));

    expect(result.moistureSource).toBe('satellite');
    expect(result.ndwiBand).toBe('high');
    expect(result.recommendationLevel).toBe('low');
    expect(result.status).toBe('saturated');
    expect(result.currentHydration).toBeGreaterThan(60);
    expect(result.irrigationNeeded).toBeLessThan(0.03);
  });

  it('recommends high irrigation when NDWI is low', async () => {
    dashboardApiService.getBlockInsights.and.returnValue(of(buildInsightsResponse(-0.18)));

    const result = await firstValueFrom(service.getIrrigationStatus(-34.1, 140.7, 'LAN-001', 'Shiraz'));

    expect(result.moistureSource).toBe('satellite');
    expect(result.ndwiBand).toBe('dry');
    expect(result.recommendationLevel).toBe('high');
    expect(result.status).toBe('urgent');
    expect(result.currentHydration).toBeLessThan(35);
    expect(result.irrigationNeeded).toBeGreaterThan(0.05);
  });

  it('falls back to legacy hydration logic when NDWI is unavailable', async () => {
    dashboardApiService.getBlockInsights.and.returnValue(of(buildInsightsResponse(null, 'updating', 'Satellite offline')));

    const result = await firstValueFrom(service.getIrrigationStatus(-34.1, 140.7, 'LAN-001', 'Shiraz'));

    expect(result.isUsingFallbackMoisture).toBeTrue();
    expect(result.moistureSource).toBe('legacy-fallback');
    expect(result.currentHydration).toBe(32.5);
    expect(result.recommendationLevel).toBe('moderate');
    expect(result.insightsWarning).toContain('Satellite NDWI unavailable');
  });
});

function buildWeatherData(): WeatherData {
  return {
    time: Array.from({ length: 24 }, (_, index) => new Date(2026, 2, 19, index)),
    temperature: new Float32Array(24).fill(28),
    humidity: new Float32Array(24).fill(45),
    et0: new Float32Array(24).fill(0.2),
    soilTemp: new Float32Array(24).fill(20),
    soilMoisture: new Float32Array(24).fill(0.3),
    rain: new Float32Array(24).fill(0)
  };
}

function buildInsightsResponse(
  ndwi: number | null,
  status: 'fresh' | 'stale' | 'updating' = 'fresh',
  warning: string | null = null
): DashboardInsightsResponse {
  const metric = (key: DashboardMetric['key'], raw: number | null): DashboardMetric => ({
    key,
    title: key.toUpperCase(),
    raw,
    label: raw === null ? 'Unavailable' : 'Normal',
    value: raw === null ? '--' : Math.round(raw * 100),
    unit: '%',
    status: 'Normal',
    message: '',
    colorClass: raw === null ? 'error' : 'good',
    history: {
      hours: raw === null ? [] : [Math.round(raw * 100)],
      days: raw === null ? [] : [Math.round(raw * 100)],
      weeks: raw === null ? [] : [Math.round(raw * 100)],
      labelsHours: raw === null ? [] : ['Latest'],
      labelsDays: raw === null ? [] : ['Latest'],
      labelsWeeks: raw === null ? [] : ['Latest']
    }
  });

  return {
    blockId: 'LAN-001',
    status,
    latencyMs: 120,
    source: 'cache',
    error: warning,
    dataQuality: ndwi === null ? 'no_data' : 'good',
    warning,
    compositeDateFrom: '2026-03-10',
    compositeDateTo: '2026-03-19',
    metrics: {
      ndvi: metric('ndvi', 0.71),
      ndwi: metric('ndwi', ndwi),
      ndre: metric('ndre', 0.52),
      evi: metric('evi', 0.58),
      lai: {
        ...metric('lai', 3.4),
        unit: ' LAI',
        value: 3.4
      }
    },
    advisor: {
      riskScore: 20,
      riskLevel: 'Low',
      sensorAnalysis: [],
      actions: [],
      riskExplanations: []
    },
    nutrient: {
      status: 'High',
      reason: 'Stable',
      score: 88,
      details: []
    },
    yieldImpact: {
      currentYieldPercent: 85,
      projectedLoss: 15,
      baseProfit: 100,
      factors: []
    },
    alternativeCrops: [],
    decision: {
      totalArea: 10,
      current: {
        crop: 'Shiraz',
        lossPerHa: 0,
        totalLoss: 0,
        yieldLossDetails: ''
      },
      switch: {
        crop: 'Olives',
        area: 0,
        profitPerHa: 0,
        totalProfit: 0,
        allocationMatch: 0,
        validated: true,
        validationText: ''
      },
      keep: {
        crop: 'Shiraz',
        area: 10,
        profitPerHa: 0,
        totalProfit: 0
      }
    }
  };
}
