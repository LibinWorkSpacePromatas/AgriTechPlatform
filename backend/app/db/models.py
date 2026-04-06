from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
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
    role = Column(String, nullable=False, server_default=text("'farmer'"))


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


class SatelliteRefreshEventRecord(Base):
    __tablename__ = "satellite_refresh_events"
    __table_args__ = (
        Index("ix_satellite_refresh_events_block_id_id", "block_id", "id"),
        Index("ix_satellite_refresh_events_created_at", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    block_id = Column(UUID(as_uuid=True), ForeignKey("blocks.id", ondelete="CASCADE"), nullable=False)
    event = Column(String(32), nullable=False)
    reason = Column(String(64), nullable=False)
    data_quality = Column(String(32), nullable=True)
    error = Column(Text, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)


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


class AuctionProfile(Base):
    __tablename__ = "auction_profiles"
    __table_args__ = (
        Index("idx_auction_profiles_user", "user_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    abn = Column(String(11), nullable=False, unique=True)
    business_name = Column(Text, nullable=False)
    gst_registered = Column(Boolean, nullable=False)
    bsb = Column(String(6), nullable=False)
    account_number_encrypted = Column(Text, nullable=False)
    status = Column(Text, nullable=False, server_default=text("'active'"))
    created_at = Column(DateTime(timezone=False), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=False), nullable=False, server_default=text("now()"))


class Auction(Base):
    __tablename__ = "auctions"
    __table_args__ = (
        CheckConstraint("base_price > 0", name="ck_auctions_base_price_positive"),
        CheckConstraint("end_time > start_time", name="ck_auctions_end_after_start"),
        Index("idx_auctions_seller", "seller_id"),
        Index("idx_auctions_status", "status"),
        Index("idx_auctions_time", "start_time", "end_time"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    seller_id = Column(UUID(as_uuid=True), ForeignKey("auction_profiles.id"), nullable=False)
    produce_name = Column(Text, nullable=False)
    quantity = Column(Numeric, nullable=False)
    unit = Column(Text, nullable=False, server_default=text("'kg'"))
    base_price = Column(Numeric, nullable=False)
    status = Column(Text, nullable=False)
    start_time = Column(DateTime(timezone=False), nullable=False)
    end_time = Column(DateTime(timezone=False), nullable=False)
    winner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    final_price = Column(Numeric, nullable=True)
    image_url = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=False), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=False), nullable=False, server_default=text("now()"))


class AuctionBid(Base):
    __tablename__ = "auction_bids"
    __table_args__ = (
        CheckConstraint("bid_amount > 0", name="ck_auction_bids_bid_amount_positive"),
        Index("idx_bids_auction", "auction_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    auction_id = Column(UUID(as_uuid=True), ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False)
    bidder_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    bid_amount = Column(Numeric, nullable=False)
    created_at = Column(DateTime(timezone=False), nullable=False, server_default=text("now()"))
