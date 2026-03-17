# 📈 Profit & Risk Analysis Page

This module powers the **Profit & Risk Analysis** page, which compares wine grapes against alternative crops using real crisis data, risk adjustments, and capital payback logic. It is built as an **Angular Standalone Component** using **signals** and **computed** values for a fully reactive UI.

---

## 🏗 High-Level Architecture

- **Component**: `ProfitRiskComponent` (`src/app/modules/profit-risk/profit-risk.component.ts`)
- **Template**: `profit-risk.component.html` (`src/app/modules/profit-risk/profit-risk.component.html`)
- **Styles**: `profit-risk.component.css` (`src/app/modules/profit-risk/profit-risk.component.css`)
- **Shared State**: `BlockService` (`src/app/shared/services/block.service.ts`) provides the selected block for the header.
- **Pattern**: Pure client-side logic (no backend), all economics and risk math live in the component.

### Block Selection & Header

- The `BlockService` exposes `selectedBlock$` as an observable.
- `toSignal` converts it into a signal `selectedBlock`, which drives:
  - Block name
  - Location
  - Display text in the subtitle (e.g. "2024-2026 Riverland SA crop economics for Block A • Renmark").

---

## 🧮 Economic Model & Data Structures

### `Crop` Interface

Each row and chart in the page is ultimately derived from the `Crop` interface:

- `name`: Crop label (Wine Grapes, Olives, Almonds, Citrus, Table Grapes).
- `yieldPerHa`: Tonnes per hectare.
- `pricePerTon`: Dollar price per tonne.
- `waterMLPerHa`: Megalitres per hectare.
- `variableCosts`: Operating/input costs per hectare.
- `fixedCosts`: Overhead per hectare.
- `volatilityFactor`: 0–1 risk factor applied to revenue per ML.
- `color`: Brand color for the crop in charts.
- `type`: `'core'` (Wine Grapes) or `'alternative'` (Olmonds, Olives, Citrus, Table Grapes).
- `marginParams`: Reference revenue/cost pair used for the Net Margin chart:
  - `revenueAt100`: Revenue per hectare at 100% water allocation.
  - `costsAt100`: Input costs per hectare at 100% allocation.
- `capitalCost`: One-off conversion/establishment capex (where applicable).
- `yearsStr`: Human-readable payback period or "Ongoing losses".
- `riskLevel`: `'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'` used for badges and styling.
- `badges`: Optional tags such as `"2024 Crisis"` or `"PIRSA"` for credibility.

> All source numbers (prices, yields, costs) are aligned with WGCSA 2024 Crush Report and PIRSA/industry factsheets where available.

### Core Signals

- `waterAllocation: signal<number>`:
  - Represents allocation in percent (50–100% range on the slider).
  - Drives **all** revenue and Net Margin recalculations.
- `showBankruptcyImpact: signal<boolean>`:
  - Toggles whether bankruptcy-risk is applied to Wine Grapes.
- `selectedScenario: signal<'alternative' | 'global'>`:
  - Switches between the **Alternative Crops** view and **Global Market Quadrant** view.
- `selectedCropName: signal<string>`:
  - Currently focused crop for the cost structure donut chart and narrative cards.
- `hoveredSegment`, `hoveredRevenueCrop`, `hoveredCrop`, `selectedQuadrantCrop`:
  - Drive tooltips and modals for charts and quadrant bubbles.

---

## 📊 Computed Metrics (How the Numbers Are Calculated)

### 1. `cropMetrics`

This is the main economic engine used across charts and tables.

Given the current `waterAllocation`:

1. **Revenue per Hectare (standard)**  
   - `adjustedYield = yieldPerHa × (waterAllocation / 100)`
   - `revenuePerHaStandard = adjustedYield × pricePerTon`
2. **Revenue per ML**  
   - `revenuePerML = revenuePerHaStandard / waterMLPerHa` (guarded for zero water).
3. **Risk-Adjusted Revenue per ML**  
   - `riskAdjustedRevenuePerML = revenuePerML × (1 - volatilityFactor)`  
   - Higher volatility = larger discount.
4. **Net Margin per Hectare**  
   Uses `marginParams` for consistency with reference material:
   - `marginRevenue = revenueAt100 × (waterAllocation / 100)`
   - `marginCosts = costsAt100`
   - `netMarginPerHa = marginRevenue - marginCosts`
5. **Years to Payback (Capital)**  
   - For positive margins: `yearsToProfit = ceil(30000 / netMarginPerHa)`
   - For negative margins: `"Ongoing losses"`.

