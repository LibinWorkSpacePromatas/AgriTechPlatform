import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { User } from '../models/user.model';
import { UserDataService } from './user-data.service';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly STORAGE_KEY = 'agritech_active_user';
    private activeUserSubject: BehaviorSubject<User | null>;
    public activeUser$: Observable<User | null>;

    constructor(private userDataService: UserDataService) {
        const storedUser = this.getStoredUser();
        this.activeUserSubject = new BehaviorSubject<User | null>(storedUser);
        this.activeUser$ = this.activeUserSubject.asObservable();
    }

    login(userId: string): boolean {
        const user = this.userDataService.getUserById(userId);

        if (user) {
            this.activeUserSubject.next(user);
            this.storeUser(user);
            return true;
        }

        return false;
    }

    logout(): void {
        this.activeUserSubject.next(null);
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
