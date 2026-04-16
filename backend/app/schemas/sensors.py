from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


SensorType = Literal[
    "soil_moisture",
    "soil_temperature",
    "humidity",
    "ph_level",
    "sunlight",
    "fertility",
]
SensorStatus = Literal["Normal", "High", "Low"]
SensorGranularity = Literal["raw", "hourly", "daily", "weekly"]


class SensorHistoryPoint(BaseModel):
    value: float
    status: SensorStatus
    observed_at: datetime


class SensorHistoryBundle(BaseModel):
    hourly: list[SensorHistoryPoint] = Field(default_factory=list)
    daily: list[SensorHistoryPoint] = Field(default_factory=list)
    weekly: list[SensorHistoryPoint] = Field(default_factory=list)


class DashboardSensorResponse(BaseModel):
    sensor_id: str
    sensor_type: SensorType
    label: str
    unit: str
    threshold_low: float | None = None
    threshold_high: float | None = None
    suggested_min: float | None = None
    suggested_max: float | None = None
    value: float
    status: SensorStatus
    observed_at: datetime
    histories: SensorHistoryBundle = Field(default_factory=SensorHistoryBundle)


class BlockSensorsResponse(BaseModel):
    block_id: str
    block_name: str
    generated_at: datetime
    sensors: list[DashboardSensorResponse] = Field(default_factory=list)


class SensorHistoryResponse(BaseModel):
    block_id: str
    sensor_id: str
    sensor_type: SensorType
    granularity: SensorGranularity
    points: list[SensorHistoryPoint] = Field(default_factory=list)


class SensorSimulationResponse(BaseModel):
    block_id: str
    updated_at: datetime
    sensor_count: int
