from __future__ import annotations

import csv
from pathlib import Path

from sqlalchemy import inspect, text

from app.db.base import Base
from app.db.database import engine
from app.db.models import (
    Auction,
    AuctionBid,
    AuctionProfile,
    BlockDecision,
    GrowingOpportunityNewsCache,
    SatelliteCache,
    SatelliteRefreshEventRecord,
    SatelliteRefreshJob,
    SatelliteTimeseries,
    SensorDefinition,
    SensorLatest,
    SensorReading,
)


EXPECTED_SATELLITE_CACHE_COLUMNS = {
    "block_id",
    "geometry_hash",
    "payload",
    "data_quality",
    "composite_date_from",
    "composite_date_to",
    "pixel_count",
    "gee_execution_ms",
    "map_tile_url",
    "last_updated",
    "refreshed_at",
    "expires_at",
}

EXPECTED_SATELLITE_TIMESERIES_COLUMNS = {
    "id",
    "block_id",
    "observed_on",
    "recorded_at",
    "composite_date_from",
    "composite_date_to",
    "geometry_hash",
    "ndvi",
    "ndwi",
    "evi",
    "ndre",
    "lai",
    "cloud_cover_pct",
    "pixel_count",
    "data_quality",
}


def _rebuild_satellite_cache_table_if_needed() -> None:
    inspector = inspect(engine)

    if not inspector.has_table(SatelliteCache.__tablename__):
        return

    existing_columns = {column["name"] for column in inspector.get_columns(SatelliteCache.__tablename__)}
    if EXPECTED_SATELLITE_CACHE_COLUMNS.issubset(existing_columns):
        return

    # satellite_cache is disposable cache state, so rebuilding it is safe when schema drifts
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE IF EXISTS satellite_cache"))


