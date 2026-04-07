import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, finalize, firstValueFrom, forkJoin, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { User, UserBlock } from '../models/user.model';
import { ApiBlockResponse, ApiService, ApiUserResponse } from './api.service';

@Injectable({
    providedIn: 'root'
})
export class UserDataService {
    private readonly usersSubject = new BehaviorSubject<User[]>([]);
    private readonly loadingSubject = new BehaviorSubject<boolean>(false);
    private readonly errorSubject = new BehaviorSubject<string | null>(null);

    readonly users$ = this.usersSubject.asObservable();
    readonly loading$ = this.loadingSubject.asObservable();
    readonly error$ = this.errorSubject.asObservable();

    private loadUsersRequest$?: Observable<User[]>;
    private initialized = false;

    constructor(private apiService: ApiService) { }

    getUsers(): User[] {
        return this.usersSubject.value;
    }

    getUserById(userId: string): User | undefined {
        return this.usersSubject.value.find(user => user.userId === userId);
    }

    getBlocks(userId: string): Observable<UserBlock[]> {
        const currentUser = this.getUserById(userId);
        if (currentUser?.blocks?.length) {
            return of(currentUser.blocks);
        }

        return this.getBlocksFromApi(userId);
    }

    loadUsers(forceRefresh = false): Observable<User[]> {
        if (this.initialized && !forceRefresh) {
            return of(this.usersSubject.value);
        }

        if (this.loadUsersRequest$ && !forceRefresh) {
            return this.loadUsersRequest$;
        }

        this.loadingSubject.next(true);
        this.errorSubject.next(null);

        this.loadUsersRequest$ = this.apiService.getUsers().pipe(
            switchMap(apiUsers => {
                if (apiUsers.length === 0) {
                    return of([]);
                }

                return forkJoin(
                    apiUsers.map((apiUser) => {
                        return this.getBlocksFromApi(apiUser.id).pipe(
                            map(blocks => this.mapUser(apiUser, blocks))
                        );
                    })
                );
            }),
            tap(users => {
                this.usersSubject.next(users);
                this.initialized = true;
            }),
            catchError(error => {
                const message = error instanceof Error ? error.message : 'Failed to load users from API.';
                this.errorSubject.next(message);
                console.error('API Error: ', error);
                this.usersSubject.next([]);
                this.initialized = true;
                return of([]);
            }),
            finalize(() => {
                this.loadingSubject.next(false);
                this.loadUsersRequest$ = undefined;
            }),
            shareReplay(1)
        );

        return this.loadUsersRequest$;
    }

    async initialize(): Promise<void> {
        await firstValueFrom(this.loadUsers());
    }

    private getBlocksFromApi(userId: string): Observable<UserBlock[]> {
        return this.apiService.getBlocks(userId).pipe(
            map(blocks => this.mapBlocks(blocks, userId)),
            catchError(error => {
                console.warn(`Failed to fetch blocks for user ${userId}`, error);
                return of([]);
            })
        );
    }

    private mapUser(apiUser: ApiUserResponse, blocks: UserBlock[]): User {
        return {
            userId: apiUser.id,
            userName: apiUser.name || 'Unknown User',
            region: apiUser.region || 'Unknown Region',
            council: apiUser.council || 'Unknown Council',
            farmName: apiUser.farm_name || 'Unknown Farm',
            farmLocation: apiUser.farm_location || 'Unknown Location',
            primaryCropName: apiUser.primary_crop || 'Unknown Crop',
            primarySoilType: apiUser.primary_soil || 'Unknown Soil',
            role: (apiUser.role === 'bidder' ? 'bidder' : 'farmer') as 'farmer' | 'bidder',
            blocks: blocks.length > 0 ? blocks : []
        };
    }

    private mapBlocks(apiBlocks: ApiBlockResponse[], userId: string): UserBlock[] {
        return apiBlocks.map((apiBlock) => {
            return {
                id: apiBlock.id,
                lanslu: apiBlock.lanslu,
                soilSubgroup: apiBlock.soil_subgroup || '',
                primarySoilClass: apiBlock.soil_class || apiBlock.soil_subgroup || '',
                description: apiBlock.description || '',
                area: apiBlock.area_ha ?? 0,
                crop: apiBlock.crop || '',
                latitude: apiBlock.centroid_lat ?? 0,
                longitude: apiBlock.centroid_lon ?? 0,
                polygon: apiBlock.block_polygon
            };
        });
    }
}
