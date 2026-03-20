from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.db.models import Block
from app.services.interpretation_tables import interpret_payload
from app.services.limitations_engine import build_limitations


METRIC_ORDER = ("ndvi", "ndwi", "ndre", "evi", "lai")
METRIC_TITLES = {
    "ndvi": "Vegetation Health",
    "ndwi": "Water Stress",
    "ndre": "Nutrient Status",
    "evi": "Canopy Density",
    "lai": "Yield Potential",
}


def build_block_insights(block: Block, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    if not overrides:
        raise ValueError("Dashboard insights require cache-backed satellite metrics from satellite_insights_service.")

    missing_metrics = [metric for metric in METRIC_ORDER if overrides.get(metric) is None]
    if missing_metrics:
        missing_list = ", ".join(metric.upper() for metric in missing_metrics)
        raise ValueError(f"Dashboard insights require cache-backed satellite metrics for: {missing_list}.")

    interpretations = interpret_payload(overrides)
    limitations = build_limitations(
        cloud_cover_pct=overrides.get("cloud_cover_pct"),
        data_quality=str(overrides.get("data_quality") or "good"),
        composite_date_to=overrides.get("composite_date_to"),
        block_area_ha=block.area_ha,
        ndvi=overrides.get("ndvi"),
        lai=overrides.get("lai"),
    )
    metrics = {
        metric: _build_metric(metric, overrides[metric], interpretations[metric]["status"])
        for metric in METRIC_ORDER
    }

    sensor_analysis = [
        _analysis_item("Primary Signal - NDVI", metrics["ndvi"]),
        _analysis_item("Secondary Insight - NDWI", metrics["ndwi"]),
        _analysis_item("Secondary Insight - NDRE", metrics["ndre"]),
        _analysis_item("Secondary Insight - EVI", metrics["evi"]),
        _analysis_item("Secondary Insight - LAI", metrics["lai"]),
    ]

    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    return {
        "blockId": str(block.id),
        "lanslu": block.lanslu,
        "crop": block.crop,
        "areaHa": block.area_ha or 0,
        "source": "real",
        "warning": limitations[0] if limitations else None,
        "composite_date_to": now_iso,
        "metrics": metrics,
        "interpretations": interpretations,
        "limitations": limitations,
        "advisor": {
            "riskScore": None,
            "riskLevel": "Low",
            "sensorAnalysis": sensor_analysis,
            "actions": [
                {
                    "priority": index + 1,
                    "label": "SCIENTIFIC LIMITATION",
                    "items": [limitation],
                    "severity": "medium" if "accuracy" in limitation or "reliability" in limitation else "low",
                }
                for index, limitation in enumerate(limitations)
            ],
            "riskExplanations": limitations or [f'Primary dashboard signal: {interpretations["ndvi"]["status"]}.'],
        },
        "nutrient": {
            "status": interpretations["ndre"]["status"],
            "reason": f'NDRE interpretation: {interpretations["ndre"]["status"]}.',
            "score": 0,
            "details": [f'NDRE value: {metrics["ndre"]["raw"]}.'],
        },
        "yieldImpact": {
            "currentYieldPercent": 0,
            "projectedLoss": 0,
            "baseProfit": 0,
            "factors": [],
        },
        "alternativeCrops": [],
        "decision": {
            "totalArea": block.area_ha or 0,
            "current": {
                "crop": block.crop or "Current Block",
                "lossPerHa": 0,
                "totalLoss": 0,
                "yieldLossDetails": "Strict Sentinel-2 mode does not infer financial decisions from satellite data alone.",
            },
            "switch": {
                "crop": "Unavailable",
                "area": 0,
                "profitPerHa": 0,
                "totalProfit": 0,
                "allocationMatch": 0,
                "validated": False,
                "validationText": "Strict Sentinel-2 mode does not generate crop switching advice.",
            },
            "keep": {
                "crop": block.crop or "Current Block",
                "area": block.area_ha or 0,
                "profitPerHa": 0,
                "totalProfit": 0,
            },
        },
    }


def _build_metric(metric: str, raw_value: float, status: str) -> dict[str, Any]:
    return {
        "key": metric,
        "title": METRIC_TITLES[metric],
        "raw": round(float(raw_value), 4),
        "label": status,
        "value": round(float(raw_value), 4),
        "unit": "",
        "status": "Normal" if status not in {"No data", "Critical", "Severe stress", "Poor yield", "Bare soil"} else "Low",
        "message": f"{metric.upper()}: {status}.",
        "colorClass": _color_for_status(status),
        "history": {
            "hours": [],
            "days": [],
            "weeks": [],
            "labelsHours": [],
            "labelsDays": [],
            "labelsWeeks": [],
        },
    }


def _analysis_item(label: str, metric: dict[str, Any]) -> dict[str, Any]:
    return {
        "label": label,
        "value": str(metric["value"]),
        "status": "GOOD" if metric["colorClass"] == "good" else "WARNING" if metric["colorClass"] == "warning" else "CRITICAL",
        "message": metric["message"],
        "colorClass": metric["colorClass"],
    }


def _color_for_status(status: str) -> str:
    if status in {"Dense healthy canopy", "Moderate health", "Well-watered", "High chlorophyll", "Moderate", "Healthy", "High yield", "Good yield"}:
        return "good"
    if status in {"Stress detected", "Significant stress", "Mild stress", "Moderate stress", "Low", "Sparse canopy", "Low yield"}:
        return "warning"
    return "error"
