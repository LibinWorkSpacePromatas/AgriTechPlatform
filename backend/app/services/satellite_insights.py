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
from app.schemas.satellite import BlockInsightsResponse, SatelliteTimeseriesPoint
from app.services.earth_engine import EarthEngineConfigurationError, EarthEngineExecutionError, earth_engine_client
from app.services.interpretation_engine import interpret_satellite_payload


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

    def get_block_insights(self, db: Session, block: Block, *, force_refresh: bool = False) -> BlockInsightsResponse:
        request_started_at = perf_counter()
        window_from, window_to = self._build_composite_window()
        geometry_payload = self._load_block_geometry(db, block.id)
        fresh_cache = self._load_cache(db, block.id, geometry_payload.geometry_hash, only_fresh=True)

        if fresh_cache is not None and not force_refresh:
            response = self._response_from_cache(
                fresh_cache,
                status="fresh",
                source="cache",
                latency_ms=self._elapsed_ms(request_started_at),
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

        stale_cache = self._load_cache(db, block.id, geometry_payload.geometry_hash, only_fresh=False)
        job = None
        enqueue_error = geometry_payload.error

        if geometry_payload.is_queryable:
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

        if stale_cache is not None:
            response = self._response_from_cache(
                stale_cache,
                status="stale",
                source="cache",
                latency_ms=self._elapsed_ms(request_started_at),
                error=self._resolve_error_message(
                    data_quality=self._deserialize_cache_payload(stale_cache).data_quality,
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
            self._build_no_data_response(block.id, window_from, window_to),
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

    def refresh_block_insights(self, db: Session, block: Block) -> BlockInsightsResponse:
        window_from, window_to = self._build_composite_window()
        geometry_payload = self._load_block_geometry(db, block.id)

        if not geometry_payload.is_queryable:
            response = self._decorate_response(
                self._build_no_data_response(block.id, window_from, window_to),
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

            window_start = window_end - timedelta(days=self._settings.satellite_composite_window_days - 1)

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
    ) -> BlockInsightsResponse:
        computation = self._earth_engine.compute_block_insights(
            geometry_geojson,
            date_from=date_from,
            date_to=date_to,
        )
        return self._decorate_response(
            self._with_interpretation(BlockInsightsResponse(
                block_id=str(block.id),
                ndvi=computation.ndvi,
                ndwi=computation.ndwi,
                evi=computation.evi,
                ndre=computation.ndre,
                lai=computation.lai,
                cloud_cover_pct=computation.cloud_cover_pct,
                pixel_count=computation.pixel_count,
                map_tile_url=computation.map_tile_url,
                data_quality=computation.data_quality,
                composite_date_from=computation.composite_date_from,
                composite_date_to=computation.composite_date_to,
            )),
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
                        ST_Transform(ST_MakeValid(geom), 3857) AS valid_geom
                    FROM blocks
                    WHERE id = :block_id
                ),
                buffered AS (
                    SELECT
                        is_valid,
                        is_empty,
                        CASE
                            WHEN ST_IsEmpty(ST_Buffer(valid_geom, -:buffer_meters))
                                THEN valid_geom
                            ELSE ST_Buffer(valid_geom, -:buffer_meters)
                        END AS buffered_geom
                    FROM prepared
                )
                SELECT
                    is_valid,
                    is_empty,
                    ST_AsGeoJSON(
                        ST_Transform(
                            ST_SimplifyPreserveTopology(buffered_geom, :simplify_tolerance_meters),
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

    def _deserialize_cache_payload(self, cache: SatelliteCache) -> BlockInsightsResponse:
        return self._with_interpretation(BlockInsightsResponse.model_validate(cache.payload))

    def _response_from_cache(
        self,
        cache: SatelliteCache,
        *,
        status: str,
        source: str,
        latency_ms: int,
        error: str | None = None,
    ) -> BlockInsightsResponse:
        return self._decorate_response(
            self._deserialize_cache_payload(cache),
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

        payload = response.model_dump(mode="json")
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

    def _build_no_data_response(self, block_id: Any, window_from: date, window_to: date) -> BlockInsightsResponse:
        return self._with_interpretation(BlockInsightsResponse(
            block_id=str(block_id),
            ndvi=None,
            ndwi=None,
            evi=None,
            ndre=None,
            lai=None,
            cloud_cover_pct=None,
            pixel_count=0,
            map_tile_url=None,
            data_quality="no_data",
            composite_date_from=window_from,
            composite_date_to=window_to,
        ))

    def _decorate_response(
        self,
        response: BlockInsightsResponse,
        *,
        status: str,
        source: str,
        latency_ms: int,
        error: str | None = None,
        infer_error: bool = True,
        cache_last_updated_at: datetime | None = None,
        cache_expires_at: datetime | None = None,
    ) -> BlockInsightsResponse:
        return self._with_interpretation(response).model_copy(
            update={
                "status": status,
                "source": "real",
                "freshness_status": status,
                "latency_ms": latency_ms,
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

    def _with_interpretation(self, response: BlockInsightsResponse) -> BlockInsightsResponse:
        return BlockInsightsResponse.model_validate(
            {
                **response.model_dump(mode="python"),
                **interpret_satellite_payload(
                    {
                        "ndvi": response.ndvi,
                        "ndwi": response.ndwi,
                        "ndre": response.ndre,
                        "evi": response.evi,
                        "lai": response.lai,
                    }
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
            return "Cloud-heavy imagery reduced the reliability of this composite."
        if data_quality == "no_data":
            return "No usable satellite pixels were available for the selected period."
        return None

    def _build_composite_window(self) -> tuple[date, date]:
        today = self._utcnow().date()
        return today - timedelta(days=self._settings.satellite_composite_window_days - 1), today

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
