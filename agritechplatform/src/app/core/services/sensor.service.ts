import { Injectable } from '@angular/core';
import { Droplets, Thermometer, Wind, Sprout, CloudRain } from 'lucide-angular';

export interface Sensor {
  id: string;
  label: string;
  value: string | number;
  unit: string;
  status: 'Normal' | 'High' | 'Low';
  icon: any;
  history: number[]; // Deprecated, kept for backward compatibility if needed, maps to historyHours
  historyLabels: string[];

  // New Data Structures
  historyHours: number[];
  labelsHours: string[];
  historyDays: number[];
  labelsDays: string[];
  historyWeeks: number[];
  labelsWeeks: string[];

  // Suggested Access Ranges
  suggestedMin?: number;
  suggestedMax?: number;
}

@Injectable({
  providedIn: 'root'
})
export class SensorService {

  private sensors: Sensor[] = [
    {
      id: '1', label: 'Soil Moisture', value: 32.5, unit: '%', status: 'Normal', icon: Droplets,
      history: [45, 42, 38, 35, 32.5],
      historyLabels: ['-4h', '-3h', '-2h', '-1h', 'Now'],
      historyHours: [30, 31, 32, 31, 30, 29, 28, 28, 29, 30, 32, 35, 38, 40, 42, 41, 39, 37, 35, 34, 33, 32, 32, 32.5],
      labelsHours: Array.from({ length: 24 }, (_, i) => i === 23 ? 'Now' : `-${23 - i}h`),
      historyDays: [35, 34, 38, 42, 40, 36, 32.5],
      labelsDays: ['-6d', '-5d', '-4d', '-3d', '-2d', 'Yesterday', 'Today'],
      historyWeeks: [45, 40, 38, 32.5],
      labelsWeeks: ['-3 Weeks', '-2 Weeks', 'Last Week', 'This Week'],
      suggestedMin: 0,
      suggestedMax: 100
    },
    {
      id: '2', label: 'Soil Temperature', value: 20.1, unit: '°C', status: 'Normal', icon: Thermometer,
      history: [18, 18.5, 19, 19.5, 20.1],
      historyLabels: ['-4h', '-3h', '-2h', '-1h', 'Now'],
      historyHours: [15, 15, 16, 17, 18, 19, 20, 21, 22, 22, 21, 20, 19, 18, 18, 18, 19, 19.5, 20, 20.1, 20, 19, 18, 18],
      labelsHours: Array.from({ length: 24 }, (_, i) => i === 23 ? 'Now' : `-${23 - i}h`),
      historyDays: [18, 19, 21, 20, 19, 18, 20.1],
      labelsDays: ['-6d', '-5d', '-4d', '-3d', '-2d', 'Yesterday', 'Today'],
      historyWeeks: [22, 20, 18, 20.1],
      labelsWeeks: ['-3 Weeks', '-2 Weeks', 'Last Week', 'This Week'],
      suggestedMin: 0,
      suggestedMax: 40
    },
    {
      id: '3', label: 'Air Temperature', value: 31.4, unit: '°C', status: 'High', icon: Wind,
      history: [26, 28, 29.5, 30.8, 31.4],
      historyLabels: ['-4h', '-3h', '-2h', '-1h', 'Now'],
      historyHours: [20, 21, 23, 25, 28, 30, 32, 33, 34, 33, 32, 31, 30, 29, 28, 27, 26, 27, 28, 29, 30, 31, 31.4, 31],
      labelsHours: Array.from({ length: 24 }, (_, i) => i === 23 ? 'Now' : `-${23 - i}h`),
      historyDays: [25, 28, 30, 32, 34, 33, 31.4],
      labelsDays: ['-6d', '-5d', '-4d', '-3d', '-2d', 'Yesterday', 'Today'],
      historyWeeks: [28, 30, 32, 31.4],
      labelsWeeks: ['-3 Weeks', '-2 Weeks', 'Last Week', 'This Week'],
      suggestedMin: 0,
      suggestedMax: 50
    },
    {
      id: '4', label: 'Humidity', value: 38.7, unit: '%', status: 'Normal', icon: CloudRain,
      history: [45, 42, 40, 39, 38.7],
      historyLabels: ['-4h', '-3h', '-2h', '-1h', 'Now'],
      historyHours: [50, 48, 46, 45, 44, 43, 42, 41, 40, 39, 38, 38, 38.7, 39, 40, 42, 44, 45, 46, 45, 44, 42, 40, 38.7],
      labelsHours: Array.from({ length: 24 }, (_, i) => i === 23 ? 'Now' : `-${23 - i}h`),
      historyDays: [55, 50, 45, 40, 42, 45, 38.7],
      labelsDays: ['-6d', '-5d', '-4d', '-3d', '-2d', 'Yesterday', 'Today'],
      historyWeeks: [60, 55, 50, 38.7],
      labelsWeeks: ['-3 Weeks', '-2 Weeks', 'Last Week', 'This Week'],
      suggestedMin: 0,
      suggestedMax: 100
    },
    {
      id: '5', label: 'pH Level', value: 7.4, unit: '', status: 'Normal', icon: Sprout,
      history: [7.2, 7.3, 7.3, 7.4, 7.4],
      historyLabels: ['-4h', '-3h', '-2h', '-1h', 'Now'],
      historyHours: Array(24).fill(7.4).map(() => 7.3 + Math.random() * 0.2),
      labelsHours: Array.from({ length: 24 }, (_, i) => i === 23 ? 'Now' : `-${23 - i}h`),
      historyDays: [7.2, 7.3, 7.2, 7.4, 7.3, 7.4, 7.4],
      labelsDays: ['-6d', '-5d', '-4d', '-3d', '-2d', 'Yesterday', 'Today'],
      historyWeeks: [7.1, 7.2, 7.3, 7.4],
      labelsWeeks: ['-3 Weeks', '-2 Weeks', 'Last Week', 'This Week'],
      suggestedMin: 0,
      suggestedMax: 14
    }
  ];

