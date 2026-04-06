from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import md5
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import (
    Block,
    BlockDecision,
    LiveSensorBlockMapping,
    LiveSensorSource,
    LiveSensorSourceLatest,
    LiveSensorSourceReading,
    LiveSensorSyncState,
)
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


logger = logging.getLogger(__name__)
settings = get_settings()

LIVE_SENSOR_CURSOR_KEY = "global"
LIVE_SENSOR_ORDER: tuple[SensorType, ...] = ("soil_moisture", "ph_level", "ec")
LIVE_SENSOR_EXTRA_FIELDS: tuple[str, ...] = (
    "n_ppm",
    "n_kg_ha",
    "p_ppm",
    "p_kg_ha",
    "k_ppm",
    "k_kg_ha",
    "ca_ppm",
    "ca_kg_ha",
    "mg_ppm",
    "mg_kg_ha",
    "s_ppm",
    "s_kg_ha",
    "fe_ppm",
    "fe_kg_ha",
    "zn_ppm",
    "zn_kg_ha",
    "cu_ppm",
    "cu_kg_ha",
)


@dataclass(frozen=True)
class LiveSensorMetricDefinition:
    sensor_type: SensorType
    label: str
    unit: str
    threshold_low: float | None
    threshold_high: float | None
    suggested_min: float | None
    suggested_max: float | None


LIVE_SENSOR_METRICS: dict[SensorType, LiveSensorMetricDefinition] = {
    "soil_moisture": LiveSensorMetricDefinition(
        sensor_type="soil_moisture",
        label="Moisture",
        unit="%",
        threshold_low=30.0,
        threshold_high=70.0,
        suggested_min=0.0,
        suggested_max=100.0,
    ),
    "ph_level": LiveSensorMetricDefinition(
        sensor_type="ph_level",
        label="pH",
        unit="",
        threshold_low=5.5,
        threshold_high=7.5,
        suggested_min=0.0,
        suggested_max=14.0,
    ),
    "ec": LiveSensorMetricDefinition(
        sensor_type="ec",
        label="EC",
        unit="dS/m",
        threshold_low=0.02,
        threshold_high=0.35,
        suggested_min=0.0,
        suggested_max=5.0,
    ),
}


def calculate_sensor_status(
    value: float,
    threshold_low: float | None,
    threshold_high: float | None,
) -> SensorStatus:
    if threshold_high is not None and value > threshold_high:
        return "High"
    if threshold_low is not None and value < threshold_low:
        return "Low"
    return "Normal"


