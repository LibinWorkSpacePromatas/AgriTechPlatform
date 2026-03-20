from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import routes
from app.core.config import Settings
from app.db.models import Block, SatelliteCache
from app.schemas.opportunities import OpportunitiesResponse
from app.schemas.insights import GrowerGPTResponse, UserGPTInsight, UserGPTResponse, WaterResponse
from app.schemas.satellite import BlockInsightsResponse, SatelliteAlert, SatelliteContractResponse, SatelliteTimeseriesPoint
from app.services.alerts_engine import build_alerts
from app.services.dashboard_insights import build_block_insights
from app.services.earth_engine import (
    DEGRADED_CLOUD_COVER_PCT,
    EVI_EXPRESSION,
    LAI_EXPRESSION,
    NDRE_BANDS,
    NDVI_BANDS,
    NDWI_BANDS,
    SPECTRAL_BANDS,
    EarthEngineExecutionError,
    EarthEngineClient,
)
from app.services.insights import classify_ndwi, generate_insights
from app.services.limitations_engine import build_limitations
from app.services.opportunities import build_opportunities_response
from app.services.interpretation_engine import interpret_metric, interpret_satellite_payload
from app.services.satellite_events import SatelliteEventBroker
from app.services.satellite_insights import SatelliteInsightsService
from app.services.utils import calculate_confidence


class SatelliteResponseContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = SatelliteInsightsService()

    def test_response_metadata_defaults_are_backward_compatible(self) -> None:
        response = BlockInsightsResponse(
            block_id="block-1",
            data_quality="good",
            composite_date_from=date(2026, 3, 15),
            composite_date_to=date(2026, 3, 19),
        )

        self.assertEqual(response.status, "fresh")
        self.assertEqual(response.latency_ms, 0)
        self.assertEqual(response.source, "real")
        self.assertIsNone(response.error)

    def test_updating_placeholder_does_not_infer_failure_message(self) -> None:
        response = self.service._decorate_response(
            BlockInsightsResponse(
                block_id="block-1",
                data_quality="no_data",
                composite_date_from=date(2026, 3, 15),
                composite_date_to=date(2026, 3, 19),
            ),
            status="updating",
            source="cache",
            latency_ms=12,
            infer_error=False,
        )

        self.assertEqual(response.status, "updating")
        self.assertEqual(response.freshness_status, "updating")
        self.assertEqual(response.source, "real")
        self.assertEqual(response.latency_ms, 12)
        self.assertIsNone(response.error)

    def test_base_contract_exposes_required_spec_fields(self) -> None:
        response = SatelliteContractResponse(
            block_id="block-1",
            composite_date_from=date(2026, 3, 15),
            composite_date_to=date(2026, 3, 19),
            last_satellite_update=date(2026, 3, 19),
            ndvi=0.2,
            ndwi=-0.1,
            evi=0.3,
            ndre=0.25,
            lai=2.4,
            cloud_cover_pct=12.5,
            pixel_count=128,
            map_tile_url=None,
            map_tile_type="ndvi",
            data_quality="good",
            acquisition_metadata={"image_count": 1, "actual_dates": [date(2026, 3, 19)]},
            interpretations={
                "ndvi": {"value": 0.2, "status": "Stress detected"},
                "ndwi": {"value": -0.1, "status": "Mild stress"},
                "ndre": {"value": 0.25, "status": "Moderate"},
                "evi": {"value": 0.3, "status": "Moderate"},
                "lai": {"value": 2.4, "status": "Low yield"},
            },
            alerts=[],
            limitations=["Thresholds may vary by crop and region"],
        )

        self.assertEqual(
            set(response.model_dump(mode="python").keys()),
            {
                "block_id",
                "source",
                "freshness_status",
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
                "cache_last_updated_at",
                "cache_expires_at",
                "data_quality",
                "acquisition_metadata",
                "interpretations",
                "alerts",
                "limitations",
            },
        )

    def test_legacy_pipeline_source_values_normalize_to_real(self) -> None:
        cache_payload = BlockInsightsResponse.model_validate(
            {
                "block_id": "block-1",
                "source": "cache",
                "data_quality": "good",
                "composite_date_from": date(2026, 3, 15),
                "composite_date_to": date(2026, 3, 19),
            }
        )
        gee_payload = BlockInsightsResponse.model_validate(
            {
                "block_id": "block-1",
                "source": "gee",
                "data_quality": "good",
                "composite_date_from": date(2026, 3, 15),
                "composite_date_to": date(2026, 3, 19),
            }
        )

        self.assertEqual(cache_payload.source, "real")
        self.assertEqual(gee_payload.source, "real")

    def test_water_and_gpt_schemas_include_shared_satellite_contract(self) -> None:
        water = WaterResponse(
            block_id="block-1",
            composite_date_from=date(2026, 3, 15),
            composite_date_to=date(2026, 3, 19),
            ndvi=0.2,
            ndwi=-0.22,
            evi=0.3,
            ndre=0.25,
            lai=2.4,
            cloud_cover_pct=12.5,
            pixel_count=128,
            map_tile_url=None,
            data_quality="good",
            lanslu="BCPKFB",
            date=date(2026, 3, 19),
            status="Moderate stress",
            recommendation="Irrigation alert triggered.",
            alerts=[],
        )
        gpt = GrowerGPTResponse(
            block_id="block-1",
            composite_date_from=date(2026, 3, 15),
            composite_date_to=date(2026, 3, 19),
            ndvi=0.2,
            ndwi=-0.22,
            evi=0.3,
            ndre=0.25,
            lai=2.4,
            cloud_cover_pct=12.5,
            pixel_count=128,
            map_tile_url=None,
            data_quality="good",
            crop="Shiraz",
            date=date(2026, 3, 19),
            data_age_days=1,
            confidence="high",
            insights=[],
            message="Test message",
        )
        user_gpt = UserGPTResponse(
            user_id="user-1",
            summary="Test summary",
            insights=[
                UserGPTInsight(
                    block_id="block-1",
                    block_name="BCPKFB",
                    crop="Shiraz",
                    insight={
                        "metric": "ndwi",
                        "value": -0.22,
                        "status": "Moderate stress",
                    },
                )
            ],
        )

        self.assertEqual(water.block_id, "block-1")
        self.assertEqual(gpt.block_id, "block-1")
        self.assertEqual(user_gpt.insights[0].insight.metric, "ndwi")
        self.assertEqual(user_gpt.insights[0].insight.status, "Moderate stress")
        self.assertEqual(user_gpt.insights[0].freshness_status, "fresh")

    def test_confidence_drops_when_payload_is_not_fresh(self) -> None:
        response = BlockInsightsResponse(
            block_id="block-1",
            status="stale",
            freshness_status="stale",
            composite_date_from=date(2026, 3, 15),
            composite_date_to=date(2026, 3, 19),
            pixel_count=128,
            data_quality="good",
        )

        self.assertEqual(calculate_confidence(response), "low")

    def test_store_cache_applies_five_day_ttl(self) -> None:
        service = SatelliteInsightsService(settings=Settings(satellite_cache_ttl_days=5))
        fixed_now = datetime(2026, 3, 20, 9, 30, tzinfo=timezone.utc)
        service._utcnow = lambda: fixed_now

        class FakeDB:
            def __init__(self) -> None:
                self.cache = None
                self.records = []
                self.committed = False

            class _Query:
                def filter(self, *_args, **_kwargs):
                    return self

                def first(self):
                    return None

            def query(self, *_args, **_kwargs):
                return self._Query()

            def get(self, model, _key):
                if model is SatelliteCache:
                    return self.cache
                return None

            def add(self, value) -> None:
                if isinstance(value, SatelliteCache):
                    self.cache = value
                    return
                self.records.append(value)

            def commit(self) -> None:
                self.committed = True

        fake_db = FakeDB()
        response = BlockInsightsResponse(
            block_id="block-1",
            composite_date_from=date(2026, 3, 15),
            composite_date_to=date(2026, 3, 19),
            ndvi=0.2,
            ndwi=-0.2,
            evi=0.3,
            ndre=0.25,
            lai=2.4,
            cloud_cover_pct=12.5,
            pixel_count=128,
            map_tile_url=None,
            data_quality="good",
        )

        cache_last_updated_at, cache_expires_at = service._store_cache(
            fake_db,
            "block-1",
            "geometry-hash",
            response,
            gee_execution_ms=42,
        )

        self.assertEqual(cache_last_updated_at, fixed_now)
        self.assertEqual(cache_expires_at, fixed_now + timedelta(days=5))
        self.assertEqual(fake_db.cache.expires_at, fixed_now + timedelta(days=5))
        self.assertTrue(fake_db.committed)

    def test_contract_rejects_out_of_range_ratio_indices(self) -> None:
        with self.assertRaisesRegex(ValidationError, "ndvi must be between -1 and 1"):
            SatelliteContractResponse(
                block_id="block-1",
                composite_date_from=date(2026, 3, 15),
                composite_date_to=date(2026, 3, 19),
                ndvi=1.01,
                data_quality="good",
            )

    def test_contract_rejects_invalid_cloud_cover_and_negative_pixels(self) -> None:
        with self.assertRaisesRegex(ValidationError, "cloud_cover_pct must be between 0 and 100"):
            SatelliteContractResponse(
                block_id="block-1",
                composite_date_from=date(2026, 3, 15),
                composite_date_to=date(2026, 3, 19),
                cloud_cover_pct=101,
                data_quality="good",
            )

        with self.assertRaisesRegex(ValidationError, "pixel_count must be non-negative"):
            SatelliteContractResponse(
                block_id="block-1",
                composite_date_from=date(2026, 3, 15),
                composite_date_to=date(2026, 3, 19),
                pixel_count=-1,
                data_quality="good",
            )

    def test_contract_rejects_inverted_composite_window(self) -> None:
        with self.assertRaisesRegex(ValidationError, "composite_date_from cannot be after composite_date_to"):
            SatelliteContractResponse(
                block_id="block-1",
                composite_date_from=date(2026, 3, 20),
                composite_date_to=date(2026, 3, 19),
                data_quality="good",
            )

    def test_api_schemas_reject_invalid_nested_alerts(self) -> None:
        with self.assertRaisesRegex(ValidationError, "threshold cannot be blank"):
            WaterResponse(
                block_id="block-1",
                composite_date_from=date(2026, 3, 15),
                composite_date_to=date(2026, 3, 19),
                data_quality="good",
                lanslu="BCPKFB",
                status="no_data",
                recommendation="Waiting for refresh.",
                alerts=[
                    {
                        "metric": "ndwi",
                        "code": "irrigation_alert",
                        "severity": "warning",
                        "message": "Irrigation alert triggered.",
                        "value": -0.22,
                        "threshold": " ",
                    }
                ],
            )

        with self.assertRaisesRegex(ValidationError, "ndwi must be between -1 and 1"):
            GrowerGPTResponse(
                block_id="block-1",
                composite_date_from=date(2026, 3, 15),
                composite_date_to=date(2026, 3, 19),
                ndwi=-1.2,
                data_quality="good",
            )

    def test_timeseries_schema_rejects_out_of_range_indices(self) -> None:
        with self.assertRaisesRegex(ValidationError, "ndvi must be between -1 and 1"):
            SatelliteTimeseriesPoint(
                date=datetime(2026, 3, 19, 12, 0, tzinfo=timezone.utc),
                ndvi=1.4,
                ndwi=0.2,
            )


