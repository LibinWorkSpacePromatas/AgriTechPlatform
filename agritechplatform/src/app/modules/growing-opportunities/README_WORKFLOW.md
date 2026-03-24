# Growing Opportunities Workflow Guide

This document explains the **actual working flow** of the Growing Opportunities feature:

- where the page starts
- which file makes the API call
- which backend file handles the request
- how the response is built
- how the UI renders the result
- how feedback is saved

It is meant to be a simpler companion to `README.md`.

---

## What This Feature Does

The Growing Opportunities page has **two parts**:

1. **Live block recommendations**
   These come from the backend based on satellite-derived block data.

2. **Static opportunity library**
   These are hardcoded cards shown below the live recommendations.

So this page is **not only static UI**. The upper section is powered by a real API flow.

---

## Main Files Involved

### Frontend

- `agritechplatform/src/app/app.routes.ts`
- `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.ts`
- `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.html`
- `agritechplatform/src/app/core/services/growing-opportunities.service.ts`
- `agritechplatform/src/app/shared/services/block.service.ts`
- `agritechplatform/src/environments/environment.ts`

### Backend

- `backend/app/api/routes.py`
- `backend/app/services/growing_opportunities.py`
- `backend/app/schemas/growing_opportunities.py`

### Data / Feedback Storage

- `backend/data/growing_opportunities_feedback.jsonl`

---

## End-to-End Workflow

Below is the actual runtime flow from UI to backend and back to UI.

### Step 1. User opens the page

Route definition:

- `agritechplatform/src/app/app.routes.ts`

The route:

- `path: 'growing-opportunities'`

loads:

- `GrowingOpportunitiesComponent`

This means Angular opens:

- `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.ts`

---

### Step 2. Component waits for the selected block

File:

- `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.ts`

In `ngOnInit()`, the component subscribes to:

- `blockService.block$`

That stream comes from:

- `agritechplatform/src/app/shared/services/block.service.ts`

`BlockService` is responsible for:

- storing the currently selected block
- emitting the current block
- restoring the previous block from local storage

Whenever the selected block changes, the component calls:

- `loadBlockInsights(block)`

This is the main trigger for the live API request.

---

### Step 3. Frontend service makes the API request

File:

- `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.ts`

Method:

- `loadBlockInsights(block: Block)`

Inside that method, the component calls:

- `this.growingOpportunitiesService.getPageData(block.lan || block.id)`

That service is defined in:

- `agritechplatform/src/app/core/services/growing-opportunities.service.ts`

The frontend service builds this request:

- `GET /api/blocks/{blockId}/growing-opportunities`

The backend base URL comes from:

- `agritechplatform/src/environments/environment.ts`

Current value:

- `http://localhost:8000`

So the final request looks like:

- `http://localhost:8000/api/blocks/{blockId}/growing-opportunities`

---

### Step 4. Backend route receives the request

File:

- `backend/app/api/routes.py`

The route is:

- `GET /api/blocks/{block_id}/growing-opportunities`

This route does two main things:

1. resolves the block using `block_id`
2. calls the Growing Opportunities backend service

The route calls:

- `growing_opportunities_service.build_page_payload(db, block)`

So the route file is mainly the **entry point**, while the main business logic lives in the service file.

---

### Step 5. Backend service builds the page response

File:

- `backend/app/services/growing_opportunities.py`

Main method:

- `build_page_payload(self, db, block)`

This method:

- reads the latest `SatelliteCache` for the block
- reads recent `SatelliteTimeseries` rows
- creates recommendation cards
- creates trend summary text
- calculates data freshness
- calculates confidence
- returns the final response object

If there is **no satellite cache yet**, it returns a placeholder response like:

- status = `updating`
- data quality = `no_data`
- a system-level recommendation saying the page is still waiting for data

If cache exists, it reads values from the payload such as:

- `ndre`
- `evi`
- `ndwi`

Then it generates recommendation cards using threshold rules.

---

## Recommendation Rule Workflow

The rule logic is inside:

- `backend/app/services/growing_opportunities.py`

Main helper:

- `_build_recommendations(...)`

Current rules:

### 1. Foliar Nutrient Application

Triggered when:

- `ndre < 0.25`

Meaning:

- likely nutrient weakness

Result:

- a `nutrient` recommendation card is added

---

### 2. Canopy Management

Triggered when:

- `evi > 0.50`

Meaning:

- canopy is dense

Result:

- a `canopy` recommendation card is added

---

### 3. Irrigation Opportunity

Triggered when:

- `ndwi < -0.10`

Meaning:

- water stress is being detected

Result:

- an `irrigation` recommendation card is added

If `ndwi < -0.30`, the wording becomes more urgent.

---

### 4. Nutrient Trend Watch

Triggered when:

- `0.25 <= ndre <= 0.40`
- and NDRE is declining over recent passes

Meaning:

- not yet critical, but the trend is getting weaker

