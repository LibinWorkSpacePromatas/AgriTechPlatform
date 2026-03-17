// Application-wide constants

export const APP_CONSTANTS = {
    APP_NAME: 'AgriTech',
    APP_SUBTITLE: 'Riverland AgriTech',
    APP_VERSION: '1.0.0',

    // Time Zone
    TIMEZONE: 'Australia/Adelaide',

    // API Configuration (placeholder - update with actual endpoints)
    API_BASE_URL: 'https://api.agritech.example.com/v1',

    // Model Versions
    ML_MODEL_VERSION: 'v2.3.1',
    PREDICTION_MODEL: 'VineyardYield-ML-v2.3.1',

    // Data Sources
    DATA_SOURCES: {
        WEATHER: 'BOM Weather Station - Adelaide Hills',
        SOIL: 'IoT Soil Sensors - Network A',
        SATELLITE: 'Sentinel-2 Imagery',
        MANUAL: 'Manual Field Observations'
    },

    // Risk Levels
    RISK_LEVELS: {
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high'
    },

    // Refresh Intervals (in milliseconds)
    REFRESH_INTERVALS: {
        DASHBOARD: 300000, // 5 minutes
        REAL_TIME_METRICS: 60000, // 1 minute
        PREDICTIONS: 900000 // 15 minutes
    }
};

export const NAVIGATION_ITEMS = [
    {
        label: 'Dashboard',
        route: '/dashboard',
        icon: 'layout-dashboard'
    },
    {
        label: 'Water & Irrigation',
        route: '/water-irrigation',
        icon: 'droplet'
    },
    {
        label: 'Profit & Risk',
        route: '/profit-risk',
        icon: 'trending-up'
    },
    {
        label: 'Growing Opportunities',
        route: '/growing-opportunities',
        icon: 'sprout'
    },
    {
        label: 'Grower GPT',
        route: '/grower-gpt',
        icon: 'message-circle'
    }
];

// Mock user profile data
export const MOCK_USER = {
    name: 'John Grower',
    company: 'Vineyard Estates',
    initials: 'JG'
};

// Mock block data
export const MOCK_BLOCKS = [
    {
        id: 'block-1-shiraz',
        name: 'Block 1 - Shiraz',
        location: 'Renmark, SA',
        coordinates: '34.1747°S, 140.7472°E',
        size: 8,
        sizeUnit: 'hectares',
        grapeVariety: 'Shiraz',
        crop: 'Shiraz',
        soilType: 'Mallee Sand',
        lat: -34.1747,
        lon: 140.7472,
        lan: "BCPKFB"
    },
    {
        id: 'block-2-cabernet',
        name: 'Block 2 - Cabernet',
        location: 'Tanunda, SA',
        coordinates: '34.5267°S, 138.9600°E',
        size: 12,
        sizeUnit: 'hectares',
        grapeVariety: 'Cabernet Sauvignon',
        crop: 'Cabernet Sauvignon',
        soilType: 'Red Brown Earth',
        lat: -34.5267,
        lon: 138.9600,
        lan: "WOGJLp"
    },
    {
        id: 'block-3-chardonnay',
        name: 'Block 3 - Chardonnay',
        location: 'Willunga, SA',
        coordinates: '35.2733°S, 138.5500°E',
        size: 6,
        sizeUnit: 'hectares',
        grapeVariety: 'Chardonnay',
        crop: 'Chardonnay',
        soilType: 'Loamy Sand',
        lat: -35.2733,
        lon: 138.5500,
        lan: "EUVJLU"
    },
    {
        id: 'block-4-merlot',
        name: 'Block 4 - Merlot',
        location: 'Waikerie, SA',
        coordinates: '34.1833°S, 139.9833°E',
        size: 10,
        sizeUnit: 'hectares',
        grapeVariety: 'Merlot',
        crop: 'Merlot',
        soilType: 'Calcareous Loam',
        lat: -34.1833,
        lon: 139.9833,
        lan: "BCPKKE"
    }
];

