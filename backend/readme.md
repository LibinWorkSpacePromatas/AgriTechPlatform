## Backend Satellite & AI Pipeline

This backend provides a cache-first, satellite-driven insights pipeline for agricultural blocks, integrated with AI-driven agronomic advice.

### Key Endpoints

#### 1. Water & Irrigation API
- **Endpoint**: `GET /api/water/{block_id}`
- **Purpose**: Returns simplified NDWI-based water stress classification and recommendations.
- **Logic**:
  - `NDWI > 0.1`: Well-watered
  - `-0.1 <= NDWI <= 0.1`: Mild Stress
  - `-0.3 <= NDWI < -0.1`: Moderate Stress
  - `NDWI < -0.3`: Severe Stress

#### 2. Grower GPT API
- **Endpoint**: `GET /api/gpt/{block_id}`
- **Purpose**: Generates AI insights using OpenRouter (LLM) based on the latest satellite indices.
- **Context Injected**: NDVI, NDWI, NDRE, EVI, LAI, and data quality metrics.

#### 3. General Chat Proxy
- **Endpoint**: `POST /api/gpt/chat`
- **Purpose**: Proxies user messages to OpenRouter with a system prompt and block context.

### Data Source: Satellite Cache

The system uses a PostgreSQL `satellite_cache` table as the primary source of truth for MVP data. Each record contains a `payload` JSON with the following indices:
- `ndvi`: Normalized Difference Vegetation Index (Health)
- `ndwi`: Normalized Difference Water Index (Moisture)
- `ndre`: Normalized Difference Red Edge (Nutrients)
- `evi`: Enhanced Vegetation Index (Canopy)
- `lai`: Leaf Area Index (Yield)

### What The Backend Does

- **Simplified Classification**: Implements a strict "Rule Engine" for water stress based on scientific NDWI thresholds.
- **LLM Integration**: Communicates with OpenRouter (using `sk-or-v1-...` API key) to provide natural language advice.
- **Database Management**: Uses SQLAlchemy to manage `Block`, `User`, and `SatelliteCache` models.
- **CORS Handling**: Configured to allow communication with the Angular frontend (`localhost:4200`).

### Environment Setup

Required `.env` variables in `backend/.env`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/agritech
OPENROUTER_API_KEY=sk-or-v1-...
```

### Operational Notes

- **Cache-First**: The API prefers `satellite_cache` data to ensure low latency.
- **UUID/LANSLU Support**: Endpoints support both internal database UUIDs and human-readable LANSLU identifiers.
- **Simplified Math**: All complex agronomical math (ET0, Kc) is handled by the "Satellite Truth" philosophy—interpreting direct leaf moisture from NDWI.
now added