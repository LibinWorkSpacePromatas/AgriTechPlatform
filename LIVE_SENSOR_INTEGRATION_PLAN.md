# Live Sensor Integration Plan

## Purpose

This document defines the recommended long-term architecture for integrating live IoT soil sensor data into the AgriTech platform without conflicting with the legacy sensor system.

The design must support:

- one user owning multiple blocks
- one block having multiple physical sensor devices
- one device producing many historical readings
- block-scoped dashboard queries
- future admin mapping and audit workflows
- zero corruption of legacy sensor tables

---

## Core Principles

1. Keep legacy and live sensor systems separate.
2. Store every external API reading permanently.
3. Resolve dashboard data by `block_id`, never directly by API device id in the frontend.
4. Treat device-to-block mapping as first-class data.
5. Use a latest snapshot table only for fast reads, never as the system of record.

---

## Current Live Tables

The live integration currently uses these tables:

- `live_sensor_sources`
- `live_sensor_block_mappings`
- `live_sensor_source_readings`
- `live_sensor_source_latest`
- `live_sensor_sync_state`

Legacy tables remain separate and must not be reused for live API ingestion:

- `sensor_definitions`
- `sensor_readings`
- `sensor_latest`
- older `live_sensor_descriptions` / `live_sensor_readings` / `live_sensor_latest` compatibility tables

---

## Ownership Model

The target business model is:

- one `user` can own many `blocks`
- one `block` can have many mapped live sensor sources
- one `live_sensor_source` can produce many readings
- one `live_sensor_source` has one current latest snapshot

Recommended operational rule:

- one physical source should normally have one active physical assignment at a time
- one block may have one or more active sources
- one active mapping may be marked as `is_primary = true`

---

## Table Relationships

### 1. `users`

Main platform user table.

Relationship:

- `users.id` -> `blocks.user_id`
- `users.id` -> `live_sensor_block_mappings.user_id`

### 2. `blocks`

Represents the UI block/location shown in the dashboard.

Relationship:

- `blocks.id` -> `live_sensor_block_mappings.block_id`

Important note:

- Australian block names, geometry, coordinates, and metadata stay unchanged in the UI
- live Kerala device data is only mapped into these blocks at the backend layer

### 3. `live_sensor_sources`

Stores each physical external device/source exactly once.

Current key identity:

- `external_user_id`
- `serial_number`

Recommended uniqueness:

- unique(`external_user_id`, `serial_number`)

Purpose:

- canonical device/source master table
- source metadata and device lifecycle state

### 4. `live_sensor_block_mappings`

Junction table connecting blocks to live sensor sources.

Relationship:

- `block_id` -> `blocks.id`
- `source_id` -> `live_sensor_sources.id`
- `user_id` -> `users.id`

Purpose:

- assign device(s) to block(s)
- support multi-device blocks
- support primary/non-primary display rules

Recommended uniqueness:

- unique(`block_id`, `source_id`)

### 5. `live_sensor_source_readings`

Historical source-of-truth table for all ingested live API readings.

Relationship:

- `source_id` -> `live_sensor_sources.id`

Purpose:

- full history
- audit trail
- analytics/trend backfill
- future reporting/export

Recommended uniqueness:

- unique(`source_id`, `external_reading_id`)

### 6. `live_sensor_source_latest`

One latest snapshot per source for fast dashboard reads.

Relationship:

- `source_id` -> `live_sensor_sources.id`

Purpose:

- quick block overview rendering
- avoids repeated aggregate scans over history for every dashboard refresh

Important rule:

- this is a cache/snapshot table, not the canonical historical source

### 7. `live_sensor_sync_state`

Stores polling cursor state for the external API.

Purpose:

- track `last_id`
- prevent re-fetch gaps
- track poll status and last successful sync time

---

## Logical ER Flow

```text
users
  1 -> many blocks

blocks
  1 -> many live_sensor_block_mappings

live_sensor_sources
  1 -> many live_sensor_block_mappings
  1 -> many live_sensor_source_readings
  1 -> one  live_sensor_source_latest

live_sensor_block_mappings
  many -> 1 blocks
  many -> 1 live_sensor_sources
  many -> 1 users
```

---

## Ingestion Flow

### Step 1. Poll external API

Call:

- `GET https://thebiotaportal.in/get_device_readings.php?last_id={cursor}&limit={limit}`

### Step 2. Resolve source identity

For each API row:

- read `user_id`
- read `serial_number`
- find or create row in `live_sensor_sources`

### Step 3. Store full historical row

Insert or enrich one row in `live_sensor_source_readings` using:

- `external_reading_id`
- `source_id`
- approved dashboard fields
- remaining nutrient fields
- timestamps
- `raw_payload`

