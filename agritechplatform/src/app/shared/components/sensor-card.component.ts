import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SensorReading } from '../models';
import { LucideAngularModule, Droplet, Thermometer, Wind, Beaker, LayoutDashboard } from 'lucide-angular';

@Component({
  selector: 'app-sensor-card',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="sensor-card hover-lift">
      <div class="sensor-header">
        <i-lucide [img]="getIcon()" class="sensor-icon"></i-lucide>
        <span class="sensor-label">{{ reading.label }}</span>
      </div>
      
      <div class="sensor-status">
        <span class="status-dot" [class]="'status-' + reading.status"></span>
        <span class="status-text">{{ getStatusText() }}</span>
      </div>
      
      <div class="sensor-value">
        <span class="value">{{ reading.value }}</span>
        <span class="unit">{{ reading.unit }}</span>
      </div>
    </div>
  `,
  styles: [`
    .sensor-card {
      background: var(--white);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      box-shadow: var(--shadow-md);
      transition: box-shadow var(--transition-normal);
      min-height: 160px;
      display: flex;
      flex-direction: column;
    }
    
    .sensor-card:hover {
      box-shadow: var(--shadow-lg);
    }
    
    .sensor-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    
    .sensor-icon {
      width: var(--icon-md);
      height: var(--icon-md);
      color: var(--primary-green);
    }
    
    .sensor-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--gray-700);
    }
    
    .sensor-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    
    .status-dot.status-normal {
      background-color: var(--status-normal);
    }
    
    .status-dot.status-warning {
      background-color: var(--status-medium);
    }
    
    .status-dot.status-critical {
      background-color: var(--status-high);
    }
    
    .status-text {
      font-size: 0.8rem;
      color: var(--gray-600);
      text-transform: capitalize;
    }
    
    .sensor-value {
      display: flex;
      align-items: baseline;
      gap: 0.25rem;
      margin-bottom: auto;
    }
    
    .value {
      font-size: 2.25rem;
      font-weight: 700;
      color: var(--gray-900);
      line-height: 1;
    }
    
    .unit {
      font-size: 1rem;
      color: var(--gray-600);
      font-weight: 500;
    }
    
    .sensor-footer {
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--gray-200);
    }
    
    .history-link {
      font-size: 0.8rem;
      color: var(--primary-green);
      text-decoration: none;
      font-weight: 500;
    }
    
    .history-link:hover {
      text-decoration: underline;
    }
  `]
})
export class SensorCardComponent {
  @Input() reading!: SensorReading;

  getIcon(): any {
    const icons: Record<string, any> = {
      'soil-moisture': Droplet,
      'soil-temperature': Thermometer,
      'air-temperature': Thermometer,
      'humidity': Wind,
      'ph-level': Beaker
    };
    return icons[this.reading.type] || LayoutDashboard;
  }

  getStatusText(): string {
    return this.reading.status.charAt(0).toUpperCase() + this.reading.status.slice(1);
  }
}
