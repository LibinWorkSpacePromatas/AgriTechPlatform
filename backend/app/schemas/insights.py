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


class GrowerGPTInsight(BaseModel):
    type: Literal["irrigation", "nutrient", "health"]
    severity: Literal["critical", "warning", "info", "positive"]
    message: str
    action_window: str
    reason: str


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
