## Backend Satellite Pipeline

This backend now includes a cache-first, queue-backed Sentinel-2 insights pipeline for block polygons stored in PostGIS.

### Endpoint

- `GET /api/block/{block_id}/insights`
- `GET /block/{block_id}/insights`

Response shape:

```json
{
  "block_id": "uuid",
  "ndvi": 0.62,
  "ndwi": -0.12,
  "evi": 0.41,
  "ndre": 0.28,
  "lai": 3.8,
  "cloud_cover_pct": 12.0,
  "pixel_count": 320,
  "map_tile_url": null,
  "data_quality": "good",
  "composite_date_from": "2026-03-06",
  "composite_date_to": "2026-03-19",
  "status": "fresh",
  "latency_ms": 132,
  "source": "cache",
  "error": null
}
```

### What The Backend Does

- Uses `COPERNICUS/S2_SR_HARMONIZED` only
- Applies a 14-day rolling window
- Validates geometries, buffers inward by 10 meters, and simplifies polygons before querying GEE
- Builds a median composite in GEE
- Computes `NDVI`, `NDWI`, `EVI`, `NDRE`, and `LAI` in GEE
- Aggregates block-level mean values, cloud cover, and pixel counts
- Stores responses in `satellite_cache` with a 5-day TTL and indexed `last_updated`
- Records historical metrics in `satellite_timeseries` for future ML/time-series analysis
- Queues stale or missing refresh work in `satellite_refresh_jobs`
- Runs background workers that process queued refresh jobs asynchronously
- Schedules staggered batch refreshes every 5 days when GEE credentials are configured

### Cache And Queue Behavior

- Fresh cache returns immediately with `status: "fresh"` and `source: "cache"`
- Expired or missing cache never triggers a synchronous GEE call from the request path
- Stale cache returns immediately with `status: "stale"` while a background refresh job is queued
- Missing cache returns a placeholder with `status: "updating"` while the refresh worker computes data
- Per-block throttling prevents repeated request storms from queuing duplicate GEE work

### Data Quality And Errors

- `data_quality: "good"` means usable imagery and acceptable cloud conditions
- `data_quality: "degraded"` means cloud-heavy or sparse imagery reduced confidence
- `data_quality: "no_data"` means no usable pixels were available for the selected window
- `error` is populated for degraded/no-data scenarios or refresh failures so the UI can show a friendly fallback state

### Operational Notes

- Cache is the primary serving layer
- GEE is refresh-only for API traffic
- Worker logs include request latency, cache hits, GEE execution time, and queue activity
- Stuck jobs are automatically recovered back into the queue after the configured timeout
- The endpoint shape remains backward-compatible; existing metric fields are unchanged and new metadata fields are additive

### Environment Setup

Copy values from [`backend/.env.example`](c:\PromatasDev\AgriTech\backend\.env.example) into your local backend `.env`.

Required Earth Engine setup:

1. Create a Google Cloud service account that has access to the Earth Engine project.
2. Register that service account for Earth Engine use.
3. Put the full service-account JSON into `GEE_SERVICE_ACCOUNT_JSON`.
4. Set `GEE_PROJECT` to the Google Cloud project that Earth Engine should bill and execute against.

### Notes

- The frontend should consume the backend JSON only. It should never call GEE directly.
- Tile URL generation is optional and disabled by default because it is not part of the critical cache path.
- Satellite support tables are created automatically at app startup if they do not already exist.