class SatelliteAlertValidationTests(unittest.TestCase):
    def test_alert_rejects_blank_message(self) -> None:
        with self.assertRaisesRegex(ValidationError, "message cannot be blank"):
            SatelliteAlert(
                metric="ndwi",
                code="irrigation_alert",
                severity="warning",
                message=" ",
                value=-0.2,
                threshold="NDWI < -0.15",
            )

    def test_alert_rejects_out_of_range_ratio_value(self) -> None:
        with self.assertRaisesRegex(ValidationError, "ndwi must be between -1 and 1"):
            SatelliteAlert(
                metric="ndwi",
                code="irrigation_alert",
                severity="warning",
                message="Irrigation alert triggered.",
                value=-1.2,
                threshold="NDWI < -0.15",
            )

    def test_alert_rejects_negative_lai_value(self) -> None:
        with self.assertRaisesRegex(ValidationError, "lai must be non-negative"):
            SatelliteAlert(
                metric="lai",
                code="low_yield",
                severity="warning",
                message="Low yield warning triggered.",
                value=-0.2,
                threshold="LAI < 2",
            )


class SatelliteEndpointSnapshotTests(unittest.TestCase):
    def test_block_insights_endpoint_snapshot_matches_expected_schema(self) -> None:
        app = FastAPI()
        app.include_router(routes.router)

        snapshot_payload = BlockInsightsResponse(
            block_id="block-1",
            source="real",
            freshness_status="fresh",
            status="fresh",
            latency_ms=87,
            error=None,
            composite_date_from=date(2026, 3, 15),
            composite_date_to=date(2026, 3, 19),
            last_satellite_update=date(2026, 3, 19),
            ndvi=0.62,
            ndwi=-0.18,
            evi=0.44,
            ndre=0.28,
            lai=3.2,
            cloud_cover_pct=8.5,
            pixel_count=128,
            map_tile_url="https://tiles.example/ndvi/{z}/{x}/{y}.png",
            map_tile_type="ndvi",
            data_quality="good",
            acquisition_metadata={
                "image_count": 2,
                "actual_dates": [date(2026, 3, 15), date(2026, 3, 19)],
            },
            interpretations={
                "ndvi": {"value": 0.62, "status": "Dense healthy canopy"},
                "ndwi": {"value": -0.18, "status": "Moderate stress"},
                "ndre": {"value": 0.28, "status": "Moderate"},
                "evi": {"value": 0.44, "status": "Healthy"},
                "lai": {"value": 3.2, "status": "Good yield"},
            },
            alerts=[
                {
                    "metric": "ndwi",
                    "code": "irrigation_alert",
                    "severity": "warning",
                    "message": "Irrigation alert triggered.",
                    "value": -0.18,
                    "threshold": "NDWI < -0.15",
                }
            ],
            limitations=[
                "LAI is an estimated value, not direct measurement",
                "Thresholds may vary by crop and region",
            ],
        )

        with patch("app.api.routes.satellite_access_service.get_block_insights", return_value=snapshot_payload):
            client = TestClient(app)
            response = client.get("/api/block/block-1/insights")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "block_id": "block-1",
                "source": "real",
                "freshness_status": "fresh",
                "composite_date_from": "2026-03-15",
                "composite_date_to": "2026-03-19",
                "last_satellite_update": "2026-03-19",
                "ndvi": 0.62,
                "ndwi": -0.18,
                "evi": 0.44,
                "ndre": 0.28,
                "lai": 3.2,
                "cloud_cover_pct": 8.5,
                "pixel_count": 128,
                "map_tile_url": "https://tiles.example/ndvi/{z}/{x}/{y}.png",
                "map_tile_type": "ndvi",
                "cache_last_updated_at": None,
                "cache_expires_at": None,
                "data_quality": "good",
                "acquisition_metadata": {
                    "image_count": 2,
                    "actual_dates": ["2026-03-15", "2026-03-19"],
                },
                "interpretations": {
                    "ndvi": {"value": 0.62, "status": "Dense healthy canopy"},
                    "ndwi": {"value": -0.18, "status": "Moderate stress"},
                    "ndre": {"value": 0.28, "status": "Moderate"},
                    "evi": {"value": 0.44, "status": "Healthy"},
                    "lai": {"value": 3.2, "status": "Good yield"},
                },
                "alerts": [
                    {
                        "metric": "ndwi",
                        "code": "irrigation_alert",
                        "severity": "warning",
                        "message": "Irrigation alert triggered.",
                        "value": -0.18,
                        "threshold": "NDWI < -0.15",
                    }
                ],
                "limitations": [
                    "LAI is an estimated value, not direct measurement",
                    "Thresholds may vary by crop and region",
                ],
                "status": "fresh",
                "latency_ms": 87,
                "error": None,
            },
        )


