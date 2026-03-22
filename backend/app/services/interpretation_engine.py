from __future__ import annotations

from typing import Any, Literal

from app.services.alerts_engine import build_alerts
from app.services.interpretation_tables import INTERPRETATION_KEYS, MetricKey, interpret_metric as interpret_table_metric


MetricStatusCode = Literal[
    "no_data",
    "normal",
    "warning",
    "health_warning",
    "water_stress_detected",
    "severe_water_stress",
    "nutrient_issue",
    "canopy_alert",
    "high_yield",
    "low_yield",
]
DashboardColorClass = Literal["good", "warning", "error"]
DashboardStatus = Literal["Normal", "Low", "High"]


STATUS_CODE_MAP: dict[MetricKey, dict[str, MetricStatusCode]] = {
    "ndvi": {
        "No data": "no_data",
        "Dense healthy canopy": "normal",
        "Moderate health": "normal",
        "Stress detected": "warning",
        "Significant stress": "warning",
        "Bare soil": "warning",
    },
    "ndwi": {
        "No data": "no_data",
        "Well-watered": "normal",
        "Mild stress": "normal",
        "Moderate stress": "water_stress_detected",
        "Severe stress": "severe_water_stress",
    },
    "ndre": {
        "No data": "no_data",
        "High chlorophyll": "normal",
        "Moderate": "normal",
        "Low": "nutrient_issue",
        "Critical": "nutrient_issue",
    },
    "evi": {
        "No data": "no_data",
        "Sparse canopy": "normal",
        "Moderate": "normal",
        "Healthy": "normal",
        "Dense canopy": "canopy_alert",
    },
    "lai": {
        "No data": "no_data",
        "High yield": "high_yield",
        "Good yield": "normal",
        "Low yield": "low_yield",
        "Poor yield": "low_yield",
    },
}


def interpret_metric(metric: MetricKey, value: float | None) -> dict[str, Any]:
    interpretation = interpret_table_metric(metric, value)
    status = interpretation["status"]
    alert = next((item for item in build_alerts({metric: value}) if item.metric == metric), None)
    code = alert.code if alert is not None else STATUS_CODE_MAP[metric][status]
    color_class, dashboard_status = _presentation_state(metric, status)
    message = f"{metric.upper()} status: {status}."

    return {
        "metric": metric,
        "code": code,
        "label": status,
        "status": status,
        "colorClass": color_class,
        "dashboardStatus": dashboard_status,
        "message": message,
        "value": interpretation["value"],
        "alert": alert.model_dump(mode="python") if alert is not None else None,
    }


def interpret_satellite_payload(payload: dict[str, Any]) -> dict[str, Any]:
    alerts = build_alerts(payload)
    interpretations = {
        metric: interpret_metric(metric, _as_nullable_float(payload.get(metric)))
        for metric in INTERPRETATION_KEYS
    }
    return {
        "interpretations": interpretations,
        "alerts": [alert.model_dump(mode="python") for alert in alerts],
        **{f"{metric}_status": detail["code"] for metric, detail in interpretations.items()},
    }


def _presentation_state(metric: MetricKey, status: str) -> tuple[DashboardColorClass, DashboardStatus]:
    good_states = {
        "ndvi": {"Dense healthy canopy", "Moderate health"},
        "ndwi": {"Well-watered"},
        "ndre": {"High chlorophyll", "Moderate"},
        "evi": {"Healthy", "Dense canopy"},
        "lai": {"High yield", "Good yield"},
    }
    warning_states = {
        "ndvi": {"Stress detected"},
        "ndwi": {"Mild stress", "Moderate stress"},
        "ndre": {"Low"},
        "evi": {"Moderate", "Sparse canopy"},
        "lai": {"Low yield"},
    }

    if status == "No data":
        return "error", "Low"
    if status in good_states[metric]:
        return "good", "High" if "High" in status or "Dense" in status else "Normal"
    if status in warning_states[metric]:
        return "warning", "Low"
    return "error", "Low"


def _as_nullable_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
