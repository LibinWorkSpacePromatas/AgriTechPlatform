import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Block, HistoricalReading } from '../models';
import { LucideAngularModule, MapPin, Maximize2, Sprout, Wheat, Leaf, Lightbulb } from 'lucide-angular';

@Component({
  selector: 'app-block-hero',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="block-hero hover-glow">
      <div class="hero-content">
        <div class="hero-left">
          <h2 class="block-title">{{ block.name }}</h2>
          
          <div class="block-meta">
            <div class="meta-item">
              <i-lucide [img]="MapPinIcon" class="meta-icon"></i-lucide>
              <span class="meta-text">{{ block.location }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-coords">{{ block.coordinates }}</span>
            </div>
          </div>
          
          <div class="block-details">
            <div class="detail-item">
              <i-lucide [img]="MaximizeIcon" class="detail-icon"></i-lucide>
              <span class="detail-text">{{ block.size }} {{ block.sizeUnit }}</span>
            </div>
            <div class="detail-item">
              <i-lucide [img]="GrapeIcon" class="detail-icon"></i-lucide>
              <span class="detail-text">{{ block.grapeVariety }}</span>
            </div>
            <div class="detail-item">
              <i-lucide [img]="SoilIcon" class="detail-icon"></i-lucide>
              <span class="detail-text">{{ block.soilType }}</span>
            </div>
          </div>
        </div>
        
        <div class="hero-right" *ngIf="lastReadings && lastReadings.length > 0">
          <div class="readings-table">
            <div class="readings-header">Last 5 readings</div>
            <table>
              <tbody>
                <tr *ngFor="let reading of lastReadings">
                  <td class="reading-period">{{ reading.period }}</td>
                  <td class="reading-value">{{ reading.value }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <div class="hero-tabs">
        <button class="tab-button active">
          <i-lucide [img]="LeafIcon" class="tab-icon"></i-lucide>
          <span>Overview</span>
        </button>
        <button class="tab-button">
          <i-lucide [img]="LightbulbIcon" class="tab-icon"></i-lucide>
          <span>Crop Advisor</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .block-hero {
      background: linear-gradient(135deg, var(--primary-green) 0%, var(--primary-green-dark) 100%);
      border-radius: var(--radius-xl);
      padding: 2rem;
      color: var(--white);
      box-shadow: var(--shadow-lg);
      margin-bottom: 2rem;
    }
    
    .hero-content {
      display: flex;
      justify-content: space-between;
      gap: 2rem;
      margin-bottom: 1.5rem;
    }
    
    .hero-left {
      flex: 1;
    }
    
    .block-title {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 1rem;
      color: var(--white);
    }
    
    .block-meta {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      margin-bottom: 1.25rem;
    }
    
    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .meta-icon {
      width: var(--icon-sm);
      height: var(--icon-sm);
      opacity: 0.9;
    }
    
    .meta-text {
      font-size: 0.95rem;
      color: rgba(255, 255, 255, 0.95);
    }
    
    .meta-coords {
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.7);
    }
    
    .block-details {
      display: flex;
      gap: 2rem;
      flex-wrap: wrap;
    }
    
    .detail-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .detail-icon {
      width: var(--icon-md);
      height: var(--icon-md);
      opacity: 0.9;
    }
    
    .detail-text {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.9);
    }
    
    .hero-right {
      min-width: 200px;
    }
    
    .readings-table {
      background: rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-md);
      padding: 1rem;
      backdrop-filter: blur(10px);
    }
    
    .readings-header {
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: rgba(255, 255, 255, 0.9);
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    td {
      padding: 0.4rem 0;
      font-size: 0.85rem;
    }
    
    .reading-period {
      color: rgba(255, 255, 255, 0.7);
    }
    
    .reading-value {
      text-align: right;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
    }
    
    .hero-tabs {
      display: flex;
      gap: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
      padding-top: 1.5rem;
    }
    
    .tab-button {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 1.25rem;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: var(--radius-md);
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .tab-button:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.5);
    }
    
    .tab-button.active {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.6);
      color: var(--white);
    }
    
    .tab-icon {
      width: var(--icon-sm);
      height: var(--icon-sm);
    }
    
    @media (max-width: 1024px) {
      .block-hero {
        padding: 1.5rem;
      }
      
      .hero-content {
        flex-direction: column;
        gap: 1.5rem;
      }
      
      .hero-right {
        min-width: 100%;
      }
      
      .block-title {
        font-size: 1.5rem;
      }
    }
    
    @media (max-width: 640px) {
      .block-details {
        gap: 1rem;
      }
      
      .hero-tabs {
        flex-direction: column;
      }
      
      .tab-button {
        width: 100%;
        justify-content: center;
      }
    }
  `]
})
export class BlockHeroComponent {
  @Input() block!: Block;
  @Input() lastReadings: HistoricalReading[] = [];

  MapPinIcon = MapPin;
  MaximizeIcon = Maximize2;
  GrapeIcon = Sprout; // Using Sprout for grape for now, or could find something closer
  SoilIcon = Wheat;
  LeafIcon = Leaf;
  LightbulbIcon = Lightbulb;
}
