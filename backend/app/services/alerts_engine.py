from __future__ import annotations

from typing import Any

from app.schemas.satellite import SatelliteAlert


def build_alerts(payload: dict[str, Any], block_name: str) -> list[SatelliteAlert]:
    alerts: list[SatelliteAlert] = []
    block_label = block_name.strip() if block_name and block_name.strip() else "Block"

    ndvi = _as_nullable_float(payload.get("ndvi"))
    if ndvi is not None:
        if ndvi < 0.20:
            alerts.append(
                SatelliteAlert(
                    metric="ndvi",
                    code="health_critical",
                    severity="critical",
                    message=f"Critical vine stress detected in {block_label}. Urgent field inspection required.",
                    value=round(ndvi, 4),
                    threshold="NDVI < 0.20",
                )
            )
        elif ndvi < 0.35:
            alerts.append(
                SatelliteAlert(
                    metric="ndvi",
                    code="health_warning",
                    severity="warning",
                    message=f"Vine health declining in {block_label}. Field inspection recommended this week.",
                    value=round(ndvi, 4),
                    threshold="NDVI < 0.35",
                )
            )

    ndwi = _as_nullable_float(payload.get("ndwi"))
    if ndwi is not None:
        if ndwi < -0.30:
            alerts.append(
                SatelliteAlert(
                    metric="ndwi",
                    code="urgent_irrigation",
                    severity="critical",
                    message=f"Severe water deficit in {block_label}. Irrigate today. Yield damage risk.",
                    value=round(ndwi, 4),
                    threshold="NDWI < -0.30",
                )
            )
        elif ndwi < -0.15:
            alerts.append(
                SatelliteAlert(
                    metric="ndwi",
                    code="irrigation_alert",
                    severity="warning",
                    message=f"Water stress detected in {block_label}. Consider irrigation within 2–3 days.",
                    value=round(ndwi, 4),
                    threshold="NDWI < -0.15",
                )
            )

    ndre = _as_nullable_float(payload.get("ndre"))
    if ndre is not None and ndre < 0.25:
        alerts.append(
            SatelliteAlert(
                metric="ndre",
                code="nutrient_issue",
                severity="warning",
                message=f"Nitrogen deficiency likely in {block_label}. Foliar spray recommended.",
                value=round(ndre, 4),
                threshold="NDRE < 0.25",
            )
        )

    evi = _as_nullable_float(payload.get("evi"))
    if evi is not None and evi > 0.50:
        alerts.append(
            SatelliteAlert(
                metric="evi",
                code="canopy_alert",
                severity="warning",
                message=f"Dense canopy in {block_label}. Leaf removal may improve airflow and reduce mildew risk.",
                value=round(evi, 4),
                threshold="EVI > 0.50",
            )
        )

    lai = _as_nullable_float(payload.get("lai"))
    if lai is not None:
        if lai > 5:
            alerts.append(
                SatelliteAlert(
                    metric="lai",
                    code="high_yield",
                    severity="info",
                    message=f"Canopy density suggests above-average yield potential for {block_label}.",
                    value=round(lai, 4),
                    threshold="LAI > 5.0",
                )
            )
        elif lai < 2:
            alerts.append(
                SatelliteAlert(
                    metric="lai",
                    code="low_yield",
                    severity="warning",
                    message="Below-average canopy development. Revise harvest tonnage forecast downward.",
                    value=round(lai, 4),
                    threshold="LAI < 2.0",
                )
            )

    cloud = _as_nullable_float(payload.get("cloud_cover_pct"))
    if cloud is not None and cloud > 50:
        alerts.append(
            SatelliteAlert(
                metric="cloud_cover",
                code="data_quality",
                severity="warning",
                message=f"Satellite data for {block_label} may be degraded due to cloud cover.",
                value=round(cloud, 2),
                threshold="cloud_cover_pct > 50",
            )
        )

    alerts.sort(key=lambda alert: _priority_rank(alert.metric))
    return alerts


def _as_nullable_float(value: Any) -> float | None:
    if value in {None, ""}:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _priority_rank(metric: str) -> int:
    priority = {
        "ndwi": 1,
        "ndvi": 2,
        "ndre": 3,
        "evi": 4,
        "lai": 5,
        "cloud_cover": 6,
    }
    return priority.get(metric, 99)
