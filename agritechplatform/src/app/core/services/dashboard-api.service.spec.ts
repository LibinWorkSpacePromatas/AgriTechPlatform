import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { DashboardApiService } from './dashboard-api.service';

describe('DashboardApiService', () => {
  let service: DashboardApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });

    service = TestBed.inject(DashboardApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('maps the production satellite insights endpoint into dashboard metrics', () => {
    let result: any;

    service.getBlockInsights('LAN-001').subscribe(response => {
      result = response;
    });

    const insightsRequest = httpMock.expectOne('http://localhost:8000/api/blocks/LAN-001/insights');
    const timeseriesRequest = httpMock.expectOne('http://localhost:8000/api/block/LAN-001/timeseries');

    expect(insightsRequest.request.method).toBe('GET');
    expect(timeseriesRequest.request.method).toBe('GET');

    insightsRequest.flush({
      block_id: 'LAN-001',
      source: 'real',
      freshness_status: 'fresh',
      last_satellite_update: '2026-03-19',
      ndvi: 0.78,
      ndwi: 0.31,
      ndre: 0.57,
      evi: 0.49,
      lai: 4.2,
      status: 'fresh',
      latency_ms: 143,
      error: null,
      data_quality: 'good',
      composite_date_from: '2026-03-06',
      composite_date_to: '2026-03-19',
      pixel_count: 16,
      map_tile_url: null,
      map_tile_type: 'ndvi',
      acquisition_metadata: { image_count: 3, actual_dates: ['2026-03-10', '2026-03-14', '2026-03-19'] },
      interpretations: {
        ndvi: { value: 0.78, status: 'Dense healthy canopy' },
        ndwi: { value: 0.31, status: 'Well-watered' },
        ndre: { value: 0.57, status: 'High chlorophyll' },
        evi: { value: 0.49, status: 'Healthy' },
        lai: { value: 4.2, status: 'Good yield' }
      },
      limitations: []
    });
    timeseriesRequest.flush([
      { date: '2026-03-19T08:00:00Z', observed_on: '2026-03-18', ndvi: 0.78, ndwi: 0.31, ndre: 0.57, evi: 0.49, lai: 4.2 },
      { date: '2026-03-10T08:00:00Z', observed_on: '2026-03-09', ndvi: 0.7, ndwi: 0.24, ndre: 0.48, evi: 0.41, lai: 3.7 },
      { date: '2026-03-14T08:00:00Z', observed_on: '2026-03-13', ndvi: 0.74, ndwi: 0.28, ndre: 0.51, evi: 0.45, lai: 3.9 }
    ]);

    expect(result.blockId).toBe('LAN-001');
    expect(result.status).toBe('fresh');
    expect(result.source).toBe('real');
    expect(result.warning).toBeNull();
    expect(result.metrics.ndvi.title).toBe('Vegetation Health');
    expect(result.metrics.ndvi.label).toBe('Dense healthy canopy');
    expect(result.metrics.ndwi.title).toBe('Water Stress');
    expect(result.metrics.evi.title).toBe('Canopy Density');
    expect(result.metrics.lai.title).toBe('Yield Potential');
    expect(result.metrics.ndvi.history.days).toEqual([0.7, 0.74, 0.78]);
    expect(result.metrics.ndwi.history.days).toEqual([0.24, 0.28, 0.31]);
    expect(result.metrics.ndvi.history.labelsWeeks).toEqual(['Week of Mar 9', 'Week of Mar 16']);
    expect(result.timeseries.length).toBe(3);
    expect(result.timeseries[0].date).toBe('2026-03-10T08:00:00Z');
    expect(result.timeseries[0].observedOn).toBe('2026-03-09');
    expect(result.trends.ndvi.direction).toBe('improving');
    expect(result.advisor.sensorAnalysis[0].label).toBe('Primary Signal - NDVI');
    expect(result.nutrient.status).toBe('High chlorophyll');
    expect(result.lastSatelliteUpdate).toBe('2026-03-19');
  });

  it('returns a graceful placeholder state when both insight endpoints fail', () => {
    let result: any;

    service.getBlockInsights('LAN-404').subscribe(response => {
      result = response;
    });

    const primaryRequest = httpMock.expectOne('http://localhost:8000/api/blocks/LAN-404/insights');
    const timeseriesRequest = httpMock.expectOne('http://localhost:8000/api/block/LAN-404/timeseries');
    primaryRequest.flush({ detail: 'Not found' }, { status: 404, statusText: 'Not Found' });
    timeseriesRequest.flush({ detail: 'Not found' }, { status: 404, statusText: 'Not Found' });

    const legacyRequest = httpMock.expectOne('http://localhost:8000/api/block/LAN-404/insights');
    legacyRequest.flush({ detail: 'Not found' }, { status: 404, statusText: 'Not Found' });

    expect(result.blockId).toBe('LAN-404');
    expect(result.status).toBe('updating');
    expect(result.source).toBe('simulated');
    expect(result.dataQuality).toBe('no_data');
    expect(result.warning).toContain('Not found');
    expect(result.metrics.ndvi.value).toBe('--');
    expect(result.metrics.ndvi.history.hours).toEqual([]);
    expect(result.timeseries).toEqual([]);
  });
});
