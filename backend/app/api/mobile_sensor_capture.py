from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models import SensorLatest, SensorReading
from app.db.session import SessionLocal
from app.schemas.sensors import BlockSensorsResponse
from app.services.block_lookup import resolve_block
from app.services.sensor_service import calculate_sensor_status, sensor_service


router = APIRouter(tags=["mobile-sensor-capture"])


class MobileSensorSnapshotRequest(BaseModel):
    moisture: float
    temp: float
    humidity: float
    ph_level: float
    sunlight: float
    fertility: float
    observed_at: datetime | None = None


class MobileSensorSnapshotResponse(BaseModel):
    message: str
    block_id: str
    observed_at: datetime
    sensors: BlockSensorsResponse


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/blocks/{block_id}/sensor-snapshots", response_model=MobileSensorSnapshotResponse)
def insert_mobile_sensor_snapshot(
    block_id: str,
    payload: MobileSensorSnapshotRequest,
    db: Session = Depends(get_db),
):
    observed_at = payload.observed_at or datetime.now(timezone.utc)
    received_at = datetime.now(timezone.utc)

    try:
        block = resolve_block(db, block_id)
        definitions = sensor_service._ensure_sensor_state(db, block)
        definition_by_type = {definition.sensor_type: definition for definition in definitions if definition.is_active}

        snapshot_values = {
            "soil_moisture": payload.moisture,
            "soil_temperature": payload.temp,
            "humidity": payload.humidity,
            "ph_level": payload.ph_level,
            "sunlight": payload.sunlight,
            "fertility": payload.fertility,
        }

        for sensor_type, value in snapshot_values.items():
            definition = definition_by_type.get(sensor_type)
            if definition is None:
                raise HTTPException(status_code=404, detail=f"Sensor definition not found for {sensor_type}")

            status = calculate_sensor_status(value, definition.threshold_low, definition.threshold_high)

            db.add(
                SensorReading(
                    sensor_id=definition.id,
                    value=value,
                    status=status,
                    granularity="raw",
                    observed_at=observed_at,
                )
            )

            # Upsert SensorLatest so the website immediately sees the real mobile value
            db.merge(
                SensorLatest(
                    sensor_id=definition.id,
                    value=value,
                    status=status,
                    observed_at=observed_at,
                    updated_at=received_at,
                )
            )

        db.flush()
        db.commit()
        sensor_service.notify_sensor_data_changed(db, block.id)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while saving mobile sensor snapshot: {exc}") from exc

    sensors = sensor_service.get_block_sensor_snapshot(db, block_id)
    return MobileSensorSnapshotResponse(
        message="Sensor snapshot saved successfully",
        block_id=block_id,
        observed_at=observed_at,
        sensors=sensors,
    )


@router.get("/blocks/{block_id}/sensor-snapshots/latest", response_model=BlockSensorsResponse)
def get_mobile_latest_sensor_snapshot(block_id: str, db: Session = Depends(get_db)):
    try:
        return sensor_service.get_block_sensor_snapshot(db, block_id)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while fetching latest mobile sensor snapshot: {exc}") from exc
