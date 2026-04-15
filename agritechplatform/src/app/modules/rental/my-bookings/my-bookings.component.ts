import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { RentalBooking, RentalService } from '../../../services/rental/rental.service';

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
    this.info = null;
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

    this.error = null;
    this.info = null;
    this.rentalService.payBooking(user.userId, booking.id).subscribe({
      next: updated => {
        booking.status = updated.status;
        this.info = 'Booking payment completed.';
        if (this.selectedBooking?.id === booking.id) {
          this.selectedBooking = { ...booking };
        }
      },
      error: err => {
        this.error = err.message || 'Payment failed';
      },
    });
  }

  canCancel(booking: RentalBooking): boolean {
    return booking.status === 'pending' || booking.status === 'approved';
  }

  cancel(booking: RentalBooking): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.error = 'No active user selected';
      return;
    }

    this.error = null;
    this.info = null;
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

  get sortedBookings(): RentalBooking[] {
    return [...this.bookings].sort((left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );
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

  getDetailRows(booking: RentalBooking): Array<{ label: string; value: string }> {
    return [
      { label: 'Booking ID', value: booking.id },
      { label: 'Start', value: new Date(booking.start_datetime).toLocaleString() },
      { label: 'End', value: new Date(booking.end_datetime).toLocaleString() },
      { label: 'Units', value: String(booking.quantity_requested) },
      { label: 'Total', value: `${booking.total_price ?? 0}` },
      { label: 'Status', value: booking.status },
    ];
  }

}
