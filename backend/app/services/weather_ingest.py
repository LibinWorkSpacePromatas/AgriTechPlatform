from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone
import zoneinfo
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session


OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def _utcnow() -> datetime:
    return datetime.now(dt_timezone.utc)


def get_block_info(db: Session, block_id: UUID) -> dict[str, Any]:
    row = (
        db.execute(
            text(
                """
                SELECT
                    ST_Y(ST_Centroid(geom)) AS lat,
                    ST_X(ST_Centroid(geom)) AS lon,
                    timezone
                FROM blocks
                WHERE id = :block_id
                """
            ),
            {"block_id": str(block_id)},
        )
        .mappings()
        .first()
    )
    if not row:
        return {"lat": None, "lon": None, "timezone": "Australia/Sydney"}

    lat = row.get("lat")
    lon = row.get("lon")
    tz = row.get("timezone") or "Australia/Sydney"

    try:
        return {
            "lat": float(lat) if lat is not None else None,
            "lon": float(lon) if lon is not None else None,
            "timezone": tz,
        }
    except (TypeError, ValueError):
        return {"lat": None, "lon": None, "timezone": tz}


def get_block_centroid_lat_lon(db: Session, block_id: UUID) -> tuple[float | None, float | None]:
    info = get_block_info(db, block_id)
    return info["lat"], info["lon"]


def is_weather_fresh(db: Session, block_id: UUID, *, freshness_minutes: int = 60) -> bool:
    cutoff = _utcnow() - timedelta(minutes=freshness_minutes)
    exists = (
        db.execute(
            text(
                """
                SELECT 1
                FROM weather_timeseries
                WHERE block_id = :block_id
                AND observed_at >= :cutoff
                LIMIT 1
                """
            ),
            {"block_id": str(block_id), "cutoff": cutoff},
        )
        .mappings()
        .first()
    )
    return bool(exists)


def fetch_weather(lat: float, lon: float, timezone: str = "Australia/Sydney") -> dict[str, Any]:
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "temperature_2m,relative_humidity_2m,precipitation",
        "past_days": 1, # Ensure we have history for last 24h summary
        "forecast_days": 7,
        "timezone": timezone,
    }
    with httpx.Client(timeout=10.0) as client:
        response = client.get(OPEN_METEO_URL, params=params)
        response.raise_for_status()
        return response.json()


def store_weather(db: Session, block_id: UUID, data: dict[str, Any], timezone_str: str = "Australia/Sydney") -> int:
    hourly = (data or {}).get("hourly") or {}
    times = hourly.get("time") or []
    temps = hourly.get("temperature_2m") or []
    humidity = hourly.get("relative_humidity_2m") or []
    rain = hourly.get("precipitation") or []

    count = min(len(times), len(temps), len(humidity), len(rain))
    if count <= 0:
        return 0

    rows = []
    tz = zoneinfo.ZoneInfo(timezone_str)

    for index in range(count):
        # Open-Meteo returns time as "YYYY-MM-DDTHH:MM" (ISO format without offset)
        local_time = datetime.fromisoformat(times[index])
        # Localize it to the block's timezone and convert to UTC
        utc_time = local_time.replace(tzinfo=tz).astimezone(dt_timezone.utc)

        rows.append(
            {
                "block_id": str(block_id),
                "observed_at": utc_time,
                "temperature": temps[index],
                "humidity": humidity[index],
                "precipitation": rain[index],
            }
        )

    db.execute(
        text(
            """
            INSERT INTO weather_timeseries (
                block_id,
                observed_at,
                temperature,
                humidity,
                precipitation
            )
            VALUES (
                :block_id,
                :observed_at,
                :temperature,
                :humidity,
                :precipitation
            )
            ON CONFLICT (block_id, observed_at) DO NOTHING
            """
        ),
        rows,
    )
    db.commit()
    return count


def query_weather_ranges(db: Session, block_id: UUID) -> dict[str, list[dict[str, Any]]]:
    # Fetch block timezone
    info = get_block_info(db, block_id)
    block_tz_str = info.get("timezone", "Australia/Sydney")
    block_tz = zoneinfo.ZoneInfo(block_tz_str)

    def _rows(sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        results = db.execute(text(sql), params).mappings().all()
        items: list[dict[str, Any]] = []
        for row in results:
            observed_at = row.get("observed_at")
            observed_at_local_str = None
            if isinstance(observed_at, datetime):
                observed_at_value = observed_at.isoformat()
                # Convert UTC to local time for the response
                local_dt = observed_at.astimezone(block_tz)
                observed_at_local_str = local_dt.strftime("%Y-%m-%d %H:%M")
            else:
                observed_at_value = str(observed_at) if observed_at is not None else None
            
            items.append(
                {
                    "observed_at": observed_at_value,
                    "observed_at_local": observed_at_local_str,
                    "timezone": block_tz_str,
                    "temperature": row.get("temperature"),
                    "humidity": row.get("humidity"),
                    "precipitation": row.get("precipitation"),
                }
            )
        return items

    block_id_str = str(block_id)
    # Fix: Get actual past 24 hours (data before now)
    last_24h = _rows(
        """
        SELECT observed_at, temperature, humidity, precipitation
        FROM weather_timeseries
        WHERE block_id = :block_id
        AND observed_at BETWEEN NOW() - INTERVAL '24 hours' AND NOW()
        ORDER BY observed_at DESC
        LIMIT 24
        """,
        {"block_id": block_id_str},
    )
    # Fix: Get actual past 7 days (data before now)
    last_7d = _rows(
        """
        SELECT observed_at, temperature, humidity, precipitation
        FROM weather_timeseries
        WHERE block_id = :block_id
        AND observed_at BETWEEN NOW() - INTERVAL '7 days' AND NOW()
        ORDER BY observed_at DESC
        """,
        {"block_id": block_id_str},
    )
    # Fix: Correctly query the next 72 hours for irrigation decision needs
    next_72h = _rows(
        """
        SELECT observed_at, temperature, humidity, precipitation
        FROM weather_timeseries
        WHERE block_id = :block_id
        AND observed_at BETWEEN NOW() AND NOW() + INTERVAL '72 hours'
        ORDER BY observed_at ASC
        """,
        {"block_id": block_id_str},
    )
    # Fix: Correctly query the next 7 days for the frontend forecast view
    next_7d = _rows(
        """
        SELECT observed_at, temperature, humidity, precipitation
        FROM weather_timeseries
        WHERE block_id = :block_id
        AND observed_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        ORDER BY observed_at ASC
        """,
        {"block_id": block_id_str},
    )
    return {
        "last_24h": last_24h, 
        "last_7d": last_7d, 
        "next_72h": next_72h,
        "next_7d": next_7d
    }


def build_weather_summary(weather: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    last_24h = weather.get("last_24h") or []
    next_72h = weather.get("next_72h") or []

    def _sum_precip(items: list[dict[str, Any]]) -> float:
        total = 0.0
        for item in items:
            value = item.get("precipitation")
            try:
                total += float(value or 0.0)
            except (TypeError, ValueError):
                continue
        return total

    def _avg(items: list[dict[str, Any]], key: str) -> float | None:
        values: list[float] = []
        for item in items:
            value = item.get(key)
            try:
                values.append(float(value))
            except (TypeError, ValueError):
                continue
        if not values:
            return None
        return sum(values) / len(values)

    return {
        "rain_last_24h": _sum_precip(last_24h),
        "rain_next_3d": _sum_precip(next_72h),
        "avg_temp_last_24h": _avg(last_24h, "temperature"),
        "avg_humidity_last_24h": _avg(last_24h, "humidity"),
    }

