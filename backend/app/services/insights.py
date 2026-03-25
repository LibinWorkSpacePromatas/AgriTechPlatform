from __future__ import annotations

from typing import Any

from app.services.alerts_engine import build_alerts
from app.services.interpretation_tables import interpret_metric, interpret_payload


def classify_ndwi(ndwi: float | None) -> tuple[str, str]:
    detail = interpret_metric("ndwi", ndwi)
    alert = next((item for item in build_alerts({"ndwi": ndwi}) if item.metric == "ndwi"), None)
    if alert is not None:
        legacy_recommendations = {
            "irrigation_alert": "Irrigation alert triggered.",
            "urgent_irrigation": "Urgent irrigation triggered.",
        }
        return alert.code, legacy_recommendations.get(alert.code, alert.message)
    return detail["status"], f'NDWI interpretation: {detail["status"]}.'


def generate_insights(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [alert.model_dump(mode="python") for alert in build_alerts(payload)]