Each `Crop` is enriched with:

- `revenuePerHa`
- `totalCostsPerHa`
- `netMarginPerHa`
- `revenuePerML`
- `riskAdjustedRevenuePerML`
- `yearsToProfit`

These values feed:

- Revenue per ML chart
- Net Margin per Hectare chart
- Comparison matrix
- Cost structure donut chart

### 2. `riskAdjustedMetrics`

- Filters to **alternative** crops only.
- Sorts by `riskAdjustedRevenuePerML` to rank crops in the risk-adjusted space.
- Used in parts of the UI where ordering by risk-adjusted efficiency matters.

### 3. `cropMetricsFixedOrder`

- Ensures a fixed order for the **Revenue per ML** chart:  
  `['Wine Grapes', 'Almonds', 'Olives', 'Table Grapes', 'Citrus']`.
- Keeps visuals stable even as values change with the slider.

### 4. `selectedCropMetrics`

Provides a structured object for the **Cost Structure** panel:

- Basic metrics: `revenue`, `costs`, `margin`, `capital`, `isCritical`.
- For `riskLevel === 'CRITICAL'` (wine grapes):
  - 2-segment donut: **Revenue vs Costs** only.
- For non-critical crops:
  - 3-segment donut: **Input Costs**, **Capital**, **Net Margin**.
- Percentages are calculated based on each segment’s share of the total pie.

### 5. Helper Methods

- `getHoveredPercentage` / `getHoveredValue` / `getHoveredLabel`:
  - Drive the donut tooltip when hovering over segments.
- `getBarHeightPercentage` and `getZeroLinePosition`:
  - Convert `netMarginPerHa` into CSS percentages and maintain a zero baseline in the net margin chart.
- `isPositive`:
  - Used for styling positive vs negative values.

---

## 💥 Bankruptcy Impact Toggle

The toggle switches between **standard revenue per ML** and **bankruptcy-adjusted revenue** for Wine Grapes.

- `getBankruptcyAdjustedRevenue(cropName)`:
  - Looks up the crop’s `revenuePerML`.
  - If `showBankruptcyImpact` is `false`, returns the baseline `revenuePerML`.
  - If `true` and the crop’s `riskLevel` is `'CRITICAL'`, applies a **35% haircut**:
    - `revenuePerML × 0.65`.
  - Non-critical crops ignore the toggle.
- `getDisplayRevenue(crop)`:
  - Wrapper used by the chart to pick adjusted or unadjusted revenue.
- `getPercentageVsWineGrapes(cropName)`:
  - Compares each crop’s revenue per ML against Wine Grapes.
  - Percentage difference = `(cropRevenue - wineGrapesRevenue) / wineGrapesRevenue × 100`.

This logic ensures:

- Only crisis crops (Wine Grapes) are penalized when you enable the toggle.
- Alternative crops are displayed consistently, highlighting their relative advantage.

---

## 🧭 Global Market Quadrant View

When `selectedScenario === 'global'`, the UI renders a 2×2 quadrant chart that compares crops on **Risk** vs **Reward**.

### `quadrantCrops` Constant

- A precomputed array inside the component with one entry per crop bubble:
  - `name`, `icon`, `color`
  - `quadrantX`, `quadrantY`: Percentage positions on the chart (0–100).
  - `bubbleSize`: Relative size of each bubble.
  - `zIndex`: Stacking order.
  - `revenuePerML`: Reference revenue per ML for that crop in the global context.
  - `percentageVsWine`: Precalculated uplift vs Wine Grapes.
  - `quadrant`: Label string (e.g. `"Quadrant 1 - OPPORTUNITY"`, `"Quadrant 2 - REDUCE/EXIT"`).
  - `badges`: Optional credibility badges (e.g. `"✓ PIRSA 2025 VALIDATED"`).
  - `metrics`: Bullet list of key facts shown in the tooltip/modal.
  - `strategicAction`: Plain language recommendation.
  - `source`: Data source attribution.
  - `hasFactsheet`: Flag for showing a "factsheet" call-to-action where applicable.

### Interaction

- Hovering a bubble shows a rich tooltip with:
  - Uplift vs Wine Grapes.
  - High-level metrics.
  - Strategic action and source.
- Clicking a bubble sets `selectedQuadrantCrop` and opens a modal:
  - Top banner summarizing quadrant and action.
  - Revenue/cost KPIs for the chosen crop.
  - Detailed bullet metrics and recommended strategy.

