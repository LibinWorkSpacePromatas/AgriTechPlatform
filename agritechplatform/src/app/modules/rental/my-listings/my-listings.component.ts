import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { BlockService } from '../../../shared/services/block.service';
import { CreateListingPayload, RentalCalendarSlot, RentalListing, RentalPriceType, RentalService } from '../../../services/rental/rental.service';

@Component({
  selector: 'app-my-listings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-listings.component.html',
  styleUrl: './my-listings.component.css'
})
export class MyListingsComponent implements OnInit {
  listings: RentalListing[] = [];
  loading = false;
  error: string | null = null;
  createError: string | null = null;
  createSuccess: string | null = null;
  selectedCalendarListingId: string | null = null;
  calendarDate = new Date().toISOString().slice(0, 10);
  calendarSlots: RentalCalendarSlot[] = [];
  nextAvailableSlot: string | null = null;

  form: CreateListingPayload = {
    equipment_name: '',
    description: '',
    price: 0,
    price_type: 'hourly',
    quantity_total: 1,
    latitude: null,
    longitude: null,
  };

  readonly priceTypes: RentalPriceType[] = ['hourly', 'daily'];

  constructor(
    private authService: AuthService,
    private rentalService: RentalService,
    private blockService: BlockService,
  ) { }

  ngOnInit(): void {
    this.loadListings();
  }

  loadListings(): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.error = 'No active user selected';
      return;
    }

    this.loading = true;
    this.rentalService.getMyListings(user.userId).subscribe({
      next: listings => {
        this.listings = listings;
        this.loading = false;
      },
      error: err => {
        this.error = err.message || 'Unable to load listings';
        this.loading = false;
      },
    });
  }

  createListing(): void {
    this.createError = null;
    this.createSuccess = null;
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.createError = 'No active user selected';
      return;
    }

    if (!this.form.equipment_name?.trim() || !this.form.price || this.form.price <= 0) {
      this.createError = 'Name and valid price are required';
      return;
    }
    if (!this.form.quantity_total || this.form.quantity_total <= 0) {
      this.createError = 'Quantity must be at least 1';
      return;
    }

    const selectedBlock = this.blockService.getSelectedBlock();
    if (!selectedBlock?.id) {
      this.createError = 'Select a valid block before creating a listing';
      return;
    }

    const payload: CreateListingPayload = {
      ...this.form,
      block_id: selectedBlock.id,
      quantity_total: this.form.quantity_total,
      latitude: null,
      longitude: null,
    };

    this.rentalService.createListing(user.userId, payload).subscribe({
      next: listing => {
        this.listings = [listing, ...this.listings];
        this.createSuccess = 'Listing created';
        this.form = {
          equipment_name: '',
          description: '',
          price: 0,
          price_type: 'hourly',
          quantity_total: 1,
          latitude: null,
          longitude: null,
        };
      },
      error: err => this.createError = err.message || 'Create listing failed',
    });
  }

  toggleListing(listing: RentalListing): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.error = 'No active user selected';
      return;
    }

    this.rentalService.toggleListing(listing.id, user.userId).subscribe({
      next: updated => {
        listing.is_active = updated.is_active;
      },
      error: err => this.error = err.message || 'Toggle failed',
    });
  }

  viewCalendar(listing: RentalListing): void {
    this.selectedCalendarListingId = listing.id;
    this.rentalService.getListingCalendar(listing.id, this.calendarDate).subscribe({
      next: response => {
        this.calendarSlots = response.slots;
        const nextSlot = response.slots.find(slot => slot.status === 'available');
        this.nextAvailableSlot = nextSlot ? `${new Date(nextSlot.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : null;
      },
      error: err => {
        this.error = err.message || 'Unable to load calendar';
        this.calendarSlots = [];
        this.nextAvailableSlot = null;
      },
    });
  }

  get rateLabel(): string {
    return this.form.price_type === 'daily' ? 'Rate (per day)' : 'Rate (per hour)';
  }

  get rateHint(): string {
    return this.form.price_type === 'daily'
      ? 'Enter daily usage rate (per day).'
      : 'Enter hourly usage rate (per hour).';
  }

  get isCreateDisabled(): boolean {
    return !this.form.equipment_name?.trim()
      || !this.form.price
      || this.form.price <= 0
      || !this.form.quantity_total
      || this.form.quantity_total <= 0;
  }
}
