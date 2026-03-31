# Profit & Risk Production Upgrade

## Schema
- SQL file: `db/profit_risk_schema.sql`
- Apply via ingestion script automatically.

## Ingestion
```bash
python scripts/ingest_profit_risk_datasets.py --full-refresh
```

## ML Dataset Prep
```bash
python scripts/prepare_profit_risk_ml_dataset.py --output data/ml/profit_risk_training.csv
```

## Recommended Backend Structure
- `db/profit_risk_schema.sql`
- `scripts/ingest_profit_risk_datasets.py`
- `scripts/prepare_profit_risk_ml_dataset.py`
- `app/services/profit_risk.py` (DB-driven margin engine)
- `app/api/profit_risk.py` (endpoint)
- `app/schemas/profit_risk.py` (response contracts)

## Data Flow
1. Multi-file datasets are ingested into normalized PostgreSQL tables.
2. Precomputed scenario matrix (low/current/high) is stored in `pr_margin_result`.
3. API computes block-specific selected-water margins from DB records.
4. Frontend visualizes dynamic chart scales from returned data.
