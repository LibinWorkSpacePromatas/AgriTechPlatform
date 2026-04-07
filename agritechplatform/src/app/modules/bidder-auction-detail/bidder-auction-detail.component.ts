import {
  Component, OnInit, OnDestroy, inject, signal,
  ElementRef, ViewChild, AfterViewInit, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuctionsService, AuctionItem, AuctionBid } from '../../services/auctions/auctions.service';
import { AuctionWsService } from '../../services/auction-ws/auction-ws.service';
import { AuthService } from '../../core/services/auth.service';
import { formatAuctionDateTime } from '../../shared/utils/auction-time.util';

@Component({
  selector: 'app-bidder-auction-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bidder-auction-detail.component.html',
  styleUrls: ['./bidder-auction-detail.component.css']
})
export class BidderAuctionDetailComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('graphCanvas') private graphCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('tooltipEl')   private tooltipEl!: ElementRef<HTMLDivElement>;
  @ViewChild('bidInput')    private bidInput?: ElementRef<HTMLInputElement>;

  private readonly route           = inject(ActivatedRoute);
  private readonly router          = inject(Router);
  private readonly auctionsService = inject(AuctionsService);
  private readonly wsService       = inject(AuctionWsService);
  private readonly authService     = inject(AuthService);
  private readonly zone            = inject(NgZone);

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

  // Bidding state
  readonly bidAmount      = signal<number | null>(null);
  readonly isBidding      = signal(false);
  readonly bidError       = signal<string | null>(null);
  readonly bidSuccess     = signal(false);
  readonly bidFlash       = signal(false);
  readonly wsConnected    = signal(false);

  // Voice bidding state
  readonly voiceActive    = signal(false);
  readonly voiceStatus    = signal<'idle' | 'listening' | 'processing' | 'error'>('idle');
  readonly voiceTranscript = signal('');
  readonly voiceSupported = signal(false);
  readonly voiceDetectedAmount = signal<number | null>(null);

  private tickInterval?: ReturnType<typeof setInterval>;
  private refreshInterval?: ReturnType<typeof setInterval>;
  private wsSub?: Subscription;
  private recognition: any = null;
  private voiceHoldTimer?: ReturnType<typeof setTimeout>;

  readonly currentUser = this.authService.getCurrentUser();

  // ── Lifecycle ──────────────────────────────────────────────────────────

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.goBack(); return; }

    this.tickInterval = setInterval(() => this.nowTick.set(Date.now()), 1000);
    this.loadAuction(id);
    this.initVoice();
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    clearInterval(this.tickInterval);
    clearInterval(this.refreshInterval);
    this.wsSub?.unsubscribe();
    this.wsService.disconnect();
    this.stopVoice();
  }

  // ── Data loading ───────────────────────────────────────────────────────

  private loadAuction(id: string): void {
    this.syncAuctionState(id, true);
  }

  private syncAuctionState(id: string, initialLoad = false): void {
    forkJoin({
      auction: this.auctionsService.getAuctionById(id).pipe(catchError(() => of(null as AuctionItem | null))),
      bids:    this.auctionsService.getAuctionBids(id).pipe(catchError(() => of([] as AuctionBid[])))
    }).subscribe(({ auction, bids }) => {
      if (!auction) {
        this.loadError.set('Auction not found.');
        this.isLoading.set(false);
        return;
      }

      this.auction.set(auction);
      this.bids.set(this.normaliseBids(bids, auction));
      const suggested = this.suggestedBid(auction);
      const currentBidAmount = this.bidAmount();
      if (currentBidAmount == null || currentBidAmount < suggested) {
        this.bidAmount.set(suggested);
      }

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

  private startLiveSync(auctionId: string): void {
    if (!this.wsSub) {
      this.connectWs(auctionId);
    }
    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        if (this.timerState() !== 'ended') {
          this.syncAuctionState(auctionId);
        }
      }, 5000);
    }
  }

  private connectWs(auctionId: string): void {
    this.wsSub?.unsubscribe();
    this.wsSub = this.wsService.connect(auctionId).subscribe(msg => {
      if (msg.type === 'init') {
        this.wsConnected.set(true);
        const a = this.auction();
        if (a && msg.highest_bid != null) {
          this.auction.set({ ...a, highest_bid: msg.highest_bid });
        }
        if ((msg.bid_count ?? 0) > 0) {
          this.syncAuctionState(auctionId);
        }
      } else if (msg.type === 'new_bid' && msg.bid) {
        this.wsConnected.set(true);
        const a = this.auction();
        if (a) {
          this.auction.set({ ...a, highest_bid: msg.highest_bid ?? a.highest_bid });
        }
        const newBid: AuctionBid = { ...msg.bid, is_top: true };
        const existing = this.bids()
          .filter(bid => bid.id !== newBid.id)
          .map(b => ({ ...b, is_top: false }));
        const auctionState = this.auction();
        if (auctionState) {
          this.bids.set(this.normaliseBids([newBid, ...existing], auctionState));
          const suggested = this.suggestedBid(auctionState);
          const currentBidAmount = this.bidAmount();
          if (currentBidAmount == null || currentBidAmount < suggested) {
            this.bidAmount.set(suggested);
          }
        }
        this.triggerBidFlash();
        setTimeout(() => this.drawGraph(), 100);
      }
    });
  }

  private normaliseBids(bids: AuctionBid[], auction: AuctionItem): AuctionBid[] {
    const sorted = [...bids].sort((a, b) => b.amount - a.amount || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const top = sorted[0]?.amount ?? null;
    return sorted.map(b => ({ ...b, is_top: b.amount === top }));
  }

  private suggestedBid(auction: AuctionItem): number {
    const current = auction.highest_bid ?? auction.base_price;
    return Math.ceil(current + 1);
  }

  // ── Bidding ────────────────────────────────────────────────────────────

  placeBid(): void {
    const a = this.auction();
    const amount = this.bidAmount();
    const userId = this.currentUser?.userId;

    if (!a || !userId || amount == null) return;

    // Use timerState() — derived from real timestamps — as the authoritative check
    if (this.timerState() !== 'active') {
      this.bidError.set('This auction is not currently active.');
      return;
    }

    const minBid = (a.highest_bid ?? a.base_price);
    if (amount <= minBid) {
      this.bidError.set(`Bid must be greater than $${this.formatMoney(minBid)}`);
      return;
    }

    this.isBidding.set(true);
    this.bidError.set(null);

    this.auctionsService.placeBid(a.id, userId, amount).subscribe({
      next: () => {
        this.isBidding.set(false);
        this.bidSuccess.set(true);
        this.syncAuctionState(a.id);
        this.triggerBidFlash();
        setTimeout(() => this.bidSuccess.set(false), 3000);
      },
      error: (err: Error) => {
        this.isBidding.set(false);
        this.bidError.set(err.message.replace('POST bid failed: ', ''));
      }
    });
  }

  adjustBid(delta: number): void {
    const current = this.bidAmount() ?? 0;
    this.bidAmount.set(Math.max(1, current + delta));
  }

  private triggerBidFlash(): void {
    this.bidFlash.set(true);
    setTimeout(() => this.bidFlash.set(false), 800);
  }

  // ── Voice Bidding ──────────────────────────────────────────────────────

  private initVoice(): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition;

    if (!SpeechRecognition) {
      this.voiceSupported.set(false);
      return;
    }

    this.voiceSupported.set(true);
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-AU';
    this.recognition.maxAlternatives = 3;

    this.recognition.onresult = (event: any) => {
      let transcript = '';
      const candidates: string[] = [];

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        transcript += result[0].transcript;
        if (result.isFinal) {
          for (let alt = 0; alt < result.length; alt++) {
            candidates.push(result[alt].transcript);
          }
        }
      }

      this.zone.run(() => {
        this.voiceTranscript.set(transcript);
        if (event.results[event.results.length - 1].isFinal) {
          this.processVoiceCandidates(candidates.length ? candidates : [transcript]);
        }
      });
    };

    this.recognition.onerror = (event: any) => {
      this.zone.run(() => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          this.voiceStatus.set('error');
          this.voiceTranscript.set('Could not understand. Try again.');
          this.voiceDetectedAmount.set(null);
        }
        this.voiceActive.set(false);
        setTimeout(() => {
          this.voiceStatus.set('idle');
          this.voiceTranscript.set('');
        }, 2000);
      });
    };

    this.recognition.onend = () => {
      this.zone.run(() => {
        if (this.voiceStatus() === 'listening') {
          this.voiceStatus.set('idle');
          this.voiceActive.set(false);
        }
      });
    };
  }

  startVoice(event?: PointerEvent): void {
    event?.preventDefault();
    if (!this.voiceSupported() || !this.recognition) return;
    if (this.timerState() !== 'active') return;
    if (this.voiceStatus() === 'listening') return;

    this.voiceActive.set(true);
    this.voiceStatus.set('listening');
    this.voiceTranscript.set('');
    this.voiceDetectedAmount.set(null);

    try {
      this.recognition.start();
    } catch {
      this.recognition.stop();
      setTimeout(() => {
        try { this.recognition.start(); } catch { this.voiceStatus.set('idle'); this.voiceActive.set(false); }
      }, 200);
    }
  }

  stopVoice(event?: PointerEvent): void {
    event?.preventDefault();
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* ignore */ }
    }
    this.voiceActive.set(false);
    if (this.voiceStatus() === 'listening') {
      this.voiceStatus.set('idle');
    }
  }

  private processVoiceCandidates(candidates: string[]): void {
    this.voiceStatus.set('processing');
    const amount = this.extractAmountFromSpeechCandidates(candidates);

    if (amount && amount > 0) {
      this.voiceDetectedAmount.set(amount);
      this.voiceTranscript.set(`Heard $${this.formatMoney(amount)}. Tap Place Bid to confirm.`);
      this.bidAmount.set(amount);
      this.voiceStatus.set('idle');
      this.voiceActive.set(false);
    } else {
      this.voiceDetectedAmount.set(null);
      this.voiceTranscript.set(`Didn't catch a number. Try "bid five hundred".`);
      this.voiceStatus.set('error');
      this.voiceActive.set(false);
      setTimeout(() => {
        this.voiceStatus.set('idle');
        this.voiceTranscript.set('');
      }, 3000);
    }
  }

  private extractAmountFromSpeechCandidates(candidates: string[]): number | null {
    const minBid = this.minBid();
    const parsedAmounts = candidates.flatMap(candidate => this.extractAmountCandidatesFromSpeech(candidate));
    const uniqueParsedAmounts = [...new Set(parsedAmounts)].sort((a, b) => a - b);
    const aboveMinimum = uniqueParsedAmounts.find(amount => amount >= minBid);
    return aboveMinimum ?? uniqueParsedAmounts.at(-1) ?? null;
  }

  private extractAmountCandidatesFromSpeech(text: string): number[] {
    const normalized = text
      .toLowerCase()
      .replace(/[$,]/g, ' ')
      .replace(/\b(?:aud|dollars?|bucks?|bid|offer|for|please|exactly|about|around)\b/g, ' ')
      .replace(/\band\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const directMatch = normalized.match(/(\d+(?:\.\d{1,2})?)/);
    const candidates: number[] = [];
    if (directMatch) {
      const val = parseFloat(directMatch[1]);
      if (!isNaN(val) && val > 0) candidates.push(Math.round(val));
    }

    const wordMap: Record<string, number> = {
      zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
      sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
      twenty: 20, thirty: 30, forty: 40, fifty: 50,
      sixty: 60, seventy: 70, eighty: 80, ninety: 90,
      hundred: 100, thousand: 1000, million: 1_000_000,
      oh: 0, o: 0,
      won: 1, too: 2, to: 2,
      tree: 3, fore: 4, for: 4,
      ate: 8
    };

    const words = normalized.replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
    const digitSequence = words.every(word => wordMap[word] !== undefined && wordMap[word] >= 0 && wordMap[word] <= 9);
    if (digitSequence && words.length > 1) {
      const concatenated = words.map(word => String(wordMap[word])).join('');
      const numeric = Number.parseInt(concatenated, 10);
      if (Number.isFinite(numeric) && numeric > 0) candidates.push(numeric);
    }

    const simpleValues = words
      .map(word => wordMap[word])
      .filter((value): value is number => value !== undefined && value < 100);

    if (simpleValues.length === 2 && simpleValues[0] > 0 && simpleValues[1] > 0) {
      candidates.push(simpleValues[0] * 100 + simpleValues[1]);
    }
    if (
      simpleValues.length === 3 &&
      simpleValues[0] > 0 && simpleValues[0] < 10 &&
      simpleValues[1] >= 20 && simpleValues[1] < 100 &&
      simpleValues[2] > 0 && simpleValues[2] < 10
    ) {
      candidates.push(simpleValues[0] * 100 + simpleValues[1] + simpleValues[2]);
    }

    let total = 0;
    let current = 0;

    for (const word of words) {
      const val = wordMap[word];
      if (val === undefined) continue;
      if (val === 100) {
        current = (current || 1) * 100;
      } else if (val >= 1000) {
        total += (current || 1) * val;
        current = 0;
      } else {
        current += val;
      }
    }
    total += current;
    if (total > 0) candidates.push(total);

    return [...new Set(candidates)].filter(value => value > 0);
  }

  // ── Graph ──────────────────────────────────────────────────────────────

  private drawGraph(): void {
    const canvas = this.graphCanvas?.nativeElement;
    if (!canvas) return;
    const bids = this.bids();
    const a = this.auction();
    if (!a) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const pad = { top: 16, right: 16, bottom: 28, left: 52 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    const points = bids.length > 0
      ? [{ x: 0, y: a.base_price }, ...[...bids].reverse().map((b, i) => ({ x: i + 1, y: b.amount }))]
      : [{ x: 0, y: a.base_price }];

    const minY = Math.min(...points.map(p => p.y)) * 0.98;
    const maxY = Math.max(...points.map(p => p.y)) * 1.02;
    const rangeY = maxY - minY || 1;

    const toX = (i: number) => pad.left + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
    const toY = (v: number) => pad.top + plotH - ((v - minY) / rangeY) * plotH;

    // Grid lines
    ctx.strokeStyle = '#f0f4f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      const val = maxY - (i / 4) * rangeY;
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`$${this.formatMoney(val)}`, pad.left - 6, y + 4);
    }

    if (bids.length === 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '12px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No bids yet', W / 2, H / 2);
      return;
    }

    // Gradient fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, 'rgba(45,123,87,.18)');
    grad.addColorStop(1, 'rgba(45,123,87,0)');

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(points[0].y));
    for (let i = 1; i < points.length; i++) {
      const cpx = (toX(i - 1) + toX(i)) / 2;
      ctx.bezierCurveTo(cpx, toY(points[i - 1].y), cpx, toY(points[i].y), toX(i), toY(points[i].y));
    }
    ctx.lineTo(toX(points.length - 1), pad.top + plotH);
    ctx.lineTo(toX(0), pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(points[0].y));
    for (let i = 1; i < points.length; i++) {
      const cpx = (toX(i - 1) + toX(i)) / 2;
      ctx.bezierCurveTo(cpx, toY(points[i - 1].y), cpx, toY(points[i].y), toX(i), toY(points[i].y));
    }
    ctx.strokeStyle = '#2d7b57';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Dots
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(toX(i), toY(p.y), i === points.length - 1 ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = i === points.length - 1 ? '#2d7b57' : '#fff';
      ctx.strokeStyle = '#2d7b57';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    });
  }

  onCanvasMouseMove(e: MouseEvent): void {
    const canvas = this.graphCanvas?.nativeElement;
    if (!canvas) return;
    const bids = this.bids();
    if (bids.length < 2) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const pad = { left: 52, right: 16 };
    const plotW = rect.width - pad.left - pad.right;
    const points = [...bids].reverse();
    const idx = Math.round(((mx - pad.left) / plotW) * (points.length - 1));
    const clamped = Math.max(0, Math.min(points.length - 1, idx));
    const bid = points[clamped];
    if (!bid) return;

    this.tooltipText.set(`$${this.formatMoney(bid.amount)} — ${this.timeAgo(bid.created_at)}`);
    this.tooltipX.set(e.offsetX + 10);
    this.tooltipY.set(e.offsetY - 28);
    this.tooltipVisible.set(true);
  }

  onCanvasMouseLeave(): void { this.tooltipVisible.set(false); }

  // ── Computed ───────────────────────────────────────────────────────────

  highestBid(): number {
    const a = this.auction();
    return a?.highest_bid ?? a?.base_price ?? 0;
  }

  currentBid(): number { return this.highestBid(); }

  bidDelta(): number {
    const a = this.auction();
    if (!a) return 0;
    return (a.highest_bid ?? 0) - a.base_price;
  }

  bidCount(): number { return this.bids().length; }

  minBid(): number {
    const a = this.auction();
    if (!a) return 1;
    return (a.highest_bid ?? a.base_price) + 1;
  }

  timerState(): 'upcoming' | 'active' | 'ended' {
    const a = this.auction();
    if (!a) return 'ended';
    const now = this.nowTick();
    // Derive purely from timestamps — never trust the status field from the DB
    if (new Date(a.end_time).getTime() <= now) return 'ended';
    if (new Date(a.start_time).getTime() > now) return 'upcoming';
    // start_time has passed and end_time hasn't — it's active regardless of DB status
    if (a.status === 'cancelled') return 'ended';
    return 'active';
  }

  timerParts(): { h: string; m: string; s: string } {
    const a = this.auction();
    if (!a) return { h: '00', m: '00', s: '00' };
    const state = this.timerState();
    const target = state === 'upcoming' ? new Date(a.start_time).getTime() : new Date(a.end_time).getTime();
    const ms = Math.max(0, target - this.nowTick());
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1_000);
    return { h: this.pad(h), m: this.pad(m), s: this.pad(s) };
  }

  timerUrgency(): 'normal' | 'warning' | 'danger' {
    const a = this.auction();
    if (!a) return 'normal';
    const ms = new Date(a.end_time).getTime() - this.nowTick();
    if (ms < 300_000) return 'danger';
    if (ms < 1_800_000) return 'warning';
    return 'normal';
  }

  displayStatus(): string {
    const s = this.timerState();
    if (s === 'active') return 'Live';
    if (s === 'upcoming') return 'Upcoming';
    return 'Ended';
  }

  statusClass(): string {
    const s = this.timerState();
    if (s === 'active') return 'badge-live';
    if (s === 'upcoming') return 'badge-upcoming';
    return 'badge-ended';
  }

  isMyTopBid(): boolean {
    const userId = this.currentUser?.userId;
    if (!userId || !this.bids().length) return false;
    return this.bids()[0]?.bidder_id === userId;
  }

  didIWinAuction(): boolean {
    const userId = this.currentUser?.userId;
    const auction = this.auction();
    if (!userId || !auction || this.timerState() !== 'ended') return false;
    return auction.winner_id === userId;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  formatMoney(v: number | null | undefined): string {
    if (v == null) return '0';
    return v.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  formatDate(iso: string): string {
    return formatAuctionDateTime(iso);
  }

  timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
  }

  trackBid(_: number, b: AuctionBid): string { return b.id; }

  goBack(): void { this.router.navigate(['/bidder/dashboard']); }

  private pad(n: number): string { return n.toString().padStart(2, '0'); }
}
