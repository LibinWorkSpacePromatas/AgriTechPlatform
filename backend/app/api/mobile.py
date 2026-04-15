from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.schemas.sensors import BlockSensorsResponse
from app.services.sensor_service import sensor_service


router = APIRouter(tags=["mobile"])


class MobileHealthResponse(BaseModel):
    status: str
    service: str
    generated_at: str


class MobileBlockDashboardResponse(BaseModel):
    block_id: str
    generated_at: str
    sensors: BlockSensorsResponse


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/health", response_model=MobileHealthResponse)
def mobile_health():
    return MobileHealthResponse(
        status="ok",
        service="mobile-api",
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/blocks/{block_id}/dashboard", response_model=MobileBlockDashboardResponse)
def get_mobile_block_dashboard(block_id: str, db: Session = Depends(get_db)):
    try:
        sensors = sensor_service.get_block_sensor_dashboard(db, block_id)
        return MobileBlockDashboardResponse(
            block_id=block_id,
            generated_at=datetime.now(timezone.utc).isoformat(),
            sensors=sensors,
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while fetching mobile dashboard: {exc}") from exc


@router.get("/blocks/{block_id}/sensors", response_model=BlockSensorsResponse)
def get_mobile_block_sensors(block_id: str, db: Session = Depends(get_db)):
    try:
        return sensor_service.get_block_sensor_dashboard(db, block_id)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while fetching mobile sensors: {exc}") from exc
