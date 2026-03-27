# Profit & Risk Analysis Page

This module powers the **Profit & Risk Analysis** page for the AgriTech platform.

The page is no longer just a static economics comparison screen. In the current implementation it combines:

- a **live block forecast layer** driven by backend satellite insights
- a **wine-grape-specific profit/risk adjustment** based on live `LAI`
- a **comparison toolkit** for alternative crops
- a **global market quadrant** view for higher-level strategic positioning

The page is designed to answer two connected questions:

1. `What is the latest block-level production and profit outlook for my current vineyard block?`
2. `How does that compare with alternative crop options and broader market choices?`

---

## Current Architecture

### Frontend Files

- Component: `agritechplatform/src/app/modules/profit-risk/profit-risk.component.ts`
- Template: `agritechplatform/src/app/modules/profit-risk/profit-risk.component.html`
- Styles: `agritechplatform/src/app/modules/profit-risk/profit-risk.component.css`

### Supporting Services

- Block selection: `agritechplatform/src/app/shared/services/block.service.ts`
- Satellite/dashboard contract mapping: `agritechplatform/src/app/core/services/dashboard-api.service.ts`

### Pattern

The page is an Angular standalone component built with:

- `signals`
- `computed`
- `inject`
- `toSignal`
- RxJS block subscription flow

The implementation is hybrid:

- the **top forecast section** is live and block-specific
- the **rest of the page** is still comparison-oriented and uses configured crop assumptions
- the **wine grape row and baseline economics** are adjusted by the live satellite forecast

---

## What The Page Does

The page has four major functional areas.

### 1. Live Forecast Panel

This is the top section of the page and is powered by backend insights for the selected block.

It shows:

- live block forecast headline
- projected tonnage range
- forecast confidence
- freshness/composite date
- profit outlook label
- warning banner if imagery quality or freshness is poor

### 2. Alternative Crop Scenario

This section compares wine grapes against alternatives using:

- Revenue per ML
- Net Margin per Hectare
- Risk-Adjusted Revenue per ML
- Crop Comparison Matrix
- Cost Structure chart

### 3. Global Market Quadrant

This section positions crops visually in a strategic “opportunity vs exit” style view.

It includes:

- crop bubbles
- tooltips
- crop detail modal
- strategic action summaries

### 4. Support & Resources

This remains a supporting educational section and contains:

- crisis framing
- support reminders
- resource-oriented messaging

---

## Live Forecast Layer

The live forecast section is the most important implementation change in the current version.

It uses backend satellite insights for the selected block and exposes:

- `LAI`
- status
- data quality
- warning
- composite date
- confidence

### Live Block Subscription Flow

On `ngOnInit()`:

1. the component gets the active user
2. subscribes to `blockService.block$`
3. ignores null values
4. ignores repeated block selections with the same `lan`
5. loads live forecast data whenever the selected block changes

The HTTP load happens in:

- `loadLiveForecast(block: Block)`

That method:

- clears previous warning state
- requests `getBlockInsights(block.lan || block.id)`
- stores the response in `liveInsights`
- stores the warning in `profitRiskWarning`
- falls back to an error message if the request fails

---

## Main Data Structures

## `Crop`

Each crop comparison entry is represented by `Crop`.

Important fields:

- `name`
- `yieldPerHa`
- `adjustedYieldPerHa`
- `pricePerTon`
- `waterMLPerHa`
- `variableCosts`
- `fixedCosts`
- `volatilityFactor`
- `color`
- `type`
- `marginParams`
- `capitalCost`
- `yearsStr`
- `riskLevel`
- `badges`
- `revenuePerHa`
- `totalCostsPerHa`
- `netMarginPerHa`
- `revenuePerML`
- `riskAdjustedRevenuePerML`
- `yearsToProfit`

### Why `marginParams` exists

The page uses `marginParams` for the comparison margin model so the Net Margin chart stays stable and comparable across crop types. This is different from raw price × yield math and is part of the page’s configured business model.

## `LiveWineGrapeEconomics`

This internal computed structure is the bridge between live satellite data and the rest of the economics page.

It stores:

- `tonnesPerHaCenter`
- `tonnesPerHaRangeLabel`
- `totalTonnageLabel`
- `yieldAdjustmentFactor`
- `revenuePerHa`
- `netMarginPerHa`
- `revenuePerML`
- `riskAdjustedRevenuePerML`
- `projectedLoss`
- `outlookLabel`
- `guidance`
- `yearsToProfit`

This object is used to replace the default wine-grape economics with live forecast-adjusted values.

---

## Live Forecast Calculations

## 1. `liveLai`

Reads the block’s latest `LAI` from:

- `liveInsights()?.metrics.lai.raw`

This is the main live driver for the top forecast.

## 2. `projectedTonnageRange`

This computed block transforms live `LAI` into a yield estimate.

Current formula:

- `tonnesPerHaCenter = clamp(1.15 + lai * 0.78, 1.2, 5.8)`
- lower bound = `center * 0.85`
- upper bound = `center * 1.15`

Then it multiplies by block area to calculate total tonnage range.

Returned values include:

