from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Event, Thread
from time import perf_counter
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import or_, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.database import SessionLocal
from app.db.models import Block, SatelliteRefreshJob
from app.services.satellite_events import satellite_event_broker
from app.services.satellite_insights import SatelliteInsightsUnavailableError, satellite_insights_service


logger = logging.getLogger(__name__)

ACTIVE_JOB_STATUSES = {"queued", "running"}


def _chunked(values: list[Any], size: int) -> list[list[Any]]:
    return [values[index:index + size] for index in range(0, len(values), max(1, size))]


@dataclass(slots=True)
class SatelliteRefreshEnqueueResult:
    queued: bool
    active: bool
    job_status: str
    error: str | None = None


class SatelliteRefreshScheduler:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._scheduler = BackgroundScheduler(timezone="UTC")
        self._started = False
        self._stop_event = Event()
        self._workers: list[Thread] = []

    def start(self) -> None:
        if self._started:
            return

        if self._settings.satellite_scheduler_enabled:
            self._scheduler.add_job(
                self.enqueue_all_blocks,
                trigger="interval",
                days=self._settings.satellite_scheduler_interval_days,
                id="satellite-cache-refresh",
                replace_existing=True,
                max_instances=1,
                coalesce=True,
                next_run_time=datetime.now(timezone.utc)
                + timedelta(seconds=self._settings.satellite_scheduler_initial_delay_seconds),
            )
            self._scheduler.add_job(
                self.recover_stuck_jobs,
                trigger="interval",
                minutes=5,
                id="satellite-refresh-job-recovery",
                replace_existing=True,
                max_instances=1,
                coalesce=True,
            )
        if self._settings.satellite_backfill_enabled:
            self._scheduler.add_job(
                self.backfill_all_blocks,
                trigger="interval",
                days=self._settings.satellite_backfill_interval_days,
                id="satellite-history-backfill",
                replace_existing=True,
                max_instances=1,
                coalesce=True,
                next_run_time=datetime.now(timezone.utc)
                + timedelta(seconds=self._settings.satellite_backfill_initial_delay_seconds),
            )
        if self._settings.satellite_scheduler_enabled or self._settings.satellite_backfill_enabled:
            self._scheduler.start()

        self._stop_event.clear()
        for worker_index in range(max(1, self._settings.satellite_worker_count)):
            worker = Thread(
                target=self._worker_loop,
                args=(worker_index + 1,),
                name=f"satellite-worker-{worker_index + 1}",
                daemon=True,
            )
            worker.start()
            self._workers.append(worker)

        self._started = True
        logger.info(
            "event=satellite_scheduler_started workers=%s schedule_enabled=%s backfill_enabled=%s gee_enabled=%s",
            len(self._workers),
            self._settings.satellite_scheduler_enabled,
            self._settings.satellite_backfill_enabled,
            self._settings.has_gee_credentials,
        )

    def shutdown(self) -> None:
        if not self._started:
            return

        self._stop_event.set()
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)
        for worker in self._workers:
            worker.join(timeout=2)
        self._workers.clear()
        self._started = False

    def enqueue_block_refresh(
        self,
        db: Session,
        block_id: Any,
        *,
        reason: str,
        priority: int,
        delay_seconds: float = 0.0,
        force: bool = False,
    ) -> SatelliteRefreshEnqueueResult:
        if not self._settings.has_gee_credentials:
            return SatelliteRefreshEnqueueResult(
                queued=False,
                active=False,
                job_status="disabled",
                error="Satellite refresh is disabled until GEE credentials are configured.",
            )

        now = self._utcnow()
        scheduled_for = now + timedelta(seconds=max(0.0, delay_seconds))
        jobs_table = SatelliteRefreshJob.__table__
        should_update = jobs_table.c.status != "running"

        if not force:
            should_update = or_(
                jobs_table.c.status.notin_(tuple(ACTIVE_JOB_STATUSES)),
                jobs_table.c.requested_at <= now - timedelta(seconds=self._settings.satellite_refresh_throttle_seconds),
            )

        upsert = (
            insert(jobs_table)
            .values(
                block_id=block_id,
                status="queued",
                reason=reason,
                priority=priority,
                requested_at=now,
                scheduled_for=scheduled_for,
                started_at=None,
                finished_at=None,
                attempts=0,
                last_error=None,
                last_duration_ms=None,
            )
            .on_conflict_do_update(
                index_elements=[jobs_table.c.block_id],
                set_={
                    "status": "queued",
                    "reason": reason,
                    "priority": priority,
                    "requested_at": now,
                    "scheduled_for": scheduled_for,
                    "started_at": None,
                    "finished_at": None,
                    "last_error": None,
                    "last_duration_ms": None,
                },
                where=should_update,
            )
            .returning(jobs_table.c.block_id, jobs_table.c.status)
        )

        result = db.execute(upsert).mappings().first()
        db.commit()

        if result is not None:
            logger.info(
                "event=satellite_job_enqueued block_id=%s reason=%s priority=%s scheduled_for=%s",
                block_id,
                reason,
                priority,
                scheduled_for.isoformat(),
            )
            satellite_event_broker.publish(
                block_id=str(block_id),
                event="queued",
                reason=reason,
            )
            return SatelliteRefreshEnqueueResult(queued=True, active=True, job_status=str(result["status"]))

        existing_job = db.get(SatelliteRefreshJob, block_id)
        active = bool(existing_job and existing_job.status in ACTIVE_JOB_STATUSES)
        return SatelliteRefreshEnqueueResult(
            queued=False,
            active=active,
            job_status=existing_job.status if existing_job is not None else "idle",
        )

    def get_job(self, db: Session, block_id: Any) -> SatelliteRefreshJob | None:
        return db.get(SatelliteRefreshJob, block_id)

    def enqueue_all_blocks(self) -> None:
        if not self._settings.has_gee_credentials:
            logger.info("event=satellite_batch_enqueue_skipped reason=gee_credentials_missing")
            return

        with SessionLocal() as db:
            block_ids = [block_id for (block_id,) in db.query(Block.id).order_by(Block.id).all()]

        queued_count = 0
        scheduled_index = 0
        with SessionLocal() as db:
            for batch in _chunked(block_ids, self._settings.satellite_batch_size):
                for block_id in batch:
                    result = self.enqueue_block_refresh(
                        db,
                        block_id,
                        reason="scheduled",
                        priority=self._settings.satellite_schedule_priority,
                        delay_seconds=scheduled_index * self._settings.satellite_job_stagger_seconds,
                        force=True,
                    )
                    scheduled_index += 1
                    if result.queued:
                        queued_count += 1

        logger.info(
            "event=satellite_batch_enqueued total_blocks=%s queued=%s batch_size=%s interval_days=%s",
            len(block_ids),
            queued_count,
            self._settings.satellite_batch_size,
            self._settings.satellite_scheduler_interval_days,
        )

    def recover_stuck_jobs(self) -> None:
        timeout_cutoff = self._utcnow() - timedelta(seconds=self._settings.satellite_job_timeout_seconds)

        with SessionLocal() as db:
            recovered = db.execute(
                text(
                    """
                    UPDATE satellite_refresh_jobs
                    SET status = 'queued',
                        scheduled_for = NOW(),
                        finished_at = NULL,
                        started_at = NULL,
                        last_error = COALESCE(last_error, 'Recovered after worker timeout.')
                    WHERE status = 'running'
                      AND started_at IS NOT NULL
                      AND started_at <= :timeout_cutoff
                    """
                ),
                {"timeout_cutoff": timeout_cutoff},
            ).rowcount
            db.commit()

        if recovered:
            logger.warning(
                "event=satellite_jobs_recovered recovered=%s timeout_seconds=%s",
                recovered,
                self._settings.satellite_job_timeout_seconds,
            )

    def backfill_all_blocks(self) -> None:
        if not self._settings.has_gee_credentials or not self._settings.satellite_backfill_enabled:
            logger.info("event=satellite_backfill_skipped reason=disabled_or_missing_credentials")
            return

        with SessionLocal() as db:
            block_ids = [block_id for (block_id,) in db.query(Block.id).order_by(Block.id).all()]

        inserted_total = 0
        processed_blocks = 0

        for block_id in block_ids:
            with SessionLocal() as db:
                block = db.query(Block).filter(Block.id == block_id).first()
                if block is None:
                    continue

                try:
                    inserted_total += satellite_insights_service.backfill_block_timeseries(
                        db,
                        block,
                        history_days=self._settings.satellite_backfill_history_days,
                        step_days=self._settings.satellite_backfill_step_days,
                    )
                    processed_blocks += 1
                except SatelliteInsightsUnavailableError as exc:
                    db.rollback()
                    logger.warning("event=satellite_backfill_failed block_id=%s error=%s", block_id, exc)
                except Exception:
                    db.rollback()
                    logger.exception("event=satellite_backfill_failed_unexpected block_id=%s", block_id)

        logger.info(
            "event=satellite_backfill_run_completed processed_blocks=%s inserted=%s history_days=%s step_days=%s",
            processed_blocks,
            inserted_total,
            self._settings.satellite_backfill_history_days,
            self._settings.satellite_backfill_step_days,
        )

    def _worker_loop(self, worker_number: int) -> None:
        while not self._stop_event.is_set():
            if not self._settings.has_gee_credentials:
                self._stop_event.wait(timeout=self._settings.satellite_job_poll_interval_seconds)
                continue

            block_id = self._claim_next_job()
            if block_id is None:
                self._stop_event.wait(timeout=self._settings.satellite_job_poll_interval_seconds)
                continue

            self._process_job(block_id, worker_number)
            if self._settings.satellite_job_stagger_seconds > 0:
                self._stop_event.wait(timeout=self._settings.satellite_job_stagger_seconds)

    def _claim_next_job(self) -> Any | None:
        now = self._utcnow()
        with SessionLocal() as db:
            claimed = db.execute(
                text(
                    """
                    WITH candidate AS (
                        SELECT block_id
                        FROM satellite_refresh_jobs
                        WHERE status = 'queued'
                          AND scheduled_for <= :now
                        ORDER BY priority ASC, scheduled_for ASC, requested_at ASC
                        FOR UPDATE SKIP LOCKED
                        LIMIT 1
                    )
                    UPDATE satellite_refresh_jobs AS job
                    SET status = 'running',
                        started_at = :now,
                        finished_at = NULL,
                        last_error = NULL,
                        attempts = job.attempts + 1
                    FROM candidate
                    WHERE job.block_id = candidate.block_id
                    RETURNING job.block_id
                    """
                ),
                {"now": now},
            ).scalar_one_or_none()
            db.commit()
            return claimed

    def _process_job(self, block_id: Any, worker_number: int) -> None:
        started_at = perf_counter()
        satellite_event_broker.publish(
            block_id=str(block_id),
            event="running",
            reason="worker_started",
        )

        with SessionLocal() as db:
            block = db.query(Block).filter(Block.id == block_id).first()
            if block is None:
                self._mark_job_failed(db, block_id, "Block not found.", started_at)
                return

            try:
                response = satellite_insights_service.refresh_block_insights(db, block)
                self._mark_job_completed(db, block_id, started_at)
                logger.info(
                    "event=satellite_job_completed worker=%s block_id=%s data_quality=%s gee_execution_ms=%s",
                    worker_number,
                    block_id,
                    response.data_quality,
                    response.latency_ms,
                )
                satellite_event_broker.publish(
                    block_id=str(block_id),
                    event="completed",
                    reason="refresh_completed",
                    data_quality=response.data_quality,
                    latency_ms=response.latency_ms,
                )
            except SatelliteInsightsUnavailableError as exc:
                db.rollback()
                self._mark_job_failed(db, block_id, str(exc), started_at)
            except Exception:
                db.rollback()
                logger.exception("event=satellite_job_failed_unexpected worker=%s block_id=%s", worker_number, block_id)
                self._mark_job_failed(db, block_id, "Unexpected satellite refresh failure.", started_at)

    def _mark_job_completed(self, db: Session, block_id: Any, started_at: float) -> None:
        job = db.get(SatelliteRefreshJob, block_id)
        if job is None:
            return

        job.status = "idle"
        job.finished_at = self._utcnow()
        job.last_error = None
        job.last_duration_ms = int((perf_counter() - started_at) * 1000)
        db.add(job)
        db.commit()

    def _mark_job_failed(self, db: Session, block_id: Any, error: str, started_at: float) -> None:
        job = db.get(SatelliteRefreshJob, block_id)
        if job is None:
            return

        job.status = "failed"
        job.finished_at = self._utcnow()
        job.last_error = error
        job.last_duration_ms = int((perf_counter() - started_at) * 1000)
        db.add(job)
        db.commit()
        satellite_event_broker.publish(
            block_id=str(block_id),
            event="failed",
            reason="refresh_failed",
            error=error,
            latency_ms=job.last_duration_ms,
        )
        logger.warning("event=satellite_job_failed block_id=%s error=%s", block_id, error)

    @staticmethod
    def _utcnow() -> datetime:
        return datetime.now(timezone.utc)


satellite_refresh_scheduler = SatelliteRefreshScheduler()
