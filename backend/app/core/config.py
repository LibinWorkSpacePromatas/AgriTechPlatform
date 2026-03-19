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
    satellite_batch_size: int = Field(default=25, alias="SATELLITE_BATCH_SIZE")
    satellite_buffer_meters: float = Field(default=12.0, alias="SATELLITE_BUFFER_METERS")
    satellite_cloud_filter_pct: float = Field(default=20.0, alias="SATELLITE_CLOUD_FILTER_PCT")
    satellite_degraded_cloud_threshold_pct: float = Field(default=12.0, alias="SATELLITE_DEGRADED_CLOUD_THRESHOLD_PCT")
    satellite_reduction_scale_meters: int = Field(default=10, alias="SATELLITE_REDUCTION_SCALE_METERS")
    satellite_reduce_max_pixels: int = Field(default=2_000_000, alias="SATELLITE_REDUCE_MAX_PIXELS")
    satellite_enable_tile_urls: bool = Field(default=False, alias="SATELLITE_ENABLE_TILE_URLS")
    satellite_tile_palette: str = Field(
        default="#8b0000,#d95f0e,#fdd835,#66bb6a,#1b5e20",
        alias="SATELLITE_TILE_PALETTE",
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
