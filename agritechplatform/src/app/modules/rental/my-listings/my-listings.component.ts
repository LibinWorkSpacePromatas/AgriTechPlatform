import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { BlockService } from '../../../shared/services/block.service';
import { CreateListingPayload, RentalCalendarSlot, RentalListing, RentalPriceType, RentalService } from '../../../services/rental/rental.service';

interface ListingSpecField {
  key: string;
  label: string;
  placeholder: string;
}

@Component({
  selector: 'app-my-listings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-listings.component.html',
  styleUrl: './my-listings.component.css'
})
export class MyListingsComponent implements OnInit, OnDestroy {
  listings: RentalListing[] = [];
  loading = false;
  error: string | null = null;
  createError: string | null = null;
  createSuccess: string | null = null;
  showCreateForm = false;
  editingListingId: string | null = null;
  editingListingImageUrl: string | null = null;
  detailsModalListing: RentalListing | null = null;
  selectedCalendarListingId: string | null = null;
  calendarDate = new Date().toISOString().slice(0, 10);
  calendarSlots: RentalCalendarSlot[] = [];
  nextAvailableSlot: string | null = null;
  selectedImageName: string | null = null;
  imagePreviewUrl: string | null = null;
  specValues: Record<string, string> = {};

  form: CreateListingPayload = {
    equipment_name: '',
    description: '',
    price: 0,
    price_type: 'hourly',
    quantity_total: 1,
    latitude: null,
    longitude: null,
    image: undefined,
  };

  readonly priceTypes: RentalPriceType[] = ['hourly', 'daily'];
  readonly equipmentTypes: string[] = [
    'Tractor',
    'Harvester',
    'Irrigation Pump',
    'Seeder',
    'Sprayer',
    'Cultivator',
    'Rotavator',
    'Plough',
    'Trailer',
    'Drone',
  ];
  readonly commonSpecFields: ListingSpecField[] = [
    { key: 'brand', label: 'Brand', placeholder: 'Enter brand' },
    { key: 'model', label: 'Model', placeholder: 'Enter model name or number' },
    { key: 'condition', label: 'Condition', placeholder: 'New, good, serviced, etc.' },
  ];
  readonly equipmentSpecFields: Record<string, ListingSpecField[]> = {
    Tractor: [
      { key: 'horsepower', label: 'Horsepower', placeholder: 'e.g. 75 HP' },
      { key: 'fuel_type', label: 'Fuel Type', placeholder: 'Diesel, electric, etc.' },
      { key: 'transmission', label: 'Transmission', placeholder: 'Manual, automatic, CVT' },
    ],
    Harvester: [
      { key: 'crop_type', label: 'Crop Type', placeholder: 'Wheat, grapes, etc.' },
      { key: 'cutting_width', label: 'Cutting Width', placeholder: 'e.g. 4.5 m' },
      { key: 'hopper_capacity', label: 'Hopper Capacity', placeholder: 'e.g. 2500 L' },
    ],
    'Irrigation Pump': [
      { key: 'flow_capacity', label: 'Flow Capacity', placeholder: 'e.g. 500 L/min' },
      { key: 'power_source', label: 'Power Source', placeholder: 'Diesel, electric, PTO' },
      { key: 'hose_size', label: 'Hose Size', placeholder: 'e.g. 3 inch' },
    ],
    Seeder: [
      { key: 'row_count', label: 'Row Count', placeholder: 'e.g. 12 rows' },
      { key: 'hopper_capacity', label: 'Hopper Capacity', placeholder: 'e.g. 300 kg' },
      { key: 'working_width', label: 'Working Width', placeholder: 'e.g. 2.5 m' },
    ],
    Sprayer: [
      { key: 'tank_capacity', label: 'Tank Capacity', placeholder: 'e.g. 400 L' },
      { key: 'boom_width', label: 'Boom Width', placeholder: 'e.g. 12 m' },
      { key: 'power_source', label: 'Power Source', placeholder: 'Battery, PTO, engine' },
    ],
    Cultivator: [
      { key: 'working_width', label: 'Working Width', placeholder: 'e.g. 2.0 m' },
      { key: 'tine_count', label: 'Tine Count', placeholder: 'e.g. 9 tines' },
      { key: 'power_required', label: 'Power Required', placeholder: 'e.g. 45 HP+' },
    ],
    Rotavator: [
      { key: 'working_width', label: 'Working Width', placeholder: 'e.g. 1.8 m' },
      { key: 'blade_count', label: 'Blade Count', placeholder: 'e.g. 42 blades' },
      { key: 'power_required', label: 'Power Required', placeholder: 'e.g. 50 HP+' },
    ],
    Plough: [
      { key: 'furrow_count', label: 'Furrow Count', placeholder: 'e.g. 3 furrow' },
      { key: 'working_width', label: 'Working Width', placeholder: 'e.g. 1.2 m' },
      { key: 'power_required', label: 'Power Required', placeholder: 'e.g. 40 HP+' },
    ],
    Trailer: [
      { key: 'load_capacity', label: 'Load Capacity', placeholder: 'e.g. 5 ton' },
      { key: 'trailer_type', label: 'Trailer Type', placeholder: 'Flatbed, tipping, etc.' },
      { key: 'brake_type', label: 'Brake Type', placeholder: 'Hydraulic, mechanical, none' },
    ],
    Drone: [
      { key: 'battery_life', label: 'Battery Life', placeholder: 'e.g. 30 min' },
      { key: 'payload_capacity', label: 'Payload Capacity', placeholder: 'e.g. 15 kg' },
      { key: 'coverage_area', label: 'Coverage Area', placeholder: 'e.g. 20 acres/hr' },
    ],
  };

  constructor(
    private authService: AuthService,
    private rentalService: RentalService,
    private blockService: BlockService,
  ) { }

