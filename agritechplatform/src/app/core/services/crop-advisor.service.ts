import { Injectable } from '@angular/core';
import { WeatherData } from './weather.service';

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

export interface FarmerAdvisoryInput {
    currentCrop: string;
    areaHa: number;
    lastUpdated: string;
    sensorData: Partial<SensorData>;
    satelliteData: {
        ndvi: number | null;
        ndwi: number | null;
        ndre: number | null;
        evi: number | null;
        lai: number | null;
    };
    weatherData: WeatherData | null;
    profitRiskData?: ProfitRiskAdvisoryData | null;
}

export interface ProfitRiskCropSnapshot {
    crop: string;
    netMarginPerHa: number;
    waterReqMlHa: number;
}

export interface ProfitRiskCurrentCropSnapshot extends ProfitRiskCropSnapshot {
    matchedCrop: string;
    note?: string | null;
}

export interface ProfitRiskAdvisoryData {
    waterPrice: number;
    riskLevel: string;
    currentCrop: ProfitRiskCurrentCropSnapshot;
    bestCrop: string;
    bestCropMarginPerHa: number;
    margins: ProfitRiskCropSnapshot[];
}

export type FarmerAdvisoryTone = 'good' | 'warning' | 'critical' | 'neutral';

export interface FarmerSignalCard {
    label: string;
    value: string;
    source: 'Sensor' | 'Satellite' | 'Weather';
    required?: string;
    summary: string;
    tone: FarmerAdvisoryTone;
}

export interface FarmerActionStep {
    timing: string;
    title: string;
    detail: string;
    reason: string;
}

export interface FarmerMigrationOption {
    cropName: string;
    recommendation: string;
    suitabilityScore: number;
    expectedAnnualProfit: number;
    trialAnnualProfit: number;
    profitDelta: number;
    waterRequirement: number;
    waterSavingMlPerHa: number;
    suggestedSharePct: number;
    whyItFits: string;
    reasons: string[];
    benefits: string[];
    tone: FarmerAdvisoryTone;
}

export interface FarmerFinancialSummary {
    estimatedCurrentProfit: number;
    potentialProfit: number;
    profitOpportunity: number;
    currentYieldPercent: number;
    confidenceLabel: string;
    workbookBaselineProfit: number;
    liveAdjustment: number;
    waterPrice: number | null;
    riskLevel: string | null;
}

export interface FarmerMigrationSummary {
    title: string;
    summary: string;
    reason: string;
    recommendedCrop: string | null;
    suggestedSharePct: number;
    projectedProfitAfterMigration: number;
    gainVsCurrent: number;
    benefits: string[];
}

export interface FarmerAdvisory {
    lastUpdated: string;
    headline: string;
    summary: string;
    recommendationLabel: string;
    tone: FarmerAdvisoryTone;
    currentCropScore: number;
    financial: FarmerFinancialSummary;
    migrationSummary: FarmerMigrationSummary;
    signalCards: FarmerSignalCard[];
    reasons: string[];
    benefits: string[];
    actions: FarmerActionStep[];
    migrationOptions: FarmerMigrationOption[];
    sources: string[];
}

interface CropEvaluation {
    cropName: string;
    suitabilityScore: number;
    projectedProfit: number;
    potentialProfit: number;
    baseAnnualProfit: number;
    liveAdjustment: number;
    performanceFactor: number;
    waterRequirement: number;
    tone: FarmerAdvisoryTone;
    positives: string[];
    concerns: string[];
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