def _ensure_satellite_timeseries_schema() -> None:
    inspector = inspect(engine)

    if not inspector.has_table(SatelliteTimeseries.__tablename__):
        return

    existing_columns = {column["name"] for column in inspector.get_columns(SatelliteTimeseries.__tablename__)}
    missing_columns = EXPECTED_SATELLITE_TIMESERIES_COLUMNS.difference(existing_columns)

    with engine.begin() as connection:
        if "recorded_at" in missing_columns:
            connection.execute(
                text(
                    """
                    ALTER TABLE satellite_timeseries
                    ADD COLUMN recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    """
                )
            )

        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_satellite_timeseries_block_recorded_at
                ON satellite_timeseries (block_id, recorded_at)
                """
            )
        )


def ensure_blocks_timezone_column() -> None:
    with engine.begin() as connection:
        # Check if timezone column exists in blocks table
        inspector = inspect(engine)
        columns = [col["name"] for col in inspector.get_columns("blocks")]
        if "timezone" not in columns:
            connection.execute(
                text(
                    """
                    ALTER TABLE blocks 
                    ADD COLUMN timezone TEXT DEFAULT 'Australia/Sydney';
                    """
                )
            )
            # Also update existing rows to the default
            connection.execute(
                text("UPDATE blocks SET timezone = 'Australia/Sydney' WHERE timezone IS NULL")
            )


def ensure_satellite_support_tables() -> None:
    _rebuild_satellite_cache_table_if_needed()
    ensure_user_auth_columns()
    Base.metadata.create_all(
        bind=engine,
        tables=[
            BlockDecision.__table__,
            GrowingOpportunityNewsCache.__table__,
            SatelliteCache.__table__,
            SatelliteRefreshJob.__table__,
            SatelliteRefreshEventRecord.__table__,
            SatelliteTimeseries.__table__,
        ],
    )
    ensure_equipment_marketplace_tables()
    _ensure_satellite_timeseries_schema()
    ensure_blocks_timezone_column()
    _ensure_sensor_support_tables()
    ensure_crop_config_table()
    ensure_soil_class_config_table()
    ensure_soil_reference_table()
    ensure_unified_farm_state_view()
    ensure_weather_timeseries_tables()


def ensure_equipment_marketplace_tables() -> None:
    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS equipment_listings (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    block_id UUID REFERENCES blocks(id) ON DELETE SET NULL,
                    equipment_name TEXT NOT NULL,
                    description TEXT,
                    specifications JSONB,
                    availability_settings JSONB,
                    price DOUBLE PRECISION NOT NULL,
                    price_type VARCHAR(10) NOT NULL CHECK (price_type IN ('hourly', 'daily')),
                    quantity_total INTEGER NOT NULL DEFAULT 1,
                    image_url TEXT,
                    image_public_id TEXT,
                    latitude DOUBLE PRECISION,
                    longitude DOUBLE PRECISION,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE equipment_listings
                ADD COLUMN IF NOT EXISTS specifications JSONB
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE equipment_listings
                ADD COLUMN IF NOT EXISTS availability_settings JSONB
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE equipment_listings
                ADD COLUMN IF NOT EXISTS image_url TEXT
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE equipment_listings
                ADD COLUMN IF NOT EXISTS image_public_id TEXT
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS equipment_bookings (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    listing_id UUID NOT NULL REFERENCES equipment_listings(id) ON DELETE CASCADE,
                    renter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    start_datetime TIMESTAMPTZ NOT NULL,
                    end_datetime TIMESTAMPTZ NOT NULL,
                    quantity_requested INTEGER NOT NULL DEFAULT 1,
                    status VARCHAR(20) NOT NULL CHECK (
                        status IN ('pending', 'approved', 'rejected', 'completed')
                    ),
                    total_price DOUBLE PRECISION,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT ck_equipment_bookings_time_range CHECK (end_datetime > start_datetime)
                )
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE equipment_listings
                ADD COLUMN IF NOT EXISTS quantity_total INTEGER NOT NULL DEFAULT 1
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE equipment_bookings
                ADD COLUMN IF NOT EXISTS quantity_requested INTEGER NOT NULL DEFAULT 1
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS equipment_payments (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    booking_id UUID NOT NULL REFERENCES equipment_bookings(id) ON DELETE CASCADE,
                    amount DOUBLE PRECISION NOT NULL,
                    status VARCHAR(20) DEFAULT 'pending' CHECK (
                        status IN ('pending', 'paid')
                    ),
                    created_at TIMESTAMPTZ DEFAULT now()
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_equipment_listings_owner_id
                ON equipment_listings (owner_id)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_equipment_listings_block_id
                ON equipment_listings (block_id)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_equipment_bookings_listing_status_time
                ON equipment_bookings (listing_id, status, start_datetime, end_datetime)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_equipment_bookings_renter_id
                ON equipment_bookings (renter_id)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_equipment_bookings_owner_id
                ON equipment_bookings (owner_id)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_equipment_payments_booking_id
                ON equipment_payments (booking_id)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE OR REPLACE FUNCTION equipment_booking_conflict_exists(
                    p_listing_id UUID,
                    p_start TIMESTAMPTZ,
                    p_end TIMESTAMPTZ
                )
                RETURNS BOOLEAN
                LANGUAGE sql
                STABLE
                AS $$
                    SELECT EXISTS (
                        SELECT 1
                        FROM equipment_bookings
                        WHERE listing_id = p_listing_id
                          AND status IN ('pending', 'approved')
                          AND (
                              p_start < (end_datetime + interval '1 hour')
                              AND p_end > start_datetime
                          )
                        LIMIT 1
                    );
                $$;
                """
            )
        )


