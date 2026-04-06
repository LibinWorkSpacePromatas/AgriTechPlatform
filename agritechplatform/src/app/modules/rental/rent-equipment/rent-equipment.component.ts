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

  selectedListingId: string | null = null;
  bookingStart = '';
  bookingEnd = '';
  bookingStartDate = '';
  bookingEndDate = '';
  bookingStartTime = '';
  bookingEndTime = '';
  bookingQuantity = 1;
  availability: CheckAvailabilityResponse | null = null;
  calendarSlots: RentalCalendarSlot[] = [];
  calendarDate = '';
  nextAvailableSlot: string | null = null;
  myBookings: RentalBooking[] = [];
  recommendation: RentalRecommendationResponse | null = null;
  recommendationLoading = false;
  blockId: string | null = null;
  toastVisible = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

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
    const currentUser = this.authService.getCurrentUser();
    this.rentalService.getListings(
      this.lat ?? undefined,
      this.lon ?? undefined,
      this.radiusKm,
      currentUser?.userId
    ).subscribe({
      next: response => {
        console.log('LISTINGS:', response);
        this.listings = response;
        this.loading = false;
      },
      error: err => {
        this.error = err.message || 'Unable to load listings';
        this.notifyError(this.error ?? 'Unable to load listings');
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
    this.onPriceFilterChange();
    this.appliedMachineSearchTerm = this.machineSearchTerm;
  }

  onPriceFilterChange(): void {
    if (this.minPrice < 0) {
      this.minPrice = 0;
    }
    if (this.maxPrice < 0) {
      this.maxPrice = 0;
    }
    if (this.maxPrice < this.minPrice) {
      this.maxPrice = this.minPrice;
    }
  }

  getBookingValidationError(listing: RentalListing): string | null {
    const now = new Date();
    const minStart = new Date(now.getTime() + 30 * 60 * 1000);

    if (listing.price_type === 'daily') {
      if (!this.bookingStartDate || !this.bookingEndDate || !this.bookingStartTime || !this.bookingEndTime) {
        return 'Select start/end date and time';
      }
      const start = new Date(`${this.bookingStartDate}T${this.bookingStartTime}:00`);
      const end = new Date(`${this.bookingEndDate}T${this.bookingEndTime}:00`);
      if (start < minStart) {
        return 'Start time must be at least 30 minutes from now';
      }
      if (end <= start) {
        return 'End date/time must be later than start';
      }
      return null;
    }

    if (!this.bookingStart || !this.bookingEnd) {
      return 'Select start and end date/time';
    }
    const start = new Date(this.bookingStart);
    const end = new Date(this.bookingEnd);
    if (start < minStart) {
      return 'Start time must be at least 30 minutes from now';
    }
    if (end <= start) {
      return 'End time must be later than start time';
    }
    return null;
  }

  canBook(listing: RentalListing): boolean {
    const hasValidWindow = !this.getBookingValidationError(listing);
    const hasValidQuantity = this.bookingQuantity >= 1 && this.bookingQuantity <= this.getAvailableUnits(listing);
    const hasAvailability = this.selectedListingId !== listing.id || this.availability?.available !== false;
    return hasValidWindow && hasValidQuantity && hasAvailability;
  }

  onTimeChange(listing: RentalListing): void {
    this.selectedListingId = listing.id;
    if (!this.bookingQuantity || this.bookingQuantity < 1) {
      this.bookingQuantity = 1;
    }
    const availableUnits = this.getAvailableUnits(listing);
    if (this.bookingQuantity > availableUnits) {
      this.bookingQuantity = availableUnits;
    }
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
      quantity_requested: this.bookingQuantity,
    };

    this.rentalService.checkAvailability(payload).subscribe({
      next: res => this.availability = res,
      error: err => {
        this.error = err.message || 'Availability check failed';
        this.notifyError(this.error ?? 'Availability check failed');
      },
    });
  }

  onBookingInputChange(listing: RentalListing): void {
    // Recheck live stock whenever booking window/quantity changes.
    this.onTimeChange(listing);
  }

  bookNow(listing: RentalListing): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.error = 'No active user selected';
      this.notifyError(this.error ?? 'No active user selected');
      return;
    }

    const validationError = this.getBookingValidationError(listing);
    if (validationError) {
      this.error = validationError;
      this.notifyError(this.error ?? 'Invalid booking input');
      return;
    }

    const window = this.buildBookingWindow(listing);
    if (!window) {
      this.error = 'Select valid start/end date and time';
      this.notifyError(this.error ?? 'Select valid start/end date and time');
      return;
    }

    const availabilityPayload: CheckAvailabilityPayload = {
      listing_id: listing.id,
      start_datetime: window.start,
      end_datetime: window.end,
      quantity_requested: this.bookingQuantity,
    };
    this.rentalService.checkAvailability(availabilityPayload).subscribe({
      next: availabilityRes => {
        this.availability = availabilityRes;
        if (!availabilityRes.available) {
          this.error = `Not available: ${availabilityRes.reason || 'Overlapping / Buffer'}`;
          this.notifyError(this.error ?? 'Not available');
          return;
        }

        const payload: CreateBookingPayload = {
          listing_id: listing.id,
          start_datetime: window.start,
          end_datetime: window.end,
          quantity_requested: this.bookingQuantity,
        };
        this.rentalService.createBooking(user.userId, payload).subscribe({
          next: res => {
            this.info = `Booking requested (${res.booking.status}) - ${res.booking.quantity_requested} unit(s), total amount ${res.booking.total_price || 0}`;
            this.notifySuccess(this.info);
            this.availability = {
              listing_id: listing.id,
              available: true,
              conflict: false,
              reason: null,
              available_quantity: availabilityRes.available_quantity,
            };
            this.myBookings.unshift(res.booking);
            this.loadMyBookings();
            this.calendarDate = new Date(window.start).toISOString().slice(0, 10);
            this.loadCalendar(listing.id, this.calendarDate);
            // Refresh live availability after successful booking so remaining stock is updated immediately.
            this.onTimeChange(listing);
          },
          error: err => {
            this.error = err.message || 'Booking failed';
            this.notifyError(this.error ?? 'Booking failed');
            this.availability = { listing_id: listing.id, available: false, conflict: true, reason: null };
          },
        });
      },
      error: err => {
        this.error = err.message || 'Availability check failed';
        this.notifyError(this.error ?? 'Availability check failed');
      },
    });
  }

  getBookingSummary(listing: RentalListing): { start: Date; end: Date; duration: string; total: number; billingLine: string; rateLabel: string } | null {
    const window = this.buildBookingWindow(listing);
    if (!window) {
      return null;
    }
    const start = new Date(window.start);
    const end = new Date(window.end);
    const hours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
    const duration = `${hours.toFixed(2)} hour(s)`;
    const effectiveHourlyRate = listing.price_type === 'daily' ? listing.price / 24 : listing.price;
    const billedUnits = hours;
    const baseTotal = billedUnits * effectiveHourlyRate;
    const total = baseTotal * this.bookingQuantity;
    const rateLabel = listing.price_type === 'daily'
      ? `${effectiveHourlyRate.toFixed(2)} / hour (converted from ${listing.price.toFixed(2)} / day)`
      : `${listing.price.toFixed(2)} / hour`;
    const billingLine = `${billedUnits.toFixed(2)} hour(s) x ${this.bookingQuantity} unit(s) x ${effectiveHourlyRate.toFixed(2)}`;
    return { start, end, duration, total, billingLine, rateLabel };
  }

  onQuantityChange(listing: RentalListing): void {
    if (!this.bookingQuantity || this.bookingQuantity < 1) {
      this.bookingQuantity = 1;
    }
    const availableUnits = this.getAvailableUnits(listing);
    if (this.bookingQuantity > availableUnits) {
      this.bookingQuantity = availableUnits;
    }
    if (this.selectedListingId === listing.id) {
      this.onTimeChange(listing);
    }
  }

  getAvailableUnits(listing: RentalListing): number {
    if (this.selectedListingId === listing.id && this.availability?.available_quantity != null) {
      return Math.max(0, this.availability.available_quantity);
    }
    return listing.quantity_total || 1;
  }

  hasLiveAvailability(listing: RentalListing): boolean {
    return this.selectedListingId === listing.id && this.availability?.available_quantity != null;
  }

  private buildBookingWindow(listing: RentalListing): { start: string; end: string } | null {
    if (listing.price_type === 'daily') {
      if (!this.bookingStartDate || !this.bookingEndDate || !this.bookingStartTime || !this.bookingEndTime) {
        return null;
      }
      const start = new Date(`${this.bookingStartDate}T${this.bookingStartTime}:00`);
      const end = new Date(`${this.bookingEndDate}T${this.bookingEndTime}:00`);
      if (start >= end) {
        return null;
      }
      return {
        start: start.toISOString(),
        end: end.toISOString(),
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
        const nextSlot = response.slots.find(slot => slot.status === 'available' && !this.isPastSlot(slot));
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

  private notifyError(message: string): void {
    this.showToast(this.cleanMessage(message), 'error');
  }

  private notifySuccess(message: string): void {
    this.showToast(this.cleanMessage(message), 'success');
  }

  private cleanMessage(message: string): string {
    const marker = ' failed: ';
    if (message.includes(marker)) {
      return message.split(marker).pop() || message;
    }
    return message;
  }

  closeToast(): void {
    this.toastVisible = false;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      this.toastVisible = false;
      this.toastTimer = null;
    }, type === 'error' ? 5000 : 3200);
  }

  isPastSlot(slot: RentalCalendarSlot): boolean {
    return new Date(slot.end_datetime).getTime() <= Date.now();
  }

  getSlotDisplayStatus(slot: RentalCalendarSlot): 'PAST' | 'BOOKED' | 'BUFFER' | 'AVAILABLE' {
    if (this.isPastSlot(slot)) {
      return 'PAST';
    }
    if (slot.status === 'booked') {
      return 'BOOKED';
    }
    if (slot.status === 'buffer') {
      return 'BUFFER';
    }
    return 'AVAILABLE';
  }

}
