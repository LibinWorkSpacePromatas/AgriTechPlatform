import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { RentalDashboardComponent } from './rental-dashboard/rental-dashboard.component';
import { MyListingsComponent } from './my-listings/my-listings.component';
import { RentEquipmentComponent } from './rent-equipment/rent-equipment.component';
import { MyBookingsComponent } from './my-bookings/my-bookings.component';
import { RequestsComponent } from './requests/requests.component';
import { AuthService } from '../../core/services/auth.service';
import { RentalService } from '../../services/rental/rental.service';

@Component({
  selector: 'app-rental',
  standalone: true,
  imports: [
    CommonModule,
    RentalDashboardComponent,
    MyListingsComponent,
    RentEquipmentComponent,
    MyBookingsComponent,
    RequestsComponent,
  ],
  templateUrl: './rental.component.html',
  styleUrl: './rental.component.css'
})
export class RentalComponent implements OnInit {
  activeTab: 'overview' | 'my-listings' | 'rent-equipment' | 'my-bookings' | 'requests' = 'overview';
  pendingRequestCount = 0;
  approvedBookingCount = 0;

  constructor(
    private authService: AuthService,
    private rentalService: RentalService,
  ) {}

  ngOnInit(): void {
    this.loadNotificationCounts();
  }

  selectTab(tab: 'overview' | 'my-listings' | 'rent-equipment' | 'my-bookings' | 'requests'): void {
    this.activeTab = tab;
    this.loadNotificationCounts();
  }

  private loadNotificationCounts(): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.pendingRequestCount = 0;
      this.approvedBookingCount = 0;
      return;
    }

    forkJoin({
      requests: this.rentalService.getRequests(user.userId),
      bookings: this.rentalService.getMyBookings(user.userId),
    }).subscribe({
      next: ({ requests, bookings }) => {
        this.pendingRequestCount = requests.filter(request => request.status === 'pending').length;
        this.approvedBookingCount = bookings.filter(booking => booking.status === 'approved').length;
      },
      error: () => {
        this.pendingRequestCount = 0;
        this.approvedBookingCount = 0;
      },
    });
  }

}
