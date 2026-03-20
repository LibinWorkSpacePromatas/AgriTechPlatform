from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from dataclasses import dataclass
from datetime import date, timedelta
from json import JSONDecodeError
from threading import Lock
from time import perf_counter
from typing import Any

from app.core.config import Settings, get_settings


logger = logging.getLogger(__name__)

DATASET_ID = "COPERNICUS/S2_SR_HARMONIZED"
SPECTRAL_BANDS = ["B2", "B3", "B4", "B5", "B6", "B8"]
MASKED_SCL_CLASSES = (1, 3, 8, 9, 10, 11)


class EarthEngineConfigurationError(RuntimeError):
    pass


class EarthEngineExecutionError(RuntimeError):
    pass


@dataclass(slots=True)
class SatelliteComputation:
    ndvi: float | None
    ndwi: float | None
    evi: float | None
    ndre: float | None
    lai: float | None
    cloud_cover_pct: float | None
    pixel_count: int
    data_quality: str
    composite_date_from: date | None
    composite_date_to: date | None
    map_tile_url: str | None
    image_count: int
    execution_ms: int


class EarthEngineClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._lock = Lock()
        self._initialized = False

        try:
            import ee  # type: ignore
        except ImportError:
            ee = None

        self._ee = ee

    def initialize_if_configured(self) -> bool:
        if not self._settings.has_gee_credentials:
            logger.info("Skipping Earth Engine initialization because credentials are not configured.")
            return False

        self.initialize()
        return True

    def initialize(self) -> None:
        if self._initialized:
            return

        if self._ee is None:
            raise EarthEngineConfigurationError(
                "earthengine-api is not installed. Add it to the backend environment before enabling satellite insights."
            )

        if not self._settings.gee_service_account_json:
            raise EarthEngineConfigurationError("GEE_SERVICE_ACCOUNT_JSON is required for backend Earth Engine access.")

        if not self._settings.gee_project:
            raise EarthEngineConfigurationError("GEE_PROJECT is required for backend Earth Engine access.")

        with self._lock:
            if self._initialized:
                return

            try:
                credentials_payload = json.loads(self._settings.gee_service_account_json)
            except JSONDecodeError as exc:
                raise EarthEngineConfigurationError("GEE_SERVICE_ACCOUNT_JSON must contain valid service account JSON.") from exc

            service_account = self._settings.gee_service_account_email or credentials_payload.get("client_email")

            if not service_account:
                raise EarthEngineConfigurationError(
                    "GEE service account email is missing. Set GEE_SERVICE_ACCOUNT_EMAIL or include client_email in GEE_SERVICE_ACCOUNT_JSON."
                )

            credentials = self._ee.ServiceAccountCredentials(
                service_account,
                key_data=self._settings.gee_service_account_json,
            )
            self._ee.Initialize(credentials=credentials, project=self._settings.gee_project)
            self._initialized = True
            logger.info("Earth Engine initialized for project %s.", self._settings.gee_project)

    def compute_block_insights(
        self,
        geometry_geojson: dict[str, Any],
        *,
        date_from: date,
        date_to: date,
        generate_tile_url: bool | None = None,
    ) -> SatelliteComputation:
        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(
            self._compute_block_insights_impl,
            geometry_geojson,
            date_from=date_from,
            date_to=date_to,
            generate_tile_url=generate_tile_url,
        )
        cancel_futures = False
        try:
            return future.result(timeout=self._settings.satellite_gee_timeout_seconds)
        except FuturesTimeoutError as exc:
            cancel_futures = True
            future.cancel()
            raise EarthEngineExecutionError(
                f"Earth Engine computation timed out after {self._settings.satellite_gee_timeout_seconds} seconds."
            ) from exc
        finally:
            executor.shutdown(wait=False, cancel_futures=cancel_futures)

    def _compute_block_insights_impl(
        self,
        geometry_geojson: dict[str, Any],
        *,
        date_from: date,
        date_to: date,
        generate_tile_url: bool | None = None,
    ) -> SatelliteComputation:
        self.initialize()
        ee = self._ee
        assert ee is not None

        started_at = perf_counter()

        try:
            geometry = ee.Geometry(geometry_geojson)
            collection = (
                ee.ImageCollection(DATASET_ID)
                .filterDate(date_from.isoformat(), (date_to + timedelta(days=1)).isoformat())
                .filterBounds(geometry)
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", self._settings.satellite_cloud_filter_pct))
            )

            # Debugging requested by user
            logger.info("Start Date: %s", date_from)
            logger.info("End Date: %s", date_to)

            image_count = int(collection.size().getInfo())
            logger.info("Image count: %s", image_count)

            cloud_values = collection.aggregate_array("CLOUDY_PIXEL_PERCENTAGE").getInfo()
            logger.info("Cloud values: %s", cloud_values)

            if image_count == 0:
                return SatelliteComputation(
                    ndvi=None,
                    ndwi=None,
                    evi=None,
                    ndre=None,
                    lai=None,
                    cloud_cover_pct=None,
                    pixel_count=0,
                    data_quality="no_data",
                    composite_date_from=date_from,
                    composite_date_to=date_to,
                    map_tile_url=None,
                    image_count=0,
                    execution_ms=int((perf_counter() - started_at) * 1000),
                )

            prepared_collection = collection.map(self._prepare_image)
            composite = prepared_collection.select(SPECTRAL_BANDS).median()
            indices = self._build_indices(composite).clip(geometry)

            summary = self._build_summary(collection, prepared_collection, indices, geometry).getInfo()
            stats = summary.get("stats", {})
            pixel_count = int(stats.get("ndvi_count") or 0)
            cloud_cover_pct = self._maybe_round(summary.get("cloud_cover_pct"), 2)
            data_quality = self._classify_quality(
                pixel_count=pixel_count,
                cloud_cover_pct=cloud_cover_pct,
                image_count=image_count,
            )
            map_tile_url = None

            if generate_tile_url or (generate_tile_url is None and self._settings.satellite_enable_tile_urls):
                # PDF Requirement: NDWI zone map (spatial visualization)
                # min=-0.5, max=0.5, palette=["red", "orange", "yellow", "green"]
                map_tile_url = self._build_ndwi_tile_url(indices.select("ndwi").clip(geometry))

            return SatelliteComputation(
                ndvi=self._maybe_round(stats.get("ndvi_mean")),
                ndwi=self._maybe_round(stats.get("ndwi_mean")),
                evi=self._maybe_round(stats.get("evi_mean")),
                ndre=self._maybe_round(stats.get("ndre_mean")),
                lai=self._maybe_round(stats.get("lai_mean")),
                cloud_cover_pct=cloud_cover_pct,
                pixel_count=pixel_count,
                data_quality="no_data" if pixel_count == 0 else data_quality,
                composite_date_from=date_from,
                composite_date_to=date_to,
                map_tile_url=map_tile_url,
                image_count=image_count,
                execution_ms=int((perf_counter() - started_at) * 1000),
            )
        except EarthEngineConfigurationError:
            raise
        except Exception as exc:
            raise EarthEngineExecutionError(f"Earth Engine computation failed: {exc}") from exc

    def _prepare_image(self, image: Any) -> Any:
        ee = self._ee
        assert ee is not None

        scl = image.select("SCL")
        clear_mask = self._build_clear_mask(scl)
        spectral = image.select(SPECTRAL_BANDS).multiply(0.0001).updateMask(clear_mask)
        cloud_indicator = ee.Image(0).where(clear_mask.Not(), 1).rename("cloud_indicator").updateMask(scl.mask())
        return spectral.addBands(cloud_indicator).copyProperties(image, ["system:time_start", "CLOUDY_PIXEL_PERCENTAGE"])

    def _build_clear_mask(self, scl: Any) -> Any:
        clear_mask = scl.neq(MASKED_SCL_CLASSES[0])
        for class_value in MASKED_SCL_CLASSES[1:]:
            clear_mask = clear_mask.And(scl.neq(class_value))
        return clear_mask

    def _build_indices(self, composite: Any) -> Any:
        """
        Builds the five core indices (NDVI, NDWI, NDRE, EVI, LAI) from the median composite.
        """
        # 1. NDVI (Health): (NIR - Red) / (NIR + Red)
        ndvi = composite.normalizedDifference(["B8", "B4"]).rename("ndvi")

        # 2. NDWI (Water): (Green - NIR) / (Green + NIR)
        ndwi = composite.normalizedDifference(["B3", "B8"]).rename("ndwi")

        # 3. NDRE (Nutrient): (RedEdge2 - Red) / (RedEdge2 + Red)
        # PDF FIX: (B6 - B4) / (B6 + B4)
        ndre = composite.normalizedDifference(["B6", "B4"]).rename("ndre")

        # 4. EVI (Canopy): 2.5 * ((NIR - Red) / (NIR + 6 * Red - 7.5 * Blue + 1))
        evi = (
            composite.expression(
                "2.5 * ((B8 - B4) / (B8 + 6 * B4 - 7.5 * B2 + 1))",
                {
                    "B8": composite.select("B8"),
                    "B4": composite.select("B4"),
                    "B2": composite.select("B2"),
                },
            )
            .rename("evi")
        )

        # 5. LAI (Yield): 3.618 * exp(2.04 * NDVI) - 2
        lai = (
            ndvi.expression("3.618 * exp(2.04 * ndvi) - 2", {"ndvi": ndvi})
            .rename("lai")
        )

        return (
            composite.addBands(ndvi)
            .addBands(ndwi)
            .addBands(ndre)
            .addBands(evi)
            .addBands(lai)
        )

    def _build_summary(self, collection: Any, prepared_collection: Any, indices: Any, geometry: Any) -> Any:
        ee = self._ee
        assert ee is not None

        stats = indices.reduceRegion(
            reducer=ee.Reducer.mean().combine(ee.Reducer.count(), sharedInputs=True),
            geometry=geometry,
            scale=self._settings.satellite_reduction_scale_meters,
            bestEffort=True,
            maxPixels=self._settings.satellite_reduce_max_pixels,
        )
        cloud_cover_stats = prepared_collection.select("cloud_indicator").mean().reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=geometry,
            scale=self._settings.satellite_reduction_scale_meters,
            bestEffort=True,
            maxPixels=self._settings.satellite_reduce_max_pixels,
        )
        cloud_cover_pct = ee.Algorithms.If(
            cloud_cover_stats.contains("cloud_indicator"),
            ee.Number(cloud_cover_stats.get("cloud_indicator")).multiply(100),
            None,
        )

        chronological = collection.sort("system:time_start")
        newest_first = collection.sort("system:time_start", False)
        return ee.Dictionary(
            {
                "stats": stats,
                "cloud_cover_pct": cloud_cover_pct,
                "composite_date_from": ee.Date(chronological.first().get("system:time_start")).format("YYYY-MM-dd"),
                "composite_date_to": ee.Date(newest_first.first().get("system:time_start")).format("YYYY-MM-dd"),
            }
        )

    def _build_ndwi_tile_url(self, ndwi_image: Any) -> str | None:
        """
        Generates an NDWI zone map tile URL according to PDF requirements.
        Palette: red (severe), orange (moderate), yellow (mild), green (optimal)
        """
        try:
            map_id = ndwi_image.getMapId(
                {
                    "min": -0.5,
                    "max": 0.5,
                    "palette": ["red", "orange", "yellow", "green"],
                }
            )
        except Exception as exc:
            logger.warning("Unable to generate NDWI tile URL: %s", exc)
            return None

        tile_fetcher = map_id.get("tile_fetcher")
        return getattr(tile_fetcher, "url_format", None)

    def _build_tile_url(self, ndvi_image: Any) -> str | None:
        try:
            map_id = ndvi_image.getMapId(
                {
                    "min": 0,
                    "max": 1,
                    "palette": [value.strip() for value in self._settings.satellite_tile_palette.split(",") if value.strip()],
                }
            )
        except Exception as exc:
            logger.warning("Unable to generate NDVI tile URL: %s", exc)
            return None

        tile_fetcher = map_id.get("tile_fetcher")
        return getattr(tile_fetcher, "url_format", None)

    def _classify_quality(self, *, pixel_count: int, cloud_cover_pct: float | None, image_count: int) -> str:
        if pixel_count <= 0:
            return "no_data"
        if image_count < 2:
            return "degraded"
        if cloud_cover_pct is not None and cloud_cover_pct >= self._settings.satellite_degraded_cloud_threshold_pct:
            return "degraded"
        return "good"

    @staticmethod
    def _maybe_round(value: Any, digits: int = 4) -> float | None:
        if value is None:
            return None
        return round(float(value), digits)

    @staticmethod
    def _parse_iso_date(value: Any) -> date | None:
        if not value:
            return None
        return date.fromisoformat(str(value))


earth_engine_client = EarthEngineClient()
