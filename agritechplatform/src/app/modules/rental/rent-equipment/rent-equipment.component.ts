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
  availability: CheckAvailabilityResponse | null = null;
  calendarSlots: RentalCalendarSlot[] = [];
  calendarDate = '';
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
        console.log('LISTINGS:', response);
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

  onTimeChange(listingId: string): void {
    this.selectedListingId = listingId;
    this.availability = null;
    this.info = null;
    this.calendarDate = this.bookingStart ? new Date(this.bookingStart).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    this.loadCalendar(listingId, this.calendarDate);

    if (!this.bookingStart || !this.bookingEnd) {
      return;
    }

    const payload: CheckAvailabilityPayload = {
      listing_id: listingId,
      start_datetime: new Date(this.bookingStart).toISOString(),
      end_datetime: new Date(this.bookingEnd).toISOString(),
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

    if (!this.bookingStart || !this.bookingEnd) {
      this.error = 'Select start and end time';
      return;
    }

    const payload: CreateBookingPayload = {
      listing_id: listing.id,
      start_datetime: new Date(this.bookingStart).toISOString(),
      end_datetime: new Date(this.bookingEnd).toISOString(),
    };

    this.rentalService.createBooking(user.userId, payload).subscribe({
      next: res => {
        this.info = `Booking requested (${res.booking.status})`;
        this.availability = { listing_id: listing.id, available: true, conflict: false };
        this.myBookings.unshift(res.booking);
        this.loadMyBookings();
        this.calendarDate = new Date(this.bookingStart).toISOString().slice(0, 10);
        this.loadCalendar(listing.id, this.calendarDate);
      },
      error: err => {
        this.error = err.message || 'Booking failed';
        this.availability = { listing_id: listing.id, available: false, conflict: true };
      },
    });
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
      },
      error: () => {
        this.calendarSlots = [];
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