    buildFarmerAdvisory(input: FarmerAdvisoryInput): FarmerAdvisory {
        const currentProfile = this.getCropProfile(input.currentCrop) || this.cropProfiles['Shiraz'];
        const currentEvaluation = this.evaluateCrop(currentProfile, input, false);
        const rankedMigrationOptions = Object.values(this.cropProfiles)
            .filter(profile => profile.name !== currentProfile.name)
            .map(profile => this.evaluateCrop(profile, input, true))
            .sort((left, right) => {
                const scoreDifference = right.suitabilityScore - left.suitabilityScore;
                if (scoreDifference !== 0) {
                    return scoreDifference;
                }

                return right.projectedProfit - left.projectedProfit;
            })
            .slice(0, 3);

        const mappedOptions = rankedMigrationOptions.map(option => this.mapMigrationOption(option, currentEvaluation));
        const bestOption = mappedOptions[0] || null;

        return {
            lastUpdated: input.lastUpdated,
            headline: this.buildHeadline(currentEvaluation, bestOption),
            summary: this.buildSummary(currentEvaluation, bestOption),
            recommendationLabel: this.getRecommendationLabel(currentEvaluation, bestOption),
            tone: this.getRecommendationTone(currentEvaluation, bestOption),
            currentCropScore: currentEvaluation.suitabilityScore,
            financial: {
                estimatedCurrentProfit: currentEvaluation.projectedProfit,
                potentialProfit: currentEvaluation.potentialProfit,
                profitOpportunity: Math.max(0, currentEvaluation.potentialProfit - currentEvaluation.projectedProfit),
                currentYieldPercent: Math.round(currentEvaluation.performanceFactor * 100),
                confidenceLabel: this.getConfidenceLabel(input),
                workbookBaselineProfit: currentEvaluation.baseAnnualProfit,
                liveAdjustment: currentEvaluation.liveAdjustment,
                waterPrice: input.profitRiskData?.waterPrice ?? null,
                riskLevel: input.profitRiskData?.riskLevel ?? null
            },
            migrationSummary: this.buildMigrationSummary(currentEvaluation, bestOption),
            signalCards: this.buildSignalCards(input, currentProfile),
            reasons: this.buildReasons(currentEvaluation, bestOption),
            benefits: this.buildBenefits(currentEvaluation, bestOption),
            actions: this.buildActionPlan(input, currentEvaluation, bestOption),
            migrationOptions: mappedOptions,
            sources: this.buildSources(input)
        };
    }

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

    private evaluateCrop(
        profile: CropProfile,
        input: FarmerAdvisoryInput,
        isMigrationCandidate: boolean
    ): CropEvaluation {
        const { sensorData, satelliteData, weatherData } = input;
        const moistureScore = this.scoreRange(sensorData.moisture, profile.moisture.min, profile.moisture.max, profile.moisture.optimal);
        const phScore = this.scoreRange(sensorData.ph, profile.ph.min, profile.ph.max, profile.ph.optimal);
        const tempScore = this.scoreRange(sensorData.airTemp, profile.temp.min, profile.temp.max, profile.temp.optimal);
        const humidityScore = this.scoreRange(sensorData.humidity, profile.humidity.min, profile.humidity.max, profile.humidity.optimal);
        const satelliteScore = this.getSatelliteScore(satelliteData);
        const weatherScore = this.getWeatherScore(profile, weatherData, sensorData);
        const weightedScore = this.getWeightedAverage([
            { score: moistureScore, weight: 22 },
            { score: phScore, weight: 12 },
            { score: tempScore, weight: 12 },
            { score: humidityScore, weight: 8 },
            { score: satelliteScore, weight: 28 },
            { score: weatherScore, weight: 18 }
        ]);

        const waterAdvantage = profile.waterRequirement <= 7 ? 4 : 0;
        const profitabilityAdvantage = profile.profitPerHa >= 30000 ? 7 : profile.profitPerHa >= 18000 ? 4 : 0;
        const migrationPenalty = isMigrationCandidate ? 5 : 0;
        const suitabilityScore = Math.max(0, Math.min(100, Math.round(weightedScore + waterAdvantage + profitabilityAdvantage - migrationPenalty)));
        const performanceFactor = this.clamp(0.35 + (suitabilityScore / 100) * 0.65, 0.25, 1.0);
        const economics = this.resolveEconomics(profile, input, isMigrationCandidate);
        const liveAdjustment = input.profitRiskData ? 0 : this.calculateLiveAdjustment(economics.baseAnnualProfit, suitabilityScore);
        const projectedProfit = economics.baseAnnualProfit + liveAdjustment;
        const potentialProfit = input.profitRiskData
            ? economics.baseAnnualProfit
            : Math.max(economics.baseAnnualProfit, projectedProfit);

        return {
            cropName: profile.name,
            suitabilityScore,
            projectedProfit,
            potentialProfit,
            baseAnnualProfit: economics.baseAnnualProfit,
            liveAdjustment,
            performanceFactor,
            waterRequirement: economics.waterRequirement,
            tone: suitabilityScore >= 75 ? 'good' : suitabilityScore >= 55 ? 'warning' : 'critical',
            positives: this.buildPositiveReasons(profile, input, suitabilityScore),
            concerns: this.buildConcerns(profile, input, suitabilityScore)
        };
    }

