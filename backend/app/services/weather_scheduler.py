from __future__ import annotations

import logging
from datetime import datetime, timezone
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.db.database import SessionLocal, engine
from app.db.models import Block
from app.services.weather_ingest import fetch_weather, store_weather, get_block_info, query_weather_ranges, build_weather_summary

logger = logging.getLogger(__name__)

class WeatherScheduler:
    def __init__(self) -> None:
        self._scheduler = BackgroundScheduler(timezone="Australia/Sydney")
        self._started = False
        self._settings = get_settings()

    def start(self) -> None:
        if self._started:
            return

        # Background job: Runs every 15 minutes
        self._scheduler.add_job(
            self.refresh_all_blocks_weather,
            trigger="interval",
            minutes=15,
            id="weather-background-ingest",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            next_run_time=datetime.now(timezone.utc)
        )
        
        self._scheduler.start()
        self._started = True
        logger.info("Weather background scheduler started (Interval: 15 min)")

    def refresh_all_blocks_weather(self) -> None:
        """
        Background task to refresh weather for all blocks in the system.
        """
        db: Session = SessionLocal()
        try:
            blocks = db.query(Block).all()
            logger.info("event=weather_batch_refresh_start count=%s", len(blocks))
            
            success_count = 0
            for block in blocks:
                try:
                    info = get_block_info(db, block.id)
                    lat, lon, tz = info["lat"], info["lon"], info["timezone"]
                    if lat is not None and lon is not None:
                        previous_summary = build_weather_summary(query_weather_ranges(db, block.id))
                        weather_data = fetch_weather(lat, lon, timezone=tz)
                        store_weather(db, block.id, weather_data, timezone_str=tz)
                        latest_summary = build_weather_summary(query_weather_ranges(db, block.id))
                        if self._weather_changed_significantly(previous_summary, latest_summary):
                            try:
                                from app.services.decision_engine import trigger_block_decision
                                trigger_block_decision(db, block.id)
                                logger.info("event=decision_triggered_by_weather block_id=%s", block.id)
                            except Exception as exc:
                                logger.warning("event=decision_trigger_failed_by_weather block_id=%s error=%s", block.id, exc)
                        success_count += 1
                except Exception as exc:
                    logger.warning("event=weather_refresh_failed block_id=%s error=%s", block.id, exc)
            
            logger.info("event=weather_batch_refresh_complete success=%s total=%s", success_count, len(blocks))
        finally:
            db.close()

    def _weather_changed_significantly(self, previous: dict[str, float | None], current: dict[str, float | None]) -> bool:
        rain_last_24h_before = float(previous.get("rain_last_24h") or 0.0)
        rain_last_24h_after = float(current.get("rain_last_24h") or 0.0)
        rain_next_3d_before = float(previous.get("rain_next_3d") or 0.0)
        rain_next_3d_after = float(current.get("rain_next_3d") or 0.0)
        avg_temp_before = previous.get("avg_temp_last_24h")
        avg_temp_after = current.get("avg_temp_last_24h")

        if abs(rain_last_24h_after - rain_last_24h_before) > self._settings.decision_weather_rain_delta_mm:
            return True

        if (
            rain_next_3d_before <= self._settings.decision_weather_rain_forecast_trigger_mm
            and rain_next_3d_after > self._settings.decision_weather_rain_forecast_trigger_mm
        ):
            return True

        if avg_temp_before is not None and avg_temp_after is not None:
            if abs(float(avg_temp_after) - float(avg_temp_before)) > self._settings.decision_weather_temp_delta_c:
                return True

        return False

weather_scheduler = WeatherScheduler()
