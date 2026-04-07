import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { User } from '../models/user.model';
import { UserDataService } from './user-data.service';
import { BlockService } from '../../shared/services/block.service';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly STORAGE_KEY = 'agritech_active_user';
    private activeUserSubject: BehaviorSubject<User | null>;
    public activeUser$: Observable<User | null>;

    constructor(
        private userDataService: UserDataService,
        private blockService: BlockService
    ) {
        const storedUser = this.getStoredUser();
        this.activeUserSubject = new BehaviorSubject<User | null>(storedUser);
        this.activeUser$ = this.activeUserSubject.asObservable();

        if (storedUser) {
            this.blockService.initializeForUser(storedUser);
        }
    }

    login(userId: string): boolean {
        const user = this.userDataService.getUserById(userId);

        if (user) {
            this.activeUserSubject.next(user);
            this.storeUser(user);
            this.blockService.initializeForUser(user);
            return true;
        }

        return false;
    }

    getRole(): 'farmer' | 'bidder' | null {
        return this.activeUserSubject.value?.role ?? null;
    }

    isBidder(): boolean {
        return this.getRole() === 'bidder';
    }

    isFarmer(): boolean {
        return this.getRole() === 'farmer';
    }

    logout(): void {
        this.activeUserSubject.next(null);
        this.blockService.clearBlocks();
        localStorage.removeItem(this.STORAGE_KEY);
    }

    getActiveUser(): Observable<User | null> {
        return this.activeUser$;
    }

    isAuthenticated(): boolean {
        return this.activeUserSubject.value !== null;
    }

    getCurrentUser(): User | null {
        return this.activeUserSubject.value;
    }

    private storeUser(user: User): void {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ userId: user.userId }));
    }

    private getStoredUser(): User | null {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            try {
                const { userId } = JSON.parse(stored);
                return this.userDataService.getUserById(userId) || null;
            } catch {
                return null;
            }
        }
        return null;
    }
}
