from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models import Block, User
from app.db.session import SessionLocal
from app.schemas.sensors import BlockSensorsResponse
from app.services.sensor_service import sensor_service


router = APIRouter(tags=["mobile-users"])


class MobileUserBlockResponse(BaseModel):
    block_id: str
    lanslu: str | None = None
    crop: str | None = None
    description: str | None = None
    area_ha: float | None = None
    timezone: str | None = None
    sensors: BlockSensorsResponse


class MobileUserDetailsResponse(BaseModel):
    user_id: str
    name: str | None = None
    email: str | None = None
    role: str | None = None
    farm_name: str | None = None
    farm_location: str | None = None
    blocks: list[MobileUserBlockResponse] = Field(default_factory=list)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/users/{user_id}/details", response_model=MobileUserDetailsResponse)
def get_mobile_user_details(user_id: str, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.id == user_id).first()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while fetching mobile user details: {exc}") from exc

    if user is None:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")

    try:
        blocks = (
            db.query(Block)
            .filter(Block.user_id == user.id)
            .order_by(Block.lanslu.asc(), Block.id.asc())
            .all()
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while fetching user blocks: {exc}") from exc

    block_payload: list[MobileUserBlockResponse] = []
    for block in blocks:
        try:
            sensors = sensor_service.get_block_sensor_snapshot(db, str(block.id))
        except HTTPException:
            raise
        except SQLAlchemyError as exc:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Database error while fetching sensors for block {block.id}: {exc}",
            ) from exc

        block_payload.append(
            MobileUserBlockResponse(
                block_id=str(block.id),
                lanslu=block.lanslu,
                crop=block.crop,
                description=block.description,
                area_ha=block.area_ha,
                timezone=block.timezone,
                sensors=sensors,
            )
        )

    return MobileUserDetailsResponse(
        user_id=str(user.id),
        name=user.name,
        email=user.email,
        role=user.role,
        farm_name=user.farm_name,
        farm_location=user.farm_location,
        blocks=block_payload,
    )
