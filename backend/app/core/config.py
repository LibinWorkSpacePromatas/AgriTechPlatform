from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        enable_decoding=False,
    )

    app_name: str = "AgriTech API"
    database_url: str = Field(default="postgresql://postgres:libin41@localhost:5432/agritech", alias="DATABASE_URL")
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:4200",
            "http://127.0.0.1:4200",
        ],
        alias="CORS_ORIGINS",
    )

    gee_project: str | None = Field(default=None, alias="GEE_PROJECT")
    gee_service_account_email: str | None = Field(default=None, alias="GEE_SERVICE_ACCOUNT_EMAIL")
    gee_service_account_json: str | None = Field(default=None, alias="GEE_SERVICE_ACCOUNT_JSON")

    satellite_cache_ttl_days: int = Field(default=5, alias="SATELLITE_CACHE_TTL_DAYS")
    satellite_composite_window_days: int = Field(default=14, alias="SATELLITE_COMPOSITE_WINDOW_DAYS")
    satellite_scheduler_interval_days: int = Field(default=5, alias="SATELLITE_SCHEDULER_INTERVAL_DAYS")
    satellite_scheduler_initial_delay_seconds: int = Field(default=30, alias="SATELLITE_SCHEDULER_INITIAL_DELAY_SECONDS")
    satellite_scheduler_enabled: bool = Field(default=True, alias="SATELLITE_SCHEDULER_ENABLED")
    satellite_backfill_enabled: bool = Field(default=True, alias="SATELLITE_BACKFILL_ENABLED")
    satellite_backfill_history_days: int = Field(default=84, alias="SATELLITE_BACKFILL_HISTORY_DAYS")
    satellite_backfill_step_days: int = Field(default=7, alias="SATELLITE_BACKFILL_STEP_DAYS")
    satellite_backfill_interval_days: int = Field(default=7, alias="SATELLITE_BACKFILL_INTERVAL_DAYS")
    satellite_backfill_initial_delay_seconds: int = Field(default=15, alias="SATELLITE_BACKFILL_INITIAL_DELAY_SECONDS")
    satellite_batch_size: int = Field(default=25, alias="SATELLITE_BATCH_SIZE")
    satellite_buffer_meters: float = Field(default=10.0, alias="SATELLITE_BUFFER_METERS")
    satellite_simplify_tolerance_meters: float = Field(default=3.0, alias="SATELLITE_SIMPLIFY_TOLERANCE_METERS")
    satellite_cloud_filter_pct: float = Field(default=20.0, alias="SATELLITE_CLOUD_FILTER_PCT")
    satellite_degraded_cloud_threshold_pct: float = Field(default=50.0, alias="SATELLITE_DEGRADED_CLOUD_THRESHOLD_PCT")
    satellite_pixel_mixing_block_area_threshold_ha: float = Field(
        default=1.0,
        alias="SATELLITE_PIXEL_MIXING_BLOCK_AREA_THRESHOLD_HA",
    )
    satellite_reduction_scale_meters: int = Field(default=10, alias="SATELLITE_REDUCTION_SCALE_METERS")
    satellite_reduce_max_pixels: int = Field(default=2_000_000, alias="SATELLITE_REDUCE_MAX_PIXELS")
    satellite_enable_tile_urls: bool = Field(default=False, alias="SATELLITE_ENABLE_TILE_URLS")
    satellite_tile_palette: str = Field(
        default="#8b0000,#d95f0e,#fdd835,#66bb6a,#1b5e20",
        alias="SATELLITE_TILE_PALETTE",
    )
    satellite_request_priority: int = Field(default=10, alias="SATELLITE_REQUEST_PRIORITY")
    satellite_schedule_priority: int = Field(default=100, alias="SATELLITE_SCHEDULE_PRIORITY")
    satellite_refresh_throttle_seconds: int = Field(default=300, alias="SATELLITE_REFRESH_THROTTLE_SECONDS")
    satellite_job_poll_interval_seconds: float = Field(default=1.0, alias="SATELLITE_JOB_POLL_INTERVAL_SECONDS")
    satellite_job_stagger_seconds: float = Field(default=0.35, alias="SATELLITE_JOB_STAGGER_SECONDS")
    satellite_job_timeout_seconds: int = Field(default=900, alias="SATELLITE_JOB_TIMEOUT_SECONDS")
    satellite_worker_count: int = Field(default=2, alias="SATELLITE_WORKER_COUNT")
    satellite_gee_timeout_seconds: int = Field(default=90, alias="SATELLITE_GEE_TIMEOUT_SECONDS")
    satellite_event_retention_days: int = Field(default=7, alias="SATELLITE_EVENT_RETENTION_DAYS")

    openrouter_api_key: str | None = Field(default=None, alias="OPENROUTER_API_KEY")
    openrouter_model: str = Field(default="google/gemini-2.0-flash-001", alias="OPENROUTER_MODEL")
    newsdata_api_key: str | None = Field(default=None, alias="NEWSDATA_API_KEY")
    profit_risk_dataset_path: str = Field(
        default=str(Path(__file__).resolve().parents[2] / "Dataset" / "SA_Farmgate_Prices_Final.xlsx"),
        alias="PROFIT_RISK_DATASET_PATH",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                return []
            if normalized.startswith("["):
                return json.loads(normalized)
            return [origin.strip() for origin in normalized.split(",") if origin.strip()]
        return value

    @property
    def has_gee_credentials(self) -> bool:
        return bool(self.gee_project and self.gee_service_account_json)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
