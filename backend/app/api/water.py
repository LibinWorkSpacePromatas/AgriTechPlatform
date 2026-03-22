from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.insights import WaterMinimalResponse, WaterResponse
from app.services.satellite_access import satellite_access_service
from app.services.satellite_insights import SatelliteInsightsUnavailableError
from app.services.water_insights import build_water_minimal_response, build_water_response

router = APIRouter()


@router.get("/{block_id}", response_model=WaterResponse)
def get_water_data(block_id: str, refresh: bool = Query(default=False)):
    try:
        snapshot = satellite_access_service.get_block_snapshot(block_id, force_refresh=refresh)
        return build_water_response(snapshot)
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite insights are temporarily unavailable: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching water data: {exc}") from exc


@router.get("/{block_id}/minimal", response_model=WaterMinimalResponse)
def get_water_minimal_data(block_id: str, refresh: bool = Query(default=False)):
    try:
        snapshot = satellite_access_service.get_block_snapshot(block_id, force_refresh=refresh)
        return build_water_minimal_response(snapshot)
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite insights are temporarily unavailable: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching water data: {exc}") from exc
