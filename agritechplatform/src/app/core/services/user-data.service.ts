import { Injectable } from '@angular/core';
import { User } from '../models/user.model';

@Injectable({
    providedIn: 'root'
})
export class UserDataService {
    private users: User[] = [
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

    constructor() { }

    getUsers(): User[] {
        return this.users;
    }

    getUserById(userId: string): User | undefined {
        return this.users.find(user => user.userId === userId);
    }
}
