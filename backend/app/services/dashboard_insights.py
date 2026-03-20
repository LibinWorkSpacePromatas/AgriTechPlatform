from __future__ import annotations

from datetime import datetime
from hashlib import sha256
from math import sin, tau
from typing import Any
from zoneinfo import ZoneInfo

from app.db.models import Block


METRIC_ORDER = ("ndvi", "ndwi", "ndre", "evi", "lai")

HOUR_LABELS = [f"-{23 - index}h" if index < 23 else "Now" for index in range(24)]
DAY_LABELS = ["-6d", "-5d", "-4d", "-3d", "-2d", "Yesterday", "Today"]
WEEK_LABELS = ["-3 Weeks", "-2 Weeks", "Last Week", "This Week"]

CROP_BASELINES: dict[str, dict[str, float]] = {
    "Shiraz": {"ndvi": 0.64, "ndwi": 0.31, "ndre": 0.55, "evi": 0.49, "lai": 3.6, "profitPerHa": 14000},
    "Cabernet Sauvignon": {"ndvi": 0.66, "ndwi": 0.33, "ndre": 0.58, "evi": 0.51, "lai": 3.8, "profitPerHa": 13500},
    "Grenache": {"ndvi": 0.61, "ndwi": 0.29, "ndre": 0.53, "evi": 0.47, "lai": 3.4, "profitPerHa": 12000},
    "Chardonnay": {"ndvi": 0.68, "ndwi": 0.35, "ndre": 0.6, "evi": 0.54, "lai": 4.1, "profitPerHa": 15000},
    "Merlot": {"ndvi": 0.63, "ndwi": 0.3, "ndre": 0.54, "evi": 0.48, "lai": 3.5, "profitPerHa": 14500},
    "Riesling": {"ndvi": 0.67, "ndwi": 0.34, "ndre": 0.59, "evi": 0.52, "lai": 3.9, "profitPerHa": 15000},
    "Semillon": {"ndvi": 0.65, "ndwi": 0.32, "ndre": 0.57, "evi": 0.5, "lai": 3.7, "profitPerHa": 14200},
    "Default": {"ndvi": 0.62, "ndwi": 0.3, "ndre": 0.54, "evi": 0.48, "lai": 3.5, "profitPerHa": 13000},
}

ALTERNATIVE_CROP_LIBRARY = [
    {"cropName": "Olives", "profitPerHa": 76000, "waterRequirement": 5.5},
    {"cropName": "Almonds", "profitPerHa": 45000, "waterRequirement": 8.5},
    {"cropName": "Citrus", "profitPerHa": 38000, "waterRequirement": 9.0},
    {"cropName": "Riesling", "profitPerHa": 15000, "waterRequirement": 6.3},
    {"cropName": "Grenache", "profitPerHa": 12000, "waterRequirement": 6.0},
]


