from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.api import auth, scan
from app.db.session import SessionLocal
from app.db.models import Block, User
from app.services.dashboard_insights import build_block_insights

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


@router.get("/block/{block_identifier}/insights")
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

        return build_block_insights(block)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching block insights: {exc}") from exc
