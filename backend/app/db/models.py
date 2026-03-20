from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from geoalchemy2 import Geometry

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID, primary_key=True)
    name = Column(String)
    region = Column(String)
    council = Column(String)
    farm_name = Column(String)
    farm_location = Column(String)
    primary_crop = Column(String)
    primary_soil = Column(String)


class Block(Base):
    __tablename__ = "blocks"

    id = Column(UUID, primary_key=True)
    user_id = Column(UUID, ForeignKey("users.id"))
    lanslu = Column(String)
    soil_subgroup = Column(String)
    soil_class = Column(String)
    description = Column(String)
    area_ha = Column(Float)
    crop = Column(String)
    geom = Column(Geometry("GEOMETRY", srid=4326))


class SatelliteCache(Base):
    __tablename__ = "satellite_cache"
    __table_args__ = (
        Index("ix_satellite_cache_last_updated", "last_updated"),
        Index("ix_satellite_cache_expires_at", "expires_at"),
    )

    block_id = Column(UUID(as_uuid=True), ForeignKey("blocks.id", ondelete="CASCADE"), primary_key=True)
    geometry_hash = Column(String(128), nullable=False)
    payload = Column(JSONB, nullable=False)
    data_quality = Column(String(32), nullable=False)
    composite_date_from = Column(Date, nullable=True)
    composite_date_to = Column(Date, nullable=True)
    pixel_count = Column(Integer, nullable=False, default=0)
    gee_execution_ms = Column(Integer, nullable=True)
    map_tile_url = Column(Text, nullable=True)
    last_updated = Column(DateTime(timezone=True), nullable=False)
    refreshed_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)


class SatelliteRefreshJob(Base):
    __tablename__ = "satellite_refresh_jobs"
    __table_args__ = (
        Index("ix_satellite_refresh_jobs_status_scheduled_for", "status", "scheduled_for"),
    )

    block_id = Column(UUID(as_uuid=True), ForeignKey("blocks.id", ondelete="CASCADE"), primary_key=True)
    status = Column(String(32), nullable=False, default="idle")
    reason = Column(String(64), nullable=False, default="scheduled")
    priority = Column(Integer, nullable=False, default=100)
    requested_at = Column(DateTime(timezone=True), nullable=False)
    scheduled_for = Column(DateTime(timezone=True), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    last_error = Column(Text, nullable=True)
    last_duration_ms = Column(Integer, nullable=True)


class SatelliteTimeseries(Base):
    __tablename__ = "satellite_timeseries"
    __table_args__ = (
        Index("ix_satellite_timeseries_block_observed_on", "block_id", "observed_on"),
        Index("ix_satellite_timeseries_block_recorded_at", "block_id", "recorded_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    block_id = Column(UUID(as_uuid=True), ForeignKey("blocks.id", ondelete="CASCADE"), nullable=False)
    observed_on = Column(Date, nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    composite_date_from = Column(Date, nullable=True)
    composite_date_to = Column(Date, nullable=True)
    geometry_hash = Column(String(128), nullable=False)
    ndvi = Column(Float, nullable=True)
    ndwi = Column(Float, nullable=True)
    evi = Column(Float, nullable=True)
    ndre = Column(Float, nullable=True)
    lai = Column(Float, nullable=True)
    cloud_cover_pct = Column(Float, nullable=True)
    pixel_count = Column(Integer, nullable=False, default=0)
    data_quality = Column(String(32), nullable=False)
