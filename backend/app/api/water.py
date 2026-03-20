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
        water_status = _interpretation_status(satellite_response, "ndwi")

        return WaterResponse(
            **build_satellite_contract_payload(satellite_response),
            lanslu=snapshot.lanslu or snapshot.block_id,
            date=satellite_response.composite_date_to,
            status=water_status,
            recommendation=_build_water_recommendation(satellite_response, water_status),
        )
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite insights are temporarily unavailable: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching water data: {exc}") from exc


def _build_water_recommendation(satellite_response, status: str) -> str:
    if satellite_response.freshness_status != "fresh":
        return _build_stale_water_message(satellite_response.freshness_status, satellite_response.error)
    ndwi_alert = _metric_alert(satellite_response, "ndwi")
    if ndwi_alert is not None:
        return ndwi_alert.message
    if status != "No data":
        return f"NDWI interpretation: {status}."
    return "No irrigation recommendation is available until satellite data is ready."


def _build_stale_water_message(freshness_status: str, error: str | None) -> str:
    if freshness_status == "updating":
        return "A fresh satellite composite is being prepared for this block. Irrigation guidance will resume when the refresh completes."
    if error:
        return f"The latest satellite refresh has not completed yet: {error}"
    return "The latest satellite refresh has not completed yet."


def _interpretation_status(satellite_response, metric: str) -> str:
    detail = satellite_response.interpretations.get(metric)
    if detail is None:
        return "No data"
    return getattr(detail, "status", "No data")


def _metric_alert(satellite_response, metric: str):
    for alert in satellite_response.alerts:
        if getattr(alert, "metric", None) == metric:
            return alert
    return None
