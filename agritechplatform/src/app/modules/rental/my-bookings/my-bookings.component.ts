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

  pay(booking: RentalBooking): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.error = 'No active user selected';
      return;
    }

    this.rentalService.payBooking(user.userId, booking.id).subscribe({
      next: updated => {
        booking.status = updated.status;
      },
      error: err => {
        this.error = err.message || 'Payment failed';
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
        return date >= start && date <= end && booking.status !== 'rejected';
      });
      const hasBuffer = this.bookings.some(booking => {
        const end = new Date(booking.end_datetime);
        const bufferEnd = new Date(end.getTime() + 60 * 60 * 1000);
        return date >= end && date <= bufferEnd && booking.status !== 'rejected';
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
      default:
        return '';
    }
  }

}
