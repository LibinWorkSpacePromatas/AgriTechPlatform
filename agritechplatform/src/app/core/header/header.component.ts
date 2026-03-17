import { Component, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { LucideAngularModule, MessageCircle, Menu, LogOut } from 'lucide-angular';
import { AuthService } from '../services/auth.service';
import { User } from '../models/user.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  template: `
    <header class="app-header glass-effect">
      <div class="header-content">
        <div class="header-left">
          <button class="mobile-toggle mobile-only" (click)="toggleSidebar.emit()">
            <i-lucide [img]="MenuIcon"></i-lucide>
          </button>
          
          <div class="welcome-section">
            <h1 class="welcome-title">Welcome back, {{ currentUser ? currentUser.userName.split(' ')[0] : 'User' }}!</h1>
            <p class="welcome-subtitle">{{ currentUser ? currentUser.farmName : 'Loading...' }}</p>
          </div>
        </div>
        
        <div class="header-right">
          <button class="grower-gpt-btn hover-lift" routerLink="/grower-gpt">
            <i-lucide [img]="MessageCircleIcon" class="gpt-icon"></i-lucide>
            <span class="btn-text">Open Grower GPT</span>
          </button>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .app-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: var(--header-height);
      background: rgba(245, 243, 237, 0.8);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--gray-200);
      z-index: 990;
      transition: left var(--transition-normal);
    }
    
    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 100%;
      padding: 0 var(--content-padding);
      max-width: var(--content-max-width);
      margin: 0 auto;
    }
    
    .header-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    
    .mobile-toggle {
      background: transparent;
      border: 1px solid var(--gray-200);
      color: var(--gray-700);
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .mobile-toggle:hover {
      background: var(--white);
      border-color: var(--gray-300);
    }
    
    .welcome-section {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    
    .welcome-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--gray-900);
      margin: 0;
    }
    
    .welcome-subtitle {
      font-size: 0.8125rem;
      color: var(--gray-500);
      margin: 0;
    }
    
    .header-right {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    
    .grower-gpt-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--white);
      border: 1px solid var(--gray-300);
      border-radius: var(--radius-md);
      color: var(--gray-700);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--transition-fast);
      box-shadow: var(--shadow-sm);
    }
    
    .grower-gpt-btn:hover {
      background: var(--white);
      border-color: var(--gray-400);
      box-shadow: var(--shadow-md);
    }
    
    .gpt-icon {
      width: var(--icon-md);
      height: var(--icon-md);
      color: var(--primary-green);
    }
    
    .sign-out-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--white);
      border: 1px solid var(--gray-300);
      border-radius: var(--radius-md);
      color: var(--gray-700);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--transition-fast);
      box-shadow: var(--shadow-sm);
    }
    
    .sign-out-btn:hover {
      background: #fee;
      border-color: #dc2626;
      color: #dc2626;
      box-shadow: var(--shadow-md);
    }
    
    .logout-icon {
      width: var(--icon-md);
      height: var(--icon-md);
    }
    
    @media (min-width: 1025px) {
      .app-header {
        left: var(--sidebar-width);
      }
    }
    
    @media (max-width: 1024px) {
      .header-content {
        padding: 0 var(--content-padding-mobile);
      }
    }
    
    @media (max-width: 640px) {
      .welcome-subtitle {
        display: none;
      }
      
      .btn-text {
        display: none;
      }
      
      .grower-gpt-btn {
        padding: 0.5rem;
        border-radius: 50%;
      }
      
      .sign-out-btn {
        padding: 0.5rem;
        border-radius: 50%;
      }
    }
  `]
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Output() toggleSidebar = new EventEmitter<void>();

  currentUser: User | null = null;
  private userSubscription?: Subscription;

  MessageCircleIcon = MessageCircle;
  MenuIcon = Menu;
  LogOutIcon = LogOut;

  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.userSubscription = this.authService.getActiveUser().subscribe(user => {
      this.currentUser = user;
    });
  }

  ngOnDestroy(): void {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }

  signOut(): void {
    this.authService.logout();
    this.router.navigate(['/select-user']);
  }
}
