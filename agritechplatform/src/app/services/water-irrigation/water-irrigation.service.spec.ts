import { TestBed } from '@angular/core/testing';

import { WaterIrrigationService } from './water-irrigation.service';

describe('WaterIrrigationService', () => {
  let service: WaterIrrigationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WaterIrrigationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
