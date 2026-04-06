import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RentalDashboardResponse, RentalService } from '../../../services/rental/rental.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-rental-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rental-dashboard.component.html',
  styleUrl: './rental-dashboard.component.css'
})
export class RentalDashboardComponent implements OnInit {
  metrics: RentalDashboardResponse = {
    total_listings: 0,
    active_listings: 0,
    bookings_given: 0,
    bookings_taken: 0,
    revenue: 0,
  };
  error: string | null = null;
  loading = false;

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
    this.rentalService.getDashboard(user.userId).subscribe({
      next: response => {
        this.metrics = response;
        this.loading = false;
      },
      error: err => {
        this.error = err.message || 'Unable to load rental dashboard';
        this.loading = false;
      },
    });
  }

}