  constructor() { }

  getSensors(): Sensor[] {
    return this.sensors;
  }

  getSoilMoisture(): number {
    const soil = this.sensors.find(s => s.label === 'Soil Moisture');
    return soil ? Number(soil.value) : 0;
  }

  simulateSensorReadings() {
    this.sensors.forEach(sensor => {
      // Small random fluctuation
      const fluctuation = (Math.random() - 0.5) * 0.5; // +/- 0.25
      let newValue = Number(sensor.value) + fluctuation;

      // Clamp values to realistic ranges
      if (sensor.label === 'Soil Moisture') newValue = Math.max(0, Math.min(100, newValue));
      if (sensor.label === 'Humidity') newValue = Math.max(0, Math.min(100, newValue));
      if (sensor.label === 'pH Level') newValue = Math.max(0, Math.min(14, newValue));

      sensor.value = Number(newValue.toFixed(1));

      // Update history with new value and remove oldest
      sensor.history.push(sensor.value);
      if (sensor.history.length > 5) {
        sensor.history.shift();
      }

      // We keep historyLabels static for now as per original implementation
    });
  }

  calculateNutrientIndex(sensors: Sensor[]): { status: 'High' | 'Medium' | 'Low', reason: string, score: number, details: string[] } {
    const phSensor = sensors.find(s => s.label === 'pH Level');
    const moistureSensor = sensors.find(s => s.label === 'Soil Moisture');
    const tempSensor = sensors.find(s => s.label === 'Soil Temperature');

    const ph = phSensor ? Number(phSensor.value) : 7.0;
    const moisture = moistureSensor ? Number(moistureSensor.value) : 30;
    const temp = tempSensor ? Number(tempSensor.value) : 20;

    let score = 0;
    const details: string[] = [];

    // 1. pH Score (40 points max) - Optimal 6.0 - 7.5
    if (ph >= 6.0 && ph <= 7.5) {
      score += 40;
      details.push(`pH ${ph} is optimal for nutrient uptake (+40)`);
    } else if ((ph >= 5.5 && ph < 6.0) || (ph > 7.5 && ph <= 8.0)) {
      score += 25;
      details.push(`pH ${ph} is slightly outside optimal range (+25)`);
    } else {
      score += 10;
      details.push(`pH ${ph} limits nutrient availability significantly (+10)`);
    }

    // 2. Moisture Score (30 points max) - Optimal 30% - 60%
    if (moisture >= 30 && moisture <= 60) {
      score += 30;
      details.push(`Moisture ${moisture}% supports nutrient transport (+30)`);
    } else if ((moisture >= 20 && moisture < 30) || (moisture > 60 && moisture <= 80)) {
      score += 15;
      details.push(`Moisture ${moisture}% is suboptimal for transport (+15)`);
    } else {
      score += 5;
      details.push(`Moisture ${moisture}% severely restricts nutrient movement (+5)`);
    }

    // 3. Temperature Score (30 points max) - Optimal 15C - 25C
    if (temp >= 15 && temp <= 25) {
      score += 30;
      details.push(`Temp ${temp}°C promotes microbial activity (+30)`);
    } else if ((temp >= 10 && temp < 15) || (temp > 25 && temp <= 30)) {
      score += 15;
      details.push(`Temp ${temp}°C slows microbial activity (+15)`);
    } else {
      score += 5;
      details.push(`Temp ${temp}°C inhibits nutrient mineralization (+5)`);
    }

    // Determine Status and Main Reason
    let status: 'High' | 'Medium' | 'Low' = 'Low';
    let reason = '';

    if (score >= 80) {
      status = 'High';
      reason = 'Optimal conditions for high nutrient availability.';
    } else if (score >= 50) {
      status = 'Medium';
      reason = 'Moderate nutrient availability; some factors acceptable.';
    } else {
      status = 'Low';
      // Find the lowest contributing factor to blame
      if (ph < 6.0 || ph > 7.5) reason = 'pH imbalance locking out nutrients.';
      else if (moisture < 30 || moisture > 60) reason = 'Moisture levels limiting transport.';
      else if (temp < 15 || temp > 25) reason = 'Temperature limiting microbial action.';
      else reason = 'Combined suboptimal conditions.';
    }

    return { status, reason, score, details };
  }
}
