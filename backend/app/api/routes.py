import json
from time import sleep
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.api import auth, scan
from app.db.session import SessionLocal
from app.db.models import Block, User
from app.schemas.opportunities import OpportunitiesResponse
from app.schemas.satellite import BlockInsightsResponse as GEEInsightsResponse, SatelliteTimeseriesPoint
from app.services.satellite_events import satellite_event_broker
from app.services.satellite_access import satellite_access_service
from app.services.satellite_insights import SatelliteInsightsUnavailableError, satellite_insights_service
from app.services.block_lookup import resolve_block
from app.services.opportunities import build_opportunities_response

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(scan.router, prefix="/scan", tags=["scan"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/users")
def get_users(db: Session = Depends(get_db)):
    try:
        users = db.query(User).all()
        return [
            {
                "id": str(user.id),
                "name": user.name,
                "region": user.region,
                "council": user.council,
                "farm_name": user.farm_name,
                "farm_location": user.farm_location,
                "primary_crop": user.primary_crop,
                "primary_soil": user.primary_soil,
            }
            for user in users
        ]
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching users: {exc}") from exc


@router.get("/blocks/{user_id}")
def get_blocks(user_id: UUID, db: Session = Depends(get_db)):
    try:
        blocks = db.execute(
            text(
                """
                SELECT
                    id,
                    user_id,
                    lanslu,
                    soil_subgroup,
                    soil_class,
                    description,
                    area_ha,
                    crop,
                    CASE
                        WHEN geom IS NULL OR ST_IsEmpty(geom) THEN NULL
                        ELSE ST_AsGeoJSON(ST_MakeValid(geom))
                    END AS block_polygon,
                    CASE
                        WHEN geom IS NULL OR ST_IsEmpty(geom) THEN NULL
                        ELSE ST_Y(ST_Centroid(ST_MakeValid(geom)))
                    END AS centroid_lat,
                    CASE
                        WHEN geom IS NULL OR ST_IsEmpty(geom) THEN NULL
                        ELSE ST_X(ST_Centroid(ST_MakeValid(geom)))
                    END AS centroid_lon
                FROM blocks
                WHERE user_id = :user_id
                ORDER BY lanslu NULLS LAST, id
                """
            ),
            {"user_id": str(user_id)},
        ).mappings().all()

        return [
            {
                "id": str(block["id"]),
                "user_id": str(block["user_id"]),
                "lanslu": block["lanslu"],
                "soil_subgroup": block["soil_subgroup"],
                "soil_class": block["soil_class"],
                "description": block["description"],
                "area_ha": block["area_ha"],
                "crop": block["crop"],
                "block_polygon": json.loads(block["block_polygon"]) if block["block_polygon"] else None,
                "centroid_lat": float(block["centroid_lat"]) if block["centroid_lat"] is not None else None,
                "centroid_lon": float(block["centroid_lon"]) if block["centroid_lon"] is not None else None,
            }
            for block in blocks
        ]
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching blocks: {exc}") from exc


@router.get("/api/block/{block_identifier}/insights", response_model=GEEInsightsResponse, tags=["satellite"])
@router.get("/block/{block_identifier}/insights", response_model=GEEInsightsResponse, tags=["satellite"])
def get_block_insights(block_identifier: str):
    try:
        return satellite_access_service.get_block_insights(block_identifier)
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite insights are temporarily unavailable: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching block insights: {exc}") from exc


@router.get("/api/block/{block_identifier}/timeseries", response_model=list[SatelliteTimeseriesPoint], tags=["satellite"])
def get_block_timeseries(block_identifier: str):
    try:
        return satellite_access_service.get_block_timeseries(block_identifier)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching block time series: {exc}") from exc


@router.get("/api/blocks/{block_id}/insights", response_model=GEEInsightsResponse, tags=["satellite-insights"])
def get_block_dashboard_insights(block_id: str):
    try:
        return satellite_access_service.get_block_insights(block_id)
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite insights are temporarily unavailable: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching dashboard block insights: {exc}") from exc


@router.get("/api/blocks/{block_id}/events", tags=["satellite-events"])
def stream_block_satellite_events(block_id: str):
    try:
        block_reference = satellite_access_service.resolve_block_reference(block_id)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while preparing satellite events: {exc}") from exc

    def event_stream():
        last_event_id: int | None = None
        yield _format_sse_payload(
            {
                "block_id": block_reference.block_id,
                "event": "connected",
                "reason": "stream_opened",
            }
        )

        while True:
            refresh_events = satellite_event_broker.list_events(
                block_id=block_reference.block_id,
                after_id=last_event_id,
            )

            if not refresh_events:
                yield ": keep-alive\n\n"
                sleep(1)
                continue

            for refresh_event in refresh_events:
                last_event_id = refresh_event.id
                yield _format_sse_payload(
                    {
                        "block_id": refresh_event.block_id,
                        "event": refresh_event.event,
                        "timestamp": refresh_event.timestamp.isoformat(),
                        "reason": refresh_event.reason,
                        "data_quality": refresh_event.data_quality,
                        "error": refresh_event.error,
                        "latency_ms": refresh_event.latency_ms,
                    }
                )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/api/opportunities/{block_id}", response_model=OpportunitiesResponse, tags=["opportunities"])
def get_block_opportunities(block_id: str, db: Session = Depends(get_db)):
    try:
        block = resolve_block(db, block_id)
        satellite_response = satellite_insights_service.get_block_insights(db, block)
        return build_opportunities_response(block, satellite_response)
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite opportunities are temporarily unavailable: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching growth opportunities: {exc}") from exc


def _format_sse_payload(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
