from __future__ import annotations

from datetime import date as date_type
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.satellite import SatelliteContractResponse


class MetricInsight(BaseModel):
    metric: Literal["ndvi", "ndwi", "ndre", "evi", "lai"]
    value: float | None = None
    status: str


class DashboardBlockInsightsResponse(SatelliteContractResponse):
    crop: Optional[str] = None
    data_age_days: int = 0
    confidence: str = "high"
    insights: List[MetricInsight] = Field(default_factory=list)


class WaterResponse(SatelliteContractResponse):
    lanslu: str
    date: Optional[date_type] = None
    status: Literal["Well-watered", "Mild stress", "Moderate stress", "Severe stress", "No data"]
    recommendation: str


class GrowerGPTResponse(SatelliteContractResponse):
    crop: Optional[str] = None
    date: Optional[date_type] = None
    data_age_days: int = 0
    confidence: str = "high"
    insights: List[MetricInsight] = Field(default_factory=list)
    message: Optional[str] = None


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
