from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from time import perf_counter
from typing import Any, Iterable, Sequence

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import Settings, get_settings
from app.db.database import SessionLocal
from app.db.models import Block
from app.services.satellite_insights import SatelliteInsightsUnavailableError, satellite_insights_service


logger = logging.getLogger(__name__)


def _chunked(values: Sequence[Any], size: int) -> Iterable[Sequence[Any]]:
    for index in range(0, len(values), size):
        yield values[index:index + size]


class SatelliteRefreshScheduler:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._scheduler = BackgroundScheduler(timezone="UTC")
        self._started = False

    def start(self) -> None:
        if self._started or not self._settings.satellite_scheduler_enabled:
            return

        if not self._settings.has_gee_credentials:
            logger.info("Satellite refresh scheduler is disabled until GEE credentials are configured.")
            return

        self._scheduler.add_job(
            self.refresh_all_blocks,
            trigger="interval",
            days=self._settings.satellite_scheduler_interval_days,
            id="satellite-cache-refresh",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            next_run_time=datetime.now(timezone.utc) + timedelta(seconds=self._settings.satellite_scheduler_initial_delay_seconds),
        )
        self._scheduler.start()
        self._started = True
        logger.info("Satellite refresh scheduler started with %s-day interval.", self._settings.satellite_scheduler_interval_days)

    def shutdown(self) -> None:
        if not self._started:
            return
        self._scheduler.shutdown(wait=False)
        self._started = False

    def refresh_all_blocks(self) -> None:
        started_at = perf_counter()

        with SessionLocal() as db:
            block_ids = [block_id for (block_id,) in db.query(Block.id).order_by(Block.id).all()]

        success_count = 0
        failure_count = 0
        no_data_count = 0

        for batch in _chunked(block_ids, self._settings.satellite_batch_size):
            with SessionLocal() as db:
                blocks = db.query(Block).filter(Block.id.in_(batch)).all()
                for block in blocks:
                    try:
                        response = satellite_insights_service.get_block_insights(db, block, force_refresh=True)
                        success_count += 1
                        if response.data_quality == "no_data":
                            no_data_count += 1
                    except SatelliteInsightsUnavailableError as exc:
                        failure_count += 1
                        db.rollback()
                        logger.warning("Skipping block %s during scheduled satellite refresh: %s", block.id, exc)
                    except Exception:
                        failure_count += 1
                        db.rollback()
                        logger.exception("Unexpected error refreshing satellite insights for block %s.", block.id)

        logger.info(
            "Satellite refresh finished in %sms. processed=%s success=%s no_data=%s failed=%s",
            int((perf_counter() - started_at) * 1000),
            len(block_ids),
            success_count,
            no_data_count,
            failure_count,
        )


satellite_refresh_scheduler = SatelliteRefreshScheduler()
