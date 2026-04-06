from __future__ import annotations

from collections import OrderedDict
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.farm_context_service import get_farm_context


RECOMMENDATION_PATTERNS = {
    "irrigation_pump": ["%irrigation pump%", "%water pump%", "%pump%"],
    "water_tanker": ["%water tanker%", "%tanker%"],
}


def _to_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _has_irrigation_equipment(db: Session, user_id: str) -> bool:
    row = db.execute(
        text(
            """
            SELECT 1
            FROM equipment_listings
            WHERE owner_id = :user_id
              AND is_active = true
              AND (
                    equipment_name ILIKE '%irrigation%'
                 OR equipment_name ILIKE '%pump%'
                 OR COALESCE(description, '') ILIKE '%irrigation%'
                 OR COALESCE(description, '') ILIKE '%pump%'
              )
            LIMIT 1
            """
        ),
        {"user_id": user_id},
    ).first()
    return row is not None


def recommend_equipment(context: dict, has_irrigation_equipment: bool = False) -> tuple[list[str], list[str], str | None]:
    recommendations: list[str] = []
    reasons: list[str] = []

    soil_moisture = _to_float(context.get("soil_moisture"))
    ndwi = _to_float(context.get("ndwi"))
    rain_next_48h = _to_float(context.get("rain_next_48h")) or 0.0
    irrigation_decision = str(context.get("irrigation_decision") or "").upper()

    if rain_next_48h > 10:
        recommendations.append("delay_irrigation")
        reasons.append(f"Rain forecast is high in the next 48h ({rain_next_48h:.1f} mm)")
        return list(OrderedDict.fromkeys(recommendations)), reasons, "Do not rent irrigation equipment right now"

    if soil_moisture is not None and soil_moisture < 30:
        recommendations.append("irrigation_pump")
        reasons.append(f"Soil moisture is low ({soil_moisture:.1f}%)")

    if ndwi is not None and ndwi < -0.3:
        recommendations.append("water_tanker")
        recommendations.append("irrigation_pump")
        reasons.append(f"NDWI indicates severe water stress ({ndwi:.2f})")

    if irrigation_decision == "ON" and not has_irrigation_equipment:
        recommendations.append("irrigation_pump")
        reasons.append("Irrigation decision is ON and no active irrigation equipment listing is available")

    deduped = list(OrderedDict.fromkeys(recommendations))
    return deduped, reasons, reasons[0] if reasons else None


def _fetch_matching_listings(db: Session, block_id: UUID, recommendation: str) -> list[dict]:
    patterns = RECOMMENDATION_PATTERNS.get(recommendation)
    if not patterns:
        return []

    rows = (
        db.execute(
            text(
                """
                WITH block_center AS (
                    SELECT
                        ST_Y(ST_Centroid(geom)) AS lat,
                        ST_X(ST_Centroid(geom)) AS lon
                    FROM blocks
                    WHERE id = :block_id
                )
                SELECT
                    l.id,
                    l.equipment_name,
                    l.price,
                    l.price_type,
                    l.latitude,
                    l.longitude,
                    CASE
                        WHEN bc.lat IS NOT NULL
                          AND bc.lon IS NOT NULL
                          AND l.latitude IS NOT NULL
                          AND l.longitude IS NOT NULL
                        THEN ST_Distance(
                            ST_SetSRID(ST_MakePoint(bc.lon, bc.lat), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(l.longitude, l.latitude), 4326)::geography
                        )
                        ELSE NULL
                    END AS distance_m
                FROM equipment_listings l
                CROSS JOIN block_center bc
                WHERE l.is_active = true
                  AND (
                        l.equipment_name ILIKE :pattern_1
                     OR l.equipment_name ILIKE :pattern_2
                     OR l.equipment_name ILIKE :pattern_3
                     OR COALESCE(l.description, '') ILIKE :pattern_1
                     OR COALESCE(l.description, '') ILIKE :pattern_2
                     OR COALESCE(l.description, '') ILIKE :pattern_3
                  )
                ORDER BY distance_m NULLS LAST, l.created_at DESC
                LIMIT 5
                """
            ),
            {
                "block_id": str(block_id),
                "pattern_1": patterns[0],
                "pattern_2": patterns[1] if len(patterns) > 1 else patterns[0],
                "pattern_3": patterns[2] if len(patterns) > 2 else patterns[-1],
            },
        )
        .mappings()
        .all()
    )
    return [dict(row) for row in rows]


def get_block_recommendations(db: Session, block_id: UUID) -> dict:
    context = get_farm_context(db, block_id)
    if not context:
        return {
            "block_id": str(block_id),
            "recommendations": [],
            "reason": "No unified farm context found for this block",
            "weather_guardrail": None,
            "listings": [],
        }

    has_equipment = _has_irrigation_equipment(db, str(context["user_id"]))
    recommendations, reasons, primary_reason = recommend_equipment(context, has_equipment)

    weather_guardrail = None
    rain_next_48h = _to_float(context.get("rain_next_48h")) or 0.0
    if rain_next_48h > 10:
        weather_guardrail = "Do not rent irrigation equipment"

    listings: list[dict] = []
    for recommendation in recommendations:
        if recommendation in RECOMMENDATION_PATTERNS:
            listings.extend(_fetch_matching_listings(db, block_id, recommendation))

    unique_listings: OrderedDict[str, dict] = OrderedDict()
    for listing in listings:
        unique_listings[str(listing["id"])] = listing

    return {
        "block_id": str(block_id),
        "recommendations": recommendations,
        "reason": primary_reason or "No urgent rental recommendation right now",
        "weather_guardrail": weather_guardrail,
        "reasons": reasons,
        "has_irrigation_equipment": has_equipment,
        "listings": list(unique_listings.values())[:5],
    }

