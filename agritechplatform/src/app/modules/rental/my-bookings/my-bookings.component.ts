import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { RentalBooking, RentalService } from '../../../services/rental/rental.service';

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-bookings.component.html',
  styleUrl: './my-bookings.component.css'
})
export class MyBookingsComponent implements OnInit {
  bookings: RentalBooking[] = [];
  loading = false;
  error: string | null = null;
  info: string | null = null;
  selectedBooking: RentalBooking | null = null;

  constructor(
    private rentalService: RentalService,
    private authService: AuthService,
  ) { }

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.error = 'No active user selected';
      return;
    }

    this.loading = true;
    this.rentalService.getMyBookings(user.userId).subscribe({
      next: bookings => {
        this.bookings = bookings;
        this.loading = false;
      },
      error: err => {
        this.error = err.message || 'Unable to load bookings';
        this.loading = false;
      },
    });
  }

  openDetails(booking: RentalBooking): void {
    this.selectedBooking = booking;
  }

  closeDetails(): void {
    this.selectedBooking = null;
  }

  pay(booking: RentalBooking): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.error = 'No active user selected';
      return;
    }

    this.rentalService.payBooking(user.userId, booking.id).subscribe({
      next: updated => {
        booking.status = updated.status;
        this.info = 'Booking payment completed.';
      },
      error: err => {
        this.error = err.message || 'Payment failed';
      },
    });
  }

  cancel(booking: RentalBooking): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.error = 'No active user selected';
      return;
    }

    this.rentalService.cancelBooking(user.userId, booking.id).subscribe({
      next: updated => {
        booking.status = updated.status;
        this.info = 'Booking cancelled successfully.';
        if (this.selectedBooking?.id === booking.id) {
          this.selectedBooking = { ...booking };
        }
      },
      error: err => {
        this.error = err.message || 'Cancel failed';
      },
    });
  }

  get calendarDays(): { date: Date; hasBooking: boolean; hasBuffer: boolean }[] {
    const days: { date: Date; hasBooking: boolean; hasBuffer: boolean }[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      const hasBooking = this.bookings.some(booking => {
        const start = new Date(booking.start_datetime);
        const end = new Date(booking.end_datetime);
        return date >= start && date <= end && !['rejected', 'cancelled'].includes(booking.status);
      });
      const hasBuffer = this.bookings.some(booking => {
        const end = new Date(booking.end_datetime);
        const bufferEnd = new Date(end.getTime() + 60 * 60 * 1000);
        return date >= end && date <= bufferEnd && !['rejected', 'cancelled'].includes(booking.status);
      });
      days.push({ date, hasBooking, hasBuffer });
    }
    return days;
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'pending':
        return 'status-pending';
      case 'approved':
        return 'status-approved';
      case 'rejected':
        return 'status-rejected';
      case 'completed':
        return 'status-completed';
      case 'cancelled':
        return 'status-cancelled';
      default:
        return '';
    }
  }

  canCancel(booking: RentalBooking): boolean {
    return booking.status === 'pending' || booking.status === 'approved';
  }

}
