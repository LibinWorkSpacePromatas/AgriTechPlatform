# AgriTech System Summary

## What This System Is

This repository contains an agriculture-focused decision support platform with:

- A primary **Angular 17 frontend** in [`agritechplatform`](c:\PromatasDev\AgriTech\agritechplatform)
- A minimal **FastAPI backend** in [`backend`](c:\PromatasDev\AgriTech\backend)

The current working product is the **frontend application**. It behaves like a vineyard-focused digital twin / advisory dashboard for South Australian growers, especially Riverland, Barossa Valley, and McLaren Vale scenarios.

The system lets a user:

- choose a demo grower profile
- switch between that grower’s blocks
- view live-like sensor and weather information
- calculate irrigation recommendations
- assess crop risk and profit scenarios
- explore diversification opportunities
- ask an AI agronomy assistant questions using current block context

Important current-state note:

- The frontend is mostly **client-side and demo-driven**
- Much of the “live” data is either:
  - fetched from public APIs
  - loaded from local JSON assets
  - generated from in-app mock/demo logic
- The Python backend exists, but the current Angular UI does **not** actively depend on it for its main flows

---

## High-Level Functional Flow

1. User opens the app and lands on `/select-user`.
2. A demo grower profile is selected.
3. The selected user is stored in `localStorage` via `AuthService`.
4. The app loads the shared layout with sidebar + header.
5. A block is selected globally through `BlockService`.
6. Feature pages subscribe to the selected block and update themselves.
7. Each page combines block metadata, weather, soil data, and in-app advisory logic to render recommendations.

---

## Main Frontend Pages

The frontend routes are defined in [`agritechplatform/src/app/app.routes.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\app.routes.ts).

### 1. User Selection Page

**Route:** `/select-user`

**Purpose**

- Lets the user choose one of the demo grower accounts.

**What is displayed**

- platform branding
- welcome text
- a grid of user cards
- each card shows:
  - user initials
  - grower name
  - farm name
  - farm location
  - primary crop

**How data is displayed**

- Cards are rendered from the in-memory `users` array in `UserDataService`.
- Clicking a card logs the user in and routes to `/dashboard`.

**Where the data comes from**

- [`agritechplatform/src/app/core/services/user-data.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\user-data.service.ts)

**Current data model**

- 5 demo users
- each user has:
  - farm metadata
  - region/council
  - primary crop and soil type
  - 2 blocks with LANSLU, area, crop, description, latitude, longitude
  - optional financials and opportunities

---

### 2. Dashboard Page

**Route:** `/dashboard`

**Purpose**

- Central operational overview for the selected block.

**Main sections shown**

- selected block summary
- crop and block size
- soil description/type
- block coordinates and location
- `Overview` tab
- `Crop Advisor` tab

#### Dashboard Overview Tab

**What is displayed**

- IoT sensor cards:
  - Soil Moisture
  - Soil Temperature
  - Air Temperature
  - Humidity
  - pH Level
- sensor hover/click history popups
- nutrient index badge and modal
- live weather card
- hourly/daily weather graph
- climate outlook note

**How it is displayed**
<!-- o -->
- Sensors render as cards with current value, status, and icon.
- Hovering/clicking a sensor opens a chart using `LineChartComponent`.
- Weather displays current readings plus a chart toggle for 24h vs 7-day views.

**Where the data comes from**

- Sensor values: [`SensorService`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\sensor.service.ts)
- Weather API data: [`core/services/weather.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\weather.service.ts)
- Selected block: [`BlockService`](c:\PromatasDev\AgriTech\agritechplatform\src\app\shared\services\block.service.ts)
- Logged-in user: [`AuthService`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\auth.service.ts)

**Important behavior**

- Sensor values are simulated in-app and refreshed every 1 minute.
- Weather is refreshed every 5 minutes.
- The dashboard uses the selected block’s coordinates to call Open-Meteo.

#### Dashboard Crop Advisor Tab

**What is displayed**

- risk score
- sensor analysis cards
- dynamic action plan
- yield impact analysis
- profit/loss visualization
- crop switching recommendation
- alternative crop detail modal
- grant guide modal
- export-to-PDF action

**How it is displayed**

- The page computes advisory state from sensor values and crop thresholds.
- Actions and yield impact are derived in code, not from a backend.
- The page presents decision cards such as:
  - current crop loss scenario
  - switch-to-alternative crop scenario
  - keep-premium-grapes scenario

**Where the data comes from**

- Crop suitability / recommendation logic:
  - [`CropAdvisorService`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\crop-advisor.service.ts)
- Sensor input:
  - [`SensorService`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\sensor.service.ts)
- Weather input:
  - [`core/services/weather.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\weather.service.ts)
