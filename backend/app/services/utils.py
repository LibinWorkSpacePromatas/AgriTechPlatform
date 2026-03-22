from __future__ import annotations

from datetime import date
from typing import Any


SATELLITE_CONTRACT_RESPONSE_FIELDS = {
    "block_id",
    "source",
    "freshness_status",
    "search_window_from",
    "search_window_to",
    "composite_date_from",
    "composite_date_to",
    "last_satellite_update",
    "ndvi",
    "ndwi",
    "evi",
    "ndre",
    "lai",
    "cloud_cover_pct",
    "pixel_count",
    "map_tile_url",
    "map_tile_type",
    "cache_last_updated_at",
    "cache_expires_at",
    "data_age_days",
    "data_quality",
    "acquisition_metadata",
    "interpretations",
    "alerts",
    "limitations",
}


def calculate_data_age(cache: Any) -> int:
    """
    Calculates the data age in days based on the composite_date_to of the cache.
    """
    if not cache or not cache.composite_date_to:
        return 0
    return (date.today() - cache.composite_date_to).days


def calculate_confidence(cache: Any) -> str:
    """
    Calculates the confidence level (low, medium, high) based on data quality and pixel count.
    """
    if not cache:
        return "low"

    freshness_status = getattr(cache, "freshness_status", getattr(cache, "status", "fresh"))
    if freshness_status != "fresh":
        return "low"

    data_age_days = calculate_data_age(cache)

    if cache.data_quality == "good" and data_age_days < 7:
        return "high"

    if 7 <= data_age_days < 14:
        return "medium"

    return "low"


def build_satellite_contract_payload(response: Any) -> dict[str, Any]:
    if response is None:
        return {}

    if hasattr(response, "model_dump"):
        return response.model_dump(include=SATELLITE_CONTRACT_RESPONSE_FIELDS, mode="python")

    return {
        field_name: getattr(response, field_name)
        for field_name in SATELLITE_CONTRACT_RESPONSE_FIELDS
        if hasattr(response, field_name)
    }
