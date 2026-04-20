from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models import SensorDefinition, SensorReading
from app.db.session import SessionLocal
from app.services.block_lookup import resolve_block


router = APIRouter(tags=["mobile-history"])

SENSOR_ORDER = (
    "soil_moisture",
    "soil_temperature",
    "humidity",
    "ph_level",
    "sunlight",
    "fertility",
)


class MobileHistorySensorValue(BaseModel):
    sensor_type: str
    label: str
    unit: str
    value: float
    status: str


class MobileHistoryEntry(BaseModel):
    snapshot_id: str
    observed_at: datetime
    sensor_count: int
    sensors: list[MobileHistorySensorValue] = Field(default_factory=list)


class MobileHistoryResponse(BaseModel):
    block_id: str
    block_name: str
    entries: list[MobileHistoryEntry] = Field(default_factory=list)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/blocks/{block_id}/sensor-snapshots/history", response_model=MobileHistoryResponse)
def get_mobile_sensor_snapshot_history(
    block_id: str,
    limit: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    try:
        block = resolve_block(db, block_id)

        rows = (
            db.query(SensorReading, SensorDefinition)
            .join(SensorDefinition, SensorDefinition.id == SensorReading.sensor_id)
            .filter(
                SensorDefinition.block_id == block.id,
                SensorReading.granularity == "raw",
            )
            .order_by(SensorReading.observed_at.desc(), SensorReading.id.desc())
            .all()
        )

        grouped_entries: list[MobileHistoryEntry] = []
        grouped_by_observed_at: dict[datetime, MobileHistoryEntry] = {}

        for reading, definition in rows:
            entry = grouped_by_observed_at.get(reading.observed_at)
            if entry is None:
                if len(grouped_entries) >= limit:
                    continue

                entry = MobileHistoryEntry(
                    snapshot_id=f"{block.id}:{reading.observed_at.isoformat()}",
                    observed_at=reading.observed_at,
                    sensor_count=0,
                    sensors=[],
                )
                grouped_by_observed_at[reading.observed_at] = entry
                grouped_entries.append(entry)

            if any(sensor.sensor_type == definition.sensor_type for sensor in entry.sensors):
                continue

            entry.sensors.append(
                MobileHistorySensorValue(
                    sensor_type=definition.sensor_type,
                    label=definition.label,
                    unit=definition.unit,
                    value=reading.value,
                    status=reading.status,
                )
            )
            entry.sensor_count = len(entry.sensors)

        order_lookup = {sensor_type: index for index, sensor_type in enumerate(SENSOR_ORDER)}
        for entry in grouped_entries:
            entry.sensors.sort(key=lambda sensor: order_lookup.get(sensor.sensor_type, 999))

        return MobileHistoryResponse(
            block_id=str(block.id),
            block_name=f"{block.lanslu} - {block.crop or 'Block'}",
            entries=grouped_entries,
        )
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching mobile sensor history: {exc}") from exc
