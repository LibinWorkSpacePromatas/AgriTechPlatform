from __future__ import annotations

from sqlalchemy import inspect, text

from app.db.base import Base
from app.db.database import engine
from app.db.models import (
    Auction,
    AuctionBid,
    AuctionProfile,
    SatelliteCache,
    SatelliteRefreshEventRecord,
    SatelliteRefreshJob,
    SatelliteTimeseries,
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
    """Add role column to users table if it doesn't exist."""
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return
    existing_columns = {col["name"] for col in inspector.get_columns("users")}
    if "role" not in existing_columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'farmer'")
            )


def _seed_bidder_user() -> None:
    """Insert a sample bidder user if none exists."""
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