class AlertAndLimitationEngineTests(unittest.TestCase):
    def test_alert_engine_thresholds_match_spec_exactly(self) -> None:
        alerts = build_alerts(
            {
                "ndvi": 0.34,
                "ndwi": -0.2,
                "ndre": 0.24,
                "evi": 0.51,
                "lai": 1.9,
            }
        )

        self.assertEqual(
            [(alert.metric, alert.code, alert.threshold) for alert in alerts],
            [
                ("ndvi", "health_warning", "NDVI < 0.35"),
                ("ndwi", "irrigation_alert", "NDWI < -0.15"),
                ("ndre", "nutrient_issue", "NDRE < 0.25"),
                ("evi", "canopy_alert", "EVI > 0.50"),
                ("lai", "low_yield", "LAI < 2"),
            ],
        )

    def test_limitation_engine_returns_all_expected_warnings(self) -> None:
        limitations = build_limitations(
            cloud_cover_pct=55,
            data_quality="degraded",
            composite_date_to=date(2026, 3, 15),
            block_area_ha=0.3,
            ndvi=0.85,
            lai=2.5,
            today=date(2026, 3, 20),
            settings=Settings(
                satellite_degraded_cloud_threshold_pct=50,
                satellite_pixel_mixing_block_area_threshold_ha=0.5,
            ),
        )

        self.assertEqual(
            limitations,
            [
                "Cloud-heavy imagery reduced the reliability of this composite.",
                "Satellite data is not real-time (5-day revisit cycle)",
                "Small block size may reduce satellite accuracy",
                "NDVI saturation — use EVI for accuracy",
                "LAI is an estimated value, not direct measurement",
                "Thresholds may vary by crop and region",
            ],
        )


