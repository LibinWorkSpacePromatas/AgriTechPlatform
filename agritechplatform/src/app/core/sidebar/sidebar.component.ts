import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { APP_CONSTANTS, NAVIGATION_ITEMS, MOCK_USER } from '../../shared/constants';
import { BlockSelectorComponent } from '../../shared/components/block-selector.component';
import { Block } from '../../shared/models';
import { BlockService } from '../../shared/services/block.service';
import { LucideAngularModule, Leaf, LayoutDashboard, Droplet, TrendingUp, Sprout, MessageCircle, Tractor, LogOut, Store, X, ShoppingBag } from 'lucide-angular';
import { AuthService } from '../services/auth.service';

const BIDDER_NAV = [
  { label: 'Marketplace', route: '/bidder/dashboard', icon: 'store' },
];

type NavItem = {
  label: string;
  route: string;
  icon: string;
};

type NavGroup = {
  label: string;
  icon: string;
  items: NavItem[];
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, BlockSelectorComponent, LucideAngularModule],
  template: `
    <aside class="app-sidebar" [class.open]="isOpen">
      <div class="sidebar-header">
        <div class="logo">
          <div class="logo-mark">
            <i-lucide [img]="LeafIcon" class="logo-icon"></i-lucide>
          </div>
          <div class="logo-text">
            <div class="logo-title">{{ APP_CONSTANTS.APP_NAME }}</div>
            <div class="logo-subtitle">{{ APP_CONSTANTS.APP_SUBTITLE }}</div>
          </div>
          <div class="logo-attribution">
            <img class="promatas-logo" [src]="promatasLogoSrc" alt="Promatas logo" />
          </div>
        </div>
        <button class="close-mobile-btn mobile-only" (click)="closeSidebar.emit()">
          <i-lucide [img]="XIcon"></i-lucide>
        </button>
      </div>

      <app-block-selector
        *ngIf="!isBidder"
        [blocks]="blocks"
        [selectedBlock]="selectedBlock"
        (blockSelected)="onBlockSelected($event)"
      ></app-block-selector>

      <nav class="sidebar-nav">
        <ng-container *ngIf="!isBidder; else bidderNav">
          <section
            *ngFor="let group of navGroups; let last = last"
            class="nav-group"
            [class.nav-group--active]="isGroupActive(group)"
          >
            <div class="nav-group-header">
              <div class="nav-group-title">
                <i-lucide [img]="getIcon(group.icon)" class="nav-group-icon"></i-lucide>
                <span>{{ group.label }}</span>
              </div>
            </div>

            <a
              *ngFor="let item of group.items"
              [routerLink]="item.route"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' }"
              (click)="closeSidebar.emit()"
              class="nav-item"
            >
              <i-lucide [img]="getIcon(item.icon)" class="nav-icon"></i-lucide>
              <span class="nav-label">{{ item.label }}</span>
            </a>

            <div *ngIf="!last" class="nav-separator" aria-hidden="true"></div>
          </section>
        </ng-container>

        <ng-template #bidderNav>
          <a
            *ngFor="let item of activeNavItems"
            [routerLink]="item.route"
            routerLinkActive="active"
            (click)="closeSidebar.emit()"
            class="nav-item"
          >
            <i-lucide [img]="getIcon(item.icon)" class="nav-icon"></i-lucide>
            <span class="nav-label">{{ item.label }}</span>
          </a>
        </ng-template>
      </nav>

      <div class="sidebar-footer">
        <div class="user-profile">
          <div class="user-avatar">{{ getUserInitials() }}</div>
          <div class="user-info">
            <div class="user-name">{{ userProfile?.userName || 'User' }}</div>
            <div class="farm-name">
              <span class="role-pill" [class.role-pill--bidder]="isBidder">
                {{ isBidder ? 'Buyer' : 'Farmer' }}
              </span>
              {{ isBidder ? (userProfile?.farmLocation || '') : (userProfile?.farmName || 'Farm') }}
            </div>
          </div>
        </div>
        <button class="sign-out-btn" (click)="signOut()">
          <i-lucide [img]="LogOutIcon" class="sign-out-icon"></i-lucide>
          <span>Sign Out</span>
        </button>
        <div class="sidebar-trust">
          <div class="sidebar-security-badge">
            <span>Secured By</span>
            <span class="security-logo-wrap">
              <img class="promasecure-logo" [src]="promasecureLogoSrc" alt="PromaSecure logo" />
            </span>
          </div>
        </div>
      </div>
    </aside>
  `,
  styles: [`
    .app-sidebar {
      position: fixed; top: 0; left: 0; bottom: 0;
      width: var(--sidebar-width); background: var(--primary-green);
      display: flex; flex-direction: column; overflow-y: auto;
      z-index: 1000; box-shadow: var(--shadow-lg);
      transition: transform var(--transition-normal);
    }
    .sidebar-header {
      position: relative; padding: 1rem .95rem .95rem; border-bottom: 1px solid rgba(255,255,255,.1);
      display: flex; justify-content: space-between; align-items: center;
    }
    .logo {
      display: grid; grid-template-columns: 2.75rem minmax(0, 1fr) auto; align-items: center;
      column-gap: .7rem; width: 100%; min-width: 0;
    }
    .logo-mark {
      width: 2.55rem; height: 2.55rem; border-radius: .95rem; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,.1);
      border: 1px solid rgba(255,255,255,.16);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
    }
    .logo-icon { width: 18px; height: 18px; color: var(--white); }
    .logo-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .logo-title {
      font-weight: 800; font-size: .92rem; color: var(--white); line-height: 1.15;
      white-space: nowrap;
    }
    .logo-subtitle {
      font-size: .64rem; color: rgba(255,255,255,.82); font-weight: 700; margin-top: .16rem;
      white-space: nowrap;
    }
    .logo-attribution {
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0; margin-left: auto; padding: .26rem .45rem; background: #ffffff; border-radius: 999px;
      box-shadow: 0 6px 18px rgba(15,23,42,.16); border: 1px solid rgba(15,23,42,.08);
    }
    .promatas-logo {
      width: 4.1rem; height: auto; object-fit: contain; display: block;
    }
    .close-mobile-btn {
      position: absolute; top: 1.05rem; right: .95rem; background: transparent; border: none; color: var(--white);
      cursor: pointer; padding: .5rem; display: flex; align-items: center; justify-content: center;
    }
    .sidebar-nav { flex: 1; padding: 1rem 0; }
    .nav-group { padding: 0 .75rem; }
    .nav-group-header { padding: .25rem .25rem .35rem; }
    .nav-group-title {
      display: flex; align-items: center; gap: .65rem; padding: .6rem .75rem; border-radius: var(--radius-md);
      color: rgba(255,255,255,.76); font-size: .86rem; font-weight: 700; letter-spacing: .01em; transition: all var(--transition-fast);
    }
    .nav-group--active .nav-group-title {
      background: rgba(234,243,222,.14); color: var(--white); box-shadow: inset 0 0 0 1px rgba(234,243,222,.22);
    }
    .nav-group-icon { width: 1rem; height: 1rem; flex-shrink: 0; }
    .nav-item { display: flex; align-items: center; gap: .75rem; padding: .75rem 1rem; color: rgba(255,255,255,.8); text-decoration: none; transition: all var(--transition-fast); font-size: .875rem; font-weight: 500; margin: .2rem .25rem .2rem 1.6rem; border-radius: var(--radius-md); }
    .nav-item:hover { background-color: rgba(255,255,255,.1); color: var(--white); }
    .nav-item.active { background-color: var(--accent-green-active); color: var(--primary-green-dark); font-weight: 600; }
    .nav-icon { width: var(--icon-md); height: var(--icon-md); flex-shrink: 0; }
    .nav-separator { height: 1px; margin: 1rem .75rem; background: linear-gradient(90deg, rgba(255,255,255,.18), rgba(255,255,255,.06)); }
    .sidebar-footer { padding: 1rem; border-top: 1px solid rgba(255,255,255,.1); }
    .user-profile {
      display: flex; align-items: center; gap: .75rem; padding: .8rem; margin-bottom: .85rem;
      background: rgba(255,255,255,.05); border-radius: var(--radius-lg); border: 1px solid rgba(255,255,255,.08);
    }
    .user-avatar { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: .875rem; color: var(--white); flex-shrink: 0; }
    .user-info { flex: 1; min-width: 0; }
    .user-name { font-weight: 600; font-size: .875rem; color: var(--white); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .farm-name { font-size: .75rem; color: rgba(255,255,255,.7); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 5px; }
    .role-pill { display: inline-block; padding: 1px 6px; border-radius: 50px; font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; background: rgba(255,255,255,.2); color: #fff; flex-shrink: 0; }
    .role-pill--bidder { background: rgba(99,102,241,.5); }
    .sign-out-btn { display: flex; align-items: center; justify-content: center; gap: .5rem; width: 100%; padding: .625rem; background: transparent; border: 1px solid rgba(255,255,255,.2); border-radius: var(--radius-md); color: rgba(255,255,255,.8); font-size: .875rem; font-weight: 500; cursor: pointer; transition: all var(--transition-fast); }
    .sign-out-btn:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.3); color: var(--white); }
    .sign-out-icon { width: var(--icon-sm); height: var(--icon-sm); }
    .sidebar-trust {
      margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,.08);
      display: flex; justify-content: center;
    }
    .sidebar-security-badge {
      display: flex; flex-direction: column; align-items: center; gap: .55rem; width: 100%;
      font-size: .68rem; font-weight: 700; letter-spacing: .08em; color: rgba(255,255,255,.72); text-transform: uppercase;
    }
    .security-logo-wrap {
      min-width: 9.4rem; padding: .45rem .8rem; border-radius: 999px; background: #ffffff;
      border: 1px solid rgba(15,23,42,.08); box-shadow: 0 6px 18px rgba(15,23,42,.14);
      display: inline-flex; align-items: center; justify-content: center;
    }
    .promasecure-logo { width: 5.7rem; height: auto; object-fit: contain; display: block; }
    @media (max-width: 1024px) {
      .app-sidebar { transform: translateX(-100%); width: var(--sidebar-width-mobile); }
      .app-sidebar.open { transform: translateX(0); }
    }
    @media (max-width: 420px) {
      .sidebar-header { padding-right: 3rem; }
      .logo { column-gap: .6rem; grid-template-columns: 2.45rem minmax(0, 1fr) auto; }
      .logo-mark { width: 2.45rem; height: 2.45rem; }
      .logo-title { font-size: .88rem; }
      .logo-subtitle { font-size: .6rem; }
      .logo-attribution { padding: .24rem .42rem; }
      .promatas-logo { width: 3.85rem; }
    }
  `]
})
// sidebar components
export class SidebarComponent {
  @Input() isOpen = false;
  @Output() closeSidebar = new EventEmitter<void>();

