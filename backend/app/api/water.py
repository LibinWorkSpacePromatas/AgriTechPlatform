from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.models import Block
from app.db.session import SessionLocal
from app.schemas.satellite import BlockInsightsResponse
from app.services.insights import classify_ndwi
from app.services.satellite_insights import SatelliteInsightsUnavailableError, satellite_insights_service

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _resolve_block(db: Session, block_id: str) -> Block:
    block = None

    try:
        block_uuid = UUID(block_id)
        block = db.query(Block).filter(Block.id == block_uuid).first()
    except (ValueError, AttributeError):
        pass

    if not block:
        block = db.query(Block).filter(Block.lanslu == block_id).first()

    if not block:
        raise HTTPException(status_code=404, detail=f"Block {block_id} not found")

    return block


def _to_water_response(block: Block, insights: BlockInsightsResponse) -> dict[str, object | None]:
    status, recommendation = classify_ndwi(insights.ndwi)

    if insights.ndwi is None and insights.error:
        recommendation = insights.error

    return {
        "block_id": str(block.id),
        "lanslu": block.lanslu,
        "ndwi": insights.ndwi,
        "status": status,
        "recommendation": recommendation,
        "date": insights.composite_date_to,
        "data_quality": insights.data_quality,
        "map_tile_url": insights.map_tile_url,
        "satellite_status": insights.status,
        "satellite_source": insights.source,
        "error": insights.error,
    }


@router.get("/{block_id}")
def get_water_data(
    block_id: str,
    refresh: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    """
    Returns water-specific satellite data (NDWI) and recommendations.
    When refresh=true, fetches directly from Earth Engine instead of only reading cache.
    """
    block = _resolve_block(db, block_id)

    try:
        insights = (
            satellite_insights_service.refresh_block_insights(db, block)
            if refresh
            else satellite_insights_service.get_block_insights(db, block)
        )
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite insights are temporarily unavailable: {exc}") from exc

    return _to_water_response(block, insights)