- User block info:
  - [`AuthService`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\auth.service.ts)
  - [`BlockService`](c:\PromatasDev\AgriTech\agritechplatform\src\app\shared\services\block.service.ts)

**Special notes**

- Risk score is computed from how far moisture, pH, air temperature, and humidity are from crop thresholds.
- Nutrient index is an approximation from pH + moisture + soil temperature.
- PDF generation is done in the browser.
- Several labels say “live”, but current sensor data is simulated.

---

### 3. Water & Irrigation Page

**Route:** `/water-irrigation`

**Purpose**

- Provides real-time satellite-driven hydration monitoring for the selected block.

**What is displayed**

- block selector dropdown
- interactive Leaflet map
- **Field Status Card**: Color-coded hydration status (Severe, Moderate, Mild, Well-watered).
- **Satellite Truth (NDWI)**: Direct index value and data quality.
- **Actionable Recommendation**: Logic-driven advice based on the NDWI index.
- **Water Logic Breakdown**: Thresholds used for satellite ground truth.

**How it works**

- The page fetches data from the backend `/api/water/{block_id}` endpoint.
- It uses **NDWI (Normalized Difference Water Index)** as the primary "ground truth" for leaf water content.
- The user can select blocks or change coordinates on the map, which triggers a fresh satellite data fetch.

**Where the data comes from**

