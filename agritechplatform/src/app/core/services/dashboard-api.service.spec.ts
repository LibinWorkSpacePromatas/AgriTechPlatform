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
      ndvi: 0.78,
      ndwi: 0.31,
      ndre: 0.57,
      evi: 0.49,
      lai: 4.2,
      status: 'fresh',
      latency_ms: 143,
      source: 'real',
      error: null,
      data_quality: 'good',
      composite_date_from: '2026-03-06',
      composite_date_to: '2026-03-19',
      ndvi_status: 'normal',
      ndwi_status: 'normal',
      ndre_status: 'normal',
      evi_status: 'normal',
      lai_status: 'normal',
      alerts: []
    });
    timeseriesRequest.flush([
      { date: '2026-03-10T08:00:00Z', observed_on: '2026-03-09', ndvi: 0.7, ndwi: 0.24 },
      { date: '2026-03-14T08:00:00Z', observed_on: '2026-03-13', ndvi: 0.74, ndwi: 0.28 },
      { date: '2026-03-19T08:00:00Z', observed_on: '2026-03-18', ndvi: 0.78, ndwi: 0.31 }
    ]);

    expect(result.blockId).toBe('LAN-001');
    expect(result.status).toBe('fresh');
    expect(result.source).toBe('real');
    expect(result.warning).toBeNull();
    expect(result.metrics.ndvi.title).toBe('Crop Health');
    expect(result.metrics.ndvi.label).toBe('Normal');
    expect(result.metrics.evi.title).toBe('Vegetation Strength');
    expect(result.metrics.lai.title).toBe('Growth Density');
    expect(result.metrics.ndvi.history.days).toEqual([70, 74, 78]);
    expect(result.metrics.ndwi.history.days).toEqual([24, 28, 31]);
    expect(result.timeseries.length).toBe(3);
    expect(result.timeseries[0].observedOn).toBe('2026-03-09');
    expect(result.trends.ndvi.direction).toBe('improving');
    expect(result.advisor.sensorAnalysis[0].label).toBe('CROP HEALTH');
    expect(result.nutrient.score).toBeGreaterThan(0);
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
