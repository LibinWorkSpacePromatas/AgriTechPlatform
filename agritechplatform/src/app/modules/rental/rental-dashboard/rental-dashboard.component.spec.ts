import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RentalDashboardComponent } from './rental-dashboard.component';

describe('RentalDashboardComponent', () => {
  let component: RentalDashboardComponent;
  let fixture: ComponentFixture<RentalDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RentalDashboardComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(RentalDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
