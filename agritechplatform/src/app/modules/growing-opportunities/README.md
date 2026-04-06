# Growing Opportunities Page

This module powers the **Growing Opportunities** page for the AgriTech platform. It is no longer a static content-only page. The current implementation combines:

- a **live block-specific recommendation layer** driven by satellite insights from the backend
- a **secondary knowledge library** of static diversification and support content
- a **feedback loop** so growers can mark recommendations as helpful or not helpful

The page is designed to answer two different user needs:

1. `What should I do for this block right now?`
2. `What broader opportunities or support programs should I explore?`

The live recommendation section answers the first question. The static opportunity library answers the second.

---

## Current Architecture

### Frontend

- Component: `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.ts`
- Template: `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.html`
- Styles: `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.css`
- API service: `agritechplatform/src/app/core/services/growing-opportunities.service.ts`

### Backend

- Service logic: `backend/app/services/growing_opportunities.py`
- Schemas: `backend/app/schemas/growing_opportunities.py`
- Route integration: backend API routes expose the page payload and feedback endpoint

### Data Source

The page is backed by cached satellite outputs stored in the backend, primarily from Sentinel-2 / Google Earth Engine processing. The page consumes:

- recommendation rules generated from block-level metrics
- freshness and data quality metadata
- short trend summaries from cached timeseries
- user feedback save status

---

## What The Page Shows

The page is split into two major sections.

### 1. Live Block Actions

This is the top priority section. It is built from the selected block’s latest backend response.

It includes:

- a hero panel for the active block
- status label for freshness / cache state
- composite date
- data quality status
- optional warning banner
- trend summary across recent cached passes
- recommendation cards generated from the latest satellite metrics
- recommendation feedback buttons

### 2. Opportunity Library

This is the lower section and remains static. It contains curated articles/resources such as:

- olives as a lower-water option
- government funding support
- alternative varieties and premium markets
- almonds and precision irrigation
- multi-crop strategies

These are still useful, but they are now secondary to the live block actions.

---

## Frontend Implementation Details

## Component Responsibilities

`GrowingOpportunitiesComponent` is responsible for:

- loading the selected block from `BlockService`
- requesting the live page payload from `GrowingOpportunitiesService`
- rendering live recommendation cards
- rendering fallback/loading states
- mapping technical metrics into more farmer-friendly labels
- replacing internal block identifiers in text with the friendly block name
- handling feedback submission
- managing the modal for static opportunity articles

### Main State Fields

- `currentBlock: Block | null`
  - the currently selected block
- `pageData: GrowingOpportunitiesResponse | null`
  - the latest live backend payload for the page
- `isInsightsLoading: boolean`
  - true while the page is requesting live recommendations
- `pageWarning: string | null`
  - warning from backend or request failure state
- `feedbackMessage: string | null`
  - success/error message after sending feedback
- `feedbackState`
  - per-recommendation UI state for helpful / not helpful / saving
- `selectedOpportunity: Opportunity | null`
  - static-library modal state

### Lifecycle Flow

On `ngOnInit()`:

- the component loads the current user for header context
- subscribes to `blockService.block$`
- filters out null blocks
- ignores duplicate selections by LAN
- reloads page data whenever the active block changes

On `ngOnDestroy()`:

- unsubscribes active HTTP requests
- removes modal body scroll lock
- completes the destroy subject

---

## Frontend API Contract

`GrowingOpportunitiesService` provides two methods:

### `getPageData(blockId: string)`

Requests:

- `GET /api/blocks/{blockId}/growing-opportunities`

Returns:

- block id
- crop
- status
- source
- data quality
- composite date range
- data age
- confidence
- warning
- trend summary
- recommendations
- feedback enabled flag

### `sendFeedback(blockId: string, payload)`

Requests:

- `POST /api/blocks/{blockId}/growing-opportunities/feedback`

Payload:

- `recommendation_id`
- `helpful`
- optional `notes`

Used by the page when the user clicks:

- `Helpful`
- `Not helpful`

---

## Recommendation Card UX

Each live recommendation card shows:

- severity label
- plain-language signal label
- card title
- short summary
- threshold / why it matters
- current reading
- plain explanation of what the reading means
- action-oriented instruction
- trend note if available
- feedback controls if enabled

### Plain-Language Labels

The page intentionally avoids showing technical metric names as the primary visible label.

Current mappings:

- `NDRE` -> `Leaf nutrient signal`
- `EVI` -> `Canopy growth signal`
- `NDWI` -> `Water stress signal`
- `system` -> `Block status`

This makes the page more usable for growers who may not know the satellite index acronyms.

### Friendly Block Names

Backend recommendation text may reference internal block identifiers such as LAN / ID values. The frontend runs these messages through `withFriendlyBlockName(...)` so visible text uses the selected block’s readable name instead.

