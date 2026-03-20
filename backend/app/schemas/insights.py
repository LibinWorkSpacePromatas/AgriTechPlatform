from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel


class Insight(BaseModel):
    type: Optional[str] = None
    severity: Optional[str] = None
    message: Optional[str] = None
    reason: Optional[str] = None
    action_window: Optional[str] = None


class BlockInsightsResponse(BaseModel):
    block_id: str
    crop: Optional[str] = None
    ndvi: Optional[float] = None
    ndwi: Optional[float] = None
    ndre: Optional[float] = None
    evi: Optional[float] = None
    lai: Optional[float] = None
    cloud_cover: Optional[float] = None
    date: Optional[date] = None
    data_age_days: int = 0
    confidence: str = "high"
    data_quality: str
    insights: List[Insight] = []


class GrowerGPTResponse(BaseModel):
    block_id: str
    crop: Optional[str] = None
    date: Optional[date] = None
    data_age_days: int = 0
    confidence: str = "high"
    insights: List[Insight]
    message: Optional[str] = None


class UserGPTResponse(BaseModel):
    user_id: str
    summary: str
    blocks: List[GrowerGPTResponse]
