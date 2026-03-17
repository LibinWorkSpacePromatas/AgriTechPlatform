import { TestBed } from '@angular/core/testing';

import { GrowerGptService } from './grower-gpt.service';

describe('GrowerGptService', () => {
  let service: GrowerGptService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GrowerGptService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
