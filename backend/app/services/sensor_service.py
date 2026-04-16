from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import md5

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.models import Block, SensorDefinition, SensorLatest, SensorReading, BlockDecision
from app.schemas.sensors import (
    BlockSensorsResponse,
    DashboardSensorResponse,
    SensorGranularity,
    SensorHistoryBundle,
    SensorHistoryPoint,
    SensorHistoryResponse,
    SensorSimulationResponse,
    SensorStatus,
    SensorType,
)
from app.services.block_lookup import resolve_block


LIVE_TICK_INTERVAL_SECONDS = 30
SENSOR_ORDER: tuple[SensorType, ...] = (
    "soil_moisture",
    "soil_temperature",
    "air_temperature",
    "humidity",
    "ph_level",
    "sunlight",
    "fertility",
)


@dataclass(frozen=True)
class SensorTemplate:
    sensor_type: SensorType
    label: str
    unit: str
    threshold_low: float | None
    threshold_high: float | None
    suggested_min: float | None
    suggested_max: float | None
    current: float
    hourly: tuple[float, ...]
    daily: tuple[float, ...]
    weekly: tuple[float, ...]
    variation_scale: float
    rounding: int = 1


SENSOR_TEMPLATES: dict[SensorType, SensorTemplate] = {
    "soil_moisture": SensorTemplate(
        sensor_type="soil_moisture",
        label="Soil Moisture",
        unit="%",
        threshold_low=20,
        threshold_high=80,
        suggested_min=0,
        suggested_max=100,
        current=26.9,
        hourly=(
            30.0, 31.0, 32.0, 31.0, 30.0, 29.0, 28.0, 28.0, 29.0, 30.0, 32.0, 35.0,
            38.0, 40.0, 42.0, 41.0, 39.0, 37.0, 35.0, 34.0, 33.0, 32.0, 32.0, 26.9,
        ),
        daily=(35.0, 34.0, 38.0, 42.0, 40.0, 36.0, 26.9),
        weekly=(45.0, 40.0, 38.0, 26.9),
        variation_scale=4.0,
    ),
    "soil_temperature": SensorTemplate(
        sensor_type="soil_temperature",
        label="Soil Temperature",
        unit="C",
        threshold_low=10,
        threshold_high=30,
        suggested_min=0,
        suggested_max=40,
        current=23.4,
        hourly=(
            15.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0, 21.0, 22.0, 22.0, 21.0, 20.0,
            19.0, 18.0, 18.0, 18.0, 19.0, 19.5, 20.0, 20.1, 20.0, 19.0, 18.0, 23.4,
        ),
        daily=(18.0, 19.0, 21.0, 20.0, 19.0, 18.0, 23.4),
        weekly=(22.0, 20.0, 18.0, 23.4),
        variation_scale=2.0,
    ),
    "air_temperature": SensorTemplate(
        sensor_type="air_temperature",
        label="Air Temperature",
        unit="C",
        threshold_low=15,
        threshold_high=35,
        suggested_min=0,
        suggested_max=50,
        current=29.8,
        hourly=(
            20.0, 21.0, 23.0, 25.0, 28.0, 30.0, 32.0, 33.0, 34.0, 33.0, 32.0, 31.0,
            30.0, 29.0, 28.0, 27.0, 26.0, 27.0, 28.0, 29.0, 30.0, 31.0, 31.4, 29.8,
        ),
        daily=(25.0, 28.0, 30.0, 32.0, 34.0, 33.0, 29.8),
        weekly=(28.0, 30.0, 32.0, 29.8),
        variation_scale=2.5,
    ),
    "humidity": SensorTemplate(
        sensor_type="humidity",
        label="Humidity",
        unit="%",
        threshold_low=20,
        threshold_high=80,
        suggested_min=0,
        suggested_max=100,
        current=47.3,
        hourly=(
            50.0, 48.0, 46.0, 45.0, 44.0, 43.0, 42.0, 41.0, 40.0, 39.0, 38.0, 38.0,
            38.7, 39.0, 40.0, 42.0, 44.0, 45.0, 46.0, 45.0, 44.0, 42.0, 40.0, 47.3,
        ),
        daily=(55.0, 50.0, 45.0, 40.0, 42.0, 45.0, 47.3),
        weekly=(60.0, 55.0, 50.0, 47.3),
        variation_scale=6.0,
    ),
    "ph_level": SensorTemplate(
        sensor_type="ph_level",
        label="pH Level",
        unit="pH",
        threshold_low=5,
        threshold_high=8,
        suggested_min=0,
        suggested_max=14,
        current=6.7,
        hourly=(
            7.2, 7.1, 7.1, 7.0, 7.0, 6.9, 6.9, 6.9, 6.8, 6.8, 6.8, 6.8,
            6.9, 6.9, 6.9, 6.8, 6.8, 6.8, 6.8, 6.7, 6.7, 6.7, 6.7, 6.7,
        ),
        daily=(7.2, 7.1, 7.0, 6.9, 6.9, 6.8, 6.7),
        weekly=(7.2, 7.0, 6.9, 6.7),
        variation_scale=0.35,
    ),
    "sunlight": SensorTemplate(
        sensor_type="sunlight",
        label="Sunlight",
        unit="W/m2",
        threshold_low=150,
        threshold_high=1100,
        suggested_min=0,
        suggested_max=1400,
        current=640.0,
        hourly=(
            0.0, 0.0, 0.0, 30.0, 120.0, 260.0, 420.0, 580.0, 760.0, 890.0, 960.0, 1010.0,
            1040.0, 1020.0, 930.0, 790.0, 610.0, 420.0, 220.0, 80.0, 10.0, 0.0, 0.0, 640.0,
        ),
        daily=(520.0, 560.0, 610.0, 640.0, 680.0, 620.0, 640.0),
        weekly=(500.0, 560.0, 610.0, 640.0),
        variation_scale=120.0,
        rounding=1,
    ),
    "fertility": SensorTemplate(
        sensor_type="fertility",
        label="Fertility",
        unit="EC",
        threshold_low=0.8,
        threshold_high=2.4,
        suggested_min=0,
        suggested_max=5,
        current=1.6,
        hourly=(
            1.5, 1.5, 1.4, 1.4, 1.4, 1.5, 1.5, 1.6, 1.6, 1.7, 1.7, 1.7,
            1.8, 1.8, 1.7, 1.7, 1.6, 1.6, 1.6, 1.5, 1.5, 1.5, 1.5, 1.6,
        ),
        daily=(1.4, 1.5, 1.5, 1.6, 1.7, 1.6, 1.6),
        weekly=(1.3, 1.5, 1.6, 1.6),
        variation_scale=0.25,
        rounding=2,
    ),
}


