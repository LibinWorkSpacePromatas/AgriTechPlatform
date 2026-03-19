from __future__ import annotations

import unittest
from datetime import date

from app.schemas.satellite import BlockInsightsResponse
from app.services.earth_engine import EarthEngineClient
from app.services.satellite_insights import SatelliteInsightsService


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
        self.assertEqual(response.source, "cache")
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
        self.assertEqual(response.source, "cache")
        self.assertEqual(response.latency_ms, 12)
        self.assertIsNone(response.error)


class EarthEngineQualityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = EarthEngineClient()

    def test_quality_becomes_degraded_for_cloud_heavy_results(self) -> None:
        quality = self.client._classify_quality(
            pixel_count=100,
            cloud_cover_pct=18.0,
            image_count=4,
        )

        self.assertEqual(quality, "degraded")

    def test_quality_becomes_no_data_for_empty_pixels(self) -> None:
        quality = self.client._classify_quality(
            pixel_count=0,
            cloud_cover_pct=None,
            image_count=0,
        )

        self.assertEqual(quality, "no_data")


if __name__ == "__main__":
    unittest.main()