class LiveSensorService:
    def get_block_sensor_dashboard(self, db: Session, block_identifier: str) -> BlockSensorsResponse:
        block = resolve_block(db, block_identifier)
        self._sync_live_readings(db, block=block)
        source_ids = self._get_or_create_block_source_ids(db, block)

        if source_ids:
            self._mark_block_sensors_ready(db, block.id)

        db.commit()
        return self._build_block_response(db, block, source_ids)

    def get_sensor_history(
        self,
        db: Session,
        block_identifier: str,
        sensor_type: SensorType,
        granularity: SensorGranularity,
    ) -> SensorHistoryResponse:
        if sensor_type not in LIVE_SENSOR_ORDER:
            raise HTTPException(
                status_code=404,
                detail=f"Live sensor history is available only for {', '.join(LIVE_SENSOR_ORDER)}.",
            )

        block = resolve_block(db, block_identifier)
        self._sync_live_readings(db, block=block)
        source_ids = self._get_or_create_block_source_ids(db, block)
        db.commit()

        return SensorHistoryResponse(
            block_id=str(block.id),
            sensor_id=f"{block.id}:{sensor_type}",
            sensor_type=sensor_type,
            granularity=granularity,
            points=self._build_history_points(db, source_ids, sensor_type, granularity),
        )

    def sync_block_readings(self, db: Session, block_identifier: str) -> SensorSimulationResponse:
        block = resolve_block(db, block_identifier)
        synced_at = self._sync_live_readings(db, block=block, force=True)
        source_ids = self._get_or_create_block_source_ids(db, block)

        if source_ids:
            self._mark_block_sensors_ready(db, block.id)

        db.commit()
        return SensorSimulationResponse(
            block_id=str(block.id),
            updated_at=synced_at,
            sensor_count=len(LIVE_SENSOR_ORDER) if source_ids else 0,
        )

    def _sync_live_readings(
        self,
        db: Session,
        *,
        block: Block | None = None,
        force: bool = False,
    ) -> datetime:
        state = self._get_or_create_sync_state(db)
        now = datetime.now(timezone.utc)

        if not force and not self._should_poll(state, now):
            return now

        state.last_polled_at = now
        state.updated_at = now
        db.flush()

        try:
            payload = self._fetch_new_rows(state.last_id)
        except HTTPException:
            if block is not None and self._block_has_live_data(db, block.id):
                logger.warning("Live sensor refresh failed for block %s; serving cached readings.", block.id)
                return now
            raise

        rows = payload.get("data", [])
        source_keys = self._extract_source_keys(rows)
        if source_keys:
            self._ensure_sources(db, source_keys)

        if rows:
            self._ingest_rows(db, rows)

        next_last_id = self._safe_int(payload.get("last_id_next"))
        if next_last_id is None and rows:
            next_last_id = max((self._safe_int(row.get("id")) or 0) for row in rows)
        if next_last_id is not None:
            state.last_id = max(int(state.last_id or 0), next_last_id)
        state.last_success_at = now
        state.updated_at = now
        db.flush()
        return now

    def _fetch_new_rows(self, last_id: int | None) -> dict[str, Any]:
        params = {
            "last_id": max(0, int(last_id or 0)),
            "limit": max(1, int(settings.live_sensor_poll_limit)),
        }

        try:
            with httpx.Client(timeout=settings.live_sensor_timeout_seconds, follow_redirects=True) as client:
                response = client.get(settings.live_sensor_api_url, params=params)
                response.raise_for_status()
                payload = response.json()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Live sensor API returned {exc.response.status_code}.",
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Live sensor API request failed: {exc}",
            ) from exc
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="Live sensor API returned invalid JSON.") from exc

        if not isinstance(payload, dict) or payload.get("success") is not True:
            message = "Live sensor API request was not successful."
            if isinstance(payload, dict) and payload.get("message"):
                message = str(payload["message"])
            raise HTTPException(status_code=502, detail=message)

        return payload

    def _ensure_sources(
        self,
        db: Session,
        source_keys: list[tuple[int, str]],
    ) -> dict[tuple[int, str], LiveSensorSource]:
        if not source_keys:
            return {}

        user_ids = sorted({item[0] for item in source_keys})
        serial_numbers = sorted({item[1] for item in source_keys})
        existing_sources = (
            db.query(LiveSensorSource)
            .filter(
                LiveSensorSource.external_user_id.in_(user_ids),
                LiveSensorSource.serial_number.in_(serial_numbers),
            )
            .all()
        )
        source_map = {
            (int(source.external_user_id), str(source.serial_number)): source
            for source in existing_sources
        }

        for external_user_id, serial_number in source_keys:
            key = (external_user_id, serial_number)
            if key in source_map:
                continue

            source = LiveSensorSource(
                external_user_id=external_user_id,
                serial_number=serial_number,
                label=f"Kerala Sensor {serial_number}",
                source_region="Kerala",
                is_active=True,
            )
            db.add(source)
            db.flush()
            source_map[key] = source

        return source_map

    def _ingest_rows(self, db: Session, rows: list[dict[str, Any]]) -> None:
        source_map = self._ensure_sources(db, self._extract_source_keys(rows))
        if not source_map:
            return

        source_ids = [source.id for source in source_map.values()]
        reading_ids = [self._safe_int(row.get("id")) for row in rows if self._safe_int(row.get("id")) is not None]
        existing_readings = self._load_existing_readings(db, source_ids, reading_ids)
        existing_latest_rows = (
            db.query(LiveSensorSourceLatest)
            .filter(LiveSensorSourceLatest.source_id.in_(source_ids))
            .all()
        )
        existing_latest_map = {row.source_id: row for row in existing_latest_rows}
        latest_candidates: dict[object, dict[str, Any]] = {}

        for row in rows:
            external_reading_id = self._safe_int(row.get("id"))
            external_user_id = self._safe_int(row.get("user_id"))
            serial_number = self._clean_string(row.get("serial_number"))

            if external_reading_id is None or external_user_id is None or not serial_number:
                continue

            source = source_map.get((external_user_id, serial_number))
            if source is None:
                continue

            pair = (source.id, external_reading_id)
            soil_moisture = self._to_float(row.get("soil_moisture"))
            ec = self._to_float(row.get("ec"))
            ph_level = self._to_float(row.get("ph"))
            extra_measurements = self._extract_extra_measurements(row)
            recorded_at = self._parse_timestamp(row.get("recorded_at")) or self._parse_timestamp(row.get("created_at"))
            if recorded_at is None:
                recorded_at = datetime.now(timezone.utc)
            source_created_at = self._parse_timestamp(row.get("created_at"))
            existing_reading = existing_readings.get(pair)
            if existing_reading is None:
                db.add(
                    LiveSensorSourceReading(
                        source_id=source.id,
                        external_reading_id=external_reading_id,
                        external_user_id=external_user_id,
                        serial_number=serial_number,
                        soil_moisture=soil_moisture,
                        ec=ec,
                        ph_level=ph_level,
                        raw_payload=row,
                        recorded_at=recorded_at,
                        source_created_at=source_created_at,
                        **extra_measurements,
                    )
                )
            else:
                existing_reading.external_user_id = external_user_id
                existing_reading.serial_number = serial_number
                existing_reading.soil_moisture = soil_moisture
                existing_reading.ec = ec
                existing_reading.ph_level = ph_level
                existing_reading.recorded_at = recorded_at
                existing_reading.source_created_at = source_created_at
                existing_reading.raw_payload = row
                self._apply_extra_measurements(existing_reading, extra_measurements)

            latest_candidate = latest_candidates.get(source.id)
            if latest_candidate is None or recorded_at >= latest_candidate["observed_at"]:
                latest_candidates[source.id] = {
                    "external_reading_id": external_reading_id,
                    "soil_moisture": soil_moisture,
                    "ec": ec,
                    "ph_level": ph_level,
                    "observed_at": recorded_at,
                    "raw_payload": row,
                    **extra_measurements,
                }

        for source_id, candidate in latest_candidates.items():
            latest = existing_latest_map.get(source_id)
            if latest is None:
                db.add(
                    LiveSensorSourceLatest(
                        source_id=source_id,
                        external_reading_id=candidate["external_reading_id"],
                        soil_moisture=candidate["soil_moisture"],
                        ec=candidate["ec"],
                        ph_level=candidate["ph_level"],
                        observed_at=candidate["observed_at"],
                        raw_payload=candidate["raw_payload"],
                        **self._extract_extra_measurements(candidate),
                    )
                )
                continue

            latest_observed_at = self._coerce_datetime(latest.observed_at)
            if candidate["observed_at"] >= latest_observed_at:
                latest.external_reading_id = candidate["external_reading_id"]
                latest.soil_moisture = candidate["soil_moisture"]
                latest.ec = candidate["ec"]
                latest.ph_level = candidate["ph_level"]
                latest.observed_at = candidate["observed_at"]
                latest.raw_payload = candidate["raw_payload"]
                self._apply_extra_measurements(latest, candidate)

        db.flush()

    def _build_block_response(
        self,
        db: Session,
        block: Block,
        source_ids: list[object],
    ) -> BlockSensorsResponse:
        if not source_ids:
            return self._build_empty_response(block)

        latest_rows = (
            db.query(LiveSensorSourceLatest)
            .filter(LiveSensorSourceLatest.source_id.in_(source_ids))
            .all()
        )
        if not latest_rows:
            return self._build_empty_response(block)

        observed_candidates = [self._coerce_datetime(row.observed_at) for row in latest_rows if row.observed_at is not None]
        latest_observed_at = max(observed_candidates) if observed_candidates else datetime.now(timezone.utc)

        sensors: list[DashboardSensorResponse] = []
        for sensor_type in LIVE_SENSOR_ORDER:
            metric = LIVE_SENSOR_METRICS[sensor_type]
            values = [self._value_from_latest(row, sensor_type) for row in latest_rows]
            numeric_values = [value for value in values if value is not None]
            if not numeric_values:
                continue

            aggregate_value = round(sum(numeric_values) / len(numeric_values), 4)
            sensors.append(
                DashboardSensorResponse(
                    sensor_id=f"{block.id}:{sensor_type}",
                    sensor_type=sensor_type,
                    label=metric.label,
                    unit=metric.unit,
                    threshold_low=metric.threshold_low,
                    threshold_high=metric.threshold_high,
                    suggested_min=metric.suggested_min,
                    suggested_max=metric.suggested_max,
                    value=aggregate_value,
                    status=calculate_sensor_status(aggregate_value, metric.threshold_low, metric.threshold_high),
                    observed_at=latest_observed_at,
                    histories=SensorHistoryBundle(
                        hourly=self._build_history_points(db, source_ids, sensor_type, "hourly"),
                        daily=self._build_history_points(db, source_ids, sensor_type, "daily"),
                        weekly=self._build_history_points(db, source_ids, sensor_type, "weekly"),
                    ),
                )
            )

        return BlockSensorsResponse(
            block_id=str(block.id),
            block_name=f"{block.lanslu} - {block.crop or 'Block'}",
            generated_at=datetime.now(timezone.utc),
            sensors=sensors,
        )

    def _build_empty_response(self, block: Block) -> BlockSensorsResponse:
        return BlockSensorsResponse(
            block_id=str(block.id),
            block_name=f"{block.lanslu} - {block.crop or 'Block'}",
            generated_at=datetime.now(timezone.utc),
            sensors=[],
        )

    def _build_history_points(
        self,
        db: Session,
        source_ids: list[object],
        sensor_type: SensorType,
        granularity: SensorGranularity,
    ) -> list[SensorHistoryPoint]:
        if sensor_type not in LIVE_SENSOR_ORDER or not source_ids:
            return []

        metric = LIVE_SENSOR_METRICS[sensor_type]
        column = getattr(LiveSensorSourceReading, self._metric_column(sensor_type))
        now = datetime.now(timezone.utc)

        if granularity == "raw":
            rows = (
                db.query(
                    LiveSensorSourceReading.recorded_at.label("bucket_at"),
                    func.avg(column).label("avg_value"),
                )
                .filter(
                    LiveSensorSourceReading.source_id.in_(source_ids),
                    column.isnot(None),
                    LiveSensorSourceReading.recorded_at >= now - timedelta(days=3),
                )
                .group_by(LiveSensorSourceReading.recorded_at)
                .order_by(desc(LiveSensorSourceReading.recorded_at))
                .limit(48)
                .all()
            )
            return self._rows_to_points(reversed(rows), metric)

        if granularity == "hourly":
            bucket_expr = func.date_trunc("hour", LiveSensorSourceReading.recorded_at)
            rows = (
                db.query(
                    bucket_expr.label("bucket_at"),
                    func.avg(column).label("avg_value"),
                )
                .filter(
                    LiveSensorSourceReading.source_id.in_(source_ids),
                    column.isnot(None),
                    LiveSensorSourceReading.recorded_at >= now - timedelta(days=3),
                )
                .group_by(bucket_expr)
                .order_by(bucket_expr.desc())
                .limit(24)
                .all()
            )
            return self._rows_to_points(reversed(rows), metric)

        if granularity == "daily":
            bucket_expr = func.date_trunc("day", LiveSensorSourceReading.recorded_at)
            rows = (
                db.query(
                    bucket_expr.label("bucket_at"),
                    func.avg(column).label("avg_value"),
                )
                .filter(
                    LiveSensorSourceReading.source_id.in_(source_ids),
                    column.isnot(None),
                    LiveSensorSourceReading.recorded_at >= now - timedelta(days=90),
                )
                .group_by(bucket_expr)
                .order_by(bucket_expr.desc())
                .limit(7)
                .all()
            )
            return self._rows_to_points(reversed(rows), metric)

        if granularity == "weekly":
            bucket_expr = func.date_trunc("week", LiveSensorSourceReading.recorded_at)
            rows = (
                db.query(
                    bucket_expr.label("bucket_at"),
                    func.avg(column).label("avg_value"),
                )
                .filter(
                    LiveSensorSourceReading.source_id.in_(source_ids),
                    column.isnot(None),
                    LiveSensorSourceReading.recorded_at >= now - timedelta(days=365),
                )
                .group_by(bucket_expr)
                .order_by(bucket_expr.desc())
                .limit(6)
                .all()
            )
            return self._rows_to_points(reversed(rows), metric)

        return []

    def _rows_to_points(
        self,
        rows: Any,
        metric: LiveSensorMetricDefinition,
    ) -> list[SensorHistoryPoint]:
        return [
            SensorHistoryPoint(
                value=float(row.avg_value),
                status=calculate_sensor_status(float(row.avg_value), metric.threshold_low, metric.threshold_high),
                observed_at=self._coerce_datetime(row.bucket_at),
            )
            for row in rows
            if row.avg_value is not None
        ]

    def _get_or_create_block_source_ids(self, db: Session, block: Block) -> list[object]:
        source_ids = self._get_active_source_ids_for_block(db, block.id)
        if source_ids:
            return source_ids

        sources = (
            db.query(LiveSensorSource)
            .filter(LiveSensorSource.is_active.is_(True))
            .order_by(LiveSensorSource.external_user_id.asc(), LiveSensorSource.serial_number.asc())
            .all()
        )
        if not sources:
            return []

        selected_source = self._pick_default_source(block.id, sources)
        db.add(
            LiveSensorBlockMapping(
                user_id=block.user_id,
                block_id=block.id,
                source_id=selected_source.id,
                label=f"Default mapping for {block.lanslu}",
                is_primary=True,
                is_active=True,
            )
        )
        db.flush()
        return [selected_source.id]

    def _get_active_source_ids_for_block(self, db: Session, block_id: object) -> list[object]:
        rows = (
            db.query(LiveSensorBlockMapping.source_id)
            .filter(
                LiveSensorBlockMapping.block_id == block_id,
                LiveSensorBlockMapping.is_active.is_(True),
            )
            .order_by(LiveSensorBlockMapping.is_primary.desc(), LiveSensorBlockMapping.created_at.asc())
            .all()
        )
        return [row.source_id for row in rows]

    def _pick_default_source(
        self,
        block_id: object,
        sources: list[LiveSensorSource],
    ) -> LiveSensorSource:
        if len(sources) == 1:
            return sources[0]
        stable_index = int(md5(str(block_id).encode("utf-8")).hexdigest()[:8], 16) % len(sources)
        return sources[stable_index]

    def _load_existing_readings(
        self,
        db: Session,
        source_ids: list[object],
        external_reading_ids: list[int],
    ) -> dict[tuple[object, int], LiveSensorSourceReading]:
        if not source_ids or not external_reading_ids:
            return {}

        rows = (
            db.query(LiveSensorSourceReading)
            .filter(
                LiveSensorSourceReading.source_id.in_(source_ids),
                LiveSensorSourceReading.external_reading_id.in_(external_reading_ids),
            )
            .all()
        )
        return {
            (row.source_id, int(row.external_reading_id)): row
            for row in rows
        }

    def _mark_block_sensors_ready(self, db: Session, block_id: object) -> None:
        decision = db.get(BlockDecision, block_id)
        if decision is None:
            decision = BlockDecision(block_id=block_id)
            db.add(decision)
        decision.sensors_ready = True
        db.flush()

        try:
            from app.services.decision_engine import trigger_block_decision

            trigger_block_decision(db, block_id)
        except Exception:
            logger.debug("Block decision refresh skipped for block %s.", block_id, exc_info=True)

    def _block_has_live_data(self, db: Session, block_id: object) -> bool:
        count = (
            db.query(LiveSensorSourceLatest)
            .join(LiveSensorBlockMapping, LiveSensorBlockMapping.source_id == LiveSensorSourceLatest.source_id)
            .filter(
                LiveSensorBlockMapping.block_id == block_id,
                LiveSensorBlockMapping.is_active.is_(True),
            )
            .count()
        )
        return count > 0

    def _extract_source_keys(self, rows: list[dict[str, Any]]) -> list[tuple[int, str]]:
        keys: set[tuple[int, str]] = set()
        for row in rows:
            external_user_id = self._safe_int(row.get("user_id"))
            serial_number = self._clean_string(row.get("serial_number"))
            if external_user_id is None or not serial_number:
                continue
            keys.add((external_user_id, serial_number))
        return sorted(keys, key=lambda item: (item[0], item[1]))

    def _get_or_create_sync_state(self, db: Session) -> LiveSensorSyncState:
        state = db.get(LiveSensorSyncState, LIVE_SENSOR_CURSOR_KEY)
        if state is None:
            state = LiveSensorSyncState(cursor_key=LIVE_SENSOR_CURSOR_KEY, last_id=0)
            db.add(state)
            db.flush()
        return state

    def _should_poll(self, state: LiveSensorSyncState, now: datetime) -> bool:
        if state.last_polled_at is None:
            return True
        return (now - self._coerce_datetime(state.last_polled_at)).total_seconds() >= settings.live_sensor_min_poll_interval_seconds

    def _metric_column(self, sensor_type: SensorType) -> str:
        return {
            "soil_moisture": "soil_moisture",
            "ph_level": "ph_level",
            "ec": "ec",
        }[sensor_type]

    def _value_from_latest(self, latest: LiveSensorSourceLatest, sensor_type: SensorType) -> float | None:
        if sensor_type == "soil_moisture":
            return latest.soil_moisture
        if sensor_type == "ph_level":
            return latest.ph_level
        if sensor_type == "ec":
            return latest.ec
        return None

    def _parse_timestamp(self, value: Any) -> datetime | None:
        cleaned = self._clean_string(value)
        if not cleaned:
            return None

        try:
            parsed = datetime.fromisoformat(cleaned.replace(" ", "T"))
        except ValueError:
            return None

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    def _coerce_datetime(self, value: Any) -> datetime:
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc)
        parsed = self._parse_timestamp(value)
        if parsed is None:
            return datetime.now(timezone.utc)
        return parsed

    def _safe_int(self, value: Any) -> int | None:
        if value is None or value == "":
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _to_float(self, value: Any) -> float | None:
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _extract_extra_measurements(self, payload: dict[str, Any]) -> dict[str, float | None]:
        return {
            field_name: self._to_float(payload.get(field_name))
            for field_name in LIVE_SENSOR_EXTRA_FIELDS
        }

    def _apply_extra_measurements(self, target: Any, payload: dict[str, Any]) -> None:
        for field_name in LIVE_SENSOR_EXTRA_FIELDS:
            setattr(target, field_name, payload.get(field_name))

    def _clean_string(self, value: Any) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None


live_sensor_service = LiveSensorService()
