from __future__ import annotations

from typing import Any, Literal


MetricKey = Literal["ndvi", "ndwi", "ndre", "evi", "lai"]
INTERPRETATION_KEYS: tuple[MetricKey, ...] = ("ndvi", "ndwi", "ndre", "evi", "lai")


def interpret_metric(metric: MetricKey, value: float | None) -> dict[str, Any]:
    numeric_value = _validate_metric_value(metric, value)
    if numeric_value is None:
        return {"value": None, "status": "No data"}

    status = _interpret_status(metric, numeric_value)
    return {
        "value": round(numeric_value, 4),
        "status": status,
    }


def interpret_payload(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        metric: interpret_metric(metric, _as_nullable_float(payload.get(metric)))
        for metric in INTERPRETATION_KEYS
    }


def _interpret_status(metric: MetricKey, value: float) -> str:
    if metric == "ndvi":
        if value < 0:
            return "Bare soil"
        if value < 0.2:
            return "Significant stress"
        if value < 0.4:
            return "Stress detected"
        if value < 0.6:
            return "Moderate health"
        return "Dense healthy canopy"

    if metric == "ndwi":
        if value < -0.3:
            return "Severe stress"
        if value < -0.1:
            return "Moderate stress"
        if value <= 0.1:
            return "Mild stress"
        return "Well-watered"

    if metric == "evi":
        if value <= 0.15:
            return "Sparse canopy"
        if value <= 0.35:
            return "Moderate"
        if value <= 0.5:
            return "Healthy"
        return "Dense canopy"

    if metric == "ndre":
        if value < 0.12:
            return "Critical"
        if value < 0.25:
            return "Low"
        if value <= 0.4:
            return "Moderate"
        return "High chlorophyll"

    if metric == "lai":
        if value < 1.5:
            return "Poor yield"
        if value < 3:
            return "Low yield"
        if value < 5:
            return "Good yield"
        return "High yield"

    raise ValueError(f"Unsupported metric key: {metric}")


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
    if metric in {"ndvi", "ndwi", "ndre"} and not -1.0 <= numeric_value <= 1.0:
        raise ValueError(f"{metric.upper()} must be between -1 and 1.")
    if metric == "lai" and numeric_value < 0:
        raise ValueError("LAI must be non-negative.")
    return numeric_value
