from __future__ import annotations

from sqlalchemy import inspect, text

from app.db.base import Base
from app.db.database import engine
from app.db.models import (
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


def ensure_satellite_support_tables() -> None:
    _rebuild_satellite_cache_table_if_needed()
    Base.metadata.create_all(
        bind=engine,
        tables=[
            SatelliteCache.__table__,
            SatelliteRefreshJob.__table__,
            SatelliteRefreshEventRecord.__table__,
            SatelliteTimeseries.__table__,
        ],
    )
    _ensure_satellite_timeseries_schema()
    _ensure_sensor_support_tables()
    ensure_unified_farm_state_view()
    ensure_weather_timeseries_tables()


def ensure_unified_farm_state_view() -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE OR REPLACE VIEW unified_farm_state AS
                SELECT
                    b.id AS block_id,
                    MAX(CASE WHEN sd.sensor_type = 'soil_moisture' THEN sl.value END) AS soil_moisture,
                    MAX(CASE WHEN sd.sensor_type = 'soil_temperature' THEN sl.value END) AS soil_temperature,
                    MAX(CASE WHEN sd.sensor_type = 'air_temperature' THEN sl.value END) AS air_temperature,
                    MAX(CASE WHEN sd.sensor_type = 'humidity' THEN sl.value END) AS humidity,
                    MAX(CASE WHEN sd.sensor_type = 'ph_level' THEN sl.value END) AS ph_level,
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


def ensure_satellite_cache_table() -> None:
    ensure_satellite_support_tables()
