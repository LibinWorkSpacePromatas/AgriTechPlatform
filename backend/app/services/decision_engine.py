from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import json
import logging
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import func, text

from app.core.config import get_settings
from app.db.models import BlockDecision, SensorDefinition, SensorLatest
from app.services.weather_ingest import is_weather_fresh, fetch_weather, store_weather, get_block_info
from app.services.sensor_service import sensor_service


logger = logging.getLogger(__name__)


def _clamp_confidence(value: float) -> float:
    return round(max(0.0, min(1.0, value)), 2)


def _calculate_decision_confidence(
    *,
    ndwi: float | None,
    soil_moisture: float,
    weather_available: bool,
    satellite_data_age_days: int | None,
    satellite_data_quality: str | None,
    recent_rain_override: bool,
    ndwi_stress: bool,
    soil_wet_override: bool,
) -> float:
    confidence = 1.0

    if ndwi is None:
        confidence -= 0.3
    if soil_moisture <= 0:
        confidence -= 0.15
    if not weather_available:
        confidence -= 0.2

    if satellite_data_age_days is None:
        confidence -= 0.15

    if satellite_data_quality == "degraded":
        confidence -= 0.15
    elif satellite_data_quality == "no_data":
        confidence -= 0.35

    return _clamp_confidence(confidence)


def _get_weighted_soil_factor(data: dict[str, Any], db: Session) -> dict[str, Any]:
    soils = [
        (data.get("primary_soil_classification"), data.get("primary_soil_value")),
        (data.get("secondary_soil_classification"), data.get("secondary_soil_value")),
        (data.get("tertiary_soil_classification"), data.get("tertiary_soil_value")),
    ]

    codes = [str(code).strip().upper() for code, pct in soils if code and pct]
    if not codes:
        dominant = data.get("soil_subgroup", "")
        if dominant:
            codes = [str(dominant).strip().upper()]

    if not codes:
        return {
            "factor": 1.0,
            "field_capacity": 0.28,
            "wilting_point": 0.13,
            "soil_label": "Unknown (default loam)",
            "source": "default",
        }

    rows = db.execute(
        text(
            """
            SELECT code, irrigation_factor, field_capacity, wilting_point, label
            FROM soil_class_config
            WHERE code = ANY(:codes)
            """
        ),
        {"codes": codes},
    ).mappings().all()
    props_map = {str(row["code"]).strip().upper(): row for row in rows}

    weighted_factor = 0.0
    total_weight = 0.0
    components: list[str] = []
    for code, pct in soils:
        if not code or pct is None:
            continue
        code_key = str(code).strip().upper()
        props = props_map.get(code_key)
        if not props:
            continue
        weight = float(pct) / 100.0
        weighted_factor += float(props["irrigation_factor"]) * weight
        total_weight += weight
        components.append(f"{code}({pct}%)")

    if total_weight == 0:
        dominant = str(data.get("soil_subgroup", "")).strip().upper()
        props = props_map.get(dominant)
        if props:
            return {
                "factor": float(props["irrigation_factor"]),
                "field_capacity": float(props["field_capacity"]),
                "wilting_point": float(props["wilting_point"]),
                "soil_label": str(props["label"]),
                "source": f"ASC dominant {dominant}",
            }
        return {
            "factor": 1.0,
            "field_capacity": 0.28,
            "wilting_point": 0.13,
            "soil_label": "Unknown (default loam)",
            "source": "default",
        }

    primary_code = str(data.get("primary_soil_classification", "")).strip().upper()
    primary_props = props_map.get(primary_code)

    return {
        "factor": round(weighted_factor / total_weight, 3),
        "field_capacity": float(primary_props["field_capacity"]) if primary_props else 0.28,
        "wilting_point": float(primary_props["wilting_point"]) if primary_props else 0.13,
        "soil_label": " + ".join(components),
        "source": "soil_class_config DB weighted",
    }