    private mapMigrationOption(
        option: CropEvaluation,
        currentEvaluation: CropEvaluation
    ): FarmerMigrationOption {
        const scoreGap = option.suitabilityScore - currentEvaluation.suitabilityScore;
        const profitDelta = option.projectedProfit - currentEvaluation.projectedProfit;
        const suggestedSharePct = profitDelta > 0 && scoreGap > 18 ? 60 : profitDelta > 0 && scoreGap > 8 ? 35 : 20;
        const waterSaving = Number((currentEvaluation.waterRequirement - option.waterRequirement).toFixed(1));

        return {
            cropName: option.cropName,
            recommendation: scoreGap > 18 && profitDelta > 0
                ? 'Strong migration option'
                : profitDelta > 0
                    ? 'Good trial option'
                    : 'Watchlist option',
            suitabilityScore: option.suitabilityScore,
            expectedAnnualProfit: option.projectedProfit,
            trialAnnualProfit: option.projectedProfit * (suggestedSharePct / 100),
            profitDelta,
            waterRequirement: option.waterRequirement,
            waterSavingMlPerHa: waterSaving,
            suggestedSharePct,
            whyItFits: option.positives[0] || `This crop handles the current field conditions better than ${currentEvaluation.cropName}.`,
            reasons: option.positives.slice(0, 3),
            benefits: this.buildOptionBenefits(currentEvaluation, option, waterSaving),
            tone: option.tone
        };
    }

    private buildPositiveReasons(
        profile: CropProfile,
        input: FarmerAdvisoryInput,
        suitabilityScore: number
    ): string[] {
        const positives: string[] = [];
        const { sensorData, satelliteData, weatherData } = input;

        if (typeof sensorData.moisture === 'number' && sensorData.moisture >= profile.moisture.optimal[0] && sensorData.moisture <= profile.moisture.optimal[1]) {
            positives.push(`Soil moisture is in the better range for ${profile.name}.`);
        }

        if (typeof sensorData.ph === 'number' && sensorData.ph >= profile.ph.optimal[0] && sensorData.ph <= profile.ph.optimal[1]) {
            positives.push(`Soil pH suits ${profile.name} well.`);
        }

        if (typeof sensorData.airTemp === 'number' && sensorData.airTemp >= profile.temp.optimal[0] && sensorData.airTemp <= profile.temp.optimal[1]) {
            positives.push(`Current temperature fits ${profile.name} well.`);
        }

        if (typeof satelliteData.ndvi === 'number' && satelliteData.ndvi >= 0.45) {
            positives.push('Satellite canopy health is supporting productive growth.');
        }

        if (weatherData) {
            const forecastMax = Math.max(...weatherData.daily.temperature_2m_max);
            if (forecastMax <= profile.temp.max) {
                positives.push('The 7-day forecast stays inside this crop’s heat tolerance.');
            }
        }

        if (profile.waterRequirement <= 7) {
            positives.push('This crop uses water more efficiently than high-demand alternatives.');
        }

        if (profile.profitPerHa >= 30000) {
            positives.push('Its margin potential is stronger than the current block average.');
        }

        if (!positives.length) {
            positives.push(suitabilityScore >= 60
                ? `${profile.name} has a workable fit with the current field conditions.`
                : `${profile.name} can still be managed here with tighter field control.`);
        }

        return positives;
    }

    private buildConcerns(
        profile: CropProfile,
        input: FarmerAdvisoryInput,
        suitabilityScore: number
    ): string[] {
        const concerns: string[] = [];
        const { sensorData, satelliteData, weatherData } = input;

        if (typeof sensorData.moisture === 'number' && sensorData.moisture < profile.moisture.optimal[0]) {
            concerns.push(`Soil moisture is below the preferred range for ${profile.name}.`);
        }

        if (typeof sensorData.ph === 'number' && (sensorData.ph < profile.ph.optimal[0] || sensorData.ph > profile.ph.optimal[1])) {
            concerns.push('Soil pH is reducing nutrient efficiency.');
        }

        if (typeof satelliteData.ndvi === 'number' && satelliteData.ndvi < 0.35) {
            concerns.push('Satellite canopy health is showing visible crop stress.');
        }

        if (typeof satelliteData.ndwi === 'number' && satelliteData.ndwi < -0.18) {
            concerns.push('Satellite water balance suggests the block is drying out.');
        }

        if (weatherData) {
            const forecastMax = Math.max(...weatherData.daily.temperature_2m_max);
            if (forecastMax > profile.temp.max) {
                concerns.push('The coming heat outlook is above this crop’s comfort range.');
            }
            const wetDays = weatherData.daily.precipitation_probability_max.filter(value => value >= 60).length;
            if (wetDays >= 3 && profile.humidity.optimal[1] <= 60) {
                concerns.push('Repeated wet days may lift disease pressure.');
            }
        }

        if (!concerns.length && suitabilityScore < 70) {
            concerns.push('Conditions are workable, but margins depend on close weekly management.');
        }

        return concerns;
    }

