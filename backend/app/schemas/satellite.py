from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict


class BlockInsightsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    block_id: str
    ndvi: float | None = None
    ndwi: float | None = None
    evi: float | None = None
    ndre: float | None = None
    lai: float | None = None
    cloud_cover_pct: float | None = None
    pixel_count: int = 0
    map_tile_url: str | None = None
    data_quality: Literal["good", "degraded", "no_data"]
    composite_date_from: date | None = None
    composite_date_to: date | None = None
