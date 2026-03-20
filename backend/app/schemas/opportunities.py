from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.insights import MetricInsight
from app.schemas.satellite import SatelliteContractResponse


class OpportunityCard(BaseModel):
    id: str
    title: str
    description: str
    full_description: str
    key_points: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    priority: Literal["high", "medium", "low"] = "medium"
    driver_indices: List[Literal["ndre", "evi"]] = Field(default_factory=list)


class OpportunitiesResponse(SatelliteContractResponse):
    crop: Optional[str] = None
    ndre_status: str = "No data"
    evi_status: str = "No data"
    warning: Optional[str] = None
    insights: List[MetricInsight] = Field(default_factory=list)
    opportunities: List[OpportunityCard] = Field(default_factory=list)
