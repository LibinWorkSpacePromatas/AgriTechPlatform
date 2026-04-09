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

  it('includes the selected block crop in chart rows when it is outside the default key crop list', () => {
    block$.next({
      ...block,
      id: 'block-a-lemons',
      lan: 'block-a-lemons',
      crop: 'Lemons',
      grapeVariety: 'Lemons'
    });

    fixture.detectChanges();

    const req = httpMock.expectOne('http://localhost:8000/api/blocks/block-a-lemons/profit-risk?water_price=153');
    req.flush({
      block_id: 'block-a-lemons',
      block_name: 'Block A',
      block_crop: 'Lemons',
      water_price: 153,
      net_margin: 1200,
      risk_level: 'Low',
      best_crop: 'Lemons',
      best_crop_margin: 1200,
      updated_at: '2026-03-28T10:30:00+00:00',
      current_crop: {
        requested_crop: 'Lemons',
        matched_crop: 'Lemons',
        commodity: 'Citrus',
        match_type: 'exact',
        note: null,
        current_price: 900,
        break_even_price: 650,
        price_trend: 'STEADY',
        yield_t_ha: 14,
        water_req_ml_ha: 7,
        net_margin: 1200
      },
      margins: [
        {
          crop: 'Lemons',
          commodity: 'Citrus',
          current_price: 900,
          break_even_price: 650,
          price_trend: 'STEADY',
          yield_t_ha: 14,
          water_req_ml_ha: 7,
          cost_per_unit: 300,
          margins: {
            low: 1800,
            current: 1200,
            high: -400,
            selected: 1200
          }
        },
        {
          crop: 'Shiraz (inland red - Riverland)',
          commodity: 'Wine Grapes',
          current_price: 200,
          break_even_price: 350,
          price_trend: 'CRISIS',
          yield_t_ha: 8.5,
          water_req_ml_ha: 8,
          cost_per_unit: 300,
          margins: {
            low: -500,
            current: -1095,
            high: -3200,
            selected: -1095
          }
        }
      ]
    });

    fixture.detectChanges();

    expect(component.chartRows().map(row => row.crop)).toContain('Lemons');
    expect(component.priceChartRows().map(row => row.crop)).toContain('Lemons');
  });
});
