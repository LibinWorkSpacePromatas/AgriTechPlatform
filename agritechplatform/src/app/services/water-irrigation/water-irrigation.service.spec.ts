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
      block_id: 'block-123',
      source: 'real',
      freshness_status: 'fresh',
      composite_date_from: '2026-03-06',
      composite_date_to: '2026-03-20',
      last_satellite_update: '2026-03-20',
      ndwi: 0.25,
      recommendation: 'Check over-irrigation',
      date: '2026-03-20',
      data_quality: 'good',
      pixel_count: 12,
      map_tile_url: 'https://earthengine.googleapis.com/example/{z}/{x}/{y}',
      map_tile_type: 'ndwi',
      acquisition_metadata: { image_count: 1, actual_dates: ['2026-03-20'] },
      interpretations: {
        ndvi: { value: null, status: 'No data' },
        ndwi: { value: 0.25, status: 'Well-watered' },
        ndre: { value: null, status: 'No data' },
        evi: { value: null, status: 'No data' },
        lai: { value: null, status: 'No data' }
      },
      limitations: [],
      lanslu: 'BCPKFB',
      status: 'Well-watered'
    };

    const statusPromise = firstValueFrom(service.getIrrigationStatus('block-123'));

    const req = httpMock.expectOne(`${baseUrl}/api/water/block-123`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    const result = await statusPromise;
    expect(result.status).toBe('Well-watered');
    expect(result.ndwi).toBe(0.25);
    expect(result.dataQuality).toBe('good');
    expect(result.blockId).toBe('block-123');
    expect(result.mapTileUrl).toContain('earthengine.googleapis.com');
    expect(result.mapTileType).toBe('ndwi');
    expect(result.limitations).toEqual([]);
  });

  it('returns fallback status on error', async () => {
    const statusPromise = firstValueFrom(service.getIrrigationStatus('block-123'));

    const req = httpMock.expectOne(`${baseUrl}/api/water/block-123`);
    req.error(new ErrorEvent('Network error'));

    const result = await statusPromise;
    expect(result.status).toBe('No data');
    expect(result.ndwi).toBeNull();
    expect(result.recommendation).toContain('Unable to fetch water data');
  });

 
});
