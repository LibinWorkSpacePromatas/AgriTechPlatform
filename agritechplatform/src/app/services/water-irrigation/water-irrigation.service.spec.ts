import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WaterIrrigationService, IrrigationStatus } from './water-irrigation.service';

describe('WaterIrrigationService', () => {
  let service: WaterIrrigationService;
  let httpMock: HttpTestingController;
  const baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [WaterIrrigationService]
    });

    service = TestBed.inject(WaterIrrigationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches irrigation status from the backend', async () => {
    const mockResponse = {
      status: 'well_watered',
      ndwi: 0.25,
      recommendation: 'Field looks good',
      date: '2026-03-20',
      data_quality: 'good',
      lanslu: 'BCPKFB',
      block_id: 'block-123',
      map_tile_url: 'https://earthengine.googleapis.com/example/{z}/{x}/{y}'
    };

    const statusPromise = firstValueFrom(service.getIrrigationStatus('block-123'));

    const req = httpMock.expectOne(`${baseUrl}/api/water/block-123`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    const result = await statusPromise;
    expect(result.status).toBe('well_watered');
    expect(result.ndwi).toBe(0.25);
    expect(result.dataQuality).toBe('good');
    expect(result.blockId).toBe('block-123');
    expect(result.map_tile_url).toContain('earthengine.googleapis.com');
  });

  it('returns fallback status on error', async () => {
    const statusPromise = firstValueFrom(service.getIrrigationStatus('block-123'));

    const req = httpMock.expectOne(`${baseUrl}/api/water/block-123`);
    req.error(new ErrorEvent('Network error'));

    const result = await statusPromise;
    expect(result.status).toBe('no_data');
    expect(result.ndwi).toBeNull();
    expect(result.recommendation).toContain('Unable to fetch water data');
  });

  it('forces a refresh call when the cached response has no data', async () => {
    const statusPromise = firstValueFrom(service.getIrrigationStatus('block-123'));

    const initialReq = httpMock.expectOne(`${baseUrl}/api/water/block-123`);
    initialReq.flush({
      status: 'no_data',
      ndwi: null,
      recommendation: 'No data available',
      date: null,
      data_quality: 'no_data',
      lanslu: 'BCPKFB',
      block_id: 'block-123'
    });

    const refreshReq = httpMock.expectOne(req =>
      req.url === `${baseUrl}/api/water/block-123` && req.params.get('refresh') === 'true'
    );
    refreshReq.flush({
      status: 'moderate_stress',
      ndwi: -0.22,
      recommendation: 'Irrigate soon',
      date: '2026-03-20',
      data_quality: 'good',
      lanslu: 'BCPKFB',
      block_id: 'block-123',
      map_tile_url: 'https://earthengine.googleapis.com/example/{z}/{x}/{y}'
    });

    const result = await statusPromise;
    expect(result.status).toBe('moderate_stress');
    expect(result.ndwi).toBe(-0.22);
    expect(result.map_tile_url).toContain('earthengine.googleapis.com');
  });
});
