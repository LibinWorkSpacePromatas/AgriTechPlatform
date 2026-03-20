from __future__ import annotations

from datetime import date as date_type
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.satellite import SatelliteAlert, SatelliteContractResponse


class BlockInsightAlert(SatelliteAlert):
    pass


class DashboardBlockInsightsResponse(SatelliteContractResponse):
    crop: Optional[str] = None
    data_age_days: int = 0
    confidence: str = "high"
    insights: List[BlockInsightAlert] = Field(default_factory=list)


class WaterResponse(SatelliteContractResponse):
    lanslu: str
    date: Optional[date_type] = None
    status: Literal["normal", "irrigation_alert", "urgent_irrigation", "no_data"]
    recommendation: str
    alerts: List[SatelliteAlert] = Field(default_factory=list)


class GrowerGPTResponse(SatelliteContractResponse):
    crop: Optional[str] = None
    date: Optional[date_type] = None
    data_age_days: int = 0
    confidence: str = "high"
    insights: List[SatelliteAlert] = Field(default_factory=list)
    message: Optional[str] = None


class UserGPTInsight(BaseModel):
    block_id: str
    block_name: str
    crop: Optional[str] = None
    freshness_status: Literal["fresh", "stale", "updating"] = "fresh"
    insight: SatelliteAlert


class UserGPTResponse(BaseModel):
    user_id: str
    summary: str
    insights: List[UserGPTInsight] = Field(default_factory=list)
