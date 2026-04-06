import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RentalDashboardComponent } from './rental-dashboard/rental-dashboard.component';
import { MyListingsComponent } from './my-listings/my-listings.component';
import { RentEquipmentComponent } from './rent-equipment/rent-equipment.component';
import { MyBookingsComponent } from './my-bookings/my-bookings.component';
import { RequestsComponent } from './requests/requests.component';

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
export class RentalComponent {
  activeTab: 'overview' | 'my-listings' | 'rent-equipment' | 'my-bookings' | 'requests' = 'overview';

}
