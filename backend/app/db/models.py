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
    refreshed_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
