import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';

import { BlockService } from '../../shared/services/block.service';
import { Block } from '../../shared/models';
import { IrrigationStatus, WaterIrrigationService } from '../../services/water-irrigation/water-irrigation.service';
import { WaterIrrigationComponent } from './water-irrigation.component';

describe('WaterIrrigationComponent', () => {
  let component: WaterIrrigationComponent;
  let fixture: ComponentFixture<WaterIrrigationComponent>;
  let waterIrrigationService: jasmine.SpyObj<WaterIrrigationService>;
  let blockService: MockBlockService;

  const blockOne: Block = {
    id: '1',
    name: 'Block One',
    location: 'Riverland',
    coordinates: '',
    size: 10,
    sizeUnit: 'ha',
    grapeVariety: 'Shiraz',
    crop: 'Shiraz',
    soilType: 'Loam',
    lat: -34.1,
    lon: 140.7,
    lan: 'LAN-001'
  };

  const blockTwo: Block = {
    ...blockOne,
    id: '2',
    name: 'Block Two',
    lat: -34.2,
    lon: 140.8,
    lan: 'LAN-002'
  };

  beforeEach(async () => {
    waterIrrigationService = jasmine.createSpyObj<WaterIrrigationService>('WaterIrrigationService', ['getIrrigationStatus']);
    blockService = new MockBlockService([blockOne, blockTwo], blockOne);

    waterIrrigationService.getIrrigationStatus.and.callFake((lat?: number, lon?: number, lan?: string) =>
      of(buildIrrigationStatus(lan === 'LAN-002' ? 'LAN-002' : 'LAN-001', lat ?? blockOne.lat, lon ?? blockOne.lon))
    );

    await TestBed.configureTestingModule({
      imports: [WaterIrrigationComponent],
      providers: [
        { provide: WaterIrrigationService, useValue: waterIrrigationService },
        { provide: BlockService, useValue: blockService },
        { provide: PLATFORM_ID, useValue: 'server' }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(WaterIrrigationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('recalculates irrigation when the selected block changes', () => {
    expect(waterIrrigationService.getIrrigationStatus).toHaveBeenCalled();
    expect(waterIrrigationService.getIrrigationStatus.calls.mostRecent().args[2]).toBe('LAN-001');

    blockService.setBlock(blockTwo);
    fixture.detectChanges();

    expect(waterIrrigationService.getIrrigationStatus.calls.mostRecent().args[0]).toBe(blockTwo.lat);
    expect(waterIrrigationService.getIrrigationStatus.calls.mostRecent().args[1]).toBe(blockTwo.lon);
    expect(waterIrrigationService.getIrrigationStatus.calls.mostRecent().args[2]).toBe('LAN-002');
    expect(component.selectedBlockLan).toBe('LAN-002');
    expect(component.irrigationStatus?.ndwiLabel).toBe('Moderate moisture');
  });
});

class MockBlockService {
  private readonly blocksSubject: BehaviorSubject<Block[]>;
  private readonly blockSubject: BehaviorSubject<Block>;

  readonly blocks$;
  readonly block$;

  constructor(blocks: Block[], selected: Block) {
    this.blocksSubject = new BehaviorSubject(blocks);
    this.blockSubject = new BehaviorSubject(selected);
    this.blocks$ = this.blocksSubject.asObservable();
    this.block$ = this.blockSubject.asObservable();
  }

  getBlock(): Block {
    return this.blockSubject.value;
  }

  setBlock(block: Block): void {
    this.blockSubject.next(block);
  }
}

function buildIrrigationStatus(lan: string, lat: number, lon: number): IrrigationStatus {
  return {
    currentHydration: lan === 'LAN-002' ? 54 : 78,
    irrigationNeeded: lan === 'LAN-002' ? 0.041 : 0.019,
    irrigationMessage: 'Hybrid irrigation status',
    et0Today: 4.8,
    rainToday: 0.4,
    netIrrigation: 3.2,
    weatherAdjustedNeed: 3.0,
    ndwiDrivenNeed: lan === 'LAN-002' ? 4.6 : 1.5,
    hybridIrrigationMm: lan === 'LAN-002' ? 4.1 : 1.9,
    kcValue: 0.85,
    status: lan === 'LAN-002' ? 'monitor' : 'saturated',
    recommendationLevel: lan === 'LAN-002' ? 'moderate' : 'low',
    soilReadings: [
      { depth: 30, moisture: 62, status: 'optimal' },
      { depth: 60, moisture: 54, status: 'optimal' },
      { depth: 90, moisture: 49, status: 'optimal' }
    ],
    nextIrrigationTime: new Date('2026-03-20T05:00:00Z'),
    confidence: 0.9,
    ndwi: lan === 'LAN-002' ? 0.12 : 0.33,
    ndwiLabel: lan === 'LAN-002' ? 'Moderate moisture' : 'High moisture',
    ndwiBand: lan === 'LAN-002' ? 'moderate' : 'high',
    moistureSource: 'satellite',
    sourceLabel: 'Satellite NDWI + ET0 hybrid',
    isUsingFallbackMoisture: false,
    insightsStatus: 'fresh',
    insightsDataQuality: 'good',
    insightsWarning: null,
    compositeDateLabel: '2026-03-19',
    soilFactor: 1.02,
    bomStation: {
      station_id: 24048,
      name: `Station ${lan} (${lat}, ${lon})`,
      distance_km: 12.4
    }
  };
}
