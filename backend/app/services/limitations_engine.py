from __future__ import annotations

from datetime import date, datetime, timezone

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
    reference_day = today or datetime.now(timezone.utc).date()
    limitations: list[str] = []

    if data_quality == "degraded" or (
        cloud_cover_pct is not None
        and cloud_cover_pct > active_settings.satellite_degraded_cloud_threshold_pct
    ):
        limitations.append("Cloud-heavy imagery reduced the reliability of this composite.")

    if composite_date_to is not None and (reference_day - composite_date_to).days > 3:
        limitations.append("Satellite data is not real-time (5-day revisit cycle)")

    if block_area_ha is not None and block_area_ha < active_settings.satellite_pixel_mixing_block_area_threshold_ha:
        limitations.append("Small block size may reduce satellite accuracy")

    if ndvi is not None and ndvi > 0.8:
        limitations.append("NDVI saturation — use EVI for accuracy")

    if lai is not None:
        limitations.append("LAI is an estimated value, not direct measurement")

    limitations.append("Thresholds may vary by crop and region")
    return limitations
