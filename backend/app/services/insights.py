from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Tuple


def classify_ndwi(ndwi: float | None) -> Tuple[str, str]:
    """
    Classifies NDWI according to PDF requirements with stable API status values.
    """
    if ndwi is None:
        return "no_data", "No data available"

    if ndwi > 0.1:
        return "well_watered", "Check over-irrigation"

    if -0.15 <= ndwi <= 0.1:
        return "mild_stress", "Consider irrigation in 2-3 days"

    if -0.3 <= ndwi < -0.15:
        return "moderate_stress", "Irrigate soon"

    if ndwi < -0.3:
        return "severe_stress", "Immediate irrigation required"

    return "unknown", "Status unknown"


def generate_insights(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Generates structured agricultural insights prioritized by PDF rules:
    1. Water (NDWI)
    2. Nutrient (NDRE)
    3. Health (NDVI)
    4. Canopy (EVI)
    5. Yield (LAI)
    """
    insights = []

    ndwi = payload.get("ndwi")
    ndvi = payload.get("ndvi")
    ndre = payload.get("ndre")
    evi = payload.get("evi")
    lai = payload.get("lai")

    # 1. WATER (HIGHEST PRIORITY - NDWI)
    if ndwi is not None:
        if ndwi < -0.3:
            insights.append(
                {
                    "type": "irrigation",
                    "severity": "critical",
                    "message": "Severe water stress. Irrigate immediately.",
                    "reason": f"NDWI = {ndwi} (< -0.3)",
                }
            )
        elif ndwi < -0.15:
            insights.append(
                {
                    "type": "irrigation",
                    "severity": "warning",
                    "message": "Water stress detected. Irrigate soon.",
                    "reason": f"NDWI = {ndwi} (< -0.15)",
                }
            )

    # 2. NUTRIENT (NDRE)
    if ndre is not None and ndre < 0.25:
        insights.append(
            {
                "type": "nutrient",
                "severity": "warning",
                "message": "Nitrogen deficiency likely. Foliar spray recommended.",
                "reason": f"NDRE = {ndre} (< 0.25)",
            }
        )

    # 3. HEALTH (NDVI)
    if ndvi is not None:
        if ndvi < 0.2:
            insights.append(
                {
                    "type": "health",
                    "severity": "critical",
                    "message": "Critical vine stress - urgent inspection.",
                    "reason": f"NDVI = {ndvi} (< 0.20)",
                }
            )
        elif ndvi < 0.35:
            insights.append(
                {
                    "type": "health",
                    "severity": "warning",
                    "message": "Vine health declining - inspect.",
                    "reason": f"NDVI = {ndvi} (< 0.35)",
                }
            )

    # 4. CANOPY (EVI)
    if evi is not None and evi > 0.5:
        insights.append(
            {
                "type": "canopy",
                "severity": "info",
                "message": "Dense canopy detected. Consider leaf removal.",
                "reason": f"EVI = {evi} (> 0.5)",
            }
        )

    # 5. YIELD (LAI)
    if lai is not None and lai < 2:
        insights.append(
            {
                "type": "yield",
                "severity": "warning",
                "message": "Low yield potential expected.",
                "reason": f"LAI = {lai} (< 2)",
            }
        )

    # Fallback if no specific stress detected
    if not insights:
        insights.append(
            {
                "type": "info",
                "severity": "normal",
                "message": "All indicators are within optimal range.",
                "reason": "Satellite ground truth shows healthy growth.",
            }
        )

    return insights[:3]  # Max 3 (PDF Requirement)


def calculate_metadata(cache):
    """
    Calculates data age and confidence based on PDF rules.
    """
    composite_date = cache.composite_date_to
    if isinstance(composite_date, str):
        from datetime import datetime

        composite_date = datetime.strptime(composite_date, "%Y-%m-%d").date()

    data_age_days = (date.today() - composite_date).days

    if cache.pixel_count < 5 or cache.data_quality != "good" or cache.payload.get("cloud_cover_pct", 0) > 50:
        confidence = "low"
    elif data_age_days > 7:
        confidence = "medium"
    else:
        confidence = "high"

    return data_age_days, confidence
