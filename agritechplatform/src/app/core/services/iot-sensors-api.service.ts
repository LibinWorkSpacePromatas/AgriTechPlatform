import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type IotSensorType =
  | 'soil_moisture'
  | 'soil_temperature'
  | 'air_temperature'
  | 'humidity'
  | 'ph_level';

export type IotSensorStatus = 'Normal' | 'High' | 'Low';

export interface IotSensorHistoryPoint {
  value: number;
  status: IotSensorStatus;
  observed_at: string;
}

export interface IotSensorHistoryBundle {
  hourly: IotSensorHistoryPoint[];
  daily: IotSensorHistoryPoint[];
  weekly: IotSensorHistoryPoint[];
}

export interface IotDashboardSensorContract {
  sensor_id: string;
  sensor_type: IotSensorType;
  label: string;
  unit: string;
  threshold_low: number | null;
  threshold_high: number | null;
  suggested_min: number | null;
  suggested_max: number | null;
  value: number;
  status: IotSensorStatus;
  observed_at: string;
  histories: IotSensorHistoryBundle;
}

export interface BlockIotSensorsResponse {
  block_id: string;
  block_name: string;
  generated_at: string;
  sensors: IotDashboardSensorContract[];
}

@Injectable({
  providedIn: 'root'
})
export class IotSensorsApiService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  getBlockSensors(blockId: string): Observable<BlockIotSensorsResponse> {
    return this.http.get<BlockIotSensorsResponse>(`${this.baseUrl}/api/blocks/${blockId}/sensors`);
  }
}
