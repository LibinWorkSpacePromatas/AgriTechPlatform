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

    const request = httpMock.expectOne('http://localhost:8000/api/block/LAN-001/insights');
    expect(request.request.method).toBe('GET');
    request.flush({
      block_id: 'LAN-001',
      ndvi: 0.78,
      ndwi: 0.31,
      ndre: 0.57,
      evi: 0.61,
      lai: 4.2,
      status: 'fresh',
      latency_ms: 143,
      source: 'cache',
      error: null,
      data_quality: 'good',
      composite_date_from: '2026-03-06',
      composite_date_to: '2026-03-19'
    });

    expect(result.blockId).toBe('LAN-001');
    expect(result.status).toBe('fresh');
    expect(result.source).toBe('cache');
    expect(result.warning).toBeNull();
    expect(result.metrics.ndvi.title).toBe('Crop Health');
    expect(result.metrics.ndvi.label).toBe('Healthy');
    expect(result.metrics.evi.title).toBe('Vegetation Strength');
    expect(result.metrics.lai.title).toBe('Growth Density');
    expect(result.metrics.ndvi.history.hours).toEqual([78]);
    expect(result.advisor.sensorAnalysis[0].label).toBe('CROP HEALTH');
    expect(result.nutrient.score).toBeGreaterThan(0);
  });

  it('returns a graceful placeholder state when both insight endpoints fail', () => {
    let result: any;

    service.getBlockInsights('LAN-404').subscribe(response => {
      result = response;
    });

    const primaryRequest = httpMock.expectOne('http://localhost:8000/api/block/LAN-404/insights');
    primaryRequest.flush({ detail: 'Not found' }, { status: 404, statusText: 'Not Found' });

    const legacyRequest = httpMock.expectOne('http://localhost:8000/block/LAN-404/insights');
    legacyRequest.flush({ detail: 'Not found' }, { status: 404, statusText: 'Not Found' });

    expect(result.blockId).toBe('LAN-404');
    expect(result.status).toBe('updating');
    expect(result.dataQuality).toBe('no_data');
    expect(result.warning).toContain('Not found');
    expect(result.metrics.ndvi.value).toBe('--');
    expect(result.metrics.ndvi.history.hours).toEqual([]);
  });
});
