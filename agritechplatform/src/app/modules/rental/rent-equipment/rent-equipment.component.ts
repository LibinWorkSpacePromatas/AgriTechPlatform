import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { BlockService } from '../../../shared/services/block.service';
import {
  CheckAvailabilityResponse,
  CheckAvailabilityPayload,
  CreateBookingPayload,
  RentalBooking,
  RentalCalendarSlot,
  RentalListing,
  RentalPriceType,
  RentalRecommendationResponse,
  RentalService,
} from '../../../services/rental/rental.service';

@Component({
  selector: 'app-rent-equipment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rent-equipment.component.html',
  styleUrl: './rent-equipment.component.css'
})
export class RentEquipmentComponent implements OnInit {
  listings: RentalListing[] = [];
  loading = false;
  error: string | null = null;
  info: string | null = null;

  lat: number | null = null;
  lon: number | null = null;
  radiusKm = 50;
  minPrice = 0;
  maxPrice = 100000;
  typeFilter: '' | RentalPriceType = '';
  machineSearchTerm = '';
  appliedMachineSearchTerm = '';
  detailsModalListing: RentalListing | null = null;
  bookingModalListing: RentalListing | null = null;

  selectedListingId: string | null = null;
  bookingStart = '';
  bookingEnd = '';
  bookingStartDate = '';
  bookingEndDate = '';
  availability: CheckAvailabilityResponse | null = null;
  calendarSlots: RentalCalendarSlot[] = [];
  calendarDate = '';
  nextAvailableSlot: string | null = null;
  myBookings: RentalBooking[] = [];
  recommendation: RentalRecommendationResponse | null = null;
  recommendationLoading = false;
  blockId: string | null = null;

  constructor(
    private rentalService: RentalService,
    private authService: AuthService,
    private blockService: BlockService,
  ) { }

  ngOnInit(): void {
    const selectedBlock = this.blockService.getSelectedBlock();
    const user = this.authService.getCurrentUser();
    const userBlock = user?.blocks?.[0] as any;
    this.lat = selectedBlock?.lat ?? userBlock?.latitude ?? null;
    this.lon = selectedBlock?.lon ?? userBlock?.longitude ?? null;
    this.blockId = selectedBlock?.lan ?? userBlock?.lanslu ?? userBlock?.id ?? null;
    if (this.blockId) {
      this.loadRecommendations(this.blockId);
    }
    this.loadMyBookings();
    this.loadListings();
  }

  loadListings(): void {
    this.loading = true;
    this.error = null;
    this.rentalService.getListings(this.lat ?? undefined, this.lon ?? undefined, this.radiusKm).subscribe({
      next: response => {
        this.listings = response;
        this.loading = false;
      },
      error: err => {
        this.error = err.message || 'Unable to load listings';
        this.loading = false;
      },
    });
  }

  get filteredListings(): RentalListing[] {
    const search = this.appliedMachineSearchTerm.trim().toLowerCase();
    return this.listings.filter(listing => {
      const typeMatch = !this.typeFilter || listing.price_type === this.typeFilter;
      const priceMatch = listing.price >= this.minPrice && listing.price <= this.maxPrice;
      const machineMatch = !search
        || listing.equipment_name.toLowerCase().includes(search)
        || (listing.description || '').toLowerCase().includes(search);
      return typeMatch && priceMatch && machineMatch;
    });
  }

  applyMachineSearch(): void {
    this.appliedMachineSearchTerm = this.machineSearchTerm;
  }

  openDetails(listing: RentalListing): void {
    this.detailsModalListing = listing;
  }

  closeDetailsModal(): void {
    this.detailsModalListing = null;
  }

  openBooking(listing: RentalListing): void {
    this.bookingModalListing = listing;
    this.selectedListingId = listing.id;
    this.availability = null;
    this.info = null;
    this.error = null;
    this.bookingStart = '';
    this.bookingEnd = '';
    this.bookingStartDate = '';
    this.bookingEndDate = '';
    this.calendarDate = new Date().toISOString().slice(0, 10);
    this.detailsModalListing = null;
    this.loadCalendar(listing.id, this.calendarDate);
  }

  closeBookingModal(): void {
    this.bookingModalListing = null;
    this.selectedListingId = null;
    this.availability = null;
    this.calendarSlots = [];
    this.nextAvailableSlot = null;
    this.bookingStart = '';
    this.bookingEnd = '';
    this.bookingStartDate = '';
    this.bookingEndDate = '';
  }

