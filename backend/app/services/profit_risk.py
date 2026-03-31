from __future__ import annotations

import re
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _normalize(value: str) -> str:
    lowered = (value or "").strip().lower().replace("—", " ").replace("–", " ")
    lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


class ProfitRiskService:
    def initialize(self) -> None:
        return

    def build_response(self, db: Session, block_crop: str, water_price: float, block_id: str | None = None) -> dict[str, Any]:
        precomputed_rows = self._fetch_precomputed_rows(db)
        if not precomputed_rows:
            raise RuntimeError("No precomputed margin rows found. Run ingestion first.")

        scenarios = self._fetch_scenarios(db)
        scenario_by_key = {item["scenario_key"]: float(item["water_price_ml"] or 0) for item in scenarios}
        scenario_by_price = {round(float(item["water_price_ml"] or 0), 6): item["scenario_key"] for item in scenarios}

        selected_scenario_key = scenario_by_price.get(round(float(water_price), 6))
        current_crop_row, match_type = self._resolve_crop_row(db, block_crop, precomputed_rows)

        margins_payload: list[dict[str, Any]] = []
        best_crop = None
        best_margin = None

        for row in precomputed_rows:
            scenario_map = {
                "low": row.get("low_margin"),
                "current": row.get("current_margin"),
                "high": row.get("high_margin"),
            }

            selected_margin = self._selected_margin(
                row=row,
                selected_scenario_key=selected_scenario_key,
                selected_water_price=water_price,
            )
            scenario_map["selected"] = selected_margin

            payload_row = {
                "crop": row["crop_name"],
                "commodity": row["commodity"],
                "current_price": float(row["farmgate_price"] or 0),
                "break_even_price": float(row["break_even_price"] or 0),
                "price_trend": row["price_trend"] or "UNKNOWN",
                "yield_t_ha": float(row["yield_t_ha"] or 0),
                "water_req_ml_ha": float(row["water_req_ml_ha"] or 0),
                "cost_per_unit": float(row["cost_per_unit"] or 0),
                "revenue_ha": float(row["revenue_ha"] or 0),
                "production_cost_ha": float(row["production_cost_ha"] or 0),
                "water_cost_ha": float(row["water_cost_ha_at_current"] or 0),
                "electricity_cost_ha": float(row["electricity_cost_ha"] or 0),
                "data_quality": row["data_quality"],
                "confidence_score": int(row["confidence_score"] or 0),
                "margins": {k: round(float(v or 0), 2) for k, v in scenario_map.items()},
                "_selected_margin": selected_margin,
            }
            margins_payload.append(payload_row)

            if best_margin is None or selected_margin > best_margin:
                best_margin = selected_margin
                best_crop = row["crop_name"]

        current_margin = self._selected_margin(current_crop_row, selected_scenario_key, water_price)
        risk_score = self._risk_score(
            margin=current_margin,
            current_price=float(current_crop_row["farmgate_price"] or 0),
            break_even_price=float(current_crop_row["break_even_price"] or 0),
            water_price=water_price,
            low_price=float(scenario_by_key.get("low", 80.0) or 80.0),
            high_price=float(scenario_by_key.get("high", 420.0) or 420.0),
        )

        risk_level = self._risk_level(risk_score)

        return {
            "block_crop": block_crop,
            "water_price": round(water_price, 2),
            "delivery_cost_ml": round(float(current_crop_row["delivery_cost_ml"] or 0), 2),
            "electricity_cost_ha": round(float(current_crop_row["electricity_cost_ha"] or 0), 2),
            "net_margin": round(float(current_margin), 2),
            "risk_level": risk_level,
            "risk_score": risk_score,
            "best_crop": best_crop,
            "best_crop_margin": round(float(best_margin or 0), 2),
            "updated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "current_crop": {
                "requested_crop": block_crop,
                "matched_crop": current_crop_row["crop_name"],
                "commodity": current_crop_row["commodity"],
                "match_type": match_type,
                "note": None,
                "current_price": float(current_crop_row["farmgate_price"] or 0),
                "break_even_price": float(current_crop_row["break_even_price"] or 0),
                "price_trend": current_crop_row["price_trend"] or "UNKNOWN",
                "yield_t_ha": float(current_crop_row["yield_t_ha"] or 0),
                "water_req_ml_ha": float(current_crop_row["water_req_ml_ha"] or 0),
                "delivery_cost_ml": round(float(current_crop_row["delivery_cost_ml"] or 0), 2),
                "electricity_cost_ha": round(float(current_crop_row["electricity_cost_ha"] or 0), 2),
                "net_margin": round(float(current_margin), 2),
                "risk_score": risk_score,
                "data_quality": current_crop_row["data_quality"],
                "confidence_score": int(current_crop_row["confidence_score"] or 0),
            },
            "margins": [
                {k: v for k, v in row.items() if k != "_selected_margin"}
                for row in sorted(margins_payload, key=lambda item: item["_selected_margin"], reverse=True)
            ],
        }

    def _fetch_scenarios(self, db: Session) -> list[dict[str, Any]]:
        return [
            dict(row)
            for row in db.execute(
                text("SELECT scenario_key, water_price_ml FROM pr_water_scenario ORDER BY sort_order")
            ).mappings().all()
        ]

    def _fetch_precomputed_rows(self, db: Session) -> list[dict[str, Any]]:
        query = text(
            """
            WITH latest_run AS (
                SELECT id
                FROM pr_margin_run
                WHERE status = 'completed'
                ORDER BY finished_at DESC NULLS LAST, id DESC
                LIMIT 1
            ),
            latest_price AS (
                SELECT DISTINCT ON (crop_id)
                    crop_id,
                    break_even_price,
                    price_trend,
                    cost_of_production_per_unit,
                    yield_t_ha_typical,
                    (water_req_ml_ha_min + water_req_ml_ha_max) / 2.0 AS water_req_ml_ha
                FROM pr_farmgate_price
                ORDER BY crop_id, effective_date DESC
            )
            SELECT
                c.id AS crop_id,
                c.crop_name,
                COALESCE(c.commodity, c.crop_name) AS commodity,
                lp.break_even_price,
                lp.price_trend,
                lp.cost_of_production_per_unit AS cost_per_unit,
                lp.yield_t_ha_typical AS yield_t_ha,
                lp.water_req_ml_ha,
                MAX(CASE WHEN mr.scenario_key = 'low' THEN mr.margin_ha END) AS low_margin,
                MAX(CASE WHEN mr.scenario_key = 'current' THEN mr.margin_ha END) AS current_margin,
                MAX(CASE WHEN mr.scenario_key = 'high' THEN mr.margin_ha END) AS high_margin,
                MAX(CASE WHEN mr.scenario_key = 'current' THEN mr.water_price_ml END) AS current_water_price,
                MAX(CASE WHEN mr.scenario_key = 'current' THEN mr.farmgate_price END) AS farmgate_price,
                MAX(CASE WHEN mr.scenario_key = 'current' THEN mr.revenue_ha END) AS revenue_ha,
                MAX(CASE WHEN mr.scenario_key = 'current' THEN mr.production_cost_ha END) AS production_cost_ha,
                MAX(CASE WHEN mr.scenario_key = 'current' THEN mr.delivery_cost_ml END) AS delivery_cost_ml,
                MAX(CASE WHEN mr.scenario_key = 'current' THEN mr.water_cost_ha END) AS water_cost_ha_at_current,
                MAX(CASE WHEN mr.scenario_key = 'current' THEN mr.electricity_cost_ha END) AS electricity_cost_ha,
                MAX(CASE WHEN mr.scenario_key = 'current' THEN mr.data_quality END) AS data_quality,
                MAX(CASE WHEN mr.scenario_key = 'current' THEN mr.confidence_score END) AS confidence_score
            FROM pr_margin_result mr
            JOIN latest_run lr ON lr.id = mr.run_id
            JOIN pr_crop c ON c.id = mr.crop_id
            LEFT JOIN latest_price lp ON lp.crop_id = mr.crop_id
            GROUP BY c.id, c.crop_name, c.commodity, lp.break_even_price, lp.price_trend, lp.cost_of_production_per_unit, lp.yield_t_ha_typical, lp.water_req_ml_ha
            ORDER BY c.crop_name
            """
        )
        return [dict(row) for row in db.execute(query).mappings().all()]

    def _resolve_crop_row(self, db: Session, block_crop: str, rows: list[dict[str, Any]]) -> tuple[dict[str, Any], str]:
        normalized = _normalize(block_crop)
        if not normalized:
            raise ValueError("Block crop is missing.")

        alias = db.execute(
            text(
                """
                SELECT crop_id
                FROM pr_crop_alias
                WHERE alias_normalized = :alias
                ORDER BY match_priority ASC
                LIMIT 1
                """
            ),
            {"alias": normalized},
        ).first()

        if alias:
            crop_id = int(alias[0])
            for row in rows:
                if int(row["crop_id"]) == crop_id:
                    return row, "alias"

        exact = [row for row in rows if _normalize(row["crop_name"]) == normalized]
        if exact:
            return exact[0], "exact"

        raise ValueError(f"No crop alias configured for '{block_crop}'. Add an entry in pr_crop_alias.")

    def _selected_margin(self, row: dict[str, Any], selected_scenario_key: str | None, selected_water_price: float) -> float:
        if selected_scenario_key in {"low", "current", "high"}:
            margin_value = row.get(f"{selected_scenario_key}_margin")
            if margin_value is not None:
                return float(margin_value)

        revenue = float(row.get("revenue_ha") or 0)
        production = float(row.get("production_cost_ha") or 0)
        delivery_ml = float(row.get("delivery_cost_ml") or 0)
        electricity = float(row.get("electricity_cost_ha") or 0)
        water_req_ml_ha = float(row.get("water_req_ml_ha") or 0)

        water_cost = water_req_ml_ha * (delivery_ml + float(selected_water_price))
        return round(revenue - production - water_cost - electricity, 2)

    def _risk_score(
        self,
        margin: float,
        current_price: float,
        break_even_price: float,
        water_price: float,
        low_price: float,
        high_price: float,
    ) -> int:
        base = 10.0

        if margin < 0:
            base += min(45.0, abs(margin) / 10000.0 * 45.0)

        if break_even_price > 0 and current_price < break_even_price:
            gap = (break_even_price - current_price) / break_even_price
            base += min(30.0, gap * 80.0)

        spread = max(1.0, high_price - low_price)
        base += min(15.0, max(0.0, (water_price - low_price) / spread * 15.0))

        return max(0, min(100, int(round(base))))

    @staticmethod
    def _risk_level(risk_score: int) -> str:
        if risk_score >= 67:
            return "High"
        if risk_score >= 34:
            return "Medium"
        return "Low"


@lru_cache(maxsize=1)
def get_profit_risk_service() -> ProfitRiskService:
    return ProfitRiskService()
