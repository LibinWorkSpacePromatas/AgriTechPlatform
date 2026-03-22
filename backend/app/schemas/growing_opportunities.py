from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel


class GrowingOpportunityRecommendation(BaseModel):
    id: str
    title: str
    category: Literal["nutrient", "canopy", "irrigation", "trend", "system"]
    severity: Literal["critical", "warning", "info", "positive"]
    metric_key: str
    metric_label: str
    current_value: float | str | None = None
    threshold: str
    recommended_action: str
    message: str
    detail: str
    trend_note: str | None = None
    message_to_farmer: str


class GrowingOpportunityFeedbackRequest(BaseModel):
    recommendation_id: str
    helpful: bool
    notes: str | None = None


class GrowingOpportunityFeedbackResponse(BaseModel):
    saved: bool
    feedback_id: str


class GrowingOpportunitiesResponse(BaseModel):
    block_id: str
    crop: str | None = None
    status: Literal["fresh", "stale", "updating"]
    source: Literal["cache", "gee"]
    data_quality: Literal["good", "degraded", "no_data"]
    composite_date_from: date | None = None
    composite_date_to: date | None = None
    data_age_days: int | None = None
    confidence: str = "high"
    warning: str | None = None
    trend_summary: str | None = None
    recommendations: list[GrowingOpportunityRecommendation]
    feedback_enabled: bool = True
