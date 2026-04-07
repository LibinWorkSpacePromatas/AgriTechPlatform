import {
  Component, OnInit, OnDestroy, inject,
  signal, ElementRef, ViewChild, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuctionsService, AuctionItem, AuctionBid } from '../../services/auctions/auctions.service';
import { AuctionWsService } from '../../services/auction-ws/auction-ws.service';
import { AuthService } from '../../core/services/auth.service';
import { formatAuctionDateTime } from '../../shared/utils/auction-time.util';

@Component({
  selector: 'app-auction-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './auction-detail.component.html',
  styleUrls: ['./auction-detail.component.css']
})
export class AuctionDetailComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('graphCanvas') private graphCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('tooltipEl')   private tooltipEl!: ElementRef<HTMLDivElement>;

  private readonly route          = inject(ActivatedRoute);
  private readonly router         = inject(Router);
  private readonly auctionsService = inject(AuctionsService);
  private readonly wsService      = inject(AuctionWsService);
  private readonly authService    = inject(AuthService);

  // ── State ──────────────────────────────────────────────────────────────
  readonly auction        = signal<AuctionItem | null>(null);
  readonly bids           = signal<AuctionBid[]>([]);
  readonly isLoading      = signal(true);
  readonly loadError      = signal<string | null>(null);
  readonly pageReady      = signal(false);
  readonly nowTick        = signal(Date.now());
  readonly tooltipVisible = signal(false);
  readonly tooltipText    = signal('');
  readonly tooltipX       = signal(0);
  readonly tooltipY       = signal(0);
  readonly wsConnected    = signal(false);

  private tickInterval?: ReturnType<typeof setInterval>;
  private refreshInterval?: ReturnType<typeof setInterval>;
  private wsSub?: Subscription;

  // ── Lifecycle ──────────────────────────────────────────────────────────

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.goBack(); return; }

    this.tickInterval = setInterval(() => this.nowTick.set(Date.now()), 1000);
    this.loadAuction(id);
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    clearInterval(this.tickInterval);
    clearInterval(this.refreshInterval);
    this.wsSub?.unsubscribe();
    this.wsService.disconnect();
  }

  // ── Data loading ───────────────────────────────────────────────────────

  private loadAuction(id: string): void {
    const userId = this.authService.getCurrentUser()?.userId ?? '';

    forkJoin({
      auctions: this.auctionsService.getMyAuctions(userId, 'all').pipe(catchError(() => of([] as AuctionItem[]))),
      auction: this.auctionsService.getAuctionById(id).pipe(catchError(() => of(null as AuctionItem | null)))
    }).subscribe(({ auctions, auction }) => {
      const isOwnedAuction = auctions.some(row => row.id === id);

      if (!isOwnedAuction || !auction) {
        this.loadError.set('Auction not found.');
        this.isLoading.set(false);
        return;
      }

      this.syncAuctionState(id, true);
    });
  }

  private syncAuctionState(id: string, initialLoad = false): void {
    forkJoin({
      auction: this.auctionsService.getAuctionById(id).pipe(catchError(() => of(null as AuctionItem | null))),
      bids: this.auctionsService.getAuctionBids(id).pipe(catchError(() => of([] as AuctionBid[])))
    }).subscribe(({ auction, bids }) => {
      if (!auction) {
        if (initialLoad) {
          this.loadError.set('Auction not found.');
          this.isLoading.set(false);
        }
        return;
      }

      this.auction.set(auction);
      this.bids.set(this.normaliseBids(bids));

      if (initialLoad) {
        this.isLoading.set(false);
        setTimeout(() => this.pageReady.set(true), 40);
        if (this.timerState() !== 'ended') {
          this.startLiveSync(id);
        }
      }

      setTimeout(() => this.drawGraph(), initialLoad ? 350 : 100);
    });
  }

  private startLiveSync(id: string): void {
    if (!this.wsSub) {
      this.connectWs(id);
    }

    clearInterval(this.refreshInterval);
    if (this.timerState() === 'ended') {
      return;
    }

    this.refreshInterval = setInterval(() => {
      if (this.timerState() === 'ended') {
        clearInterval(this.refreshInterval);
        this.wsService.disconnect();
        return;
      }

      if (this.timerState() !== 'ended') {
        this.syncAuctionState(id);
      }
    }, 5000);
  }

  private connectWs(id: string): void {
    this.wsSub?.unsubscribe();
    this.wsSub = this.wsService.connect(id).subscribe(msg => {
      if (msg.type === 'init') {
        this.wsConnected.set(true);
        const currentAuction = this.auction();
        if (currentAuction && msg.highest_bid != null) {
          this.auction.set({ ...currentAuction, highest_bid: msg.highest_bid });
        }
        if ((msg.bid_count ?? 0) > 0) {
          this.syncAuctionState(id);
        }
        return;
      }

      if (msg.type === 'new_bid' && msg.bid) {
        this.wsConnected.set(true);
        const currentAuction = this.auction();
        if (currentAuction) {
          const nextAuction = {
            ...currentAuction,
            highest_bid: msg.highest_bid ?? currentAuction.highest_bid
          };
          this.auction.set(nextAuction);
          const newBid: AuctionBid = {
            ...msg.bid,
            is_top: true
          };
          const existing = this.bids()
            .filter(bid => bid.id !== newBid.id)
            .map(bid => ({ ...bid, is_top: false }));
          this.bids.set(this.normaliseBids([newBid, ...existing]));
          setTimeout(() => this.drawGraph(), 100);
        }

        if (this.timerState() !== 'active') {
          clearInterval(this.refreshInterval);
          this.wsService.disconnect();
        }
      }
    });
  }

  /**
   * Normalise bids: sort descending by amount, mark the top bid,
   * and derive initials when the API doesn't provide them.
   */
  private normaliseBids(bids: AuctionBid[]): AuctionBid[] {
    const sorted = [...bids].sort((a, b) => b.amount - a.amount);
    return sorted.map((b, i) => ({
      ...b,
      is_top: i === 0,
      bidder_initials: b.bidder_initials || this.toInitials(b.bidder_name)
    }));
  }

  private toInitials(name: string): string {
    return name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2) || '??';
  }

  // ── Timer ──────────────────────────────────────────────────────────────

  timerState(): 'upcoming' | 'active' | 'ended' {
    const a = this.auction();
    if (!a) return 'ended';
    if (a.status === 'cancelled') return 'ended';
    const now = this.nowTick();
    if (new Date(a.start_time).getTime() > now) return 'upcoming';
    if (new Date(a.end_time).getTime()   > now) return 'active';
    return 'ended';
  }

  timerParts(): { h: string; m: string; s: string } {
    const a = this.auction();
    if (!a) return { h: '00', m: '00', s: '00' };
    const state = this.timerState();
    let diff = 0;
    if (state === 'upcoming') diff = Math.max(0, new Date(a.start_time).getTime() - this.nowTick());
    else if (state === 'active') diff = Math.max(0, new Date(a.end_time).getTime() - this.nowTick());
    return {
      h: String(Math.floor(diff / 3_600_000)).padStart(2, '0'),
      m: String(Math.floor((diff % 3_600_000) / 60_000)).padStart(2, '0'),
      s: String(Math.floor((diff % 60_000) / 1_000)).padStart(2, '0')
    };
  }

  timerUrgency(): 'normal' | 'warning' | 'danger' {
    if (this.timerState() !== 'active') return 'normal';
    const a = this.auction();
    if (!a) return 'normal';
    const ms = Math.max(0, new Date(a.end_time).getTime() - this.nowTick());
    if (ms <= 2 * 60_000)  return 'danger';
    if (ms <= 10 * 60_000) return 'warning';
    return 'normal';
  }

  // ── Status ─────────────────────────────────────────────────────────────

  isActive(a: AuctionItem): boolean {
    if (a.status === 'cancelled') return false;
    const now = Date.now();
    return new Date(a.start_time).getTime() <= now && new Date(a.end_time).getTime() > now;
  }

  displayStatus(): 'Active' | 'Upcoming' | 'Ended' {
    const s = this.timerState();
    if (s === 'active')   return 'Active';
    if (s === 'upcoming') return 'Upcoming';
    return 'Ended';
  }

  statusClass(): string {
    const s = this.timerState();
    if (s === 'active')   return 'badge-live';
    if (s === 'upcoming') return 'badge-upcoming';
    return 'badge-ended';
  }

  // ── Derived values ─────────────────────────────────────────────────────

  currentBid(): number {
    const a = this.auction();
    if (!a) return 0;
    return a.highest_bid ?? a.base_price;
  }

  bidDelta(): number {
    const a = this.auction();
    if (!a || !a.highest_bid) return 0;
    return Math.round(a.highest_bid - a.base_price);
  }

  highestBid(): number {
    return this.bids()[0]?.amount ?? this.currentBid();
  }

  bidCount(): number {
    return this.bids().length;
  }

  // ── Formatting ─────────────────────────────────────────────────────────

  formatMoney(val: number | null | undefined): string {
    if (val == null) return '--';
    return Math.round(val).toLocaleString('en-AU');
  }

  formatDate(iso: string): string {
    return formatAuctionDateTime(iso);
  }

  timeAgo(iso: string): string {
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const mins = Math.floor(diff / 60_000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  // ── Navigation ─────────────────────────────────────────────────────────

  goBack(): void {
    this.router.navigate(['/auctions']);
  }

  // ── Graph ──────────────────────────────────────────────────────────────

  drawGraph(): void {
    const canvas = this.graphCanvas?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width, H = rect.height;
    const padL = 62, padR = 20, padT = 20, padB = 40;
    const drawW = W - padL - padR;
    const drawH = H - padT - padB;

    const bids = [...this.bids()].reverse();
    if (bids.length < 2) {
      this.drawEmptyGraph(ctx, W, H, padL, padR, padT, padB);
      return;
    }

    const amounts = bids.map(b => b.amount);
    const minAmt  = Math.min(...amounts) * 0.97;
    const maxAmt  = Math.max(...amounts) * 1.03;

    const toX = (i: number) => padL + (i / (bids.length - 1)) * drawW;
    const toY = (v: number) => padT + drawH - ((v - minAmt) / (maxAmt - minAmt)) * drawH;

    // Grid
    ctx.strokeStyle = 'rgba(45,123,87,0.08)';
    ctx.lineWidth = 1;
    for (let gi = 0; gi <= 4; gi++) {
      const y   = padT + (gi / 4) * drawH;
      const val = maxAmt - (gi / 4) * (maxAmt - minAmt);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(this.shortMoney(val), padL - 6, y + 4);
    }

    // X labels
    const step = Math.max(1, Math.floor(bids.length / 5));
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    bids.forEach((b, i) => {
      if (i % step === 0 || i === bids.length - 1) {
        ctx.fillText(i === bids.length - 1 ? 'Now' : this.timeAgo(b.created_at), toX(i), H - padB + 14);
      }
    });

    // Gradient fill
    const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
    grad.addColorStop(0, 'rgba(45,123,87,0.20)');
    grad.addColorStop(1, 'rgba(45,123,87,0.01)');

    const drawCurve = () => {
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(bids[0].amount));
      for (let i = 1; i < bids.length; i++) {
        const cpx = (toX(i - 1) + toX(i)) / 2;
        ctx.bezierCurveTo(cpx, toY(bids[i - 1].amount), cpx, toY(bids[i].amount), toX(i), toY(bids[i].amount));
      }
    };

    // Fill
    drawCurve();
    ctx.lineTo(toX(bids.length - 1), H - padB);
    ctx.lineTo(toX(0), H - padB);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    drawCurve();
    ctx.strokeStyle = '#2d7b57';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Dots
    bids.forEach((b, i) => {
      const x = toX(i), y = toY(b.amount);
      if (i === bids.length - 1) {
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(45,123,87,0.18)'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#2d7b57'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        // Label
        const label = `$${this.formatMoney(b.amount)} AUD`;
        const lx = Math.min(x + 10, W - padR - ctx.measureText(label).width - 10);
        const ly = Math.max(y - 10, padT + 16);
        ctx.fillStyle = '#1a5c3e';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, lx, ly);
      } else {
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#2d7b57'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      }
    });
  }

  private drawEmptyGraph(
    ctx: CanvasRenderingContext2D,
    W: number, H: number,
    padL: number, padR: number, padT: number, padB: number
  ): void {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No bid data yet', W / 2, H / 2);
  }

  private shortMoney(val: number): string {
    const rounded = Math.round(val / 100) * 100;
    return rounded >= 1000 ? `${(rounded / 1000).toFixed(0)}k` : String(rounded);
  }

  onCanvasMouseMove(event: MouseEvent): void {
    const canvas = this.graphCanvas?.nativeElement;
    if (!canvas) return;
    const rect  = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const bids   = [...this.bids()].reverse();
    if (bids.length < 2) return;

    const drawW = rect.width - 62 - 20;
    const toX   = (i: number) => 62 + (i / (bids.length - 1)) * drawW;

    let closest = 0, minDist = Infinity;
    bids.forEach((_, i) => {
      const d = Math.abs(toX(i) - mouseX);
      if (d < minDist) { minDist = d; closest = i; }
    });

    if (minDist < 30) {
      const b = bids[closest];
      this.tooltipText.set(`$${this.formatMoney(b.amount)} AUD — ${this.timeAgo(b.created_at)}`);
      this.tooltipX.set(event.offsetX + 10);
      this.tooltipY.set(event.offsetY - 30);
      this.tooltipVisible.set(true);
    } else {
      this.tooltipVisible.set(false);
    }
  }

  onCanvasMouseLeave(): void {
    this.tooltipVisible.set(false);
  }

  trackBid(_: number, bid: AuctionBid): string {
    return bid.id;
  }
}
