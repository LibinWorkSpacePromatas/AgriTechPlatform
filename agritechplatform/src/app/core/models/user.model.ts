export interface PrimarySoilType {
    soilCode: string;
    soilDescription: string;
}

export interface UserBlock {
    lanslu: string;
    soilSubgroup: string;
    primarySoilClass: string;
    description: string;
    crop?: string;
    area: number; // in hectares
    latitude: number;
    longitude: number;
    polygon?: {
        type: 'Polygon' | 'MultiPolygon';
        coordinates: number[][][] | number[][][][];
    } | null;
}

export interface User {
    userId: string;
    userName: string;
    region: string;
    council: string;
    farmName: string;
    farmLocation: string;
    primaryCropName: string;
    primarySoilType: string;
    role: 'farmer' | 'bidder';
    blocks: UserBlock[];
    financials?: {
        projectedRoi: number;
        riskIndex: 'Low' | 'Medium' | 'High';
        potentialLoss: number;
        estimatedYield: number;
        marketValue: number;
        confidenceLevel: number;
    };
    opportunities?: {
        id: string;
        title: string;
        tags: string[];
    }[];
}