- center yield per hectare
- display label for yield per hectare range
- center total tonnage
- display label for total tonnage range

This is what feeds the “Projected tonnage” card in the hero panel.

## 3. `liveWineGrapeEconomics`

This converts live yield into live wine-grape economics.

Steps:

1. read the current tonnage estimate
2. read the currently selected water allocation
3. compare the live per-hectare forecast to the baseline reference `4.2 t/ha`
4. calculate a `yieldAdjustmentFactor`
5. apply that factor to the configured wine-grape revenue baseline
6. derive:
   - revenue per hectare
   - net margin per hectare
   - revenue per ML
   - risk-adjusted revenue per ML
   - projected loss
   - outlook label

### `yieldAdjustmentFactor`

Current formula:

- `yieldAdjustmentFactor = clamp(tonnesPerHaCenter / 4.2, 0.45, 1.55)`

This prevents the live forecast from pushing the economics unrealistically low or high.

### `projectedLoss`

Current formula:

- `max(0, baseline revenue at current allocation - adjusted revenue)`

This provides a simple downward-pressure estimate when the live block yield is underperforming its configured baseline.

## 4. `forecastConfidence`

This maps backend confidence values to user-facing labels:

- `high` -> `High confidence`
- `medium` -> `Moderate confidence`
- otherwise -> `Low confidence`

## 5. `liveForecastStatus`

This converts backend status/quality into a readable summary:

- loading
- refresh in progress
- stale cache
- reduced image quality
- no usable satellite data
- refreshed from satellite data
- loaded from cache

## 6. `freshnessSummary`

This shows:

- `Composite date: ...`

based on `compositeDateTo`.

## 7. `laiAdvisory`

This drives the main live forecast headline and summary text.

Rules:

- if no `LAI`
  - `Waiting for live tonnage forecast`
- if `LAI > 5`
  - `Above-average yield advisory`
- if `LAI < 2`
  - `Yield warning`
- otherwise
  - `Forecast tracking normally`

This is the main alert/recommendation logic for the Profit & Risk page.

## 8. `profitForecastSummary`

This provides the short narrative under “Profit outlook”.

Rules:

- if live data is unavailable
  - show unavailable state
- if wine-grape margin is negative
  - show downside versus break-even
- else if projected loss is positive
  - show projected profit risk
- otherwise
  - show no immediate loss message

## 9. `profitOutlookHeadline`

Displays:

- `Stable`
- `Downside risk`
- `Upside potential`

based on `liveWineGrapeEconomics.outlookLabel`.

## 10. `keyInsight`

This is the short operational summary in the alternative-crop scenario section.

It shows:

- current live wine-grape yield range
- margin pressure or margin estimate
- confidence + water allocation context
- guidance sentence based on live forecast strength

---

## Current Page Structure

## Header

Shows:

- page icon
- page title
- block-aware subtitle with selected block name and location

## Live Forecast Panel

Shows:

- `Live Block Forecast`
- advisory title
- advisory message
- status text
- projected tonnage card
- forecast confidence card
- profit outlook card

## Warning Banner

Rendered only when:

- backend warning exists
- or local `profitRiskWarning` exists

## Crisis Alert

A static crisis context banner remains visible below the live forecast panel.

It is informational and not calculated from live data.

## Scenario Toggle

Two view modes:

- `alternative`
- `global`

This is controlled by:

- `selectedScenario`

## Alternative Crop Scenario

Contains:

- water allocation slider
- bankruptcy impact toggle
- key insight panel
- revenue per ML chart
- net margin chart
- risk-adjusted revenue chart
- crop comparison matrix
- cost structure panel

## Global Market Quadrant

Contains:

- strategic crop bubble plot
- tooltip interaction
- crop detail modal

## Support & Resources

Visible as supporting content below the main analytical surfaces.

---

## Comparison Engine

## `cropMetrics`

This is the main economics engine for the page.

It does two things at once:

1. computes metrics for all crops
2. overrides wine-grape economics with live satellite-adjusted values when available

### For all crops

Base values include:

- adjusted yield from water allocation
- revenue per hectare standard
- revenue per ML
- risk-adjusted revenue per ML
- configured margin model
- years to profit

### For Wine Grapes specifically

If live block economics are available, the component replaces the default wine-grape row with:

- live adjusted yield
- live revenue per hectare
- live net margin per hectare
- live revenue per ML
- live risk-adjusted revenue per ML
- live payback/loss interpretation

This is the most important difference from the older implementation.

It means the wine-grape baseline used in the charts and comparison matrix is no longer fixed if live data exists.

## `riskAdjustedMetrics`

Filters to alternative crops and sorts them by `riskAdjustedRevenuePerML`.

## `cropMetricsFixedOrder`

Maintains a fixed display order for the Revenue per ML chart:

- Wine Grapes
- Almonds
- Olives
- Table Grapes
- Citrus

## `selectedCropMetrics`

Builds the data object used by the cost structure panel.

For critical crops:

- 2-segment layout: revenue vs costs

For non-critical crops:

- 3-segment layout: input costs, capital, margin

---

## User Controls

## Water Allocation Slider

Controlled by:

- `waterAllocation`

Range:

- 50 to 100

