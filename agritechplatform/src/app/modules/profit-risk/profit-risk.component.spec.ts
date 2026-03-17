import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProfitRiskComponent } from './profit-risk.component';

describe('ProfitRiskComponent', () => {
  let component: ProfitRiskComponent;
  let fixture: ComponentFixture<ProfitRiskComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfitRiskComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ProfitRiskComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
