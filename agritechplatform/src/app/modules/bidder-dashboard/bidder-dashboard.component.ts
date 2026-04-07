import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuctionsService, AuctionItem, BidderDashboardStats } from '../../services/auctions/auctions.service';
import { AuthService } from '../../core/services/auth.service';

type AuctionTab = 'all' | 'active' | 'upcoming' | 'ended';

@Component({
  selector: 'app-bidder-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bidder-dashboard.component.html',
  styleUrls: ['./bidder-dashboard.component.css']
})
export class BidderDashboardComponent implements OnInit, OnDestroy {
  private readonly auctionsService = inject(AuctionsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isLoading = signal(true);
  readonly pageReady = signal(false);
  readonly stats = signal<BidderDashboardStats | null>(null);
  readonly allAuctions = signal<AuctionItem[]>([]);
  readonly activeTab = signal<AuctionTab>('all');
  readonly nowTick = signal(Date.now());

  private tickTimer?: ReturnType<typeof setInterval>;

  readonly currentUser = this.authService.getCurrentUser();

  ngOnInit(): void {
    this.tickTimer = setInterval(() => this.nowTick.set(Date.now()), 1000);
    this.loadData();
    setTimeout(() => this.pageReady.set(true), 60);
  }

  ngOnDestroy(): void {
    clearInterval(this.tickTimer);
  }

  private loadData(): void {
    const userId = this.currentUser?.userId ?? '';
    forkJoin({
      stats: this.auctionsService.getBidderDashboard(userId).pipe(catchError(() => of(null))),
      auctions: this.auctionsService.getAllAuctions('all').pipe(catchError(() => of([] as AuctionItem[])))
    }).subscribe(({ stats, auctions }) => {
      this.stats.set(stats);
      this.allAuctions.set(auctions);
      this.isLoading.set(false);
    });
  }

  // ── Pure timestamp helpers — never use a.status ──────────────────────

  private auctionState(a: AuctionItem): 'active' | 'upcoming' | 'ended' {
    const now = this.nowTick();
    const start = new Date(a.start_time).getTime();
    const end   = new Date(a.end_time).getTime();
    if (now >= end)   return 'ended';
    if (now < start)  return 'upcoming';
    return 'active';
  }

  selectTab(tab: AuctionTab): void {
    this.activeTab.set(tab);
  }

  filteredAuctions(): AuctionItem[] {
    const tab = this.activeTab();
    const all = this.allAuctions();
    if (tab === 'all') return all;
    return all.filter(a => this.auctionState(a) === tab);
  }

  viewAuction(auction: AuctionItem): void {
    this.router.navigate(['/bidder/auctions', auction.id]);
  }

  displayStatus(a: AuctionItem): string {
    const state = this.auctionState(a);
    if (state === 'active') {
      const ms = new Date(a.end_time).getTime() - this.nowTick();
      return ms < 3_600_000 ? 'Ending Soon' : 'Live';
    }
    if (state === 'upcoming') return 'Upcoming';
    return 'Ended';
  }

  displayStatusClass(a: AuctionItem): string {
    const s = this.displayStatus(a);
    if (s === 'Live')         return 'status-live';
    if (s === 'Ending Soon')  return 'status-ending';
    if (s === 'Upcoming')     return 'status-scheduled';
    return 'status-sold';
  }

  isActive(a: AuctionItem): boolean {
    return this.auctionState(a) === 'active';
  }

  countdownLabel(a: AuctionItem): string {
    const ms = new Date(a.end_time).getTime() - this.nowTick();
    if (ms <= 0) return '00:00:00';
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1_000);
    return `${this.pad(h)}:${this.pad(m)}:${this.pad(s)}`;
  }

  timeLeftLabel(a: AuctionItem): string {
    const ms = new Date(a.start_time).getTime() - this.nowTick();
    if (ms <= 0) return 'Starting soon';
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    if (h > 24) return `Starts in ${Math.floor(h / 24)}d`;
    if (h > 0)  return `Starts in ${h}h ${m}m`;
    return `Starts in ${m}m`;
  }

  formatMoney(v: number | null | undefined): string {
    if (v == null) return '0';
    return v.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  trackByAuction(_: number, a: AuctionItem): string { return a.id; }

  private pad(n: number): string { return n.toString().padStart(2, '0'); }

  get activeCount():   number { return this.allAuctions().filter(a => this.auctionState(a) === 'active').length; }
  get upcomingCount(): number { return this.allAuctions().filter(a => this.auctionState(a) === 'upcoming').length; }
  get endedCount():    number { return this.allAuctions().filter(a => this.auctionState(a) === 'ended').length; }
}