class SatelliteRefreshEventBrokerTests(unittest.TestCase):
    def test_publish_persists_refresh_event_record(self) -> None:
        persisted_records: list[object] = []

        class FakeQuery:
            def filter(self, *_args, **_kwargs):
                return self

            def delete(self, **_kwargs):
                return 0

        class FakeSession:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def add(self, value):
                persisted_records.append(value)

            def query(self, *_args, **_kwargs):
                return FakeQuery()

            def commit(self):
                return None

        broker = SatelliteEventBroker()

        with patch("app.services.satellite_events.SessionLocal", return_value=FakeSession()):
            broker.publish(
                block_id="block-1",
                event="completed",
                reason="refresh_completed",
                data_quality="good",
                latency_ms=120,
            )

        self.assertEqual(len(persisted_records), 1)
        self.assertEqual(persisted_records[0].block_id, "block-1")
        self.assertEqual(persisted_records[0].event, "completed")
        self.assertEqual(persisted_records[0].reason, "refresh_completed")
        self.assertEqual(persisted_records[0].data_quality, "good")
        self.assertEqual(persisted_records[0].latency_ms, 120)

    def test_list_events_maps_database_records(self) -> None:
        created_at_value = datetime(2026, 3, 20, 9, 30, tzinfo=timezone.utc)

        class FakeRecord:
            id = 7
            block_id = "block-1"
            event = "failed"
            reason = "refresh_failed"
            data_quality = None
            error = "boom"
            latency_ms = None
            created_at = created_at_value

        class FakeQuery:
            def filter(self, *_args, **_kwargs):
                return self

            def order_by(self, *_args, **_kwargs):
                return self

            def limit(self, *_args, **_kwargs):
                return self

            def all(self):
                return [FakeRecord()]

        class FakeSession:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def query(self, *_args, **_kwargs):
                return FakeQuery()

        broker = SatelliteEventBroker()

        with patch("app.services.satellite_events.SessionLocal", return_value=FakeSession()):
            refresh_events = broker.list_events(block_id="block-1")

        self.assertEqual(len(refresh_events), 1)
        self.assertEqual(refresh_events[0].id, 7)
        self.assertEqual(refresh_events[0].block_id, "block-1")
        self.assertEqual(refresh_events[0].event, "failed")
        self.assertEqual(refresh_events[0].reason, "refresh_failed")
        self.assertEqual(refresh_events[0].error, "boom")


class EarthEngineQualityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = EarthEngineClient()

    def test_quality_becomes_degraded_only_when_cloud_cover_exceeds_spec_threshold(self) -> None:
        quality = self.client._classify_quality(
            pixel_count=100,
            cloud_cover_pct=DEGRADED_CLOUD_COVER_PCT + 0.1,
            image_count=1,
        )

        self.assertEqual(quality, "degraded")

    def test_quality_stays_good_at_exact_cloud_threshold(self) -> None:
        quality = self.client._classify_quality(
            pixel_count=100,
            cloud_cover_pct=DEGRADED_CLOUD_COVER_PCT,
            image_count=1,
        )

        self.assertEqual(quality, "good")

    def test_quality_becomes_no_data_for_empty_pixels(self) -> None:
        quality = self.client._classify_quality(
            pixel_count=0,
            cloud_cover_pct=None,
            image_count=0,
        )

        self.assertEqual(quality, "no_data")


class EarthEngineFormulaContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = EarthEngineClient()

    def test_spectral_bands_include_spec_required_inputs(self) -> None:
        self.assertEqual(SPECTRAL_BANDS, ["B2", "B3", "B4", "B6", "B8", "B11"])

    def test_band_mappings_match_spec(self) -> None:
        self.assertEqual(NDVI_BANDS, ("B8", "B4"))
        self.assertEqual(NDWI_BANDS, ("B3", "B8"))
        self.assertEqual(NDRE_BANDS, ("B6", "B4"))

    def test_formula_expressions_match_spec(self) -> None:
        self.assertEqual(EVI_EXPRESSION, "2.5 * ((nir - red) / (nir + 6 * red - 7.5 * blue + 1))")
        self.assertEqual(LAI_EXPRESSION, "3.618 * exp(2.04 * ndvi) - 2")

    def test_ratio_index_range_validation_accepts_in_range_values(self) -> None:
        self.assertEqual(self.client._validate_ratio_index(-1.0, index_name="ndvi"), -1.0)
        self.assertEqual(self.client._validate_ratio_index(0.25, index_name="ndwi"), 0.25)
        self.assertEqual(self.client._validate_ratio_index(1.0, index_name="ndre"), 1.0)

    def test_ratio_index_range_validation_rejects_out_of_range_values(self) -> None:
        with self.assertRaisesRegex(EarthEngineExecutionError, "NDVI mean 1.0001 fell outside the expected \\[-1, 1\\] range."):
            self.client._validate_ratio_index(1.0001, index_name="ndvi")