This prevents internal codes from appearing in the UI.

---

## Static Opportunity Library

The page still contains a hard-coded `Opportunity[]` array. These entries are not generated from live data.

Each `Opportunity` includes:

- `id`
- `title`
- `description`
- `fullDescription`
- `keyPoints`
- `tags`
- `source`
- `sourceUrl`

### Why This Static Section Still Exists

The live recommendation engine is meant to answer immediate block actions. The static section provides:

- longer-term diversification ideas
- support program visibility
- educational context
- links to external resources

So the page intentionally combines:

- **live operational recommendations**
- **curated strategic resources**

---

## Backend Recommendation Engine

Backend recommendation generation lives in:

- `backend/app/services/growing_opportunities.py`

The service reads:

- `SatelliteCache`
- `SatelliteTimeseries`
- current block metadata

It builds a `GrowingOpportunitiesResponse`.

### If No Cache Exists

If the selected block does not yet have a cached satellite composite:

- status is returned as `updating`
- quality is returned as `no_data`
- confidence is `low`
- a system-level placeholder recommendation is returned

This prevents the frontend from rendering an empty page.

### If Cache Exists

The backend:

- reads the cached payload
- reads up to 3 recent timeseries records
- generates recommendations
- generates trend summary text
- calculates data age
- calculates confidence
- adds warning text when imagery quality is poor

---

## Live Recommendation Rules

The page’s live cards are currently created from these backend rules.

### 1. Foliar Nutrient Application

Triggered when:

- `ndre < 0.25`

Behavior:

- category: `nutrient`
- severity:
  - `critical` when `ndre < 0.12`
  - otherwise `warning`
- action:
  - `Check this block for a foliar nutrient application.`

Farmer-facing meaning:

- chlorophyll / nutrient activity looks weaker than expected
- foliar nutrient review is worth prioritising

### 2. Canopy Management

Triggered when:

- `evi > 0.50`

Behavior:

- category: `canopy`
- severity: `info`
- action:
  - `Review leaf removal and canopy airflow in this block.`

Farmer-facing meaning:

- canopy density may be high
- airflow and disease risk should be reviewed

### 3. Irrigation Opportunity

Triggered when:

- `ndwi < -0.10`

Behavior:

- category: `irrigation`
- severity:
  - `critical` when `ndwi < -0.30`
  - otherwise `warning`

Actions:

- urgent case:
  - `Irrigate today.`
- non-urgent case:
  - `Consider irrigation within 2-3 days.`

Farmer-facing meaning:

- the block is drying down
- irrigation timing should be reviewed before stress deepens

### 4. Nutrient Trend Watch

Triggered when:

- `0.25 <= ndre <= 0.40`
- and NDRE is declining across 3 consecutive cached passes

Behavior:

- category: `trend`
- severity: `info`
- action:
  - prepare for nutrient review if decline continues

This is meant to catch a softening nutrient trend before it becomes an urgent nutrient alert.

### 5. Stable Conditions

Triggered when:

- none of the above recommendation rules are triggered

Behavior:

- category: `system`
- severity: `positive`
- action:
  - continue monitoring until the next refresh

This acts as the safe “nothing urgent detected” fallback.

---

## Trend Logic

The backend also builds trend information from up to 3 recent cached passes.

### Trend Summary

The page-level trend summary can include messages like:

- NDRE trending up/down/flat
- EVI trending up/down/flat
- NDWI trending up/down/flat

This is shown near the top of the page.

### Per-Recommendation Trend Notes

Each recommendation can also include a trend note, such as:

- nutrient activity softened across recent passes
- latest pass is slightly stronger/weaker than the previous one
- more cached passes are needed before confidence is higher

This gives the user context on whether the signal is strengthening, weakening, or uncertain.

---

## Freshness, Quality, and Confidence

The page surfaces the health of the data itself, not just the recommendations.

### `status`

Used for cache / freshness state:

- `fresh`
- `stale`
- `updating`

Displayed in the hero status pill.

### `data_quality`

Used for image usability:

- `good`
- `degraded`
- `no_data`

Displayed in the hero meta area.

### `composite_date_to`

Used to display:

- `Composite date: ...`

### `confidence`

Calculated in the backend from the cache quality logic and returned as text such as:

- `high`
- `medium`
- `low`

### `warning`

Returned when imagery quality is poor or data is unavailable, for example:

- cloud-heavy imagery reduced confidence
- no usable pixels were available

The frontend displays this in an inline warning banner.

---

## Feedback Flow

The page includes recommendation feedback so the team can later calibrate recommendations.

### User Actions

For each recommendation, the user can choose:

- `Helpful`
- `Not helpful`

