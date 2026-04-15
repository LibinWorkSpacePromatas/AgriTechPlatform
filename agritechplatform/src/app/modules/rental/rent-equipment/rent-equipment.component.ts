import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { BlockService } from '../../../shared/services/block.service';
import { User, UserBlock } from '../../../core/models/user.model';
import { Block } from '../../../shared/models';
import {
  CheckAvailabilityResponse,
  CheckAvailabilityPayload,
  CreateBookingPayload,
  RentalCalendarSlot,
  RentalListing,
  RentalPriceType,
  RentalRecommendationResponse,
  RentalService,
} from '../../../services/rental/rental.service';

interface BookingDaySummary {
  date: string;
  label: string;
  status: 'available' | 'limited' | 'booked' | 'unavailable';
}

interface ListingAvailabilitySummary {
  availableDayCount: number;
}

@Component({
  selector: 'app-rent-equipment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rent-equipment.component.html',
  styleUrl: './rent-equipment.component.css'
})
export class RentEquipmentComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  readonly maxRadiusKm = 250;
  readonly defaultRadiusKm = 50;
  readonly bookingLeadMinutes = 30;
  readonly availabilityWindowDays = 7;
  readonly quickDistanceOptions = [25, 50, 100, 150, 250];
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
  radiusKm = this.defaultRadiusKm;
  useRadiusFilter = false;
  minPrice = 0;
  maxPrice = 100000;
  typeFilter: '' | RentalPriceType = '';
  categoryFilter = '';
  locationFilter = '';
  onlyWithImage = false;
  onlyAvailable = false;
  sortBy: 'distance' | 'price_low' | 'price_high' | 'name' = 'distance';
  machineSearchTerm = '';
  appliedMachineSearchTerm = '';
  showFilterPanel = false;
  draftRadiusKm = this.defaultRadiusKm;
  draftUseRadiusFilter = false;
  draftMinPrice = 0;
  draftMaxPrice = 100000;
  draftTypeFilter: '' | RentalPriceType = '';
  draftCategoryFilter = '';
  draftLocationFilter = '';
  draftOnlyWithImage = false;
  draftOnlyAvailable = false;
  draftSortBy: 'distance' | 'price_low' | 'price_high' | 'name' = 'distance';
  detailsModalListing: RentalListing | null = null;
  bookingModalListing: RentalListing | null = null;

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
  calendarPreviewDate = '';
  availableDays: BookingDaySummary[] = [];
  nextAvailableSlot: string | null = null;
  recommendation: RentalRecommendationResponse | null = null;
  recommendationLoading = false;
  blockId: string | null = null;
  listingAvailabilityMap: Record<string, ListingAvailabilitySummary> = {};

  constructor(
    private rentalService: RentalService,
    private authService: AuthService,
    private blockService: BlockService,
  ) { }

  ngOnInit(): void {
    this.blockService.selectedBlock$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(block => {
        this.syncLocationContext(block, this.authService.getCurrentUser());
        if (this.blockId) {
          this.loadRecommendations(this.blockId);
        } else {
          this.recommendation = null;
        }
        this.loadListings();
      });

    this.syncLocationContext(this.blockService.getSelectedBlock(), this.authService.getCurrentUser());
    this.syncDraftFilters();
  }

  loadListings(): void {
    this.loading = true;
    this.error = null;
    const currentUser = this.authService.getCurrentUser();
    this.rentalService.getListings(
      this.lat ?? undefined,
      this.lon ?? undefined,
      this.useRadiusFilter ? this.radiusKm : undefined,
      currentUser?.userId,
    ).subscribe({
      next: response => {
        this.listings = response;
        this.loadListingAvailability(response);
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
      const category = this.getEquipmentCategory(listing).toLowerCase();
      const subtype = this.getEquipmentSubtype(listing).toLowerCase();
      const displayName = this.getListingDisplayName(listing).toLowerCase();
      const typeMatch = !this.typeFilter || listing.price_type === this.typeFilter;
      const priceMatch = listing.price >= this.minPrice && listing.price <= this.maxPrice;
      const machineMatch = !search
        || listing.equipment_name.toLowerCase().includes(search)
        || displayName.includes(search)
        || category.includes(search)
        || subtype.includes(search)
        || (listing.description || '').toLowerCase().includes(search);
      const categoryMatch = !categorySearch || category === categorySearch;
      const locationMatch = !locationSearch || (listing.location_label || '').toLowerCase().includes(locationSearch);
      const imageMatch = !this.onlyWithImage || !!listing.image_url;
      const availableMatch = !this.onlyAvailable || this.isListingAvailable(listing.id);

      return typeMatch && priceMatch && machineMatch && categoryMatch && locationMatch && imageMatch && availableMatch;
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
    return [...new Set([...this.baseToolOptions, ...this.listings.map(listing => this.getEquipmentCategory(listing)).filter(Boolean)])]
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

    if (this.useRadiusFilter) {
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
    if (this.onlyAvailable) {
      count += 1;
    }
    if (this.sortBy !== 'distance') {
      count += 1;
    }

    return count;
  }

  get minBookingDate(): string {
    return this.toLocalDateString(new Date());
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
    this.useRadiusFilter = this.draftUseRadiusFilter;
    this.radiusKm = this.draftRadiusKm;
    this.minPrice = this.draftMinPrice;
    this.maxPrice = this.draftMaxPrice;
    this.typeFilter = this.draftTypeFilter;
    this.categoryFilter = this.draftCategoryFilter;
    this.locationFilter = this.draftLocationFilter;
    this.onlyWithImage = this.draftOnlyWithImage;
    this.onlyAvailable = this.draftOnlyAvailable;
    this.sortBy = this.draftSortBy;
    this.showFilterPanel = false;
    this.loadListings();
  }

  resetFilters(): void {
    this.draftUseRadiusFilter = false;
    this.draftRadiusKm = this.defaultRadiusKm;
    this.draftMinPrice = 0;
    this.draftMaxPrice = 100000;
    this.draftTypeFilter = '';
    this.draftCategoryFilter = '';
    this.draftLocationFilter = '';
    this.draftOnlyWithImage = false;
    this.draftOnlyAvailable = false;
    this.draftSortBy = 'distance';
  }

  resetAllFilters(): void {
    this.machineSearchTerm = '';
    this.appliedMachineSearchTerm = '';
    this.useRadiusFilter = false;
    this.radiusKm = this.defaultRadiusKm;
    this.minPrice = 0;
    this.maxPrice = 100000;
    this.typeFilter = '';
    this.categoryFilter = '';
    this.locationFilter = '';
    this.onlyWithImage = false;
    this.onlyAvailable = false;
    this.sortBy = 'distance';
    this.resetFilters();
    this.loadListings();
  }

  getListingDisplayName(listing: RentalListing): string {
    return this.getEquipmentSubtype(listing) || listing.equipment_name;
  }

  getListingDisplayDetail(listing: RentalListing): string | null {
    const category = this.getEquipmentCategory(listing);
    const subtype = this.getEquipmentSubtype(listing);
    return subtype ? `${category} • ${subtype}` : category || null;
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
    this.bookingStartTime = '';
    this.bookingEndTime = '';
    this.bookingQuantity = 1;
    this.calendarDate = '';
    this.calendarPreviewDate = '';
    this.calendarSlots = [];
    this.availableDays = [];
    this.nextAvailableSlot = null;
    this.detailsModalListing = null;
    this.loadAvailableDays(listing.id);
  }

  closeBookingModal(): void {
    this.bookingModalListing = null;
    this.selectedListingId = null;
    this.availability = null;
    this.calendarSlots = [];
    this.availableDays = [];
    this.nextAvailableSlot = null;
    this.calendarPreviewDate = '';
    this.bookingStart = '';
    this.bookingEnd = '';
    this.bookingStartDate = '';
    this.bookingEndDate = '';
    this.bookingStartTime = '';
    this.bookingEndTime = '';
    this.bookingQuantity = 1;
  }

  getMaxBookableUnits(listing: RentalListing): number {
    const totalUnits = listing.quantity_total || 1;
    const availableUnits = this.selectedListingId === listing.id ? this.availability?.available_quantity : null;
    if (availableUnits == null) {
      return totalUnits;
    }
    return Math.max(1, Math.min(totalUnits, availableUnits));
  }

  getAvailableUnitsLabel(listing: RentalListing): string {
    const totalUnits = listing.quantity_total || 1;
    const availableUnits = this.selectedListingId === listing.id ? this.availability?.available_quantity : null;
    if (availableUnits == null) {
      return `${totalUnits} unit${totalUnits > 1 ? 's' : ''} total`;
    }
    return `${availableUnits} of ${totalUnits} unit${totalUnits > 1 ? 's' : ''} available`;
  }

  onBookingQuantityChange(listing: RentalListing): void {
    this.bookingQuantity = this.clampBookingQuantity(listing, this.bookingQuantity);
    this.onTimeChange(listing);
  }

  onTimeChange(listing: RentalListing): void {
    this.selectedListingId = listing.id;
    this.bookingQuantity = this.clampBookingQuantity(listing, this.bookingQuantity);
    this.availability = null;
    this.info = null;
    this.error = this.getBookingValidationMessage(listing);
    const window = this.buildBookingWindow(listing);
    this.calendarDate = this.resolveCalendarDate(listing, window);
    if (this.calendarDate) {
      this.loadCalendar(listing.id, this.calendarDate);
    } else {
      this.calendarSlots = [];
      this.nextAvailableSlot = null;
    }

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
      next: res => {
        this.availability = res;
        this.bookingQuantity = this.clampBookingQuantity(listing, this.bookingQuantity);
      },
      error: err => this.error = err.message || 'Availability check failed',
    });
  }

  onBookingDateChange(listing: RentalListing, dateValue: string): void {
    this.calendarPreviewDate = dateValue;
    this.onTimeChange(listing);
  }

  selectAvailableDay(listing: RentalListing, day: BookingDaySummary): void {
    this.calendarPreviewDate = day.date;
    this.bookingStartDate = day.date;
    if (!this.bookingEndDate || this.bookingEndDate < day.date) {
      this.bookingEndDate = day.date;
    }
    this.onTimeChange(listing);
  }

  bookNow(listing: RentalListing): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.error = 'No active user selected';
      return;
    }

    const window = this.buildBookingWindow(listing);
    if (!window) {
      this.error = this.getBookingValidationMessage(listing)
        || (listing.price_type === 'daily' ? 'Select start and end date' : 'Select start and end time');
      return;
    }

    this.bookingQuantity = this.clampBookingQuantity(listing, this.bookingQuantity);
    if (this.availability?.available_quantity != null && this.bookingQuantity > this.availability.available_quantity) {
      this.error = `Only ${this.availability.available_quantity} unit${this.availability.available_quantity === 1 ? '' : 's'} available for the selected slot.`;
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
        this.calendarDate = this.resolveCalendarDate(listing, window);
        if (this.calendarDate) {
          this.loadCalendar(listing.id, this.calendarDate);
        }
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

  getMinimumEndDate(): string {
    return this.bookingStartDate || this.minBookingDate;
  }

  getMinimumStartTime(): string | null {
    if (this.bookingStartDate !== this.minBookingDate) {
      return null;
    }

    return this.toTimeInputValue(this.getMinimumHourlyStart());
  }

  getMinimumEndTime(): string | null {
    if (!this.bookingEndDate) {
      return null;
    }

    if (this.bookingStartDate && this.bookingEndDate === this.bookingStartDate && this.bookingStartTime) {
      return this.bookingStartTime;
    }

    if (this.bookingEndDate === this.minBookingDate) {
      return this.toTimeInputValue(this.getMinimumHourlyStart());
    }

    return null;
  }

  getCalendarHeadingDate(): string {
    return this.calendarPreviewDate || this.calendarDate;
  }

  getSelectedDaySummary(): BookingDaySummary | null {
    const selectedDate = this.getCalendarHeadingDate();
    if (!selectedDate) {
      return null;
    }
    return this.availableDays.find(day => day.date === selectedDate) ?? null;
  }

  getSelectedDayStatusLabel(): string {
    const selectedDay = this.getSelectedDaySummary();
    if (!selectedDay) {
      return 'Pick a date to instantly see whether this equipment is free, limited, or occupied.';
    }

    switch (selectedDay.status) {
      case 'available':
        return 'Good choice. This date has open availability.';
      case 'limited':
        return 'Partly available. Some time slots are already taken.';
      case 'booked':
        return 'This date is occupied. Please choose another day or time.';
      case 'unavailable':
        return 'This date is not offered by the provider.';
      default:
        return '';
    }
  }

  getSelectedDayStatusClass(): string {
    const selectedDay = this.getSelectedDaySummary();
    return selectedDay ? `selected-day-status-${selectedDay.status}` : 'selected-day-status-idle';
  }

  isListingAvailable(listingId: string): boolean {
    return (this.listingAvailabilityMap[listingId]?.availableDayCount ?? 0) > 0;
  }

  getAvailabilityLabel(listingId: string): string {
    const availableDayCount = this.listingAvailabilityMap[listingId]?.availableDayCount ?? 0;
    if (availableDayCount <= 0) {
      return 'No available days in next 7 days';
    }
    if (availableDayCount === this.availabilityWindowDays) {
      return `Available all ${this.availabilityWindowDays} days`;
    }
    if (availableDayCount === 1) {
      return 'Available 1 day in next 7 days';
    }
    return `Available ${availableDayCount} days in next 7 days`;
  }

  setDraftRadiusMode(enabled: boolean): void {
    this.draftUseRadiusFilter = enabled;
  }

  setDraftRadius(distanceKm: number): void {
    this.draftRadiusKm = distanceKm;
    this.draftUseRadiusFilter = true;
  }

  private buildBookingWindow(listing: RentalListing): { start: string; end: string } | null {
    if (listing.price_type === 'daily') {
      if (!this.bookingStartDate || !this.bookingEndDate) {
        return null;
      }
      if (this.bookingStartDate < this.minBookingDate || this.bookingEndDate < this.minBookingDate) {
        return null;
      }
      const start = new Date(`${this.bookingStartDate}T00:00:00`);
      const endBase = new Date(`${this.bookingEndDate}T00:00:00`);
      endBase.setDate(endBase.getDate() + 1);
      if (start >= endBase) {
        return null;
      }
      return {
        start: `${this.bookingStartDate}T00:00:00`,
        end: `${this.toLocalDateString(endBase)}T00:00:00`,
      };
    }

    if (!this.bookingStartDate || !this.bookingEndDate || !this.bookingStartTime || !this.bookingEndTime) {
      return null;
    }
    this.bookingStart = `${this.bookingStartDate}T${this.bookingStartTime}`;
    this.bookingEnd = `${this.bookingEndDate}T${this.bookingEndTime}`;
    const start = new Date(this.bookingStart);
    const end = new Date(this.bookingEnd);
    if (start >= end || start < this.getMinimumHourlyStart()) {
      return null;
    }
    return {
      start: `${this.bookingStartDate}T${this.bookingStartTime}:00`,
      end: `${this.bookingEndDate}T${this.bookingEndTime}:00`,
    };
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

  private loadAvailableDays(listingId: string): void {
    const requests = Array.from({ length: this.availabilityWindowDays }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() + index);
      const dayValue = this.toLocalDateString(date);
      return this.rentalService.getListingCalendar(listingId, dayValue);
    });

    forkJoin(requests).subscribe({
      next: responses => {
        this.availableDays = responses.map(response => {
          const date = new Date(`${response.date}T00:00:00`);
          return {
            date: response.date,
            label: date.toLocaleDateString([], { weekday: 'short', day: '2-digit' }),
            status: this.buildDayAvailabilityStatus(response.slots),
          };
        });
      },
      error: () => {
        this.availableDays = [];
      },
    });
  }

  private loadListingAvailability(listings: RentalListing[]): void {
    if (!listings.length) {
      this.listingAvailabilityMap = {};
      return;
    }

    const requests = listings.map(listing => {
      const dayRequests = Array.from({ length: this.availabilityWindowDays }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() + index);
        return this.rentalService.getListingCalendar(listing.id, this.toLocalDateString(date));
      });

      return forkJoin(dayRequests);
    });

    forkJoin(requests)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: responses => {
          this.listingAvailabilityMap = listings.reduce<Record<string, ListingAvailabilitySummary>>((accumulator, listing, index) => {
            accumulator[listing.id] = {
              availableDayCount: responses[index].filter(response =>
                response.slots.some(slot => slot.status === 'available')
              ).length,
            };
            return accumulator;
          }, {});
        },
        error: () => {
          this.listingAvailabilityMap = listings.reduce<Record<string, ListingAvailabilitySummary>>((accumulator, listing) => {
            accumulator[listing.id] = { availableDayCount: this.availabilityWindowDays };
            return accumulator;
          }, {});
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

  private resolveCalendarDate(listing: RentalListing, window: { start: string; end: string } | null): string {
    if (this.calendarPreviewDate) {
      return this.calendarPreviewDate;
    }

    if (listing.price_type === 'daily') {
      return this.bookingStartDate || this.bookingEndDate || '';
    }

    if (this.bookingStartDate) {
      return this.bookingStartDate;
    }
    if (window?.start) {
      return this.toLocalDateString(new Date(window.start));
    }
    return '';
  }

  private toLocalDateString(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toTimeInputValue(value: Date): string {
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private buildDayAvailabilityStatus(slots: RentalCalendarSlot[]): 'available' | 'limited' | 'booked' | 'unavailable' {
    const availableCount = slots.filter(slot => slot.status === 'available').length;
    if (availableCount === 0) {
      const hasBookedOrBuffer = slots.some(slot => slot.status === 'booked' || slot.status === 'buffer');
      return hasBookedOrBuffer ? 'booked' : 'unavailable';
    }
    if (availableCount === slots.length) {
      return 'available';
    }
    return 'limited';
  }

  private getMinimumHourlyStart(): Date {
    const minimum = new Date(Date.now() + this.bookingLeadMinutes * 60 * 1000);
    minimum.setSeconds(0, 0);
    return minimum;
  }

  private getBookingValidationMessage(listing: RentalListing): string | null {
    if (listing.price_type === 'daily') {
      if ((this.bookingStartDate && this.bookingStartDate < this.minBookingDate)
        || (this.bookingEndDate && this.bookingEndDate < this.minBookingDate)) {
        return 'Past dates cannot be booked.';
      }
      if (this.bookingStartDate && this.bookingEndDate && this.bookingEndDate < this.bookingStartDate) {
        return 'End date must be on or after the start date.';
      }
      return null;
    }

    if ((this.bookingStartDate && this.bookingStartDate < this.minBookingDate)
      || (this.bookingEndDate && this.bookingEndDate < this.minBookingDate)) {
      return 'Past dates cannot be booked.';
    }

    if (!this.bookingStartDate || !this.bookingStartTime) {
      return null;
    }

    const start = new Date(`${this.bookingStartDate}T${this.bookingStartTime}`);
    if (start < this.getMinimumHourlyStart()) {
      return 'Start time must be at least 30 minutes in the future.';
    }

    if (this.bookingEndDate && this.bookingEndTime) {
      const end = new Date(`${this.bookingEndDate}T${this.bookingEndTime}`);
      if (end <= start) {
        return 'End time must be later than the start time.';
      }
    }

    return null;
  }

  private clampBookingQuantity(listing: RentalListing, quantity: number): number {
    const parsedQuantity = Number.isFinite(quantity) ? Math.floor(quantity) : 1;
    const safeQuantity = Math.max(1, parsedQuantity || 1);
    return Math.min(safeQuantity, this.getMaxBookableUnits(listing));
  }

  private syncLocationContext(selectedBlock: Block | null, user: User | null): void {
    const matchingUserBlock = this.findMatchingUserBlock(selectedBlock, user);
    this.lat = selectedBlock?.lat ?? matchingUserBlock?.latitude ?? null;
    this.lon = selectedBlock?.lon ?? matchingUserBlock?.longitude ?? null;
    this.blockId = selectedBlock?.id ?? matchingUserBlock?.id ?? selectedBlock?.lan ?? matchingUserBlock?.lanslu ?? null;
  }

  private findMatchingUserBlock(selectedBlock: Block | null, user: User | null): UserBlock | null {
    if (!selectedBlock || !user?.blocks?.length) {
      return user?.blocks?.[0] ?? null;
    }

    return user.blocks.find(block =>
      (block.id && selectedBlock.id && block.id === selectedBlock.id)
      || block.lanslu === selectedBlock.lan
    ) ?? user.blocks[0] ?? null;
  }

  private syncDraftFilters(): void {
    this.draftUseRadiusFilter = this.useRadiusFilter;
    this.draftRadiusKm = this.radiusKm;
    this.draftMinPrice = this.minPrice;
    this.draftMaxPrice = this.maxPrice;
    this.draftTypeFilter = this.typeFilter;
    this.draftCategoryFilter = this.categoryFilter;
    this.draftLocationFilter = this.locationFilter;
    this.draftOnlyWithImage = this.onlyWithImage;
    this.draftOnlyAvailable = this.onlyAvailable;
    this.draftSortBy = this.sortBy;
  }

  private getEquipmentCategory(listing: RentalListing): string {
    return this.readSpecification(listing.specifications, 'Equipment Category') || listing.equipment_name;
  }

  private getEquipmentSubtype(listing: RentalListing): string {
    return this.readSpecification(listing.specifications, 'Equipment Subtype');
  }

  private readSpecification(specifications: Record<string, string> | null | undefined, key: string): string {
    return specifications?.[key]?.trim() || '';
  }
}
