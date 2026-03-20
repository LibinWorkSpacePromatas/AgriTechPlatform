# 💧 Satellite-Driven Water & Irrigation System (NDWI Only)

This module provides real-time, satellite-backed irrigation guidance for precision viticulture. It integrates direct leaf moisture measurements from **Sentinel-2** imagery to automate irrigation decisions without the complexity of traditional agronomical math.

---

## 🏗 System Architecture & Data Flow

The system follows a reactive architecture using **Angular Standalone Components** and a **FastAPI** backend.

### 1. The Global Selection Chain
- **Trigger**: User selects a block from the `SidebarComponent` dropdown.
- **State Management**: The selection is pushed to the [BlockService](file:///c:/Users/hp/Music/Agritech/agritechplatform/src/app/shared/services/block.service.ts) using a `BehaviorSubject`.
- **Sync**: The [WaterIrrigationComponent](file:///c:/Users/hp/Music/Agritech/agritechplatform/src/app/modules/water-irrigation/water-irrigation.component.ts) reacts instantly to the new block's LANSLU and coordinates.

### 2. The Satellite Pipeline
When a block is selected or the map marker is moved:
1. **API Call**: [WaterIrrigationService](file:///c:/Users/hp/Music/Agritech/agritechplatform/src/app/services/water-irrigation/water-irrigation.service.ts) calls the backend `/api/water/{block_id}`.
2. **Database Lookup**: The backend queries the `satellite_cache` table for the latest **NDWI** (Normalized Difference Water Index) value.
3. **Classification**: The backend's [Classification Engine](file:///c:/Users/hp/Music/Agritech/backend/app/services/insights.py) applies scientifically-backed thresholds to determine field status.

---

## 🧪 The "Satellite Truth" Philosophy (MVP)

To ensure 100% alignment with ground truth, the MVP uses a simplified **NDWI-only** model.

### ❌ What Was Removed (And Why)
Previous versions of this page used a "Hybrid Formula" that combined:
- **ET₀ (Evapotranspiration)**: Weather-based estimation of water loss.
- **Kc (Crop Coefficient)**: Theoretical values that vary by growth stage.
- **Soil Factors**: Complex variables for drainage and texture.

**The Problem**: These factors often introduced "noise" and required manual calibration for every block. If the weather API was slightly off, the recommendation would be wrong.

**The Solution**: We stripped out the math and moved to **Direct Leaf Monitoring**. NDWI tells us exactly how much water is *inside* the plant right now, making it the most reliable metric for irrigation decisions.

### 1. Why NDWI?
- **Direct Measurement**: NDWI measures the liquid water content in vegetation leaves using the Near-Infrared (NIR) and Shortwave Infrared (SWIR) bands.
- **Precision**: Unlike weather-based models that *estimate* water loss, NDWI *shows* the actual hydration state of the vine.
- **Simplicity**: Removes the need for complex coefficients that can vary by vineyard block.

### 2. Classification Logic (The Rules)
The backend applys the following logic strictly based on the PDF requirements:
- **🔵 Well-watered** (NDWI > 0.1): Leaf moisture is optimal. Recommendation: "Well-watered — check over-irrigation".
- **🟡 Mild Stress** (-0.1 ≤ NDWI ≤ 0.1): Monitor closely. Recommendation: "Consider irrigation in 2–3 days".
- **🟠 Moderate Stress** (-0.3 ≤ NDWI < -0.1): Moderate deficit. Recommendation: "Irrigate today".
- **🔴 Severe Stress** (NDWI < -0.3): Critical deficit. Recommendation: "Immediate irrigation required".

---

## 🗺 Mapping & Spatial Logic

Powered by **Leaflet.js**, the map provides more than just a visual; it is an input tool.

- **Real Vineyard Locations**: Each block uses authentic coordinates from South Australian wineries (Angove's, Château Tanunda, d'Arenberg, etc.).
- **Marker Persistence**: The system places a custom marker at the block's center.
- **Manual Override**: If the user drags the marker, the `onMapClick` event captures the new `lat`/`lon`, triggering a fresh satellite data fetch for that specific point.

---

## ⚙️ Service-Layer Methods

### `WaterIrrigationService`
- `getIrrigationStatus(blockId)`: The primary entry point. Orchestrates the backend API call and maps the response to the `IrrigationStatus` interface.
- `refreshData(blockId)`: Triggers a fresh reload of the satellite data.

---

## 📊 UI Components & Layout

### 1. Header Card
- **Block Selector**: Allows quick switching between farm blocks.
- **Location Picker**: Shows real-time coordinates. The "Update" button triggers a fresh satellite query.

### 2. Map Interface
- **Interactive Leaflet Map**: Centered on the block.
- **Draggable Marker**: Users can refine the location. Dropping the marker automatically refreshes the NDWI status for that specific spot.

### 3. Water Management (Primary Analysis)
- **Field Status Indicator**: A large, color-coded visual showing the stress level.
- **Recommendation**: A bold, clear sentence telling the grower exactly what to do (e.g., "Irrigate today").
- **NDWI Value**: The raw satellite index, formatted to two decimal places.

### 4. Insight Banner
- **Data Quality Pill**: Indicates if the satellite imagery was clear (Good) or cloud-heavy (Degraded).
- **Latest Date**: Shows when the last satellite composite was captured.

### 5. Logic Card
- **Formula Box**: Explicitly lists the NDWI thresholds used by the engine. This builds trust by showing the "why" behind every recommendation.

---

## 📂 File Reference
- [water-irrigation.component.ts](file:///c:/Users/hp/Music/Agritech/agritechplatform/src/app/modules/water-irrigation/water-irrigation.component.ts): UI State & Map Events.
- [water-irrigation.service.ts](file:///c:/Users/hp/Music/Agritech/agritechplatform/src/app/services/water-irrigation/water-irrigation.service.ts): Frontend API proxy.
- [water.py](file:///c:/Users/hp/Music/Agritech/backend/app/api/water.py): Backend API implementation.
- [insights.py](file:///c:/Users/hp/Music/Agritech/backend/app/services/insights.py): The core classification logic (Rule Engine).