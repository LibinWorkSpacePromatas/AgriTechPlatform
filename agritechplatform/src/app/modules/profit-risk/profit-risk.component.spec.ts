import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';

import { ProfitRiskComponent } from './profit-risk.component';
import { BlockService } from '../../shared/services/block.service';
import { Block } from '../../shared/models';

describe('ProfitRiskComponent', () => {
  let component: ProfitRiskComponent;
  let fixture: ComponentFixture<ProfitRiskComponent>;
  let httpMock: HttpTestingController;

  const block: Block = {
    id: 'block-a-shiraz',
    name: 'Block A',
    location: 'Waikerie',
    coordinates: '',
    size: 7,
    sizeUnit: 'ha',
    grapeVariety: 'Shiraz',
    crop: 'Shiraz',
    soilType: 'Loam',
    lat: -34.178,
    lon: 139.987,
    lan: 'block-a-shiraz',
    polygon: null
  };

  const block$ = new BehaviorSubject<Block>(block);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfitRiskComponent, HttpClientTestingModule],
      providers: [
        {
          provide: BlockService,
          useValue: {
            block$: block$.asObservable(),
            selectedBlock$: block$.asObservable()
          }
        }
      ]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProfitRiskComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    fixture.detectChanges();

    const req = httpMock.expectOne('http://localhost:8000/api/blocks/block-a-shiraz/profit-risk?water_price=153');
    req.flush({
      block_id: 'block-a-shiraz',
      block_name: 'Block A',
      block_crop: 'Shiraz',
      water_price: 153,
      net_margin: -1095,
      risk_level: 'High',
      best_crop: 'Olive oil - extra virgin bulk (oil-to-mill)',
      best_crop_margin: 43500,
      updated_at: '2026-03-28T10:30:00+00:00',
      current_crop: {
        requested_crop: 'Shiraz',
        matched_crop: 'Shiraz (inland red - Riverland)',
        commodity: 'Wine Grapes',
        match_type: 'exact',
        note: null,
        current_price: 200,
        break_even_price: 350,
        price_trend: 'CRISIS',
        yield_t_ha: 8.5,
        water_req_ml_ha: 8,
        net_margin: -1095
      },
      margins: []
    });

    fixture.detectChanges();

    expect(component).toBeTruthy();
    expect(component.profitData()?.risk_level).toBe('High');
  });
});
