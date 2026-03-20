from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


RATIO_INDEX_FIELDS = ("ndvi", "ndwi", "ndre", "evi")


def _coerce_nullable_float(value: object) -> float | None:
    if value in {None, ""}:
        return None
    return float(value)


def _validate_ratio_index_range(value: float | None, *, field_name: str) -> float | None:
    if value is None:
        return None
    if not -1.0 <= value <= 1.0:
        raise ValueError(f"{field_name} must be between -1 and 1.")
    return value


def _validate_non_negative(value: float | None, *, field_name: str) -> float | None:
    if value is None:
        return None
    if value < 0:
        raise ValueError(f"{field_name} must be non-negative.")
    return value


def _validate_not_blank(value: str, *, field_name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name} cannot be blank.")
    return normalized


class SatelliteAlert(BaseModel):
    metric: Literal["ndvi", "ndwi", "ndre", "evi", "lai"]
    code: str
    severity: Literal["info", "warning", "critical"]
    message: str
    value: float
    threshold: str

    @field_validator("message", "threshold")
    @classmethod
    def validate_text_fields(cls, value: str, info) -> str:
        return _validate_not_blank(value, field_name=info.field_name)

    @model_validator(mode="after")
    def validate_value_range(self) -> "SatelliteAlert":
        if self.metric in RATIO_INDEX_FIELDS:
            _validate_ratio_index_range(self.value, field_name=self.metric)
        elif self.metric == "lai":
            _validate_non_negative(self.value, field_name=self.metric)
        return self


class SatelliteContractResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    block_id: str
    source: Literal["real", "simulated"] = "real"
    freshness_status: Literal["fresh", "stale", "updating"] = "fresh"
    composite_date_from: date | None = None
    composite_date_to: date | None = None
    ndvi: float | None = None
    ndwi: float | None = None
    evi: float | None = None
    ndre: float | None = None
    lai: float | None = None
    cloud_cover_pct: float | None = None
    pixel_count: int = 0
    map_tile_url: str | None = None
    cache_last_updated_at: datetime | None = None
    cache_expires_at: datetime | None = None
    data_quality: Literal["good", "degraded", "no_data"]

    @field_validator("block_id")
    @classmethod
    def validate_block_id(cls, value: str) -> str:
        return _validate_not_blank(value, field_name="block_id")

    @field_validator("source", mode="before")
    @classmethod
    def normalize_source(cls, value: object) -> str:
        if value in {"cache", "gee", "real", None, ""}:
            return "real"
        if value == "simulated":
            return "simulated"
        return "real"

    @field_validator(*RATIO_INDEX_FIELDS, mode="before")
    @classmethod
    def normalize_ratio_indices(cls, value: object) -> float | None:
        return _coerce_nullable_float(value)

    @field_validator(*RATIO_INDEX_FIELDS)
    @classmethod
    def validate_ratio_indices(cls, value: float | None, info) -> float | None:
        return _validate_ratio_index_range(value, field_name=info.field_name)

    @field_validator("lai", "cloud_cover_pct", mode="before")
    @classmethod
    def normalize_optional_floats(cls, value: object) -> float | None:
        return _coerce_nullable_float(value)

    @field_validator("lai")
    @classmethod
    def validate_lai(cls, value: float | None) -> float | None:
        return _validate_non_negative(value, field_name="lai")

    @field_validator("cloud_cover_pct")
    @classmethod
    def validate_cloud_cover(cls, value: float | None) -> float | None:
        if value is None:
            return None
        if not 0.0 <= value <= 100.0:
            raise ValueError("cloud_cover_pct must be between 0 and 100.")
        return value

    @field_validator("pixel_count")
    @classmethod
    def validate_pixel_count(cls, value: int) -> int:
        if value < 0:
            raise ValueError("pixel_count must be non-negative.")
        return value

    @field_validator("map_tile_url", mode="before")
    @classmethod
    def normalize_tile_url(cls, value: object) -> str | None:
        if value in {None, ""}:
            return None
        return str(value)

    @model_validator(mode="after")
    def validate_date_window(self) -> "SatelliteContractResponse":
        if (
            self.composite_date_from is not None
            and self.composite_date_to is not None
            and self.composite_date_from > self.composite_date_to
        ):
            raise ValueError("composite_date_from cannot be after composite_date_to.")
        return self


class BlockInsightsResponse(SatelliteContractResponse):
    status: Literal["fresh", "stale", "updating"] = "fresh"
    latency_ms: int = 0
    error: str | None = None
    ndvi_status: str = "no_data"
    ndwi_status: str = "no_data"
    ndre_status: str = "no_data"
    evi_status: str = "no_data"
    lai_status: str = "no_data"
    alerts: list[SatelliteAlert] = Field(default_factory=list)


class SatelliteTimeseriesPoint(BaseModel):
    date: datetime
    observed_on: date | None = None
    ndvi: float | None = None
    ndwi: float | None = None

    @field_validator("ndvi", "ndwi", mode="before")
    @classmethod
    def normalize_series_indices(cls, value: object) -> float | None:
        return _coerce_nullable_float(value)

    @field_validator("ndvi", "ndwi")
    @classmethod
    def validate_series_indices(cls, value: float | None, info) -> float | None:
        return _validate_ratio_index_range(value, field_name=info.field_name)
