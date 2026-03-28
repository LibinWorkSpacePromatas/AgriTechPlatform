from __future__ import annotations

import logging
from datetime import datetime, timezone
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from app.db.database import SessionLocal, engine
from app.db.models import Block
from app.services.weather_ingest import fetch_weather, store_weather, get_block_info

logger = logging.getLogger(__name__)

class WeatherScheduler:
    def __init__(self) -> None:
        self._scheduler = BackgroundScheduler(timezone="Australia/Sydney")
        self._started = False

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
                        weather_data = fetch_weather(lat, lon, timezone=tz)
                        store_weather(db, block.id, weather_data, timezone_str=tz)
                        success_count += 1
                except Exception as exc:
                    logger.warning("event=weather_refresh_failed block_id=%s error=%s", block.id, exc)
            
            logger.info("event=weather_batch_refresh_complete success=%s total=%s", success_count, len(blocks))
        finally:
            db.close()

weather_scheduler = WeatherScheduler()
