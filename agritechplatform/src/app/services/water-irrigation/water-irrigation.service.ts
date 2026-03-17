import { Injectable } from '@angular/core';
import { Observable, map, catchError, of, forkJoin } from 'rxjs';
import { WeatherService, WeatherData, IrrigationRecommendation } from '../weather-service/weather.service';
import { SoilService } from '../soil/soil.service';
import { SoilData } from '../../model/soil.model';
import { environment } from '../../../environments/environment';
import { SensorService } from '../../core/services/sensor.service';

export interface SoilDepthReading {
  depth: number;
  moisture: number;
  status: 'optimal' | 'low' | 'high';
}

export interface IrrigationStatus {
  currentHydration: number;
  irrigationNeeded: number;
  irrigationMessage: string;
  et0Today: number;
  rainToday: number;
  netIrrigation: number;
  kcValue: number; // Expose Kc for UI verification
  status: 'urgent' | 'monitor' | 'saturated';
  soilReadings: SoilDepthReading[];
  nextIrrigationTime: Date;
  confidence: number;
  soilData?: SoilData;
  soilFactor?: number;
  bomStation?: {
    station_id: number;
    name: string;
    distance_km: number;
    state_code?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class WaterIrrigationService {
  private readonly DEPTH_LEVELS = [30, 60, 90]; // cm
  private readonly OPTIMAL_RANGES = {
    30: { min: 0.35, max: 0.65 },
    60: { min: 0.30, max: 0.60 },
    90: { min: 0.25, max: 0.55 }
  };
  private readonly KC_FACTOR = 0.85; // Crop coefficient for generic crops

  constructor(
    private weatherService: WeatherService,
    private soilService: SoilService,
    private sensorService: SensorService
  ) {}

  /**
   * Get seasonally-adjusted Kc value based on current month
   * Uses FAO-56 grapevine coefficients for South Australian climate
   */
  private getKcByMonth(): number {
    const month = new Date().getMonth(); // 0 = January
    
    const kcMap: { [key: number]: number } = {
      8: 0.35,  // September - Budburst
      9: 0.55,  // October - Early Growth
      10: 0.70, // November - Canopy Development
      11: 0.85, // December - Full Canopy
      0: 0.90,  // January - Peak Water Use
      1: 0.75,  // February - Ripening
      2: 0.65,  // March - Late Season
      3: 0.50   // April - Post Harvest
    };
    
    return kcMap[month] || 0.70; // Default to development stage
  }

  /**
   * Get crop-specific Kc value for mid-season (full canopy)
   * Based on FAO-56 and viticulture research for South Australian varieties
   */
  private getCropSpecificKc(cropName: string): number {
    const cropKcMap: { [key: string]: number } = {
      'Shiraz': 0.85,
      'Cabernet Sauvignon': 0.88,
      'Grenache': 0.80,
      'Merlot': 0.85,
      'Chardonnay': 0.78,
      'Riesling': 0.75,
      'Semillon': 0.80,
      'Pinot Grigio': 0.78
    };
    
    return cropKcMap[cropName] || 0.85; // Default to Shiraz if unknown
  }

  getIrrigationStatus(lat?: number, lon?: number, lanslu: string = "BCPKFB", cropName?: string): Observable<IrrigationStatus> {
    const latitude = lat || -34.53;
    const longitude = lon || 138.96;

    // STEP 1: Load soil data and weather
    return forkJoin({
      soilLoaded: this.soilService.loadSoilData(),
      weather: this.weatherService.getWeather(latitude, longitude).pipe(
        map(data => {
          console.log('Weather Service: Data fetched for coordinates:', latitude, longitude);
          return data;
        })
      )
    }).pipe(
      map(({ weather }) => {
        // Get soil data by LANSLU (Master Logic)
        const soil = this.soilService.getSoilByLANSLU(lanslu);
        
        // Use weather service rain data as fallback since there's no backend BoM station
        const fallbackRain = this.calculateDailyRain(weather.rain);
        
        const status = this.calculateIrrigationStatus(weather, soil, fallbackRain, cropName);
        
        // Provide mock station info for UI display
        status.bomStation = {
          station_id: 24048,
          name: "RENMARK AERO (Mocked)",
          distance_km: 12.4,
          state_code: "SA"
        };
        
        return status;
      }),
      catchError(err => {
        console.error('WaterIrrigationService error:', err);
        return of(this.getFallbackStatus());
      })
    );
  }

  private calculateIrrigationStatus(weatherData: WeatherData, soil?: SoilData, bomRain?: number | null, cropName?: string): IrrigationStatus {
    // Use real Open-Meteo multi-depth soil moisture
    const moisture30 = (weatherData.soilMoistureDepths?.['0-1cm']?.[0] || 0) * 100;
    const moisture60 = (weatherData.soilMoistureDepths?.['9-27cm']?.[0] || 0) * 100;
    const moisture90 = (weatherData.soilMoistureDepths?.['27-81cm']?.[0] || 0) * 100;

    // STEP 0: Get Hydration from SensorService (Single Source of Truth)
    // This ensures Dashboard and Irrigation page show the exact same value.
    const currentHydration = this.sensorService.getSoilMoisture();

    // STEP 1: Calculate ETc (Crop Evapotranspiration)
    // ETc = ET₀ × Kc (crop-specific for mid-season)
    const todayET0 = this.calculateDailyET0(weatherData.et0);
    const kc = this.getCropSpecificKc(cropName || 'Shiraz');
    
    // DEBUG: Verify formula update and Kc value
    console.debug(`[IrrigationFormula] Crop: ${cropName || 'Shiraz'}, Kc: ${kc}, ET0: ${todayET0}`);
    
    const todayETc = todayET0 * kc;

    // STEP 2: Calculate Net Deficit using BoM Rainfall with Open-Meteo fallback
    // Deficit = ETc - EffectiveRain
    const openMeteoRain = this.calculateDailyRain(weatherData.rain);
    
    // BoM fallback logic: If BoM is 0 or null, we check Open-Meteo
    let rainToUse = openMeteoRain;
    if (bomRain !== null && bomRain !== undefined && bomRain > 0) {
      rainToUse = bomRain;
    }
    
    const effectiveRain = rainToUse * 0.8; // Assuming 80% of rain is effective
    const deficit = Math.max(0, todayETc - effectiveRain); // Clamp to prevent negative irrigation
    
    // STEP 3: Weighted Soil Factor Adjustment
    let soilFactor = 1.0;
    if (soil) {
      soilFactor = this.soilService.calculateSoilFactor(soil);
    }
    
    // Adjusted_mm = Deficit / SoilFactor
    const adjustedMM = deficit / soilFactor;

    // STEP 4: Convert mm to ML/ha
    // 1 mm over 1 hectare = 0.01 ML
    const irrigationNeeded = Number((adjustedMM * 0.01).toFixed(3));

    // STEP 5: Realistic Soil Moisture Logic (Scientific MVP Model)
    // hydration = baselineMoisture + (rain * 0.8 * 2) - (etc / soilFactor) * 1.5
    // let hydration = currentSoilMoisture * 100; // Start with baseline sensor data (0-100 scale)
    
    // // Rain recharge (Effective Rain * 2 multiplier for hydration impact)
    // const recharge = (rainToUse * 0.8 * 2);
    // hydration += recharge;
    
    // // ETc depletion (Soil-adjusted depletion rate)
    // // Sandy soil (low soilFactor) depletes faster; Clay (high soilFactor) depletes slower
    // const depletion = (todayETc / soilFactor) * 0.8;
    // hydration -= depletion;
    
    // // Final Clamping (5-100%) with minimum realistic soil moisture floor = 5%
    // const currentHydration = Math.max(5, Math.min(100, hydration));
    const adjustedMoisture = currentHydration / 100;

    // Generate soil readings for different depths
    const soilReadings = this.generateSoilReadings(adjustedMoisture);
    
    // Determine status from soil moisture
    let status: 'urgent' | 'monitor' | 'saturated';
    if (currentHydration < 20) {
      status = 'urgent';
    } else if (currentHydration > 80) {
      status = 'saturated';
    } else {
      status = 'monitor';
    }

    const irrigationMessage = this.generateIrrigationMessage(status, adjustedMoisture);
    const nextIrrigationTime = this.calculateNextIrrigationTime(status, weatherData);
    const confidence = this.calculateConfidence(weatherData);

    return {
      currentHydration,
      irrigationNeeded,
      irrigationMessage,
      et0Today: todayET0,
      rainToday: rainToUse, // Use BoM rain in the status
      netIrrigation: deficit,
      kcValue: kc,
      status,
      soilReadings,
      nextIrrigationTime,
      confidence,
      soilData: soil,
      soilFactor: soilFactor
    };
  }

  private calculateDailyET0(et0Array: Float32Array): number {
    const hoursToConsider = Math.min(24, et0Array.length);
    let sum = 0;
    for (let i = 0; i < hoursToConsider; i++) {
      sum += et0Array[i] || 0;
    }
    return sum;
  }

  private calculateDailyRain(rainArray: Float32Array): number {
    const hoursToConsider = Math.min(24, rainArray.length);
    let sum = 0;
    for (let i = 0; i < hoursToConsider; i++) {
      sum += rainArray[i] || 0;
    }
    return sum;
  }

  private generateSoilReadings(currentMoisture: number): SoilDepthReading[] {
    // Simulate different moisture levels at various depths
    // In a real app, this would come from multiple sensors
    const baseMoisture = currentMoisture;
    
    return this.DEPTH_LEVELS.map(depth => {
      // Deeper soil tends to retain moisture differently
      const depthFactor = depth === 30 ? 1.1 : depth === 60 ? 0.9 : 0.7;
      const moisture = Math.max(0, Math.min(1, baseMoisture * depthFactor + (Math.random() - 0.5) * 0.1));
      const optimal = this.OPTIMAL_RANGES[depth as keyof typeof this.OPTIMAL_RANGES];
      
      let status: 'optimal' | 'low' | 'high';
      if (moisture < optimal.min) {
        status = 'low';
      } else if (moisture > optimal.max) {
        status = 'high';
      } else {
        status = 'optimal';
      }

      return {
        depth,
        moisture: Math.round(moisture * 100),
        status
      };
    });
  }

  private determineIrrigationStatus(soilMoisture: number): 'urgent' | 'monitor' | 'saturated' {
    if (soilMoisture < environment.irrigation.criticalMoistureThreshold) {
      return 'urgent';
    } else if (soilMoisture > environment.irrigation.optimalMoistureThreshold) {
      return 'saturated';
    } else {
      return 'monitor';
    }
  }

  private generateIrrigationMessage(status: string, moisture: number): string {
    switch (status) {
      case 'urgent':
        return 'URGENT IRRIGATION REQUIRED';
      case 'saturated':
        return 'Soil saturated. No irrigation needed.';
      case 'monitor':
        return 'Monitor conditions. Irrigation likely in 48h.';
      default:
        return 'Monitoring soil conditions.';
    }
  }

  private calculateNextIrrigationTime(status: string, weatherData: WeatherData): Date {
    const now = new Date();
    
    if (status === 'urgent') {
      // Urgent - schedule for next optimal time (early morning)
      const nextMorning = new Date(now);
      nextMorning.setHours(5, 0, 0, 0);
      if (nextMorning <= now) {
        nextMorning.setDate(nextMorning.getDate() + 1);
      }
      return nextMorning;
    } else if (status === 'monitor') {
      // Monitor - schedule for 48 hours from now
      const future = new Date(now);
      future.setHours(future.getHours() + 48);
      return future;
    } else {
      // Saturated - no immediate irrigation needed
      const future = new Date(now);
      future.setHours(future.getHours() + 72);
      return future;
    }
  }

  private calculateConfidence(weatherData: WeatherData): number {
    // Simple confidence calculation based on data completeness
    const hasAllData = weatherData.soilMoisture.length > 0 && 
                      weatherData.et0.length > 0 && 
                      weatherData.rain.length > 0;
    
    if (!hasAllData) return 0;
    
    // Higher confidence if we have at least 24 hours of data
    return weatherData.soilMoisture.length >= 24 ? 0.95 : 0.80;
  }

  private getFallbackStatus(): IrrigationStatus {
    // Fallback status when API fails
    return {
      currentHydration: 64.2,
      irrigationNeeded: 0,
      irrigationMessage: 'Using cached data - check connection',
      et0Today: 0,
      rainToday: 0,
      netIrrigation: 0,
      kcValue: 0.85,
      status: 'monitor',
      soilReadings: [
        { depth: 30, moisture: 75, status: 'optimal' },
        { depth: 60, moisture: 58, status: 'optimal' },
        { depth: 90, moisture: 42, status: 'low' }
      ],
      nextIrrigationTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      confidence: 0.5
    };
  }

  refreshData(lat?: number, lon?: number): Observable<IrrigationStatus> {
    this.weatherService.clearCache();
    return this.getIrrigationStatus(lat, lon);
  }
}