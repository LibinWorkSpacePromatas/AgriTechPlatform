import { Injectable } from '@angular/core';

export interface SensorData {
    moisture: number;
    ph: number;
    airTemp: number;
    soilTemp: number;
    humidity: number;
}

export interface CropProfile {
    name: string;
    moisture: { min: number; max: number; optimal: [number, number] };
    ph: { min: number; max: number; optimal: [number, number] };
    temp: { min: number; max: number; optimal: [number, number] };
    humidity: { min: number; max: number; optimal: [number, number] };
    waterRequirement: number; // ML/ha
    profitPerHa: number; // Base profit in dollars
}

export interface ActionItem {
    priority: number;
    label: string;
    items: string[];
    severity: 'critical' | 'high' | 'medium' | 'low';
    estimatedCost?: string;
    estimatedTime?: string;
}

export interface CropRecommendation {
    cropName: string;
    suitabilityScore: number; // 0-100
    profitPerHa: number;
    waterRequirement: number;
    reasons: string[];
    phCompatible: boolean;
    moistureCompatible: boolean;
}

export interface YieldImpact {
    currentYieldPercent: number;
    projectedLoss: number; // dollars
    baseProfit: number;    // full potential profit at 100% yield (dollars)
    factors: { name: string; impact: number; severity: string }[];
}

@Injectable({
    providedIn: 'root'
})
export class CropAdvisorService {

    private cropProfiles: Record<string, CropProfile> = {
        'Grenache': {
            name: 'Grenache',
            moisture: { min: 20, max: 85, optimal: [35, 65] },
            ph: { min: 6.0, max: 8.0, optimal: [6.5, 7.5] },
            temp: { min: 10, max: 35, optimal: [18, 30] },
            humidity: { min: 20, max: 80, optimal: [40, 60] },
            waterRequirement: 7.5,
            profitPerHa: 12000
        },
        'Shiraz': {
            name: 'Shiraz',
            moisture: { min: 20, max: 85, optimal: [35, 65] },
            ph: { min: 6.0, max: 8.0, optimal: [6.5, 7.5] },
            temp: { min: 10, max: 35, optimal: [18, 30] },
            humidity: { min: 20, max: 80, optimal: [40, 60] },
            waterRequirement: 7.0,
            profitPerHa: 14000
        },
        'Chardonnay': {
            name: 'Chardonnay',
            moisture: { min: 20, max: 85, optimal: [35, 65] },
            ph: { min: 6.0, max: 8.0, optimal: [6.5, 7.5] },
            temp: { min: 10, max: 32, optimal: [18, 28] },
            humidity: { min: 20, max: 80, optimal: [40, 60] },
            waterRequirement: 6.5,
            profitPerHa: 15000
        },
        'Cabernet Sauvignon': {
            name: 'Cabernet Sauvignon',
            moisture: { min: 20, max: 85, optimal: [35, 65] },
            ph: { min: 6.0, max: 8.0, optimal: [6.5, 7.5] },
            temp: { min: 10, max: 35, optimal: [18, 30] },
            humidity: { min: 20, max: 80, optimal: [40, 60] },
            waterRequirement: 7.2,
            profitPerHa: 13500
        },
        'Merlot': {
            name: 'Merlot',
            moisture: { min: 20, max: 85, optimal: [35, 65] },
            ph: { min: 6.0, max: 8.0, optimal: [6.5, 7.5] },
            temp: { min: 10, max: 33, optimal: [18, 28] },
            humidity: { min: 20, max: 80, optimal: [40, 60] },
            waterRequirement: 6.8,
            profitPerHa: 14500
        },
        'Olives': {
            name: 'Olives',
            moisture: { min: 15, max: 70, optimal: [25, 50] },
            ph: { min: 6.0, max: 8.5, optimal: [6.5, 8.0] },
            temp: { min: 5, max: 40, optimal: [15, 35] },
            humidity: { min: 20, max: 75, optimal: [35, 60] },
            waterRequirement: 5.5,
            profitPerHa: 76000
        },
        'Almonds': {
            name: 'Almonds',
            moisture: { min: 20, max: 80, optimal: [35, 65] },
            ph: { min: 6.0, max: 8.5, optimal: [6.5, 8.0] },
            temp: { min: 7, max: 40, optimal: [15, 30] },
            humidity: { min: 20, max: 75, optimal: [40, 60] },
            waterRequirement: 8.5,
            profitPerHa: 45000
        },
        'Citrus': {
            name: 'Citrus',
            moisture: { min: 25, max: 85, optimal: [40, 70] },
            ph: { min: 5.5, max: 7.5, optimal: [6.0, 7.0] },
            temp: { min: 13, max: 38, optimal: [20, 30] },
            humidity: { min: 30, max: 85, optimal: [50, 70] },
            waterRequirement: 9.0,
            profitPerHa: 38000
        }
    };

    constructor() { }