  ngOnInit(): void {
    this.loadListings();
  }

  ngOnDestroy(): void {
    this.clearImagePreview();
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

  openCreateForm(): void {
    this.resetForm();
    this.showCreateForm = true;
    this.editingListingId = null;
    this.editingListingImageUrl = null;
    this.createError = null;
    this.createSuccess = null;
  }

  openEditForm(listing: RentalListing): void {
    this.showCreateForm = true;
    this.editingListingId = listing.id;
    this.editingListingImageUrl = listing.image_url || null;
    this.createError = null;
    this.createSuccess = null;
    this.form = {
      equipment_name: listing.equipment_name,
      description: listing.description || '',
      specifications: listing.specifications || {},
      price: listing.price,
      price_type: listing.price_type,
      quantity_total: listing.quantity_total || 1,
      latitude: listing.latitude,
      longitude: listing.longitude,
      block_id: listing.block_id,
      image: undefined,
    };
    this.syncSpecValues(listing.specifications || {});
    this.selectedImageName = null;
    this.clearImagePreview();
  }

  closeCreateForm(): void {
    this.showCreateForm = false;
    this.createError = null;
    this.resetForm();
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

    if (!this.form.description?.trim()) {
      this.createError = 'Description is required';
      return;
    }

    if (!this.form.image && !this.editingListingId) {
      this.createError = 'Tool image is required';
      return;
    }

    const selectedBlock = this.blockService.getSelectedBlock();
    if (!selectedBlock?.id) {
      this.createError = 'Select a valid block before creating a listing';
      return;
    }

    const payload: CreateListingPayload = {
      ...this.form,
      equipment_name: this.form.equipment_name.trim(),
      description: this.form.description.trim(),
      specifications: this.buildSpecificationsPayload(),
      block_id: this.form.block_id || selectedBlock.id,
      latitude: null,
      longitude: null,
    };

    const request$ = this.editingListingId
      ? this.rentalService.updateListing(user.userId, this.editingListingId, payload)
      : this.rentalService.createListing(user.userId, payload);

    request$.subscribe({
      next: listing => {
        this.listings = this.editingListingId
          ? this.listings.map(item => item.id === listing.id ? listing : item)
          : [listing, ...this.listings];
        this.createSuccess = this.editingListingId ? 'Listing updated' : 'Listing created';
        this.resetForm();
        this.showCreateForm = false;
      },
      error: err => {
        this.createError = err.message || (this.editingListingId ? 'Update listing failed' : 'Create listing failed');
      },
    });
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;

    if (!file) {
      this.form.image = undefined;
      this.selectedImageName = null;
      this.clearImagePreview();
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.createError = 'Please select a valid image file';
      this.form.image = undefined;
      this.selectedImageName = null;
      this.clearImagePreview();
      if (input) {
        input.value = '';
      }
      return;
    }

    this.createError = null;
    this.form.image = file;
    this.selectedImageName = file.name;
    this.clearImagePreview();
    this.imagePreviewUrl = URL.createObjectURL(file);
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

  openDetails(listing: RentalListing): void {
    this.detailsModalListing = listing;
  }

  closeDetailsModal(): void {
    this.detailsModalListing = null;
  }

  viewCalendar(listing: RentalListing): void {
    this.selectedCalendarListingId = listing.id;
    this.rentalService.getListingCalendar(listing.id, this.calendarDate).subscribe({
      next: response => {
        this.calendarSlots = response.slots;
        const nextSlot = response.slots.find(slot => slot.status === 'available');
        this.nextAvailableSlot = nextSlot
          ? `${new Date(nextSlot.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : null;
      },
      error: err => {
        this.error = err.message || 'Unable to load calendar';
        this.calendarSlots = [];
        this.nextAvailableSlot = null;
      },
    });
  }

  get priceLabel(): string {
    return this.form.price_type === 'daily' ? 'Price (daily)' : 'Price (hourly)';
  }

  get isEditMode(): boolean {
    return !!this.editingListingId;
  }

  get descriptionLength(): number {
    return this.form.description?.length ?? 0;
  }

  get currentSpecFields(): ListingSpecField[] {
    if (!this.form.equipment_name) {
      return [];
    }
    return [
      ...this.commonSpecFields,
      ...(this.equipmentSpecFields[this.form.equipment_name] || []),
    ];
  }

  onEquipmentTypeChange(): void {
    const nextValues: Record<string, string> = {};
    for (const field of this.currentSpecFields) {
      nextValues[field.key] = this.specValues[field.key] || '';
    }
    this.specValues = nextValues;
  }

  private buildSpecificationsPayload(): Record<string, string> | null {
    const entries = this.currentSpecFields
      .map(field => [field.label, (this.specValues[field.key] || '').trim()] as const)
      .filter(([, value]) => !!value);
    return entries.length ? Object.fromEntries(entries) : null;
  }

  private resetForm(): void {
    this.form = {
      equipment_name: '',
      description: '',
      specifications: null,
      price: 0,
      price_type: 'hourly',
      quantity_total: 1,
      latitude: null,
      longitude: null,
      image: undefined,
    };
    this.specValues = {};
    this.editingListingId = null;
    this.editingListingImageUrl = null;
    this.selectedImageName = null;
    this.clearImagePreview();
  }

  private clearImagePreview(): void {
    if (this.imagePreviewUrl) {
      URL.revokeObjectURL(this.imagePreviewUrl);
      this.imagePreviewUrl = null;
    }
  }

  private syncSpecValues(specifications: Record<string, string>): void {
    const normalized: Record<string, string> = {};
    for (const field of this.currentSpecFields) {
      normalized[field.key] = specifications[field.label] || '';
    }
    this.specValues = normalized;
  }
}
