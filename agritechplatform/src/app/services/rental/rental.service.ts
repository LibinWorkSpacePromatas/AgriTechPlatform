import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export type RentalPriceType = 'hourly' | 'daily';
export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface RentalDashboardResponse {
  total_listings: number;
  active_listings: number;
  inactive_listings: number;
  bookings_given: number;
  bookings_taken: number;
  pending_requests: number;
  upcoming_bookings: number;
  revenue: number;
}

export interface RentalListing {
  id: string;
  owner_id: string;
  block_id: string | null;
  equipment_name: string;
  description: string | null;
  specifications?: Record<string, string> | null;
  price: number;
  price_type: RentalPriceType;
  quantity_total: number;
  image_url?: string | null;
  image_public_id?: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  created_at: string;
  distance_m?: number | null;
  owner_name?: string | null;
  location_label?: string | null;
  bookings_count?: number | null;
}

export interface CreateListingPayload {
  equipment_name: string;
  description?: string | null;
  specifications?: Record<string, string> | null;
  price: number;
  price_type: RentalPriceType;
  quantity_total?: number;
  image?: File;
  latitude?: number | null;
  longitude?: number | null;
  block_id?: string | null;
}

export interface RentalBooking {
  id: string;
  listing_id: string;
  renter_id: string;
  owner_id: string;
  start_datetime: string;
  end_datetime: string;
  quantity_requested: number;
  status: BookingStatus;
  total_price: number | null;
  created_at: string;
  equipment_name?: string;
  listing_is_active?: boolean;
  owner_name?: string;
  renter_name?: string;
}

export interface CheckAvailabilityPayload {
  listing_id: string;
  start_datetime: string;
  end_datetime: string;
  quantity_requested?: number;
}

export interface CheckAvailabilityResponse {
  listing_id: string;
  available: boolean;
  conflict: boolean;
  reason?: string | null;
  requested_quantity?: number;
  available_quantity?: number | null;
}

export interface CreateBookingPayload {
  listing_id: string;
  start_datetime: string;
  end_datetime: string;
  quantity_requested?: number;
}

export interface RentalRecommendationListing {
  id: string;
  equipment_name: string;
  price: number;
  price_type: RentalPriceType;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;
}

export interface RentalRecommendationResponse {
  block_id: string;
  recommendations: string[];
  reason: string;
  weather_guardrail: string | null;
  reasons: string[];
  has_irrigation_equipment: boolean;
  listings: RentalRecommendationListing[];
}

export interface RentalCalendarSlot {
  start_datetime: string;
  end_datetime: string;
  status: 'booked' | 'buffer' | 'available';
}

export interface RentalCalendarResponse {
  listing_id: string;
  date: string;
  slots: RentalCalendarSlot[];
}

interface BookingActionResponse {
  booking: RentalBooking;
  availability: boolean;
}

interface BookingPaymentResponse {
  booking: RentalBooking;
  payment_status: string;
}

@Injectable({
  providedIn: 'root'
})
export class RentalService {
  private readonly baseUrl = `${environment.apiBaseUrl.replace(/\/$/, '')}/api/rental`;

  constructor(private http: HttpClient) { }

  getDashboard(userId: string): Observable<RentalDashboardResponse> {
    return this.http
      .get<RentalDashboardResponse>(`${this.baseUrl}/dashboard`, { params: new HttpParams().set('user_id', userId) })
      .pipe(catchError(error => this.handleError('GET /api/rental/dashboard', error)));
  }

  createListing(userId: string, payload: CreateListingPayload): Observable<RentalListing> {
    const formData = this.buildListingFormData(payload);
    return this.http
      .post<RentalListing>(`${this.baseUrl}/listings`, formData, { params: new HttpParams().set('user_id', userId) })
      .pipe(catchError(error => this.handleError('POST /api/rental/listings', error)));
  }

  updateListing(userId: string, listingId: string, payload: CreateListingPayload): Observable<RentalListing> {
    const formData = this.buildListingFormData(payload);
    return this.http
      .patch<RentalListing>(`${this.baseUrl}/listings/${listingId}`, formData, { params: new HttpParams().set('user_id', userId) })
      .pipe(catchError(error => this.handleError('PATCH /api/rental/listings/{id}', error)));
  }

  getMyListings(userId: string): Observable<RentalListing[]> {
    return this.http
      .get<RentalListing[]>(`${this.baseUrl}/my-listings`, { params: new HttpParams().set('user_id', userId) })
      .pipe(catchError(error => this.handleError('GET /api/rental/my-listings', error)));
  }

  getListings(lat?: number, lon?: number, radiusKm?: number, userId?: string): Observable<RentalListing[]> {
    let params = new HttpParams();
    if (lat != null && lon != null && radiusKm != null) {
      params = params.set('lat', lat).set('lon', lon).set('radius', radiusKm);
    }
    if (userId) {
      params = params.set('user_id', userId);
    }

    return this.http
      .get<RentalListing[]>(`${this.baseUrl}/listings`, { params })
      .pipe(catchError(error => this.handleError('GET /api/rental/listings', error)));
  }

