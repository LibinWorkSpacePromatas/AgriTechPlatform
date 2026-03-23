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
    lan: 'LAN-001',
    polygon: null
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

    waterIrrigationService.getIrrigationStatus.and.callFake((blockId: string) =>
      of(buildIrrigationStatus(blockId))
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
    expect(waterIrrigationService.getIrrigationStatus.calls.mostRecent().args[0]).toBe('LAN-001');

    blockService.setBlock(blockTwo);
    fixture.detectChanges();

    expect(waterIrrigationService.getIrrigationStatus.calls.mostRecent().args[0]).toBe('LAN-002');
    expect(component.selectedBlockLan).toBe('LAN-002');
    expect(component.irrigationStatus?.status).toBe('Moderate stress');
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

function buildIrrigationStatus(lan: string): IrrigationStatus {
  return {
    status: lan === 'LAN-002' ? 'Moderate stress' : 'Well-watered',
    ndwi: lan === 'LAN-002' ? -0.2 : 0.25,
    recommendation: 'Test recommendation',
    date: '2026-03-20',
    dataQuality: 'good',
    blockId: lan,
    compositeDateFrom: '2026-03-15',
    compositeDateTo: '2026-03-20',
    mapTileUrl: null,
    mapTileType: null,
    pixelCount: 8
  };
}
