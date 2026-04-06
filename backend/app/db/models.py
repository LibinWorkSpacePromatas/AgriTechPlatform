from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.sql import func
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
    timezone = Column(String, nullable=False, default="Australia/Sydney", server_default=text("'Australia/Sydney'"))
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


class SensorDefinition(Base):
    __tablename__ = "sensor_definitions"
    __table_args__ = (
        CheckConstraint(
            "sensor_type IN ('soil_moisture', 'soil_temperature', 'air_temperature', 'humidity', 'ph_level')",
            name="ck_sensor_definitions_sensor_type",
        ),
        UniqueConstraint("block_id", "sensor_type", name="uq_sensor_definitions_block_sensor_type"),
        Index("ix_sensor_definitions_block_id", "block_id"),
        Index("ix_sensor_definitions_user_id", "user_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    block_id = Column(UUID(as_uuid=True), ForeignKey("blocks.id", ondelete="CASCADE"), nullable=False)
    sensor_type = Column(String(64), nullable=False)
    label = Column(String(128), nullable=False)
    unit = Column(String(16), nullable=False)
    threshold_low = Column(Float, nullable=True)
    threshold_high = Column(Float, nullable=True)
    suggested_min = Column(Float, nullable=True)
    suggested_max = Column(Float, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        onupdate=func.now(),
        server_default=func.now(),
    )


class SensorReading(Base):
    __tablename__ = "sensor_readings"
    __table_args__ = (
        CheckConstraint("status IN ('Normal', 'High', 'Low')", name="ck_sensor_readings_status"),
        CheckConstraint("granularity IN ('raw', 'hourly', 'daily', 'weekly')", name="ck_sensor_readings_granularity"),
        Index("ix_sensor_readings_sensor_granularity_observed", "sensor_id", "granularity", "observed_at"),
        Index(
            "ix_sensor_readings_raw_recent",
            "sensor_id",
            "observed_at",
            postgresql_where=text("granularity = 'raw'"),
        ),
    )

    id = Column(BigInteger, Identity(always=True), primary_key=True)
    sensor_id = Column(UUID(as_uuid=True), ForeignKey("sensor_definitions.id", ondelete="CASCADE"), nullable=False)
    value = Column(Float, nullable=False)
    status = Column(String(16), nullable=False, default="Normal", server_default=text("'Normal'"))
    granularity = Column(String(16), nullable=False, default="raw", server_default=text("'raw'"))
    observed_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    recorded_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())


class SensorLatest(Base):
    __tablename__ = "sensor_latest"

    sensor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sensor_definitions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    value = Column(Float, nullable=False)
    status = Column(String(16), nullable=False, default="Normal", server_default=text("'Normal'"))
    observed_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())


