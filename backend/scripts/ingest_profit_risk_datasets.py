from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import get_settings


def slugify(value: str) -> str:
    raw = re.sub(r"[^a-zA-Z0-9]+", "_", (value or "").strip().lower())
    return re.sub(r"_+", "_", raw).strip("_")


def normalize_alias(value: str) -> str:
    lowered = (value or "").strip().lower().replace("—", " ").replace("–", " ")
    lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def candidate_aliases(value: str) -> set[str]:
    aliases: set[str] = set()
    normalized_full = normalize_alias(value)
    if normalized_full:
        aliases.add(normalized_full)

    raw = (value or "").strip()
    if not raw:
        return aliases

    # Crop labels often include qualifiers in parentheses or dash-separated suffixes.
    head = raw.split("(")[0].split("—")[0].split("-")[0].strip()
    normalized_head = normalize_alias(head)
    if normalized_head:
        aliases.add(normalized_head)

    parts = [p for p in normalized_head.split(" ") if p]
    if len(parts) >= 1:
        aliases.add(parts[0])
    if len(parts) >= 2:
        aliases.add(" ".join(parts[:2]))

    # Common wine shorthand.
    if "cabernet sauvignon" in aliases:
        aliases.add("cabernet")
    if "wine grapes red inland" in aliases:
        aliases.add("wine grapes red")
    if "wine grapes white inland" in aliases:
        aliases.add("wine grapes white")

    return {a for a in aliases if a}


def parse_number(value: Any, *, average_ranges: bool = True) -> float | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text_value = str(value).strip()
    if not text_value:
        return None
    nums = [float(match) for match in re.findall(r"\d+(?:\.\d+)?", text_value.replace(",", ""))]
    if not nums:
        return None
    if average_ranges and len(nums) >= 2:
        return sum(nums) / len(nums)
    return nums[0]


def parse_bool(value: Any) -> bool | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"y", "yes", "true", "1"}:
        return True
    if normalized in {"n", "no", "false", "0"}:
        return False
    return None


def parse_date(value: Any):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, date):
        return value
    parsed = pd.to_datetime(value, errors="coerce", dayfirst=True)
    if pd.isna(parsed):
        return None
    return parsed.date()