    private buildSignalCards(input: FarmerAdvisoryInput, profile: CropProfile): FarmerSignalCard[] {
        const cards: FarmerSignalCard[] = [];
        const { sensorData, satelliteData, weatherData } = input;

        if (typeof sensorData.moisture === 'number') {
            const moistureMin = profile.moisture.optimal[0];
            const moistureMax = profile.moisture.optimal[1];
            cards.push({
                label: 'Soil moisture',
                value: `${sensorData.moisture.toFixed(1)}%`,
                source: 'Sensor',
                required: `${moistureMin.toFixed(0)}% to ${moistureMax.toFixed(0)}%`,
                summary: sensorData.moisture < moistureMin
                    ? `Moisture is below the preferred range for ${profile.name}.`
                    : sensorData.moisture > moistureMax
                        ? `Moisture is above the preferred range for ${profile.name}.`
                        : `Moisture is in the preferred range for ${profile.name}.`,
                tone: sensorData.moisture < moistureMin ? 'critical' : sensorData.moisture > moistureMax ? 'warning' : 'good'
            });
        }

        if (typeof sensorData.ph === 'number') {
            const phMin = profile.ph.optimal[0];
            const phMax = profile.ph.optimal[1];
            cards.push({
                label: 'Soil pH',
                value: sensorData.ph.toFixed(1),
                source: 'Sensor',
                required: `${phMin.toFixed(1)} to ${phMax.toFixed(1)}`,
                summary: sensorData.ph < phMin || sensorData.ph > phMax
                    ? `pH is outside the preferred range for ${profile.name} and may reduce nutrient efficiency.`
                    : `pH is in the preferred range for ${profile.name}.`,
                tone: sensorData.ph < phMin || sensorData.ph > phMax ? 'warning' : 'good'
            });
        }

        if (typeof satelliteData.ndvi === 'number') {
            cards.push({
                label: 'Canopy health',
                value: satelliteData.ndvi.toFixed(2),
                source: 'Satellite',
                required: 'NDVI 0.50 or higher',
                summary: satelliteData.ndvi < 0.35
                    ? 'The satellite sees weaker canopy activity than a healthy block should show.'
                    : satelliteData.ndvi < 0.5
                        ? 'Canopy health is acceptable but not yet strong.'
                        : 'The canopy is expressing strong growth from above.',
                tone: satelliteData.ndvi < 0.35 ? 'critical' : satelliteData.ndvi < 0.5 ? 'warning' : 'good'
            });
        }

        if (typeof satelliteData.ndwi === 'number') {
            cards.push({
                label: 'Water balance',
                value: satelliteData.ndwi.toFixed(2),
                source: 'Satellite',
                required: 'NDWI -0.05 or higher',
                summary: satelliteData.ndwi < -0.18
                    ? 'Satellite water balance confirms crop water stress.'
                    : satelliteData.ndwi < -0.05
                        ? 'Water balance is starting to tighten.'
                        : 'Water balance looks comfortable from the latest pass.',
                tone: satelliteData.ndwi < -0.18 ? 'critical' : satelliteData.ndwi < -0.05 ? 'warning' : 'good'
            });
        }

        if (weatherData) {
            const forecastMax = Math.max(...weatherData.daily.temperature_2m_max);
            const rainTotal = weatherData.daily.precipitation_sum.reduce((total, value) => total + value, 0);

            cards.push({
                label: 'Heat outlook',
                value: `${forecastMax.toFixed(1)}°C`,
                source: 'Weather',
                required: 'Below 32.0°C',
                summary: forecastMax >= 36
                    ? 'Heat in the next week is high enough to push stress and irrigation demand up.'
                    : forecastMax >= 32
                        ? 'Warm weather is coming, so field timing matters more this week.'
                        : 'The next week stays in a manageable temperature range.',
                tone: forecastMax >= 36 ? 'critical' : forecastMax >= 32 ? 'warning' : 'good'
            });

            cards.push({
                label: '7-day rain',
                value: `${rainTotal.toFixed(1)} mm`,
                source: 'Weather',
                required: 'At least 8.0 mm',
                summary: rainTotal >= 20
                    ? 'Rainfall should ease irrigation demand, but disease pressure may rise.'
                    : rainTotal >= 8
                        ? 'Some rainfall support is coming in the forecast.'
                        : 'Very little rainfall is expected, so irrigation planning is important.',
                tone: rainTotal >= 20 ? 'good' : rainTotal >= 8 ? 'warning' : 'critical'
            });
        }

        return cards.slice(0, 6);
    }