def ensure_crop_config_table() -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS crop_config (
                    crop TEXT PRIMARY KEY,
                    optimal_moisture_min DOUBLE PRECISION,
                    optimal_moisture_max DOUBLE PRECISION,
                    root_depth_mm INTEGER,
                    mad DOUBLE PRECISION
                );
                """
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO crop_config (crop, optimal_moisture_min, optimal_moisture_max, root_depth_mm, mad)
                VALUES
                ('Almond', 25, 45, 1000, 0.45),
                ('Citrus', 30, 50, 900, 0.5),
                ('Olive', 20, 40, 1200, 0.6),
                ('Avocado', 35, 55, 800, 0.4),
                ('Wheat', 18, 28, 600, 0.5),
                ('Maize', 30, 50, 700, 0.55),
                ('Rice', 40, 70, 300, 0.2),
                ('Barley', 18, 30, 600, 0.5),
                ('Shiraz', 20, 40, 800, 0.5),
                ('Grenache', 20, 40, 800, 0.5),
                ('Cabernet Sauvignon', 20, 40, 800, 0.5),
                ('Merlot', 20, 40, 800, 0.5),
                ('Chardonnay', 20, 40, 800, 0.5),
                ('Pinot Grigio', 20, 40, 800, 0.5),
                ('Riesling', 20, 40, 800, 0.5),
                ('Semillon', 20, 40, 800, 0.5),
                ('Tomato', 35, 60, 500, 0.4),
                ('Potato', 30, 55, 400, 0.35),
                ('Onion', 30, 50, 300, 0.35),
                ('Carrot', 25, 45, 300, 0.4),
                ('Cotton', 25, 45, 1000, 0.55),
                ('Sugarcane', 40, 70, 1200, 0.6),
                ('Soybean', 25, 45, 600, 0.5),
                ('Sunflower', 20, 40, 800, 0.5)
                ON CONFLICT (crop) DO UPDATE SET
                    optimal_moisture_min = EXCLUDED.optimal_moisture_min,
                    optimal_moisture_max = EXCLUDED.optimal_moisture_max,
                    root_depth_mm = EXCLUDED.root_depth_mm,
                    mad = EXCLUDED.mad;
                """
            )
        )