---

## 🖥 UI Layout & Flow

### 1. Crisis Alert

- Banner at the top of the page:
  - Flags the **2024 Wine Grape crisis**.
  - Shows benchmark loss figures (`-$1,775/ha`).
  - Includes data sources and a **"not financial advice"** disclaimer.

### 2. Scenario & Water Controls

- **Scenario Toggle**:
  - Switches between:
    - Alternative crop comparison view.
    - Global Market Quadrant view.
- **Water Allocation Slider**:
  - Range: 50–100%.
  - Updates `waterAllocation` and triggers recomputation of all metrics.
  - Uses `getSliderBackground()` to draw a green-to-gray gradient behind the slider track.

### 3. Revenue per ML Chart

- Horizontal bar chart comparing crops by **Revenue per ML of water**.
- Bars:
  - Wine Grapes shown in red.
  - Alternatives in green/blue/purple brand colors.
- Bankruptcy toggle directly affects Wine Grapes’ bar only.
- Tooltips and labels:
  - Show revenue per ML.
  - Show uplift vs Wine Grapes as a percentage.

### 4. Net Margin per Hectare Chart

- Vertical bar chart with a visible zero line:
  - Positive margins draw above the zero line.
  - Negative margins draw below, using `getZeroLinePosition()` for consistent alignment.
- Each bar is driven by `netMarginPerHa` from `cropMetrics`.
- Tooltips show:
  - Revenue.
  - Costs.
  - Net margin.

### 5. Comparison Matrix Table

- Tabular summary including:
  - `Revenue/ML`.
  - `Net Margin/ha`.
  - `Capital Cost`.
  - `Years to Profit` or `"Ongoing losses"`.
  - `riskLevel` with colored **risk-badge** (CRITICAL, MEDIUM, LOW).
- Uses CSS classes (`risk-critical`, `risk-medium`, `risk-low`) to apply pill styling and colors.

### 6. Cost Structure Panel

- Right-hand card bound to `selectedCropMetrics()`:
  - Shows crop name, risk status, and narrative description.
  - Donut chart:
    - Wine Grapes (CRITICAL): Revenue vs Costs only.
    - Alternatives: Input Costs vs Capital vs Net Margin.
  - Metric tiles:
    - Revenue/ha.
    - Input Costs/ha.
    - Capital Investment.
    - Net Margin/ha (colored red/green depending on sign).

### 7. Support & Resources

- Static section at the bottom:
  - Official data banner (WGCSA, Wine Australia, PIRSA/CCW).
  - Support bullets for:
    - Advisor conversations.
    - Co-op support.
    - Grants or program links (non-functional in the MVP).

---

## 🔧 How to Extend or Modify

### Add a New Crop

1. Open `profit-risk.component.ts`.
2. Add a new `Crop` object to the `crops` array:
   - Choose `type: 'core' | 'alternative'`.
   - Provide `yieldPerHa`, `pricePerTon`, `waterMLPerHa`, `variableCosts`, `fixedCosts`.
   - Set `volatilityFactor` based on how risky the crop is.
   - Add `marginParams` so the Net Margin chart has correct reference values.
   - Optionally set `capitalCost`, `yearsStr`, `riskLevel`, and `badges`.
3. If you want the crop in the fixed-order revenue chart:
   - Update the `order` array in `cropMetricsFixedOrder`.
4. Optionally add a corresponding bubble in `quadrantCrops` for the global view.

### Adjust Risk or Crisis Settings

- Change `volatilityFactor` on any crop to adjust how heavily its revenue per ML is discounted.
- Update the `0.65` bankruptcy factor in `getBankruptcyAdjustedRevenue` if crisis assumptions change.
- Modify `riskLevel` and `badges` to keep risk labels aligned with the latest industry guidance.

### Tuning Chart Ranges

- `MARGIN_MAX`, `MARGIN_MIN`, and `MARGIN_RANGE` can be tuned in `ProfitRiskComponent`:
  - Use higher values if you add more profitable crops.
  - Keep the zero line visually centered by adjusting both min and max.

---

## 📂 File Reference

- `profit-risk.component.ts`: Economic engine, signals, computed metrics, and quadrant configuration.
- `profit-risk.component.html`: Layout, cards, charts, tables, and modal structure.
- `profit-risk.component.css`: Styling for the page container, crisis banner, charts, tables, risk badges, quadrant chart, and responsive layout.