  toggleListing(listingId: string, userId: string): Observable<RentalListing> {
    return this.http
      .patch<{ listing: RentalListing }>(`${this.baseUrl}/listings/${listingId}/toggle`, {}, { params: new HttpParams().set('user_id', userId) })
      .pipe(
        map(response => response.listing),
        catchError(error => this.handleError('PATCH /api/rental/listings/{id}/toggle', error))
      );
  }

  checkAvailability(payload: CheckAvailabilityPayload): Observable<CheckAvailabilityResponse> {
    return this.http
      .post<CheckAvailabilityResponse>(`${this.baseUrl}/check-availability`, payload)
      .pipe(catchError(error => this.handleError('POST /api/rental/check-availability', error)));
  }

  createBooking(userId: string, payload: CreateBookingPayload): Observable<BookingActionResponse> {
    return this.http
      .post<BookingActionResponse>(`${this.baseUrl}/book`, payload, { params: new HttpParams().set('user_id', userId) })
      .pipe(catchError(error => this.handleError('POST /api/rental/book', error)));
  }

  getMyBookings(userId: string): Observable<RentalBooking[]> {
    return this.http
      .get<RentalBooking[]>(`${this.baseUrl}/my-bookings`, { params: new HttpParams().set('user_id', userId) })
      .pipe(catchError(error => this.handleError('GET /api/rental/my-bookings', error)));
  }

  getRequests(userId: string): Observable<RentalBooking[]> {
    return this.http
      .get<RentalBooking[]>(`${this.baseUrl}/requests`, { params: new HttpParams().set('user_id', userId) })
      .pipe(catchError(error => this.handleError('GET /api/rental/requests', error)));
  }

  approveBooking(userId: string, bookingId: string): Observable<RentalBooking> {
    return this.http
      .post<BookingActionResponse>(`${this.baseUrl}/bookings/${bookingId}/approve`, {}, { params: new HttpParams().set('user_id', userId) })
      .pipe(
        map(response => response.booking),
        catchError(error => this.handleError('POST /api/rental/bookings/{id}/approve', error))
      );
  }

  rejectBooking(userId: string, bookingId: string): Observable<RentalBooking> {
    return this.http
      .post<RentalBooking>(`${this.baseUrl}/bookings/${bookingId}/reject`, {}, { params: new HttpParams().set('user_id', userId) })
      .pipe(catchError(error => this.handleError('POST /api/rental/bookings/{id}/reject', error)));
  }

  payBooking(userId: string, bookingId: string): Observable<RentalBooking> {
    return this.http
      .post<BookingPaymentResponse>(`${this.baseUrl}/pay/${bookingId}`, {}, { params: new HttpParams().set('user_id', userId) })
      .pipe(
        map(response => response.booking),
        catchError(error => this.handleError('POST /api/rental/pay/{id}', error))
      );
  }

  getListingCalendar(listingId: string, date: string): Observable<RentalCalendarResponse> {
    return this.http
      .get<RentalCalendarResponse>(`${this.baseUrl}/listings/${listingId}/calendar`, {
        params: new HttpParams().set('date', date),
      })
      .pipe(catchError(error => this.handleError('GET /api/rental/listings/{id}/calendar', error)));
  }

  getRecommendations(blockId: string): Observable<RentalRecommendationResponse> {
    return this.http
      .get<RentalRecommendationResponse>(`${this.baseUrl}/recommendations/${blockId}`)
      .pipe(catchError(error => this.handleError('GET /api/rental/recommendations/{blockId}', error)));
  }

  private buildListingFormData(payload: CreateListingPayload): FormData {
    const formData = new FormData();
    formData.append('equipment_name', payload.equipment_name);
    formData.append('price', String(payload.price));
    formData.append('price_type', payload.price_type);
    formData.append('quantity_total', String(payload.quantity_total ?? 1));

    if (payload.description) {
      formData.append('description', payload.description);
    }
    if (payload.specifications && Object.keys(payload.specifications).length) {
      formData.append('specifications', JSON.stringify(payload.specifications));
    }
    if (payload.latitude != null) {
      formData.append('latitude', String(payload.latitude));
    }
    if (payload.longitude != null) {
      formData.append('longitude', String(payload.longitude));
    }
    if (payload.block_id) {
      formData.append('block_id', payload.block_id);
    }
    if (payload.image) {
      formData.append('image', payload.image, payload.image.name);
    }

    return formData;
  }

  private handleError(operation: string, error: HttpErrorResponse): Observable<never> {
    const detail = typeof error.error?.detail === 'string' ? error.error.detail : error.message;
    return throwError(() => new Error(`${operation} failed: ${detail}`));
  }
}
