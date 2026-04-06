import { Routes } from '@angular/router';
import { authGuard, farmerGuard, bidderGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    {
        path: 'select-user',
        loadComponent: () => import('./modules/user-selection/user-selection.component').then(m => m.UserSelectionComponent)
    },
    // ── Farmer routes ──────────────────────────────────────────────────────
    {
        path: '',
        loadComponent: () => import('./core/layout/layout.component').then(m => m.LayoutComponent),
        canActivate: [authGuard, farmerGuard],
        children: [
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
            {
                path: 'dashboard',
                loadComponent: () => import('./modules/dashboard/dashboard.component').then(m => m.DashboardComponent)
            },
            {
                path: 'water-irrigation',
                loadComponent: () => import('./modules/water-irrigation/water-irrigation.component').then(m => m.WaterIrrigationComponent)
            },
            {
                path: 'profit-risk',
                loadComponent: () => import('./modules/profit-risk/profit-risk.component').then(m => m.ProfitRiskComponent)
            },
            {
                path: 'growing-opportunities',
                loadComponent: () => import('./modules/growing-opportunities/growing-opportunities.component').then(m => m.GrowingOpportunitiesComponent)
            },
            {
                path: 'grower-gpt',
                loadComponent: () => import('./modules/grower-gpt/grower-gpt.component').then(m => m.GrowerGptComponent)
            },
            {
                path: 'auctions',
                loadComponent: () => import('./modules/auctions/auctions.component').then(m => m.AuctionsComponent)
            },
            {
                path: 'auctions/:id',
                loadComponent: () => import('./modules/auction-detail/auction-detail.component').then(m => m.AuctionDetailComponent)
            },
        ]
    },
    // ── Bidder routes ──────────────────────────────────────────────────────
    {
        path: 'bidder',
        loadComponent: () => import('./core/layout/layout.component').then(m => m.LayoutComponent),
        canActivate: [authGuard, bidderGuard],
        children: [
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
            {
                path: 'dashboard',
                loadComponent: () => import('./modules/bidder-dashboard/bidder-dashboard.component').then(m => m.BidderDashboardComponent)
            },
            {
                path: 'auctions/:id',
                loadComponent: () => import('./modules/bidder-auction-detail/bidder-auction-detail.component').then(m => m.BidderAuctionDetailComponent)
            },
        ]
    },
    { path: '**', redirectTo: '/select-user' }
];

