from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.schemas.sensors import (
    BlockSensorsResponse,
    SensorGranularity,
    SensorHistoryResponse,
    SensorSimulationResponse,
    SensorType,
)
from app.services.live_sensor_service import live_sensor_service


router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/blocks/{block_id}/sensors", response_model=BlockSensorsResponse)
def get_block_sensors(block_id: str, db: Session = Depends(get_db)):
    try:
        return live_sensor_service.get_block_sensor_dashboard(db, block_id)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while fetching block sensors: {exc}") from exc


@router.get("/blocks/{block_id}/sensors/{sensor_type}/history", response_model=SensorHistoryResponse)
def get_block_sensor_history(
    block_id: str,
    sensor_type: SensorType,
    granularity: SensorGranularity = Query(default="hourly"),
    db: Session = Depends(get_db),
):
    try:
        return live_sensor_service.get_sensor_history(db, block_id, sensor_type, granularity)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while fetching sensor history: {exc}") from exc


@router.post("/blocks/{block_id}/sensors/simulate", response_model=SensorSimulationResponse)
def simulate_block_sensors(block_id: str, db: Session = Depends(get_db)):
    try:
        return live_sensor_service.sync_block_readings(db, block_id)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while simulating block sensors: {exc}") from exc
