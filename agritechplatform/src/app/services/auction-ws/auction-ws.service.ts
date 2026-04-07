import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface WsMessage {
  type: 'init' | 'new_bid' | 'pong' | string;
  auction_id?: string;
  status?: string;
  highest_bid?: number | null;
  base_price?: number;
  bid_count?: number;
  bid?: {
    id: string;
    auction_id: string;
    bidder_id: string;
    bidder_name: string;
    bidder_initials: string;
    amount: number;
    created_at: string;
    is_top: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class AuctionWsService implements OnDestroy {
  private ws: WebSocket | null = null;
  private readonly messages$ = new Subject<WsMessage>();
  private pingInterval?: ReturnType<typeof setInterval>;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;
  private currentAuctionId: string | null = null;
  private destroyed = false;

  constructor(private zone: NgZone) {}

  connect(auctionId: string): Observable<WsMessage> {
    this.currentAuctionId = auctionId;
    this._open(auctionId);
    return this.messages$.asObservable();
  }

  disconnect(): void {
    this.currentAuctionId = null;
    this._cleanup();
  }

  private _open(auctionId: string): void {
    this._cleanup();
    if (this.destroyed) return;

    const wsBase = environment.apiBaseUrl
      .replace(/^https?:\/\//, (m) => (m.startsWith('https') ? 'wss://' : 'ws://'))
      .replace(/\/$/, '');

    const url = `${wsBase}/api/auctions/${auctionId}/ws`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this._scheduleReconnect(auctionId);
      return;
    }

    this.ws.onmessage = (event) => {
      try {
        const data: WsMessage = JSON.parse(event.data);
        this.zone.run(() => this.messages$.next(data));
      } catch { /* ignore malformed */ }
    };

    this.ws.onopen = () => {
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25_000);
    };

    this.ws.onclose = () => {
      clearInterval(this.pingInterval);
      if (!this.destroyed && this.currentAuctionId === auctionId) {
        this._scheduleReconnect(auctionId);
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private _scheduleReconnect(auctionId: string): void {
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      if (!this.destroyed && this.currentAuctionId === auctionId) {
        this._open(auctionId);
      }
    }, 3000);
  }

  private _cleanup(): void {
    clearInterval(this.pingInterval);
    clearTimeout(this.reconnectTimeout);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this._cleanup();
    this.messages$.complete();
  }
}
