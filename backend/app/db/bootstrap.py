from __future__ import annotations

from sqlalchemy import inspect, text

from app.db.base import Base
from app.db.database import engine
from app.db.models import SatelliteCache


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
    "refreshed_at",
    "expires_at",
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


def ensure_satellite_cache_table() -> None:
    _rebuild_satellite_cache_table_if_needed()
    Base.metadata.create_all(bind=engine, tables=[SatelliteCache.__table__])
