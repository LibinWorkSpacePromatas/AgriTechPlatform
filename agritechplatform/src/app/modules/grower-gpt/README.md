# 🤖 Grower GPT - AI Agronomist

The **Grower GPT** module is a context-aware AI assistant designed specifically for viticulture. Unlike generic chatbots, it automatically ingests the current state of the farm—including real-time sensor data, irrigation status, and financial metrics—to provide highly specific, actionable advice.

---

## 🧠 Core Intelligence & Context Injection

The secret sauce of Grower GPT is **Context Injection**. Before the user even sends a message, the system constructs a rich "System Prompt" containing the live digital twin state of the vineyard.

### 1. Data Aggregation
When the chat is initialized, `GrowerGptComponent` aggregates data from multiple sources:
- **Block Context**: Current crop, area, location (`BlockService`).
- **Soil Data**: Soil type, LANSLU code, and description (`SoilService`).
- **Irrigation Status**: Real-time hydration, ET₀, and water deficit (`WaterIrrigationService`).
- **Financials**: Projected ROI, potential loss, and market value (`UserDataService`).
- **Sensor Readings**: Live soil moisture and temperature (`SensorService`).

### 2. The System Prompt
This aggregated data is formatted into a strict system instruction set that defines the AI's persona and constraints:

```text
You are Grower GPT, an AI agronomist specialized ONLY in Australian viticulture...
Rules:
- Use metric units.
- Refuse non-agriculture topics.
- Use the platform-computed values exactly (Do not recalculate ETc).

PLATFORM DATA:
Block: Block A - Shiraz
Hydration: 32.5% (Urgent)
Irrigation Needed: 0.45 ML/ha
ROI: 12.4%
...
```

This ensures the AI never hallucinates data but instead explains *why* the platform is recommending specific actions.

---

## 🏗 Architecture & Data Flow

### Component Layer (`GrowerGptComponent`)
- **Responsibility**: Manages the chat UI, handles user input, and coordinates data fetching.
- **Smart Block Detection**: If a user asks about "Block B", the component automatically switches context to that block's data before sending the query to the AI.
- **Markdown Rendering**: Uses `marked` and `DOMPurify` to safely render rich text responses (tables, bold text, lists) from the AI.

### Service Layer (`GrowerGptService`)
- **Responsibility**: Handles the communication with the LLM provider (OpenRouter/Ollama).
- **Security**: Uses environment variables injected at build time (`set-env.js`) to secure API keys.
- **Error Handling**: Manages rate limits (429 errors) and network failures gracefully.

---

## 🔄 Integration Logic

1.  **User Input**: User asks, "Should I irrigate today?"
2.  **Context Assembly**:
    *   System fetches current hydration (e.g., 32.5%) from `SensorService`.
    *   System fetches today's ET₀ (e.g., 5.2mm) from `WeatherService`.
    *   System fetches soil factor (e.g., Sandy Loam) from `SoilService`.
3.  **Prompt Engineering**: The service wraps the user question with this context.
4.  **AI Processing**: The LLM (via OpenRouter) analyzes the data against viticulture best practices.
5.  **Response**: The AI replies, "Yes, your soil moisture is 32.5%, which is below the optimal threshold for Shiraz at this growth stage. With high evaporation (5.2mm), apply 0.45 ML/ha immediately."

---

## 📂 File Reference

- [grower-gpt.component.ts](file:///d:/Project-2/AgriTech/src/app/modules/grower-gpt/grower-gpt.component.ts): UI Logic, Auto-Scroll, and Markdown Rendering.
- [grower-gpt.service.ts](file:///d:/Project-2/AgriTech/src/app/services/grower-gpt/grower-gpt.service.ts): API Communication & Prompt Engineering.
- [grower-gpt.component.html](file:///d:/Project-2/AgriTech/src/app/modules/grower-gpt/grower-gpt.component.html): The Chat Interface Template.