def build_block_insights(block: Block, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    crop_name = block.crop or "Default"
    baselines = CROP_BASELINES.get(crop_name, CROP_BASELINES["Default"])
    identifier = block.lanslu or str(block.id)
    area_ha = block.area_ha or 0
    soil_text = f"{block.soil_class or ''} {block.soil_subgroup or ''} {block.description or ''}".strip().lower()

    soil_moisture_bias = -0.04 if "sand" in soil_text else 0.03 if "clay" in soil_text else 0.0
    fertility_bias = 0.03 if "loam" in soil_text else -0.02 if "sand" in soil_text else 0.0
    canopy_bias = -0.05 if area_ha >= 10 else 0.02 if area_ha <= 6 else 0.0

    # Use overrides if available, otherwise use simulated values
    ndvi = overrides.get("ndvi") if overrides and overrides.get("ndvi") is not None else _bounded(
        baselines["ndvi"] + soil_moisture_bias * 0.3 + fertility_bias * 0.4 + canopy_bias * 0.2 + _signed_noise(identifier, "ndvi", 0.06),
        0.28,
        0.9,
    )
    ndwi = overrides.get("ndwi") if overrides and overrides.get("ndwi") is not None else _bounded(
        baselines["ndwi"] + soil_moisture_bias + _signed_noise(identifier, "ndwi", 0.05),
        0.05,
        0.62,
    )
    ndre = overrides.get("ndre") if overrides and overrides.get("ndre") is not None else _bounded(
        baselines["ndre"] + fertility_bias + _signed_noise(identifier, "ndre", 0.05),
        0.2,
        0.82,
    )
    evi = overrides.get("evi") if overrides and overrides.get("evi") is not None else _bounded(
        baselines["evi"] + fertility_bias * 0.5 + canopy_bias + _signed_noise(identifier, "evi", 0.05),
        0.15,
        0.82,
    )
    lai = overrides.get("lai") if overrides and overrides.get("lai") is not None else _bounded(
        baselines["lai"] + fertility_bias * 2.2 + canopy_bias * 3 + _signed_noise(identifier, "lai", 0.5),
        1.1,
        6.0,
    )

    metrics = {
        "ndvi": _build_metric_payload(
            identifier=identifier,
            key="ndvi",
            title="Crop Health",
            raw_value=ndvi,
            percent=True,
            status_thresholds=(0.52, 0.67),
            label_map=(
                ("Stressed", "error", "Low", "Vegetative vigor is below the seasonal benchmark."),
                ("Watch", "warning", "Low", "Vigor is uneven and needs monitoring."),
                ("Healthy", "good", "Normal", "Canopy vigor is holding steady across the block."),
            ),
        ),
        "ndwi": _build_metric_payload(
            identifier=identifier,
            key="ndwi",
            title="Water Status",
            raw_value=ndwi,
            percent=True,
            status_thresholds=(0.22, 0.35),
            label_map=(
                ("Dry", "error", "Low", "Water stress is visible in the latest composite."),
                ("Watch", "warning", "Low", "Moisture reserves are thinning."),
                ("Adequate", "good", "Normal", "Water availability is aligned with target range."),
            ),
        ),
        "ndre": _build_metric_payload(
            identifier=identifier,
            key="ndre",
            title="Nutrient Status",
            raw_value=ndre,
            percent=True,
            status_thresholds=(0.45, 0.58),
            label_map=(
                ("Constrained", "error", "Low", "Nitrogen uptake signal is materially constrained."),
                ("Moderate", "warning", "Low", "Nutrient activity is acceptable but not ideal."),
                ("Strong", "good", "Normal", "Leaf chlorophyll signal is supportive of growth."),
            ),
        ),
        "evi": _build_metric_payload(
            identifier=identifier,
            key="evi",
            title="Canopy Density",
            raw_value=evi,
            percent=True,
            status_thresholds=(0.4, 0.55),
            label_map=(
                ("Sparse", "error", "Low", "Canopy density is lagging the crop target."),
                ("Building", "warning", "Low", "Canopy growth is progressing but still patchy."),
                ("Dense", "good", "Normal", "Canopy density is tracking well."),
            ),
        ),
        "lai": _build_metric_payload(
            identifier=identifier,
            key="lai",
            title="Yield Estimate",
            raw_value=lai,
            percent=False,
            display_value=round(lai, 1),
            unit=" LAI",
            status_thresholds=(2.3, 3.8),
            label_map=(
                ("Reduced", "error", "Low", "Leaf area suggests reduced yield potential."),
                ("Steady", "warning", "Low", "Yield potential is serviceable but below peak."),
                ("High", "good", "Normal", "Leaf area supports a strong yield outlook."),
            ),
        ),
    }

    sensor_analysis = [
        _analysis_item("CROP HEALTH", metrics["ndvi"]),
        _analysis_item("WATER STATUS", metrics["ndwi"]),
        _analysis_item("NUTRIENT STATUS", metrics["ndre"]),
        _analysis_item("CANOPY DENSITY", metrics["evi"]),
        _analysis_item("YIELD ESTIMATE", metrics["lai"]),
    ]

    risk_score = _compute_risk_score(metrics)
    risk_level = "High" if risk_score >= 60 else "Moderate" if risk_score >= 30 else "Low"
    risk_explanations = _build_risk_explanations(crop_name, metrics)
    nutrient = _build_nutrient_payload(metrics["ndre"], metrics["ndwi"], metrics["lai"])
    yield_impact = _build_yield_impact(crop_name, area_ha, metrics)
    alternative_crops = _build_alternative_crops(crop_name, metrics)
    decision = _build_decision(crop_name, area_ha, yield_impact, alternative_crops, metrics["ndre"])
    actions = _build_actions(crop_name, metrics, nutrient["status"])

    return {
        "blockId": str(block.id),
        "lanslu": block.lanslu,
        "crop": crop_name,
        "areaHa": area_ha,
        "source": "api",
        "warning": None,
        "composite_date_to": datetime.now(ZoneInfo("Australia/Adelaide")).replace(microsecond=0).isoformat(),
        "metrics": metrics,
        "ndvi": ndvi,
        "ndwi": ndwi,
        "ndre": ndre,
        "evi": evi,
        "lai": lai,
        "advisor": {
            "riskScore": risk_score,
            "riskLevel": risk_level,
            "sensorAnalysis": sensor_analysis,
            "actions": actions,
            "riskExplanations": risk_explanations,
        },
        "nutrient": nutrient,
        "yieldImpact": yield_impact,
        "alternativeCrops": alternative_crops,
        "decision": decision,
    }


def _build_metric_payload(
    *,
    identifier: str,
    key: str,
    title: str,
    raw_value: float,
    percent: bool,
    status_thresholds: tuple[float, float],
    label_map: tuple[tuple[str, str, str, str], tuple[str, str, str, str], tuple[str, str, str, str]],
    display_value: float | None = None,
    unit: str | None = None,
) -> dict[str, Any]:
    if raw_value < status_thresholds[0]:
        label, color_class, status, message = label_map[0]
    elif raw_value < status_thresholds[1]:
        label, color_class, status, message = label_map[1]
    else:
        label, color_class, status, message = label_map[2]

    final_display_value = round(raw_value * 100) if percent else (display_value if display_value is not None else round(raw_value, 1))
    final_unit = "%" if percent else (unit or "")
    history_min = 0 if percent else 0.5
    history_max = 100 if percent else 6.5
    center = float(final_display_value)

    return {
        "key": key,
        "title": title,
        "raw": round(raw_value, 3),
        "label": label,
        "value": final_display_value,
        "unit": final_unit,
        "status": status,
        "message": message,
        "colorClass": color_class,
        "history": {
            "hours": _build_history_series(identifier, key, center, 24, history_min, history_max, 4.2 if percent else 0.35, 1 if percent else 1),
            "days": _build_history_series(identifier, f"{key}-days", center, 7, history_min, history_max, 7.5 if percent else 0.6, 1 if percent else 1),
            "weeks": _build_history_series(identifier, f"{key}-weeks", center, 4, history_min, history_max, 9 if percent else 0.8, 1 if percent else 1),
            "labelsHours": HOUR_LABELS,
            "labelsDays": DAY_LABELS,
            "labelsWeeks": WEEK_LABELS,
        },
    }


def _analysis_item(label: str, metric: dict[str, Any]) -> dict[str, Any]:
    analysis_status = "GOOD" if metric["colorClass"] == "good" else "WARNING" if metric["colorClass"] == "warning" else "CRITICAL"
    return {
        "label": label,
        "value": f'{metric["value"]}{metric["unit"]}',
        "status": analysis_status,
        "message": metric["message"],
        "colorClass": metric["colorClass"],
    }


def _compute_risk_score(metrics: dict[str, dict[str, Any]]) -> int:
    risk_components = [
        max(0, 70 - metrics["ndvi"]["value"]) * 0.6,
        max(0, 40 - metrics["ndwi"]["value"]) * 0.8,
        max(0, 60 - metrics["ndre"]["value"]) * 0.5,
        max(0, 58 - metrics["evi"]["value"]) * 0.45,
        max(0, 4.1 - float(metrics["lai"]["value"])) * 11,
    ]
    return max(0, min(100, round(sum(risk_components))))


def _build_risk_explanations(crop_name: str, metrics: dict[str, dict[str, Any]]) -> list[str]:
    explanations: list[str] = []

    if metrics["ndwi"]["colorClass"] != "good":
        explanations.append(f"Water status is below target for {crop_name}, indicating emerging stress.")
    if metrics["ndre"]["colorClass"] != "good":
        explanations.append("Nutrient signal is softer than desired, so chlorophyll activity should be reviewed.")
    if metrics["ndvi"]["colorClass"] != "good":
        explanations.append("Crop vigor is trailing the seasonal benchmark and could suppress productivity.")
    if metrics["evi"]["colorClass"] != "good":
        explanations.append("Canopy density is uneven, which can lower fruit protection and uniformity.")
    if metrics["lai"]["colorClass"] != "good":
        explanations.append("Leaf area index is below target, reducing projected yield potential.")

    if not explanations:
        explanations.append(f"All major satellite indices for {crop_name} are tracking within the preferred operating range.")

    return explanations


def _build_nutrient_payload(ndre_metric: dict[str, Any], ndwi_metric: dict[str, Any], lai_metric: dict[str, Any]) -> dict[str, Any]:
    ndre_value = int(ndre_metric["value"])
    ndwi_value = int(ndwi_metric["value"])
    lai_value = float(lai_metric["value"])
    score = max(0, min(100, round(ndre_value * 0.7 + ndwi_value * 0.2 + lai_value * 5)))

    if score >= 72:
        status = "High"
        reason = "Backend chlorophyll and canopy signals suggest strong nutrient availability."
    elif score >= 52:
        status = "Medium"
        reason = "Nutrient status is serviceable, but supplemental review may improve performance."
    else:
        status = "Low"
        reason = "Backend nutrient indicators are constrained and need agronomy follow-up."

    return {
        "status": status,
        "reason": reason,
        "score": score,
        "details": [
            f'NDRE at {ndre_metric["value"]}% is the primary nutrient signal.',
            f'NDWI at {ndwi_metric["value"]}% confirms how well nutrients can move through the profile.',
            f'LAI at {lai_metric["value"]} supports the current nutrient demand estimate.',
        ],
    }


def _build_yield_impact(crop_name: str, area_ha: float, metrics: dict[str, dict[str, Any]]) -> dict[str, Any]:
    profit_per_ha = CROP_BASELINES.get(crop_name, CROP_BASELINES["Default"])["profitPerHa"]
    factors: list[dict[str, Any]] = []

    if metrics["ndwi"]["colorClass"] != "good":
        impact = max(6, round((40 - metrics["ndwi"]["value"]) * 0.9))
        factors.append({"name": "Water Stress", "impact": impact, "severity": "critical" if impact >= 20 else "high"})
    if metrics["ndre"]["colorClass"] != "good":
        impact = max(4, round((60 - metrics["ndre"]["value"]) * 0.4))
        factors.append({"name": "Nutrient Limitation", "impact": impact, "severity": "high" if impact >= 12 else "medium"})
    if metrics["ndvi"]["colorClass"] != "good":
        impact = max(3, round((70 - metrics["ndvi"]["value"]) * 0.3))
        factors.append({"name": "Reduced Vigor", "impact": impact, "severity": "high" if impact >= 12 else "medium"})
    if metrics["evi"]["colorClass"] != "good":
        impact = max(2, round((58 - metrics["evi"]["value"]) * 0.22))
        factors.append({"name": "Thin Canopy", "impact": impact, "severity": "medium"})

    total_impact = min(65, sum(factor["impact"] for factor in factors))
    current_yield_percent = max(35, 100 - total_impact)
    base_profit = round(profit_per_ha * area_ha)
    projected_loss = round(base_profit * (100 - current_yield_percent) / 100)

    return {
        "currentYieldPercent": current_yield_percent,
        "projectedLoss": projected_loss,
        "baseProfit": base_profit,
        "factors": factors,
    }


def _build_alternative_crops(crop_name: str, metrics: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    ndwi_value = int(metrics["ndwi"]["value"])
    ndre_value = int(metrics["ndre"]["value"])
    alternatives: list[dict[str, Any]] = []

    for crop in ALTERNATIVE_CROP_LIBRARY:
        if crop["cropName"] == crop_name:
            continue

        water_bonus = max(0, 40 - crop["waterRequirement"] * 4)
        stress_bonus = max(0, (55 - ndwi_value) * 0.6)
        nutrient_bonus = max(0, (ndre_value - 45) * 0.4)
        profitability_bonus = 12 if crop["profitPerHa"] >= 40000 else 4
        suitability = max(52, min(94, round(38 + water_bonus + stress_bonus + nutrient_bonus + profitability_bonus)))
        compatible = crop["waterRequirement"] <= 7.5 or ndwi_value >= 32
        moisture_compatible = ndwi_value >= 32 or crop["waterRequirement"] <= 6.5

        reasons = []
        if crop["waterRequirement"] <= 6.5:
            reasons.append("Lower water demand than the current block profile")
        if crop["profitPerHa"] >= 40000:
            reasons.append("Stronger gross margin potential")
        if ndre_value >= 55:
            reasons.append("Current nutrient signal can support establishment")
        if metrics["evi"]["value"] < 55:
            reasons.append("Can work with a lighter canopy structure")

        alternatives.append(
            {
                "cropName": crop["cropName"],
                "suitabilityScore": suitability,
                "profitPerHa": crop["profitPerHa"],
                "waterRequirement": crop["waterRequirement"],
                "reasons": reasons[:3] or ["Balanced fit for current block conditions"],
                "compatible": compatible,
                "moistureCompatible": moisture_compatible,
                "compatibilityNote": "Compatible with current block conditions" if compatible else "Would require site adjustment before switching",
            }
        )

    return sorted(alternatives, key=lambda crop: crop["suitabilityScore"], reverse=True)[:3]


def _build_decision(
    crop_name: str,
    area_ha: float,
    yield_impact: dict[str, Any],
    alternative_crops: list[dict[str, Any]],
    nutrient_metric: dict[str, Any],
) -> dict[str, Any]:
    current_loss = -round(yield_impact["projectedLoss"] / area_ha) if area_ha else 0
    switch_area = round(area_ha * 0.7) if area_ha else 0
    keep_area = max(0, round(area_ha - switch_area))
    current_profit_per_ha = CROP_BASELINES.get(crop_name, CROP_BASELINES["Default"])["profitPerHa"]
    top_alternative = alternative_crops[0] if alternative_crops else {
        "cropName": "Olives",
        "profitPerHa": 76000,
        "suitabilityScore": 78,
        "compatible": True,
        "compatibilityNote": "Fallback diversification option",
    }

    return {
        "totalArea": area_ha,
        "current": {
            "crop": crop_name,
            "lossPerHa": current_loss,
            "totalLoss": -yield_impact["projectedLoss"],
            "yieldLossDetails": f'LAI {yield_impact["currentYieldPercent"]}% retained yield from the latest backend analysis',
        },
        "switch": {
            "crop": top_alternative["cropName"],
            "area": switch_area,
            "profitPerHa": top_alternative["profitPerHa"],
            "totalProfit": round(top_alternative["profitPerHa"] * switch_area),
            "allocationMatch": top_alternative["suitabilityScore"],
            "validated": bool(top_alternative["compatible"]),
            "validationText": f'NDRE {nutrient_metric["value"]}% supports the proposed switch profile',
        },
        "keep": {
            "crop": crop_name,
            "area": keep_area,
            "profitPerHa": current_profit_per_ha,
            "totalProfit": round(current_profit_per_ha * keep_area),
        },
    }


def _build_actions(crop_name: str, metrics: dict[str, dict[str, Any]], nutrient_status: str) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []

    if metrics["ndwi"]["colorClass"] != "good":
        actions.append(
            {
                "priority": 1,
                "label": "IMMEDIATE ACTION",
                "items": [
                    f'Escalate irrigation review for {crop_name}; NDWI is sitting at {metrics["ndwi"]["value"]}%.',
                    "Check the most recent irrigation run against the satellite dry-down pattern.",
                    "Schedule a ground truth moisture check in the lowest-performing zone.",
                ],
                "severity": "critical" if metrics["ndwi"]["colorClass"] == "error" else "high",
                "estimatedCost": "$150-300/ha",
                "estimatedTime": "2-4 hours",
            }
        )

    if nutrient_status != "High":
        actions.append(
            {
                "priority": 2,
                "label": "NEXT 24-48 HOURS",
                "items": [
                    f'Validate nutrient status with petiole or tissue sampling; backend score is {metrics["ndre"]["value"]}%.',
                    "Review recent fertigation timing against the composite date.",
                    "Target weaker zones before the next irrigation window.",
                ],
                "severity": "high" if nutrient_status == "Low" else "medium",
                "estimatedCost": "$80-160/ha",
                "estimatedTime": "1-2 hours",
            }
        )

    if metrics["ndvi"]["colorClass"] != "good" or metrics["evi"]["colorClass"] != "good":
        actions.append(
            {
                "priority": 3,
                "label": "NEXT 7 DAYS",
                "items": [
                    "Walk the lighter canopy zones identified by the latest composite.",
                    "Compare vigor variability against pruning, disease, and irrigation records.",
                    "Capture follow-up imagery to confirm recovery after intervention.",
                ],
                "severity": "medium",
                "estimatedCost": "$0",
                "estimatedTime": "2 hours",
            }
        )

    if not actions:
        actions.append(
            {
                "priority": 3,
                "label": "NEXT 7 DAYS",
                "items": [
                    "Maintain current irrigation and nutrition programs.",
                    "Keep monitoring the block for any visual drift between composites.",
                    "Use the next satellite refresh to validate continued stability.",
                ],
                "severity": "low",
                "estimatedCost": "$0",
                "estimatedTime": "1 hour",
            }
        )

    return actions[:3]


def _build_history_series(
    identifier: str,
    key: str,
    center: float,
    count: int,
    minimum: float,
    maximum: float,
    amplitude: float,
    decimals: int,
) -> list[float]:
    values: list[float] = []
    for index in range(count):
        angle = tau * index / max(count - 1, 1)
        oscillation = sin(angle) * amplitude * 0.7
        drift = ((index / max(count - 1, 1)) - 0.5) * amplitude * 0.25
        noise = _signed_noise(identifier, f"{key}:{index}", amplitude * 0.15)
        value = _bounded(center + oscillation + drift + noise, minimum, maximum)
        values.append(round(value, decimals))
    return values


def _signed_noise(identifier: str, key: str, scale: float) -> float:
    return (_fraction(identifier, key) * 2 - 1) * scale


def _fraction(identifier: str, key: str) -> float:
    digest = sha256(f"{identifier}:{key}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _bounded(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))
