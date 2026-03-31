-- Profit & Risk production schema
-- Multi-dataset, PostgreSQL-backed, ML-ready

CREATE TABLE IF NOT EXISTS pr_dataset_registry (
    dataset_key TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    row_count INTEGER NOT NULL DEFAULT 0,
    checksum_sha256 TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS pr_crop (
    id BIGSERIAL PRIMARY KEY,
    crop_code TEXT NOT NULL UNIQUE,
    crop_name TEXT NOT NULL,
    commodity TEXT,
    variety_type TEXT,
    color TEXT,
    risk_level_reference TEXT,
    pirsa_approved BOOLEAN,
    source TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_pr_crop_name ON pr_crop(crop_name);

CREATE TABLE IF NOT EXISTS pr_crop_alias (
    id BIGSERIAL PRIMARY KEY,
    crop_id BIGINT NOT NULL REFERENCES pr_crop(id) ON DELETE CASCADE,
    alias_raw TEXT NOT NULL,
    alias_normalized TEXT NOT NULL UNIQUE,
    match_priority SMALLINT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_pr_crop_alias_crop_id ON pr_crop_alias(crop_id);

CREATE TABLE IF NOT EXISTS pr_crop_benchmark (
    crop_id BIGINT PRIMARY KEY REFERENCES pr_crop(id) ON DELETE CASCADE,
    water_req_ml_ha_min NUMERIC(12,4),
    water_req_ml_ha_max NUMERIC(12,4),
    yield_t_ha_typical NUMERIC(12,4),
    price_per_t_2024 NUMERIC(14,4),
    price_per_t_2025 NUMERIC(14,4),
    price_per_t_crisis_low NUMERIC(14,4),
    price_per_t_10yr_avg NUMERIC(14,4),
    revenue_ha_typical NUMERIC(14,4),
    input_cost_ha NUMERIC(14,4),
    net_margin_ha_typical NUMERIC(14,4),
    capital_investment_new NUMERIC(14,4),
    years_to_first_income NUMERIC(12,4),
    years_to_profit TEXT,
    rev_per_ml_water NUMERIC(14,4),
    risk_level TEXT,
    pirsa_approved BOOLEAN,
    source TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pr_farmgate_price (
    id BIGSERIAL PRIMARY KEY,
    crop_id BIGINT NOT NULL REFERENCES pr_crop(id) ON DELETE CASCADE,
    effective_date DATE NOT NULL,
    farmgate_price_low NUMERIC(14,4),
    farmgate_price_mid NUMERIC(14,4),
    farmgate_price_high NUMERIC(14,4),
    break_even_price NUMERIC(14,4),
    price_trend TEXT,
    cost_of_production_per_unit NUMERIC(14,4),
    yield_t_ha_typical NUMERIC(14,4),
    water_req_ml_ha_min NUMERIC(12,4),
    water_req_ml_ha_max NUMERIC(12,4),
    unit_price TEXT NOT NULL DEFAULT 'AUD_PER_TONNE',
    unit_yield TEXT NOT NULL DEFAULT 'TONNE_PER_HA',
    unit_water TEXT NOT NULL DEFAULT 'ML_PER_HA',
    source TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (crop_id, effective_date)
);

CREATE INDEX IF NOT EXISTS ix_pr_farmgate_price_crop_date ON pr_farmgate_price(crop_id, effective_date DESC);

CREATE TABLE IF NOT EXISTS pr_water_delivery_cost (
    id BIGSERIAL PRIMARY KEY,
    trust TEXT NOT NULL,
    trust_full TEXT,
    district TEXT,
    pressure_zone TEXT,
    delivery_fee_offpeak_ml NUMERIC(14,4),
    delivery_fee_peak_ml NUMERIC(14,4),
    service_charge_per_ha NUMERIC(14,4),
    service_charge_min NUMERIC(14,4),
    landscape_levy_ml NUMERIC(14,4),
    drainage_fee_ha NUMERIC(14,4),
    peak_window TEXT,
    valid_from DATE,
    valid_to DATE,
    source TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS ix_pr_water_delivery_lookup ON pr_water_delivery_cost(trust, district, pressure_zone);
CREATE INDEX IF NOT EXISTS ix_pr_water_delivery_validity ON pr_water_delivery_cost(valid_from, valid_to);

CREATE TABLE IF NOT EXISTS pr_water_allocation_history (
    water_year INTEGER PRIMARY KEY,
    water_year_label TEXT,
    opening_allocation_pct NUMERIC(8,3),
    final_allocation_pct NUMERIC(8,3),
    carryover_allowed BOOLEAN,
    entitlement_class TEXT,
    region TEXT,
    notes TEXT,
    source TEXT
);

CREATE TABLE IF NOT EXISTS pr_water_market_history (
    water_year INTEGER PRIMARY KEY,
    region TEXT,
    annual_vwap_price_ml NUMERIC(14,4),
    price_scenario TEXT,
    data_quality TEXT,
    source TEXT
);

CREATE INDEX IF NOT EXISTS ix_pr_water_market_region_year ON pr_water_market_history(region, water_year);

CREATE TABLE IF NOT EXISTS pr_winegrape_price_history (
    id BIGSERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    region TEXT,
    crop_id BIGINT REFERENCES pr_crop(id) ON DELETE SET NULL,
    variety TEXT,
    colour TEXT,
    avg_price_per_t NUMERIC(14,4),
    approx_crush_tonnes NUMERIC(14,4),
    price_trend TEXT,
    source TEXT,
    UNIQUE (year, region, variety)
);

CREATE INDEX IF NOT EXISTS ix_pr_winegrape_history_crop_year ON pr_winegrape_price_history(crop_id, year DESC);

CREATE TABLE IF NOT EXISTS pr_electricity_tariff_reference (
    id BIGSERIAL PRIMARY KEY,
    tariff_type TEXT NOT NULL,
    customer_type TEXT,
    rate_cents_kwh NUMERIC(14,4),
    daily_supply_charge_cents NUMERIC(14,4),
    annual_kwh_threshold NUMERIC(14,4),
    peak_window TEXT,
    notes TEXT,
    source TEXT,
    UNIQUE (tariff_type, customer_type)
);

CREATE TABLE IF NOT EXISTS pr_farmer_electricity_cost (
    id BIGSERIAL PRIMARY KEY,
    farmer_type TEXT,
    usage_description TEXT,
    tariff_type TEXT,
    rate_cents_per_kwh NUMERIC(14,4),
    daily_supply_charge_cents NUMERIC(14,4),
    peak_window TEXT,
    annual_cost_estimate_aud NUMERIC(14,4),
    notes TEXT,
    source_organisation TEXT,
    source_document TEXT,
    source_url TEXT,
    data_verified BOOLEAN,
    derived_flag BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS pr_farmer_water_cost (
    id BIGSERIAL PRIMARY KEY,
    cost_component TEXT,
    cost_category TEXT,
    trust TEXT,
    district_coverage TEXT,
    unit TEXT,
    rate_low NUMERIC(14,4),
    rate_high NUMERIC(14,4),
    minimum_charge NUMERIC(14,4),
    peak_offpeak_distinction TEXT,
    notes TEXT,
    valid_from DATE,
    valid_to DATE,
    source TEXT,
    data_verified BOOLEAN,
    derived_flag BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS ix_pr_farmer_water_cost_trust ON pr_farmer_water_cost(trust, valid_from, valid_to);

CREATE TABLE IF NOT EXISTS pr_scenario_training (
    id BIGSERIAL PRIMARY KEY,
    year INTEGER,
    region TEXT,
    crop_type TEXT,
    water_alloc_pct NUMERIC(8,3),
    water_market_price_ml NUMERIC(14,4),
    water_delivery_cost_ml NUMERIC(14,4),
    landscape_levy_ml NUMERIC(14,4),
    water_use_ml_ha NUMERIC(14,4),
    rainfall_mm_annual NUMERIC(14,4),
    max_temp_avg_c NUMERIC(14,4),
    growing_degree_days NUMERIC(14,4),
    grape_price_red_per_t NUMERIC(14,4),
    grape_price_white_per_t NUMERIC(14,4),
    yield_t_ha NUMERIC(14,4),
    input_cost_ha NUMERIC(14,4),
    water_total_cost_ha NUMERIC(14,4),
    revenue_ha NUMERIC(14,4),
    net_margin_ha NUMERIC(14,4),
    capital_investment NUMERIC(14,4),
    years_to_profit TEXT,
    scenario_label TEXT,
    data_source TEXT
);

CREATE INDEX IF NOT EXISTS ix_pr_scenario_training_year ON pr_scenario_training(year);
CREATE INDEX IF NOT EXISTS ix_pr_scenario_training_label ON pr_scenario_training(scenario_label);

CREATE TABLE IF NOT EXISTS pr_block_cost_profile (
    id BIGSERIAL PRIMARY KEY,
    block_id UUID UNIQUE NOT NULL,
    trust TEXT,
    district TEXT,
    pressure_zone TEXT,
    tariff_type TEXT,
    farmer_type TEXT,
    estimated_kwh_per_ha NUMERIC(14,4),
    derived_flag BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pr_water_scenario (
    scenario_key TEXT PRIMARY KEY,
    scenario_label TEXT NOT NULL,
    water_price_ml NUMERIC(14,4) NOT NULL,
    sort_order SMALLINT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS pr_margin_run (
    id BIGSERIAL PRIMARY KEY,
    run_type TEXT NOT NULL,
    water_source TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    notes TEXT
);

CREATE TABLE IF NOT EXISTS pr_margin_result (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES pr_margin_run(id) ON DELETE CASCADE,
    crop_id BIGINT NOT NULL REFERENCES pr_crop(id) ON DELETE CASCADE,
    scenario_key TEXT NOT NULL REFERENCES pr_water_scenario(scenario_key),
    water_price_ml NUMERIC(14,4) NOT NULL,
    farmgate_price NUMERIC(14,4) NOT NULL,
    yield_t_ha NUMERIC(14,4) NOT NULL,
    production_cost_per_unit NUMERIC(14,4) NOT NULL,
    revenue_ha NUMERIC(14,4) NOT NULL,
    production_cost_ha NUMERIC(14,4) NOT NULL,
    delivery_cost_ml NUMERIC(14,4) NOT NULL,
    market_cost_ml NUMERIC(14,4) NOT NULL,
    water_cost_ha NUMERIC(14,4) NOT NULL,
    electricity_cost_ha NUMERIC(14,4) NOT NULL,
    total_cost_ha NUMERIC(14,4) NOT NULL,
    margin_ha NUMERIC(14,4) NOT NULL,
    derived_delivery BOOLEAN NOT NULL DEFAULT FALSE,
    derived_market BOOLEAN NOT NULL DEFAULT FALSE,
    derived_electricity BOOLEAN NOT NULL DEFAULT FALSE,
    data_quality TEXT NOT NULL DEFAULT 'derived',
    confidence_score INTEGER,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_id, crop_id, scenario_key)
);

CREATE INDEX IF NOT EXISTS ix_pr_margin_result_crop ON pr_margin_result(crop_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS ix_pr_margin_result_scenario ON pr_margin_result(scenario_key, calculated_at DESC);

ALTER TABLE pr_margin_result ADD COLUMN IF NOT EXISTS data_quality TEXT NOT NULL DEFAULT 'derived';
ALTER TABLE pr_margin_result ADD COLUMN IF NOT EXISTS confidence_score INTEGER;