class ProfitRiskIngestor:
    def __init__(self, engine: Engine, dataset_dir: Path, schema_sql: Path) -> None:
        self.engine = engine
        self.dataset_dir = dataset_dir
        self.schema_sql = schema_sql

    def setup_schema(self) -> None:
        with self.engine.begin() as connection:
            connection.execute(text(self.schema_sql.read_text(encoding="utf-8")))

    def truncate_tables(self) -> None:
        tables = [
            "pr_margin_result", "pr_margin_run", "pr_scenario_training", "pr_winegrape_price_history",
            "pr_water_market_history", "pr_water_allocation_history", "pr_water_delivery_cost",
            "pr_farmer_water_cost", "pr_farmer_electricity_cost", "pr_electricity_tariff_reference",
            "pr_farmgate_price", "pr_crop_benchmark", "pr_crop_alias", "pr_crop", "pr_water_scenario",
        ]
        with self.engine.begin() as connection:
            for table_name in tables:
                connection.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE"))

    def ingest_all(self) -> None:
        self._ingest_crops_and_prices()
        self._ingest_water_delivery()
        self._ingest_water_allocation()
        self._ingest_water_market()
        self._ingest_winegrape_history()
        self._ingest_electricity_tariffs()
        self._ingest_farmer_electricity()
        self._ingest_farmer_water()
        self._ingest_training_data()
        self._seed_scenarios()
        self._precompute_margin_matrix()

    def _dataset_registry(self, key: str, file_name: str, source_type: str, row_count: int) -> None:
        with self.engine.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO pr_dataset_registry (dataset_key, file_name, source_type, row_count)
                    VALUES (:key, :file_name, :source_type, :row_count)
                    ON CONFLICT (dataset_key) DO UPDATE SET
                        file_name = EXCLUDED.file_name,
                        source_type = EXCLUDED.source_type,
                        row_count = EXCLUDED.row_count,
                        loaded_at = NOW()
                    """
                ),
                {"key": key, "file_name": file_name, "source_type": source_type, "row_count": row_count},
            )

    def _load_csv(self, file_name: str) -> pd.DataFrame:
        return pd.read_csv(self.dataset_dir / file_name)

    def _load_xlsx(self, file_name: str) -> pd.DataFrame:
        return pd.read_excel(self.dataset_dir / file_name)
    def _ingest_crops_and_prices(self) -> None:
        benchmarks = self._load_csv("02_Crop_Benchmarks_Reference.csv")
        farmgate = self._load_xlsx("SA_Farmgate_Prices_Final.xlsx")

        crop_rows_by_code: dict[str, dict[str, Any]] = {}
        benchmark_rows: list[dict[str, Any]] = []

        for _, row in benchmarks.iterrows():
            crop_code = slugify(str(row.get("crop_code") or row.get("crop_name") or ""))
            crop_name = str(row.get("crop_name") or crop_code).strip()
            crop_rows_by_code[crop_code] = {
                "crop_code": crop_code,
                "crop_name": crop_name,
                "commodity": crop_name,
                "variety_type": crop_name,
                "risk_level_reference": row.get("risk_level"),
                "pirsa_approved": parse_bool(row.get("pirsa_approved")),
                "source": row.get("source"),
            }
            benchmark_rows.append({
                "crop_code": crop_code,
                "water_req_ml_ha_min": parse_number(row.get("water_req_ml_ha_min"), average_ranges=False),
                "water_req_ml_ha_max": parse_number(row.get("water_req_ml_ha_max"), average_ranges=False),
                "yield_t_ha_typical": parse_number(row.get("yield_t_ha_typical"), average_ranges=False),
                "price_per_t_2024": parse_number(row.get("price_per_t_2024"), average_ranges=False),
                "price_per_t_2025": parse_number(row.get("price_per_t_2025"), average_ranges=False),
                "price_per_t_10yr_avg": parse_number(row.get("price_per_t_10yr_avg"), average_ranges=False),
                "input_cost_ha": parse_number(row.get("input_cost_ha"), average_ranges=False),
                "risk_level": row.get("risk_level"),
                "source": row.get("source"),
            })

        farmgate_rows: list[dict[str, Any]] = []
        alias_rows: list[dict[str, Any]] = []
        for _, row in farmgate.iterrows():
            variety_type = str(row.get("variety_type") or "").strip()
            commodity = str(row.get("commodity") or "").strip()
            crop_code = slugify(variety_type or commodity)
            if crop_code not in crop_rows_by_code:
                crop_rows_by_code[crop_code] = {
                    "crop_code": crop_code,
                    "crop_name": variety_type or commodity or crop_code,
                    "commodity": commodity,
                    "variety_type": variety_type,
                    "risk_level_reference": None,
                    "pirsa_approved": None,
                    "source": "SA_Farmgate_Prices_Final.xlsx",
                }
            for alias in [variety_type, commodity]:
                normalized = normalize_alias(alias)
                if normalized:
                    alias_rows.append({"crop_code": crop_code, "alias_raw": alias, "alias_normalized": normalized})

            farmgate_rows.append({
                "crop_code": crop_code,
                "effective_date": date.today(),
                "farmgate_price_low": parse_number(row.get("farmgate_price_low"), average_ranges=False),
                "farmgate_price_mid": parse_number(row.get("farmgate_price_mid"), average_ranges=False),
                "farmgate_price_high": parse_number(row.get("farmgate_price_high"), average_ranges=False),
                "break_even_price": parse_number(row.get("profitable_above"), average_ranges=False),
                "price_trend": row.get("price_trend"),
                "cost_of_production_per_unit": parse_number(row.get("cost_of_production_per_unit")),
                "yield_t_ha_typical": parse_number(row.get("yield_t_ha_typical"), average_ranges=False),
                "water_req_ml_ha_min": parse_number(row.get("water_req_ml_ha_min"), average_ranges=False),
                "water_req_ml_ha_max": parse_number(row.get("water_req_ml_ha_max"), average_ranges=False),
                "unit_price": str(row.get("price_unit") or "AUD/tonne"),
                "unit_yield": "TONNE_PER_HA",
                "unit_water": "ML_PER_HA",
                "is_verified": "verified" in str(row.get("cost_data_quality") or "").strip().lower(),
                "source": "SA_Farmgate_Prices_Final.xlsx",
            })

        with self.engine.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO pr_crop (crop_code, crop_name, commodity, variety_type, risk_level_reference, pirsa_approved, source)
                    VALUES (:crop_code, :crop_name, :commodity, :variety_type, :risk_level_reference, :pirsa_approved, :source)
                    ON CONFLICT (crop_code) DO UPDATE SET
                        crop_name = EXCLUDED.crop_name,
                        commodity = COALESCE(EXCLUDED.commodity, pr_crop.commodity),
                        variety_type = COALESCE(EXCLUDED.variety_type, pr_crop.variety_type),
                        risk_level_reference = COALESCE(EXCLUDED.risk_level_reference, pr_crop.risk_level_reference),
                        pirsa_approved = COALESCE(EXCLUDED.pirsa_approved, pr_crop.pirsa_approved),
                        source = COALESCE(EXCLUDED.source, pr_crop.source),
                        updated_at = NOW()
                    """
                ),
                list(crop_rows_by_code.values()),
            )
            crop_map = {row.crop_code: row.id for row in connection.execute(text("SELECT id, crop_code FROM pr_crop")).fetchall()}

            connection.execute(
                text(
                    """
                    INSERT INTO pr_crop_benchmark (crop_id, water_req_ml_ha_min, water_req_ml_ha_max, yield_t_ha_typical, price_per_t_2024, price_per_t_2025, price_per_t_10yr_avg, input_cost_ha, risk_level, source)
                    VALUES (:crop_id, :water_req_ml_ha_min, :water_req_ml_ha_max, :yield_t_ha_typical, :price_per_t_2024, :price_per_t_2025, :price_per_t_10yr_avg, :input_cost_ha, :risk_level, :source)
                    ON CONFLICT (crop_id) DO UPDATE SET
                        water_req_ml_ha_min = EXCLUDED.water_req_ml_ha_min,
                        water_req_ml_ha_max = EXCLUDED.water_req_ml_ha_max,
                        yield_t_ha_typical = EXCLUDED.yield_t_ha_typical,
                        price_per_t_2024 = EXCLUDED.price_per_t_2024,
                        price_per_t_2025 = EXCLUDED.price_per_t_2025,
                        price_per_t_10yr_avg = EXCLUDED.price_per_t_10yr_avg,
                        input_cost_ha = EXCLUDED.input_cost_ha,
                        risk_level = EXCLUDED.risk_level,
                        source = EXCLUDED.source,
                        updated_at = NOW()
                    """
                ),
                [{"crop_id": crop_map[r["crop_code"]], **{k: v for k, v in r.items() if k != "crop_code"}} for r in benchmark_rows if r["crop_code"] in crop_map],
            )

            connection.execute(
                text(
                    """
                    INSERT INTO pr_farmgate_price (crop_id, effective_date, farmgate_price_low, farmgate_price_mid, farmgate_price_high, break_even_price, price_trend, cost_of_production_per_unit, yield_t_ha_typical, water_req_ml_ha_min, water_req_ml_ha_max, unit_price, unit_yield, unit_water, is_verified, source)
                    VALUES (:crop_id, :effective_date, :farmgate_price_low, :farmgate_price_mid, :farmgate_price_high, :break_even_price, :price_trend, :cost_of_production_per_unit, :yield_t_ha_typical, :water_req_ml_ha_min, :water_req_ml_ha_max, :unit_price, :unit_yield, :unit_water, :is_verified, :source)
                    ON CONFLICT (crop_id, effective_date) DO UPDATE SET
                        farmgate_price_low = EXCLUDED.farmgate_price_low,
                        farmgate_price_mid = EXCLUDED.farmgate_price_mid,
                        farmgate_price_high = EXCLUDED.farmgate_price_high,
                        break_even_price = EXCLUDED.break_even_price,
                        price_trend = EXCLUDED.price_trend,
                        cost_of_production_per_unit = EXCLUDED.cost_of_production_per_unit,
                        yield_t_ha_typical = EXCLUDED.yield_t_ha_typical,
                        water_req_ml_ha_min = EXCLUDED.water_req_ml_ha_min,
                        water_req_ml_ha_max = EXCLUDED.water_req_ml_ha_max,
                        unit_price = EXCLUDED.unit_price,
                        unit_yield = EXCLUDED.unit_yield,
                        unit_water = EXCLUDED.unit_water,
                        is_verified = EXCLUDED.is_verified,
                        source = EXCLUDED.source
                    """
                ),
                [{"crop_id": crop_map[r["crop_code"]], **{k: v for k, v in r.items() if k != "crop_code"}} for r in farmgate_rows if r["crop_code"] in crop_map],
            )

            # Automatic aliases from canonical crop names.
            for crop_code, crop_row in crop_rows_by_code.items():
                for alias in candidate_aliases(str(crop_row.get("crop_name") or "")):
                    alias_rows.append(
                        {"crop_code": crop_code, "alias_raw": crop_row.get("crop_name") or alias, "alias_normalized": alias}
                    )

            dedup = {(r["alias_normalized"], r["crop_code"]): r for r in alias_rows}
            if dedup:
                connection.execute(
                    text(
                        """
                        INSERT INTO pr_crop_alias (crop_id, alias_raw, alias_normalized, match_priority)
                        VALUES (:crop_id, :alias_raw, :alias_normalized, 50)
                        ON CONFLICT (alias_normalized) DO UPDATE SET
                            crop_id = EXCLUDED.crop_id,
                            alias_raw = EXCLUDED.alias_raw,
                            match_priority = LEAST(pr_crop_alias.match_priority, EXCLUDED.match_priority)
                        """
                    ),
                    [{"crop_id": crop_map[v["crop_code"]], "alias_raw": v["alias_raw"], "alias_normalized": v["alias_normalized"]} for v in dedup.values() if v["crop_code"] in crop_map],
                )

            self._ensure_block_crop_alias_coverage(connection)

        self._dataset_registry("farmgate_xlsx", "SA_Farmgate_Prices_Final.xlsx", "xlsx", len(farmgate))
        self._dataset_registry("crop_benchmarks", "02_Crop_Benchmarks_Reference.csv", "csv", len(benchmarks))

    def _insert_simple(self, table: str, payload: list[dict[str, Any]]) -> None:
        if not payload:
            return
        keys = list(payload[0].keys())
        columns = ", ".join(keys)
        values = ", ".join(f":{k}" for k in keys)
        with self.engine.begin() as connection:
            connection.execute(text(f"INSERT INTO {table} ({columns}) VALUES ({values})"), payload)

    def _ensure_block_crop_alias_coverage(self, connection) -> None:
        block_crops = connection.execute(
            text("SELECT DISTINCT crop FROM blocks WHERE crop IS NOT NULL AND TRIM(crop) <> ''")
        ).fetchall()

        for (block_crop_raw,) in block_crops:
            normalized = normalize_alias(str(block_crop_raw))
            if not normalized:
                continue

            exists = connection.execute(
                text("SELECT 1 FROM pr_crop_alias WHERE alias_normalized = :alias LIMIT 1"),
                {"alias": normalized},
            ).first()
            if exists:
                continue

            candidate = connection.execute(
                text(
                    """
                    SELECT c.id, c.crop_name
                    FROM pr_crop c
                    WHERE LOWER(c.crop_name) LIKE '%' || :alias || '%'
                       OR :alias LIKE '%' || LOWER(c.crop_name) || '%'
                    ORDER BY LENGTH(c.crop_name) ASC
                    LIMIT 1
                    """
                ),
                {"alias": normalized},
            ).mappings().first()

            if candidate:
                connection.execute(
                    text(
                        """
                        INSERT INTO pr_crop_alias (crop_id, alias_raw, alias_normalized, match_priority)
                        VALUES (:crop_id, :alias_raw, :alias_normalized, 10)
                        ON CONFLICT (alias_normalized) DO NOTHING
                        """
                    ),
                    {
                        "crop_id": candidate["id"],
                        "alias_raw": block_crop_raw,
                        "alias_normalized": normalized,
                    },
                )

    def _ingest_water_delivery(self) -> None:
        df = self._load_csv("03_Water_Delivery_Costs_By_Trust.csv")
        payload = [{
            "trust": r.get("trust"), "trust_full": r.get("trust_full"), "district": r.get("district"), "pressure_zone": r.get("pressure_zone"),
            "delivery_fee_offpeak_ml": parse_number(r.get("delivery_fee_offpeak_ml"), average_ranges=False),
            "delivery_fee_peak_ml": parse_number(r.get("delivery_fee_peak_ml"), average_ranges=False),
            "service_charge_per_ha": parse_number(r.get("service_charge_per_ha"), average_ranges=False),
            "service_charge_min": parse_number(r.get("service_charge_min"), average_ranges=False),
            "landscape_levy_ml": parse_number(r.get("landscape_levy_ml"), average_ranges=False),
            "drainage_fee_ha": parse_number(r.get("drainage_fee_ha"), average_ranges=False),
            "peak_window": r.get("peak_window"), "valid_from": parse_date(r.get("valid_from")), "valid_to": parse_date(r.get("valid_to")), "source": r.get("source"), "is_verified": True,
        } for _, r in df.iterrows()]
        self._insert_simple("pr_water_delivery_cost", payload)
        self._dataset_registry("water_delivery_costs", "03_Water_Delivery_Costs_By_Trust.csv", "csv", len(df))

    def _ingest_water_allocation(self) -> None:
        df = self._load_csv("04_SA_Water_Allocation_History_2002_2025.csv")
        with self.engine.begin() as connection:
            for _, r in df.iterrows():
                connection.execute(text("""
                    INSERT INTO pr_water_allocation_history (water_year, water_year_label, opening_allocation_pct, final_allocation_pct, carryover_allowed, entitlement_class, region, notes, source)
                    VALUES (:water_year, :water_year_label, :opening_allocation_pct, :final_allocation_pct, :carryover_allowed, :entitlement_class, :region, :notes, :source)
                    ON CONFLICT (water_year) DO UPDATE SET
                        water_year_label=EXCLUDED.water_year_label,
                        opening_allocation_pct=EXCLUDED.opening_allocation_pct,
                        final_allocation_pct=EXCLUDED.final_allocation_pct,
                        carryover_allowed=EXCLUDED.carryover_allowed,
                        entitlement_class=EXCLUDED.entitlement_class,
                        region=EXCLUDED.region,
                        notes=EXCLUDED.notes,
                        source=EXCLUDED.source
                """), {
                    "water_year": int(r.get("water_year")), "water_year_label": r.get("water_year_label"),
                    "opening_allocation_pct": parse_number(r.get("opening_allocation_pct"), average_ranges=False),
                    "final_allocation_pct": parse_number(r.get("final_allocation_pct"), average_ranges=False),
                    "carryover_allowed": parse_bool(r.get("carryover_allowed")), "entitlement_class": r.get("entitlement_class"), "region": r.get("region"), "notes": r.get("notes"), "source": r.get("source"),
                })
        self._dataset_registry("water_allocation_history", "04_SA_Water_Allocation_History_2002_2025.csv", "csv", len(df))
    def _ingest_water_market(self) -> None:
        df = self._load_csv("05_Water_Market_Price_History_SA_Murray.csv")
        with self.engine.begin() as connection:
            for _, r in df.iterrows():
                connection.execute(text("""
                    INSERT INTO pr_water_market_history (water_year, region, annual_vwap_price_ml, price_scenario, data_quality, source)
                    VALUES (:water_year, :region, :annual_vwap_price_ml, :price_scenario, :data_quality, :source)
                    ON CONFLICT (water_year) DO UPDATE SET
                        region=EXCLUDED.region,
                        annual_vwap_price_ml=EXCLUDED.annual_vwap_price_ml,
                        price_scenario=EXCLUDED.price_scenario,
                        data_quality=EXCLUDED.data_quality,
                        source=EXCLUDED.source
                """), {
                    "water_year": int(r.get("water_year")), "region": r.get("region"),
                    "annual_vwap_price_ml": parse_number(r.get("annual_vwap_price_ml"), average_ranges=False),
                    "price_scenario": r.get("price_scenario"), "data_quality": r.get("data_quality"), "source": r.get("source"),
                })
        self._dataset_registry("water_market_history", "05_Water_Market_Price_History_SA_Murray.csv", "csv", len(df))

    def _ingest_winegrape_history(self) -> None:
        df = self._load_csv("06_Riverland_Winegrape_Price_History_By_Variety.csv")
        with self.engine.begin() as connection:
            alias_map = {row.alias_normalized: row.crop_id for row in connection.execute(text("SELECT alias_normalized, crop_id FROM pr_crop_alias"))}
            payload = [{
                "year": int(r.get("year")), "region": r.get("region"), "crop_id": alias_map.get(normalize_alias(str(r.get("variety") or ""))),
                "variety": r.get("variety"), "colour": r.get("colour"),
                "avg_price_per_t": parse_number(r.get("avg_price_per_t"), average_ranges=False),
                "approx_crush_tonnes": parse_number(r.get("approx_crush_tonnes"), average_ranges=False),
                "price_trend": r.get("price_trend"), "source": r.get("source"),
            } for _, r in df.iterrows()]
            connection.execute(text("""
                INSERT INTO pr_winegrape_price_history (year, region, crop_id, variety, colour, avg_price_per_t, approx_crush_tonnes, price_trend, source)
                VALUES (:year, :region, :crop_id, :variety, :colour, :avg_price_per_t, :approx_crush_tonnes, :price_trend, :source)
                ON CONFLICT (year, region, variety) DO UPDATE SET
                    crop_id=EXCLUDED.crop_id,
                    colour=EXCLUDED.colour,
                    avg_price_per_t=EXCLUDED.avg_price_per_t,
                    approx_crush_tonnes=EXCLUDED.approx_crush_tonnes,
                    price_trend=EXCLUDED.price_trend,
                    source=EXCLUDED.source
            """), payload)
        self._dataset_registry("winegrape_history", "06_Riverland_Winegrape_Price_History_By_Variety.csv", "csv", len(df))

    def _ingest_electricity_tariffs(self) -> None:
        df = self._load_csv("07_SA_Electricity_Tariff_Reference.csv")
        with self.engine.begin() as connection:
            payload = [{
                "tariff_type": r.get("tariff_type"), "customer_type": r.get("customer_type"),
                "rate_cents_kwh": parse_number(r.get("rate_cents_kwh"), average_ranges=False),
                "daily_supply_charge_cents": parse_number(r.get("daily_supply_charge_cents"), average_ranges=False),
                "annual_kwh_threshold": parse_number(r.get("annual_kwh_threshold"), average_ranges=False),
                "peak_window": r.get("peak_window"), "notes": r.get("notes"), "source": r.get("source"),
            } for _, r in df.iterrows()]
            connection.execute(text("""
                INSERT INTO pr_electricity_tariff_reference (tariff_type, customer_type, rate_cents_kwh, daily_supply_charge_cents, annual_kwh_threshold, peak_window, notes, source)
                VALUES (:tariff_type, :customer_type, :rate_cents_kwh, :daily_supply_charge_cents, :annual_kwh_threshold, :peak_window, :notes, :source)
                ON CONFLICT (tariff_type, customer_type) DO UPDATE SET
                    rate_cents_kwh=EXCLUDED.rate_cents_kwh,
                    daily_supply_charge_cents=EXCLUDED.daily_supply_charge_cents,
                    annual_kwh_threshold=EXCLUDED.annual_kwh_threshold,
                    peak_window=EXCLUDED.peak_window,
                    notes=EXCLUDED.notes,
                    source=EXCLUDED.source
            """), payload)
        self._dataset_registry("electricity_tariffs", "07_SA_Electricity_Tariff_Reference.csv", "csv", len(df))

    def _ingest_farmer_electricity(self) -> None:
        df = self._load_csv("08_Riverland_Farmer_Electricity_Costs.csv")
        payload = [{
            "farmer_type": r.get("farmer_type"), "usage_description": r.get("usage_description"), "tariff_type": r.get("tariff_type"),
            "rate_cents_per_kwh": parse_number(r.get("rate_cents_per_kwh"), average_ranges=False),
            "daily_supply_charge_cents": parse_number(r.get("daily_supply_charge_cents"), average_ranges=False),
            "peak_window": r.get("peak_window"),
            "annual_cost_estimate_aud": parse_number(r.get("annual_cost_estimate_aud"), average_ranges=False),
            "notes": r.get("notes"), "source_organisation": r.get("source_organisation"), "source_document": r.get("source_document"), "source_url": r.get("source_url"),
            "data_verified": parse_bool(r.get("data_verified")), "derived_flag": False,
        } for _, r in df.iterrows()]
        self._insert_simple("pr_farmer_electricity_cost", payload)
        self._dataset_registry("farmer_electricity", "08_Riverland_Farmer_Electricity_Costs.csv", "csv", len(df))

    def _ingest_farmer_water(self) -> None:
        df = self._load_csv("09_Riverland_Farmer_Water_Costs.csv")
        payload = [{
            "cost_component": r.get("cost_component"), "cost_category": r.get("cost_category"), "trust": r.get("trust"), "district_coverage": r.get("district_coverage"), "unit": r.get("unit"),
            "rate_low": parse_number(r.get("rate_low"), average_ranges=False), "rate_high": parse_number(r.get("rate_high"), average_ranges=False),
            "minimum_charge": parse_number(r.get("minimum_charge"), average_ranges=False), "peak_offpeak_distinction": r.get("peak_offpeak_distinction"),
            "notes": r.get("notes"), "valid_from": parse_date(r.get("valid_from")), "valid_to": parse_date(r.get("valid_to")), "source": r.get("source"), "data_verified": True, "derived_flag": False,
        } for _, r in df.iterrows()]
        self._insert_simple("pr_farmer_water_cost", payload)
        self._dataset_registry("farmer_water", "09_Riverland_Farmer_Water_Costs.csv", "csv", len(df))

    def _ingest_training_data(self) -> None:
        df = self._load_csv("01_Riverland_Scenario_Training_Data.csv")
        payload = [{
            "year": parse_number(r.get("year"), average_ranges=False), "region": r.get("region"), "crop_type": r.get("crop_type"),
            "water_alloc_pct": parse_number(r.get("water_alloc_pct"), average_ranges=False), "water_market_price_ml": parse_number(r.get("water_market_price_ml"), average_ranges=False),
            "water_delivery_cost_ml": parse_number(r.get("water_delivery_cost_ml"), average_ranges=False), "landscape_levy_ml": parse_number(r.get("landscape_levy_ml"), average_ranges=False),
            "water_use_ml_ha": parse_number(r.get("water_use_ml_ha"), average_ranges=False), "rainfall_mm_annual": parse_number(r.get("rainfall_mm_annual"), average_ranges=False),
            "max_temp_avg_c": parse_number(r.get("max_temp_avg_c"), average_ranges=False), "growing_degree_days": parse_number(r.get("growing_degree_days"), average_ranges=False),
            "grape_price_red_per_t": parse_number(r.get("grape_price_red_per_t"), average_ranges=False), "grape_price_white_per_t": parse_number(r.get("grape_price_white_per_t"), average_ranges=False),
            "yield_t_ha": parse_number(r.get("yield_t_ha"), average_ranges=False), "input_cost_ha": parse_number(r.get("input_cost_ha"), average_ranges=False),
            "water_total_cost_ha": parse_number(r.get("water_total_cost_ha"), average_ranges=False), "revenue_ha": parse_number(r.get("revenue_ha"), average_ranges=False),
            "net_margin_ha": parse_number(r.get("net_margin_ha"), average_ranges=False), "capital_investment": parse_number(r.get("capital_investment"), average_ranges=False),
            "years_to_profit": r.get("years_to_profit"), "scenario_label": r.get("scenario_label"), "data_source": r.get("data_source"),
        } for _, r in df.iterrows()]
        self._insert_simple("pr_scenario_training", payload)
        self._dataset_registry("scenario_training", "01_Riverland_Scenario_Training_Data.csv", "csv", len(df))

    def _seed_scenarios(self) -> None:
        with self.engine.begin() as connection:
            connection.execute(text("""
                INSERT INTO pr_water_scenario (scenario_key, scenario_label, water_price_ml, sort_order, is_default)
                VALUES
                    ('low', 'Low', 80.0, 1, FALSE),
                    ('current', 'Current', 153.0, 2, TRUE),
                    ('high', 'High', 420.0, 3, FALSE)
                ON CONFLICT (scenario_key) DO UPDATE SET
                    scenario_label = EXCLUDED.scenario_label,
                    water_price_ml = EXCLUDED.water_price_ml,
                    sort_order = EXCLUDED.sort_order,
                    is_default = EXCLUDED.is_default
            """))

    def _precompute_margin_matrix(self) -> None:
        with self.engine.begin() as connection:
            connection.execute(text("DELETE FROM pr_margin_result"))
            connection.execute(text("DELETE FROM pr_margin_run"))
            run_id = connection.execute(text("INSERT INTO pr_margin_run (run_type, water_source, status) VALUES ('baseline_matrix', 'scenario_table', 'running') RETURNING id")).scalar_one()
            crops = connection.execute(text("""
                WITH latest_price AS (
                    SELECT DISTINCT ON (crop_id)
                        crop_id, farmgate_price_mid, cost_of_production_per_unit, yield_t_ha_typical, water_req_ml_ha_min, water_req_ml_ha_max, unit_price
                    FROM pr_farmgate_price
                    ORDER BY crop_id, effective_date DESC
                ), delivery_median AS (
                    SELECT COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(delivery_fee_offpeak_ml, 0) + COALESCE(landscape_levy_ml, 0)), 0) AS delivery_ml
                    FROM pr_water_delivery_cost
                ), electricity_median AS (
                    SELECT COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY annual_cost_estimate_aud), 0) AS electricity_ha
                    FROM pr_farmer_electricity_cost WHERE annual_cost_estimate_aud IS NOT NULL
                )
                SELECT c.id AS crop_id,
                       c.crop_name,
                       lp.unit_price,
                       lp.farmgate_price_mid AS farmgate_price,
                       lp.cost_of_production_per_unit AS cost_per_unit,
                       lp.yield_t_ha_typical AS yield_t_ha,
                       (lp.water_req_ml_ha_min + lp.water_req_ml_ha_max) / 2.0 AS water_req_ml_ha,
                       cb.revenue_ha_typical,
                       cb.input_cost_ha,
                       (SELECT delivery_ml FROM delivery_median) AS delivery_ml,
                       (SELECT electricity_ha FROM electricity_median) AS electricity_ha
                FROM pr_crop c
                INNER JOIN latest_price lp ON lp.crop_id = c.id
                LEFT JOIN pr_crop_benchmark cb ON cb.crop_id = c.id
                WHERE lp.farmgate_price_mid > 0
                  AND lp.yield_t_ha_typical > 0
            """)).mappings().all()
            scenarios = connection.execute(text("SELECT scenario_key, water_price_ml FROM pr_water_scenario ORDER BY sort_order")).mappings().all()
            payload = []
            for crop in crops:
                for scenario in scenarios:
                    # Unit-aware economics: for litre-priced crops, prefer benchmark per-hectare totals if available.
                    if "litre" in str(crop["unit_price"] or "").lower() and crop["revenue_ha_typical"] and crop["input_cost_ha"]:
                        revenue = float(crop["revenue_ha_typical"] or 0)
                        production = float(crop["input_cost_ha"] or 0)
                    else:
                        revenue = float(crop["farmgate_price"] or 0) * float(crop["yield_t_ha"] or 0)
                        production = float(crop["cost_per_unit"] or 0) * float(crop["yield_t_ha"] or 0)

                    water_cost = float(crop["water_req_ml_ha"] or 0) * (float(crop["delivery_ml"] or 0) + float(scenario["water_price_ml"] or 0))
                    electricity = float(crop["electricity_ha"] or 0)
                    total = production + water_cost + electricity
                    derived_delivery = True
                    derived_market = False
                    derived_electricity = True
                    derived_count = int(derived_delivery) + int(derived_market) + int(derived_electricity)
                    confidence_score = max(0, 100 - (derived_count * 20))
                    payload.append({
                        "run_id": run_id, "crop_id": crop["crop_id"], "scenario_key": scenario["scenario_key"], "water_price_ml": float(scenario["water_price_ml"] or 0),
                        "farmgate_price": float(crop["farmgate_price"] or 0), "yield_t_ha": float(crop["yield_t_ha"] or 0), "production_cost_per_unit": float(crop["cost_per_unit"] or 0),
                        "revenue_ha": revenue, "production_cost_ha": production, "delivery_cost_ml": float(crop["delivery_ml"] or 0), "market_cost_ml": float(scenario["water_price_ml"] or 0),
                        "water_cost_ha": water_cost, "electricity_cost_ha": electricity, "total_cost_ha": total, "margin_ha": revenue - total,
                        "derived_delivery": derived_delivery, "derived_market": derived_market, "derived_electricity": derived_electricity,
                        "data_quality": "derived" if derived_count else "verified",
                        "confidence_score": confidence_score,
                    })
            if payload:
                connection.execute(text("""
                    INSERT INTO pr_margin_result (
                        run_id, crop_id, scenario_key, water_price_ml, farmgate_price, yield_t_ha, production_cost_per_unit,
                        revenue_ha, production_cost_ha, delivery_cost_ml, market_cost_ml, water_cost_ha, electricity_cost_ha,
                        total_cost_ha, margin_ha, derived_delivery, derived_market, derived_electricity, data_quality, confidence_score
                    ) VALUES (
                        :run_id, :crop_id, :scenario_key, :water_price_ml, :farmgate_price, :yield_t_ha, :production_cost_per_unit,
                        :revenue_ha, :production_cost_ha, :delivery_cost_ml, :market_cost_ml, :water_cost_ha, :electricity_cost_ha,
                        :total_cost_ha, :margin_ha, :derived_delivery, :derived_market, :derived_electricity, :data_quality, :confidence_score
                    )
                """), payload)
            connection.execute(text("UPDATE pr_margin_run SET status='completed', finished_at=NOW(), notes=:notes WHERE id=:run_id"), {"run_id": run_id, "notes": f"Precomputed {len(payload)} rows"})


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Profit & Risk datasets into PostgreSQL")
    parser.add_argument("--dataset-dir", default="Dataset")
    parser.add_argument("--schema-sql", default="db/profit_risk_schema.sql")
    parser.add_argument("--full-refresh", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)

    ingestor = ProfitRiskIngestor(engine=engine, dataset_dir=Path(args.dataset_dir), schema_sql=Path(args.schema_sql))
    ingestor.setup_schema()
    if args.full_refresh:
        ingestor.truncate_tables()
    ingestor.ingest_all()
    print("Profit & Risk dataset ingestion completed.")


if __name__ == "__main__":
    main()
