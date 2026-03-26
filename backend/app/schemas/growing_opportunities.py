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


class GrowingOpportunityNewsItem(BaseModel):
    id: str
    title: str
    summary: str
    source: str
    source_url: str
    published_at: str | None = None
    region: str = "South Australia"
    category: str = "general"
    tags: list[str] = []


class GrowingOpportunitiesResponse(BaseModel):
    block_id: str
    crop: str | None = None
    status: Literal["fresh", "stale", "updating"]
    freshness_status: Literal["fresh", "stale", "updating"] = "fresh"
    source: Literal["real", "simulated", "cache", "gee"] = "real"
    search_window_from: date | None = None
    search_window_to: date | None = None
    data_quality: Literal["good", "degraded", "no_data"]
    composite_date_from: date | None = None
    composite_date_to: date | None = None
    last_satellite_update: date | None = None
    data_age_days: int | None = None
    ndvi: float | None = None
    ndwi: float | None = None
    evi: float | None = None
    ndre: float | None = None
    lai: float | None = None
    cloud_cover_pct: float | None = None
    pixel_count: int = 0
    map_tile_url: str | None = None
    confidence: str = "high"
    warning: str | None = None
    trend_summary: str | None = None
    recommendations: list[GrowingOpportunityRecommendation]
    news_items: list[GrowingOpportunityNewsItem] = []
    news_warning: str | None = None
    feedback_enabled: bool = True