- **Backend Water API**: [`backend/app/api/water.py`](file:///c:/Users/hp/Music/Agritech/backend/app/api/water.py)
- **Database**: `satellite_cache` table (PostgreSQL), containing Sentinel-2 payloads.
- **Classification Engine**: [`backend/app/services/insights.py`](file:///c:/Users/hp/Music/Agritech/backend/app/services/insights.py)

**Current calculation logic (Simplified MVP)**

To ensure 100% alignment with satellite truth, the MVP uses a simplified **NDWI-only** classification engine, removing complex weather-based math (ET₀, Kc, Soil Factors):

- **Well-watered** (NDWI > 0.1): Leaf moisture is optimal.
- **Mild Stress** (-0.1 ≤ NDWI ≤ 0.1): Monitor closely; consider irrigation in 2-3 days.
- **Moderate Stress** (-0.3 ≤ NDWI < -0.1): Irrigate today.
- **Severe Stress** (NDWI < -0.3): Immediate irrigation required.

**Grower GPT Rule Engine (Prioritized Alerts)**
1. **🚨 Water (NDWI)**: Critical if < -0.3, Warning if < -0.1.
2. **🌱 Nutrient (NDRE)**: Warning if < 0.25 (Nitrogen deficiency).
3. **🌿 Health (NDVI)**: Critical if < 0.20 (Urgent stress), Warning if < 0.35.
4. **🌿 Canopy (EVI)**: Info if > 0.5 (Dense canopy).
5. **📉 Yield (LAI)**: Warning if < 2 (Low yield potential).

**Important current-state notes**

- Weather-based ET₀ and Kc math have been deprecated in favor of direct satellite ground truth.
- Soil composition and BoM station cards are currently hidden or simplified to focus on satellite metrics.

---

### 4. Profit & Risk Analysis Page

**Route:** `/profit-risk`

**Purpose**

- Compares wine grapes against alternative crops using water allocation and risk assumptions.

**What is displayed**

- crisis alert banner
- scenario toggle:
  - Alternative Crop Scenario
  - Global Market Quadrant
- water allocation slider
- bankruptcy impact toggle
- revenue per ML chart
- net margin per hectare chart
- risk-adjusted revenue chart
- crop comparison matrix
- cost structure donut chart
- support/resources section

**How it works**

- This page is almost entirely driven by in-component economics logic.
- Angular signals/computed values recalculate all metrics when the user changes:
  - water allocation
  - scenario
  - bankruptcy impact toggle
  - selected crop row

**Where the data comes from**

- Hard-coded crop economics inside:
  - [`profit-risk.component.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\modules\profit-risk\profit-risk.component.ts)
- Selected block context:
  - [`BlockService`](c:\PromatasDev\AgriTech\agritechplatform\src\app\shared\services\block.service.ts)

**Important current-state notes**

- The page references WGCSA, PIRSA, Hort Innovation, Citrus Australia, etc. in labels/content.
- The calculations themselves are not fetched from those sources at runtime.
- They are modeled from static in-code numbers.

---

### 5. Growing Opportunities Page

**Route:** `/growing-opportunities`

**Purpose**

- Presents curated diversification ideas and support options for growers.

**What is displayed**

- a page header
- 5 opportunity cards
- each card includes:
  - title
  - summary
  - tags
- modal popup with:
  - full description
  - key points
  - tags
  - source name
  - external source link
  - disclaimer

**How it works**

- Cards are hard-coded in the component.
- Clicking a card opens a modal.

**Where the data comes from**

- Static content inside:
  - [`growing-opportunities.component.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\modules\growing-opportunities\growing-opportunities.component.ts)

**Topics currently included**

- olives as a lower-water option
- diversification funding
- alternative varieties and premium markets
- almonds and precision irrigation
- multi-crop risk management

---

### 6. Grower GPT Page

**Route:** `/grower-gpt`

**Purpose**

- AI agronomy assistant that answers questions using the selected block’s context.

**What is displayed**

- chat interface
- assistant greeting
- quick action question chips
- markdown-rendered responses
- typing/loading state
- connection error/retry state
- right-side “Live Insights” sidebar

**How it works**

- On load, it fetches irrigation status for the selected block.
- It builds an initial assistant greeting using current hydration/status.
- When the user sends a message:
  - the app detects if another block is mentioned
  - gathers current block/user/irrigation context
  - sends a prompt to the LLM endpoint

**Where the data comes from**

- Chat service:
  - [`GrowerGptService`](c:\PromatasDev\AgriTech\agritechplatform\src\app\services\grower-gpt\grower-gpt.service.ts)
- Block context:
  - [`BlockService`](c:\PromatasDev\AgriTech\agritechplatform\src\app\shared\services\block.service.ts)
- User context:
  - [`UserDataService`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\user-data.service.ts)
- Irrigation context:
  - [`WaterIrrigationService`](c:\PromatasDev\AgriTech\agritechplatform\src\app\services\water-irrigation\water-irrigation.service.ts)

**Prompt context currently includes**

- block name
- crop
- area
- coordinates
- soil subgroup / description / soil factor
- ET0
- Kc
- ETc-related value from platform context
- irrigation needed
- current hydration
- rainfall
- financial metrics
- grower opportunity tags

**Important current-state notes**

- The service is named `ollama`, but it currently points to **OpenRouter-compatible chat completions**.
- The model sent is `openrouter/free`.
- The `Live Insights` sidebar content is static text in the template.

---

## Shared Layout / Navigation

Once authenticated, the app uses a common layout:

- left sidebar
- top header
- routed content area

### Sidebar

**Displays**

- platform branding
- block selector
- page navigation links
- current user name and farm
- sign out button

**Navigation items**

- Dashboard
- Water & Irrigation
- Profit & Risk
- Growing Opportunities
- Grower GPT

**How it works**

- The sidebar maps the logged-in user’s blocks into a shared `Block` shape.
- The current block is stored in `BlockService`.
- All main pages react to that selection.

### Header

**Displays**

- welcome message using the current user’s first name
- farm name
- quick button to open Grower GPT

---

## Data Sources Used by the Current System

### 1. Demo User / Farm / Block Data

**Source**

- [`user-data.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\user-data.service.ts)

**Used for**

- login/profile selection
- farm name, grower name, region
- block list
- block coordinates
- crop names
- financial summary
- opportunity tags

### 2. Sensor Data

**Source**

- [`sensor.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\sensor.service.ts)

**Used for**

- dashboard sensor cards
- advisory logic
- nutrient index
- irrigation hydration baseline

**Current nature**

- mock/demo data stored in memory
- slightly randomized during simulation

### 3. Weather Data for Dashboard

**Source**

- Open-Meteo
- service file:
  - [`core/services/weather.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\weather.service.ts)

**Used for**

- current temperature
- humidity
- wind speed/direction
- cloud cover
- hourly graph
- daily graph
- weather description

### 4. Weather + Irrigation Data

**Source**

- Open-Meteo
- service file:
  - [`services/weather-service/weather.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\services\weather-service\weather.service.ts)

**Used for**

- ET0
- precipitation
- multi-depth soil moisture
- irrigation calculations

### 5. Soil Classification Data

**Source**

- local asset file:
  - [`soil-data.json`](c:\PromatasDev\AgriTech\agritechplatform\src\assets\data\soil-data.json)

**Used for**

- LANSLU lookup
- regional soil composition
- primary/secondary/tertiary soil classifications
- weighted soil factor

### 6. BoM Station Reference Data

**Source**

- local asset file:
  - [`bom_stations.json`](c:\PromatasDev\AgriTech\agritechplatform\src\assets\data\bom_stations.json)

**Current usage**

- Present in repository
- not clearly wired into the active frontend calculation flow

### 7. AI Chat Provider

**Source**

- OpenRouter-compatible endpoint configured under `environment.ollama.host`

**Used for**

- Grower GPT responses

---

## External APIs / Services Used

### Open-Meteo Forecast API

**Base URL**

- `https://api.open-meteo.com/v1/forecast`

**Used by**

- dashboard weather page flow
- irrigation weather/ET0 flow

**Fields requested in current code**

- current:
  - temperature
  - is_day
  - rain / precipitation
  - weather code
  - wind speed
  - wind direction
  - relative humidity
  - cloud cover
- hourly:
  - temperature
  - humidity
  - rain / precipitation
  - wind speed
  - ET0
  - soil moisture depth layers
- daily:
  - max/min temperature
  - ET0 evapotranspiration
  - precipitation sum

### OpenRouter-Compatible Chat Completions

**Configured host**

- generated at build time in:
  - [`scripts/set-env.js`](c:\PromatasDev\AgriTech\agritechplatform\scripts\set-env.js)

**Current default value**

- `https://openrouter.ai/api/v1`

**Used by**

- Grower GPT

**Authentication**

- API key injected from `OPENROUTER_API_KEY`

### Map Tiles / Mapping

**Used by**

- Water & Irrigation page

**Libraries/services**

- Leaflet
- OpenStreetMap tile layer:
  - `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`

---

## State Management and Data Flow

### Authentication

- `AuthService` is not true server-auth.
- It stores the selected demo user in `localStorage` using key:
  - `agritech_active_user`

### Global Selected Block

- `BlockService` uses a `BehaviorSubject`.
- Sidebar updates the selected block.
- Dashboard, Water & Irrigation, and other pages subscribe and refresh.

### Environment Configuration

- Angular environment files are generated by:
  - [`scripts/set-env.js`](c:\PromatasDev\AgriTech\agritechplatform\scripts\set-env.js)

**Configured areas**

- weather API base URL
- irrigation defaults and Australia bounds
- OpenRouter host and API key

---

## What the Backend Currently Does

The backend is a **FastAPI** service that manages real-world satellite data and AI insights.

### Core Capabilities

- **Water API (`/api/water/{block_id}`)**:
  - Fetches the latest Sentinel-2 NDWI values from the database.
  - Classifies water stress using the simplified **NDWI-only engine**.
  - Returns actionable recommendations and data quality metrics.
- **Grower GPT API (`/api/gpt/{block_id}`)**:
  - Generates AI-driven agronomic advice using **OpenRouter (LLM)**.
  - Injects real-time satellite indices (NDVI, NDWI, LAI, etc.) as context.
  - Provides property-wide summaries for multiple blocks.
- **Satellite Data Management**:
  - Stores imagery payloads in a PostgreSQL `satellite_cache` table.
  - Handles block metadata and user associations via SQLAlchemy.
- **Authentication**:
  - Basic login and token-based flows (ready for expansion).

### Backend files

- **Main App**: [`backend/app/main.py`](file:///c:/Users/hp/Music/Agritech/backend/app/main.py)
- **Water API**: [`backend/app/api/water.py`](file:///c:/Users/hp/Music/Agritech/backend/app/api/water.py)
- **GPT API**: [`backend/app/api/gpt.py`](file:///c:/Users/hp/Music/Agritech/backend/app/api/gpt.py)
- **LLM Service**: [`backend/app/services/llm_service.py`](file:///c:/Users/hp/Music/Agritech/backend/app/services/llm_service.py)
- **Database Models**: [`backend/app/db/models.py`](file:///c:/Users/hp/Music/Agritech/backend/app/db/models.py)

### Current status relative to frontend

- The Angular app is now **actively integrated** with the backend for:
  - **Water & Irrigation page**: Live NDWI classification.
  - **Grower GPT page**: Real-time AI chat with block context.
  - **Dashboard**: Integrated insights (partially).

---

## Current System Reality: What Is Real vs Mocked

### Real / externally fetched at runtime

- Open-Meteo weather and forecast data
- Open-Meteo ET0 / precipitation / soil moisture layers
- OpenStreetMap tiles
- OpenRouter-compatible chat completion calls for Grower GPT

### Local static data

- demo users, farms, blocks, financials, opportunities
- crop economics and comparison assumptions
- opportunity articles/content
- soil classification dataset

### Mocked / simulated / approximate

- dashboard IoT sensor readings
- sensor drift over time
- nutrient index
- some irrigation depth moisture presentation
- nearest BoM station details shown on irrigation page
- several advisory/business recommendation narratives
- Grower GPT sidebar “Live Insights”

---

## Key Files by Responsibility

- App routing:
  - [`app.routes.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\app.routes.ts)
- Authentication/demo user session:
  - [`auth.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\auth.service.ts)
- Demo user/farm/block source:
  - [`user-data.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\user-data.service.ts)
- Global block selection:
  - [`block.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\shared\services\block.service.ts)
- Dashboard weather:
  - [`core/services/weather.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\weather.service.ts)
- Irrigation weather engine:
  - [`services/weather-service/weather.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\services\weather-service\weather.service.ts)
- Irrigation calculations:
  - [`water-irrigation.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\services\water-irrigation\water-irrigation.service.ts)
- Soil data loading/factor logic:
  - [`soil.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\services\soil\soil.service.ts)
- Sensor simulation:
  - [`sensor.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\sensor.service.ts)
- Crop advice and alternative crop logic:
  - [`crop-advisor.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\core\services\crop-advisor.service.ts)
- Grower GPT API integration:
  - [`grower-gpt.service.ts`](c:\PromatasDev\AgriTech\agritechplatform\src\app\services\grower-gpt\grower-gpt.service.ts)

---

## Short Conclusion

The current system is a **frontend-first AgriTech advisory prototype** for vineyard/grower decision support. Its strongest implemented capabilities today are:

- demo grower/block selection
- dashboard visualization
- weather-aware irrigation recommendation
- crop risk/advisory logic
- alternative crop profitability comparison
- curated diversification guidance
- AI agronomy chat with contextual prompt injection

The app already demonstrates a strong product flow, but it is still a mix of:

- real public API data
- local reference datasets
- simulated sensor/advisory logic

If this system is evolved further, the biggest next step would be replacing demo/mock layers with:

- real user auth
- real sensor ingestion
- real backend-driven farm data
- real economics/reference datasets
- production-grade agronomy / rainfall / station integrations






Measurements

IoT inputs: soil moisture %, soil pH, soil temperature °C, air temperature °C, and humidity % from dashboard.component.ts.
Weather inputs: current temperature, rain, wind, humidity, cloud cover, plus 7-day forecast max/min temperature, rainfall, and rain probability from weather.service.ts.
Satellite inputs: raw NDVI, NDWI, NDRE, EVI, and LAI from dashboard.component.ts.
Crop assumptions: each crop has hardcoded min/max/optimal ranges for moisture, pH, temperature, humidity, plus waterRequirement in ML/ha and profitPerHa in dollars in crop-advisor.service.ts.
Calculations

Crop fit score:

Moisture, pH, air temp, and humidity each get a score with scoreRange(...) against the crop’s min/max/optimal band in crop-advisor.service.ts.
Satellite score is normalized from NDVI, NDWI, NDRE, EVI, and LAI in crop-advisor.service.ts.
Weather score uses hottest forecast day, 7-day rain total, rain probability, and wind in crop-advisor.service.ts.
Those are combined with weights: moisture 22, pH 12, temp 12, humidity 8, satellite 28, weather 18 in crop-advisor.service.ts.
Then it adds a small water-efficiency/profit bonus and a migration penalty to get the final suitabilityScore in crop-advisor.service.ts.
Profit now:

performanceFactor = clamp(0.35 + (suitabilityScore / 100) * 0.65, 0.25, 1.0) in crop-advisor.service.ts.
projectedProfit = profitPerHa * areaHa * performanceFactor in crop-advisor.service.ts.
potentialProfit = profitPerHa * areaHa.
profitOpportunity = potentialProfit - projectedProfit in crop-advisor.service.ts.
Migration options:

Every alternative crop is scored with the same formula and sorted by projected profit in crop-advisor.service.ts.
Profit lift is option.projectedProfit - current.projectedProfit in crop-advisor.service.ts.
Suggested migration share is currently heuristic: 60% if the score gap is >18, 35% if >8, else 20% in crop-advisor.service.ts.
Mixed-plan profit is current*(1-share) + option*share in crop-advisor.service.ts.
Signal cards / alerts:

Moisture: <30 critical, <40 warning.
pH: outside 6.2-7.8 warning.
NDVI: <0.35 critical, <0.5 warning.
NDWI: <-0.18 critical, <-0.05 warning.
Heat outlook: >=36°C critical, >=32°C warning.
Rain outlook: >=20 mm good, >=8 mm warning, else critical.
These thresholds are in crop-advisor.service.ts.