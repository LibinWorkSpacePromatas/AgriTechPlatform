from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from app.core.config import get_settings


WATER_SCENARIOS = {
    "low": 80.0,
    "current": 153.0,
    "high": 420.0,
}

XLSX_NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

RED_WINE_KEYWORDS = {"shiraz", "cabernet", "merlot", "grenache"}
WHITE_WINE_KEYWORDS = {"chardonnay", "pinot grigio", "riesling", "semillon", "colombard", "white"}


@dataclass(frozen=True)
class CropReferenceRow:
    commodity: str
    variety_type: str
    farmgate_price_low: float
    farmgate_price_mid: float
    farmgate_price_high: float
    price_trend: str
    cost_of_production_per_unit: float
    profitable_above: float
    yield_t_ha_typical: float
    water_req_ml_ha_min: float
    water_req_ml_ha_max: float

    @property
    def water_req_ml_ha_avg(self) -> float:
        return round((self.water_req_ml_ha_min + self.water_req_ml_ha_max) / 2.0, 3)


def _normalize(text: str) -> str:
    lowered = text.strip().lower()
    lowered = lowered.replace("—", " ").replace("–", " ")
    lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def _extract_numbers(raw: str) -> list[float]:
    matches = re.findall(r"\d+(?:\.\d+)?", raw.replace(",", ""))
    return [float(match) for match in matches]


def _parse_number(raw: Any, *, average_ranges: bool = True) -> float:
    if raw is None:
        return 0.0
    if isinstance(raw, (int, float)):
        return float(raw)

    text = str(raw).strip()
    if not text:
        return 0.0

    numbers = _extract_numbers(text)
    if not numbers:
        return 0.0

    if len(numbers) >= 2 and average_ranges:
        return round(sum(numbers) / len(numbers), 3)
    return float(numbers[0])


def _read_xlsx_rows(path: Path) -> list[dict[str, str]]:
    with ZipFile(path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in shared_root.findall("a:si", XLSX_NS):
                shared_strings.append("".join(node.text or "" for node in item.findall(".//a:t", XLSX_NS)))

        workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
        rel_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rel_root}
        first_sheet = workbook_root.find("a:sheets", XLSX_NS)[0]
        relation_id = first_sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        target = rel_map[relation_id]
        if not target.startswith("xl/"):
            target = f"xl/{target}"

        sheet_root = ET.fromstring(archive.read(target))
        rows = sheet_root.findall(".//a:sheetData/a:row", XLSX_NS)
        header: list[str] = []
        parsed_rows: list[dict[str, str]] = []

        for row_index, row in enumerate(rows):
            values: list[str] = []
            for cell in row.findall("a:c", XLSX_NS):
                cell_type = cell.attrib.get("t")
                value_node = cell.find("a:v", XLSX_NS)
                if value_node is None:
                    values.append("")
                elif cell_type == "s":
                    values.append(shared_strings[int(value_node.text)])
                else:
                    values.append(value_node.text or "")

            if row_index == 0:
                header = values
                continue

            if any(str(value).strip() for value in values):
                parsed_rows.append(dict(zip(header, values)))

    return parsed_rows


