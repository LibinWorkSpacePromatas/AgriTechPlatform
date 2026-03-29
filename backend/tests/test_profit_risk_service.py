from __future__ import annotations

from pathlib import Path

from app.services.profit_risk import ProfitRiskService, _parse_number


def test_parse_number_handles_ranges_and_embedded_text() -> None:
    assert _parse_number("350-500") == 425.0
    assert _parse_number("500 AUD/tonne (fresh market)") == 500.0
    assert _parse_number("303", average_ranges=False) == 303.0


def test_profit_risk_service_loads_expected_reference_rows() -> None:
    dataset_path = Path(__file__).resolve().parents[1] / "Dataset" / "SA_Farmgate_Prices_Final.xlsx"
    service = ProfitRiskService(dataset_path)

    rows = service.list_rows()

    assert len(rows) == 16
    assert any("Shiraz" in row.variety_type for row in rows)
    assert any("Olive oil" in row.variety_type for row in rows)


def test_profit_risk_service_matches_proxy_row_for_unlisted_white_variety() -> None:
    dataset_path = Path(__file__).resolve().parents[1] / "Dataset" / "SA_Farmgate_Prices_Final.xlsx"
    service = ProfitRiskService(dataset_path)

    payload = service.build_response("Pinot Grigio", 153.0)

    assert payload["current_crop"]["matched_crop"].startswith("Chardonnay")
    assert payload["current_crop"]["match_type"] == "proxy"
    assert payload["water_price"] == 153.0
