from __future__ import annotations

from typing import Any, Dict, List, Tuple


def classify_ndwi(ndwi: float | None) -> Tuple[str, str]:
    """
    Classifies NDWI according to PDF requirements with action-driven status.
    """
    if ndwi is None:
        return "no_data", "No data available"

    if ndwi > 0.1:
        return "well_watered — check over-irrigation", "Check over-irrigation"

    elif -0.1 <= ndwi <= 0.1:
        return "mild_stress — consider irrigation in 2-3 days", "Consider irrigation in 2–3 days"

    elif -0.3 <= ndwi < -0.1:
        return "moderate_stress — irrigate today", "Irrigate today"

    elif ndwi < -0.3:
        return "severe_stress — immediate irrigation required", "Immediate irrigation required"
    
    return "unknown", "Status unknown"


def generate_insights(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Generates structured agricultural insights focusing on NDWI.
    Matches PDF requirements for the Grower GPT system.
    """
    insights = []

    ndwi = payload.get("ndwi")
    status, recommendation = classify_ndwi(ndwi)

    if "severe_stress" in status:
        insights.append({
            "type": "irrigation",
            "severity": "critical",
            "message": recommendation,
            "reason": f"NDWI = {ndwi:.2f} (< -0.3)"
        })
    elif "moderate_stress" in status:
        insights.append({
            "type": "irrigation",
            "severity": "warning",
            "message": recommendation,
            "reason": f"NDWI = {ndwi:.2f} (-0.3 to -0.1)"
        })
    elif "mild_stress" in status:
        insights.append({
            "type": "irrigation",
            "severity": "info",
            "message": recommendation,
            "reason": f"NDWI = {ndwi:.2f} (-0.1 to 0.1)"
        })

    # Optional: Keep other indices but simplify based on user focus on NDWI
    ndvi = payload.get("ndvi")
    if ndvi is not None and ndvi < 0.20:
        insights.append({
            "type": "health",
            "severity": "critical",
            "message": "Critical vine stress detected.",
            "reason": f"NDVI = {ndvi:.2f} (< 0.20)"
        })

    return insights[:3]
