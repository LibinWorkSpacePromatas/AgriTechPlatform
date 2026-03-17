import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WaterIrrigationComponent } from './water-irrigation.component';

describe('WaterIrrigationComponent', () => {
  let component: WaterIrrigationComponent;
  let fixture: ComponentFixture<WaterIrrigationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WaterIrrigationComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(WaterIrrigationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