class InterpretationEngineTests(unittest.TestCase):
    def test_null_payload_returns_no_data_statuses_without_alerts(self) -> None:
        interpretation = interpret_satellite_payload(
            {
                "ndvi": None,
                "ndwi": "",
                "ndre": None,
                "evi": None,
                "lai": None,
            }
        )

        self.assertEqual(interpretation["alerts"], [])
        self.assertEqual(interpretation["ndvi_status"], "no_data")
        self.assertEqual(interpretation["ndwi_status"], "no_data")
        self.assertEqual(interpretation["ndre_status"], "no_data")
        self.assertEqual(interpretation["evi_status"], "no_data")
        self.assertEqual(interpretation["lai_status"], "no_data")

    def test_ndvi_warning_threshold_matches_spec(self) -> None:
        self.assertEqual(interpret_metric("ndvi", 0.3499)["code"], "health_warning")
        self.assertEqual(interpret_metric("ndvi", 0.35)["code"], "warning")
        self.assertEqual(interpret_metric("ndvi", 0.4)["code"], "normal")

    def test_ndwi_thresholds_match_spec(self) -> None:
        self.assertEqual(interpret_metric("ndwi", -0.1501)["code"], "irrigation_alert")
        self.assertEqual(interpret_metric("ndwi", -0.3001)["code"], "urgent_irrigation")
        self.assertEqual(interpret_metric("ndwi", -0.15)["code"], "irrigation_alert")

    def test_ndre_threshold_matches_spec(self) -> None:
        self.assertEqual(interpret_metric("ndre", 0.2499)["code"], "nutrient_issue")
        self.assertEqual(interpret_metric("ndre", 0.25)["code"], "normal")

    def test_evi_threshold_matches_spec(self) -> None:
        self.assertEqual(interpret_metric("evi", 0.5001)["code"], "canopy_alert")
        self.assertEqual(interpret_metric("evi", 0.5)["code"], "normal")

    def test_lai_thresholds_match_spec(self) -> None:
        self.assertEqual(interpret_metric("lai", 5.0001)["code"], "high_yield")
        self.assertEqual(interpret_metric("lai", 1.9999)["code"], "low_yield")
        self.assertEqual(interpret_metric("lai", 3.5)["code"], "normal")

    def test_payload_interpretation_returns_canonical_statuses_and_alerts(self) -> None:
        interpretation = interpret_satellite_payload(
            {
                "ndvi": 0.2,
                "ndwi": -0.31,
                "ndre": 0.2,
                "evi": 0.6,
                "lai": 1.8,
            }
        )

        self.assertEqual(interpretation["ndvi_status"], "health_warning")
        self.assertEqual(interpretation["ndwi_status"], "urgent_irrigation")
        self.assertEqual(interpretation["ndre_status"], "nutrient_issue")
        self.assertEqual(interpretation["evi_status"], "canopy_alert")
        self.assertEqual(interpretation["lai_status"], "low_yield")
        self.assertEqual(len(interpretation["alerts"]), 5)

    def test_alert_payload_contains_expected_threshold_and_rounded_value(self) -> None:
        detail = interpret_metric("ndwi", -0.20009)

        self.assertEqual(detail["alert"]["threshold"], "NDWI < -0.15")
        self.assertEqual(detail["alert"]["severity"], "warning")
        self.assertEqual(detail["alert"]["value"], -0.2001)

    def test_interpret_metric_rejects_out_of_range_values(self) -> None:
        with self.assertRaisesRegex(ValueError, "NDVI must be between -1 and 1"):
            interpret_metric("ndvi", 1.2)

        with self.assertRaisesRegex(ValueError, "LAI must be non-negative"):
            interpret_metric("lai", -0.1)

    def test_insights_wrappers_delegate_to_canonical_engine(self) -> None:
        status, recommendation = classify_ndwi(-0.2)
        self.assertEqual(status, "irrigation_alert")
        self.assertEqual(recommendation, "Irrigation alert triggered.")

        alerts = generate_insights({"ndwi": -0.31, "ndvi": 0.2})
        self.assertEqual([alert["code"] for alert in alerts], ["health_warning", "urgent_irrigation"])

    def test_generate_insights_raises_for_invalid_metric_ranges(self) -> None:
        with self.assertRaisesRegex(ValidationError, "ndwi must be between -1 and 1"):
            generate_insights({"ndwi": -1.5, "ndvi": 0.2})


class DashboardInsightAlignmentTests(unittest.TestCase):
    def _build_block(self) -> Block:
        return Block(
            id=UUID("22222222-2222-2222-2222-222222222222"),
            user_id=UUID("11111111-1111-1111-1111-111111111111"),
            lanslu="BCPKFB",
            soil_subgroup="Loam",
            soil_class="Alluvial",
            description="Test vineyard block",
            area_ha=6.5,
            crop="Shiraz",
        )

    def test_dashboard_metric_titles_match_frontend_labels(self) -> None:
        payload = build_block_insights(
            self._build_block(),
            overrides={
                "ndvi": 0.1116,
                "ndwi": -0.2296,
                "ndre": 0.0019,
                "evi": 0.0827,
                "lai": 2.5468,
            },
        )

        self.assertEqual(payload["metrics"]["ndvi"]["title"], "Vegetation Health")
        self.assertEqual(payload["metrics"]["ndwi"]["title"], "Water Stress")
        self.assertEqual(payload["metrics"]["ndre"]["title"], "Nutrient Status")
        self.assertEqual(payload["metrics"]["evi"]["title"], "Canopy Density")
        self.assertEqual(payload["metrics"]["lai"]["title"], "Yield Potential")
        self.assertEqual(payload["advisor"]["sensorAnalysis"][0]["label"], "Primary Signal - NDVI")
        self.assertEqual(payload["advisor"]["sensorAnalysis"][4]["label"], "Secondary Insight - LAI")

    def test_dashboard_requires_cache_backed_metrics(self) -> None:
        with self.assertRaisesRegex(ValueError, "cache-backed satellite metrics"):
            build_block_insights(self._build_block())

    def test_dashboard_uses_empty_placeholder_product_sections_in_strict_mode(self) -> None:
        payload = build_block_insights(
            self._build_block(),
            overrides={
                "ndvi": 0.6,
                "ndwi": 0.02,
                "ndre": 0.3,
                "evi": 0.62,
                "lai": 3.4,
            },
        )

        self.assertEqual(payload["advisor"]["riskScore"], None)
        self.assertEqual(payload["yieldImpact"]["factors"], [])
        self.assertEqual(payload["alternativeCrops"], [])
        self.assertEqual(
            payload["decision"]["switch"]["validationText"],
            "Strict Sentinel-2 mode does not generate crop switching advice.",
        )


class SatelliteBackfillScheduleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = SatelliteInsightsService()

    def test_backfill_schedule_creates_weekly_historical_windows(self) -> None:
        schedule = self.service._build_backfill_schedule(
            today=date(2026, 3, 19),
            history_days=21,
            step_days=7,
        )

        self.assertEqual(
            schedule,
            [
                date(2026, 2, 26),
                date(2026, 3, 5),
                date(2026, 3, 12),
            ],
        )

    def test_backfill_schedule_returns_empty_when_range_is_too_short(self) -> None:
        schedule = self.service._build_backfill_schedule(
            today=date(2026, 3, 19),
            history_days=3,
            step_days=7,
        )

        self.assertEqual(schedule, [])


class OpportunitiesIntegrationTests(unittest.TestCase):
    def _build_block(self) -> Block:
        return Block(
            id=UUID("22222222-2222-2222-2222-222222222222"),
            user_id=UUID("11111111-1111-1111-1111-111111111111"),
            lanslu="BCPKFB",
            soil_subgroup="Loam",
            soil_class="Alluvial",
            description="Test vineyard block",
            area_ha=6.5,
            crop="Shiraz",
        )

    def test_opportunities_response_is_driven_by_ndre_and_evi(self) -> None:
        satellite_response = BlockInsightsResponse(
            block_id="block-1",
            source="real",
            composite_date_from=date(2026, 3, 15),
            composite_date_to=date(2026, 3, 19),
            ndvi=0.2,
            ndwi=-0.2,
            ndre=0.2,
            evi=0.62,
            lai=2.4,
            cloud_cover_pct=12.5,
            pixel_count=128,
            map_tile_url=None,
            data_quality="good",
            interpretations={
                "ndvi": {"value": 0.2, "status": "Stress detected"},
                "ndwi": {"value": -0.2, "status": "Moderate stress"},
                "ndre": {"value": 0.2, "status": "Low"},
                "evi": {"value": 0.62, "status": "Dense canopy"},
                "lai": {"value": 2.4, "status": "Low yield"},
            },
            alerts=interpret_satellite_payload({"ndvi": 0.2, "ndwi": -0.2, "ndre": 0.2, "evi": 0.62, "lai": 2.4})["alerts"],
        )

        response = build_opportunities_response(self._build_block(), satellite_response)

        self.assertIsInstance(response, OpportunitiesResponse)
        self.assertEqual(response.ndre_status, "Low")
        self.assertEqual(response.evi_status, "Dense canopy")
        self.assertEqual(response.opportunities[0].driver_indices, ["ndre", "evi"])
        self.assertIn("Nutrient Recovery Opportunity", [item.title for item in response.opportunities])
        self.assertIn("Canopy Reset Opportunity", [item.title for item in response.opportunities])

    def test_opportunities_empty_state_when_ndre_and_evi_are_missing(self) -> None:
        satellite_response = BlockInsightsResponse(
            block_id="block-1",
            source="real",
            composite_date_from=date(2026, 3, 15),
            composite_date_to=date(2026, 3, 19),
            ndvi=None,
            ndwi=None,
            ndre=None,
            evi=None,
            lai=None,
            cloud_cover_pct=None,
            pixel_count=0,
            map_tile_url=None,
            data_quality="no_data",
        )

        response = build_opportunities_response(self._build_block(), satellite_response)

        self.assertEqual(response.opportunities, [])
        self.assertIn("NDRE and EVI data", response.warning or "")


if __name__ == "__main__":
    unittest.main()