  readonly APP_CONSTANTS = APP_CONSTANTS;
  readonly promatasLogoSrc = 'assets/branding/promatas-logo.png';
  readonly promasecureLogoSrc = 'assets/branding/promasecure-logo.png';
  navigationItems = NAVIGATION_ITEMS;
  blocks: Block[] = [];
  selectedBlock: Block | null = null;
  userProfile: any = MOCK_USER;
  isBidder = false;
  navGroups: NavGroup[] = [
    {
      label: 'Farm',
      icon: 'leaf',
      items: [
        { label: 'Dashboard', route: '/dashboard', icon: 'layout-dashboard' },
        { label: 'Water & Irrigation', route: '/water-irrigation', icon: 'droplet' }
      ]
    },
    {
      label: 'Insights',
      icon: 'trending-up',
      items: [
        { label: 'Profit & Risk', route: '/profit-risk', icon: 'trending-up' },
        { label: 'Growing Opportunities', route: '/growing-opportunities', icon: 'sprout' }
      ]
    },
    {
      label: 'AI',
      icon: 'message-circle',
      items: [
        { label: 'Grower GPT', route: '/grower-gpt', icon: 'message-circle' }
      ]
    },
    {
      label: 'Marketplace',
      icon: 'shopping-bag',
      items: [
        { label: 'Rental', route: '/rental', icon: 'tractor' },
        { label: 'Auctions', route: '/auctions', icon: 'store' }
      ]
    }
  ];

