// Shared TypeScript interfaces and models

export interface Block {
    id: string;
    name: string;
    location: string;
    coordinates: string;
    size: number; // in hectares
    sizeUnit: string;
    grapeVariety: string;
    crop: string;
    soilType: string;
    soilDescription?: string;
    lat: number;
    lon: number;
    lan: string;
}

export interface SensorReading {
    type: 'soil-moisture' | 'soil-temperature' | 'air-temperature' | 'humidity' | 'ph-level';
    label: string;
    value: number;
    unit: string;
    status: 'normal' | 'warning' | 'critical';
    timestamp: Date;
    hasHistory?: boolean;
}

export interface UserProfile {
    name: string;
    company: string;
    avatar?: string;
    initials?: string;
}

export interface HistoricalReading {
    period: string;
    value: string;
}

export interface BlockDetails {
    block: Block;
    lastReadings: HistoricalReading[];
    currentSensors: SensorReading[];
}
