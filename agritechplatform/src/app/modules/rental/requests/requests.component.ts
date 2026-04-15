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
  info: string | null = null;
  selectedRequest: RentalBooking | null = null;

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

  openDetails(booking: RentalBooking): void {
    this.info = null;
    this.selectedRequest = booking;
  }

  closeDetails(): void {
    this.selectedRequest = null;
  }

  approve(booking: RentalBooking): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.error = 'No active user selected';
      return;
    }

    this.error = null;
    this.info = null;
    this.rentalService.approveBooking(user.userId, booking.id).subscribe({
      next: updated => {
        booking.status = updated.status;
        this.info = 'Request approved successfully.';
        if (this.selectedRequest?.id === booking.id) {
          this.selectedRequest = { ...booking };
        }
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

    this.error = null;
    this.info = null;
    this.rentalService.rejectBooking(user.userId, booking.id).subscribe({
      next: updated => {
        booking.status = updated.status;
        this.info = 'Request rejected successfully.';
        if (this.selectedRequest?.id === booking.id) {
          this.selectedRequest = { ...booking };
        }
      },
      error: err => this.error = err.message || 'Reject failed',
    });
  }

  get sortedRequests(): RentalBooking[] {
    return [...this.requests].sort((left, right) =>
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
      { label: 'Request ID', value: booking.id },
      { label: 'Renter', value: booking.renter_name || booking.renter_id },
      { label: 'Start', value: new Date(booking.start_datetime).toLocaleString() },
      { label: 'End', value: new Date(booking.end_datetime).toLocaleString() },
      { label: 'Units', value: String(booking.quantity_requested) },
      { label: 'Status', value: booking.status },
    ];
  }

}
