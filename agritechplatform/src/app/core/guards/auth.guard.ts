import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isAuthenticated()) {
        return true;
    }

    return router.createUrlTree(['/select-user']);
};

export const farmerGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const user = authService.getCurrentUser();
    if (!user) return router.createUrlTree(['/select-user']);
    if (user.role === 'bidder') return router.createUrlTree(['/bidder/dashboard']);
    return true;
};

export const bidderGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const user = authService.getCurrentUser();
    if (!user) return router.createUrlTree(['/select-user']);
    if (user.role !== 'bidder') return router.createUrlTree(['/dashboard']);
    return true;
};
