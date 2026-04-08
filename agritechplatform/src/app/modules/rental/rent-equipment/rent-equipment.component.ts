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
  readonly maxRadiusKm = 250;
  readonly baseToolOptions = [
    'Tractor',
    'Irrigation Pump',
    'Sprayer',
    'Seeder',
    'Harvester',
    'Cultivator',
    'Rotavator',
    'Plough',
    'Trailer',
    'Generator',
    'Drone',
    'Water Tanker',
    'Power Tiller',
    'Transplanter',
    'Mulcher',
    'Baler',
    'Thresher',
    'Excavator',
    'Loader',
    'Mini Tractor',
  ] as const;

  readonly sortOptions = [
    { value: 'distance', label: 'Nearest First' },
    { value: 'price_low', label: 'Price: Low to High' },
    { value: 'price_high', label: 'Price: High to Low' },
    { value: 'name', label: 'Name: A to Z' },
  ] as const;

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
  categoryFilter = '';
  locationFilter = '';
  onlyWithImage = false;
  sortBy: 'distance' | 'price_low' | 'price_high' | 'name' = 'distance';
  machineSearchTerm = '';
  appliedMachineSearchTerm = '';
  showFilterPanel = false;
  draftRadiusKm = 50;
  draftMinPrice = 0;
  draftMaxPrice = 100000;
  draftTypeFilter: '' | RentalPriceType = '';
  draftCategoryFilter = '';
  draftLocationFilter = '';
  draftOnlyWithImage = false;
  draftSortBy: 'distance' | 'price_low' | 'price_high' | 'name' = 'distance';
  detailsModalListing: RentalListing | null = null;
  bookingModalListing: RentalListing | null = null;

  selectedListingId: string | null = null;
  bookingStart = '';
  bookingEnd = '';
  bookingStartDate = '';
  bookingEndDate = '';
  bookingQuantity = 1;
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
    this.syncDraftFilters();
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
    const locationSearch = this.locationFilter.trim().toLowerCase();
    const categorySearch = this.categoryFilter.trim().toLowerCase();

    return this.listings.filter(listing => {
      const typeMatch = !this.typeFilter || listing.price_type === this.typeFilter;
      const priceMatch = listing.price >= this.minPrice && listing.price <= this.maxPrice;
      const machineMatch = !search
        || listing.equipment_name.toLowerCase().includes(search)
        || (listing.description || '').toLowerCase().includes(search);
      const categoryMatch = !categorySearch || listing.equipment_name.toLowerCase() === categorySearch;
      const locationMatch = !locationSearch || (listing.location_label || '').toLowerCase().includes(locationSearch);
      const imageMatch = !this.onlyWithImage || !!listing.image_url;

      return typeMatch && priceMatch && machineMatch && categoryMatch && locationMatch && imageMatch;
    }).sort((left, right) => {
      if (this.sortBy === 'price_low') {
        return left.price - right.price;
      }

      if (this.sortBy === 'price_high') {
        return right.price - left.price;
      }

      if (this.sortBy === 'name') {
        return left.equipment_name.localeCompare(right.equipment_name);
      }

      return (left.distance_m ?? Number.MAX_SAFE_INTEGER) - (right.distance_m ?? Number.MAX_SAFE_INTEGER);
    });
  }

  get equipmentTypeOptions(): string[] {
    return [...new Set([...this.baseToolOptions, ...this.listings.map(listing => listing.equipment_name).filter(Boolean)])]
      .sort((left, right) => left.localeCompare(right));
  }

  get quickToolOptions(): string[] {
    return [
      'All',
      'Tractor',
      'Irrigation Pump',
      'Sprayer',
      'Seeder',
      'Harvester',
      'Cultivator',
      'Trailer',
    ];
  }

  get appliedFilterCount(): number {
    let count = 0;

    if (this.radiusKm !== 50) {
      count += 1;
    }
    if (this.minPrice !== 0 || this.maxPrice !== 100000) {
      count += 1;
    }
    if (this.typeFilter) {
      count += 1;
    }
    if (this.categoryFilter) {
      count += 1;
    }
    if (this.locationFilter.trim()) {
      count += 1;
    }
    if (this.onlyWithImage) {
      count += 1;
    }
    if (this.sortBy !== 'distance') {
      count += 1;
    }

    return count;
  }

  applyMachineSearch(): void {
    this.appliedMachineSearchTerm = this.machineSearchTerm;
  }

  toggleQuickCategory(option: string): void {
    if (option === 'All') {
      this.categoryFilter = '';
    } else {
      this.categoryFilter = this.categoryFilter === option ? '' : option;
    }
    this.draftCategoryFilter = this.categoryFilter;
  }

  openFilterPanel(): void {
    this.syncDraftFilters();
    this.showFilterPanel = true;
  }

  closeFilterPanel(): void {
    this.showFilterPanel = false;
  }

  applyFilters(): void {
    this.radiusKm = this.draftRadiusKm;
    this.minPrice = this.draftMinPrice;
    this.maxPrice = this.draftMaxPrice;
    this.typeFilter = this.draftTypeFilter;
    this.categoryFilter = this.draftCategoryFilter;
    this.locationFilter = this.draftLocationFilter;
    this.onlyWithImage = this.draftOnlyWithImage;
    this.sortBy = this.draftSortBy;
    this.showFilterPanel = false;
    this.loadListings();
  }

  resetFilters(): void {
    this.draftRadiusKm = 50;
    this.draftMinPrice = 0;
    this.draftMaxPrice = 100000;
    this.draftTypeFilter = '';
    this.draftCategoryFilter = '';
    this.draftLocationFilter = '';
    this.draftOnlyWithImage = false;
    this.draftSortBy = 'distance';
  }

  resetAllFilters(): void {
    this.machineSearchTerm = '';
    this.appliedMachineSearchTerm = '';
    this.radiusKm = 50;
    this.minPrice = 0;
    this.maxPrice = 100000;
    this.typeFilter = '';
    this.categoryFilter = '';
    this.locationFilter = '';
    this.onlyWithImage = false;
    this.sortBy = 'distance';
    this.resetFilters();
    this.loadListings();
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
    this.bookingQuantity = 1;
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
    this.bookingQuantity = 1;
  }

  onTimeChange(listing: RentalListing): void {
    this.selectedListingId = listing.id;
    if (!this.bookingQuantity || this.bookingQuantity < 1) {
      this.bookingQuantity = 1;
    }
    if (this.bookingQuantity > (listing.quantity_total || 1)) {
      this.bookingQuantity = listing.quantity_total || 1;
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
      quantity_requested: this.bookingQuantity,
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
    const total = (listing.price_type === 'daily'
      ? Math.ceil(hours / 24) * listing.price
      : hours * listing.price) * this.bookingQuantity;
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

  private syncDraftFilters(): void {
    this.draftRadiusKm = this.radiusKm;
    this.draftMinPrice = this.minPrice;
    this.draftMaxPrice = this.maxPrice;
    this.draftTypeFilter = this.typeFilter;
    this.draftCategoryFilter = this.categoryFilter;
    this.draftLocationFilter = this.locationFilter;
    this.draftOnlyWithImage = this.onlyWithImage;
    this.draftSortBy = this.sortBy;
  }
}
