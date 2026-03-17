import { Component, Renderer2, Inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent, SidebarComponent],
  template: `
    <div class="app-container" [class.sidebar-mobile-open]="isSidebarOpen">
      <!-- Mobile Overlay -->
      <div 
        class="mobile-overlay" 
        *ngIf="isSidebarOpen" 
        (click)="closeSidebar()"
      ></div>

      <app-sidebar 
        [isOpen]="isSidebarOpen" 
        (closeSidebar)="closeSidebar()"
      ></app-sidebar>

      <div class="main-wrapper">
        <app-header (toggleSidebar)="toggleSidebar()"></app-header>
        
        <main class="main-content">
          <div class="content-wrapper">
            <router-outlet></router-outlet>
          </div>
        </main>
      </div>
    </div>
  `,
  styles: [`
    .app-container {
      min-height: 100vh;
      display: flex;
      background-color: var(--bg-beige);
      overflow-x: hidden;
    }
    
    .mobile-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 850;
      animation: fadeIn 0.2s ease-out;
    }
    
    .main-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0; /* Prevent flex overflow */
      margin-left: var(--sidebar-width);
      transition: margin-left var(--transition-normal);
    }
    
    .main-content {
      padding-top: var(--header-height);
      min-height: 100vh;
    }
    
    .content-wrapper {
      padding: var(--content-padding);
      max-width: var(--content-max-width);
      margin: 0 auto;
      width: 100%;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @media (max-width: 1024px) {
      .main-wrapper {
        margin-left: 0;
      }
      
      .content-wrapper {
        padding: var(--content-padding-mobile);
      }
    }
  `]
})
export class LayoutComponent {
  isSidebarOpen = false;

  constructor(
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document
  ) { }

  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
    this.updateScrollLock();
  }

  closeSidebar() {
    this.isSidebarOpen = false;
    this.updateScrollLock();
  }

  private updateScrollLock() {
    if (this.isSidebarOpen) {
      this.renderer.addClass(this.document.body, 'scroll-lock');
    } else {
      this.renderer.removeClass(this.document.body, 'scroll-lock');
    }
  }
}
