from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
from time import perf_counter
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.models import Block, SatelliteCache, SatelliteTimeseries
from app.schemas.satellite import BlockInsightsResponse
from app.services.earth_engine import EarthEngineConfigurationError, EarthEngineExecutionError, earth_engine_client


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
            self._store_cache(db, block.id, geometry_payload.geometry_hash, response, gee_execution_ms=0)
            return response

        try:
            computation = self._earth_engine.compute_block_insights(
                geometry_payload.geojson or {},
                date_from=window_from,
                date_to=window_to,
            )
            now = self._utcnow()
            expires_at = (now + timedelta(days=self._settings.satellite_cache_ttl_days)).date()
            response = self._decorate_response(
                BlockInsightsResponse(
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
                ),
                status="fresh",
                source="gee",
                latency_ms=computation.execution_ms,
                error=self._resolve_error_message(data_quality=computation.data_quality),
                expires_at=expires_at,
            )
            self._store_cache(
                db,
                block.id,
                geometry_payload.geometry_hash,
                response,
                gee_execution_ms=computation.execution_ms,
            )
            logger.info(
                "event=satellite_cache_refreshed block_id=%s gee_execution_ms=%s data_quality=%s pixels=%s",
                block.id,
                computation.execution_ms,
                response.data_quality,
                response.pixel_count,
            )
            return response
        except (EarthEngineConfigurationError, EarthEngineExecutionError) as exc:
            raise SatelliteInsightsUnavailableError(str(exc)) from exc

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
        return BlockInsightsResponse.model_validate(cache.payload)

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
            expires_at=cache.expires_at.date() if cache.expires_at else None,
        )

    def _store_cache(
        self,
        db: Session,
        block_id: Any,
        geometry_hash: str,
        response: BlockInsightsResponse,
        *,
        gee_execution_ms: int,
    ) -> None:
        now = self._utcnow()
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
        cache.expires_at = now + timedelta(days=self._settings.satellite_cache_ttl_days)

        db.add(cache)
        self._upsert_timeseries(db, block_id, geometry_hash, response)
        db.commit()

    def _upsert_timeseries(
        self,
        db: Session,
        block_id: Any,
        geometry_hash: str,
        response: BlockInsightsResponse,
    ) -> None:
        observed_on = response.composite_date_to or self._utcnow().date()
        record = (
            db.query(SatelliteTimeseries)
            .filter(
                SatelliteTimeseries.block_id == block_id,
                SatelliteTimeseries.observed_on == observed_on,
                SatelliteTimeseries.geometry_hash == geometry_hash,
            )
            .first()
        )
        if record is None:
            record = SatelliteTimeseries(
                block_id=block_id,
                observed_on=observed_on,
                geometry_hash=geometry_hash,
            )

        record.composite_date_from = response.composite_date_from
        record.composite_date_to = response.composite_date_to
        record.ndvi = response.ndvi
        record.ndwi = response.ndwi
        record.evi = response.evi
        record.ndre = response.ndre
        record.lai = response.lai
        record.cloud_cover_pct = response.cloud_cover_pct
        record.pixel_count = response.pixel_count
        record.data_quality = response.data_quality
        db.add(record)

    def _build_no_data_response(self, block_id: Any, window_from: date, window_to: date) -> BlockInsightsResponse:
        return BlockInsightsResponse(
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
        )

    def _decorate_response(
        self,
        response: BlockInsightsResponse,
        *,
        status: str,
        source: str,
        latency_ms: int,
        error: str | None = None,
        infer_error: bool = True,
        expires_at: date | None = None,
    ) -> BlockInsightsResponse:
        today = self._utcnow().date()
        data_age_days = None
        if response.composite_date_to:
            data_age_days = (today - response.composite_date_to).days

        return response.model_copy(
            update={
                "status": status,
                "source": source,
                "latency_ms": latency_ms,
                "data_age_days": data_age_days,
                "expires_at": expires_at,
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
            return "Cloud-heavy imagery reduced the reliability of this composite."
        if data_quality == "no_data":
            return "No usable satellite pixels were available for the selected period."
        return None

    def _build_composite_window(self) -> tuple[date, date]:
        """
        Builds the 14-day data processing window for GEE.
        14 Days = DATA (Median Composite)
        """
        today = self._utcnow().date()
        # Exactly as requested: start_date = end_date - 14 days
        return today - timedelta(days=self._settings.satellite_composite_window_days), today

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