def ensure_soil_class_config_table() -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS soil_class_config (
                    code TEXT PRIMARY KEY,
                    series TEXT NOT NULL,
                    label TEXT NOT NULL,
                    irrigation_factor FLOAT NOT NULL,
                    field_capacity FLOAT NOT NULL,
                    wilting_point FLOAT NOT NULL,
                    drainage_class TEXT NOT NULL,
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
                """
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO soil_class_config
                    (code, series, label, irrigation_factor, field_capacity, wilting_point, drainage_class, notes)
                VALUES
                ('A1','A','Rudosol - raw deep sand',1.35,0.13,0.05,'FAST','Almost no water retention'),
                ('A2','A','Tenosol - shallow sandy',1.30,0.15,0.06,'FAST','Leaches quickly'),
                ('A3','A','Calcareous loam',1.25,0.20,0.08,'FAST',NULL),
                ('A4','A','Red-brown earth',1.25,0.21,0.09,'FAST',NULL),
                ('A5','A','Sandy clay loam',1.18,0.23,0.10,'MODERATE',NULL),
                ('A6','A','Gradational loam',1.10,0.24,0.11,'MODERATE','Common in Riverland vineyards'),
                ('A7','A','Loamy gradational',1.05,0.25,0.12,'MODERATE',NULL),
                ('A8','A','Fine loam',1.00,0.26,0.12,'MODERATE',NULL),
                ('B1','B','Chromosol - light loam',1.08,0.25,0.11,'MODERATE',NULL),
                ('B2','B','Texture contrast loam',1.05,0.26,0.12,'MODERATE',NULL),
                ('B3','B','Dermosol - structured loam',1.02,0.27,0.13,'MODERATE',NULL),
                ('B5','B','Red dermosol',1.00,0.28,0.13,'MODERATE',NULL),
                ('B6','B','Brown chromosol',0.98,0.29,0.14,'MODERATE',NULL),
                ('B7','B','Yellow chromosol',0.96,0.29,0.14,'MODERATE',NULL),
                ('B8','B','Grey chromosol',0.94,0.30,0.15,'SLOW',NULL),
                ('C1','C','Cracking clay - Vertosol',0.95,0.30,0.14,'SLOW','Shrink/swell clay'),
                ('C2','C','Red Vertosol',0.88,0.34,0.17,'SLOW',NULL),
                ('C3','C','Brown Vertosol',0.85,0.36,0.18,'SLOW',NULL),
                ('C4','C','Grey Vertosol',0.80,0.38,0.19,'SLOW',NULL),
                ('C5','C','Black Vertosol',0.75,0.42,0.22,'VERY_SLOW','Very high retention'),
                ('D1','D','Calcarosol - calcareous clay loam',1.00,0.27,0.13,'MODERATE',NULL),
                ('D2','D','Sodosol - light sodic',0.95,0.29,0.14,'SLOW','Salt risk'),
                ('D3','D','Clay loam',0.90,0.31,0.15,'SLOW',NULL),
                ('D4','D','Heavy clay',0.85,0.33,0.16,'SLOW',NULL),
                ('D5','D','Sodic clay loam',0.83,0.34,0.17,'SLOW','Salt risk'),
                ('D6','D','Sodic clay',0.80,0.36,0.18,'VERY_SLOW','Salt risk'),
                ('D7','D','Heavy sodic clay',0.78,0.38,0.19,'VERY_SLOW','Salt risk - monitor EC'),
                ('E1','E','Bleached sandy duplex',1.10,0.22,0.10,'FAST',NULL),
                ('E3','E','Duplex sandy loam',1.05,0.24,0.11,'MODERATE',NULL),
                ('F1','F','Red ferrosol - structured clay',1.00,0.30,0.14,'MODERATE','Good structure despite clay'),
                ('F2','F','Yellow ferrosol',0.95,0.32,0.16,'SLOW',NULL),
                ('G1','G','Grey sandy loam',1.05,0.25,0.11,'MODERATE',NULL),
                ('G2','G','Brown sandy loam',1.02,0.26,0.12,'MODERATE',NULL),
                ('G3','G','Grey loam - Riverland typical',0.98,0.27,0.13,'MODERATE',NULL),
                ('G4','G','Brown clay loam',0.95,0.28,0.14,'SLOW',NULL),
                ('H1','H','Shallow calcareous sand',1.15,0.19,0.08,'FAST',NULL),
                ('H2','H','Calcareous sandy loam',1.10,0.21,0.09,'FAST','1,467 rows in Riverland'),
                ('H3','H','Deep calcareous loam',1.05,0.23,0.10,'MODERATE','MOST COMMON - 1,973 rows'),
                ('J2','J','Hydrosol - wet/swampy',0.70,0.45,0.25,'VERY_SLOW','Not suitable for irrigation'),
                ('K1','K','Kurosol - acidic loam',1.02,0.26,0.12,'MODERATE','Monitor pH'),
                ('K2','K','Acidic clay loam',0.98,0.28,0.13,'SLOW',NULL),
                ('K3','K','Acidic clay',0.95,0.30,0.14,'SLOW',NULL),
                ('K4','K','Heavy acidic clay',0.92,0.31,0.15,'SLOW',NULL),
                ('K5','K','Very heavy acidic clay',0.88,0.33,0.16,'VERY_SLOW',NULL),
                ('L1','L','Leptic - shallow over rock',1.20,0.16,0.07,'FAST','Very low water holding capacity'),
                ('M1','M','Modified soil - general',1.00,0.25,0.11,'MODERATE',NULL),
                ('M2','M','Modified sandy soil',1.05,0.23,0.10,'FAST',NULL),
                ('M3','M','Modified clay loam',0.95,0.28,0.13,'SLOW',NULL),
                ('M4','M','Modified clay',0.90,0.30,0.14,'SLOW',NULL),
                ('N2','N','Red kandosol - low activity clay',1.08,0.24,0.10,'MODERATE',NULL),
                ('N3','N','Yellow kandosol',1.05,0.25,0.11,'MODERATE',NULL),
                ('RR','R','Rock/Outcrop',1.00,0.20,0.08,'FAST','Minimal soil - not irrigable'),
                ('WW','W','Water body',0.60,0.50,0.30,'VERY_SLOW','Not irrigable'),
                ('XX','X','Unclassified',1.00,0.25,0.12,'MODERATE','Unknown soil type')
                ON CONFLICT (code) DO UPDATE SET
                    label = EXCLUDED.label,
                    irrigation_factor = EXCLUDED.irrigation_factor,
                    field_capacity = EXCLUDED.field_capacity,
                    wilting_point = EXCLUDED.wilting_point,
                    drainage_class = EXCLUDED.drainage_class,
                    notes = EXCLUDED.notes
                """
            )
        )