def calculate_sensor_status(value: float, threshold_low: float | None, threshold_high: float | None) -> SensorStatus:
    if threshold_high is not None and value > threshold_high:
        return "High"
    if threshold_low is not None and value < threshold_low:
        return "Low"
    return "Normal"


class SensorService:
    def get_block_sensor_dashboard(self, db: Session, block_identifier: str) -> BlockSensorsResponse:
        block = resolve_block(db, block_identifier)
        definitions = self._ensure_sensor_state(db, block)
        _tick_time, readings_refreshed = self._refresh_live_readings_if_needed(db, block, definitions)
        db.commit()

        self._update_sensor_decision_state(db, block.id, sensor_data_changed=readings_refreshed)

        return self._build_block_response(db, block)

    def get_block_sensor_snapshot(self, db: Session, block_identifier: str) -> BlockSensorsResponse:
        block = resolve_block(db, block_identifier)
        definitions = self._ensure_sensor_state(db, block)
        db.commit()

        self._update_sensor_decision_state(db, block.id, sensor_data_changed=False)
        return self._build_block_response(db, block)

    def get_sensor_history(
        self,
        db: Session,
        block_identifier: str,
        sensor_type: SensorType,
        granularity: SensorGranularity,
    ) -> SensorHistoryResponse:
        block = resolve_block(db, block_identifier)
        self._ensure_sensor_state(db, block)
        db.commit()

        definition = self._get_sensor_definition(db, block.id, sensor_type)
        points = (
            db.query(SensorReading)
            .filter(
                SensorReading.sensor_id == definition.id,
                SensorReading.granularity == granularity,
            )
            .order_by(SensorReading.observed_at.asc(), SensorReading.id.asc())
            .all()
        )

        return SensorHistoryResponse(
            block_id=str(block.id),
            sensor_id=str(definition.id),
            sensor_type=sensor_type,
            granularity=granularity,
            points=[
                SensorHistoryPoint(
                    value=point.value,
                    status=point.status,
                    observed_at=point.observed_at,
                )
                for point in points
            ],
        )

    def simulate_block_readings(self, db: Session, block_identifier: str) -> SensorSimulationResponse:
        block = resolve_block(db, block_identifier)
        definitions = self._ensure_sensor_state(db, block)
        tick_time, readings_refreshed = self._refresh_live_readings_if_needed(db, block, definitions, force=True)
        db.commit()

        self._update_sensor_decision_state(db, block.id, sensor_data_changed=readings_refreshed)

        return SensorSimulationResponse(
            block_id=str(block.id),
            updated_at=tick_time,
            sensor_count=len(definitions),
        )

    def _update_sensor_decision_state(self, db: Session, block_id: object, *, sensor_data_changed: bool) -> None:
        try:
            from app.services.decision_engine import is_decision_stale, trigger_block_decision

            decision = db.get(BlockDecision, block_id)
            if not decision:
                decision = BlockDecision(block_id=block_id)
                db.add(decision)
                db.flush()

            decision.sensors_ready = True
            should_trigger = sensor_data_changed or is_decision_stale(db, block_id)
            db.commit()

            if should_trigger:
                trigger_block_decision(db, block_id)
        except Exception:
            pass

    def _ensure_sensor_state(self, db: Session, block: Block) -> list[SensorDefinition]:
        definitions = self._ensure_sensor_definitions(db, block)
        self._ensure_seed_history(db, block, definitions)
        self._rebuild_missing_latest_rows(db, definitions)
        return definitions

    def _ensure_sensor_definitions(self, db: Session, block: Block) -> list[SensorDefinition]:
        definitions = self._get_block_sensor_definitions(db, block.id)
        existing_types = {definition.sensor_type for definition in definitions}

        for sensor_type in SENSOR_ORDER:
            if sensor_type in existing_types:
                continue

            template = SENSOR_TEMPLATES[sensor_type]
            db.add(
                SensorDefinition(
                    user_id=block.user_id,
                    block_id=block.id,
                    sensor_type=template.sensor_type,
                    label=template.label,
                    unit=template.unit,
                    threshold_low=template.threshold_low,
                    threshold_high=template.threshold_high,
                    suggested_min=template.suggested_min,
                    suggested_max=template.suggested_max,
                    is_active=True,
                )
            )

        db.flush()
        return self._get_block_sensor_definitions(db, block.id)

    def _ensure_seed_history(self, db: Session, block: Block, definitions: list[SensorDefinition]) -> None:
        sensor_ids = [definition.id for definition in definitions]
        if not sensor_ids:
            return

        granularity_rows = (
            db.query(SensorReading.sensor_id, SensorReading.granularity)
            .filter(SensorReading.sensor_id.in_(sensor_ids))
            .distinct()
            .all()
        )

        existing_granularities: dict[object, set[str]] = {}
        for sensor_id, granularity in granularity_rows:
            existing_granularities.setdefault(sensor_id, set()).add(granularity)

        now = datetime.now(timezone.utc)
        for definition in definitions:
            available = existing_granularities.get(definition.id, set())
            for granularity in ("hourly", "daily", "weekly"):
                if granularity in available:
                    continue
                self._seed_granularity_history(db, block, definition, granularity, now)

        db.flush()

    def _rebuild_missing_latest_rows(self, db: Session, definitions: list[SensorDefinition]) -> None:
        sensor_ids = [definition.id for definition in definitions]
        if not sensor_ids:
            return

        latest_rows = {
            row.sensor_id: row
            for row in db.query(SensorLatest).filter(SensorLatest.sensor_id.in_(sensor_ids)).all()
        }

        for definition in definitions:
            if definition.id in latest_rows:
                continue

            latest_reading = (
                db.query(SensorReading)
                .filter(SensorReading.sensor_id == definition.id)
                .order_by(SensorReading.observed_at.desc(), SensorReading.id.desc())
                .first()
            )
            if latest_reading is None:
                continue

            db.merge(
                SensorLatest(
                    sensor_id=definition.id,
                    value=latest_reading.value,
                    status=latest_reading.status,
                    observed_at=latest_reading.observed_at,
                )
            )

        db.flush()

    def _refresh_live_readings_if_needed(
        self,
        db: Session,
        block: Block,
        definitions: list[SensorDefinition],
        *,
        force: bool = False,
    ) -> tuple[datetime, bool]:
        tick_time = datetime.now(timezone.utc)
        latest_rows = {
            row.sensor_id: row
            for row in db.query(SensorLatest)
            .filter(SensorLatest.sensor_id.in_([definition.id for definition in definitions]))
            .all()
        }

        should_refresh = force or any(
            definition.id not in latest_rows
            or (tick_time - latest_rows[definition.id].observed_at).total_seconds() >= LIVE_TICK_INTERVAL_SECONDS
            for definition in definitions
            if definition.is_active
        )
        if not should_refresh:
            return tick_time, False

        for definition in definitions:
            if not definition.is_active:
                continue

            latest_row = latest_rows.get(definition.id)
            next_value = self._next_live_value(block, definition, latest_row.value if latest_row else None, tick_time)
            db.add(
                SensorReading(
                    sensor_id=definition.id,
                    value=next_value,
                    status=calculate_sensor_status(next_value, definition.threshold_low, definition.threshold_high),
                    granularity="raw",
                    observed_at=tick_time,
                )
            )

        db.flush()
        return tick_time, True

    def _build_block_response(self, db: Session, block: Block) -> BlockSensorsResponse:
        definitions = self._get_block_sensor_definitions(db, block.id)
        latest_rows = {
            row.sensor_id: row
            for row in db.query(SensorLatest)
            .filter(SensorLatest.sensor_id.in_([definition.id for definition in definitions]))
            .all()
        }

        histories = self._get_sensor_histories(db, definitions)
        sensors: list[DashboardSensorResponse] = []

        for sensor_type in SENSOR_ORDER:
            definition = next((item for item in definitions if item.sensor_type == sensor_type), None)
            if definition is None or not definition.is_active:
                continue

            latest_row = latest_rows.get(definition.id)
            if latest_row is None:
                continue

            sensor_histories = histories.get(definition.id, {})
            sensors.append(
                DashboardSensorResponse(
                    sensor_id=str(definition.id),
                    sensor_type=definition.sensor_type,
                    label=definition.label,
                    unit=definition.unit,
                    threshold_low=definition.threshold_low,
                    threshold_high=definition.threshold_high,
                    suggested_min=definition.suggested_min,
                    suggested_max=definition.suggested_max,
                    value=latest_row.value,
                    status=latest_row.status,
                    observed_at=latest_row.observed_at,
                    histories=SensorHistoryBundle(
                        hourly=sensor_histories.get("hourly", []),
                        daily=sensor_histories.get("daily", []),
                        weekly=sensor_histories.get("weekly", []),
                    ),
                )
            )

        return BlockSensorsResponse(
            block_id=str(block.id),
            block_name=f"{block.lanslu} - {block.crop or 'Block'}",
            generated_at=datetime.now(timezone.utc),
            sensors=sensors,
        )

    def _get_sensor_histories(
        self,
        db: Session,
        definitions: list[SensorDefinition],
    ) -> dict[object, dict[str, list[SensorHistoryPoint]]]:
        sensor_ids = [definition.id for definition in definitions]
        if not sensor_ids:
            return {}

        rows = (
            db.query(SensorReading)
            .filter(
                SensorReading.sensor_id.in_(sensor_ids),
                SensorReading.granularity.in_(("hourly", "daily", "weekly")),
            )
            .order_by(SensorReading.sensor_id.asc(), SensorReading.observed_at.asc(), SensorReading.id.asc())
            .all()
        )

        history_map: dict[object, dict[str, list[SensorHistoryPoint]]] = {}
        for row in rows:
            sensor_history = history_map.setdefault(row.sensor_id, {"hourly": [], "daily": [], "weekly": []})
            sensor_history[row.granularity].append(
                SensorHistoryPoint(
                    value=row.value,
                    status=row.status,
                    observed_at=row.observed_at,
                )
            )

        return history_map

    def _seed_granularity_history(
        self,
        db: Session,
        block: Block,
        definition: SensorDefinition,
        granularity: str,
        now: datetime,
    ) -> None:
        template = SENSOR_TEMPLATES[definition.sensor_type]
        series = self._build_series_for_block(block, template)[granularity]
        total_points = len(series)

        for index, value in enumerate(series):
            steps_back = total_points - index - 1
            if granularity == "hourly":
                observed_at = now - timedelta(hours=steps_back)
            elif granularity == "daily":
                observed_at = now - timedelta(days=steps_back)
            else:
                observed_at = now - timedelta(weeks=steps_back)

            db.add(
                SensorReading(
                    sensor_id=definition.id,
                    value=value,
                    status=calculate_sensor_status(value, definition.threshold_low, definition.threshold_high),
                    granularity=granularity,
                    observed_at=observed_at,
                )
            )

    def _build_series_for_block(self, block: Block, template: SensorTemplate) -> dict[str, list[float]]:
        return {
            "hourly": self._adjust_series(block, template, template.hourly, "hourly"),
            "daily": self._adjust_series(block, template, template.daily, "daily"),
            "weekly": self._adjust_series(block, template, template.weekly, "weekly"),
        }

    def _adjust_series(
        self,
        block: Block,
        template: SensorTemplate,
        source: tuple[float, ...],
        granularity: str,
    ) -> list[float]:
        block_offset = self._block_offset(block, template)
        ripple_scale = {
            "hourly": 0.18,
            "daily": 0.24,
            "weekly": 0.3,
        }[granularity]

        adjusted: list[float] = []
        for index, base_value in enumerate(source):
            ripple = math.sin((index + 1) * 0.85 + abs(block_offset)) * template.variation_scale * ripple_scale * 0.18
            adjusted.append(self._normalize_value(template, base_value + block_offset + ripple))

        adjusted[-1] = self._normalize_value(template, template.current + block_offset)
        return adjusted

    def _next_live_value(
        self,
        block: Block,
        definition: SensorDefinition,
        current_value: float | None,
        tick_time: datetime,
    ) -> float:
        template = SENSOR_TEMPLATES[definition.sensor_type]
        block_baseline = self._normalize_value(template, template.current + self._block_offset(block, template))
        if current_value is None:
            current_value = block_baseline

        phase = int(tick_time.timestamp() // LIVE_TICK_INTERVAL_SECONDS)
        noise = (self._stable_fraction(f"{definition.id}:{phase}") - 0.5) * template.variation_scale * 0.4
        drift_toward_baseline = (block_baseline - current_value) * 0.18
        return self._normalize_value(template, current_value + drift_toward_baseline + noise)

    def _block_offset(self, block: Block, template: SensorTemplate) -> float:
        centered_fraction = (self._stable_fraction(f"{block.id}:{template.sensor_type}") - 0.5) * 2
        scale = {
            "soil_moisture": 5.5,
            "soil_temperature": 2.5,
            "air_temperature": 3.0,
            "humidity": 8.0,
            "ph_level": 0.45,
            "sunlight": 140.0,
            "fertility": 0.3,
        }[template.sensor_type]
        return centered_fraction * scale

    def _normalize_value(self, template: SensorTemplate, value: float) -> float:
        if template.suggested_min is not None:
            value = max(template.suggested_min, value)
        if template.suggested_max is not None:
            value = min(template.suggested_max, value)
        return round(value, template.rounding)

    def _stable_fraction(self, token: str) -> float:
        digest = md5(token.encode("utf-8")).hexdigest()
        return int(digest[:8], 16) / 0xFFFFFFFF

    def _get_block_sensor_definitions(self, db: Session, block_id: object) -> list[SensorDefinition]:
        definitions = (
            db.query(SensorDefinition)
            .filter(SensorDefinition.block_id == block_id)
            .order_by(SensorDefinition.label.asc(), SensorDefinition.created_at.asc())
            .all()
        )
        order_lookup = {sensor_type: index for index, sensor_type in enumerate(SENSOR_ORDER)}
        return sorted(definitions, key=lambda definition: order_lookup.get(definition.sensor_type, 999))

    def _get_sensor_definition(self, db: Session, block_id: object, sensor_type: SensorType) -> SensorDefinition:
        definition = (
            db.query(SensorDefinition)
            .filter(
                SensorDefinition.block_id == block_id,
                SensorDefinition.sensor_type == sensor_type,
            )
            .first()
        )
        if definition is None:
            raise HTTPException(status_code=404, detail=f"Sensor {sensor_type} is not configured for this block.")
        return definition


sensor_service = SensorService()
