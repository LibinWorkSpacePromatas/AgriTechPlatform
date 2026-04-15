import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { RentalBooking, RentalService } from '../../../services/rental/rental.service';

@Component({
  selector: 'app-requests',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './requests.component.html',
  styleUrl: './requests.component.css'
})
export class RequestsComponent implements OnInit {
  requests: RentalBooking[] = [];
  loading = false;
  error: string | null = null;
  selectedDate = this.toDateInputValue(new Date());

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
    this.rentalService.getRequests(user.userId).subscribe({
      next: requests => {
        this.requests = requests;
        this.loading = false;
      },
      error: err => {
        this.error = err.message || 'Unable to load requests';
        this.loading = false;
      },
    });
  }

  approve(booking: RentalBooking): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.error = 'No active user selected';
      return;
    }

    this.rentalService.approveBooking(user.userId, booking.id).subscribe({
      next: updated => {
        booking.status = updated.status;
      },
      error: err => this.error = err.message || 'Approve failed',
    });
  }

  reject(booking: RentalBooking): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.error = 'No active user selected';
      return;
    }

    this.rentalService.rejectBooking(user.userId, booking.id).subscribe({
      next: updated => {
        booking.status = updated.status;
      },
      error: err => this.error = err.message || 'Reject failed',
    });
  }

  get filteredRequests(): RentalBooking[] {
    if (!this.selectedDate) {
      return this.requests;
    }

    const selected = new Date(`${this.selectedDate}T00:00:00`);
    return this.requests.filter(booking => this.isBookingOnDate(booking, selected));
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

  private isBookingOnDate(booking: RentalBooking, date: Date): boolean {
    if (booking.status === 'rejected') {
      return false;
    }

    const start = new Date(booking.start_datetime);
    const end = new Date(booking.end_datetime);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    return start < dayEnd && end > dayStart;
  }

  private toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

}
