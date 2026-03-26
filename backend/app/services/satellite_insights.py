from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from hashlib import sha256
from time import perf_counter
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.models import Block, SatelliteCache, SatelliteTimeseries
from app.schemas.insights import DashboardBlockInsightsResponse
from app.schemas.satellite import BlockInsightsResponse, SatelliteTimeseriesPoint
from app.services.earth_engine import EarthEngineConfigurationError, EarthEngineExecutionError, earth_engine_client
from app.services.alerts_engine import build_alerts
from app.services.interpretation_tables import interpret_payload
from app.services.limitations_engine import build_limitations


logger = logging.getLogger(__name__)


class SatelliteInsightsUnavailableError(RuntimeError):
    pass


@dataclass(slots=True)
class BlockGeometryPayload:
    geojson: dict[str, Any] | None
    geometry_hash: str
    is_queryable: bool
    error: str | None = None


class SatelliteInsightsService:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._earth_engine = earth_engine_client

    def initialize(self) -> None:
        self._earth_engine.initialize_if_configured()

    def shutdown(self) -> None:
        self._earth_engine.shutdown()

    def get_block_insights(self, db: Session, block: Block, *, force_refresh: bool = False) -> DashboardBlockInsightsResponse:
        request_started_at = perf_counter()
        window_from, window_to = self._build_composite_window()
        geometry_payload = self._load_block_geometry(db, block.id)
        cache = self._load_cache(db, block.id, geometry_payload.geometry_hash, only_fresh=False)
        job = None
        enqueue_error = geometry_payload.error

        if geometry_payload.is_queryable and (force_refresh or self._is_refresh_due(cache)):
            from app.services.satellite_scheduler import satellite_refresh_scheduler

            enqueue_result = satellite_refresh_scheduler.enqueue_block_refresh(
                db,
                block.id,
                reason="api_request",
                priority=self._settings.satellite_request_priority,
                force=force_refresh,
            )
            job = satellite_refresh_scheduler.get_job(db, block.id)
            if enqueue_result.error:
                enqueue_error = enqueue_result.error

        if cache is not None and not force_refresh:
            cache_status = "fresh" if self._is_cache_fresh(cache) else "stale"
            response = self._response_from_cache(
                cache,
                block_area_ha=block.area_ha,
                block_name=block.lanslu or str(block.id),
                status=cache_status,
                source="cache",
                latency_ms=self._elapsed_ms(request_started_at),
                error=self._resolve_error_message(
                    data_quality=self._deserialize_cache_payload(
                        cache,
                        block_area_ha=block.area_ha,
                        block_name=block.lanslu or str(block.id),
                    ).data_quality,
                    fallback=enqueue_error,
                    job_error=getattr(job, "last_error", None),
                ),
            )
            self._log_request(
                block_id=block.id,
                status=response.status,
                source=response.source,
                latency_ms=response.latency_ms,
                cache_hit=True,
                data_quality=response.data_quality,
            )
            return response

        response_status = "updating" if geometry_payload.is_queryable else "stale"
        placeholder = self._decorate_response(
            self._build_no_data_response(
                block.id,
                window_from,
                window_to,
                block_area_ha=block.area_ha,
                block_name=block.lanslu or str(block.id),
            ),
            status=response_status,
            source="cache",
            latency_ms=self._elapsed_ms(request_started_at),
            error=self._resolve_error_message(
                data_quality="no_data",
                fallback=enqueue_error,
                job_error=getattr(job, "last_error", None),
            ),
            infer_error=response_status != "updating",
        )
        self._log_request(
            block_id=block.id,
            status=placeholder.status,
            source=placeholder.source,
            latency_ms=placeholder.latency_ms,
            cache_hit=False,
            data_quality=placeholder.data_quality,
        )
        return placeholder

    def refresh_block_insights(self, db: Session, block: Block) -> DashboardBlockInsightsResponse:
        window_from, window_to = self._build_composite_window()
        geometry_payload = self._load_block_geometry(db, block.id)
        existing_cache = self._load_cache(db, block.id, geometry_payload.geometry_hash, only_fresh=False)

        if not geometry_payload.is_queryable:
            response = self._decorate_response(
                self._build_no_data_response(
                    block.id,
                    window_from,
                    window_to,
                    block_area_ha=block.area_ha,
                    block_name=block.lanslu or str(block.id),
                ),
                status="fresh",
                source="gee",
                latency_ms=0,
                error=geometry_payload.error,
            )
            cache_last_updated_at, cache_expires_at = self._store_cache(
                db,
                block.id,
                geometry_payload.geometry_hash,
                response,
                gee_execution_ms=0,
            )
            return response.model_copy(
                update={
                    "freshness_status": "fresh",
                    "cache_last_updated_at": cache_last_updated_at,
                    "cache_expires_at": cache_expires_at,
                }
            )

        try:
            if existing_cache is not None:
                acquisition_metadata = self._earth_engine.get_acquisition_metadata(
                    geometry_payload.geojson or {},
                    date_from=window_from,
                    date_to=window_to,
                )
                cached_response = self._deserialize_cache_payload(
                    existing_cache,
                    block_area_ha=block.area_ha,
                    block_name=block.lanslu or str(block.id),
                )
                if self._same_acquisition_pass(cached_response, acquisition_metadata.actual_dates):
                    cache_last_updated_at, cache_expires_at = self._touch_cache(
                        db,
                        existing_cache,
                        cached_response,
                    )
                    logger.info(
                        "event=satellite_refresh_skipped_no_new_image block_id=%s image_count=%s actual_dates=%s",
                        block.id,
                        acquisition_metadata.image_count,
                        [value.isoformat() for value in acquisition_metadata.actual_dates],
                    )
                    return cached_response.model_copy(
                        update={
                            "status": "fresh",
                            "freshness_status": "fresh",
                            "latency_ms": acquisition_metadata.execution_ms,
                            "cache_last_updated_at": cache_last_updated_at,
                            "cache_expires_at": cache_expires_at,
                        }
                    )

            response = self._compute_block_response_for_window(
                block,
                geometry_payload.geojson or {},
                date_from=window_from,
                date_to=window_to,
            )
            cache_last_updated_at, cache_expires_at = self._store_cache(
                db,
                block.id,
                geometry_payload.geometry_hash,
                response,
                gee_execution_ms=response.latency_ms,
            )
            logger.info(
                "event=satellite_cache_refreshed block_id=%s gee_execution_ms=%s data_quality=%s pixels=%s",
                block.id,
                response.latency_ms,
                response.data_quality,
                response.pixel_count,
            )
            return response.model_copy(
                update={
                    "freshness_status": "fresh",
                    "cache_last_updated_at": cache_last_updated_at,
                    "cache_expires_at": cache_expires_at,
                }
            )
        except (EarthEngineConfigurationError, EarthEngineExecutionError) as exc:
            raise SatelliteInsightsUnavailableError(str(exc)) from exc

    def backfill_block_timeseries(
        self,
        db: Session,
        block: Block,
        *,
        history_days: int | None = None,
        step_days: int | None = None,
    ) -> int:
        history_days = max(1, history_days or self._settings.satellite_backfill_history_days)
        step_days = max(1, step_days or self._settings.satellite_backfill_step_days)
        today = self._utcnow().date()
        latest_backfill_day = today - timedelta(days=step_days)

        if latest_backfill_day >= today:
            latest_backfill_day = today - timedelta(days=1)

        if latest_backfill_day < today - timedelta(days=history_days):
            return 0

        geometry_payload = self._load_block_geometry(db, block.id)
        if not geometry_payload.is_queryable:
            logger.info("event=satellite_backfill_skipped block_id=%s reason=geometry_unavailable", block.id)
            return 0

        existing_observed_days = {
            observed_on
            for (observed_on,) in (
                db.query(SatelliteTimeseries.observed_on)
                .filter(
                    SatelliteTimeseries.block_id == block.id,
                    SatelliteTimeseries.observed_on >= today - timedelta(days=history_days),
                    SatelliteTimeseries.observed_on <= latest_backfill_day,
                )
                .all()
            )
            if observed_on is not None
        }

        inserted = 0
        candidate_days = self._build_backfill_schedule(
            today=today,
            history_days=history_days,
            step_days=step_days,
        )

        for window_end in candidate_days:
            if window_end in existing_observed_days:
                continue

            window_start = window_end - timedelta(days=self._settings.satellite_composite_window_days)

            try:
                response = self._compute_block_response_for_window(
                    block,
                    geometry_payload.geojson or {},
                    date_from=window_start,
                    date_to=window_end,
                )
            except (EarthEngineConfigurationError, EarthEngineExecutionError) as exc:
                db.rollback()
                raise SatelliteInsightsUnavailableError(str(exc)) from exc

            recorded_at = datetime.combine(window_end, time(hour=12, minute=0), tzinfo=timezone.utc)
            self._append_timeseries(db, block.id, geometry_payload.geometry_hash, response, recorded_at=recorded_at)
            db.commit()
            inserted += 1
            existing_observed_days.add(response.composite_date_to or window_end)

        if inserted:
            logger.info(
                "event=satellite_backfill_completed block_id=%s inserted=%s history_days=%s step_days=%s",
                block.id,
                inserted,
                history_days,
                step_days,
            )

        return inserted

    def get_block_timeseries(self, db: Session, block: Block) -> list[SatelliteTimeseriesPoint]:
        records = (
            db.query(SatelliteTimeseries)
            .filter(SatelliteTimeseries.block_id == block.id)
            .order_by(SatelliteTimeseries.recorded_at.asc(), SatelliteTimeseries.id.asc())
            .all()
        )

        return [
            SatelliteTimeseriesPoint(
                date=record.recorded_at,
                observed_on=record.observed_on,
                ndvi=record.ndvi,
                ndwi=record.ndwi,
                evi=record.evi,
                ndre=record.ndre,
                lai=record.lai,
            )
            for record in records
        ]

    def _compute_block_response_for_window(
        self,
        block: Block,
        geometry_geojson: dict[str, Any],
        *,
        date_from: date,
        date_to: date,
    ) -> DashboardBlockInsightsResponse:
        computation = self._earth_engine.compute_block_insights(
            geometry_geojson,
            date_from=date_from,
            date_to=date_to,
            generate_tile_url=True,
        )
        return self._decorate_response(
            self._enrich_response(DashboardBlockInsightsResponse(
                block_id=str(block.id),
                search_window_from=date_from,
                search_window_to=date_to,
                ndvi=computation.ndvi,
                ndwi=computation.ndwi,
                evi=computation.evi,
                ndre=computation.ndre,
                lai=computation.lai,
                cloud_cover_pct=computation.cloud_cover_pct,
                pixel_count=computation.pixel_count,
                ndvi_tile_url=computation.ndvi_tile_url,
                ndwi_tile_url=computation.ndwi_tile_url,
                map_tile_url=computation.map_tile_url,
                map_tile_type="ndwi" if computation.map_tile_url else None,
                data_quality=computation.data_quality,
                composite_date_from=computation.composite_date_from,
                composite_date_to=computation.composite_date_to,
                acquisition_metadata={
                    "image_count": computation.image_count,
                    "actual_dates": computation.actual_dates,
                },
            ), block_area_ha=block.area_ha, block_name=block.lanslu or str(block.id)),
            status="fresh",
            source="gee",
            latency_ms=computation.execution_ms,
            error=self._resolve_error_message(data_quality=computation.data_quality),
        )

    def _load_block_geometry(self, db: Session, block_id: Any) -> BlockGeometryPayload:
        result = db.execute(
            text(
                """
                WITH prepared AS (
                    SELECT
                        ST_IsValid(geom) AS is_valid,
                        ST_IsEmpty(geom) AS is_empty,
                        ST_Transform(ST_MakeValid(geom), 3857) AS valid_geom,
                        ST_Area(ST_Transform(ST_MakeValid(geom), 3857)) AS area_m2,
                        COALESCE(area_ha, 0) AS area_ha
                    FROM blocks
                    WHERE id = :block_id
                ),
                buffered AS (
                    SELECT
                        is_valid,
                        is_empty,
                        area_m2,
                        area_ha,
                        CASE
                            WHEN area_ha > 0
                                 AND area_m2 < (area_ha * 10000.0 * :min_geometry_area_ratio)
                                THEN ST_Buffer(
                                    ST_Centroid(valid_geom),
                                    sqrt((area_ha * 10000.0) / pi())
                                )
                            WHEN area_m2 < :min_buffer_area_m2 THEN valid_geom
                            WHEN ST_IsEmpty(ST_Buffer(valid_geom, -:buffer_meters)) THEN valid_geom
                            ELSE ST_Buffer(valid_geom, -:buffer_meters)
                        END AS buffered_geom,
                        CASE
                            WHEN area_m2 < :min_buffer_area_m2 THEN 0.0
                            ELSE :simplify_tolerance_meters
                        END AS simplify_tolerance_meters
                    FROM prepared
                )
                SELECT
                    is_valid,
                    is_empty,
                    ST_AsGeoJSON(
                        ST_Transform(
                            ST_SimplifyPreserveTopology(buffered_geom, simplify_tolerance_meters),
                            4326
                        )
                    ) AS buffered_geojson
                FROM buffered
                """
            ),
            {
                "block_id": str(block_id),
                "buffer_meters": self._settings.satellite_buffer_meters,
                "simplify_tolerance_meters": self._settings.satellite_simplify_tolerance_meters,
                "min_buffer_area_m2": 10_000.0,
                "min_geometry_area_ratio": 0.25,
            },
        ).mappings().first()

        if result is None:
            return BlockGeometryPayload(
                geojson=None,
                geometry_hash=f"missing:{block_id}",
                is_queryable=False,
                error="Block geometry could not be loaded.",
            )

        if not result.get("is_valid") or result.get("is_empty") or not result.get("buffered_geojson"):
            return BlockGeometryPayload(
                geojson=None,
                geometry_hash=f"invalid:{block_id}",
                is_queryable=False,
                error="Block geometry is invalid or empty.",
            )

        geojson = json.loads(result["buffered_geojson"])
        geometry_hash = sha256(json.dumps(geojson, sort_keys=True).encode("utf-8")).hexdigest()
        return BlockGeometryPayload(geojson=geojson, geometry_hash=geometry_hash, is_queryable=True)

    def _load_cache(
        self,
        db: Session,
        block_id: Any,
        geometry_hash: str,
        *,
        only_fresh: bool,
    ) -> SatelliteCache | None:
        cache = db.get(SatelliteCache, block_id)
        if cache is None or cache.geometry_hash != geometry_hash:
            return None
        if only_fresh and cache.expires_at <= self._utcnow():
            return None
        return cache

    def _deserialize_cache_payload(
        self,
        cache: SatelliteCache,
        *,
        block_area_ha: float | None = None,
        block_name: str | None = None,
    ) -> DashboardBlockInsightsResponse:
        response = DashboardBlockInsightsResponse.model_validate(cache.payload)
        search_window_from, search_window_to = self._infer_cached_search_window(cache)
        if response.search_window_from is None or response.search_window_to is None:
            response = response.model_copy(
                update={
                    "search_window_from": response.search_window_from or search_window_from,
                    "search_window_to": response.search_window_to or search_window_to,
                }
            )
        # Always rebuild derived interpretation state from cached raw metrics so
        # rule/message changes are reflected immediately without requiring cache invalidation.
        return self._enrich_response(response, block_area_ha=block_area_ha, block_name=block_name)

    def _response_from_cache(
        self,
        cache: SatelliteCache,
        *,
        block_area_ha: float | None = None,
        block_name: str | None = None,
        status: str,
        source: str,
        latency_ms: int,
        error: str | None = None,
    ) -> DashboardBlockInsightsResponse:
        return self._decorate_response(
            self._deserialize_cache_payload(cache, block_area_ha=block_area_ha, block_name=block_name),
            status=status,
            source=source,
            latency_ms=latency_ms,
            error=error,
            cache_last_updated_at=cache.last_updated,
            cache_expires_at=cache.expires_at,
        )

    def _store_cache(
        self,
        db: Session,
        block_id: Any,
        geometry_hash: str,
        response: BlockInsightsResponse,
        *,
        gee_execution_ms: int,
    ) -> tuple[datetime, datetime]:
        now = self._utcnow()
        expires_at = now + timedelta(days=self._settings.satellite_cache_ttl_days)
        cache = db.get(SatelliteCache, block_id)
        if cache is None:
            cache = SatelliteCache(block_id=block_id)

        payload = self._serialize_cache_payload(response)
        cache.geometry_hash = geometry_hash
        cache.payload = payload
        cache.data_quality = response.data_quality
        cache.composite_date_from = response.composite_date_from
        cache.composite_date_to = response.composite_date_to
        cache.pixel_count = response.pixel_count
        cache.gee_execution_ms = gee_execution_ms
        cache.map_tile_url = response.map_tile_url
        cache.last_updated = now
        cache.refreshed_at = now
        cache.expires_at = expires_at

        db.add(cache)
        self._append_timeseries(db, block_id, geometry_hash, response, recorded_at=now)
        db.commit()
        return now, expires_at

    def _touch_cache(
        self,
        db: Session,
        cache: SatelliteCache,
        response: BlockInsightsResponse,
    ) -> tuple[datetime, datetime]:
        now = self._utcnow()
        expires_at = now + timedelta(days=self._settings.satellite_cache_ttl_days)
        cache.payload = self._serialize_cache_payload(response)
        cache.data_quality = response.data_quality
        cache.composite_date_from = response.composite_date_from
        cache.composite_date_to = response.composite_date_to
        cache.pixel_count = response.pixel_count
        cache.map_tile_url = response.map_tile_url
        cache.last_updated = now
        cache.refreshed_at = now
        cache.expires_at = expires_at
        db.add(cache)
        db.commit()
        return now, expires_at

    def _append_timeseries(
        self,
        db: Session,
        block_id: Any,
        geometry_hash: str,
        response: BlockInsightsResponse,
        *,
        recorded_at: datetime,
    ) -> None:
        observed_on = response.composite_date_to or self._utcnow().date()
        existing_record = (
            db.query(SatelliteTimeseries)
            .filter(
                SatelliteTimeseries.block_id == block_id,
                SatelliteTimeseries.observed_on == observed_on,
                SatelliteTimeseries.geometry_hash == geometry_hash,
            )
            .first()
        )
        if existing_record is not None:
            return

        record = SatelliteTimeseries(
            block_id=block_id,
            observed_on=observed_on,
            recorded_at=recorded_at,
            composite_date_from=response.composite_date_from,
            composite_date_to=response.composite_date_to,
            geometry_hash=geometry_hash,
            ndvi=response.ndvi,
            ndwi=response.ndwi,
            evi=response.evi,
            ndre=response.ndre,
            lai=response.lai,
            cloud_cover_pct=response.cloud_cover_pct,
            pixel_count=response.pixel_count,
            data_quality=response.data_quality,
        )
        db.add(record)

    def _build_no_data_response(
        self,
        block_id: Any,
        window_from: date,
        window_to: date,
        *,
        block_area_ha: float | None,
        block_name: str | None,
    ) -> DashboardBlockInsightsResponse:
        return self._enrich_response(DashboardBlockInsightsResponse(
            block_id=str(block_id),
            search_window_from=window_from,
            search_window_to=window_to,
            ndvi=None,
            ndwi=None,
            evi=None,
            ndre=None,
            lai=None,
            cloud_cover_pct=None,
            pixel_count=0,
            ndvi_tile_url=None,
            ndwi_tile_url=None,
            map_tile_url=None,
            map_tile_type=None,
            data_quality="no_data",
            composite_date_from=window_from,
            composite_date_to=window_to,
        ), block_area_ha=block_area_ha, block_name=block_name)

    def _decorate_response(
        self,
        response: DashboardBlockInsightsResponse,
        *,
        status: str,
        source: str,
        latency_ms: int,
        error: str | None = None,
        infer_error: bool = True,
        cache_last_updated_at: datetime | None = None,
        cache_expires_at: datetime | None = None,
    ) -> DashboardBlockInsightsResponse:
        today = self._utcnow().date()
        data_age_days = None
        if response.composite_date_to:
            data_age_days = (today - response.composite_date_to).days

        return response.model_copy(
            update={
                "status": status,
                "source": "real",
                "freshness_status": status,
                "latency_ms": latency_ms,
                "data_age_days": data_age_days,
                "cache_last_updated_at": cache_last_updated_at,
                "cache_expires_at": cache_expires_at,
                "error": error
                if error is not None
                else (
                    self._resolve_error_message(data_quality=response.data_quality)
                    if infer_error
                    else None
                ),
            }
        )

    def _resolve_error_message(
        self,
        *,
        data_quality: str,
        fallback: str | None = None,
        job_error: str | None = None,
    ) -> str | None:
        if fallback:
            return fallback
        if job_error:
            return job_error
        if data_quality == "degraded":
            return "Degraded composite quality due to low usable pixels and/or cloud contamination."
        if data_quality == "no_data":
            return "No usable satellite pixels were available for the selected period."
        return None

    def _enrich_response(
        self,
        response: DashboardBlockInsightsResponse,
        *,
        block_area_ha: float | None,
        block_name: str | None = None,
    ) -> DashboardBlockInsightsResponse:
        alert_block_name = block_name or response.block_id
        interpretations = interpret_payload(
            {
                "ndvi": response.ndvi,
                "ndwi": response.ndwi,
                "ndre": response.ndre,
                "evi": response.evi,
                "lai": response.lai,
            }
        )
        limitations = build_limitations(
            cloud_cover_pct=response.cloud_cover_pct,
            data_quality=response.data_quality,
            composite_date_to=response.composite_date_to,
            block_area_ha=block_area_ha,
            ndvi=response.ndvi,
            lai=response.lai,
            block_name=alert_block_name,
            settings=self._settings,
        )
        return type(response).model_validate(
            {
                **response.model_dump(mode="python"),
                "interpretations": interpretations,
                "alerts": build_alerts(
                    {
                        "ndvi": response.ndvi,
                        "ndwi": response.ndwi,
                        "ndre": response.ndre,
                        "evi": response.evi,
                        "lai": response.lai,
                        "cloud_cover_pct": response.cloud_cover_pct,
                    },
                    alert_block_name,
                ),
                "limitations": limitations,
                "last_satellite_update": (
                    response.acquisition_metadata.actual_dates[-1]
                    if response.acquisition_metadata.actual_dates
                    else response.last_satellite_update
                ),
                "map_tile_type": response.map_tile_type or ("ndwi" if response.map_tile_url else None),
            }
        )

    def _same_acquisition_pass(self, response: BlockInsightsResponse, actual_dates: list[date]) -> bool:
        cached_dates = [value for value in response.acquisition_metadata.actual_dates]
        return cached_dates == actual_dates

    def _serialize_cache_payload(self, response: BlockInsightsResponse) -> dict[str, Any]:
        raw_payload = response.model_dump(
            mode="json",
            include={
                "block_id",
                "source",
                "freshness_status",
                "search_window_from",
                "search_window_to",
                "composite_date_from",
                "composite_date_to",
                "last_satellite_update",
                "ndvi",
                "ndwi",
                "evi",
                "ndre",
                "lai",
                "cloud_cover_pct",
                "pixel_count",
                "map_tile_url",
                "map_tile_type",
                "data_quality",
                "acquisition_metadata",
            },
        )
        return raw_payload

    def _is_refresh_due(self, cache: SatelliteCache | None) -> bool:
        if cache is None:
            return True
        return cache.expires_at <= self._utcnow()

    def _is_cache_fresh(self, cache: SatelliteCache) -> bool:
        return cache.expires_at > self._utcnow()

    def _build_composite_window(self) -> tuple[date, date]:
        """
        Builds the 14-day data processing window for GEE.
        14 Days = DATA (Median Composite)
        """
        today = self._utcnow().date()
        # Exactly as requested: start_date = end_date - 14 days
        return today - timedelta(days=self._settings.satellite_composite_window_days), today

    def _infer_cached_search_window(self, cache: SatelliteCache) -> tuple[date | None, date | None]:
        reference_timestamp = cache.refreshed_at or cache.last_updated
        if reference_timestamp is None:
            return None, None

        search_window_to = reference_timestamp.date()
        search_window_from = search_window_to - timedelta(days=self._settings.satellite_composite_window_days - 1)
        return search_window_from, search_window_to

    @staticmethod
    def _build_backfill_schedule(*, today: date, history_days: int, step_days: int) -> list[date]:
        start_day = today - timedelta(days=history_days)
        latest_backfill_day = today - timedelta(days=step_days)
        if latest_backfill_day < start_day:
            return []

        total_days = max(0, (latest_backfill_day - start_day).days)
        steps = total_days // step_days
        return [start_day + timedelta(days=index * step_days) for index in range(steps + 1)]

    def _log_request(
        self,
        *,
        block_id: Any,
        status: str,
        source: str,
        latency_ms: int,
        cache_hit: bool,
        data_quality: str,
    ) -> None:
        logger.info(
            "event=satellite_request block_id=%s status=%s source=%s latency_ms=%s cache_hit=%s data_quality=%s",
            block_id,
            status,
            source,
            latency_ms,
            cache_hit,
            data_quality,
        )

    @staticmethod
    def _elapsed_ms(started_at: float) -> int:
        return int((perf_counter() - started_at) * 1000)

    @staticmethod
    def _utcnow() -> datetime:
        return datetime.now(timezone.utc)


satellite_insights_service = SatelliteInsightsService()
