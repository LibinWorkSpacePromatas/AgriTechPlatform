import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GrowerGptComponent } from './grower-gpt.component';

describe('GrowerGptComponent', () => {
  let component: GrowerGptComponent;
  let fixture: ComponentFixture<GrowerGptComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GrowerGptComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(GrowerGptComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
