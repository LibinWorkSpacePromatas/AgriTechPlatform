import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RentEquipmentComponent } from './rent-equipment.component';

describe('RentEquipmentComponent', () => {
  let component: RentEquipmentComponent;
  let fixture: ComponentFixture<RentEquipmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RentEquipmentComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(RentEquipmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
