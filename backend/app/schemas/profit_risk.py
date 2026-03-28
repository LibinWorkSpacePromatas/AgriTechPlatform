from __future__ import annotations

from pydantic import BaseModel


class ProfitRiskScenarioMargins(BaseModel):
    low: float
    current: float
    high: float
    selected: float


class ProfitRiskCropRow(BaseModel):
    crop: str
    commodity: str
    current_price: float
    break_even_price: float
    price_trend: str
    yield_t_ha: float
    water_req_ml_ha: float
    cost_per_unit: float
    margins: ProfitRiskScenarioMargins


class ProfitRiskCurrentCrop(BaseModel):
    requested_crop: str
    matched_crop: str
    commodity: str
    match_type: str
    note: str | None = None
    current_price: float
    break_even_price: float
    price_trend: str
    yield_t_ha: float
    water_req_ml_ha: float
    net_margin: float


class ProfitRiskResponse(BaseModel):
    block_id: str
    block_name: str
    block_crop: str
    water_price: float
    net_margin: float
    risk_level: str
    best_crop: str
    best_crop_margin: float
    updated_at: str
    current_crop: ProfitRiskCurrentCrop
    margins: list[ProfitRiskCropRow]
