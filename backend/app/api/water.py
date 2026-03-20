from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.insights import WaterResponse
from app.services.satellite_access import satellite_access_service
from app.services.satellite_insights import SatelliteInsightsUnavailableError
from app.services.utils import build_satellite_contract_payload

router = APIRouter()


@router.get("/{block_id}", response_model=WaterResponse)
def get_water_data(block_id: str):
    """
    Returns water-specific satellite data (NDWI) and recommendations.
    Matches PDF logic for water stress classification.
    """
    try:
        snapshot = satellite_access_service.get_block_snapshot(block_id)
        satellite_response = snapshot.insights
        is_fresh = satellite_response.freshness_status == "fresh"
        water_alerts = [alert for alert in satellite_response.alerts if alert.metric == "ndwi"] if is_fresh else []
        water_status = satellite_response.ndwi_status if is_fresh and satellite_response.ndwi_status != "no_data" else "no_data"

        return WaterResponse(
            **build_satellite_contract_payload(satellite_response),
            lanslu=snapshot.lanslu or snapshot.block_id,
            date=satellite_response.composite_date_to,
            status=water_status,
            recommendation=_build_water_recommendation(satellite_response, water_status, water_alerts),
            alerts=water_alerts,
        )
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite insights are temporarily unavailable: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching water data: {exc}") from exc


def _build_water_recommendation(satellite_response, status: str, alerts: list) -> str:
    if satellite_response.freshness_status != "fresh":
        return _build_stale_water_message(satellite_response.freshness_status, satellite_response.error)
    if alerts:
        return alerts[0].message
    if status == "normal":
        return "NDWI is within the expected irrigation range."
    return "No irrigation recommendation is available until satellite data is ready."


def _build_stale_water_message(freshness_status: str, error: str | None) -> str:
    if freshness_status == "updating":
        return "A fresh satellite composite is being prepared for this block. Irrigation guidance will resume when the refresh completes."
    if error:
        return f"Cached irrigation data is older than the 5-day TTL and should not be actioned until refresh completes: {error}"
    return "Cached irrigation data is older than the 5-day TTL and should not be actioned until refresh completes."
