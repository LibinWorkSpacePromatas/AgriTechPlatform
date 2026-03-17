import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class GrowerGptService {

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

SOIL INFORMATION:
Soil Code: ${block.soilSubgroup}
Soil Description: ${block.description}
Primary Soil Type: ${user?.primarySoilType || 'N/A'}
Soil Factor: ${irrigation?.soilFactor ?? 'N/A'}

IRRIGATION ENGINE OUTPUT:
ET0: ${irrigation?.et0Today ?? 'N/A'} mm/day
Kc: ${irrigation?.kcValue ?? 'N/A'}
ETc: ${irrigation?.netIrrigation ?? 'N/A'} mm/day
Irrigation Needed: ${irrigation?.irrigationNeeded ?? 'N/A'} ML/ha
Current Hydration: ${irrigation?.currentHydration ?? 'N/A'}%
Rain (7 days): ${irrigation?.rainToday ?? 'N/A'} mm
Status: ${irrigation?.status ?? 'N/A'}

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
      console.debug(`GrowerGptService: Sending request to ${environment.ollama.host}/chat/completions`);
      const response = await fetch(`${environment.ollama.host}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${environment.ollama.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'AgriTech Crop Prediction',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openrouter/free',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `${context}\n\nUser Question:\n${message}`
            }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          throw new Error('The AI service is currently very busy (Rate Limited). Please try again in a few moments or try a different model.');
        }
        throw new Error(`OpenRouter API error: ${response.statusText} ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error in GrowerGptService:', error);
      throw error;
    }
  }
}
