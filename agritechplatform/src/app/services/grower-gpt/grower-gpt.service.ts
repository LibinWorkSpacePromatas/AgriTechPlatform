import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { lastValueFrom } from 'rxjs';
import {
  GrowerGptBlockSummaryContract,
  growerGptBlockSummarySchema,
  MetricInsightContract
} from '../../shared/satellite-contract.schemas';

export interface GrowerGptInsight extends MetricInsightContract {}

export interface GrowerGptBlockSummary extends GrowerGptBlockSummaryContract {}

@Injectable({
  providedIn: 'root'
})
export class GrowerGptService {
  private baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  getRuleBasedInsights(blockId: string): Observable<GrowerGptBlockSummary> {
    return this.http.get<unknown>(`${this.baseUrl}/api/gpt/${blockId}`).pipe(
      map(payload => growerGptBlockSummarySchema.parse(payload))
    );
  }

  getUserSummary(userId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/api/gpt/user/${userId}`);
  }

  async askGrowerGPT(block: any, user: any, satellite: GrowerGptBlockSummary | null, message: string, blockName: string) {
    const blockArea = block.area ?? block.size ?? 'N/A';
    const blockLatitude = block.latitude ?? block.lat ?? 'N/A';
    const blockLongitude = block.longitude ?? block.lon ?? 'N/A';
    const weatherForecast = satellite?.weather?.forecast_7_days?.slice(0, 14) ?? [];

    const systemPrompt = `
You are Grower GPT, an agricultural advisor specialized ONLY in Australian viticulture and the AgriTech Crop Prediction platform.

Rules:
- Only answer agriculture-related questions or questions about this AgriTech platform.
- Use metric units.
- Refuse non-agriculture topics (e.g., politics, crypto).
- If block data is provided in the context, you MUST use that data. You are NOT allowed to ask the user to re-provide soil, crop, or weather data.
- If the user asks about this AgriTech Crop Prediction website, you must explain how the irrigation engine, soil model, or block system works. Do not refuse website-related questions.
- Use ONLY the provided data:
  - Satellite indices and backend interpretations
  - Irrigation decision from the backend decision engine
  - Weather data and forecast
  - IoT sensor readings if available
- Do NOT invent values.
- Do NOT override the backend irrigation decision.
- Do NOT derive new scores, financial conclusions, or custom thresholds.
- Explain reasoning clearly and provide actionable advice.
- If data is missing, say it is missing.
- Use sensor readings when answering sensor-related questions.
- If irrigation is required and the farmer may not have equipment, suggest renting suitable equipment from the marketplace.
`;

    const context = `
PLATFORM DATA (DO NOT RECALCULATE OR OVERRIDE):

BLOCK INFORMATION:
Block Name: ${blockName}
Crop: ${block.crop}
Area: ${blockArea} hectares
Location: ${blockLatitude}, ${blockLongitude}

SATELLITE TRUTH (ALL INDICES):
NDVI: ${satellite?.ndvi ?? 'N/A'} (${satellite?.interpretations.ndvi.status ?? 'No data'})
NDWI: ${satellite?.ndwi ?? 'N/A'} (${satellite?.interpretations.ndwi.status ?? 'No data'})
NDRE: ${satellite?.ndre ?? 'N/A'} (${satellite?.interpretations.ndre.status ?? 'No data'})
EVI: ${satellite?.evi ?? 'N/A'} (${satellite?.interpretations.evi.status ?? 'No data'})
LAI: ${satellite?.lai ?? 'N/A'} (${satellite?.interpretations.lai.status ?? 'No data'})
Data Quality: ${satellite?.data_quality ?? 'N/A'}
Confidence: ${satellite?.confidence ?? 'N/A'}
Data Age Days: ${satellite?.data_age_days ?? 'N/A'}
Last Satellite Update: ${satellite?.last_satellite_update ?? 'N/A'}
Scientific Limitations:
${satellite?.limitations?.map((limitation: string) => `- ${limitation}`).join('\n') || 'None'}
Backend Summary: ${satellite?.message ?? 'N/A'}
Backend Interpretations:
${satellite?.insights?.map((insight: any) => `- ${insight.type.toUpperCase()} (${insight.severity}): ${insight.message} [${insight.action_window}]`).join('\n') || 'None'}
Backend Alerts:
${satellite?.alerts?.map((alert: any) => `- ${alert.metric.toUpperCase()}: ${alert.message} (${alert.threshold})`).join('\n') || 'None'}

IRRIGATION DECISION ENGINE:
Irrigation: ${satellite?.decision?.irrigation ?? 'N/A'}
Urgency: ${satellite?.decision?.urgency ?? 'N/A'}
Water Needed (mm): ${satellite?.decision?.water_needed_mm ?? 'N/A'}
Water Needed (liters): ${satellite?.decision?.water_needed_liters ?? 'N/A'}
Decision Confidence: ${satellite?.decision?.confidence ?? 'N/A'}
Decision Reason: ${satellite?.decision?.reason ?? 'N/A'}
Rental Recommendations: ${satellite?.decision?.rental_recommendations?.join(', ') || 'N/A'}
Rental Reason: ${satellite?.decision?.rental_reason ?? 'N/A'}
Rental Weather Guardrail: ${satellite?.decision?.rental_weather_guardrail ?? 'N/A'}

Irrigation Decision:
${satellite?.decision?.irrigation ?? 'N/A'}

Water Needed:
${satellite?.decision?.water_needed_mm ?? 'N/A'} mm

Soil Moisture:
${satellite?.sensor_data?.soil_moisture ?? 'N/A'}

Weather Forecast:
Rain next 48h: ${satellite?.weather?.rain_next_48h ?? 'N/A'}

WEATHER DATA:
Average Temperature (last 24h): ${satellite?.weather?.temp_avg ?? 'N/A'}
Rain Last 24h: ${satellite?.weather?.rain_24h ?? 'N/A'}
Rain Next 48h: ${satellite?.weather?.rain_next_48h ?? 'N/A'}
7-Day Forecast:
${weatherForecast.map(point => `- ${point.observed_at_local || point.observed_at || 'Unknown time'}: temp=${point.temperature ?? 'N/A'}C, humidity=${point.humidity ?? 'N/A'}%, rain=${point.precipitation ?? 'N/A'}mm`).join('\n') || 'None'}

SENSOR DATA:
Soil Moisture: ${satellite?.sensor_data?.soil_moisture ?? 'N/A'}
Temperature: ${satellite?.sensor_data?.temperature ?? 'N/A'}
Humidity: ${satellite?.sensor_data?.humidity ?? 'N/A'}
pH Level: ${satellite?.sensor_data?.ph_level ?? 'N/A'}
Last Sensor Update: ${satellite?.sensor_data?.last_updated ?? 'N/A'}

You must use these values exactly.
Do not override or assume new values.
`;

    try {
      console.debug(`GrowerGptService: Calling backend proxy at ${this.baseUrl}/api/gpt/chat`);
      const response$ = this.http.post<any>(`${this.baseUrl}/api/gpt/chat`, {
        message: message,
        system_prompt: systemPrompt,
        context: context
      });

      const data = await lastValueFrom(response$);
      return data.response;
    } catch (error: any) {
      console.error('Error in GrowerGptService:', error);
      if (error.status === 429) {
        throw new Error('The AI service is currently very busy (Rate Limited). Please try again in a few moments.');
      }
      throw new Error(`Grower GPT Error: ${error.message || 'Unknown error occurred.'}`);
    }
  }
}