    private buildMigrationSummary(
        currentEvaluation: CropEvaluation,
        bestOption: FarmerMigrationOption | null
    ): FarmerMigrationSummary {
        if (!this.shouldRecommendMigration(currentEvaluation, bestOption)) {
            return {
                title: `Keep ${currentEvaluation.cropName} and improve field conditions`,
                summary: `Do not change crops today. Fix the main field issues first and review again after fresh data arrives.`,
                reason: 'A crop change is not justified today because the current block can still recover more safely than a full crop change.',
                recommendedCrop: null,
                suggestedSharePct: 0,
                projectedProfitAfterMigration: currentEvaluation.projectedProfit,
                gainVsCurrent: 0,
                benefits: [
                    'Lower disruption for the farm team',
                    'Faster recovery by improving today’s main stress factors',
                    'Keeps current crop knowledge and infrastructure in use'
                ]
            };
        }

        const share = bestOption.suggestedSharePct / 100;
        const projectedProfitAfterMigration =
            currentEvaluation.projectedProfit * (1 - share) +
            bestOption.expectedAnnualProfit * share;

        return {
            title: `Phased migration to ${bestOption.cropName} is worth considering`,
            summary: `A small ${bestOption.suggestedSharePct}% trial of ${bestOption.cropName} could improve margin while lowering exposure to the main stress factors showing in the live data.`,
            reason: bestOption.whyItFits,
            recommendedCrop: bestOption.cropName,
            suggestedSharePct: bestOption.suggestedSharePct,
            projectedProfitAfterMigration,
            gainVsCurrent: projectedProfitAfterMigration - currentEvaluation.projectedProfit,
            benefits: bestOption.benefits.slice(0, 3)
        };
    }

    private buildReasons(
        currentEvaluation: CropEvaluation,
        bestOption: FarmerMigrationOption | null
    ): string[] {
        const reasons = [...currentEvaluation.concerns.slice(0, 2)];

        if (this.shouldRecommendMigration(currentEvaluation, bestOption) && bestOption) {
            reasons.push(`${bestOption.cropName} is the strongest alternative if conditions do not improve.`);
        } else {
            reasons.push('No crop change is recommended today.');
        }

        if (!reasons.length) {
            reasons.push('The combined sensor, satellite, and weather data does not show a strong migration trigger today.');
        }

        return reasons.slice(0, 3);
    }

    private buildBenefits(
        currentEvaluation: CropEvaluation,
        bestOption: FarmerMigrationOption | null
    ): string[] {
        if (!this.shouldRecommendMigration(currentEvaluation, bestOption)) {
            return [
                'Fix the current block issues before making a bigger decision.',
                'Keep current vineyard operations and infrastructure in place.',
                'Use the next weather window to recover margin without a crop change.'
            ];
        }

        return bestOption.benefits.slice(0, 3);
    }