def trigger_block_decision(db: Session, block_id: UUID) -> dict[str, Any] | None:
    """
    Multisource Decision Engine trigger.
    Fetches required data, computes irrigation decision, and saves it.
    """
    try:
        # ⚡ On-demand refresh: If weather data is stale (>30 min), refresh instantly
        if not is_weather_fresh(db, block_id, freshness_minutes=30):
            logger.info("event=weather_stale_refresh block_id=%s", block_id)
            info = get_block_info(db, block_id)
            lat, lon, tz = info["lat"], info["lon"], info["timezone"]
            
            # Ensure we use Sydney as default if not specified
            if not tz:
                tz = "Australia/Sydney"

            if lat is not None and lon is not None:
                try:
                    weather_data = fetch_weather(lat, lon, timezone=tz)
                    store_weather(db, block_id, weather_data, timezone_str=tz)
                except Exception as exc:
                    logger.warning("event=weather_refresh_failed block_id=%s error=%s", block_id, exc)

        # 1. Fetch all required data
        data = _get_decision_data(db, block_id)
        if data is None:
            logger.info("event=decision_engine_skipped block_id=%s reason=insufficient_data", block_id)
            return None

        # 2. Compute the decision
        decision = _compute_irrigation_decision(data, db)

        # 2b. Compute rental recommendations from unified farm context.
        try:
            from app.services.rental_recommendation_service import get_block_recommendations

            rental_recommendation = get_block_recommendations(db, block_id)
            decision["rental_recommendations"] = rental_recommendation.get("recommendations", [])
            decision["rental_reason"] = rental_recommendation.get("reason")
            decision["rental_weather_guardrail"] = rental_recommendation.get("weather_guardrail")
        except Exception as exc:
            logger.warning("event=rental_recommendation_failed block_id=%s error=%s", block_id, exc)

        # 3. Save the decision
        _save_decision(db, block_id, decision)

        logger.info("event=decision_engine_completed block_id=%s decision=%s", block_id, decision["irrigation"])
        return decision

    except Exception as exc:
        logger.error("event=decision_engine_failed block_id=%s error=%s", block_id, exc)
        return None


def is_decision_stale(db: Session, block_id: UUID, *, max_age_minutes: int | None = None) -> bool:
    settings = get_settings()
    ttl_minutes = max_age_minutes if max_age_minutes is not None else settings.decision_ttl_minutes
    decision = db.get(BlockDecision, block_id)
    if decision is None or decision.decision_payload is None:
        return True

    created_at = decision.created_at
    if created_at is None:
        return True

    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    latest_sensor_updated_at = (
        db.query(func.max(SensorLatest.updated_at))
        .join(SensorDefinition, SensorDefinition.id == SensorLatest.sensor_id)
        .filter(SensorDefinition.block_id == block_id)
        .scalar()
    )

    if latest_sensor_updated_at is not None:
        if latest_sensor_updated_at.tzinfo is None:
            latest_sensor_updated_at = latest_sensor_updated_at.replace(tzinfo=timezone.utc)
        if latest_sensor_updated_at > created_at:
            return True

    return created_at <= datetime.now(timezone.utc) - timedelta(minutes=max(1, ttl_minutes))


