# 🛰️ AgriTech Platform: Deep Dive into the Satellite Intelligence Engine

This document provides a comprehensive explanation of the "Satellite Truth" pipeline, from the scientific formulas used in Google Earth Engine to the final data displayed in the Water & Irrigation and Grower GPT modules.

---

## 1. The "Satellite Truth" Philosophy

The platform **prioritizes satellite-derived measurements over theoretical models**, using spectral indices to assess real crop conditions.

-   **Why prioritize satellite data?**: Traditional weather models (like ET₀ and Kc) *estimate* water loss based on atmospheric conditions. They are prone to errors from inaccurate forecasts and generalized "Crop Coefficients" (Kc) that may not reflect the unique state of a specific vineyard block.
-   **The Satellite Advantage**: We use **spectral indices**, which are mathematical formulas that interpret how crops reflect specific wavelengths of light. This provides a direct, data-driven assessment of the plant's actual physiological state.

---

## 2. The Scientific Formulas (The Spectral Indices)

Our system uses the **Sentinel-2 satellite**, which captures spectral "bands" of light. We use these bands to calculate five core indices inside Google Earth Engine.

-   **💧 NDWI (Normalized Difference Water Index)**
    -   **Formula**: `(B3 - B8) / (B3 + B8)`
    -   **Bands**: `B3` (Green) and `B8` (Near-Infrared - NIR).
    -   **Logic**: Healthy leaves reflect NIR strongly. Water stress changes this balance. NDWI captures this difference to determine actual moisture content inside the leaf.

-   **🌿 NDVI (Normalized Difference Vegetation Index)**
    -   **Formula**: `(B8 - B4) / (B8 + B4)`
    -   **Bands**: `B8` (NIR) and `B4` (Red).
    -   **Logic**: Measures general plant health and biomass based on chlorophyll absorption of red light.

-   **🌱 NDRE (Normalized Difference Red Edge Index)**
    -   **Formula**: `(B6 - B4) / (B6 + B4)`
    -   **Bands**: `B6` (Red Edge 2) and `B4` (Red).
    -   **Logic**: Specifically sensitive to **Nitrogen content**. More accurate than NDVI for thick vineyard canopies.

-   **🍃 EVI (Enhanced Vegetation Index)**
    -   **Formula**: `2.5 * ((B8 - B4) / (B8 + 6 * B4 - 7.5 * B2 + 1))`
    -   **Bands**: `B8`, `B4`, and `B2` (Blue).
    -   **Logic**: Best for measuring **canopy density** while correcting for atmospheric haze.

-   **📉 LAI (Leaf Area Index)**
    -   **Formula**: `3.618 * exp(2.04 * NDVI) - 2`
    -   **Logic**: Estimates total leaf area, which directly correlates to **yield potential**.

---

## 3. The 14-Day vs. 5-Day Logic (Data Stability)

To ensure high accuracy and fast performance, the system uses two different time scales:

1.  **14-Day DATA Window (GEE)**:
    -   When querying Google Earth Engine, we look at the **last 14 days**.
    -   We create a **Median Composite**: It takes all clear pixels from those 14 days and picks the "middle" value. This filters out clouds and shadows perfectly, providing a stable monitoring period.
2.  **5-Day CACHE TTL (Database)**:
    -   The results are stored in your database for **5 days**.
    -   This ensures fast API responses (200ms) while keeping data reasonably fresh based on typical satellite revisit cycles.

---

## 4. Water & Irrigation: Action-Driven Status

This module focuses entirely on the **NDWI** value to provide clear instructions to the grower.

| NDWI Value | Action-Driven Status |
| :--- | :--- |
| `> 0.1` | `WELL_WATERED — CHECK OVER-IRRIGATION` |
| `-0.1` to `0.1` | `MILD_STRESS — CONSIDER IRRIGATION IN 2-3 DAYS` |
| `-0.3` to `-0.1` | `MODERATE_STRESS — IRRIGATE TODAY` |
| `< -0.3` | `SEVERE_STRESS — IMMEDIATE IRRIGATION REQUIRED` |

---

## 5. Grower GPT: The Prioritized Brain

Grower GPT uses a **Prioritized Rule Engine** to rank issues. It doesn't just show data; it tells you what matters most.

**The Alert Hierarchy:**
1.  **🚨 Water (NDWI)**: Highest priority. Critical if < -0.3, Warning if < -0.1.
2.  **🌱 Nutrient (NDRE)**: Warning if Nitrogen is low (< 0.25).
3.  **🌿 Health (NDVI)**: 
    -   **Critical** if stress is urgent (< 0.20).
    -   **Warning** if health is declining (< 0.35).
4.  **🌿 Canopy (EVI)**: Info if growth is too dense (> 0.5).
5.  **📉 Yield (LAI)**: Warning if potential is low (< 2).

**Confidence Metrics:**
-   **HIGH**: Fresh data (< 7 days) and Good quality.
-   **MEDIUM**: Data is 7–14 days old.
-   **LOW**: Cloud cover > 50% or low pixel count (< 5).
