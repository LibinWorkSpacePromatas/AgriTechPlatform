from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.models import Block, SatelliteCache
from app.db.session import SessionLocal
from app.services.insights import classify_ndwi

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/{block_id}")
def get_water_data(block_id: str, db: Session = Depends(get_db)):
    """
    Returns water-specific satellite data (NDWI) and recommendations.
    Matches PDF logic for water stress classification.
    """
    block = None
    
    # Try finding by UUID first
    try:
        block_uuid = UUID(block_id)
        block = db.query(Block).filter(Block.id == block_uuid).first()
    except (ValueError, AttributeError):
        pass

    # If not found by UUID, try finding by LANSLU
    if not block:
        block = db.query(Block).filter(Block.lanslu == block_id).first()

    if not block:
        raise HTTPException(status_code=404, detail=f"Block {block_id} not found")

    cache = db.query(SatelliteCache).filter(
        SatelliteCache.block_id == block.id
    ).first()

    if not cache:
        return {
            "block_id": str(block.id),
            "lanslu": block.lanslu,
            "ndwi": None,
            "status": "no_data",
            "recommendation": "No data available for this block",
            "date": None,
            "data_quality": "no_data",
            "map_tile_url": None,
        }

    payload = cache.payload
    ndwi = payload.get("ndwi")

    # Use centralized classification logic
    status, recommendation = classify_ndwi(ndwi)

    return {
        "block_id": str(block.id),
        "lanslu": block.lanslu,
        "ndwi": ndwi,
        "status": status,
        "recommendation": recommendation,
        "date": cache.composite_date_to,
        "data_quality": cache.data_quality,
        "map_tile_url": cache.map_tile_url,
    }
