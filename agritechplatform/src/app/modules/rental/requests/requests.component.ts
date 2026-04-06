import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { RentalBooking, RentalService } from '../../../services/rental/rental.service';

@Component({
  selector: 'app-requests',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './requests.component.html',
  styleUrl: './requests.component.css'
})
export class RequestsComponent implements OnInit {
  requests: RentalBooking[] = [];
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
