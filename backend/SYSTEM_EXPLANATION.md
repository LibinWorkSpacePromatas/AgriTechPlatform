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

### A. Water & Irrigation Page Rule Engine
This page focuses on water management and spatial visualization.

| NDWI Value | Action-Driven Status |
| :--- | :--- |
| `> 0.1` | `WELL_WATERED — CHECK OVER-IRRIGATION` |
| `-0.15` to `0.1` | `MILD_STRESS — CONSIDER IRRIGATION IN 2-3 DAYS` |
| `-0.3` to `-0.15` | `MODERATE_STRESS — IRRIGATE SOON` |
| `< -0.3` | `SEVERE_STRESS — IMMEDIATE IRRIGATION REQUIRED` |

**NDWI Zone Map**: The page displays a live spectral map of the vineyard block using GEE map tiles.
- **Red**: Severe Stress (< -0.3)
- **Orange**: Moderate Stress (-0.3 to -0.15)
- **Yellow**: Mild Stress (-0.15 to 0.1)
- **Green**: Optimal (> 0.1)

### B. Grower GPT Prioritized Rule Engine
This engine looks at all five indices and presents the top 3 most critical issues in a specific order of importance.

| Priority | Index | Threshold | Action Output |
| :--- | :--- | :--- | :--- |
| **1. (Critical)** | **NDWI** | `< -0.3` | **Severe water stress. Irrigate immediately.** |
| **2. (Warning)** | **NDWI** | `< -0.15` | **Water stress detected. Irrigate soon.** |
| **3. (Critical)** | **NDVI** | `< 0.20` | **Critical vine stress — urgent inspection.** |
| **4. (Warning)** | **NDRE** | `< 0.25` | **Nitrogen deficiency likely. Foliar spray recommended.** |
| **5. (Warning)** | **NDVI** | `< 0.35` | **Vine health declining — inspect.** |

**Confidence Metrics:**
-   **HIGH**: Fresh data (< 7 days) and Good quality.
-   **MEDIUM**: Data is 7–14 days old.
-   **LOW**: Cloud cover > 50% or low pixel count (< 5).
