from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.api import auth, scan
from app.db.session import SessionLocal
from app.db.models import Block, User, SatelliteCache
from app.schemas.growing_opportunities import (
    GrowingOpportunitiesResponse,
    GrowingOpportunityFeedbackRequest,
    GrowingOpportunityFeedbackResponse,
)
from app.schemas.satellite import BlockInsightsResponse as GEEInsightsResponse
from app.schemas.insights import BlockInsightsResponse
from app.services.satellite_insights import SatelliteInsightsUnavailableError, satellite_insights_service
from app.services.growing_opportunities import growing_opportunities_service
from app.services.insights import generate_insights
from app.services.utils import calculate_confidence
from app.services.dashboard_insights import build_block_insights
from datetime import date

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
        blocks = (
            db.query(
                Block.id,
                Block.user_id,
                Block.lanslu,
                Block.soil_subgroup,
                Block.soil_class,
                Block.description,
                Block.area_ha,
                Block.crop,
            )
            .filter(Block.user_id == user_id)
            .all()
        )

        return [
            {
                "id": str(block.id),
                "user_id": str(block.user_id),
                "lanslu": block.lanslu,
                "soil_subgroup": block.soil_subgroup,
                "soil_class": block.soil_class,
                "description": block.description,
                "area_ha": block.area_ha,
                "crop": block.crop,
            }
            for block in blocks
        ]
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching blocks: {exc}") from exc


@router.get("/api/block/{block_identifier}/insights", response_model=GEEInsightsResponse, tags=["satellite"])
@router.get("/block/{block_identifier}/insights", response_model=GEEInsightsResponse, tags=["satellite"])
def get_block_insights(block_identifier: str, db: Session = Depends(get_db)):
    try:
        block = db.query(Block).filter(Block.lanslu == block_identifier).first()

        if block is None:
            try:
                block_uuid = UUID(block_identifier)
            except ValueError:
                block_uuid = None

            if block_uuid is not None:
                block = db.query(Block).filter(Block.id == block_uuid).first()

        if block is None:
            raise HTTPException(status_code=404, detail=f"Block {block_identifier} was not found.")

        return satellite_insights_service.get_block_insights(db, block)
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite insights are temporarily unavailable: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching block insights: {exc}") from exc


@router.get("/api/blocks/{block_id}/insights", response_model=dict, tags=["satellite-insights"])
def get_block_dashboard_insights(block_id: str, db: Session = Depends(get_db)):
    """
    Enhanced endpoint specifically for the Dashboard.
    Uses simulated agronomic modeling if real satellite data is missing.
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

    # Try to find real satellite data first
    cache = db.query(SatelliteCache).filter(SatelliteCache.block_id == block.id).first()
    if cache:
        p = cache.payload
        data_age_days = (date.today() - cache.composite_date_to).days if cache.composite_date_to else 0
        insights = generate_insights(p)
        confidence = calculate_confidence(cache)

        # Pass the real satellite payload as overrides to get correct status, labels and messages
        rich_insights = build_block_insights(block, overrides=p)
        
        # Ensure flat fields are present for frontend normalization
        for key in ["ndvi", "ndwi", "ndre", "evi", "lai"]:
            val = p.get(key)
            if val is not None:
                rich_insights[key] = val

        rich_insights["insights"] = insights
        rich_insights["confidence"] = confidence
        rich_insights["status"] = "fresh"
        rich_insights["source"] = "gee"
        rich_insights["data_quality"] = cache.data_quality
        rich_insights["composite_date_to"] = cache.composite_date_to.isoformat() if cache.composite_date_to else rich_insights["composite_date_to"]
        
        return rich_insights

    # If no real data, return the simulated rich insights for the dashboard
    return build_block_insights(block)


@router.get("/api/blocks/{block_id}/growing-opportunities", response_model=GrowingOpportunitiesResponse, tags=["growing-opportunities"])
def get_growing_opportunities(block_id: str, db: Session = Depends(get_db)):
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

    return growing_opportunities_service.build_page_payload(db, block)


@router.post(
    "/api/blocks/{block_id}/growing-opportunities/feedback",
    response_model=GrowingOpportunityFeedbackResponse,
    tags=["growing-opportunities"],
)
def save_growing_opportunity_feedback(
    block_id: str,
    feedback: GrowingOpportunityFeedbackRequest,
    db: Session = Depends(get_db),
):
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

    return growing_opportunities_service.save_feedback(block, feedback)
