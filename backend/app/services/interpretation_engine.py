from __future__ import annotations

from typing import Any, Literal


MetricKey = Literal["ndvi", "ndwi", "ndre", "evi", "lai"]
MetricStatusCode = Literal[
    "no_data",
    "normal",
    "warning",
    "irrigation_alert",
    "urgent_irrigation",
    "nutrient_issue",
    "canopy_alert",
    "high_yield",
    "low_yield",
]
AlertSeverity = Literal["info", "warning", "critical"]
DashboardColorClass = Literal["good", "warning", "error"]
DashboardStatus = Literal["Normal", "Low", "High"]

INTERPRETATION_KEYS: tuple[MetricKey, ...] = ("ndvi", "ndwi", "ndre", "evi", "lai")


def interpret_metric(metric: MetricKey, value: float | None) -> dict[str, Any]:
    value = _validate_metric_value(metric, value)

    if value is None:
        return _metric_detail(
            metric=metric,
            code="no_data",
            label="No Data",
            color_class="error",
            dashboard_status="Low",
            message=f"No {metric.upper()} value is available for interpretation.",
            alert=None,
        )

    if metric == "ndvi":
        if value < 0.35:
            return _metric_detail(
                metric=metric,
                code="warning",
                label="Warning",
                color_class="warning",
                dashboard_status="Low",
                message="NDVI is below 0.35, indicating a health warning.",
                alert=_alert(metric, "warning", "warning", "Health warning triggered.", value, "NDVI < 0.35"),
            )
        return _normal_metric_detail(metric, "NDVI is within the expected operating range.")

    if metric == "ndwi":
        if value < -0.30:
            return _metric_detail(
                metric=metric,
                code="urgent_irrigation",
                label="Urgent Irrigation",
                color_class="error",
                dashboard_status="Low",
                message="NDWI is below -0.30, indicating urgent irrigation is required.",
                alert=_alert(metric, "urgent_irrigation", "critical", "Urgent irrigation triggered.", value, "NDWI < -0.30"),
            )
        if value < -0.15:
            return _metric_detail(
                metric=metric,
                code="irrigation_alert",
                label="Irrigation Alert",
                color_class="warning",
                dashboard_status="Low",
                message="NDWI is below -0.15, indicating irrigation attention is required.",
                alert=_alert(metric, "irrigation_alert", "warning", "Irrigation alert triggered.", value, "NDWI < -0.15"),
            )
        return _normal_metric_detail(metric, "NDWI is within the expected irrigation range.")

    if metric == "ndre":
        if value < 0.25:
            return _metric_detail(
                metric=metric,
                code="nutrient_issue",
                label="Nutrient Issue",
                color_class="warning",
                dashboard_status="Low",
                message="NDRE is below 0.25, indicating a nutrient issue.",
                alert=_alert(metric, "nutrient_issue", "warning", "Nutrient issue triggered.", value, "NDRE < 0.25"),
            )
        return _normal_metric_detail(metric, "NDRE is within the expected nutrient range.")

    if metric == "evi":
        if value > 0.50:
            return _metric_detail(
                metric=metric,
                code="canopy_alert",
                label="Canopy Alert",
                color_class="warning",
                dashboard_status="High",
                message="EVI is above 0.50, indicating a canopy alert.",
                alert=_alert(metric, "canopy_alert", "warning", "Canopy alert triggered.", value, "EVI > 0.50"),
            )
        return _normal_metric_detail(metric, "EVI is below the canopy alert threshold.")

    if metric == "lai":
        if value > 5:
            return _metric_detail(
                metric=metric,
                code="high_yield",
                label="High Yield",
                color_class="good",
                dashboard_status="High",
                message="LAI is above 5, indicating high yield potential.",
                alert=_alert(metric, "high_yield", "info", "High yield potential detected.", value, "LAI > 5"),
            )
        if value < 2:
            return _metric_detail(
                metric=metric,
                code="low_yield",
                label="Low Yield",
                color_class="error",
                dashboard_status="Low",
                message="LAI is below 2, indicating low yield potential.",
                alert=_alert(metric, "low_yield", "warning", "Low yield warning triggered.", value, "LAI < 2"),
            )
        return _normal_metric_detail(metric, "LAI is within the expected yield range.")

    raise ValueError(f"Unsupported metric key: {metric}")


def interpret_satellite_payload(payload: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {"alerts": []}

    for metric in INTERPRETATION_KEYS:
        detail = interpret_metric(metric, _as_nullable_float(payload.get(metric)))
        result[f"{metric}_status"] = detail["code"]
        alert = detail.get("alert")
        if alert is not None:
            result["alerts"].append(alert)

    return result


def _normal_metric_detail(metric: MetricKey, message: str) -> dict[str, Any]:
    return _metric_detail(
        metric=metric,
        code="normal",
        label="Normal",
        color_class="good",
        dashboard_status="Normal",
        message=message,
        alert=None,
    )


def _metric_detail(
    *,
    metric: MetricKey,
    code: MetricStatusCode,
    label: str,
    color_class: DashboardColorClass,
    dashboard_status: DashboardStatus,
    message: str,
    alert: dict[str, Any] | None,
) -> dict[str, Any]:
    return {
        "metric": metric,
        "code": code,
        "label": label,
        "colorClass": color_class,
        "dashboardStatus": dashboard_status,
        "message": message,
        "alert": alert,
    }


def _alert(
    metric: MetricKey,
    code: MetricStatusCode,
    severity: AlertSeverity,
    message: str,
    value: float,
    threshold: str,
) -> dict[str, Any]:
    return {
        "metric": metric,
        "code": code,
        "severity": severity,
        "message": message,
        "value": round(value, 4),
        "threshold": threshold,
    }


def _as_nullable_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _validate_metric_value(metric: MetricKey, value: float | None) -> float | None:
    if value is None:
        return None
    numeric_value = float(value)
    if metric in {"ndvi", "ndwi", "ndre", "evi"} and not -1.0 <= numeric_value <= 1.0:
        raise ValueError(f"{metric.upper()} must be between -1 and 1.")
    if metric == "lai" and numeric_value < 0:
        raise ValueError("LAI must be non-negative.")
    return numeric_value