Used by:

- comparison economics
- key insight warning text
- live wine-grape economic adjustment

## Bankruptcy Impact Toggle

Controlled by:

- `showBankruptcyImpact`

Used only for Wine Grapes.

Logic:

- if off -> show regular wine-grape revenue per ML
- if on and crop is `CRITICAL` -> apply a 35% haircut

Method:

- `getBankruptcyAdjustedRevenue(...)`

## Scenario Toggle

Controlled by:

- `selectedScenario`

Values:

- `alternative`
- `global`

---

## Chart and Table Helpers

## `getDisplayRevenue`

Returns the chart revenue value, including bankruptcy haircut when enabled.

## `getPercentageVsWineGrapes`

Compares crop revenue per ML against the current wine-grape display revenue.

## `wineGrapeRiskAdjustedBaseline`

Uses the current wine-grape risk-adjusted revenue as the comparison baseline.

This means the risk-adjusted chart updates when live wine-grape economics change.

## `getRiskAdjustedDifferenceVsWineGrapes`

Computes the uplift vs the current wine-grape baseline.

## `getHoveredPercentage`, `getHoveredValue`, `getHoveredLabel`

These power the cost-structure donut hover tooltips.

## `getBarHeightPercentage`, `getZeroLinePosition`, `isPositive`

These support the Net Margin per Hectare chart rendering.

## `getSliderBackground`

Draws the water slider gradient.

---

## Global Market Quadrant

The quadrant view is still largely a configured strategic layer, not a live satellite-calculated model.

`quadrantCrops` is a static configuration array that contains:

- crop name
- icon
- color
- plot position
- bubble size
- revenue per ML
- uplift vs wine grapes
- quadrant label
- badges
- metrics
- strategic action
- source

This is designed to support strategic thinking, not to replace the live block forecast.

---

## What Is Live vs What Is Static

## Live / Dynamic

- selected block context
- top forecast panel
- `LAI`-driven projected tonnage
- confidence
- freshness status
- warning state
- wine-grape row economics in the comparison layer
- wine-grape baseline in the risk-adjusted chart
- key insight panel messaging

## Static / Configured

- alternative crop assumptions
- crisis alert copy
- global market quadrant positions and facts
- support resources copy
- crop prices/cost assumptions in the configured alternatives

---

## Important Design Reality

The current page is a hybrid implementation, not a fully satellite-driven economic simulator for every crop.

What is currently true:

- the page now uses live satellite data where it matters most for the current block
- the wine-grape outlook adjusts with live `LAI`
- the top risk/profit summary is live
- the comparison tooling remains configured and strategic

So the page is best described as:

- **live block forecast at the top**
- **configured strategic comparison tool underneath**

---

## Extending the Page

## Add a New Live Forecast Signal

Update:

- `dashboard-api.service.ts`
- `profit-risk.component.ts`
- `profit-risk.component.html`

Typical flow:

1. expose the backend field in the mapped dashboard response
2. create a computed signal
3. wire it into a card/banner/summary

## Change LAI Yield Logic

Update:

- `projectedTonnageRange`
- `liveWineGrapeEconomics`

This is where the live `LAI` to yield and yield to economics conversions happen.

## Change Confidence Rules

Confidence text currently depends on the backend-mapped confidence label.

Update:

- `forecastConfidence`

If deeper confidence explanation is needed, that can be expanded in the template.

## Add Another Comparison Crop

Update:

- `crops` array
- `cropMetricsFixedOrder`
- optionally `quadrantCrops`

## Adjust Bankruptcy Haircut

Update:

- `getBankruptcyAdjustedRevenue`

Current haircut:

- `0.65` multiplier for crisis crop display

---

## Testing Notes

When validating this page, check:

- block switch reloads live forecast
- no-data block shows waiting state
- degraded imagery shows warning state
- `LAI < 2` shows yield warning
- `LAI > 5` shows above-average yield advisory
- projected tonnage changes with live `LAI`
- wine-grape economics in charts/tables change when live data changes
- comparison against wine grapes updates correctly
- scenario toggle still switches cleanly
- bankruptcy toggle still only affects wine grapes

Recommended manual test areas:

- fresh block with normal LAI
- low-LAI block
- high-LAI block
- stale/degraded block
- no-data block

---

## File Reference

Main module:

- `agritechplatform/src/app/modules/profit-risk/profit-risk.component.ts`
- `agritechplatform/src/app/modules/profit-risk/profit-risk.component.html`
- `agritechplatform/src/app/modules/profit-risk/profit-risk.component.css`

Supporting service:

- `agritechplatform/src/app/core/services/dashboard-api.service.ts`

Block selection:

- `agritechplatform/src/app/shared/services/block.service.ts`

---

## Summary

The current Profit & Risk page is a mixed operational + strategic page.

At the top, it gives the grower a live block-specific view of:

- expected production
- confidence
- freshness
- likely profit pressure or upside

Under that, it still provides a broader strategic comparison toolkit for crop decisions, water efficiency, and longer-term market thinking.

The key implementation change from the old version is that the current wine-grape economic picture is now adjusted by live satellite forecast data rather than staying completely fixed.