def ensure_soil_reference_table() -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS soil_reference (
                    id SERIAL PRIMARY KEY,
                    region TEXT NOT NULL,
                    lanslu TEXT NOT NULL UNIQUE,
                    soil_subgroup TEXT,
                    shape_area FLOAT,
                    shape_length FLOAT,
                    primary_soil_classification TEXT,
                    primary_soil_value INTEGER,
                    secondary_soil_classification TEXT,
                    secondary_soil_value INTEGER,
                    tertiary_soil_classification TEXT,
                    tertiary_soil_value INTEGER,
                    total_soil_classifications_count INTEGER,
                    total_soil_classification_value INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_soil_reference_lanslu
                ON soil_reference (lanslu)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_soil_reference_region
                ON soil_reference (region)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_soil_reference_subgroup
                ON soil_reference (soil_subgroup)
                """
            )
        )
    _seed_soil_reference_from_csv()


def _seed_soil_reference_from_csv() -> None:
    csv_path = Path(__file__).resolve().parents[2] / "data" / "AK_Riverland_Regions_Soil_Subgroup_Compressed(in).csv"
    if not csv_path.exists():
        return

    def _to_text(value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned or cleaned.lower() == "none":
            return None
        return cleaned

    def _to_float(value: str | None) -> float | None:
        parsed = _to_text(value)
        if parsed is None:
            return None
        try:
            return float(parsed)
        except ValueError:
            return None

    def _to_int(value: str | None) -> int | None:
        parsed = _to_text(value)
        if parsed is None:
            return None
        try:
            return int(round(float(parsed)))
        except ValueError:
            return None

    rows: list[dict[str, object | None]] = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for source_row in reader:
            lanslu = _to_text(source_row.get("LANSLU"))
            region = _to_text(source_row.get("Region"))
            if lanslu is None or region is None:
                continue
            rows.append(
                {
                    "region": region,
                    "lanslu": lanslu,
                    "soil_subgroup": _to_text(source_row.get("Soil_Subgroup")),
                    "shape_area": _to_float(source_row.get("Shape_Area")),
                    "shape_length": _to_float(source_row.get("Shape_Length")),
                    "primary_soil_classification": _to_text(source_row.get("Primary_Soil_Classification")),
                    "primary_soil_value": _to_int(source_row.get("Primary_Soil_Value")),
                    "secondary_soil_classification": _to_text(source_row.get("Secondary_Soil_Classification")),
                    "secondary_soil_value": _to_int(source_row.get("Secondary_Soil_Value")),
                    "tertiary_soil_classification": _to_text(source_row.get("Tertiary_Soil_Classification")),
                    "tertiary_soil_value": _to_int(source_row.get("Tertiary_Soil_Value")),
                    "total_soil_classifications_count": _to_int(source_row.get("Total_Soil_Classifications_Count")),
                    "total_soil_classification_value": _to_int(source_row.get("Total_Soil_Classification_Value")),
                }
            )

    if not rows:
        return

    statement = text(
        """
        INSERT INTO soil_reference (
            region,
            lanslu,
            soil_subgroup,
            shape_area,
            shape_length,
            primary_soil_classification,
            primary_soil_value,
            secondary_soil_classification,
            secondary_soil_value,
            tertiary_soil_classification,
            tertiary_soil_value,
            total_soil_classifications_count,
            total_soil_classification_value
        )
        VALUES (
            :region,
            :lanslu,
            :soil_subgroup,
            :shape_area,
            :shape_length,
            :primary_soil_classification,
            :primary_soil_value,
            :secondary_soil_classification,
            :secondary_soil_value,
            :tertiary_soil_classification,
            :tertiary_soil_value,
            :total_soil_classifications_count,
            :total_soil_classification_value
        )
        ON CONFLICT (lanslu) DO UPDATE
        SET
            region = EXCLUDED.region,
            soil_subgroup = EXCLUDED.soil_subgroup,
            shape_area = EXCLUDED.shape_area,
            shape_length = EXCLUDED.shape_length,
            primary_soil_classification = EXCLUDED.primary_soil_classification,
            primary_soil_value = EXCLUDED.primary_soil_value,
            secondary_soil_classification = EXCLUDED.secondary_soil_classification,
            secondary_soil_value = EXCLUDED.secondary_soil_value,
            tertiary_soil_classification = EXCLUDED.tertiary_soil_classification,
            tertiary_soil_value = EXCLUDED.tertiary_soil_value,
            total_soil_classifications_count = EXCLUDED.total_soil_classifications_count,
            total_soil_classification_value = EXCLUDED.total_soil_classification_value
        """
    )

    batch_size = 1000
    with engine.begin() as connection:
        for index in range(0, len(rows), batch_size):
            connection.execute(statement, rows[index:index + batch_size])


def ensure_unified_farm_state_view() -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                DROP VIEW IF EXISTS unified_farm_state
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE VIEW unified_farm_state AS
                SELECT
                    b.id AS block_id,
                    MAX(CASE WHEN sd.sensor_type = 'soil_moisture' THEN sl.value END) AS soil_moisture,
                    MAX(CASE WHEN sd.sensor_type = 'soil_temperature' THEN sl.value END) AS soil_temperature,
                    MAX(CASE WHEN sd.sensor_type = 'humidity' THEN sl.value END) AS humidity,
                    MAX(CASE WHEN sd.sensor_type = 'ph_level' THEN sl.value END) AS ph_level,
                    MAX(CASE WHEN sd.sensor_type = 'sunlight' THEN sl.value END) AS sunlight,
                    MAX(CASE WHEN sd.sensor_type = 'fertility' THEN sl.value END) AS fertility,
                    (sc.payload->>'ndvi')::float AS ndvi,
                    (sc.payload->>'ndwi')::float AS ndwi,
                    (sc.payload->>'evi')::float AS evi,
                    (sc.payload->>'lai')::float AS lai,
                    sc.data_quality,
                    sc.composite_date_to
                FROM blocks b
                LEFT JOIN sensor_definitions sd ON sd.block_id = b.id
                LEFT JOIN sensor_latest sl ON sl.sensor_id = sd.id
                LEFT JOIN satellite_cache sc ON sc.block_id = b.id
                GROUP BY b.id, sc.payload, sc.data_quality, sc.composite_date_to
                """
            )
        )