  get activeNavItems() {
    return this.isBidder ? BIDDER_NAV : this.navigationItems;
  }

  constructor(
    private blockService: BlockService,
    private authService: AuthService,
    private router: Router
  ) {
    this.authService.activeUser$.subscribe(user => {
      this.userProfile = user || MOCK_USER;
      this.isBidder = user?.role === 'bidder';
    });
    this.blockService.blocks$.subscribe(blocks => { this.blocks = blocks; });
    this.blockService.block$.subscribe(block => { this.selectedBlock = block; });
  }

  LeafIcon = Leaf;
  LogOutIcon = LogOut;
  XIcon = X;

  private iconMap: Record<string, any> = {
    'leaf': Leaf,
    'layout-dashboard': LayoutDashboard,
    'droplet': Droplet,
    'trending-up': TrendingUp,
    'sprout': Sprout,
    'message-circle': MessageCircle,
    'tractor': Tractor,
    'store': Store,
    'shopping-bag': ShoppingBag,
  };

  getIcon(iconName: string): any { return this.iconMap[iconName] || LayoutDashboard; }
  onBlockSelected(block: Block): void { this.blockService.setBlock(block); }

  isGroupActive(group: NavGroup): boolean {
    return group.items.some(item => this.isRouteActive(item.route));
  }

  private isRouteActive(route: string): boolean {
    if (route === '/dashboard') {
      return this.router.url === route;
    }
    return this.router.url === route || this.router.url.startsWith(`${route}/`);
  }

  getUserInitials(): string {
    if (!this.userProfile?.userName) return 'U';
    const names = this.userProfile.userName.trim().split(' ');
    if (names.length >= 2) return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    return names[0][0].toUpperCase();
  }

  signOut(): void {
    this.authService.logout();
    this.router.navigate(['/select-user']);
  }
}
