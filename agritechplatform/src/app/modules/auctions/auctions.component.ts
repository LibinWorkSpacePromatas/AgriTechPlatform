import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuctionsService, AuctionDashboardSummary, AuctionItem } from '../../services/auctions/auctions.service';
import { CloudinaryService } from '../../services/cloudinary/cloudinary.service';
import { AuthService } from '../../core/services/auth.service';
import {
  formatAuctionDateInput,
  formatAuctionTimeInput,
  getAuctionNowPlusMinutes,
  zonedDateTimeToUtcIso
} from '../../shared/utils/auction-time.util';
import { environment } from '../../../environments/environment';

type AuctionTab = 'all' | 'active' | 'upcoming' | 'completed';
type TimeField = 'start_time' | 'end_time';
type Meridiem = 'AM' | 'PM';

function abnValidator(control: AbstractControl): ValidationErrors | null {
  const raw = (control.value || '').replace(/\s/g, '');
  if (!/^\d{11}$/.test(raw)) return { invalidAbn: true };
  const digits = raw.split('').map(Number);
  digits[0] -= 1;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  let total = 0;
  for (let i = 0; i < 11; i++) { total += digits[i] * weights[i]; }
  return total % 89 === 0 ? null : { invalidAbn: true };
}

function auctionScheduleValidator(control: AbstractControl): ValidationErrors | null {
  const startDate = control.get('start_date')?.value as string | null;
  const startTime = control.get('start_time')?.value as string | null;
  const endDate = control.get('end_date')?.value as string | null;
  const endTime = control.get('end_time')?.value as string | null;
  if (!startDate || !startTime || !endDate || !endTime) return null;

  const startIso = zonedDateTimeToUtcIso(startDate, startTime);
  const endIso = zonedDateTimeToUtcIso(endDate, endTime);
  const startMs = startIso ? new Date(startIso).getTime() : Number.NaN;
  const endMs = endIso ? new Date(endIso).getTime() : Number.NaN;
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return { invalidDateTime: true };
  if (startMs <= Date.now()) return { startInPast: true };
  if (endMs <= startMs) return { endBeforeStart: true };
  return null;
}

