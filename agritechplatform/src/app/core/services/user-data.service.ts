import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, finalize, firstValueFrom, forkJoin, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { User, UserBlock } from '../models/user.model';
import { ApiBlockResponse, ApiService, ApiUserResponse } from './api.service';

@Injectable({
    providedIn: 'root'
})
export class UserDataService {
    private readonly fallbackUsers: User[] = [
        {
            userId: 'U001',
            userName: 'James Mitchell',
            region: 'Riverland',
            council: 'MID MURRAY COUNCIL',
            farmName: 'Riverbend Vineyards',
            farmLocation: 'Renmark, SA',
            primaryCropName: 'Shiraz',
            primarySoilType: 'Loamy',
            blocks: [
                { lanslu: 'BCPKFB', soilSubgroup: 'A6', primarySoilClass: 'A6', description: 'Loamy sand over red clay', area: 9, crop: 'Shiraz', latitude: -34.1747, longitude: 140.7447 },
                { lanslu: 'BCPKFA', soilSubgroup: 'A6', primarySoilClass: 'A6', description: 'Sandy loam over red clay', area: 6, crop: 'Cabernet Sauvignon', latitude: -34.1780, longitude: 140.7520 }
            ],
            financials: {
                projectedRoi: 12.4,
                riskIndex: 'Low',
                potentialLoss: 0,
                estimatedYield: 4.2,
                marketValue: 1250,
                confidenceLevel: 92
            },
            opportunities: [
                { id: 'olives-lower-water', title: 'Olives: A Lower-Water Option for Riverland', tags: ['olives', 'diversification'] },
                { id: 'government-funding', title: 'Government Funding to Support Diversification', tags: ['funding', 'grants'] }
            ]
        },
        {
            userId: 'U002',
            userName: 'Sarah Thompson',
            region: 'Barossa Valley',
            council: 'THE BAROSSA COUNCIL',
            farmName: 'Barossa Estate',
            farmLocation: 'Tanunda, SA',
            primaryCropName: 'Grenache',
            primarySoilType: 'Clay',
            blocks: [
                { lanslu: 'WOGJLp', soilSubgroup: 'D4', primarySoilClass: 'D4', description: 'Loam over red clay', area: 9, crop: 'Grenache', latitude: -34.5233, longitude: 138.9594 },
                { lanslu: 'BCPKKE', soilSubgroup: 'A6', primarySoilClass: 'A6', description: 'Gradational sandy loam', area: 8, crop: 'Shiraz', latitude: -34.5280, longitude: 138.9650 }
            ]
        },
        {
            userId: 'U003',
            userName: 'Michael Chen',
            region: 'McLaren Vale',
            council: 'CITY OF ONKAPARINGA',
            farmName: 'McLaren Vineyards',
            farmLocation: 'Willunga, SA',
            primaryCropName: 'Cabernet Sauvignon',
            primarySoilType: 'Sandy',
            blocks: [
                { lanslu: 'EUVKFU', soilSubgroup: 'A6', primarySoilClass: 'A6', description: 'Sand over clay', area: 8, crop: 'Cabernet Sauvignon', latitude: -35.2735, longitude: 138.5569 },
                { lanslu: 'EUVJLU', soilSubgroup: 'D4', primarySoilClass: 'D4', description: 'Hard loam over red clay', area: 9, crop: 'Merlot', latitude: -35.2800, longitude: 138.5620 }
            ]
        },
        {
            userId: 'U004',
            userName: 'Emma Williams',
            region: 'Riverland',
            council: 'MID MURRAY COUNCIL',
            farmName: 'Sunridge Estate',
            farmLocation: 'Waikerie, SA',
            primaryCropName: 'Chardonnay',
            primarySoilType: 'Loamy',
            blocks: [
                { lanslu: 'EUVJLU', soilSubgroup: 'D4', primarySoilClass: 'D4', description: 'Loam over red clay', area: 7, crop: 'Chardonnay', latitude: -34.1833, longitude: 140.0333 },
                { lanslu: 'EUVJLp', soilSubgroup: 'D4', primarySoilClass: 'D4', description: 'Gradational clay loam', area: 10, crop: 'Pinot Grigio', latitude: -34.1900, longitude: 140.0400 }
            ]
        },
        {
            userId: 'U005',
            userName: 'David Anderson',
            region: 'Barossa Valley',
            council: 'THE BAROSSA COUNCIL',
            farmName: 'Heritage Wines',
            farmLocation: 'Nuriootpa, SA',
            primaryCropName: 'Riesling',
            primarySoilType: 'Silty',
            blocks: [
                { lanslu: 'BCPKFI', soilSubgroup: 'A4', primarySoilClass: 'A4', description: 'Silty loam over clay', area: 7, crop: 'Riesling', latitude: -34.4667, longitude: 138.9833 },
                { lanslu: 'EUVKFB', soilSubgroup: 'A6', primarySoilClass: 'A6', description: 'Fine sandy loam', area: 8, crop: 'Semillon', latitude: -34.4720, longitude: 138.9900 }
            ]
        }
    ];

    private readonly usersSubject = new BehaviorSubject<User[]>(this.cloneUsers(this.fallbackUsers));
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