def ensure_weather_timeseries_tables() -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS weather_timeseries (
                    id SERIAL PRIMARY KEY,
                    block_id UUID NOT NULL,
                    observed_at TIMESTAMPTZ NOT NULL,
                    temperature DOUBLE PRECISION,
                    humidity DOUBLE PRECISION,
                    precipitation DOUBLE PRECISION,
                    source VARCHAR(32) DEFAULT 'open-meteo',
                    created_at TIMESTAMPTZ DEFAULT now(),
                    FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE
                )
                """
            )
        )
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'uq_weather'
                    ) THEN
                        ALTER TABLE weather_timeseries
                        ADD CONSTRAINT uq_weather UNIQUE (block_id, observed_at);
                    END IF;
                END
                $$;
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_weather_block_time
                ON weather_timeseries (block_id, observed_at DESC)
                """
            )
        )


def _ensure_sensor_support_tables() -> None:
    Base.metadata.create_all(
        bind=engine,
        tables=[
            SensorDefinition.__table__,
            SensorReading.__table__,
            SensorLatest.__table__,
        ],
    )

    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE OR REPLACE FUNCTION fn_update_sensor_latest()
                RETURNS TRIGGER
                LANGUAGE plpgsql
                AS $$
                BEGIN
                    INSERT INTO sensor_latest (sensor_id, value, status, observed_at, updated_at)
                    VALUES (NEW.sensor_id, NEW.value, NEW.status, NEW.observed_at, NOW())
                    ON CONFLICT (sensor_id) DO UPDATE
                    SET
                        value = EXCLUDED.value,
                        status = EXCLUDED.status,
                        observed_at = EXCLUDED.observed_at,
                        updated_at = NOW()
                    WHERE EXCLUDED.observed_at >= sensor_latest.observed_at;

                    RETURN NEW;
                END;
                $$;
                """
            )
        )
        connection.execute(
            text(
                """
                DROP TRIGGER IF EXISTS trg_sensor_latest ON sensor_readings
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TRIGGER trg_sensor_latest
                AFTER INSERT ON sensor_readings
                FOR EACH ROW
                EXECUTE FUNCTION fn_update_sensor_latest()
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_sensor_definitions_block_id
                ON sensor_definitions (block_id)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_sensor_definitions_user_id
                ON sensor_definitions (user_id)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_sensor_readings_sensor_granularity_observed
                ON sensor_readings (sensor_id, granularity, observed_at DESC)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_sensor_readings_raw_recent
                ON sensor_readings (sensor_id, observed_at DESC)
                WHERE granularity = 'raw'
                """
            )
        )
        connection.execute(
            text(
                """
                DELETE FROM sensor_definitions
                WHERE sensor_type = 'air_temperature'
                """
            )
        )
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.table_constraints
                        WHERE constraint_name = 'ck_sensor_definitions_sensor_type'
                          AND table_name = 'sensor_definitions'
                    ) THEN
                        ALTER TABLE sensor_definitions DROP CONSTRAINT ck_sensor_definitions_sensor_type;
                    END IF;
                END
                $$;
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE sensor_definitions
                ADD CONSTRAINT ck_sensor_definitions_sensor_type
                CHECK (sensor_type IN ('soil_moisture', 'soil_temperature', 'humidity', 'ph_level', 'sunlight', 'fertility'))
                """
            )
        )


