from __future__ import annotations

from datetime import date

from app.core.config import Settings, get_settings


def build_limitations(
    *,
    cloud_cover_pct: float | None,
    data_quality: str,
    composite_date_to: date | None,
    block_area_ha: float | None,
    ndvi: float | None,
    lai: float | None,
    today: date | None = None,
    settings: Settings | None = None,
) -> list[str]:
    active_settings = settings or get_settings()
    limitations: list[str] = []

    if data_quality == "degraded" or (
        cloud_cover_pct is not None
        and cloud_cover_pct > active_settings.satellite_degraded_cloud_threshold_pct
    ):
        limitations.append(
            f"Cloud degradation - cloud cover above {active_settings.satellite_degraded_cloud_threshold_pct:.0f}% makes this composite less reliable."
        )

    limitations.append("Satellite delay - data is not real-time (Sentinel-2 revisit is about 5 days).")

    if block_area_ha is not None and block_area_ha < active_settings.satellite_pixel_mixing_block_area_threshold_ha:
        limitations.append("Pixel mixing - small blocks can produce less accurate NDVI.")

    if ndvi is not None and ndvi > 0.8:
        limitations.append("NDVI saturation - values above 0.8 may hide canopy differences, so use EVI for finer separation.")

    limitations.append("LAI / yield separation - NDVI does not measure yield directly; use LAI as secondary yield context.")

    return limitations
