import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SoilData } from '../../model/soil.model';

@Injectable({
  providedIn: 'root'
})
export class SoilService {
  private soilData: SoilData[] = [];
  private isLoaded = false;

  private readonly soilFactorMap: any = {
    "A1": 0.7,
    "A2": 0.8,
    "A3": 0.85,
    "A4": 1.0,
    "A5": 1.15,
    "A6": 1.25,
    "D3": 0.95,
    "D4": 1.1
  };

  constructor(private http: HttpClient) {}

  async loadSoilData(): Promise<void> {
    if (this.isLoaded) return;
    try {
      console.log('SoilService: Loading soil-data.json...');
      const data = await firstValueFrom(
        this.http.get<SoilData[]>('assets/data/soil-data.json')
      );
      this.soilData = data;
      this.isLoaded = true;
      console.log('SoilService: Data loaded successfully. Count:', this.soilData.length);
    } catch (error) {
      console.error('SoilService: Error loading soil data:', error);
    }
  }

  getSoilByRegion(region: string): SoilData | undefined {
    return this.soilData.find(s => s.Region.trim().toUpperCase() === region.trim().toUpperCase());
  }

  getSoilByLANSLU(lanslu: string): SoilData | undefined {
    return this.soilData.find(s => s.LANSLU === lanslu);
  }

  calculateSoilFactor(soil: SoilData): number {
    const p = this.soilFactorMap[soil.Primary_Soil_Classification] || 1;
    const s = this.soilFactorMap[soil.Secondary_Soil_Classification] || 1;
    const t = this.soilFactorMap[soil.Tertiary_Soil_Classification] || 1;

    const factor = (
      (p * soil.Primary_Soil_Value) +
      (s * soil.Secondary_Soil_Value) +
      (t * soil.Tertiary_Soil_Value)
    ) / 100;

    console.log('SoilService: Calculated weighted soil factor:', factor, 'for LANSLU:', soil.LANSLU);
    return factor;
  }
}
