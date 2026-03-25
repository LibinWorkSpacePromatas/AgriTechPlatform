from __future__ import annotations

from typing import Any

from app.schemas.satellite import SatelliteAlert


def build_alerts(payload: dict[str, Any]) -> list[SatelliteAlert]:
    alerts: list[SatelliteAlert] = []

    ndvi = _as_nullable_float(payload.get("ndvi"))
    if ndvi is not None:
        if ndvi < 0.20:
            alerts.append(
                SatelliteAlert(
                    metric="ndvi",
                    code="health_critical",
                    severity="critical",
                    message="Critical vine stress. Inspect immediately.",
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
                    message="Vine health declining. Inspect soon.",
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
                    message="Severe water stress. Irrigate immediately.",
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
                    message="Moderate water stress. Irrigate today.",
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
                message="Nitrogen deficiency likely.",
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
                message="Dense canopy detected. Leaf removal recommended.",
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
                    message="High yield potential signal detected.",
                    value=round(lai, 4),
                    threshold="LAI > 5",
                )
            )
        elif lai < 2:
            alerts.append(
                SatelliteAlert(
                    metric="lai",
                    code="low_yield",
                    severity="warning",
                    message="Low yield potential detected.",
                    value=round(lai, 4),
                    threshold="LAI < 2",
                )
            )

    return alerts


def _as_nullable_float(value: Any) -> float | None:
    if value in {None, ""}:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
