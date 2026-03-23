from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

from app.core.config import Settings, get_settings
from app.db.models import SatelliteRefreshEventRecord
from app.db.session import SessionLocal


SatelliteRefreshEventType = Literal["queued", "running", "completed", "failed"]


@dataclass(slots=True)
class SatelliteRefreshEvent:
    id: int
    block_id: str
    event: SatelliteRefreshEventType
    timestamp: datetime
    reason: str
    data_quality: str | None = None
    error: str | None = None
    latency_ms: int | None = None


class SatelliteEventBroker:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def publish(
        self,
        *,
        block_id: str,
        event: SatelliteRefreshEventType,
        reason: str,
        data_quality: str | None = None,
        error: str | None = None,
        latency_ms: int | None = None,
    ) -> None:
        now = datetime.now(timezone.utc)
        with SessionLocal() as db:
            db.add(
                SatelliteRefreshEventRecord(
                    block_id=block_id,
                    event=event,
                    reason=reason,
                    data_quality=data_quality,
                    error=error,
                    latency_ms=latency_ms,
                    created_at=now,
                )
            )

            retention_cutoff = now - timedelta(days=self._settings.satellite_event_retention_days)
            (
                db.query(SatelliteRefreshEventRecord)
                .filter(SatelliteRefreshEventRecord.created_at < retention_cutoff)
                .delete(synchronize_session=False)
            )
            db.commit()

    def list_events(
        self,
        *,
        block_id: str,
        after_id: int | None = None,
        limit: int = 50,
    ) -> list[SatelliteRefreshEvent]:
        with SessionLocal() as db:
            query = (
                db.query(SatelliteRefreshEventRecord)
                .filter(SatelliteRefreshEventRecord.block_id == block_id)
                .order_by(SatelliteRefreshEventRecord.id.asc())
                .limit(max(1, limit))
            )
            if after_id is not None:
                query = query.filter(SatelliteRefreshEventRecord.id > after_id)

            records = query.all()

        return [
            SatelliteRefreshEvent(
                id=record.id,
                block_id=str(record.block_id),
                event=record.event,
                timestamp=record.created_at,
                reason=record.reason,
                data_quality=record.data_quality,
                error=record.error,
                latency_ms=record.latency_ms,
            )
            for record in records
        ]


satellite_event_broker = SatelliteEventBroker()