  onTimeChange(listing: RentalListing): void {
    this.selectedListingId = listing.id;
    this.availability = null;
    this.info = null;
    const window = this.buildBookingWindow(listing);
    this.calendarDate = window?.start ? new Date(window.start).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    this.loadCalendar(listing.id, this.calendarDate);

    if (!window) {
      return;
    }

    const payload: CheckAvailabilityPayload = {
      listing_id: listing.id,
      start_datetime: window.start,
      end_datetime: window.end,
    };

    this.rentalService.checkAvailability(payload).subscribe({
      next: res => this.availability = res,
      error: err => this.error = err.message || 'Availability check failed',
    });
  }

  bookNow(listing: RentalListing): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.error = 'No active user selected';
      return;
    }

    const window = this.buildBookingWindow(listing);
    if (!window) {
      this.error = listing.price_type === 'daily' ? 'Select start and end date' : 'Select start and end time';
      return;
    }

    const payload: CreateBookingPayload = {
      listing_id: listing.id,
      start_datetime: window.start,
      end_datetime: window.end,
    };

    this.rentalService.createBooking(user.userId, payload).subscribe({
      next: res => {
        this.info = `Booking requested (${res.booking.status})`;
        this.availability = { listing_id: listing.id, available: true, conflict: false, reason: null };
        this.myBookings.unshift(res.booking);
        this.loadMyBookings();
        this.calendarDate = new Date(window.start).toISOString().slice(0, 10);
        this.loadCalendar(listing.id, this.calendarDate);
        this.closeBookingModal();
      },
      error: err => {
        this.error = err.message || 'Booking failed';
        this.availability = { listing_id: listing.id, available: false, conflict: true, reason: null };
      },
    });
  }

  getBookingSummary(listing: RentalListing): { start: Date; end: Date; duration: string; total: number } | null {
    const window = this.buildBookingWindow(listing);
    if (!window) {
      return null;
    }
    const start = new Date(window.start);
    const end = new Date(window.end);
    const hours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
    const duration = listing.price_type === 'daily'
      ? `${Math.ceil(hours / 24)} day(s)`
      : `${hours.toFixed(1)} hour(s)`;
    const total = listing.price_type === 'daily'
      ? Math.ceil(hours / 24) * listing.price
      : hours * listing.price;
    return { start, end, duration, total };
  }

  private buildBookingWindow(listing: RentalListing): { start: string; end: string } | null {
    if (listing.price_type === 'daily') {
      if (!this.bookingStartDate || !this.bookingEndDate) {
        return null;
      }
      const start = new Date(`${this.bookingStartDate}T00:00:00`);
      const endBase = new Date(`${this.bookingEndDate}T00:00:00`);
      endBase.setDate(endBase.getDate() + 1);
      if (start >= endBase) {
        return null;
      }
      return {
        start: start.toISOString(),
        end: endBase.toISOString(),
      };
    }

    if (!this.bookingStart || !this.bookingEnd) {
      return null;
    }
    const start = new Date(this.bookingStart);
    const end = new Date(this.bookingEnd);
    if (start >= end) {
      return null;
    }
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  private loadMyBookings(): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      return;
    }
    this.rentalService.getMyBookings(user.userId).subscribe({
      next: bookings => {
        this.myBookings = bookings;
      },
      error: () => {
        this.myBookings = [];
      },
    });
  }

  private loadCalendar(listingId: string, date: string): void {
    this.rentalService.getListingCalendar(listingId, date).subscribe({
      next: response => {
        this.calendarSlots = response.slots;
        const nextSlot = response.slots.find(slot => slot.status === 'available');
        this.nextAvailableSlot = nextSlot ? new Date(nextSlot.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
      },
      error: () => {
        this.calendarSlots = [];
        this.nextAvailableSlot = null;
      },
    });
  }

  private loadRecommendations(blockId: string): void {
    this.recommendationLoading = true;
    this.rentalService.getRecommendations(blockId).subscribe({
      next: response => {
        this.recommendation = response;
        this.recommendationLoading = false;
      },
      error: () => {
        this.recommendation = null;
        this.recommendationLoading = false;
      },
    });
  }
}
