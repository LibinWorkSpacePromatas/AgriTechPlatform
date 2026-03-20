from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from queue import Empty, Full, Queue
from threading import Lock
from typing import Literal


SatelliteRefreshEventType = Literal["queued", "running", "completed", "failed"]


@dataclass(slots=True)
class SatelliteRefreshEvent:
    block_id: str
    event: SatelliteRefreshEventType
    timestamp: datetime
    reason: str
    data_quality: str | None = None
    error: str | None = None
    latency_ms: int | None = None


@dataclass(slots=True)
class SatelliteEventSubscriber:
    queue: Queue[SatelliteRefreshEvent]
    block_id: str | None = None


class SatelliteEventBroker:
    def __init__(self) -> None:
        self._lock = Lock()
        self._subscribers: list[SatelliteEventSubscriber] = []

    def subscribe(self, *, block_id: str | None = None) -> SatelliteEventSubscriber:
        subscriber = SatelliteEventSubscriber(queue=Queue(maxsize=32), block_id=block_id)
        with self._lock:
            self._subscribers.append(subscriber)
        return subscriber

    def unsubscribe(self, subscriber: SatelliteEventSubscriber) -> None:
        with self._lock:
            self._subscribers = [item for item in self._subscribers if item is not subscriber]

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
        payload = SatelliteRefreshEvent(
            block_id=str(block_id),
            event=event,
            timestamp=datetime.now(timezone.utc),
            reason=reason,
            data_quality=data_quality,
            error=error,
            latency_ms=latency_ms,
        )
        with self._lock:
            subscribers = list(self._subscribers)

        for subscriber in subscribers:
            if subscriber.block_id is not None and subscriber.block_id != payload.block_id:
                continue
            try:
                subscriber.queue.put_nowait(payload)
            except Full:
                try:
                    subscriber.queue.get_nowait()
                except Empty:
                    pass
                try:
                    subscriber.queue.put_nowait(payload)
                except Full:
                    continue


satellite_event_broker = SatelliteEventBroker()