### Frontend Behavior

When clicked:

- button state changes to `saving`
- request is sent to backend
- success message is shown if saved
- error message is shown if save fails

### Backend Behavior

Feedback is written to:

- `backend/data/growing_opportunities_feedback.jsonl`

Each saved record includes:

- feedback id
- UTC timestamp
- block id
- block LANSLU
- recommendation id
- helpful boolean
- optional notes

This allows lightweight calibration tracking without needing a separate feedback table yet.

---

## Template Structure

The current HTML structure contains:

### Header

- page icon
- page title
- subtitle

### Live Hero Panel

- active block label
- page headline
- page summary
- status pill
- freshness label
- quality label

### Live Recommendation Section

- section heading
- warning banner
- trend summary banner
- feedback banner
- recommendation cards grid

### Library Section

- “Explore More” heading
- static opportunity cards grid

### Modal

Used for static opportunity details only.

It contains:

- title
- full description
- key points
- tags
- source link
- disclaimer

---

## Styling Notes

`growing-opportunities.component.css` now supports both the live and static parts of the page.

Important style groups include:

- hero panel styles
- live recommendation card styles
- severity-based visual states
- feedback button styles
- warning / trend / status banners
- static opportunity grid styles
- modal styles
- responsive layout rules

The page is intentionally designed so the live recommendations feel like the primary operational surface, while the static library feels secondary.

---

## Data Flow Summary

The full data flow is:

1. User selects a block.
2. `BlockService` emits the active block.
3. `GrowingOpportunitiesComponent` receives it.
4. Frontend calls `GrowingOpportunitiesService.getPageData(...)`.
5. Backend loads satellite cache + recent timeseries.
6. Backend builds recommendation payload.
7. Frontend renders:
   - hero status
   - warnings
   - trend summary
   - recommendation cards
8. User can optionally submit recommendation feedback.

---

## Important Differences From The Old Version

The old README described this page as a simple static library with a modal. That is no longer true.

The current page now has:

- live backend calls
- block-aware recommendation generation
- threshold-based recommendation logic
- timeseries trend notes
- freshness / quality / warning state
- recommendation feedback
- friendly name replacement for internal block ids

The static library still exists, but it is no longer the main purpose of the page.

---

## How To Extend The Page

### Add a New Backend Recommendation Rule

Update:

- `backend/app/services/growing_opportunities.py`

Typical steps:

1. read the relevant metric from payload
2. define threshold logic
3. append a new `GrowingOpportunityRecommendation`
4. include a farmer-facing message
5. optionally add trend note logic

### Add a New Recommendation Field

Update both:

- `backend/app/schemas/growing_opportunities.py`
- `agritechplatform/src/app/core/services/growing-opportunities.service.ts`

Then wire the field into:

- `growing-opportunities.component.ts`
- `growing-opportunities.component.html`

### Add a New Static Opportunity Article

Update:

- `growing-opportunities.component.ts`

Add a new object to the `opportunities` array with:

- title
- description
- fullDescription
- keyPoints
- tags
- source
- sourceUrl

No backend work is required for static library content.

### Change Plain-Language Labels

Update:

- `getPlainMetricLabel(...)` in `growing-opportunities.component.ts`

This is where technical metric names are translated into more user-friendly visible labels.

### Change Friendly Block Name Replacement

Update:

- `withFriendlyBlockName(...)` in `growing-opportunities.component.ts`

This is the place to change how internal LAN / ID values are replaced in displayed strings.

---

## Testing Notes

When validating this page, check:

- block switch loads new recommendations
- loading state appears correctly
- warning banner appears for degraded / no-data cases
- trend summary renders when available
- correct recommendation card appears for each threshold case
- friendly block name is shown instead of internal codes
- feedback buttons save successfully
- modal still works for static opportunity cards

Recommended backend rule cases:

- `ndre < 0.25` -> nutrient card
- `evi > 0.50` -> canopy card
- `ndwi < -0.10` -> irrigation card
- `ndwi < -0.30` -> urgent irrigation wording
- `0.25 <= ndre <= 0.40` with declining recent passes -> trend watch
- no rule triggered -> stable conditions

---

## File Reference

Frontend:

- `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.ts`
- `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.html`
- `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.css`
- `agritechplatform/src/app/core/services/growing-opportunities.service.ts`

Backend:

- `backend/app/services/growing_opportunities.py`
- `backend/app/schemas/growing_opportunities.py`

---

## Summary

The Growing Opportunities page is now a hybrid page:

- **live block action engine at the top**
- **static strategic opportunity library underneath**

Its main value is no longer just content presentation. It now converts live satellite-derived vineyard signals into farmer-facing action cards, while still preserving the broader diversification and support content that helps growers plan beyond the current pass.