### Step 4. Update latest snapshot

Update `live_sensor_source_latest` only if the incoming reading is newer than the stored latest row for that source.

### Step 5. Persist cursor

Update `live_sensor_sync_state.last_id` to the newest successfully ingested external reading id.

---

## Display Flow

The frontend must continue to call the backend by block.

Frontend contract:

- `GET /api/blocks/{block_id}/sensors`

Backend steps:

1. resolve selected block
2. find active rows in `live_sensor_block_mappings`
3. collect mapped `source_id` values
4. read latest values from `live_sensor_source_latest`
5. aggregate according to configured display rule
6. return only approved UI metrics:
   - `soil_moisture`
   - `ph_level`
   - `ec`

The frontend must never call the Kerala API directly.

---

## Multi-Sensor Display Rules

When a block has more than one active source, choose one clear policy.

### Recommended production policy

- keep one `is_primary = true` source per block
- use primary source for the main dashboard card view
- allow a future advanced/history view to show all mapped sources

### Alternative policy

- aggregate all active source latest values by average

Use aggregation only if the devices are known to represent the same block zone and the business accepts averaged readings.

### Avoid

- arbitrary source selection
- using whichever row arrived last without mapping rules
- mixing readings across blocks

---

## Recommended Future Columns

To support robust production mapping, extend `live_sensor_block_mappings` with:

- `effective_from`
- `effective_to`
- `mapping_status`
- `aggregation_mode`
- `priority`
- `notes`
- `created_by`
- `updated_by`

Benefits:

- track reassignment history
- support temporary inactive mappings
- support explicit display/aggregation rules
- preserve historical auditability

Recommended constraints:

- at most one active primary mapping per block
- optionally at most one active block assignment per source, if device sharing is not allowed

---

## Recommended Admin Endpoints

Farmer dashboard endpoints:

- `GET /api/blocks/{block_id}/sensors`
- `GET /api/blocks/{block_id}/sensors/{sensor_type}/history`

Admin/configuration endpoints:

- `GET /api/blocks/{block_id}/sensor-mappings`
- `POST /api/blocks/{block_id}/sensor-mappings`
- `PATCH /api/sensor-mappings/{mapping_id}`
- `DELETE /api/sensor-mappings/{mapping_id}`
- `GET /api/sensor-sources`

Purpose:

- keep grower-facing UI simple
- isolate mapping management to admin tools

---

## Data Integrity Rules

These rules should be treated as non-negotiable for future work.

1. Never write external API rows into legacy sensor tables.
2. Never let frontend block metadata depend on external device geography.
3. Always store raw historical readings before calculating dashboard summaries.
4. Always map data to blocks on the backend.
5. Keep latest snapshot logic idempotent and timestamp-aware.
6. Preserve explicit mapping history whenever a source is reassigned.

---

## Recommended Future Migration Path

### Phase 1. Stable live ingestion

- keep current live tables
- keep dashboard limited to Moisture, pH, and EC
- store all API fields in history/latest tables

### Phase 2. Explicit mapping management

- add admin CRUD for source-to-block mappings
- remove dependence on fallback auto-mapping

### Phase 3. Historical assignment support

- add effective date ranges on mappings
- support accurate historical block reconstruction

### Phase 4. Advanced analytics

- per-source views
- block zone comparisons
- nutrient trend analytics
- anomaly detection

---

## Recommended Query Patterns

### Latest dashboard values for one block

Join:

- `blocks`
- `live_sensor_block_mappings`
- `live_sensor_source_latest`

### Historical trend for one block metric

Join:

- `live_sensor_block_mappings`
- `live_sensor_source_readings`

Filter:

- active mapped `source_id`s
- requested metric
- time window

### Mapping audit

Query:

- `live_sensor_block_mappings`
- `live_sensor_sources`
- optional future audit columns

---

## Current Implementation Notes

Current live-service code already follows the main shape above:

- source master table
- block mapping table
- historical readings table
- latest snapshot table
- cursor table

Current code references:

- backend models: `backend/app/db/models.py`
- bootstrap/schema support: `backend/app/db/bootstrap.py`
- live ingestion/service logic: `backend/app/services/live_sensor_service.py`
- block sensor API: `backend/app/api/sensors.py`

---

## Final Recommendation

For long-term correctness, the platform should standardize on this rule:

`User -> Block -> Block-to-Source Mapping -> Source -> Historical Readings + Latest Snapshot`

That is the cleanest structure for supporting:

- multiple users
- multiple blocks per user
- multiple sensors per block
- historical accuracy
- clean dashboard queries
- future admin tooling

It is the correct foundation for scaling live sensor integrations safely.