        const fallbackUser = this.findFallbackUserByUserId(userId);
        if (fallbackUser?.blocks?.length) {
            return of(fallbackUser.blocks);
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
                    throw new Error('Users API returned no records.');
                }

                return forkJoin(
                    apiUsers.map((apiUser, index) => {
                        const fallbackUser = this.findFallbackUser(apiUser, index);
                        return this.getBlocksFromApi(apiUser.id, fallbackUser).pipe(
                            map(blocks => this.mapUser(apiUser, blocks, fallbackUser))
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
                console.warn('Falling back to mock users', error);
                const fallbackUsers = this.cloneUsers(this.fallbackUsers);
                this.usersSubject.next(fallbackUsers);
                this.initialized = true;
                return of(fallbackUsers);
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

    private getBlocksFromApi(userId: string, fallbackUser?: User): Observable<UserBlock[]> {
        return this.apiService.getBlocks(userId).pipe(
            map(blocks => this.mapBlocks(blocks, fallbackUser)),
            catchError(error => {
                console.warn(`Falling back to mock blocks for user ${userId}`, error);
                return of(this.cloneBlocks(fallbackUser?.blocks || []));
            })
        );
    }

    private mapUser(apiUser: ApiUserResponse, blocks: UserBlock[], fallbackUser?: User): User {
        return {
            userId: apiUser.id,
            userName: apiUser.name || fallbackUser?.userName || 'Unknown User',
            region: apiUser.region || fallbackUser?.region || 'Unknown Region',
            council: apiUser.council || fallbackUser?.council || 'Unknown Council',
            farmName: apiUser.farm_name || fallbackUser?.farmName || 'Unknown Farm',
            farmLocation: apiUser.farm_location || fallbackUser?.farmLocation || 'Unknown Location',
            primaryCropName: apiUser.primary_crop || fallbackUser?.primaryCropName || 'Unknown Crop',
            primarySoilType: apiUser.primary_soil || fallbackUser?.primarySoilType || 'Unknown Soil',
            blocks: blocks.length > 0 ? blocks : this.cloneBlocks(fallbackUser?.blocks || []),
            financials: fallbackUser?.financials,
            opportunities: fallbackUser?.opportunities
        };
    }

    private mapBlocks(apiBlocks: ApiBlockResponse[], fallbackUser?: User): UserBlock[] {
        return apiBlocks.map((apiBlock, index) => {
            const fallbackBlock = fallbackUser?.blocks.find(block => block.lanslu === apiBlock.lanslu) || fallbackUser?.blocks[index];
            const fallbackCoords = this.getLatLongForLocation(fallbackUser?.farmLocation);

            return {
                lanslu: apiBlock.lanslu,
                soilSubgroup: apiBlock.soil_subgroup || fallbackBlock?.soilSubgroup || '',
                primarySoilClass: apiBlock.soil_class || fallbackBlock?.primarySoilClass || apiBlock.soil_subgroup || '',
                description: apiBlock.description || fallbackBlock?.description || '',
                area: apiBlock.area_ha ?? fallbackBlock?.area ?? 0,
                crop: apiBlock.crop || fallbackBlock?.crop || fallbackUser?.primaryCropName,
                latitude: fallbackBlock?.latitude ?? fallbackCoords.lat,
                longitude: fallbackBlock?.longitude ?? fallbackCoords.lon
            };
        });
    }

    private findFallbackUser(apiUser: ApiUserResponse, index: number): User | undefined {
        return this.fallbackUsers.find(user =>
            user.farmName.toLowerCase() === apiUser.farm_name?.toLowerCase() ||
            user.userName.toLowerCase() === apiUser.name?.toLowerCase() ||
            (user.council === apiUser.council && user.primaryCropName === apiUser.primary_crop)
        ) || this.fallbackUsers[index];
    }

    private findFallbackUserByUserId(userId: string): User | undefined {
        return this.fallbackUsers.find(user => user.userId === userId);
    }

    private getLatLongForLocation(location?: string): { lat: number; lon: number } {
        const locationMap: Record<string, { lat: number; lon: number }> = {
            'Renmark, SA': { lat: -34.1747, lon: 140.7472 },
            'Tanunda, SA': { lat: -34.5267, lon: 138.9600 },
            'Willunga, SA': { lat: -35.2733, lon: 138.5500 },
            'Waikerie, SA': { lat: -34.1833, lon: 139.9833 },
            'Nuriootpa, SA': { lat: -34.4667, lon: 138.9833 }
        };

        return location ? (locationMap[location] || locationMap['Renmark, SA']) : locationMap['Renmark, SA'];
    }

    private cloneUsers(users: User[]): User[] {
        return users.map(user => ({
            ...user,
            blocks: this.cloneBlocks(user.blocks),
            financials: user.financials ? { ...user.financials } : undefined,
            opportunities: user.opportunities ? user.opportunities.map(opportunity => ({ ...opportunity, tags: [...opportunity.tags] })) : undefined
        }));
    }

    private cloneBlocks(blocks: UserBlock[]): UserBlock[] {
        return blocks.map(block => ({ ...block }));
    }
}