class ProfitRiskService:
    def __init__(self, dataset_path: str | Path | None = None) -> None:
        settings = get_settings()
        self.dataset_path = Path(dataset_path or settings.profit_risk_dataset_path)
        self._rows: list[CropReferenceRow] = []
        self._loaded_at: datetime | None = None

    def initialize(self) -> None:
        self._rows = self._load_rows()
        self._loaded_at = datetime.now(timezone.utc)

    @property
    def loaded_at(self) -> datetime:
        if self._loaded_at is None:
            self.initialize()
        return self._loaded_at or datetime.now(timezone.utc)

    def list_rows(self) -> list[CropReferenceRow]:
        if not self._rows:
            self.initialize()
        return self._rows

    def calculate_margin(self, row: CropReferenceRow, water_price: float) -> float:
        revenue, production_cost = self._revenue_and_cost_per_ha(row)
        water_cost = row.water_req_ml_ha_avg * water_price
        return round(revenue - production_cost - water_cost, 2)

    def _revenue_and_cost_per_ha(self, row: CropReferenceRow) -> tuple[float, float]:
        # The PDF explicitly calls out olives EVOO as a special case:
        # revenue = $/litre * 7,000 litres/ha instead of the generic price * yield row formula.
        if "olive oil" in _normalize(row.variety_type):
            litres_per_ha = 7000.0
            revenue = row.farmgate_price_mid * litres_per_ha
            production_cost = row.cost_of_production_per_unit * litres_per_ha
            return revenue, production_cost

        revenue = row.farmgate_price_mid * row.yield_t_ha_typical
        production_cost = row.cost_of_production_per_unit * row.yield_t_ha_typical
        return revenue, production_cost

    def scenario_margins(self, row: CropReferenceRow) -> dict[str, float]:
        return {
            scenario: self.calculate_margin(row, price)
            for scenario, price in WATER_SCENARIOS.items()
        }

    def build_response(self, block_crop: str, water_price: float) -> dict[str, Any]:
        rows = self.list_rows()
        current_row, match_type, note = self._match_row(block_crop, rows)

        margins = []
        best_row: CropReferenceRow | None = None
        best_margin: float | None = None

        for row in rows:
            row_margin = self.calculate_margin(row, water_price)
            row_scenarios = self.scenario_margins(row)
            row_scenarios["selected"] = row_margin
            margins.append(
                {
                    "crop": row.variety_type,
                    "commodity": row.commodity,
                    "current_price": row.farmgate_price_mid,
                    "break_even_price": row.profitable_above,
                    "price_trend": row.price_trend,
                    "yield_t_ha": row.yield_t_ha_typical,
                    "water_req_ml_ha": row.water_req_ml_ha_avg,
                    "cost_per_unit": row.cost_of_production_per_unit,
                    "margins": row_scenarios,
                    "_current_margin": row_margin,
                }
            )
            if best_margin is None or row_margin > best_margin:
                best_row = row
                best_margin = row_margin

        current_margin = self.calculate_margin(current_row, water_price)
        risk_level = "High" if (current_margin < 0 or current_row.farmgate_price_mid < current_row.profitable_above) else "Low"

        return {
            "block_crop": block_crop,
            "water_price": round(water_price, 2),
            "net_margin": current_margin,
            "risk_level": risk_level,
            "best_crop": best_row.variety_type if best_row else current_row.variety_type,
            "best_crop_margin": round(best_margin or current_margin, 2),
            "updated_at": self.loaded_at.replace(microsecond=0).isoformat(),
            "current_crop": {
                "requested_crop": block_crop,
                "matched_crop": current_row.variety_type,
                "commodity": current_row.commodity,
                "match_type": match_type,
                "note": note,
                "current_price": current_row.farmgate_price_mid,
                "break_even_price": current_row.profitable_above,
                "price_trend": current_row.price_trend,
                "yield_t_ha": current_row.yield_t_ha_typical,
                "water_req_ml_ha": current_row.water_req_ml_ha_avg,
                "net_margin": current_margin,
            },
            "margins": [
                {key: value for key, value in row.items() if key != "_current_margin"}
                for row in sorted(margins, key=lambda item: item["_current_margin"], reverse=True)
            ],
        }

    def _load_rows(self) -> list[CropReferenceRow]:
        if not self.dataset_path.exists():
            raise FileNotFoundError(f"Profit & Risk dataset was not found at {self.dataset_path}")

        rows = []
        for raw in _read_xlsx_rows(self.dataset_path):
            rows.append(
                CropReferenceRow(
                    commodity=str(raw.get("commodity", "")).strip(),
                    variety_type=str(raw.get("variety_type", "")).strip(),
                    farmgate_price_low=_parse_number(raw.get("farmgate_price_low"), average_ranges=False),
                    farmgate_price_mid=_parse_number(raw.get("farmgate_price_mid"), average_ranges=False),
                    farmgate_price_high=_parse_number(raw.get("farmgate_price_high"), average_ranges=False),
                    price_trend=str(raw.get("price_trend", "")).strip(),
                    cost_of_production_per_unit=_parse_number(raw.get("cost_of_production_per_unit")),
                    profitable_above=_parse_number(raw.get("profitable_above")),
                    yield_t_ha_typical=_parse_number(raw.get("yield_t_ha_typical"), average_ranges=False),
                    water_req_ml_ha_min=_parse_number(raw.get("water_req_ml_ha_min"), average_ranges=False),
                    water_req_ml_ha_max=_parse_number(raw.get("water_req_ml_ha_max"), average_ranges=False),
                )
            )
        return rows

    def _match_row(
        self,
        block_crop: str,
        rows: list[CropReferenceRow],
    ) -> tuple[CropReferenceRow, str, str | None]:
        normalized_crop = _normalize(block_crop)

        for row in rows:
            normalized_variety = _normalize(row.variety_type)
            if normalized_crop and (normalized_crop in normalized_variety or normalized_variety in normalized_crop):
                return row, "exact", None

        if normalized_crop in {"navel oranges", "oranges"}:
            return self._find_variety(rows, "Navel Oranges"), "proxy", "Matched to the closest citrus row in the workbook."

        if any(keyword in normalized_crop for keyword in RED_WINE_KEYWORDS):
            if "cabernet" in normalized_crop:
                return self._find_variety(rows, "Cabernet Sauvignon"), "proxy", "Used the inland red Cabernet benchmark because the workbook does not contain an exact row for this block variety."
            return self._find_variety(rows, "Shiraz"), "proxy", "Used the inland red wine-grape benchmark because the workbook does not contain an exact row for this block variety."

        if any(keyword in normalized_crop for keyword in WHITE_WINE_KEYWORDS):
            if "colombard" in normalized_crop:
                return self._find_variety(rows, "Colombard"), "proxy", "Matched to the closest white wine-grape row in the workbook."
            return self._find_variety(rows, "Chardonnay"), "proxy", "Used the inland white wine-grape benchmark because the workbook does not contain an exact row for this block variety."

        for row in rows:
            if normalized_crop and normalized_crop in _normalize(row.commodity):
                return row, "commodity", "Matched by commodity because the workbook does not contain an exact variety row."

        return rows[0], "fallback", "No direct crop match was found, so the first workbook row was used as a fallback."

    @staticmethod
    def _find_variety(rows: list[CropReferenceRow], needle: str) -> CropReferenceRow:
        normalized_needle = _normalize(needle)
        for row in rows:
            if normalized_needle in _normalize(row.variety_type):
                return row
        return rows[0]


@lru_cache(maxsize=1)
def get_profit_risk_service() -> ProfitRiskService:
    return ProfitRiskService()
