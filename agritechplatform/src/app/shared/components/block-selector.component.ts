import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Block } from '../models';

@Component({
  selector: 'app-block-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="block-selector" (click)="toggleDropdown()">
      <div class="selector-header">
        <span class="selector-label">ACTIVE BLOCK</span>
      </div>
      <div class="selector-value">
        <span class="block-name">{{ selectedBlock?.name || 'Select Block' }}</span>
        <span class="dropdown-icon">{{ isOpen ? '▲' : '▼' }}</span>
      </div>
      
      <div class="dropdown-menu" *ngIf="isOpen">
        <div 
          *ngFor="let block of blocks" 
          class="dropdown-item"
          [class.active]="block.id === selectedBlock?.id"
          (click)="selectBlock(block); $event.stopPropagation()"
        >
          <span>{{ block.name }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .block-selector {
      position: relative;
      padding: 0.75rem 1rem;
      margin: 1rem 0;
      cursor: pointer;
      user-select: none;
    }
    
    .selector-header {
      margin-bottom: 0.5rem;
    }
    
    .selector-label {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      color: rgba(255, 255, 255, 0.6);
    }
    
    .selector-value {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0.75rem;
      background-color: rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-md);
      transition: background-color var(--transition-fast);
    }
    
    .selector-value:hover {
      background-color: rgba(255, 255, 255, 0.15);
    }
    
    .block-name {
      color: var(--white);
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    .dropdown-icon {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.75rem;
    }
    
    .dropdown-menu {
      position: absolute;
      top: 100%;
      left: 1rem;
      right: 1rem;
      background: var(--white);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      margin-top: 0.5rem;
      z-index: 1000;
      overflow: hidden;
    }
    
    .dropdown-item {
      display: flex;
      align-items: center;
      padding: 0.75rem 1rem;
      color: var(--gray-700);
      transition: background-color var(--transition-fast);
      cursor: pointer;
    }
    
    .dropdown-item:hover {
      background-color: var(--gray-100);
    }
    
    .dropdown-item.active {
      background-color: var(--primary-green);
      color: var(--white);
    }
  `]
})
export class BlockSelectorComponent {
  @Input() blocks: Block[] = [];
  @Input() selectedBlock: Block | null = null;
  @Output() blockSelected = new EventEmitter<Block>();

  isOpen = false;

  toggleDropdown(): void {
    this.isOpen = !this.isOpen;
  }

  selectBlock(block: Block): void {
    this.selectedBlock = block;
    this.blockSelected.emit(block);
    this.isOpen = false;
  }
}
