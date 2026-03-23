from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


RATIO_INDEX_FIELDS = ("ndvi", "ndwi", "ndre")
INTERPRETATION_KEYS = ("ndvi", "ndwi", "ndre", "evi", "lai")


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


class MetricInterpretation(BaseModel):
    value: float | None = None
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        return _validate_not_blank(value, field_name="status")


class AcquisitionMetadata(BaseModel):
    image_count: int = 0
    actual_dates: list[date] = Field(default_factory=list)

    @field_validator("image_count")
    @classmethod
    def validate_image_count(cls, value: int) -> int:
        if value < 0:
            raise ValueError("image_count must be non-negative.")
        return value

    @model_validator(mode="after")
    def normalize_actual_dates(self) -> "AcquisitionMetadata":
        self.actual_dates = sorted(dict.fromkeys(self.actual_dates))
        return self


class SatelliteContractResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    block_id: str
    source: Literal["real", "simulated"] = "real"
    freshness_status: Literal["fresh", "stale", "updating"] = "fresh"
    search_window_from: date | None = None
    search_window_to: date | None = None
    composite_date_from: date | None = None
    composite_date_to: date | None = None
    last_satellite_update: date | None = None
    ndvi: float | None = None
    ndwi: float | None = None
    evi: float | None = None
    ndre: float | None = None
    lai: float | None = None
    cloud_cover_pct: float | None = None
    pixel_count: int = 0
    map_tile_url: str | None = None
    map_tile_type: Literal["ndvi", "ndwi"] | None = None
    cache_last_updated_at: datetime | None = None
    cache_expires_at: datetime | None = None
    data_age_days: int | None = None
    data_quality: Literal["good", "degraded", "no_data"]
    acquisition_metadata: AcquisitionMetadata = Field(default_factory=AcquisitionMetadata)
    interpretations: dict[Literal["ndvi", "ndwi", "ndre", "evi", "lai"], MetricInterpretation] = Field(default_factory=dict)
    alerts: list[SatelliteAlert] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)

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

    @field_validator("evi", mode="before")
    @classmethod
    def normalize_evi(cls, value: object) -> float | None:
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

    @field_validator("limitations")
    @classmethod
    def normalize_limitations(cls, value: list[str]) -> list[str]:
        normalized = []
        for entry in value:
            normalized.append(_validate_not_blank(str(entry), field_name="limitations"))
        return normalized

    @model_validator(mode="after")
    def validate_contract(self) -> "SatelliteContractResponse":
        if (
            self.search_window_from is not None
            and self.search_window_to is not None
            and self.search_window_from > self.search_window_to
        ):
            raise ValueError("search_window_from cannot be after search_window_to.")

        if (
            self.composite_date_from is not None
            and self.composite_date_to is not None
            and self.composite_date_from > self.composite_date_to
        ):
            raise ValueError("composite_date_from cannot be after composite_date_to.")

        if self.last_satellite_update is None and self.acquisition_metadata.actual_dates:
            self.last_satellite_update = self.acquisition_metadata.actual_dates[-1]

        if self.map_tile_url and self.map_tile_type is None:
            self.map_tile_type = "ndwi"

        return self


class BlockInsightsResponse(SatelliteContractResponse):
    status: Literal["fresh", "stale", "updating"] = "fresh"
    latency_ms: int = 0
    error: str | None = None


class SatelliteTimeseriesPoint(BaseModel):
    date: datetime
    observed_on: date | None = None
    ndvi: float | None = None
    ndwi: float | None = None
    evi: float | None = None
    ndre: float | None = None
    lai: float | None = None

    @field_validator("ndvi", "ndwi", "ndre", mode="before")
    @classmethod
    def normalize_series_ratio_indices(cls, value: object) -> float | None:
        return _coerce_nullable_float(value)

    @field_validator("ndvi", "ndwi", "ndre")
    @classmethod
    def validate_series_ratio_indices(cls, value: float | None, info) -> float | None:
        return _validate_ratio_index_range(value, field_name=info.field_name)

    @field_validator("evi", mode="before")
    @classmethod
    def normalize_series_evi(cls, value: object) -> float | None:
        return _coerce_nullable_float(value)

    @field_validator("lai", mode="before")
    @classmethod
    def normalize_series_lai(cls, value: object) -> float | None:
        return _coerce_nullable_float(value)

    @field_validator("lai")
    @classmethod
    def validate_series_lai(cls, value: float | None) -> float | None:
        return _validate_non_negative(value, field_name="lai")
