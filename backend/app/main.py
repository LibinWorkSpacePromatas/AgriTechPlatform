from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api import auctions, gpt, mobile, profit_risk, rental, water
from app.core.config import get_settings
from app.db.bootstrap import ensure_auction_tables, ensure_satellite_support_tables
from app.services.profit_risk import get_profit_risk_service
from app.services.satellite_insights import satellite_insights_service
from app.services.satellite_scheduler import satellite_refresh_scheduler
from app.services.weather_scheduler import weather_scheduler


logging.basicConfig(level=logging.INFO)
settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_satellite_support_tables()
    ensure_auction_tables()

    try:
        get_profit_risk_service().initialize()
    except Exception as exc:
        logger.warning("Profit & risk workbook warm-up did not complete: %s", exc)

    try:
        satellite_insights_service.initialize()
    except Exception as exc:
        logger.warning("Satellite insights warm-up did not complete: %s", exc)

    satellite_refresh_scheduler.start()
    weather_scheduler.start()
    try:
        yield
    finally:
        satellite_refresh_scheduler.shutdown()
        satellite_insights_service.shutdown()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(auctions.router, prefix="/api")
app.include_router(gpt.router, prefix="/api")
app.include_router(mobile.router, prefix="/api/mobile")
app.include_router(profit_risk.router, prefix="/api")
app.include_router(water.router, prefix="/api/water")
app.include_router(rental.router, prefix="/api/rental")
