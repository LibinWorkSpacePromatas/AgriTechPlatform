## Backend Satellite Pipeline

This backend now includes a cache-first Sentinel-2 insights pipeline for block polygons stored in PostGIS.

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
  "composite_date_to": "2026-03-19"
}
```

### What The Backend Does

- Uses `COPERNICUS/S2_SR_HARMONIZED` only
- Applies a 14-day rolling window
- Filters scenes with `CLOUDY_PIXEL_PERCENTAGE < 20`
- Buffers block geometries inward by 12 meters before querying GEE
- Builds a median composite in GEE
- Computes `NDVI`, `NDWI`, `EVI`, `NDRE`, and `LAI` in GEE
- Aggregates block-level mean values and pixel counts
- Stores responses in `satellite_cache` with a 5-day TTL
- Runs a background refresh every 5 days when GEE credentials are configured

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
- The cache table is created automatically at app startup if it does not already exist.
