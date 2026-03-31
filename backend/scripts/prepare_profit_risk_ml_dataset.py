from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import get_settings


FEATURE_COLUMNS = [
    "water_market_price_ml",
    "yield_t_ha",
    "input_cost_ha",
    "water_alloc_pct",
    "rainfall_mm_annual",
    "scenario_label",
]
TARGET_COLUMN = "net_margin_ha"


def build_training_dataframe(engine) -> pd.DataFrame:
    df = pd.read_sql(
        """
        SELECT
            water_market_price_ml,
            yield_t_ha,
            input_cost_ha,
            water_alloc_pct,
            rainfall_mm_annual,
            scenario_label,
            net_margin_ha
        FROM pr_scenario_training
        WHERE net_margin_ha IS NOT NULL
        """,
        engine,
    )

    for column in ["water_market_price_ml", "yield_t_ha", "input_cost_ha", "water_alloc_pct", "rainfall_mm_annual", "net_margin_ha"]:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df = df.dropna(subset=["water_market_price_ml", "yield_t_ha", "input_cost_ha", "water_alloc_pct", "rainfall_mm_annual", "scenario_label", "net_margin_ha"])
    df["scenario_label"] = df["scenario_label"].astype(str).str.strip().str.lower()
    df["scenario_label_encoded"] = df["scenario_label"].astype("category").cat.codes
    return df.reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare ML-ready training dataset for Profit & Risk")
    parser.add_argument("--output", default="data/ml/profit_risk_training.csv")
    args = parser.parse_args()

    settings = get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)

    df = build_training_dataframe(engine)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)

    print(f"Saved training data to {output_path}")
    print(f"Rows: {len(df)}")
    print("Features:", FEATURE_COLUMNS + ["scenario_label_encoded"])
    print("Target:", TARGET_COLUMN)


if __name__ == "__main__":
    main()