    private buildActionPlan(
        input: FarmerAdvisoryInput,
        currentEvaluation: CropEvaluation,
        bestOption: FarmerMigrationOption | null
    ): FarmerActionStep[] {
        const actions: FarmerActionStep[] = [];
        const { sensorData, satelliteData, weatherData } = input;

        if (typeof sensorData.moisture === 'number' && sensorData.moisture < 35) {
            actions.push({
                timing: 'Next 24 hours',
                title: 'Lift root-zone moisture',
                detail: 'Run an irrigation correction and inspect emitters in the driest rows first.',
                reason: 'Low soil moisture is the clearest drag on current profit.'
            });
        }

        if (typeof satelliteData.ndvi === 'number' && satelliteData.ndvi < 0.4) {
            actions.push({
                timing: 'This week',
                title: 'Scout weak canopy zones',
                detail: 'Walk the areas showing weaker satellite vigour and confirm whether stress is water, nutrition, or disease related.',
                reason: 'Satellite data is already showing visible canopy weakness.'
            });
        }

        if (weatherData) {
            const hottestDay = Math.max(...weatherData.daily.temperature_2m_max);
            if (hottestDay >= 34) {
                actions.push({
                    timing: 'Before the next hot day',
                    title: 'Shift irrigation and spray timing',
                    detail: 'Move sensitive operations to cooler hours and avoid high-wind or high-heat periods.',
                    reason: 'The forecast is warm enough to increase crop stress and spray risk.'
                });
            }
        }

        if (this.shouldRecommendMigration(currentEvaluation, bestOption) && bestOption) {
            actions.push({
                timing: 'This month',
                title: `Model a ${bestOption.suggestedSharePct}% ${bestOption.cropName} migration trial`,
                detail: 'Price a small phased conversion for part of the block so you can compare water use, margin, and operational fit before going broader.',
                reason: `${bestOption.cropName} is the strongest alternative in the current data.`
            });
        } else {
            actions.push({
                timing: 'This month',
                title: 'Reassess after the next satellite refresh',
                detail: 'Check whether moisture recovery and canopy response are improving before considering migration.',
                reason: 'The current crop can still recover without forcing a crop change today.'
            });
        }

        return actions.slice(0, 4);
    }

    private buildSources(input: FarmerAdvisoryInput): string[] {
        const sources: string[] = [];
        if (Object.values(input.sensorData).some(value => typeof value === 'number')) {
            sources.push('IoT sensors');
        }
        if (Object.values(input.satelliteData).some(value => typeof value === 'number')) {
            sources.push('Satellite indices');
        }
        if (input.weatherData) {
            sources.push('Current weather');
            sources.push('7-day forecast');
        }
        return sources;
    }

    private buildHeadline(
        currentEvaluation: CropEvaluation,
        bestOption: FarmerMigrationOption | null
    ): string {
        if (this.shouldRecommendMigration(currentEvaluation, bestOption) && bestOption) {
            return `A small ${bestOption.cropName} trial is worth reviewing for this block.`;
        }

        if (currentEvaluation.suitabilityScore >= 70) {
            return `${currentEvaluation.cropName} is still the best choice for this block right now.`;
        }

        return `Keep ${currentEvaluation.cropName} for now and fix the main stress issues first.`;
    }

    private buildSummary(
        currentEvaluation: CropEvaluation,
        bestOption: FarmerMigrationOption | null
    ): string {
        if (!this.shouldRecommendMigration(currentEvaluation, bestOption)) {
            return `Live data says the block needs recovery work first. Improve moisture and the main stress signals before making any crop change decision.`;
        }

        return `${bestOption.cropName} is the strongest alternative in the current data, so a small trial may be worth reviewing if you want to test a lower-risk change.`;
    }

    private getRecommendationLabel(
        currentEvaluation: CropEvaluation,
        bestOption: FarmerMigrationOption | null
    ): string {
        if (!this.shouldRecommendMigration(currentEvaluation, bestOption)) {
            return 'Keep current crop';
        }

        return 'Review a small trial';
    }

    private getRecommendationTone(
        currentEvaluation: CropEvaluation,
        bestOption: FarmerMigrationOption | null
    ): FarmerAdvisoryTone {
        if (!this.shouldRecommendMigration(currentEvaluation, bestOption)) {
            return currentEvaluation.suitabilityScore >= 70 ? 'good' : 'warning';
        }

        return bestOption.profitDelta > currentEvaluation.projectedProfit * 0.4 ? 'critical' : 'warning';
    }

    private shouldRecommendMigration(
        currentEvaluation: CropEvaluation,
        bestOption: FarmerMigrationOption | null
    ): bestOption is FarmerMigrationOption {
        return !!bestOption
            && bestOption.profitDelta > 0
            && bestOption.suitabilityScore > currentEvaluation.suitabilityScore + 5;
    }

