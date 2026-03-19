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
from app.db.models import Block, SatelliteCache
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


class SatelliteInsightsService:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._earth_engine = earth_engine_client

    def initialize(self) -> None:
        self._earth_engine.initialize_if_configured()

    def get_block_insights(self, db: Session, block: Block, *, force_refresh: bool = False) -> BlockInsightsResponse:
        window_from, window_to = self._build_composite_window()
        geometry_payload = self._load_block_geometry(db, block.id)
        fresh_cache = self._load_cache(db, block.id, geometry_payload.geometry_hash, only_fresh=True)

        if fresh_cache is not None and not force_refresh:
            return self._deserialize_cache_payload(fresh_cache)

        stale_cache = self._load_cache(db, block.id, geometry_payload.geometry_hash, only_fresh=False)

        if not geometry_payload.is_queryable:
            response = self._build_no_data_response(block.id, window_from, window_to)
            self._store_cache(db, block.id, geometry_payload.geometry_hash, response, gee_execution_ms=0)
            return response

        try:
            started_at = perf_counter()
            computation = self._earth_engine.compute_block_insights(
                geometry_payload.geojson or {},
                date_from=window_from,
                date_to=window_to,
            )
            response = BlockInsightsResponse(
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
            )
            self._store_cache(
                db,
                block.id,
                geometry_payload.geometry_hash,
                response,
                gee_execution_ms=computation.execution_ms or int((perf_counter() - started_at) * 1000),
            )
            logger.info(
                "Satellite insights refreshed for block %s in %sms.",
                block.id,
                computation.execution_ms,
            )
            return response
        except (EarthEngineConfigurationError, EarthEngineExecutionError) as exc:
            if stale_cache is not None:
                logger.warning("Falling back to stale satellite cache for block %s after GEE failure: %s", block.id, exc)
                return self._deserialize_cache_payload(stale_cache)
            raise SatelliteInsightsUnavailableError(str(exc)) from exc

    def _load_block_geometry(self, db: Session, block_id: Any) -> BlockGeometryPayload:
        result = db.execute(
            text(
                """
                SELECT
                    ST_IsValid(geom) AS is_valid,
                    ST_IsEmpty(geom) AS is_empty,
                    ST_AsGeoJSON(
                        ST_Transform(
                            CASE
                                WHEN ST_IsEmpty(ST_Buffer(ST_Transform(ST_MakeValid(geom), 3857), -:buffer_meters))
                                    THEN ST_Transform(ST_MakeValid(geom), 3857)
                                ELSE ST_Buffer(ST_Transform(ST_MakeValid(geom), 3857), -:buffer_meters)
                            END,
                            4326
                        )
                    ) AS buffered_geojson
                FROM blocks
                WHERE id = :block_id
                """
            ),
            {
                "block_id": str(block_id),
                "buffer_meters": self._settings.satellite_buffer_meters,
            },
        ).mappings().first()

        if result is None or not result.get("is_valid") or result.get("is_empty") or not result.get("buffered_geojson"):
            return BlockGeometryPayload(
                geojson=None,
                geometry_hash=f"invalid:{block_id}",
                is_queryable=False,
            )

        geojson = json.loads(result["buffered_geojson"])
        geometry_hash = sha256(json.dumps(geojson, sort_keys=True).encode("utf-8")).hexdigest()
        return BlockGeometryPayload(
            geojson=geojson,
            geometry_hash=geometry_hash,
            is_queryable=True,
        )

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

        cache.geometry_hash = geometry_hash
        cache.payload = response.model_dump(mode="json")
        cache.data_quality = response.data_quality
        cache.composite_date_from = response.composite_date_from
        cache.composite_date_to = response.composite_date_to
        cache.pixel_count = response.pixel_count
        cache.gee_execution_ms = gee_execution_ms
        cache.map_tile_url = response.map_tile_url
        cache.refreshed_at = now
        cache.expires_at = now + timedelta(days=self._settings.satellite_cache_ttl_days)

        db.add(cache)
        db.commit()

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

    def _build_composite_window(self) -> tuple[date, date]:
        today = self._utcnow().date()
        return today - timedelta(days=self._settings.satellite_composite_window_days - 1), today

    @staticmethod
    def _utcnow() -> datetime:
        return datetime.now(timezone.utc)


satellite_insights_service = SatelliteInsightsService()
