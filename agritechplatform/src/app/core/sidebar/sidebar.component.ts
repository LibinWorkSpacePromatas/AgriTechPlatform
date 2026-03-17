import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { NAVIGATION_ITEMS, MOCK_BLOCKS, MOCK_USER } from '../../shared/constants';
import { BlockSelectorComponent } from '../../shared/components/block-selector.component';
import { Block } from '../../shared/models';
import { BlockService } from '../../shared/services/block.service';
import { LucideAngularModule, Leaf, LayoutDashboard, Droplet, TrendingUp, Sprout, MessageCircle, LogOut, X } from 'lucide-angular';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, BlockSelectorComponent, LucideAngularModule],
  template: `
    <aside class="app-sidebar" [class.open]="isOpen">
      <div class="sidebar-header">
        <div class="logo">
          <i-lucide [img]="LeafIcon" class="logo-icon"></i-lucide>
          <div class="logo-text">
            <div class="logo-title">AgriTech</div>
            <div class="logo-subtitle">Riverland AgriTech</div>
          </div>
        </div>
        <button class="close-mobile-btn mobile-only" (click)="closeSidebar.emit()">
          <i-lucide [img]="XIcon"></i-lucide>
        </button>
      </div>
      
      <app-block-selector 
        [blocks]="blocks" 
        [selectedBlock]="selectedBlock"
        (blockSelected)="onBlockSelected($event)"
      ></app-block-selector>
      
      <nav class="sidebar-nav">
        <a 
          *ngFor="let item of navigationItems"
          [routerLink]="item.route"
          routerLinkActive="active"
          (click)="closeSidebar.emit()"
          class="nav-item"
        >
          <i-lucide [img]="getIcon(item.icon)" class="nav-icon"></i-lucide>
          <span class="nav-label">{{ item.label }}</span>
        </a>
      </nav>
      
      <div class="sidebar-footer">
        <div class="user-profile">
          <div class="user-avatar">{{ getUserInitials() }}</div>
          <div class="user-info">
            <div class="user-name">{{ userProfile?.userName || 'User' }}</div>
            <div class="farm-name">{{ userProfile?.farmName || 'Farm' }}</div>
          </div>
        </div>
        <button class="sign-out-btn" (click)="signOut()">
          <i-lucide [img]="LogOutIcon" class="sign-out-icon"></i-lucide>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  `,
  styles: [`
    .app-sidebar {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      width: var(--sidebar-width);
      background: var(--primary-green);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: var(--shadow-lg);
      transition: transform var(--transition-normal);
    }
    
    .sidebar-header {
      padding: 1.5rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    
    .logo-icon {
      width: 28px;
      height: 28px;
      color: var(--white);
    }
    
    .logo-text {
      display: flex;
      flex-direction: column;
    }
    
    .logo-title {
      font-weight: 700;
      font-size: 1.1rem;
      color: var(--white);
      line-height: 1.2;
    }
    
    .logo-subtitle {
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.7);
      font-weight: 400;
    }
    
    .close-mobile-btn {
      background: transparent;
      border: none;
      color: var(--white);
      cursor: pointer;
      padding: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .sidebar-nav {
      flex: 1;
      padding: 1rem 0;
    }
    
    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      color: rgba(255, 255, 255, 0.8);
      text-decoration: none;
      transition: all var(--transition-fast);
      font-size: 0.875rem;
      font-weight: 500;
      margin: 0.25rem 0.5rem;
      border-radius: var(--radius-md);
    }
    
    .nav-item:hover {
      background-color: rgba(255, 255, 255, 0.1);
      color: var(--white);
    }
    
    .nav-item.active {
      background-color: var(--accent-green-active);
      color: var(--primary-green-dark);
      font-weight: 600;
    }
    
    .nav-icon {
      width: var(--icon-md);
      height: var(--icon-md);
      flex-shrink: 0;
    }
    
    
    .sidebar-footer {
      padding: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .user-profile {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      margin-bottom: 0.75rem;
      background: rgba(255, 255, 255, 0.05);
      border-radius: var(--radius-md);
    }
    
    .user-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.875rem;
      color: var(--white);
      flex-shrink: 0;
    }
    
    .user-info {
      flex: 1;
      min-width: 0;
    }
    
    .user-name {
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--white);
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .farm-name {
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.7);
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .sign-out-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.625rem;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: var(--radius-md);
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .sign-out-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.3);
      color: var(--white);
    }
    
    .sign-out-icon {
      width: var(--icon-sm);
      height: var(--icon-sm);
    }
    
    @media (max-width: 1024px) {
      .app-sidebar {
        transform: translateX(-100%);
        width: var(--sidebar-width-mobile);
      }
      
      .app-sidebar.open {
        transform: translateX(0);
      }
    }
  `]
})
export class SidebarComponent {
  @Input() isOpen = false;
  @Output() closeSidebar = new EventEmitter<void>();

