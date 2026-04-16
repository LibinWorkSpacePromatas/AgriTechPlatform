from __future__ import annotations

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from app.services.sensor_service import SensorService


class _FakeDb:
    def __init__(self, decision: object | None) -> None:
        self._decision = decision
        self.commit_count = 0
        self.flush_count = 0
        self.added: list[object] = []

    def get(self, _model, _block_id):
        return self._decision

    def add(self, value: object) -> None:
        self.added.append(value)
        self._decision = value

    def flush(self) -> None:
        self.flush_count += 1

    def commit(self) -> None:
        self.commit_count += 1


class SensorServiceDecisionTriggerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = SensorService()

    @patch("app.services.decision_engine.trigger_block_decision")
    @patch("app.services.decision_engine.is_decision_stale", return_value=False)
    def test_sensor_state_update_skips_decision_recompute_when_fresh_and_unchanged(
        self,
        _mock_is_stale,
        mock_trigger,
    ) -> None:
        decision = SimpleNamespace(sensors_ready=False)
        db = _FakeDb(decision)

        self.service._update_sensor_decision_state(db, "block-1", sensor_data_changed=False)

        self.assertTrue(decision.sensors_ready)
        self.assertEqual(db.commit_count, 1)
        mock_trigger.assert_not_called()

    @patch("app.services.decision_engine.trigger_block_decision")
    @patch("app.services.decision_engine.is_decision_stale", return_value=False)
    def test_sensor_state_update_recomputes_when_sensor_data_changed(
        self,
        _mock_is_stale,
        mock_trigger,
    ) -> None:
        decision = SimpleNamespace(sensors_ready=False)
        db = _FakeDb(decision)

        self.service._update_sensor_decision_state(db, "block-1", sensor_data_changed=True)

        self.assertTrue(decision.sensors_ready)
        mock_trigger.assert_called_once_with(db, "block-1")

    @patch("app.services.decision_engine.trigger_block_decision")
    @patch("app.services.decision_engine.is_decision_stale", return_value=True)
    def test_sensor_state_update_recomputes_when_existing_decision_is_stale(
        self,
        _mock_is_stale,
        mock_trigger,
    ) -> None:
        decision = SimpleNamespace(sensors_ready=False)
        db = _FakeDb(decision)

        self.service._update_sensor_decision_state(db, "block-1", sensor_data_changed=False)

        self.assertTrue(decision.sensors_ready)
        mock_trigger.assert_called_once_with(db, "block-1")

    def test_get_block_sensor_dashboard_only_triggers_when_refresh_reports_new_sensor_data(self) -> None:
        block = SimpleNamespace(id="block-1")
        payload = SimpleNamespace(block_id="block-1")

        with patch("app.services.sensor_service.resolve_block", return_value=block), patch.object(
            self.service,
            "_ensure_sensor_state",
            return_value=[],
        ), patch.object(
            self.service,
            "_refresh_live_readings_if_needed",
            return_value=(datetime.now(timezone.utc), False),
        ), patch.object(
            self.service,
            "_update_sensor_decision_state",
        ) as mock_update_decision, patch.object(
            self.service,
            "_build_block_response",
            return_value=payload,
        ):
            db = _FakeDb(SimpleNamespace(sensors_ready=False))

            response = self.service.get_block_sensor_dashboard(db, "block-1")

        self.assertIs(response, payload)
        mock_update_decision.assert_called_once_with(db, "block-1", sensor_data_changed=False)
        self.assertEqual(db.commit_count, 1)


if __name__ == "__main__":
    unittest.main()