class LiveSensorDescription(Base):
    __tablename__ = "live_sensor_descriptions"
    __table_args__ = (
        UniqueConstraint("block_id", name="uq_live_sensor_descriptions_block_id"),
        Index("ix_live_sensor_descriptions_block_id", "block_id"),
        Index("ix_live_sensor_descriptions_user_id", "user_id"),
        Index("ix_live_sensor_descriptions_serial_number", "serial_number"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    block_id = Column(UUID(as_uuid=True), ForeignKey("blocks.id", ondelete="CASCADE"), nullable=False)
    external_user_id = Column(Integer, nullable=True)
    serial_number = Column(String(100), nullable=True)
    label = Column(String(128), nullable=False)
    source_region = Column(String(64), nullable=False, default="Kerala", server_default=text("'Kerala'"))
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        onupdate=func.now(),
        server_default=func.now(),
    )


class LiveSensorReading(Base):
    __tablename__ = "live_sensor_readings"
    __table_args__ = (
        UniqueConstraint(
            "description_id",
            "external_reading_id",
            name="uq_live_sensor_readings_description_external_id",
        ),
        Index("ix_live_sensor_readings_description_recorded_at", "description_id", "recorded_at"),
        Index("ix_live_sensor_readings_serial_recorded_at", "serial_number", "recorded_at"),
    )

    id = Column(BigInteger, Identity(always=True), primary_key=True)
    description_id = Column(
        UUID(as_uuid=True),
        ForeignKey("live_sensor_descriptions.id", ondelete="CASCADE"),
        nullable=False,
    )
    external_reading_id = Column(BigInteger, nullable=False)
    external_user_id = Column(Integer, nullable=False)
    serial_number = Column(String(100), nullable=False)
    soil_moisture = Column(Float, nullable=True)
    ec = Column(Float, nullable=True)
    ph_level = Column(Float, nullable=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    source_created_at = Column(DateTime(timezone=True), nullable=True)
    fetched_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())


class LiveSensorLatest(Base):
    __tablename__ = "live_sensor_latest"

    description_id = Column(
        UUID(as_uuid=True),
        ForeignKey("live_sensor_descriptions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    external_reading_id = Column(BigInteger, nullable=False)
    soil_moisture = Column(Float, nullable=True)
    ec = Column(Float, nullable=True)
    ph_level = Column(Float, nullable=True)
    observed_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())


class LiveSensorSyncState(Base):
    __tablename__ = "live_sensor_sync_state"

    cursor_key = Column(String(64), primary_key=True)
    last_id = Column(BigInteger, nullable=False, default=0, server_default=text("0"))
    last_polled_at = Column(DateTime(timezone=True), nullable=True)
    last_success_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())


class LiveSensorSource(Base):
    __tablename__ = "live_sensor_sources"
    __table_args__ = (
        UniqueConstraint("external_user_id", "serial_number", name="uq_live_sensor_sources_external_user_serial"),
        Index("ix_live_sensor_sources_external_user_id", "external_user_id"),
        Index("ix_live_sensor_sources_serial_number", "serial_number"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    external_user_id = Column(Integer, nullable=False)
    serial_number = Column(String(100), nullable=False)
    label = Column(String(128), nullable=False)
    source_region = Column(String(64), nullable=False, default="Kerala", server_default=text("'Kerala'"))
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        onupdate=func.now(),
        server_default=func.now(),
    )


class LiveSensorBlockMapping(Base):
    __tablename__ = "live_sensor_block_mappings"
    __table_args__ = (
        UniqueConstraint("block_id", "source_id", name="uq_live_sensor_block_mappings_block_source"),
        Index("ix_live_sensor_block_mappings_block_id", "block_id"),
        Index("ix_live_sensor_block_mappings_user_id", "user_id"),
        Index("ix_live_sensor_block_mappings_source_id", "source_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    block_id = Column(UUID(as_uuid=True), ForeignKey("blocks.id", ondelete="CASCADE"), nullable=False)
    source_id = Column(UUID(as_uuid=True), ForeignKey("live_sensor_sources.id", ondelete="CASCADE"), nullable=False)
    label = Column(String(128), nullable=True)
    is_primary = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        onupdate=func.now(),
        server_default=func.now(),
    )


class LiveSensorSourceReading(Base):
    __tablename__ = "live_sensor_source_readings"
    __table_args__ = (
        UniqueConstraint(
            "source_id",
            "external_reading_id",
            name="uq_live_sensor_source_readings_source_external_id",
        ),
        Index("ix_live_sensor_source_readings_source_recorded_at", "source_id", "recorded_at"),
        Index("ix_live_sensor_source_readings_serial_recorded_at", "serial_number", "recorded_at"),
    )

    id = Column(BigInteger, Identity(always=True), primary_key=True)
    source_id = Column(
        UUID(as_uuid=True),
        ForeignKey("live_sensor_sources.id", ondelete="CASCADE"),
        nullable=False,
    )
    external_reading_id = Column(BigInteger, nullable=False)
    external_user_id = Column(Integer, nullable=False)
    serial_number = Column(String(100), nullable=False)
    soil_moisture = Column(Float, nullable=True)
    ec = Column(Float, nullable=True)
    ph_level = Column(Float, nullable=True)
    n_ppm = Column(Float, nullable=True)
    n_kg_ha = Column(Float, nullable=True)
    p_ppm = Column(Float, nullable=True)
    p_kg_ha = Column(Float, nullable=True)
    k_ppm = Column(Float, nullable=True)
    k_kg_ha = Column(Float, nullable=True)
    ca_ppm = Column(Float, nullable=True)
    ca_kg_ha = Column(Float, nullable=True)
    mg_ppm = Column(Float, nullable=True)
    mg_kg_ha = Column(Float, nullable=True)
    s_ppm = Column(Float, nullable=True)
    s_kg_ha = Column(Float, nullable=True)
    fe_ppm = Column(Float, nullable=True)
    fe_kg_ha = Column(Float, nullable=True)
    zn_ppm = Column(Float, nullable=True)
    zn_kg_ha = Column(Float, nullable=True)
    cu_ppm = Column(Float, nullable=True)
    cu_kg_ha = Column(Float, nullable=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    source_created_at = Column(DateTime(timezone=True), nullable=True)
    raw_payload = Column(JSONB, nullable=True)
    fetched_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())


class LiveSensorSourceLatest(Base):
    __tablename__ = "live_sensor_source_latest"

    source_id = Column(
        UUID(as_uuid=True),
        ForeignKey("live_sensor_sources.id", ondelete="CASCADE"),
        primary_key=True,
    )
    external_reading_id = Column(BigInteger, nullable=False)
    soil_moisture = Column(Float, nullable=True)
    ec = Column(Float, nullable=True)
    ph_level = Column(Float, nullable=True)
    n_ppm = Column(Float, nullable=True)
    n_kg_ha = Column(Float, nullable=True)
    p_ppm = Column(Float, nullable=True)
    p_kg_ha = Column(Float, nullable=True)
    k_ppm = Column(Float, nullable=True)
    k_kg_ha = Column(Float, nullable=True)
    ca_ppm = Column(Float, nullable=True)
    ca_kg_ha = Column(Float, nullable=True)
    mg_ppm = Column(Float, nullable=True)
    mg_kg_ha = Column(Float, nullable=True)
    s_ppm = Column(Float, nullable=True)
    s_kg_ha = Column(Float, nullable=True)
    fe_ppm = Column(Float, nullable=True)
    fe_kg_ha = Column(Float, nullable=True)
    zn_ppm = Column(Float, nullable=True)
    zn_kg_ha = Column(Float, nullable=True)
    cu_ppm = Column(Float, nullable=True)
    cu_kg_ha = Column(Float, nullable=True)
    observed_at = Column(DateTime(timezone=True), nullable=False)
    raw_payload = Column(JSONB, nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())


class BlockDecision(Base):
    __tablename__ = "block_decisions"
    __table_args__ = (
        Index("ix_block_decisions_created_at", "created_at"),
    )

    block_id = Column(UUID(as_uuid=True), ForeignKey("blocks.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    satellite_ready = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    weather_ready = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    sensors_ready = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    decision_payload = Column(JSONB, nullable=True)
    status = Column(String(32), nullable=False, default="pending", server_default=text("'pending'"))


class GrowingOpportunityNewsCache(Base):
    __tablename__ = "growing_opportunity_news_cache"
    __table_args__ = (
        Index("ix_growing_opportunity_news_cache_expires_at", "expires_at"),
        Index("ix_growing_opportunity_news_cache_refreshed_at", "refreshed_at"),
    )

    cache_key = Column(String(128), primary_key=True)
    query = Column(Text, nullable=False)
    payload = Column(JSONB, nullable=False)
    warning = Column(Text, nullable=True)
    refreshed_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