  navigationItems = NAVIGATION_ITEMS;
  blocks = MOCK_BLOCKS;
  selectedBlock: Block | null = null;
  userProfile: any = MOCK_USER;

  constructor(
    private blockService: BlockService,
    private authService: AuthService,
    private router: Router
  ) {
    this.authService.activeUser$.subscribe(user => {
      if (user) {
        this.userProfile = user;
        // Map user user blocks to sidebar blocks with custom naming
        this.blocks = user.blocks.map((block, index) => {
          // Create numeric label (1, 2, 3...)
          const blockNumber = index + 1;

          // Get real vineyard location based on coordinates
          let vineyardLocation = user.farmLocation;
          if (block.latitude && block.longitude) {
            // Map coordinates to real vineyard locations
            if (block.latitude === -34.171 && block.longitude === 140.738) {
              vineyardLocation = 'Angove\'s Winery, Renmark';
            } else if (block.latitude === -34.2 && block.longitude === 140.745) {
              vineyardLocation = 'Mallee Estate, Renmark Ave';
            } else if (block.latitude === -34.524 && block.longitude === 138.963) {
              vineyardLocation = 'Château Tanunda, Tanunda';
            } else if (block.latitude === -34.536 && block.longitude === 138.985) {
              vineyardLocation = 'Yalumba, Angaston';
            } else if (block.latitude === -35.219 && block.longitude === 138.547) {
              vineyardLocation = 'd\'Arenberg, McLaren Vale';
            } else if (block.latitude === -35.225 && block.longitude === 138.553) {
              vineyardLocation = 'Willunga area, McLaren Vale';
            } else if (block.latitude === -34.178 && block.longitude === 139.987) {
              vineyardLocation = 'Waikerie area, Riverland';
            } else if (block.latitude === -34.185 && block.longitude === 139.995) {
              vineyardLocation = 'Near Waikerie, Riverland';
            } else if (block.latitude === -34.536 && block.longitude === 138.985) {
              vineyardLocation = 'Penfolds, Nuriootpa';
            } else if (block.latitude === -34.542 && block.longitude === 138.993) {
              vineyardLocation = 'Wolf Blass, Nuriootpa';
            }
          }

          return {
            id: block.lanslu,
            name: `BLOCK ${blockNumber} - ${block.crop || user.primaryCropName}`,
            location: vineyardLocation,
            coordinates: '', // Placeholder
            size: block.area,
            sizeUnit: 'ha',
            grapeVariety: block.crop || user.primaryCropName,
            crop: block.crop || user.primaryCropName,
            soilType: block.primarySoilClass,
            soilDescription: block.description,
            // Use actual coordinates from user data instead of generated ones
            lat: block.latitude || -34.53,
            lon: block.longitude || 138.96,
            lan: block.lanslu
          } as Block;
        });

        // Auto-select first block if available
        if (this.blocks.length > 0 && !this.selectedBlock) {
          this.blockService.setSelectedBlock(this.blocks[0]);
        }
      }
    });

    this.blockService.selectedBlock$.subscribe(block => {
      this.selectedBlock = block;
    });
  }

  // Icon references
  LeafIcon = Leaf;
  LogOutIcon = LogOut;
  XIcon = X;

  // Icon map for navigation
  private iconMap: Record<string, any> = {
    'layout-dashboard': LayoutDashboard,
    'droplet': Droplet,
    'trending-up': TrendingUp,
    'sprout': Sprout,
    'message-circle': MessageCircle
  };

  getIcon(iconName: string): any {
    return this.iconMap[iconName] || LayoutDashboard;
  }

  onBlockSelected(block: Block): void {
    this.blockService.setSelectedBlock(block);
  }

  getUserInitials(): string {
    if (!this.userProfile?.userName) return 'U';
    const names = this.userProfile.userName.trim().split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    }
    return names[0][0].toUpperCase();
  }

  signOut(): void {
    this.authService.logout();
    this.router.navigate(['/select-user']);
  }
}
