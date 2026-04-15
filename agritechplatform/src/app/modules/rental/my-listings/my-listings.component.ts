import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { BlockService } from '../../../shared/services/block.service';
import {
  AvailabilitySettings,
  AvailabilityWeekday,
  CreateListingPayload,
  RentalCalendarSlot,
  RentalListing,
  RentalPriceType,
  RentalService
} from '../../../services/rental/rental.service';

interface ListingSpecField {
  key: string;
  label: string;
  placeholder: string;
}

interface EquipmentSubtypeOption {
  label: string;
  value: string;
}

interface ListingCalendarDaySummary {
  date: string;
  label: string;
  status: 'available' | 'limited' | 'booked';
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
  calendarDays: ListingCalendarDaySummary[] = [];
  nextAvailableSlot: string | null = null;
  calendarLoading = false;
  selectedImageName: string | null = null;
  imagePreviewUrl: string | null = null;
  specValues: Record<string, string> = {};
  selectedSubtype = '';
  customSubtype = '';

  form: CreateListingPayload = {
    equipment_name: '',
    description: '',
    price: 0,
    price_type: 'hourly',
    quantity_total: 1,
    latitude: null,
    longitude: null,
    availability_settings: null,
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
  readonly subtypeOptions: Record<string, EquipmentSubtypeOption[]> = {
    Harvester: [
      { label: 'No subtype / General Harvester', value: '' },
      { label: 'Combine Harvester', value: 'Combine Harvester' },
      { label: 'Grape Harvester', value: 'Grape Harvester' },
      { label: 'Forage Harvester', value: 'Forage Harvester' },
      { label: 'Sugarcane Harvester', value: 'Sugarcane Harvester' },
      { label: 'Potato Harvester', value: 'Potato Harvester' },
      { label: 'Rice Harvester', value: 'Rice Harvester' },
      { label: 'Other', value: '__other__' },
    ],
    Tractor: [
      { label: 'No subtype / General Tractor', value: '' },
      { label: 'Utility Tractor', value: 'Utility Tractor' },
      { label: 'Row Crop Tractor', value: 'Row Crop Tractor' },
      { label: 'Orchard Tractor', value: 'Orchard Tractor' },
      { label: 'Compact Tractor', value: 'Compact Tractor' },
      { label: 'Other', value: '__other__' },
    ],
    Sprayer: [
      { label: 'No subtype / General Sprayer', value: '' },
      { label: 'Boom Sprayer', value: 'Boom Sprayer' },
      { label: 'Airblast Sprayer', value: 'Airblast Sprayer' },
      { label: 'Knapsack Sprayer', value: 'Knapsack Sprayer' },
      { label: 'Drone Sprayer', value: 'Drone Sprayer' },
      { label: 'Other', value: '__other__' },
    ],
  };
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
  readonly weekdayOptions: Array<{ value: AvailabilityWeekday; label: string }> = [
    { value: 'mon', label: 'Mon' },
    { value: 'tue', label: 'Tue' },
    { value: 'wed', label: 'Wed' },
    { value: 'thu', label: 'Thu' },
    { value: 'fri', label: 'Fri' },
    { value: 'sat', label: 'Sat' },
    { value: 'sun', label: 'Sun' },
  ];

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
      availability_settings: this.cloneAvailabilitySettings(listing.availability_settings),
      image: undefined,
    };
    this.selectedSubtype = this.getListingSubtypeValue(listing);
    this.customSubtype = this.getListingCustomSubtypeValue(listing);
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

    const availabilitySettings = this.buildAvailabilitySettingsPayload();
    if (availabilitySettings && !availabilitySettings.available_all_days && !availabilitySettings.available_days.length) {
      this.createError = 'Choose at least one available weekday or turn on "Available all days".';
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
      availability_settings: availabilitySettings,
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
    this.viewCalendar(listing);
  }

  closeDetailsModal(): void {
    this.detailsModalListing = null;
    this.selectedCalendarListingId = null;
    this.calendarSlots = [];
    this.nextAvailableSlot = null;
    this.calendarLoading = false;
  }

