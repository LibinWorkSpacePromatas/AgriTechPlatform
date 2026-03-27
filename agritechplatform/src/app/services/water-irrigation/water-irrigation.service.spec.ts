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
      composite_date_from: '2026-03-06',
      composite_date_to: '2026-03-20',
      ndvi: 0.31,
      ndwi: 0.25,
      ndre: 0.22,
      evi: 0.28,
      lai: 2.8,
      cloud_cover_pct: 3.5,
      data_quality: 'good',
      pixel_count: 12,
      map_tile_url: 'https://earthengine.googleapis.com/example/tiles/{z}/{x}/{y}'
    };

    const statusPromise = firstValueFrom(service.getIrrigationStatus('block-123'));

    const req = httpMock.expectOne(`${baseUrl}/api/water/block-123/minimal`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    const result = await statusPromise;
    expect(result.status).toBe('Well-watered');
    expect(result.ndwi).toBe(0.25);
    expect(result.dataQuality).toBe('good');
    expect(result.blockId).toBe('block-123');
    expect(result.mapTileUrl).toContain('earthengine.googleapis.com');
    expect(result.mapTileType).toBe('ndwi');
    expect(result.compositeDateFrom).toBe('2026-03-06');
    expect(result.compositeDateTo).toBe('2026-03-20');
  });

  it('returns fallback status on error', async () => {
    const statusPromise = firstValueFrom(service.getIrrigationStatus('block-123'));

    const req = httpMock.expectOne(`${baseUrl}/api/water/block-123/minimal`);
    req.error(new ErrorEvent('Network error'));

    const result = await statusPromise;
    expect(result.status).toBe('No data');
    expect(result.ndwi).toBeNull();
    expect(result.recommendation).toContain('Unable to fetch water data');
  });

 
});
