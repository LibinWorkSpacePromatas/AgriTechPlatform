from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api import gpt, water
from app.core.config import get_settings
from app.db.bootstrap import ensure_satellite_support_tables
from app.services.satellite_insights import satellite_insights_service
from app.services.satellite_scheduler import satellite_refresh_scheduler


logging.basicConfig(level=logging.INFO)
settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_satellite_support_tables()

    try:
        satellite_insights_service.initialize()
    except Exception as exc:
        logger.warning("Satellite insights warm-up did not complete: %s", exc)

    satellite_refresh_scheduler.start()
    try:
        yield
    finally:
        satellite_refresh_scheduler.shutdown()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(gpt.router, prefix="/api")
app.include_router(water.router, prefix="/api/water")