def _get_decision_data(db: Session, block_id: UUID) -> dict[str, Any] | None:
    """
    Fetches unified farm state, crop config, and weather data.
    """
    # Fetch unified farm state + crop config with block/user fallbacks
    row = db.execute(
        text("""
            SELECT
                ufs.soil_moisture,
                ufs.ndvi,
                ufs.ndwi,
                COALESCE(b.crop, u.primary_crop) AS crop,
                COALESCE(b.area_ha, 0) AS area_ha,
                b.lanslu,
                cc.optimal_moisture_min,
                cc.optimal_moisture_max,
                cc.root_depth_mm,
                cc.mad,
                sr.soil_subgroup,
                sr.primary_soil_classification,
                sr.primary_soil_value,
                sr.secondary_soil_classification,
                sr.secondary_soil_value,
                sr.tertiary_soil_classification,
                sr.tertiary_soil_value,
                sc.data_quality AS satellite_data_quality,
                sc.composite_date_to AS satellite_composite_date_to,
                scc.drainage_class AS primary_drainage_class,
                scc.label AS primary_soil_label
            FROM unified_farm_state ufs
            JOIN blocks b ON b.id = ufs.block_id
            LEFT JOIN users u ON u.id = b.user_id
            JOIN crop_config cc ON cc.crop = COALESCE(b.crop, u.primary_crop)
            LEFT JOIN soil_reference sr ON sr.lanslu = b.lanslu
            LEFT JOIN satellite_cache sc ON sc.block_id = ufs.block_id
            LEFT JOIN soil_class_config scc ON scc.code = sr.primary_soil_classification
            WHERE ufs.block_id = :block_id
        """),
        {"block_id": str(block_id)}
    ).mappings().first()

    if not row:
        return None

    # Use the same sensor-service path as the dashboard so both views calculate
    # from the same freshest sensor values.
    latest_sensor_values = sensor_service.get_latest_sensor_values(db, str(block_id))
    soil_moisture = latest_sensor_values.get("soil_moisture", row["soil_moisture"])

    # Fetch 24h past rain and avg temperature
    weather_stats = db.execute(
        text("""
            SELECT 
                COALESCE(SUM(precipitation), 0) as rain_24h,
                AVG(temperature) as temperature_avg
            FROM weather_timeseries
            WHERE block_id = :block_id
            AND observed_at BETWEEN NOW() - INTERVAL '24 hours' AND NOW()
        """),
        {"block_id": str(block_id)}
    ).mappings().first()

    # Fetch 48h forecast rain
    rain_next_48h = db.execute(
        text("""
            SELECT COALESCE(SUM(precipitation), 0)
            FROM weather_timeseries
            WHERE block_id = :block_id
            AND observed_at > NOW()
            AND observed_at <= NOW() + INTERVAL '48 hours'
        """),
        {"block_id": str(block_id)}
    ).scalar()

    weather_available = weather_stats is not None and weather_stats["rain_24h"] is not None
    satellite_composite_date_to = row["satellite_composite_date_to"]
    satellite_data_age_days = (
        (date.today() - satellite_composite_date_to).days
        if satellite_composite_date_to is not None
        else None
    )

    return {
        "block_id": str(block_id),
        "soil_moisture": soil_moisture,
        "ndvi": row["ndvi"],
        "ndwi": row["ndwi"],
        "crop": row["crop"],
        "area_ha": float(row["area_ha"] or 0.0),
        "optimal_moisture_min": row["optimal_moisture_min"],
        "optimal_moisture_max": row["optimal_moisture_max"],
        "root_depth_mm": row["root_depth_mm"],
        "mad": row["mad"],
        "weather_available": weather_available,
        "rain_24h": float(weather_stats["rain_24h"] or 0.0) if weather_stats else 0.0,
        "temperature_avg": float(weather_stats["temperature_avg"]) if weather_stats and weather_stats["temperature_avg"] is not None else None,
        "rain_next_48h": float(rain_next_48h or 0.0),
        "soil_subgroup": row["soil_subgroup"],
        "primary_soil_classification": row["primary_soil_classification"],
        "primary_soil_value": row["primary_soil_value"],
        "secondary_soil_classification": row["secondary_soil_classification"],
        "secondary_soil_value": row["secondary_soil_value"],
        "tertiary_soil_classification": row["tertiary_soil_classification"],
        "tertiary_soil_value": row["tertiary_soil_value"],
        "satellite_data_quality": row["satellite_data_quality"],
        "satellite_data_age_days": satellite_data_age_days,
        "primary_drainage_class": row["primary_drainage_class"],
        "primary_soil_label": row["primary_soil_label"],
    }