    /**
     * Generate dynamic action recommendations based on sensor data
     */
    generateRecommendations(sensorData: SensorData, currentCrop: string): ActionItem[] {
        const actions: ActionItem[] = [];
        const profile = this.cropProfiles[currentCrop] || this.cropProfiles['Grenache'];

        // Moisture Analysis
        if (sensorData.moisture < profile.moisture.optimal[0]) {
            const severity = sensorData.moisture < profile.moisture.min ? 'critical' :
                sensorData.moisture < 30 ? 'high' : 'medium';

            actions.push({
                priority: severity === 'critical' ? 1 : severity === 'high' ? 2 : 3,
                label: severity === 'critical' ? 'IMMEDIATE ACTION' : 'NEXT 24-48 HOURS',
                items: [
                    `Irrigate immediately - moisture at ${sensorData.moisture.toFixed(1)}% (optimal: ${profile.moisture.optimal[0]}-${profile.moisture.optimal[1]}%)`,
                    `Apply ${this.calculateIrrigationAmount(sensorData.moisture, profile.moisture.optimal[0])}ML water per hectare`,
                    'Check irrigation system for blockages or leaks'
                ],
                severity,
                estimatedCost: '$150-300/ha',
                estimatedTime: '2-4 hours'
            });
        } else if (sensorData.moisture > profile.moisture.optimal[1]) {
            actions.push({
                priority: 3,
                label: 'NEXT 7 DAYS',
                items: [
                    `Reduce irrigation - moisture at ${sensorData.moisture.toFixed(1)}% (optimal: ${profile.moisture.optimal[0]}-${profile.moisture.optimal[1]}%)`,
                    'Monitor for root rot and fungal diseases',
                    'Improve drainage if waterlogging persists'
                ],
                severity: 'medium',
                estimatedCost: '$0',
                estimatedTime: '1 hour'
            });
        }

        // pH Analysis
        if (sensorData.ph < profile.ph.optimal[0] || sensorData.ph > profile.ph.optimal[1]) {
            const tooAcidic = sensorData.ph < profile.ph.optimal[0];
            actions.push({
                priority: 3,
                label: 'NEXT 2 WEEKS',
                items: [
                    `Soil pH at ${sensorData.ph.toFixed(1)} - ${tooAcidic ? 'too acidic' : 'too alkaline'} (optimal: ${profile.ph.optimal[0]}-${profile.ph.optimal[1]})`,
                    tooAcidic ? 'Apply agricultural lime (2-3 tonnes/ha)' : 'Apply sulfur or gypsum (500kg/ha)',
                    'Retest pH after 4 weeks to monitor adjustment'
                ],
                severity: 'medium',
                estimatedCost: tooAcidic ? '$800-1200/ha' : '$400-600/ha',
                estimatedTime: '1 day'
            });
        }

        // Temperature Analysis
        if (sensorData.airTemp > profile.temp.optimal[1]) {
            const severity = sensorData.airTemp > profile.temp.max ? 'critical' : 'high';
            actions.push({
                priority: severity === 'critical' ? 1 : 2,
                label: 'IMMEDIATE ACTION',
                items: [
                    `Heat stress detected - ${sensorData.airTemp.toFixed(1)}°C (optimal: ${profile.temp.optimal[0]}-${profile.temp.optimal[1]}°C)`,
                    'Increase irrigation frequency to cool canopy',
                    'Consider shade cloth installation for extreme heat events',
                    'Monitor for sunburn damage on fruit'
                ],
                severity,
                estimatedCost: '$200-500/ha',
                estimatedTime: '3-6 hours'
            });
        }

        // Humidity Analysis
        if (sensorData.humidity < profile.humidity.optimal[0]) {
            actions.push({
                priority: 3,
                label: 'NEXT 7 DAYS',
                items: [
                    `Low humidity detected - ${sensorData.humidity.toFixed(1)}% (optimal: ${profile.humidity.optimal[0]}-${profile.humidity.optimal[1]}%)`,
                    'Increase irrigation to raise local humidity',
                    'Monitor for increased water stress'
                ],
                severity: 'low',
                estimatedCost: '$100/ha',
                estimatedTime: '2 hours'
            });
        }

        // General monitoring if everything is optimal
        if (actions.length === 0) {
            actions.push({
                priority: 3,
                label: 'NEXT 7 DAYS',
                items: [
                    'All parameters within optimal range - maintain current practices',
                    'Continue regular monitoring of sensor readings',
                    'Schedule routine vineyard inspection'
                ],
                severity: 'low',
                estimatedCost: '$0',
                estimatedTime: '1 hour'
            });
        }

        return actions.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Calculate yield impact based on sensor conditions
     */
    calculateYieldImpact(sensorData: SensorData, currentCrop: string, areaHa: number): YieldImpact {
        const profile = this.cropProfiles[currentCrop] || this.cropProfiles['Grenache'];
        const factors: { name: string; impact: number; severity: string }[] = [];
        let totalImpact = 0;

        // Moisture impact (most critical)
        if (sensorData.moisture < profile.moisture.optimal[0]) {
            const moistureDeficit = profile.moisture.optimal[0] - sensorData.moisture;
            const impactPercent = Math.min(moistureDeficit * 2.5, 60); // 2.5% yield loss per 1% below optimal
            factors.push({
                name: 'Low Soil Moisture',
                impact: impactPercent,
                severity: impactPercent > 30 ? 'critical' : impactPercent > 15 ? 'high' : 'medium'
            });
            totalImpact += impactPercent;
        }

        // pH impact
        const phDeviation = Math.max(
            profile.ph.optimal[0] - sensorData.ph,
            sensorData.ph - profile.ph.optimal[1]
        );
        if (phDeviation > 0) {
            const impactPercent = Math.min(phDeviation * 5, 20); // 5% yield loss per pH unit deviation
            factors.push({
                name: 'Suboptimal Soil pH',
                impact: impactPercent,
                severity: impactPercent > 15 ? 'high' : 'medium'
            });
            totalImpact += impactPercent;
        }

        // Temperature impact
        if (sensorData.airTemp > profile.temp.optimal[1]) {
            const tempExcess = sensorData.airTemp - profile.temp.optimal[1];
            const impactPercent = Math.min(tempExcess * 3, 25); // 3% yield loss per degree above optimal
            factors.push({
                name: 'Heat Stress',
                impact: impactPercent,
                severity: impactPercent > 15 ? 'critical' : 'high'
            });
            totalImpact += impactPercent;
        }

        const currentYieldPercent = Math.max(0, 100 - totalImpact);
        const baseProfit = profile.profitPerHa * areaHa;
        const projectedLoss = baseProfit * (totalImpact / 100);

        return {
            currentYieldPercent,
            projectedLoss,
            baseProfit,
            factors
        };
    }

    /**
     * Recommend alternative crops based on current conditions
     */
    recommendAlternativeCrops(sensorData: SensorData, currentCrop: string): CropRecommendation[] {
        const recommendations: CropRecommendation[] = [];

        Object.values(this.cropProfiles).forEach(profile => {
            if (profile.name === currentCrop) return; // Skip current crop

            let suitabilityScore = 100;
            const reasons: string[] = [];

            // Moisture compatibility
            const moistureCompatible = sensorData.moisture >= profile.moisture.optimal[0] &&
                sensorData.moisture <= profile.moisture.optimal[1];
            if (!moistureCompatible) {
                const deviation = Math.min(
                    Math.abs(profile.moisture.optimal[0] - sensorData.moisture),
                    Math.abs(profile.moisture.optimal[1] - sensorData.moisture)
                );
                suitabilityScore -= deviation * 1.5;
            } else {
                reasons.push('Optimal moisture conditions');
            }

            // pH compatibility
            const phCompatible = sensorData.ph >= profile.ph.optimal[0] &&
                sensorData.ph <= profile.ph.optimal[1];
            if (!phCompatible) {
                const deviation = Math.min(
                    Math.abs(profile.ph.optimal[0] - sensorData.ph),
                    Math.abs(profile.ph.optimal[1] - sensorData.ph)
                );
                suitabilityScore -= deviation * 10;
            } else {
                reasons.push(`pH ${sensorData.ph.toFixed(1)} is ideal`);
            }

            // Temperature compatibility
            const tempCompatible = sensorData.airTemp >= profile.temp.optimal[0] &&
                sensorData.airTemp <= profile.temp.optimal[1];
            if (!tempCompatible) {
                const deviation = Math.min(
                    Math.abs(profile.temp.optimal[0] - sensorData.airTemp),
                    Math.abs(profile.temp.optimal[1] - sensorData.airTemp)
                );
                suitabilityScore -= deviation * 2;
            } else {
                reasons.push('Temperature within range');
            }

            // Profitability consideration
            if (profile.profitPerHa > 50000) {
                reasons.push('High profit potential');
                suitabilityScore += 10;
            }

            // Water efficiency
            if (profile.waterRequirement < 7) {
                reasons.push('Water-efficient crop');
                suitabilityScore += 5;
            }

            suitabilityScore = Math.max(0, Math.min(100, suitabilityScore));

            if (suitabilityScore > 50) { // Only recommend if reasonably suitable
                recommendations.push({
                    cropName: profile.name,
                    suitabilityScore,
                    profitPerHa: profile.profitPerHa,
                    waterRequirement: profile.waterRequirement,
                    reasons,
                    phCompatible,
                    moistureCompatible
                });
            }
        });

        return recommendations.sort((a, b) => b.suitabilityScore - a.suitabilityScore).slice(0, 3);
    }

    /**
     * Calculate irrigation amount needed
     */
    private calculateIrrigationAmount(currentMoisture: number, targetMoisture: number): number {
        const deficit = targetMoisture - currentMoisture;
        // Rough estimate: 1% moisture increase requires ~0.5 ML/ha
        const amount = Math.max(0, deficit * 0.5);
        // Round to 1 decimal place
        return Math.round(amount * 10) / 10;
    }

    /**
     * Get crop profile
     */
    getCropProfile(cropName: string): CropProfile | undefined {
        return this.cropProfiles[cropName];
    }
}
