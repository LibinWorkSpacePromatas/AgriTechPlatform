import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, X } from 'lucide-angular';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="modal-backdrop" *ngIf="isOpen" (click)="onBackdropClick($event)">
      <div class="modal-content fade-in-up">
        <div class="modal-header">
          <h3 class="modal-title">{{ title }}</h3>
          <button class="close-btn" (click)="close.emit()">
            <i-lucide [img]="XIcon" size="20"></i-lucide>
          </button>
        </div>
        <div class="modal-body">
          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 1rem;
    }

    .modal-content {
      background: white;
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 600px;
      box-shadow: var(--shadow-xl);
      overflow: hidden;
      animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .modal-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--gray-200);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-title {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0;
      color: var(--gray-900);
    }

    .close-btn {
      background: transparent;
      border: none;
      color: var(--gray-500);
      cursor: pointer;
      padding: 0.25rem;
      border-radius: var(--radius-md);
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .close-btn:hover {
      background: var(--gray-100);
      color: var(--gray-700);
    }

    .modal-body {
      padding: 1.5rem;
      max-height: 70vh;
      overflow-y: auto;
      overflow-x: hidden;
      scroll-behavior: smooth;
    }

    /* Premium Custom Scrollbar */
    .modal-body::-webkit-scrollbar {
      width: 8px;
    }

    .modal-body::-webkit-scrollbar-track {
      background: #f1f5f9;
      border-radius: 10px;
    }

    .modal-body::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
      border-radius: 10px;
      transition: background 0.3s ease;
    }

    .modal-body::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
    }

    /* Firefox Scrollbar */
    .modal-body {
      scrollbar-width: thin;
      scrollbar-color: #3b82f6 #f1f5f9;
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `]
})
export class ModalComponent {
  @Input() isOpen: boolean = false;
  @Input() title: string = '';
  @Output() close = new EventEmitter<void>();

  XIcon = X;

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }
}