@Component({
  selector: 'app-auctions',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './auctions.component.html',
  styleUrls: ['./auctions.component.css']
})
export class AuctionsComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly auctionsService = inject(AuctionsService);
  private readonly cloudinaryService = inject(CloudinaryService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('confettiCanvas') confettiCanvas?: ElementRef<HTMLCanvasElement>;

  protected readonly currentUser = this.authService.getCurrentUser();
  protected readonly isLoading = signal(true);
  protected readonly isRegisteredSeller = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly submitSuccess = signal(false);
  protected readonly simulateSeller = signal(false);
  protected readonly dashboard = signal<AuctionDashboardSummary | null>(null);
  protected readonly allAuctions = signal<AuctionItem[]>([]);
  protected readonly activeTab = signal<AuctionTab>('all');
  protected readonly pageAnimated = signal(false);
  protected readonly newBadgeVisible = signal(!localStorage.getItem('auctionTabSeen'));
  protected readonly nowTick = signal(Date.now());
  protected readonly onboardingStep = signal(1);
  protected readonly registrationCompleted = signal(false);
  protected readonly bidAmount = signal(1720);
  protected readonly bidDelta = signal(120);
  protected readonly bidFlash = signal(false);
  protected readonly previewImageUrl = environment.auctionPreviewImageUrl ?? '';
  protected readonly uploadedImageUrl = signal<string | null>(null);
  protected readonly isUploading = signal(false);
  protected readonly createAuctionModalOpen = signal(false);
  protected readonly createAuctionError = signal<string | null>(null);
  protected readonly isCreatingAuction = signal(false);
  protected readonly startPickerOpen = signal(false);
  protected readonly endPickerOpen = signal(false);
  protected readonly activeTimePicker = signal<TimeField | null>(null);
  protected readonly pickerPeriod = signal<Meridiem>('AM');
  protected readonly pickerHour = signal<number>(12);
  protected readonly pickerMinute = signal<number>(0);
  private bidTimer?: ReturnType<typeof setInterval>;
  private tickTimer?: ReturnType<typeof setInterval>;
  private bidCount = 0;

  protected readonly onboardingForm = this.fb.group({
    business_name: ['', [Validators.required]],
    abn: ['', [Validators.required, abnValidator]],
    contact_number: ['', [Validators.required, Validators.pattern(/^(\+61|0)[2-9]\d{8}$/)]],
    bsb: ['', [Validators.required, Validators.pattern(/^\d{3}-\d{3}$/)]],
    account_number: ['', [Validators.required, Validators.pattern(/^\d{6,10}$/)]],
    agree_terms: [false, [Validators.requiredTrue]]
  });

  protected readonly stepTitles = ['Business Details', 'Bank Account', 'Review & Confirm'];
  protected readonly auctionCropOptions = [
    'Almonds',
    'Citrus Oranges',
    'Table Grapes',
    'Nectarines',
    'Peaches',
    'Chardonnay',
    'Colombard',
    'Cabernet',
    'Shiraz',
    'Olives EVOO',
  ];

  protected readonly createAuctionForm = this.fb.group({
    produce_name: ['', [Validators.required, Validators.minLength(2)]],
    quantity: [null as number | null, [Validators.required, Validators.min(0.01)]],
    base_price: [null as number | null, [Validators.required, Validators.min(1)]],
    start_date: ['', [Validators.required]],
    start_time: ['', [Validators.required]],
    end_date: ['', [Validators.required]],
    end_time: ['', [Validators.required]],
  }, { validators: [auctionScheduleValidator] });

  protected onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.isUploading.set(true);
    this.createAuctionError.set(null);
    this.cloudinaryService.upload(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.uploadedImageUrl.set(result.secure_url);
          this.isUploading.set(false);
        },
        error: err => {
          this.isUploading.set(false);
          this.createAuctionError.set(err.message || 'Could not upload image.');
        }
      });
  }

  private startBidSimulation(): void {
    const increments = [20, 35, 15, 50, 25];
    const delays = [3200, 5100, 7800, 11000, 15500];
    delays.forEach((delay, i) => {
      setTimeout(() => {
        const inc = increments[i];
        this.bidDelta.set(inc);
        this.bidAmount.update(v => v + inc);
        this.bidFlash.set(true);
        setTimeout(() => this.bidFlash.set(false), 900);
      }, delay);
    });
  }

  ngOnInit(): void {
    localStorage.setItem('auctionTabSeen', 'true');
    this.newBadgeVisible.set(false);
    this.loadState();
    setTimeout(() => this.pageAnimated.set(true), 20);
    this.tickTimer = setInterval(() => this.nowTick.set(Date.now()), 1000);
    this.startBidSimulation();

    // Re-evaluate mins when start/end date or start time changes.
    this.createAuctionForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.nowTick.set(Date.now()));
  }

  ngAfterViewInit(): void {
    if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
      this.observeRevealCards();
    }
  }

  ngOnDestroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.bidTimer) clearInterval(this.bidTimer);
  }

  protected loadState(): void {
    const userId = this.currentUser?.userId;
    if (!userId) {
      this.isLoading.set(false);
      return;
    }

    this.auctionsService.getProfile(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profile => {
          const registered = !!profile.exists;
          this.isRegisteredSeller.set(registered);
          this.isLoading.set(false);
          if (registered) {
            this.loadDashboard();
          }
        },
        error: () => {
          this.isLoading.set(false);
        }
      });
  }

  protected loadDashboard(): void {
    const userId = this.currentUser?.userId;
    if (!userId) {
      return;
    }

    this.auctionsService.getDashboard(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: summary => {
          this.dashboard.set(summary);
        }
      });

    this.refreshAuctions();
  }

  protected refreshAuctions(): void {
    const userId = this.currentUser?.userId;
    if (!userId) {
      return;
    }

    this.auctionsService.getMyAuctions(userId, 'all')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: rows => this.allAuctions.set(rows),
        error: () => this.allAuctions.set([])
      });
  }

  protected onSimulateSellerToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.simulateSeller.set(checked);
    if (checked) {
      this.isRegisteredSeller.set(true);
      this.loadDashboard();
    } else {
      this.isRegisteredSeller.set(false);
      this.submitSuccess.set(false);
    }
  }

  protected onABNInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 11);
    this.onboardingForm.patchValue({ abn: digits }, { emitEvent: false });
    input.value = digits;
  }

  protected onContactInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let val = input.value.replace(/[^\d+]/g, '');
    // Ensure starts with +61 or 0
    if (val.startsWith('61') && !val.startsWith('+61')) {
      val = '+' + val;
    }
    this.onboardingForm.patchValue({ contact_number: val }, { emitEvent: false });
    input.value = val;
  }

  protected onAccountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 10);
    this.onboardingForm.patchValue({ account_number: digits }, { emitEvent: false });
    input.value = digits;
  }

  protected onBSBInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    const formatted = digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
    this.onboardingForm.patchValue({ bsb: formatted }, { emitEvent: false });
    input.value = formatted;
  }

  protected nextOnboardingStep(): void {
    this.submitError.set(null);
    if (!this.canAdvanceCurrentStep()) {
      return;
    }
    this.onboardingStep.update(step => Math.min(4, step + 1));
  }

  protected previousOnboardingStep(): void {
    this.submitError.set(null);
    this.onboardingStep.update(step => Math.max(1, step - 1));
  }

  protected canAdvanceCurrentStep(): boolean {
    const step = this.onboardingStep();
    if (step === 1) {
      this.onboardingForm.get('business_name')?.markAsTouched();
      this.onboardingForm.get('abn')?.markAsTouched();
      this.onboardingForm.get('contact_number')?.markAsTouched();
      return !!this.onboardingForm.get('business_name')?.valid &&
             !!this.onboardingForm.get('abn')?.valid &&
             !!this.onboardingForm.get('contact_number')?.valid;
    }

    if (step === 2) {
      this.onboardingForm.get('bsb')?.markAsTouched();
      this.onboardingForm.get('account_number')?.markAsTouched();
      return !!this.onboardingForm.get('bsb')?.valid && !!this.onboardingForm.get('account_number')?.valid;
    }

    if (step === 3) {
      this.onboardingForm.get('agree_terms')?.markAsTouched();
      return !!this.onboardingForm.get('agree_terms')?.valid;
    }
    return true;
  }

  protected submitRegistration(): void {
    this.submitError.set(null);
    this.onboardingForm.markAllAsTouched();

    if (this.onboardingForm.invalid || !this.currentUser?.userId) {
      return;
    }

    const raw = this.onboardingForm.getRawValue();
    const abn = (raw.abn || '').replace(/\s/g, '');

    this.auctionsService.createProfile({
      user_id: this.currentUser.userId,
      business_name: raw.business_name || '',
      abn,
      bsb: (raw.bsb || '').replace(/\D/g, ''),
      account_number: raw.account_number || '',
      gst_registered: false
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitSuccess.set(true);
          this.registrationCompleted.set(true);
          this.onboardingStep.set(4);
          this.playConfetti();
        },
        error: err => this.submitError.set(err.message || 'Could not complete registration.')
      });
  }

  protected continueToDashboard(): void {
    this.isRegisteredSeller.set(true);
    this.loadDashboard();
  }

  protected selectTab(tab: AuctionTab): void {
    this.activeTab.set(tab);
  }

  protected liveStats() {
    this.nowTick();
    const now = Date.now();
    const rows = this.allAuctions();
    return {
      active: rows.filter(r => new Date(r.start_time).getTime() <= now && new Date(r.end_time).getTime() > now).length,
      upcoming: rows.filter(r => new Date(r.start_time).getTime() > now).length,
      ended: rows.filter(r => new Date(r.end_time).getTime() <= now).length,
      total_revenue: rows.reduce((sum, r) => sum + (r.final_price ?? r.highest_bid ?? 0), 0)
    };
  }

  protected filteredAuctions(): AuctionItem[] {
    this.nowTick();
    const tab = this.activeTab();
    const rows = this.allAuctions();
    const now = Date.now();
    if (tab === 'all') return rows;
    if (tab === 'active') return rows.filter(r => new Date(r.start_time).getTime() <= now && new Date(r.end_time).getTime() > now);
    if (tab === 'upcoming') return rows.filter(r => new Date(r.start_time).getTime() > now);
    if (tab === 'completed') return rows.filter(r => new Date(r.end_time).getTime() <= now);
    return rows;
  }

  protected emptyTitle(): string {
    const tab = this.activeTab();
    if (tab === 'all') return 'No auctions yet';
    if (tab === 'active') return 'No active auctions yet';
    if (tab === 'upcoming') return 'No upcoming auctions yet';
    return 'No completed auctions yet';
  }

  protected emptyIllustrationState(): AuctionTab {
    return this.activeTab();
  }

  protected showCreateFirstAuctionButton(): boolean {
    return this.allAuctions().length === 0;
  }

  protected statusClass(status: string): string {
    return `status-${status}`;
  }

  protected prettyStatus(status: string): string {
    return status[0].toUpperCase() + status.slice(1);
  }

  protected formatMoney(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return '--';
    }
    return `$${Math.round(value).toLocaleString()}`;
  }

  protected formatTimeRange(row: AuctionItem): string {
    return `${formatAuctionDateInput(new Date(row.start_time))} - ${formatAuctionDateInput(new Date(row.end_time))}`;
  }

  protected isAuctionActive(row: AuctionItem): boolean {
    const now = Date.now();
    return new Date(row.start_time).getTime() <= now && new Date(row.end_time).getTime() > now;
  }

  protected countdownLabel(row: AuctionItem): string {
    this.nowTick();
    const end = new Date(row.end_time).getTime();
    const diff = Math.max(0, end - Date.now());
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2,'0')} : ${String(m).padStart(2,'0')} : ${String(s).padStart(2,'0')}`;
  }

  protected timeLeftLabel(row: AuctionItem): string {
    this.nowTick();
    const now = Date.now();
    const start = new Date(row.start_time).getTime();
    const end = new Date(row.end_time).getTime();

    if (row.status === 'ended' || row.status === 'cancelled') {
      return 'Ended';
    }
    if (row.status === 'upcoming' && start > now) {
      return `Starts in ${this.humanDuration(start - now)}`;
    }
    if (end > now) {
      return `Ends in ${this.humanDuration(end - now)}`;
    }
    return 'Ending soon';
  }

  protected trackByAuction(_: number, row: AuctionItem): string {
    return row.id;
  }

  protected displayStatus(row: AuctionItem): 'Active' | 'Upcoming' | 'Completed' {
    this.nowTick();
    const now = Date.now();
    const start = new Date(row.start_time).getTime();
    const end = new Date(row.end_time).getTime();
    if (end <= now) return 'Completed';
    if (start > now) return 'Upcoming';
    return 'Active';
  }

  protected displayStatusClass(row: AuctionItem): string {
    const s = this.displayStatus(row);
    if (s === 'Upcoming') return 'status-scheduled';
    if (s === 'Completed') return 'status-sold';
    return 'status-live';
  }

  protected goToCreateAuction(): void {
    this.openCreateAuctionModal();
  }

  protected viewAuctionDetail(row: AuctionItem): void {
    this.router.navigate(['/auctions', row.id]);
  }

  protected goToActiveAuctions(): void {
    this.activeTab.set('active');
  }

  protected progressPercent(): number {
    return this.onboardingStep() * 25;
  }

  protected openCreateAuctionModal(): void {
    this.createAuctionError.set(null);
    this.uploadedImageUrl.set(null);
    this.createAuctionForm.reset({
      produce_name: '',
      quantity: null,
      base_price: null,
      start_date: '',
      start_time: '',
      end_date: '',
      end_time: '',
    });
    this.startPickerOpen.set(false);
    this.endPickerOpen.set(false);
    this.createAuctionModalOpen.set(true);
  }

  protected closeCreateAuctionModal(): void {
    if (this.isCreatingAuction()) {
      return;
    }
    this.createAuctionModalOpen.set(false);
    this.closeTimePickers();
    this.createAuctionError.set(null);
  }

  protected removeSelectedAuctionImage(): void {
    if (this.isUploading() || this.isCreatingAuction()) {
      return;
    }
    this.uploadedImageUrl.set(null);
  }

  protected toggleTimePicker(field: TimeField): void {
    if (this.activeTimePicker() === field) {
      this.closeTimePickers();
      return;
    }
    this.openTimePicker(field);
  }

  protected closeTimePickers(): void {
    this.activeTimePicker.set(null);
  }

  protected getTimeDisplay(value: string | null | undefined): string {
    if (!value) return '--:-- --';
    const parts = this.from24Hour(value);
    if (!parts) return '--:-- --';
    return `${this.pad(parts.hour12)}:${this.pad(parts.minute)} ${parts.period}`;
  }

  protected pickerPeriods(field: TimeField): Meridiem[] {
    const slots = this.getTimeSlots(field);
    return Array.from(new Set(slots.map(slot => slot.period)));
  }

  protected pickerHours(field: TimeField): number[] {
    const period = this.pickerPeriod();
    const slots = this.getTimeSlots(field).filter(slot => slot.period === period);
    return Array.from(new Set(slots.map(slot => slot.hour12)));
  }

  protected pickerMinutes(field: TimeField): number[] {
    const period = this.pickerPeriod();
    const hour = this.pickerHour();
    const slots = this.getTimeSlots(field).filter(slot => slot.period === period && slot.hour12 === hour);
    return Array.from(new Set(slots.map(slot => slot.minute)));
  }

  protected choosePickerPeriod(field: TimeField, period: Meridiem): void {
    this.pickerPeriod.set(period);
    this.normalizePickerSelection(field);
    this.commitPickerValue(field);
  }

  protected choosePickerHour(field: TimeField, hour: number): void {
    this.pickerHour.set(hour);
    this.normalizePickerSelection(field);
    this.commitPickerValue(field);
  }

  protected choosePickerMinute(field: TimeField, minute: number): void {
    this.pickerMinute.set(minute);
    this.normalizePickerSelection(field);
    this.commitPickerValue(field);
    this.closeTimePickers();
  }

  protected submitCreateAuction(): void {
    this.createAuctionError.set(null);
    this.createAuctionForm.markAllAsTouched();
    this.createAuctionForm.updateValueAndValidity();

    if (this.createAuctionForm.invalid) {
      if (this.createAuctionForm.errors?.['startInPast']) {
        this.createAuctionError.set('Start date and time must be in the future.');
      } else if (this.createAuctionForm.errors?.['endBeforeStart']) {
        this.createAuctionError.set('End date and time must be after start date and time.');
      } else if (this.createAuctionForm.errors?.['invalidDateTime']) {
        this.createAuctionError.set('Please provide valid start and end date-time values.');
      } else {
        this.createAuctionError.set('Please complete all required fields.');
      }
      return;
    }
    if (!this.currentUser?.userId) {
      this.createAuctionError.set('User session not found. Please sign in again.');
      return;
    }
    if (!this.uploadedImageUrl()) {
      this.createAuctionError.set('Please upload an image for this auction.');
      return;
    }

    const raw = this.createAuctionForm.getRawValue();
    const startIso = zonedDateTimeToUtcIso(raw.start_date, raw.start_time);
    const endIso = zonedDateTimeToUtcIso(raw.end_date, raw.end_time);
    if (!startIso || !endIso) {
      this.createAuctionError.set('Please provide valid start and end date-time values.');
      return;
    }

    this.isCreatingAuction.set(true);
    this.auctionsService.createAuction({
      user_id: this.currentUser.userId,
      produce_name: (raw.produce_name || '').trim(),
      quantity: Number(raw.quantity),
      unit: 'kg',
      base_price: Number(raw.base_price),
      start_time: startIso,
      end_time: endIso,
      image_url: this.uploadedImageUrl(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isCreatingAuction.set(false);
          this.createAuctionModalOpen.set(false);
          this.activeTab.set('upcoming');
          this.loadDashboard();
        },
        error: err => {
          this.isCreatingAuction.set(false);
          this.createAuctionError.set(err.message || 'Could not create auction.');
        }
      });
  }

  protected minStartDate(): string {
    this.nowTick();
    return formatAuctionDateInput(new Date());
  }

  protected minEndDate(): string {
    this.nowTick();
    const today = formatAuctionDateInput(new Date());
    const startDate = this.createAuctionForm.get('start_date')?.value as string | null;
    if (!startDate) return today;
    return startDate > today ? startDate : today;
  }

  protected minStartTimeForSelectedDate(): string {
    this.nowTick();
    const selectedStartDate = this.createAuctionForm.get('start_date')?.value as string | null;
    const nowPlus1 = getAuctionNowPlusMinutes(1);
    const today = formatAuctionDateInput(nowPlus1);
    if (selectedStartDate === today) {
      return formatAuctionTimeInput(nowPlus1);
    }
    return '00:00';
  }

  protected minEndTimeForSelectedDate(): string {
    this.nowTick();
    const mins: string[] = [];
    const selectedEndDate = this.createAuctionForm.get('end_date')?.value as string | null;
    if (!selectedEndDate) return '00:00';

    const nowPlus1 = getAuctionNowPlusMinutes(1);
    const today = formatAuctionDateInput(nowPlus1);
    if (selectedEndDate === today) {
      mins.push(formatAuctionTimeInput(nowPlus1));
    }

    const startDate = this.createAuctionForm.get('start_date')?.value as string | null;
    const startTime = this.createAuctionForm.get('start_time')?.value as string | null;
    if (startDate && startTime && selectedEndDate === startDate) {
      const startIso = zonedDateTimeToUtcIso(startDate, startTime);
      if (startIso) {
        const start = new Date(startIso);
        mins.push(formatAuctionTimeInput(new Date(start.getTime() + 60_000)));
      }
    }

    return mins.length ? mins.sort().at(-1)! : '00:00';
  }

  private openTimePicker(field: TimeField): void {
    this.activeTimePicker.set(field);
    this.initializePickerSelection(field);
  }

  private initializePickerSelection(field: TimeField): void {
    const slots = this.getTimeSlots(field);
    if (!slots.length) {
      this.pickerPeriod.set('AM');
      this.pickerHour.set(12);
      this.pickerMinute.set(0);
      return;
    }

    const current = this.createAuctionForm.get(field)?.value as string | null;
    const activeSlot = current ? slots.find(slot => slot.value === current) : null;
    const target = activeSlot ?? slots[0];
    this.pickerPeriod.set(target.period);
    this.pickerHour.set(target.hour12);
    this.pickerMinute.set(target.minute);
    this.normalizePickerSelection(field);
  }

  private normalizePickerSelection(field: TimeField): void {
    const slots = this.getTimeSlots(field);
    if (!slots.length) return;

    const validPeriods = Array.from(new Set(slots.map(slot => slot.period)));
    let period = this.pickerPeriod();
    if (!validPeriods.includes(period)) {
      period = validPeriods[0];
      this.pickerPeriod.set(period);
    }

    const validHours = Array.from(new Set(slots.filter(slot => slot.period === period).map(slot => slot.hour12)));
    let hour = this.pickerHour();
    if (!validHours.includes(hour)) {
      hour = validHours[0];
      this.pickerHour.set(hour);
    }

    const validMinutes = Array.from(new Set(
      slots
        .filter(slot => slot.period === period && slot.hour12 === hour)
        .map(slot => slot.minute)
    ));
    let minute = this.pickerMinute();
    if (!validMinutes.includes(minute)) {
      minute = validMinutes[0];
      this.pickerMinute.set(minute);
    }
  }

  private commitPickerValue(field: TimeField): void {
    const slots = this.getTimeSlots(field);
    if (!slots.length) return;

    const selected = this.to24Hour(this.pickerHour(), this.pickerMinute(), this.pickerPeriod());
    const value = slots.some(slot => slot.value === selected) ? selected : slots[0].value;
    this.createAuctionForm.get(field)?.setValue(value);
    this.createAuctionForm.get(field)?.markAsTouched();
    this.createAuctionForm.updateValueAndValidity();
  }

  private getTimeSlots(field: TimeField): Array<{ value: string; hour12: number; minute: number; period: Meridiem }> {
    const minMinute = this.getMinMinuteOfDay(field);
    if (minMinute > 1439) return [];

    const slots: Array<{ value: string; hour12: number; minute: number; period: Meridiem }> = [];
    for (let minuteOfDay = minMinute; minuteOfDay <= 1439; minuteOfDay += 1) {
      const hour24 = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;
      const period: Meridiem = hour24 >= 12 ? 'PM' : 'AM';
      const hour12 = (hour24 % 12) || 12;
      slots.push({
        value: `${this.pad(hour24)}:${this.pad(minute)}`,
        hour12,
        minute,
        period
      });
    }
    return slots;
  }

  private getMinMinuteOfDay(field: TimeField): number {
    const nowPlus1 = getAuctionNowPlusMinutes(1);
    const today = formatAuctionDateInput(nowPlus1);
    const thisFieldDate = this.createAuctionForm.get(field === 'start_time' ? 'start_date' : 'end_date')?.value as string | null;
    let minMinute = 0;

    if (thisFieldDate && thisFieldDate === today) {
      const [hours, minutes] = formatAuctionTimeInput(nowPlus1).split(':').map(Number);
      minMinute = (hours * 60) + minutes;
    }

    if (field === 'end_time') {
      const startDate = this.createAuctionForm.get('start_date')?.value as string | null;
      const startTime = this.createAuctionForm.get('start_time')?.value as string | null;
      if (thisFieldDate && startDate && startTime && thisFieldDate === startDate) {
        const parsedStart = this.from24Hour(startTime);
        if (parsedStart) {
          const startMinute = this.to24HourNumber(parsedStart.hour12, parsedStart.minute, parsedStart.period);
          minMinute = Math.max(minMinute, startMinute + 1);
        }
      }
    }

    return minMinute;
  }

  private from24Hour(value: string): { hour12: number; minute: number; period: Meridiem } | null {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return null;
    const hour24 = Number(match[1]);
    const minute = Number(match[2]);
    if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) return null;
    const period: Meridiem = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = (hour24 % 12) || 12;
    return { hour12, minute, period };
  }

  private to24Hour(hour12: number, minute: number, period: Meridiem): string {
    const hour24 = this.to24HourNumber(hour12, minute, period);
    return `${this.pad(hour24)}:${this.pad(minute)}`;
  }

  private to24HourNumber(hour12: number, _minute: number, period: Meridiem): number {
    if (period === 'AM') {
      return hour12 === 12 ? 0 : hour12;
    }
    return hour12 === 12 ? 12 : hour12 + 12;
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  private validateAbnChecksum(abn: string): boolean {
    if (!/^\d{11}$/.test(abn)) {
      return false;
    }
    const digits = abn.split('').map(Number);
    digits[0] -= 1;
    const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
    const sum = digits.reduce((acc, digit, idx) => acc + (digit * weights[idx]), 0);
    return sum % 89 === 0;
  }

  private humanDuration(ms: number): string {
    const totalMinutes = Math.max(1, Math.floor(ms / 60000));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  private observeRevealCards(): void {
    const targets = Array.from(document.querySelectorAll('.reveal-card')) as HTMLElement[];
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.2 }
    );
    targets.forEach(target => observer.observe(target));
  }

  private playConfetti(): void {
    const canvas = this.confettiCanvas?.nativeElement;
    if (!canvas || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
      return;
    }

    const parent = canvas.parentElement;
    if (!parent) {
      return;
    }

    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const colors = ['#2D6A4F', '#EAF3DE', '#FFFFFF'];
    const particles = Array.from({ length: 80 }).map(() => ({
      x: Math.random() * canvas.width,
      y: -10 - Math.random() * canvas.height * 0.4,
      vx: (Math.random() - 0.5) * 2,
      vy: 2 + Math.random() * 3,
      size: 3 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2
    }));

    const start = performance.now();
    const duration = 2500;
    const animate = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += 0.05;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      if (elapsed < duration) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    requestAnimationFrame(animate);
  }
}