Result:

- a `trend` recommendation card is added

---

### 5. Stable Conditions Fallback

If no rule is triggered:

- a positive fallback recommendation is returned

Meaning:

- nothing urgent was detected

---

## Trend Workflow

The backend also reads recent time series records from:

- `SatelliteTimeseries`

Trend helper:

- `_build_trend_summary(...)`

This creates simple summary text such as:

- NDRE trending up/down/flat
- EVI trending up/down/flat
- NDWI trending up/down/flat

That text is returned in the API response and displayed near the top of the page.

Some individual recommendation cards also get their own `trend_note`.

---

## Response Schema Workflow

The backend does not return random JSON. It returns a typed schema defined in:

- `backend/app/schemas/growing_opportunities.py`

Main models:

- `GrowingOpportunityRecommendation`
- `GrowingOpportunityFeedbackRequest`
- `GrowingOpportunityFeedbackResponse`
- `GrowingOpportunitiesResponse`

This schema defines the shape of the response, including:

- `block_id`
- `crop`
- `status`
- `source`
- `data_quality`
- `composite_date_from`
- `composite_date_to`
- `data_age_days`
- `confidence`
- `warning`
- `trend_summary`
- `recommendations`
- `feedback_enabled`

So the frontend knows what fields are available and how to render them.

---

## Frontend Rendering Workflow

After the backend response returns, control comes back to:

- `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.ts`

The response is stored in:

- `pageData`

The component then exposes helper getters such as:

- `liveRecommendations`
- `primaryRecommendation`
- `pageHeadline`
- `pageSummary`
- `insightsStatusLabel`
- `freshnessLabel`
- `qualityLabel`

These values are then rendered in:

- `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.html`

The template displays:

- hero section
- warning banner
- trend summary
- recommendation cards
- feedback controls

The component also converts technical text into friendlier UI text using:

- `getPlainMetricLabel(...)`
- `withFriendlyBlockName(...)`

This helps replace internal block IDs or LAN values with readable block names.

---

## Static Opportunity Library Workflow

The lower section of the page does **not** come from the backend.

It is defined directly in:

- `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.ts`

The array is:

- `opportunities: Opportunity[]`

These cards are rendered in the HTML template and opened in a modal when clicked.

So this part of the page is:

- frontend only
- static content
- no API call needed

---

## Feedback Workflow

The page also supports recommendation feedback.

### Frontend

When the user clicks:

- `Helpful`
- `Not helpful`

the component calls:

- `submitFeedback(recommendation, helpful)`

This uses the frontend service method:

- `sendFeedback(blockId, payload)`

Request sent:

- `POST /api/blocks/{blockId}/growing-opportunities/feedback`

Payload includes:

- `recommendation_id`
- `helpful`
- optional `notes`

### Backend

The backend route in:

- `backend/app/api/routes.py`

calls:

- `growing_opportunities_service.save_feedback(block, feedback)`

in:

- `backend/app/services/growing_opportunities.py`

The feedback is appended to:

- `backend/data/growing_opportunities_feedback.jsonl`

This file stores one JSON record per line.

---

## File-to-File Workflow Summary

Here is the simplest file chain:

1. `agritechplatform/src/app/app.routes.ts`
2. `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.ts`
3. `agritechplatform/src/app/shared/services/block.service.ts`
4. `agritechplatform/src/app/core/services/growing-opportunities.service.ts`
5. `backend/app/api/routes.py`
6. `backend/app/services/growing_opportunities.py`
7. `backend/app/schemas/growing_opportunities.py`
8. back to `growing-opportunities.component.ts`
9. `growing-opportunities.component.html`

In short:

- route opens component
- component gets selected block
- component calls frontend API service
- frontend API service calls backend route
- backend route calls backend service
- backend service builds response using cache and timeseries
- response returns to component
- template renders the result

---

## Important Note About Two Frontend Services

There are two similarly named frontend service files in the project:

- `agritechplatform/src/app/core/services/growing-opportunities.service.ts`
- `agritechplatform/src/app/services/growing-opportunities/growing-opportunities.service.ts`

For the current Growing Opportunities page, the one actually used by the component is:

- `agritechplatform/src/app/core/services/growing-opportunities.service.ts`

The other file appears to be from an older or separate opportunities flow.

---

## Quick Mental Model

If you want to remember the feature in one sentence:

**Selected block -> component -> frontend API service -> backend route -> backend recommendation builder -> response -> page UI**

---

## When To Read Which File

Read this order if you are trying to understand the feature quickly:

1. `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.ts`
2. `agritechplatform/src/app/core/services/growing-opportunities.service.ts`
3. `backend/app/api/routes.py`
4. `backend/app/services/growing_opportunities.py`
5. `backend/app/schemas/growing_opportunities.py`
6. `agritechplatform/src/app/modules/growing-opportunities/growing-opportunities.component.html`

This order will give you the clearest workflow understanding.
