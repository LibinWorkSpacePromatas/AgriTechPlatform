from __future__ import annotations

from datetime import date as date_type
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.satellite import BlockInsightsResponse, SatelliteContractResponse


class MetricInsight(BaseModel):
    metric: Literal["ndvi", "ndwi", "ndre", "evi", "lai"]
    value: float | None = None
    status: str


class DashboardBlockInsightsResponse(BlockInsightsResponse):
    ndvi_tile_url: str | None = None
    ndwi_tile_url: str | None = None
    crop: Optional[str] = None
    data_age_days: int = 0
    confidence: str = "high"
    insights: List[MetricInsight] = Field(default_factory=list)


class WaterResponse(SatelliteContractResponse):
    lanslu: str
    date: Optional[date_type] = None
    status: Literal["Well-watered", "Mild stress", "Moderate stress", "Severe stress", "No data"]
    recommendation: str


class WaterMinimalResponse(BaseModel):
    block_id: str
    composite_date_from: date_type | None = None
    composite_date_to: date_type | None = None
    ndvi: float | None = None
    ndwi: float | None = None
    evi: float | None = None
    ndre: float | None = None
    lai: float | None = None
    cloud_cover_pct: float | None = None
    pixel_count: int = 0
    map_tile_url: str | None = None
    data_quality: Literal["good", "degraded", "no_data"]


class GrowerGPTResponse(SatelliteContractResponse):
    crop: Optional[str] = None
    date: Optional[date_type] = None
    data_age_days: int = 0
    confidence: str = "high"
    insights: List["GrowerGPTInsight"] = Field(default_factory=list)
    message: Optional[str] = None
    reason: Optional[str] = None
    decision: Optional["GrowerGPTDecision"] = None
    weather: Optional["GrowerGPTWeather"] = None
    sensor_data: Optional["GrowerGPTSensorData"] = None


class GrowerGPTInsight(BaseModel):
    type: Literal["water", "health", "nutrient", "canopy", "yield"]
    severity: Literal["critical", "warning", "info", "positive"]
    message: str
    action_window: str
    reason: str


class GrowerGPTDecision(BaseModel):
    irrigation: str | None = None
    urgency: str | None = None
    water_needed_mm: float | int | None = None
    water_needed_liters: float | int | None = None
    reason: str | None = None
    confidence: float | None = None
    rental_recommendations: list[str] = Field(default_factory=list)
    rental_reason: str | None = None
    rental_weather_guardrail: str | None = None


class GrowerGPTForecastPoint(BaseModel):
    observed_at: str | None = None
    observed_at_local: str | None = None
    timezone: str | None = None
    temperature: float | None = None
    humidity: float | None = None
    precipitation: float | None = None


class GrowerGPTWeather(BaseModel):
    temp_avg: float | None = None
    rain_24h: float | None = None
    rain_next_48h: float | None = None
    forecast_7_days: List[GrowerGPTForecastPoint] = Field(default_factory=list)


class GrowerGPTSensorData(BaseModel):
    soil_moisture: float | None = None
    temperature: float | None = None
    humidity: float | None = None
    ph_level: float | None = None
    last_updated: str | None = None


class UserGPTInsight(BaseModel):
    block_id: str
    block_name: str
    crop: Optional[str] = None
    freshness_status: Literal["fresh", "stale", "updating"] = "fresh"
    insight: MetricInsight


class UserGPTResponse(BaseModel):
    user_id: str
    summary: str
    insights: List[UserGPTInsight] = Field(default_factory=list)
