from __future__ import annotations

from typing import Any

from app.services.interpretation_engine import interpret_metric, interpret_satellite_payload


def classify_ndwi(ndwi: float | None) -> tuple[str, str]:
    detail = interpret_metric("ndwi", ndwi)
    return detail["code"], detail["message"]


def generate_insights(payload: dict[str, Any]) -> list[dict[str, Any]]:
    interpretation = interpret_satellite_payload(payload)
    return interpretation["alerts"]
