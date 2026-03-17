# 💧 Advanced Water & Irrigation System

This module represents the core intelligence of the AgriTech platform, providing real-time, scientifically-backed irrigation guidance for precision viticulture. It integrates satellite weather data, Open-Meteo API, and detailed soil classification to automate complex irrigation decisions.

---

## 🏗 System Architecture & Data Flow

The system follows a reactive architecture using **Angular Standalone Components** and **RxJS** for real-time state synchronization.

### 1. The Global Selection Chain
- **Trigger**: User selects a block from the `SidebarComponent` dropdown.
- **State Management**: The selection is pushed to the [BlockService](file:///d:/Project-2/AgriTech/src/app/shared/services/block.service.ts) using a `BehaviorSubject`.
- **Sync**: Both the [DashboardComponent](file:///d:/Project-2/AgriTech/src/app/modules/dashboard/dashboard.component.ts) and [WaterIrrigationComponent](file:///d:/Project-2/AgriTech/src/app/modules/water-irrigation/water-irrigation.component.ts) are subscribers. They react instantly to the new block's coordinates and soil profile.

### 2. The Calculation Pipeline
When a block is selected or the map marker is moved:
1. **Coordinate Fetch**: Retrieves `lat`/`lon` from the selected block (now with real vineyard locations).
2. **Weather Fetch**: [WaterIrrigationService](file:///d:/Project-2/AgriTech/src/app/services/water-irrigation/water-irrigation.service.ts) calls Open-Meteo for ET₀, rainfall, and multi-depth soil moisture data.
3. **Soil Processing**: [SoilService](file:///d:/Project-2/AgriTech/src/app/services/soil/soil.service.ts) calculates a `soilFactor` based on the block's LANSLU classification.
4. **Engine Execution**: The scientific model computes the final irrigation requirement using real soil moisture data.

---

## 🧪 The Scientific Engine (Deep Dive)

The engine implements the **FAO-56 Penman-Monteith** principles simplified for a robust MVP model.

### 1. Evapotranspiration (Water Loss)
- **Base ET₀**: Reference evapotranspiration from Open-Meteo API.
- **Crop Factor (Kc)**: Dynamically assigned based on variety (e.g., Shiraz: 0.85, Cabernet: 0.88).
- **Formula**: `ETc = ET₀ × Kc`

### 2. Irrigation Requirement (ML/ha)
We calculate the "Net Deficit" which represents the actual water gap in the soil.
- **Daily ET₀/Rainfall**: Uses Open-Meteo's pre-aggregated daily totals.
- **Effective Rain**: `Rain × 0.8` (Logic: 20% of rain is lost to immediate runoff/evaporation).
- **Net Deficit**: `Math.max(0, ETc - Effective Rain)` (Clamped to prevent negative values).
- **Soil Adjustment**: `Adjusted_mm = Net Deficit / Soil Factor`.
    - *Sandy Soil*: Factor ~0.8 (Increases water need).
    - *Clay Soil*: Factor ~1.2 (Decreases water need).
- **Volume Conversion**: `Irrigation = Adjusted_mm × 0.01` (Converts mm depth to Megaliters per Hectare).

### 3. Real Soil Moisture (Single Source of Truth)
We have unified the data source for hydration to ensure consistency across the entire platform.
- **SensorService**: The central authority for soil moisture data.
- **Hydration Source**: `SensorService.getSoilMoisture()` (e.g., 32.5%).
- **Why**: This ensures that the Dashboard sensor card and the Irrigation page's "Current Hydration" value match perfectly.
- **Integration**: The irrigation engine uses this sensor value as the baseline for all calculations, rather than estimating hydration from weather models.

---

## 🗺 Mapping & Spatial Logic

Powered by **Leaflet.js**, the map provides more than just a visual; it is an input tool.

- **Real Vineyard Locations**: Each block now uses authentic coordinates from renowned SA wineries:
  - Angove's Winery (Renmark)
  - Château Tanunda (Tanunda)
  - d'Arenberg (McLaren Vale)
  - Penfolds/Wolf Blass (Nuriootpa)
  
- **Marker Persistence**: The system places a custom marker at the block's center.
- **Manual Override**: If the user drags the marker, the `onMapClick` event captures the new `lat`/`lon`, triggering a full recalculation for that specific geographical point.
- **Auto-Zoom Logic**: 
  - On load: Zooms to level 10 (Regional view).
  - On selection: Zooms to level 16 (Block/Vine view) using `map.setView([lat, lon], 16)`.

---

## ⚙️ Service-Layer Methods

### `WaterIrrigationService`
- `getIrrigationStatus(lat, lon, soil?)`: The entry point. Orchestrates Open-Meteo calls.
- `calculateIrrigationStatus(...)`: The core math engine. Implements the scientific model using real soil moisture data.
- Uses **daily ET₀/rainfall aggregates** instead of manual calculations.

### `SoilService`
- `calculateSoilFactor(soil)`: Analyzes texture, drainage, and AWHC (Available Water Holding Capacity) to return a multiplier for the irrigation engine.

### `WeatherService`
- Enhanced with **multi-depth soil moisture** support and **daily aggregated ET₀/rainfall** data.
- Cleaned parameters focused on irrigation-relevant variables only.

---

## 📊 Status Thresholds & Alerts

- **🔴 URGENT (Hydration < 20%)**: Immediate irrigation required. High risk of vine stress.
- **🟡 MONITOR (Hydration 20%-80%)**: Safe operating range. Track depletion rate.
- **🔵 SATURATED (Hydration > 80%)**: Soil at field capacity. Risk of root rot if more water is added.

---

## 🔄 Recent Improvements

1.  **Sensor Integration**: Implemented `SensorService` as the single source of truth for soil moisture, ensuring 100% consistency between Dashboard and Irrigation modules.
2.  **Daily Aggregates**: Uses pre-calculated daily ET₀/rainfall instead of manual hourly aggregation.
3.  **Authentic Locations**: Updated all block coordinates to real South Australian vineyard locations.
4.  **Backend Removal**: Eliminated all localhost:8000 dependencies - system now runs purely on client-side APIs.
5.  **UI Layout**: Rearranged cards for better visual flow and space utilization.

---

## 📂 File Reference
- [water-irrigation.component.ts](file:///d:/Project-2/AgriTech/src/app/modules/water-irrigation/water-irrigation.component.ts): UI State & Map Events.
- [water-irrigation.service.ts](file:///d:/Project-2/AgriTech/src/app/services/water-irrigation/water-irrigation.service.ts): Data fetching & Math Engine.
- [sensor.service.ts](file:///d:/Project-2/AgriTech/src/app/core/services/sensor.service.ts): The Single Source of Truth for soil moisture data.
- [soil.service.ts](file:///d:/Project-2/AgriTech/src/app/services/soil/soil.service.ts): Soil science & LANSLU parsing.
- [weather.service.ts](file:///d:/Project-2/AgriTech/src/app/services/weather-service/weather.service.ts): Enhanced weather API with multi-depth soil moisture.
- [user-data.service.ts](file:///d:/Project-2/AgriTech/src/app/core/services/user-data.service.ts): Real vineyard coordinates for each user block.