def _compute_irrigation_decision(data: dict[str, Any], db: Session) -> dict[str, Any]:
    """
    The core irrigation reasoning logic.
    NDWI-Primary Architecture.
    """
    # 1. Convert inputs to float (MANDATORY)
    soil_moisture = float(data["soil_moisture"] or 0.0)
    ndvi = float(data["ndvi"]) if data["ndvi"] is not None else None
    ndwi = float(data["ndwi"]) if data["ndwi"] is not None else None

    # 🔧 2. Clamp NDWI (sensor noise protection)
    if ndwi is not None:
        ndwi = max(-1.0, min(1.0, ndwi))

    optimal_min = float(data["optimal_moisture_min"] or 0.0)
    optimal_max = float(data["optimal_moisture_max"] or 0.0)
    root_depth_mm = float(data.get("root_depth_mm", 600))
    mad = float(data.get("mad", 0.5))
    weather_available = bool(data.get("weather_available", False))
    rain_24h = float(data["rain_24h"])
    rain_next_48h = float(data["rain_next_48h"])
    temp_avg = float(data["temperature_avg"]) if data.get("temperature_avg") is not None else None
    area_ha = float(data.get("area_ha", 0.0))
    satellite_data_quality = str(data.get("satellite_data_quality") or "unknown").lower()
    satellite_data_age_days = data.get("satellite_data_age_days")
    satellite_data_age_days = int(satellite_data_age_days) if satellite_data_age_days is not None else None

    # 🔧 Optimization: Cache soil_factor at the top
    soil_props = _get_weighted_soil_factor(data, db)
    soil_factor = float(soil_props["factor"])
    drainage_class = str(data.get("primary_drainage_class") or "MODERATE").upper()
    settings = get_settings()

    forecast_threshold = float(settings.decision_weather_rain_forecast_trigger_mm)
    recent_rain_threshold = 20.0
    soil_wet_override = bool(optimal_max and soil_moisture >= optimal_max)
    recent_rain_override = rain_24h >= recent_rain_threshold
    ndwi_stress = ndwi is not None and ndwi < -0.1
    severe_ndwi_stress = ndwi is not None and ndwi < -0.3

    confidence = _calculate_decision_confidence(
        ndwi=ndwi,
        soil_moisture=soil_moisture,
        weather_available=weather_available,
        satellite_data_age_days=satellite_data_age_days,
        satellite_data_quality=satellite_data_quality,
        recent_rain_override=recent_rain_override,
        ndwi_stress=ndwi_stress,
        soil_wet_override=soil_wet_override,
    )

    score = 0
    dominant_reason = "No significant water stress"
    irrigation = "OFF"
    urgency = "LOW"
    warning = None
    stale_satellite_data = satellite_data_age_days is not None and satellite_data_age_days > 3

    if stale_satellite_data:
        confidence = _clamp_confidence(confidence * 0.7)
        warning = f"Satellite data is {satellite_data_age_days} days old - verify before irrigating"

    if rain_next_48h >= forecast_threshold:
        return {
            "irrigation": "WAIT",
            "urgency": "LOW",
            "water_needed_mm": 0,
            "water_needed_liters": 0.0,
            "reason": "Rain expected in next 48 hours",
            "warning": warning,
            "confidence": round(confidence, 2),
            "metadata": {
                "score": 0,
                "soil_moisture": soil_moisture,
                "ndvi": ndvi,
                "ndwi": ndwi,
                "rain_24h": rain_24h,
                "rain_next_48h": rain_next_48h,
                "satellite_data_quality": satellite_data_quality,
                "satellite_data_age_days": satellite_data_age_days,
                "soil_factor": soil_factor,
                "soil_label": soil_props["soil_label"],
                "soil_source": soil_props["source"],
                "drainage_class": drainage_class,
                "weather_available": weather_available,
                "forecast_threshold": forecast_threshold,
                "recent_rain_threshold": recent_rain_threshold,
                "recent_rain_override": recent_rain_override,
                "soil_wet_override": soil_wet_override,
                "temp_avg": temp_avg,
                "water_needed_liters": 0.0,
                "warning": warning,
            }
        }

    if recent_rain_override:
        irrigation = "WAIT"
        urgency = "LOW"
        dominant_reason = "Recent heavy rainfall detected"
    elif soil_wet_override:
        irrigation = "OFF"
        urgency = "LOW"
        dominant_reason = "Soil moisture is already sufficient"
        score = -30
    else:
        if severe_ndwi_stress:
            irrigation = "ON"
            urgency = "HIGH"
            dominant_reason = "Severe water stress detected (NDWI)"
            score = 70
        elif ndwi_stress:
            irrigation = "ON"
            urgency = "MEDIUM"
            dominant_reason = "Moderate water stress detected (NDWI)"
            score = 45
        else:
            irrigation = "OFF"
            urgency = "LOW"
            dominant_reason = "No significant water stress"
            score = -10

    reason = dominant_reason
    if stale_satellite_data:
        if irrigation == "ON":
            if urgency == "HIGH":
                urgency = "MEDIUM"
            reason = f"{reason}, but satellite data is {satellite_data_age_days} days old"
        elif warning and irrigation != "WAIT":
            reason = f"{reason}, but satellite data is {satellite_data_age_days} days old"

    # 💧 Scientific Water Quantity Calculation
    water_needed_mm = 0
    water_needed_liters = 0.0
    if irrigation == "ON":
        # Better water calculation using root depth and MAD
        available_water = root_depth_mm * mad
        # 🛡️ Deficit floor (ensure minimum irrigation during stress)
        deficit = max(0, optimal_min - soil_moisture)
        # 🔧 1. Prevent division edge case
        deficit_ratio = max(0.2, deficit / max(1.0, optimal_min))
        water_needed_mm = available_water * deficit_ratio

        # Apply NDWI severity boost
        if ndwi is not None:
            if ndwi < -0.3:
                water_needed_mm *= 1.3
            elif ndwi < -0.1:
                water_needed_mm *= 1.1

        # Apply cached soil factor
        water_needed_mm *= soil_factor

        drainage_factor = 1.0
        if drainage_class == "VERY_SLOW":
            drainage_factor = 0.70
        elif drainage_class == "SLOW":
            drainage_factor = 0.85
        water_needed_mm *= drainage_factor

        # 🌦 Evapotranspiration (ET) Adjustment
        et_factor = 1.0
        if temp_avg is not None:
            if temp_avg > 30:
                et_factor = 1.3
            elif temp_avg > 25:
                et_factor = 1.15
        water_needed_mm *= et_factor

        # ⚙️ Irrigation Efficiency (Drip system 90%)
        efficiency = 0.9
        water_needed_mm = water_needed_mm / efficiency

        # 🛡️ Safety Limits
        # 🔧 3. Add minimal irrigation floor (important IRL)
        MIN_IRRIGATION = 3
        if water_needed_mm < MIN_IRRIGATION:
            irrigation = "OFF"
            urgency = "LOW"
            water_needed_mm = 0
        else:
            max_irrigation = min(40, root_depth_mm * 0.04)
            water_needed_mm = min(max_irrigation, max(5, water_needed_mm))
            if drainage_factor < 1.0:
                reason += f" (reduced for {drainage_class.lower().replace('_', ' ')} drainage)"
        
        water_needed_mm = round(water_needed_mm, 1)
        water_needed_liters = round(water_needed_mm * area_ha * 10_000, 0) if area_ha > 0 else 0.0

    # 🔥 Decision Logging (Step 4)
    logger.info(
        "decision_debug block=%s soil=%.2f ndwi=%s rain24=%.2f rain48=%.2f temp=%.2f irrigation=%s confidence=%.2f score=%s recent_rain_override=%s soil_wet_override=%s data_age_days=%s data_quality=%s",
        data.get("block_id"),
        soil_moisture,
        ndwi,
        rain_24h,
        rain_next_48h,
        temp_avg if temp_avg is not None else -1,
        irrigation,
        confidence,
        score,
        recent_rain_override,
        soil_wet_override,
        satellite_data_age_days,
        satellite_data_quality,
    )

    return {
        "irrigation": irrigation,
        "urgency": urgency,
        "water_needed_mm": water_needed_mm,
        "water_needed_liters": water_needed_liters,
        "reason": reason,
        "warning": warning,
        "confidence": round(confidence, 2),
        "metadata": {
            "score": score,
            "soil_moisture": soil_moisture,
            "ndvi": ndvi,
            "ndwi": ndwi,
            "rain_24h": rain_24h,
            "rain_next_48h": rain_next_48h,
            "temp_avg": temp_avg,
            "satellite_data_quality": satellite_data_quality,
            "satellite_data_age_days": satellite_data_age_days,
            "soil_factor": soil_factor,
            "soil_label": soil_props["soil_label"],
            "soil_source": soil_props["source"],
            "drainage_class": drainage_class,
            "weather_available": weather_available,
            "forecast_threshold": forecast_threshold,
            "recent_rain_threshold": recent_rain_threshold,
            "recent_rain_override": recent_rain_override,
            "soil_wet_override": soil_wet_override,
            "water_needed_liters": water_needed_liters,
            "warning": warning,
        }
    }


def _save_decision(db: Session, block_id: UUID, decision: dict[str, Any]) -> None:
    """
    Saves the decision to the block_decisions table.
    """
    db.execute(
        text("""
            INSERT INTO block_decisions (block_id, status, decision_payload, created_at, satellite_ready, weather_ready, sensors_ready)
            VALUES (:block_id, 'completed', :payload, NOW(), :sat, :weath, :sens)
            ON CONFLICT (block_id)
            DO UPDATE SET
                decision_payload = EXCLUDED.decision_payload,
                status = 'completed',
                created_at = NOW(),
                satellite_ready = EXCLUDED.satellite_ready,
                weather_ready = EXCLUDED.weather_ready,
                sensors_ready = EXCLUDED.sensors_ready
        """),
        {
            "block_id": str(block_id),
            "payload": json.dumps(decision),
            "sat": decision["metadata"]["ndvi"] is not None,
            "weath": bool(decision["metadata"].get("weather_available", False)),
            "sens": (
                decision["metadata"]["soil_moisture"] is not None
                and decision["metadata"]["soil_moisture"] > 0
            )
        }
    )
    db.commit()