  viewCalendar(listing: RentalListing): void {
    this.selectedCalendarListingId = listing.id;
    this.calendarLoading = true;
    this.rentalService.getListingCalendar(listing.id, this.calendarDate).subscribe({
      next: response => {
        this.calendarSlots = response.slots;
        const nextSlot = response.slots.find(slot => slot.status === 'available');
        this.nextAvailableSlot = nextSlot
          ? `${new Date(nextSlot.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : null;
        this.calendarLoading = false;
      },
      error: err => {
        this.error = err.message || 'Unable to load calendar';
        this.calendarSlots = [];
        this.nextAvailableSlot = null;
        this.calendarLoading = false;
      },
    });
  }

  onCalendarDateChange(listing: RentalListing): void {
    this.viewCalendar(listing);
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

  get currentSubtypeOptions(): EquipmentSubtypeOption[] {
    return this.subtypeOptions[this.form.equipment_name] || [];
  }

  get showSubtypeSelector(): boolean {
    return this.currentSubtypeOptions.length > 0;
  }

  get showCustomSubtypeInput(): boolean {
    return this.selectedSubtype === '__other__';
  }

  get availabilitySettings(): AvailabilitySettings {
    if (!this.form.availability_settings) {
      this.form.availability_settings = this.createDefaultAvailabilitySettings();
    }
    return this.form.availability_settings;
  }

  onEquipmentTypeChange(): void {
    const nextValues: Record<string, string> = {};
    for (const field of this.currentSpecFields) {
      nextValues[field.key] = this.specValues[field.key] || '';
    }
    this.specValues = nextValues;
    this.selectedSubtype = '';
    this.customSubtype = '';
  }

  onSubtypeChange(): void {
    if (this.selectedSubtype !== '__other__') {
      this.customSubtype = '';
    }
  }

  getListingDisplayName(listing: RentalListing): string {
    return this.getEquipmentSubtypeLabel(listing.specifications || null) || listing.equipment_name;
  }

  getListingDisplayDetail(listing: RentalListing): string | null {
    const category = this.readSpecification(listing.specifications || null, 'Equipment Category') || listing.equipment_name;
    const subtype = this.getEquipmentSubtypeLabel(listing.specifications || null);
    return subtype ? `${category} • ${subtype}` : category || null;
  }

  toggleAvailableDay(day: AvailabilityWeekday): void {
    const current = this.availabilitySettings.available_days;
    this.availabilitySettings.available_days = current.includes(day)
      ? current.filter(value => value !== day)
      : [...current, day];
  }

  isAvailableDaySelected(day: AvailabilityWeekday): boolean {
    return this.availabilitySettings.available_days.includes(day);
  }

  getAvailabilitySummary(listing: RentalListing): string {
    const settings = listing.availability_settings;
    if (!settings || settings.available_all_days || !settings.available_days?.length) {
      return 'Available all days';
    }

    const weekdayLabels = this.weekdayOptions
      .filter(option => settings.available_days.includes(option.value))
      .map(option => option.label);

    return weekdayLabels.length ? `Available on ${weekdayLabels.join(', ')}` : 'Availability days not set';
  }

  getBookedSlotCount(): number {
    return this.calendarSlots.filter(slot => slot.status === 'booked').length;
  }

  getBufferSlotCount(): number {
    return this.calendarSlots.filter(slot => slot.status === 'buffer').length;
  }

  getAvailableSlotCount(): number {
    return this.calendarSlots.filter(slot => slot.status === 'available').length;
  }

  get relevantCalendarSlots(): RentalCalendarSlot[] {
    return this.calendarSlots.filter(slot => slot.status === 'booked' || slot.status === 'buffer' || slot.status === 'available');
  }

  get hasRelevantCalendarSlots(): boolean {
    return this.relevantCalendarSlots.length > 0;
  }

  private buildSpecificationsPayload(): Record<string, string> | null {
    const entries = this.currentSpecFields
      .map(field => [field.label, (this.specValues[field.key] || '').trim()] as const)
      .filter(([, value]) => !!value);

    if (this.form.equipment_name?.trim()) {
      entries.unshift(['Equipment Category', this.form.equipment_name.trim()]);
    }

    const subtype = this.getSelectedSubtypeLabel();
    if (subtype) {
      entries.unshift(['Equipment Subtype', subtype]);
    }

    return entries.length ? Object.fromEntries(entries) : null;
  }

  private buildAvailabilitySettingsPayload(): AvailabilitySettings | null {
    const settings = this.availabilitySettings;

    const normalized: AvailabilitySettings = {
      available_all_days: settings.available_all_days,
      available_days: settings.available_all_days ? [] : [...settings.available_days].sort(),
      working_hours_start: null,
      working_hours_end: null,
      unavailable_dates: [],
      minimum_booking_hours: null,
      advance_notice_hours: null,
    };

    const hasCustomRules = !normalized.available_all_days
      || normalized.available_days.length > 0;

    return hasCustomRules ? normalized : null;
  }

  private resetForm(): void {
    this.form = {
      equipment_name: '',
      description: '',
      specifications: null,
      availability_settings: this.createDefaultAvailabilitySettings(),
      price: 0,
      price_type: 'hourly',
      quantity_total: 1,
      latitude: null,
      longitude: null,
      image: undefined,
    };
    this.specValues = {};
    this.selectedSubtype = '';
    this.customSubtype = '';
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

  private createDefaultAvailabilitySettings(): AvailabilitySettings {
    return {
      available_all_days: true,
      available_days: [],
      working_hours_start: null,
      working_hours_end: null,
      unavailable_dates: [],
      minimum_booking_hours: null,
      advance_notice_hours: null,
    };
  }

  private cloneAvailabilitySettings(settings?: AvailabilitySettings | null): AvailabilitySettings {
    return {
      ...this.createDefaultAvailabilitySettings(),
      ...(settings || {}),
      available_days: [...(settings?.available_days || [])],
      unavailable_dates: [...(settings?.unavailable_dates || [])],
    };
  }

  private getSelectedSubtypeLabel(): string {
    if (this.selectedSubtype === '__other__') {
      return this.customSubtype.trim();
    }
    return this.selectedSubtype.trim();
  }

  private getListingSubtypeValue(listing: RentalListing): string {
    const subtype = this.readSpecification(listing.specifications || null, 'Equipment Subtype');
    if (!subtype) {
      return '';
    }

    const options = this.subtypeOptions[listing.equipment_name] || [];
    return options.some(option => option.value === subtype) ? subtype : '__other__';
  }

  private getListingCustomSubtypeValue(listing: RentalListing): string {
    const subtype = this.readSpecification(listing.specifications || null, 'Equipment Subtype');
    if (!subtype) {
      return '';
    }

    const options = this.subtypeOptions[listing.equipment_name] || [];
    return options.some(option => option.value === subtype) ? '' : subtype;
  }

  private getEquipmentSubtypeLabel(specifications: Record<string, string> | null): string | null {
    return this.readSpecification(specifications, 'Equipment Subtype');
  }

  private readSpecification(specifications: Record<string, string> | null, label: string): string | null {
    const value = specifications?.[label]?.trim();
    return value ? value : null;
  }

  private loadCalendarDays(listingId: string): void {
    const requests = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() + index);
      const dayValue = date.toISOString().slice(0, 10);
      return this.rentalService.getListingCalendar(listingId, dayValue);
    });

    forkJoin(requests).subscribe({
      next: responses => {
        this.calendarDays = responses.map(response => {
          const dayDate = new Date(`${response.date}T00:00:00`);
          return {
            date: response.date,
            label: dayDate.toLocaleDateString([], { weekday: 'short', day: '2-digit' }),
            status: this.buildDayStatus(response.slots),
          };
        });
      },
      error: () => {
        this.calendarDays = [];
      },
    });
  }

  private buildDayStatus(slots: RentalCalendarSlot[]): 'available' | 'limited' | 'booked' {
    const availableCount = slots.filter(slot => slot.status === 'available').length;
    if (availableCount === 0) {
      return 'booked';
    }
    if (availableCount === slots.length) {
      return 'available';
    }
    return 'limited';
  }
}