def ensure_satellite_cache_table() -> None:
    ensure_satellite_support_tables()


def ensure_auction_tables() -> None:
    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))

    Base.metadata.create_all(
        bind=engine,
        tables=[
            AuctionProfile.__table__,
            Auction.__table__,
            AuctionBid.__table__,
        ],
    )

    with engine.begin() as connection:
        connection.execute(text("DROP INDEX IF EXISTS idx_bids_amount"))
        connection.execute(
            text(
                """
                CREATE INDEX idx_bids_amount
                ON auction_bids (auction_id, bid_amount DESC)
                """
            )
        )

    _ensure_user_role_column()
    _seed_bidder_user()


def _ensure_user_role_column() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return
    existing_columns = {col["name"] for col in inspector.get_columns("users")}
    if "role" not in existing_columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'farmer'")
            )


def ensure_user_auth_columns() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return

    existing_columns = {col["name"] for col in inspector.get_columns("users")}

    with engine.begin() as connection:
        if "email" not in existing_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN email TEXT"))

        if "password_hash" not in existing_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN password_hash TEXT"))

        connection.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email
                ON users (email)
                WHERE email IS NOT NULL
                """
            )
        )


def _seed_bidder_user() -> None:
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        result = db.execute(
            text("SELECT id FROM users WHERE role = 'bidder' LIMIT 1")
        ).fetchone()
        if result:
            return
        db.execute(
            text(
                """
                INSERT INTO users (id, name, region, council, farm_name, farm_location, primary_crop, primary_soil, role)
                VALUES (
                    gen_random_uuid(),
                    'Alex Buyer',
                    'South Australia',
                    'Adelaide Hills Council',
                    'N/A',
                    'Adelaide, SA',
                    'N/A',
                    'N/A',
                    'bidder'
                )
                """
            )
        )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
