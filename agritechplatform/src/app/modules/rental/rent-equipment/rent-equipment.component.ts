import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  nextAvailableSlot: string | null = null;
  recommendation: RentalRecommendationResponse | null = null;
  recommendationLoading = false;
  blockId: string | null = null;

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
    this.useRadiusFilter = this.draftUseRadiusFilter;
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
    this.draftUseRadiusFilter = false;
    this.draftRadiusKm = this.defaultRadiusKm;
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
    this.useRadiusFilter = false;
    this.radiusKm = this.defaultRadiusKm;
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
    this.calendarSlots = [];
    this.nextAvailableSlot = null;
    this.detailsModalListing = null;
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
    this.bookingStartTime = '';
    this.bookingEndTime = '';
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
    if (start >= end) {
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
