import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuctionProfileResponse {
  exists?: boolean;
  id?: string;
  user_id?: string;
  abn?: string;
  business_name?: string;
  gst_registered?: boolean;
  bsb_masked?: string;
  account_number_masked?: string;
  status?: string;
}

export interface AuctionBid {
  id: string;
  auction_id: string;
  bidder_id: string;
  bidder_name: string;
  bidder_initials: string;
  amount: number;
  created_at: string;
  is_top?: boolean;
}

export interface AuctionItem {
  id: string;
  produce_name: string;
  quantity: number;
  unit: string;
  base_price: number;
  status: 'upcoming' | 'active' | 'ended' | 'cancelled';
  start_time: string;
  end_time: string;
  winner_id: string | null;
  final_price: number | null;
  highest_bid: number | null;
  image_url: string | null;
}

export interface AuctionDashboardSummary {
  registered: boolean;
  profile?: {
    business_name: string;
    status: string;
    gst_registered: boolean;
  };
  stats: {
    active: number;
    upcoming: number;
    ended: number;
    total_revenue?: number;
  };
}

export interface CreateAuctionRequest {
  user_id: string;
  produce_name: string;
  quantity: number;
  unit: string;
  base_price: number;
  start_time: string;
  end_time: string;
  image_url?: string | null;
}

export interface CreateAuctionResponse {
  id: string;
  status: 'upcoming' | 'active' | 'ended' | 'cancelled';
  produce_name: string;
  quantity: number;
  unit: string;
  base_price: number;
  start_time: string;
  end_time: string;
}

export interface BidderDashboardStats {
  active_auctions: number;
  upcoming_auctions: number;
  my_total_bids: number;
  my_winning_bids: number;
  auctions_won: number;
}

@Injectable({ providedIn: 'root' })
export class AuctionsService {
  private readonly baseUrl = `${environment.apiBaseUrl.replace(/\/$/, '')}/api`;

  constructor(private http: HttpClient) { }

  getProfile(userId: string): Observable<AuctionProfileResponse> {
    return this.http
      .get<AuctionProfileResponse>(`${this.baseUrl}/auctions/profile/${userId}`)
      .pipe(catchError(error => this.handleError('GET auction profile', error)));
  }

  createProfile(payload: {
    user_id: string;
    abn: string;
    business_name: string;
    gst_registered: boolean;
    bsb: string;
    account_number: string;
  }): Observable<AuctionProfileResponse> {
    return this.http
      .post<AuctionProfileResponse>(`${this.baseUrl}/auctions/profile`, payload)
      .pipe(catchError(error => this.handleError('POST auction profile', error)));
  }

  getDashboard(userId: string): Observable<AuctionDashboardSummary> {
    return this.http
      .get<AuctionDashboardSummary>(`${this.baseUrl}/auctions/dashboard/${userId}`)
      .pipe(catchError(error => this.handleError('GET auction dashboard', error)));
  }

  getMyAuctions(userId: string, status: 'all' | 'active' | 'upcoming' | 'ended' | 'cancelled' = 'all'): Observable<AuctionItem[]> {
    return this.http
      .get<AuctionItem[]>(`${this.baseUrl}/auctions/my/${userId}?status=${status}`)
      .pipe(catchError(error => this.handleError('GET my auctions', error)));
  }

  createAuction(payload: CreateAuctionRequest): Observable<CreateAuctionResponse> {
    return this.http
      .post<CreateAuctionResponse>(`${this.baseUrl}/auctions`, payload)
      .pipe(catchError(error => this.handleError('POST auction', error)));
  }

  getAuctionBids(auctionId: string): Observable<AuctionBid[]> {
    return this.http
      .get<AuctionBid[]>(`${this.baseUrl}/auctions/${auctionId}/bids`)
      .pipe(catchError(error => this.handleError('GET auction bids', error)));
  }

  getAuctionById(auctionId: string): Observable<AuctionItem> {
    return this.http
      .get<AuctionItem>(`${this.baseUrl}/auctions/${auctionId}`)
      .pipe(catchError(error => this.handleError('GET auction by id', error)));
  }

  getAllAuctions(status: 'all' | 'active' | 'upcoming' | 'ended' = 'all'): Observable<AuctionItem[]> {
    return this.http
      .get<AuctionItem[]>(`${this.baseUrl}/auctions/all?status=${status}`)
      .pipe(catchError(error => this.handleError('GET all auctions', error)));
  }

  getBidderDashboard(userId: string): Observable<BidderDashboardStats> {
    return this.http
      .get<BidderDashboardStats>(`${this.baseUrl}/auctions/bidder/dashboard/${userId}`)
      .pipe(catchError(error => this.handleError('GET bidder dashboard', error)));
  }

  placeBid(auctionId: string, bidderId: string, amount: number): Observable<{ id: string; bid_amount: number; created_at: string }> {
    return this.http
      .post<{ id: string; bid_amount: number; created_at: string }>(`${this.baseUrl}/auctions/${auctionId}/bids`, {
        bidder_id: bidderId,
        bid_amount: amount
      })
      .pipe(catchError(error => this.handleError('POST bid', error)));
  }

  private handleError(operation: string, error: HttpErrorResponse): Observable<never> {
    const detail = typeof error.error?.detail === 'string' ? error.error.detail : error.message;
    return throwError(() => new Error(`${operation} failed: ${detail}`));
  }
}