    private getConfidenceLabel(input: FarmerAdvisoryInput): string {
        const sourceCount = this.buildSources(input).length;
        if (input.profitRiskData) {
            return sourceCount >= 4 ? 'High confidence' : 'Medium confidence';
        }
        if (sourceCount >= 4) {
            return 'High confidence';
        }
        if (sourceCount >= 2) {
            return 'Medium confidence';
        }
        return 'Low confidence';
    }

    private resolveEconomics(
        profile: CropProfile,
        input: FarmerAdvisoryInput,
        isMigrationCandidate: boolean
    ): { baseAnnualProfit: number; waterRequirement: number } {
        const areaHa = input.areaHa || 0;
        const profitRiskData = input.profitRiskData;
        if (!profitRiskData) {
            return {
                baseAnnualProfit: profile.profitPerHa * areaHa,
                waterRequirement: profile.waterRequirement
            };
        }

        if (!isMigrationCandidate) {
            return {
                baseAnnualProfit: profitRiskData.currentCrop.netMarginPerHa * areaHa,
                waterRequirement: profitRiskData.currentCrop.waterReqMlHa || profile.waterRequirement
            };
        }

        const matchedMargin = this.findProfitRiskMargin(profile.name, profitRiskData.margins);
        if (!matchedMargin) {
            return {
                baseAnnualProfit: profile.profitPerHa * areaHa,
                waterRequirement: profile.waterRequirement
            };
        }

        return {
            baseAnnualProfit: matchedMargin.netMarginPerHa * areaHa,
            waterRequirement: matchedMargin.waterReqMlHa || profile.waterRequirement
        };
    }

    private calculateLiveAdjustment(baseAnnualProfit: number, suitabilityScore: number): number {
        if (!baseAnnualProfit) {
            return 0;
        }

        const adjustmentStrength = ((suitabilityScore - 70) / 100) * 0.35;
        return Math.round(Math.abs(baseAnnualProfit) * adjustmentStrength * 100) / 100;
    }

    private findProfitRiskMargin(
        cropName: string,
        margins: ProfitRiskCropSnapshot[]
    ): ProfitRiskCropSnapshot | undefined {
        const aliases = this.getProfitRiskAliases(cropName);
        return margins.find(row => {
            const normalizedRow = this.normalizeCropLabel(row.crop);
            return aliases.some(alias => normalizedRow.includes(alias) || alias.includes(normalizedRow));
        });
    }

    private getProfitRiskAliases(cropName: string): string[] {
        const normalized = this.normalizeCropLabel(cropName);
        const aliasMap: Record<string, string[]> = {
            'grenache': ['grenache'],
            'shiraz': ['shiraz'],
            'chardonnay': ['chardonnay'],
            'cabernet sauvignon': ['cabernet sauvignon', 'cabernet'],
            'merlot': ['merlot'],
            'olives': ['olive oil', 'olives evoo', 'fresh table olives', 'table olives', 'olives'],
            'almonds': ['almond kernel', 'almonds'],
            'citrus': ['navel oranges', 'citrus oranges', 'mandarins', 'lemons', 'citrus', 'oranges']
        };

        return aliasMap[normalized] || [normalized];
    }

