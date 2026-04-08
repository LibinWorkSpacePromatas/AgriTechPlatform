from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services import decision_engine


def _base_decision_data() -> dict[str, float | int | str | bool | None]:
    return {
        "block_id": "test-block",
        "soil_moisture": 15.0,
        "ndvi": 0.2,
        "ndwi": -0.42,
        "optimal_moisture_min": 25.0,
        "optimal_moisture_max": 35.0,
        "root_depth_mm": 600.0,
        "mad": 0.5,
        "weather_available": True,
        "rain_24h": 0.0,
        "rain_next_48h": 0.0,
        "temperature_avg": 28.0,
        "area_ha": 2.0,
        "satellite_data_quality": "good",
        "satellite_data_age_days": 4,
        "primary_drainage_class": "MODERATE",
        "soil_subgroup": "A6",
        "primary_soil_classification": "A6",
        "primary_soil_value": 100,
        "secondary_soil_classification": None,
        "secondary_soil_value": None,
        "tertiary_soil_classification": None,
        "tertiary_soil_value": None,
    }


class DecisionEngineTests(unittest.TestCase):
    @patch.object(
        decision_engine,
        "_get_weighted_soil_factor",
        return_value={
            "factor": 1.0,
            "field_capacity": 0.28,
            "wilting_point": 0.13,
            "soil_label": "Test soil",
            "source": "test",
        },
    )
    @patch.object(
        decision_engine,
        "get_settings",
        return_value=SimpleNamespace(decision_weather_rain_forecast_trigger_mm=10.0),
    )
    def test_stale_satellite_data_does_not_override_irrigation(self, _mock_settings, _mock_soil) -> None:
        decision = decision_engine._compute_irrigation_decision(_base_decision_data(), db=None)

        self.assertEqual(decision["irrigation"], "ON")
        self.assertEqual(decision["urgency"], "MEDIUM")
        self.assertEqual(decision["confidence"], 0.7)
        self.assertGreater(decision["water_needed_mm"], 0)
        self.assertGreater(decision["water_needed_liters"], 0)
        self.assertEqual(
            decision["reason"],
            "Severe water stress detected (NDWI), but satellite data is 4 days old",
        )
        self.assertEqual(
            decision["warning"],
            "Satellite data is 4 days old - verify before irrigating",
        )
        self.assertEqual(decision["metadata"]["warning"], decision["warning"])

    @patch.object(
        decision_engine,
        "_get_weighted_soil_factor",
        return_value={
            "factor": 1.0,
            "field_capacity": 0.28,
            "wilting_point": 0.13,
            "soil_label": "Test soil",
            "source": "test",
        },
    )
    @patch.object(
        decision_engine,
        "get_settings",
        return_value=SimpleNamespace(decision_weather_rain_forecast_trigger_mm=10.0),
    )
    def test_forecast_wait_preserves_stale_satellite_warning(self, _mock_settings, _mock_soil) -> None:
        data = _base_decision_data()
        data["rain_next_48h"] = 12.0

        decision = decision_engine._compute_irrigation_decision(data, db=None)

        self.assertEqual(decision["irrigation"], "WAIT")
        self.assertEqual(decision["reason"], "Rain expected in next 48 hours")
        self.assertEqual(
            decision["warning"],
            "Satellite data is 4 days old - verify before irrigating",
        )


if __name__ == "__main__":
    unittest.main()
