from __future__ import annotations

from typing import Literal

from app.schemas.insights import WaterMinimalResponse, WaterResponse
from app.services.utils import build_satellite_contract_payload


WaterStatus = Literal["Well-watered", "Mild stress", "Moderate stress", "Severe stress", "No data"]


def classify_water_status(ndwi: float | None) -> WaterStatus:
    if ndwi is None:
        return "No data"
    if ndwi > 0.1:
        return "Well-watered"
    if ndwi > -0.1:
        return "Mild stress"
    if ndwi > -0.3:
        return "Moderate stress"
    return "Severe stress"


def water_action_for_status(status: WaterStatus) -> str:
    if status == "Well-watered":
        return "Check over-irrigation"
    if status == "Mild stress":
        return "Consider irrigation in 2-3 days"
    if status == "Moderate stress":
        return "Irrigate today"
    if status == "Severe stress":
        return "Immediate irrigation required"
    return "No irrigation recommendation is available until satellite data is ready."


def build_water_response(snapshot) -> WaterResponse:
    status = classify_water_status(snapshot.insights.ndwi)
    return WaterResponse(
        **build_satellite_contract_payload(snapshot.insights),
        lanslu=snapshot.lanslu or snapshot.block_id,
        date=snapshot.insights.composite_date_to,
        status=status,
        recommendation=water_action_for_status(status),
    )


def build_water_minimal_response(snapshot) -> WaterMinimalResponse:
    return WaterMinimalResponse(
        block_id=snapshot.insights.block_id,
        composite_date_from=snapshot.insights.composite_date_from,
        composite_date_to=snapshot.insights.composite_date_to,
        ndvi=snapshot.insights.ndvi,
        ndwi=snapshot.insights.ndwi,
        evi=snapshot.insights.evi,
        ndre=snapshot.insights.ndre,
        lai=snapshot.insights.lai,
        cloud_cover_pct=snapshot.insights.cloud_cover_pct,
        map_tile_url=snapshot.insights.map_tile_url,
        pixel_count=snapshot.insights.pixel_count,
        data_quality=snapshot.insights.data_quality,
    )