    private normalizeCropLabel(value: string): string {
        return value
            .trim()
            .toLowerCase()
            .replace(/[—–-]/g, ' ')
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private getSatelliteScore(
        satelliteData: FarmerAdvisoryInput['satelliteData']
    ): number {
        const ndviScore = typeof satelliteData.ndvi === 'number' ? this.clamp(((satelliteData.ndvi - 0.18) / 0.42) * 100, 0, 100) : null;
        const ndwiScore = typeof satelliteData.ndwi === 'number' ? this.clamp(((satelliteData.ndwi + 0.3) / 0.45) * 100, 0, 100) : null;
        const ndreScore = typeof satelliteData.ndre === 'number' ? this.clamp(((satelliteData.ndre - 0.12) / 0.28) * 100, 0, 100) : null;
        const eviScore = typeof satelliteData.evi === 'number' ? this.clamp(((satelliteData.evi - 0.12) / 0.35) * 100, 0, 100) : null;
        const laiScore = typeof satelliteData.lai === 'number' ? this.clamp((satelliteData.lai / 5.5) * 100, 0, 100) : null;

        return this.getWeightedAverage([
            { score: ndviScore, weight: 38 },
            { score: ndwiScore, weight: 24 },
            { score: ndreScore, weight: 18 },
            { score: eviScore, weight: 10 },
            { score: laiScore, weight: 10 }
        ]);
    }

    private getWeatherScore(
        profile: CropProfile,
        weatherData: WeatherData | null,
        sensorData: Partial<SensorData>
    ): number {
        if (!weatherData) {
            return 55;
        }

        const hottestDay = Math.max(...weatherData.daily.temperature_2m_max);
        const rainTotal = weatherData.daily.precipitation_sum.reduce((total, value) => total + value, 0);
        const maxRainChance = Math.max(...weatherData.daily.precipitation_probability_max);
        const windNow = weatherData.current.windSpeed;
        let score = 70;

        if (hottestDay > profile.temp.max) {
            score -= Math.min(25, (hottestDay - profile.temp.max) * 4);
        } else if (hottestDay > profile.temp.optimal[1]) {
            score -= Math.min(10, (hottestDay - profile.temp.optimal[1]) * 2);
        }

        if (rainTotal < 8 && typeof sensorData.moisture === 'number' && sensorData.moisture < profile.moisture.optimal[0]) {
            score -= 15;
        }

        if (rainTotal > 30 && maxRainChance > 70) {
            score -= 8;
        }

        if (windNow >= 8) {
            score -= 6;
        }

        if (profile.waterRequirement <= 7 && rainTotal < 8) {
            score += 4;
        }

        return this.clamp(score, 20, 95);
    }

    private buildOptionBenefits(
        currentEvaluation: CropEvaluation,
        option: CropEvaluation,
        waterSaving: number
    ): string[] {
        const benefits: string[] = [];

        if (option.projectedProfit > currentEvaluation.projectedProfit) {
            benefits.push(`Projected to earn ${this.formatCurrency(option.projectedProfit - currentEvaluation.projectedProfit)} more than the current crop.`);
        }

        if (waterSaving > 0) {
            benefits.push(`Uses ${waterSaving.toFixed(1)} ML/ha less water than ${currentEvaluation.cropName}.`);
        }

        if (option.suitabilityScore > currentEvaluation.suitabilityScore) {
            benefits.push(`Fits the current live field conditions better than ${currentEvaluation.cropName}.`);
        }

        if (!benefits.length) {
            benefits.push('Worth tracking as a secondary option if the current crop deteriorates.');
        }

        return benefits;
    }

    private scoreRange(
        value: number | undefined,
        min: number,
        max: number,
        optimal: [number, number]
    ): number {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return 55;
        }

        if (value >= optimal[0] && value <= optimal[1]) {
            const spread = Math.max(1, optimal[1] - optimal[0]);
            const distanceFromCenter = Math.abs(value - (optimal[0] + optimal[1]) / 2);
            return this.clamp(100 - (distanceFromCenter / spread) * 18, 82, 100);
        }

        if (value < min || value > max) {
            return 15;
        }

        const distance = value < optimal[0] ? optimal[0] - value : value - optimal[1];
        const range = value < optimal[0] ? optimal[0] - min : max - optimal[1];
        return this.clamp(80 - (distance / Math.max(range, 1)) * 55, 20, 80);
    }

    private getWeightedAverage(items: Array<{ score: number | null; weight: number }>): number {
        const filtered = items.filter((item): item is { score: number; weight: number } => typeof item.score === 'number');
        if (!filtered.length) {
            return 55;
        }

        const totalWeight = filtered.reduce((sum, item) => sum + item.weight, 0);
        const weightedValue = filtered.reduce((sum, item) => sum + item.score * item.weight, 0);
        return weightedValue / totalWeight;
    }

    private formatCurrency(value: number): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'AUD',
            maximumFractionDigits: 0
        }).format(value);
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
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
        const exactMatch = this.cropProfiles[cropName];
        if (exactMatch) {
            return exactMatch;
        }

        const normalized = cropName.trim().toLowerCase();
        const matchedEntry = Object.entries(this.cropProfiles).find(([name]) =>
            name.toLowerCase() === normalized ||
            normalized.includes(name.toLowerCase()) ||
            name.toLowerCase().includes(normalized)
        );

        return matchedEntry?.[1];
    }
}
