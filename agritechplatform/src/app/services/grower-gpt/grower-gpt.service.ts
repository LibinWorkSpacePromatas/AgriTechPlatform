import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { lastValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class GrowerGptService {
  private baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  getRuleBasedInsights(blockId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/api/gpt/${blockId}`);
  }

  getUserSummary(userId: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/api/gpt/user/${userId}`);
  }

  async askGrowerGPT(block: any, user: any, irrigation: any, message: string, blockName: string) {
    const systemPrompt = `
You are Grower GPT, an AI agronomist specialized ONLY in Australian viticulture and the AgriTech Crop Prediction platform.

Rules:
- Only answer agriculture-related questions or questions about this AgriTech platform.
- Use metric units.
- Refuse non-agriculture topics (e.g., politics, crypto).
- If block data is provided in the context, you MUST use that data. You are NOT allowed to ask the user to re-provide soil, crop, or weather data.
- If the user asks about this AgriTech Crop Prediction website, you must explain how the irrigation engine, soil model, ET₀ calculation, or block system works. Do not refuse website-related questions.
- Use the platform-computed values exactly. 
- Do not recalculate ETc, irrigationNeeded, or soilFactor. Use only values provided by the platform engine.
- Do not override ETc, Kc, soilFactor, or irrigationNeeded. 
- Do not assume new crop coefficients. 
- Only explain and summarize.
`;

    const context = `
PLATFORM DATA (DO NOT RECALCULATE):

BLOCK INFORMATION:
Block Name: ${blockName}
Crop: ${block.crop}
Area: ${block.area} hectares
Location: ${block.latitude}, ${block.longitude}

SATELLITE TRUTH (NDWI):
NDWI Value: ${irrigation?.ndwi ?? 'N/A'}
Water Status: ${irrigation?.status ?? 'N/A'}
Data Quality: ${irrigation?.dataQuality ?? 'N/A'}
Recommendation: ${irrigation?.recommendation ?? 'N/A'}

FINANCIAL DATA (Profit & Risk):
- Projected ROI: ${user?.financials?.projectedRoi ?? 'N/A'}%
- Risk Index: ${user?.financials?.riskIndex ?? 'N/A'}
- Potential Loss: $${user?.financials?.potentialLoss ?? 'N/A'}
- Estimated Yield: ${user?.financials?.estimatedYield ?? 'N/A'} t/ha
- Market Value: $${user?.financials?.marketValue ?? 'N/A'}/ton

GROWING OPPORTUNITIES:
${user?.opportunities?.map((o: any) => `- ${o.title} (${o.tags.join(', ')})`).join('\n') || 'None listed'}

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
