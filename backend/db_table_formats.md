# Database Table Formats

Database: `agritech` (PostgreSQL)

Total tables: **37**

## blocks

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | uuid | NO |  | PK |
| user_id | uuid | YES |  | FK |
| lanslu | text | YES |  |  |
| soil_subgroup | text | YES |  |  |
| soil_class | text | YES |  |  |
| description | text | YES |  |  |
| area_ha | double precision | YES |  |  |
| crop | text | YES |  |  |
| geom | geometry | NO |  |  |

Foreign keys:
- `user_id` -> `users(id)` (ON DELETE CASCADE)

## crop_benchmarks

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | integer | NO | nextval('crop_benchmarks_id_seq'::regclass) | PK |
| crop_name | character varying | NO |  |  |
| crop_code | character varying | NO |  |  |
| water_req_ml_ha_min | double precision | YES |  |  |
| water_req_ml_ha_max | double precision | YES |  |  |
| yield_t_ha_typical | double precision | YES |  |  |
| price_per_t_2024 | double precision | YES |  |  |
| price_per_t_2025 | double precision | YES |  |  |
| price_per_t_10yr_avg | double precision | YES |  |  |
| price_per_t_crisis_low | double precision | YES |  |  |
| revenue_ha_typical | double precision | YES |  |  |
| input_cost_ha | double precision | YES |  |  |
| net_margin_ha_typical | double precision | YES |  |  |
| capital_investment_new | double precision | YES |  |  |
| years_to_first_income | double precision | YES |  |  |
| years_to_profit | character varying | YES |  |  |
| rev_per_ml_water | double precision | YES |  |  |
| risk_level | character varying | YES |  |  |
| pirsa_approved | boolean | NO | false |  |
| source | text | YES |  |  |
| raw_payload | jsonb | NO |  |  |

Foreign keys: none

## electricity_costs

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | integer | NO | nextval('electricity_costs_id_seq'::regclass) | PK |
| farmer_type | character varying | NO |  |  |
| tariff_type | character varying | NO |  |  |
| rate_cents_per_kwh | double precision | YES |  |  |
| daily_supply_charge_cents | double precision | YES |  |  |
| annual_cost_estimate_aud | character varying | YES |  |  |
| usage_description | text | YES |  |  |
| peak_window | character varying | YES |  |  |
| data_verified | text | YES |  |  |
| notes | text | YES |  |  |
| source_document | text | YES |  |  |
| source_organisation | text | YES |  |  |
| source_url | text | YES |  |  |
| raw_payload | jsonb | NO |  |  |

Foreign keys: none

## farmgate_prices

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | integer | NO | nextval('farmgate_prices_id_seq'::regclass) | PK |
| crop_key | character varying | NO |  |  |
| commodity | character varying | NO |  |  |
| variety_type | character varying | NO |  |  |
| display_name | character varying | NO |  |  |
| price_unit | character varying | YES |  |  |
| farmgate_price_low | double precision | NO |  |  |
| farmgate_price_mid | double precision | NO |  |  |
| farmgate_price_high | double precision | NO |  |  |
| price_year | character varying | YES |  |  |
| price_trend | text | YES |  |  |
| cost_of_production_raw | character varying | YES |  |  |
| cost_of_production | double precision | NO |  |  |
| cost_unit | character varying | YES |  |  |
| break_even_threshold_raw | character varying | YES |  |  |
| break_even_threshold | double precision | YES |  |  |
| profitable_unit | character varying | YES |  |  |
| cost_data_quality | text | YES |  |  |
| yield_t_ha | double precision | NO |  |  |
| water_min_ml_ha | double precision | NO |  |  |
| water_max_ml_ha | double precision | NO |  |  |
| water_usage_ml_ha | double precision | NO |  |  |
| price_source | text | YES |  |  |
| cost_source | text | YES |  |  |
| notes | text | YES |  |  |
| is_recommended | boolean | NO | true |  |
| raw_payload | jsonb | NO |  |  |
| updated_at | timestamp with time zone | NO | now() |  |

Foreign keys: none

## pr_block_cost_profile

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | bigint | NO | nextval('pr_block_cost_profile_id_seq'::regclass) | PK |
| block_id | uuid | NO |  |  |
| trust | text | YES |  |  |
| district | text | YES |  |  |
| pressure_zone | text | YES |  |  |
| tariff_type | text | YES |  |  |
| farmer_type | text | YES |  |  |
| estimated_kwh_per_ha | numeric | YES |  |  |
| derived_flag | boolean | NO | false |  |
| notes | text | YES |  |  |
| updated_at | timestamp with time zone | NO | now() |  |

Foreign keys: none

## pr_crop

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | bigint | NO | nextval('pr_crop_id_seq'::regclass) | PK |
| crop_code | text | NO |  |  |
| crop_name | text | NO |  |  |
| commodity | text | YES |  |  |
| variety_type | text | YES |  |  |
| color | text | YES |  |  |
| risk_level_reference | text | YES |  |  |
| pirsa_approved | boolean | YES |  |  |
| source | text | YES |  |  |
| created_at | timestamp with time zone | NO | now() |  |
| updated_at | timestamp with time zone | NO | now() |  |

Foreign keys: none

## pr_crop_alias

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | bigint | NO | nextval('pr_crop_alias_id_seq'::regclass) | PK |
| crop_id | bigint | NO |  | FK |
| alias_raw | text | NO |  |  |
| alias_normalized | text | NO |  |  |
| match_priority | smallint | NO | 100 |  |
| created_at | timestamp with time zone | NO | now() |  |

Foreign keys:
- `crop_id` -> `pr_crop(id)` (ON DELETE CASCADE)

## pr_crop_benchmark

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| crop_id | bigint | NO |  | PK, FK |
| water_req_ml_ha_min | numeric | YES |  |  |
| water_req_ml_ha_max | numeric | YES |  |  |
| yield_t_ha_typical | numeric | YES |  |  |
| price_per_t_2024 | numeric | YES |  |  |
| price_per_t_2025 | numeric | YES |  |  |
| price_per_t_crisis_low | numeric | YES |  |  |
| price_per_t_10yr_avg | numeric | YES |  |  |
| revenue_ha_typical | numeric | YES |  |  |
| input_cost_ha | numeric | YES |  |  |
| net_margin_ha_typical | numeric | YES |  |  |
| capital_investment_new | numeric | YES |  |  |
| years_to_first_income | numeric | YES |  |  |
| years_to_profit | text | YES |  |  |
| rev_per_ml_water | numeric | YES |  |  |
| risk_level | text | YES |  |  |
| pirsa_approved | boolean | YES |  |  |
| source | text | YES |  |  |
| updated_at | timestamp with time zone | NO | now() |  |

Foreign keys:
- `crop_id` -> `pr_crop(id)` (ON DELETE CASCADE)

## pr_dataset_registry

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| dataset_key | text | NO |  | PK |
| file_name | text | NO |  |  |
| source_type | text | NO |  |  |
| loaded_at | timestamp with time zone | NO | now() |  |
| row_count | integer | NO | 0 |  |
| checksum_sha256 | text | YES |  |  |
| notes | text | YES |  |  |

Foreign keys: none

## pr_electricity_tariff_reference

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | bigint | NO | nextval('pr_electricity_tariff_reference_id_seq'::regclass) | PK |
| tariff_type | text | NO |  |  |
| customer_type | text | YES |  |  |
| rate_cents_kwh | numeric | YES |  |  |
| daily_supply_charge_cents | numeric | YES |  |  |
| annual_kwh_threshold | numeric | YES |  |  |
| peak_window | text | YES |  |  |
| notes | text | YES |  |  |
| source | text | YES |  |  |

Foreign keys: none

## pr_farmer_electricity_cost

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | bigint | NO | nextval('pr_farmer_electricity_cost_id_seq'::regclass) | PK |
| farmer_type | text | YES |  |  |
| usage_description | text | YES |  |  |
| tariff_type | text | YES |  |  |
| rate_cents_per_kwh | numeric | YES |  |  |
| daily_supply_charge_cents | numeric | YES |  |  |
| peak_window | text | YES |  |  |
| annual_cost_estimate_aud | numeric | YES |  |  |
| notes | text | YES |  |  |
| source_organisation | text | YES |  |  |
| source_document | text | YES |  |  |
| source_url | text | YES |  |  |
| data_verified | boolean | YES |  |  |
| derived_flag | boolean | NO | false |  |

Foreign keys: none

## pr_farmer_water_cost

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | bigint | NO | nextval('pr_farmer_water_cost_id_seq'::regclass) | PK |
| cost_component | text | YES |  |  |
| cost_category | text | YES |  |  |
| trust | text | YES |  |  |
| district_coverage | text | YES |  |  |
| unit | text | YES |  |  |
| rate_low | numeric | YES |  |  |
| rate_high | numeric | YES |  |  |
| minimum_charge | numeric | YES |  |  |
| peak_offpeak_distinction | text | YES |  |  |
| notes | text | YES |  |  |
| valid_from | date | YES |  |  |
| valid_to | date | YES |  |  |
| source | text | YES |  |  |
| data_verified | boolean | YES |  |  |
| derived_flag | boolean | NO | false |  |

Foreign keys: none

## pr_farmgate_price

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | bigint | NO | nextval('pr_farmgate_price_id_seq'::regclass) | PK |
| crop_id | bigint | NO |  | FK |
| effective_date | date | NO |  |  |
| farmgate_price_low | numeric | YES |  |  |
| farmgate_price_mid | numeric | YES |  |  |
| farmgate_price_high | numeric | YES |  |  |
| break_even_price | numeric | YES |  |  |
| price_trend | text | YES |  |  |
| cost_of_production_per_unit | numeric | YES |  |  |
| yield_t_ha_typical | numeric | YES |  |  |
| water_req_ml_ha_min | numeric | YES |  |  |
| water_req_ml_ha_max | numeric | YES |  |  |
| unit_price | text | NO | 'AUD_PER_TONNE'::text |  |
| unit_yield | text | NO | 'TONNE_PER_HA'::text |  |
| unit_water | text | NO | 'ML_PER_HA'::text |  |
| source | text | YES |  |  |
| is_verified | boolean | NO | true |  |

Foreign keys:
- `crop_id` -> `pr_crop(id)` (ON DELETE CASCADE)

## pr_margin_result

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | bigint | NO | nextval('pr_margin_result_id_seq'::regclass) | PK |
| run_id | bigint | NO |  | FK |
| crop_id | bigint | NO |  | FK |
| scenario_key | text | NO |  | FK |
| water_price_ml | numeric | NO |  |  |
| farmgate_price | numeric | NO |  |  |
| yield_t_ha | numeric | NO |  |  |
| production_cost_per_unit | numeric | NO |  |  |
| revenue_ha | numeric | NO |  |  |
| production_cost_ha | numeric | NO |  |  |
| delivery_cost_ml | numeric | NO |  |  |
| market_cost_ml | numeric | NO |  |  |
| water_cost_ha | numeric | NO |  |  |
| electricity_cost_ha | numeric | NO |  |  |
| total_cost_ha | numeric | NO |  |  |
| margin_ha | numeric | NO |  |  |
| derived_delivery | boolean | NO | false |  |
| derived_market | boolean | NO | false |  |
| derived_electricity | boolean | NO | false |  |
| calculated_at | timestamp with time zone | NO | now() |  |
| data_quality | text | NO | 'derived'::text |  |
| confidence_score | integer | YES |  |  |

Foreign keys:
- `run_id` -> `pr_margin_run(id)` (ON DELETE CASCADE)
- `crop_id` -> `pr_crop(id)` (ON DELETE CASCADE)
- `scenario_key` -> `pr_water_scenario(scenario_key)` (ON DELETE NO ACTION)

## pr_margin_run

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | bigint | NO | nextval('pr_margin_run_id_seq'::regclass) | PK |
| run_type | text | NO |  |  |
| water_source | text | NO |  |  |
| started_at | timestamp with time zone | NO | now() |  |
| finished_at | timestamp with time zone | YES |  |  |
| status | text | NO | 'running'::text |  |
| notes | text | YES |  |  |

Foreign keys: none

## pr_scenario_training

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | bigint | NO | nextval('pr_scenario_training_id_seq'::regclass) | PK |
| year | integer | YES |  |  |
| region | text | YES |  |  |
| crop_type | text | YES |  |  |
| water_alloc_pct | numeric | YES |  |  |
| water_market_price_ml | numeric | YES |  |  |
| water_delivery_cost_ml | numeric | YES |  |  |
| landscape_levy_ml | numeric | YES |  |  |
| water_use_ml_ha | numeric | YES |  |  |
| rainfall_mm_annual | numeric | YES |  |  |
| max_temp_avg_c | numeric | YES |  |  |
| growing_degree_days | numeric | YES |  |  |
| grape_price_red_per_t | numeric | YES |  |  |
| grape_price_white_per_t | numeric | YES |  |  |
| yield_t_ha | numeric | YES |  |  |
| input_cost_ha | numeric | YES |  |  |
| water_total_cost_ha | numeric | YES |  |  |
| revenue_ha | numeric | YES |  |  |
| net_margin_ha | numeric | YES |  |  |
| capital_investment | numeric | YES |  |  |
| years_to_profit | text | YES |  |  |
| scenario_label | text | YES |  |  |
| data_source | text | YES |  |  |

Foreign keys: none

## pr_water_allocation_history

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| water_year | integer | NO |  | PK |
| water_year_label | text | YES |  |  |
| opening_allocation_pct | numeric | YES |  |  |
| final_allocation_pct | numeric | YES |  |  |
| carryover_allowed | boolean | YES |  |  |
| entitlement_class | text | YES |  |  |
| region | text | YES |  |  |
| notes | text | YES |  |  |
| source | text | YES |  |  |

Foreign keys: none

## pr_water_delivery_cost

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | bigint | NO | nextval('pr_water_delivery_cost_id_seq'::regclass) | PK |
| trust | text | NO |  |  |
| trust_full | text | YES |  |  |
| district | text | YES |  |  |
| pressure_zone | text | YES |  |  |
| delivery_fee_offpeak_ml | numeric | YES |  |  |
| delivery_fee_peak_ml | numeric | YES |  |  |
| service_charge_per_ha | numeric | YES |  |  |
| service_charge_min | numeric | YES |  |  |
| landscape_levy_ml | numeric | YES |  |  |
| drainage_fee_ha | numeric | YES |  |  |
| peak_window | text | YES |  |  |
| valid_from | date | YES |  |  |
| valid_to | date | YES |  |  |
| source | text | YES |  |  |
| is_verified | boolean | NO | true |  |

Foreign keys: none

## pr_water_market_history

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| water_year | integer | NO |  | PK |
| region | text | YES |  |  |
| annual_vwap_price_ml | numeric | YES |  |  |
| price_scenario | text | YES |  |  |
| data_quality | text | YES |  |  |
| source | text | YES |  |  |

Foreign keys: none

## pr_water_scenario

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| scenario_key | text | NO |  | PK |
| scenario_label | text | NO |  |  |
| water_price_ml | numeric | NO |  |  |
| sort_order | smallint | NO |  |  |
| is_default | boolean | NO | false |  |

Foreign keys: none

## pr_winegrape_price_history

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | bigint | NO | nextval('pr_winegrape_price_history_id_seq'::regclass) | PK |
| year | integer | NO |  |  |
| region | text | YES |  |  |
| crop_id | bigint | YES |  | FK |
| variety | text | YES |  |  |
| colour | text | YES |  |  |
| avg_price_per_t | numeric | YES |  |  |
| approx_crush_tonnes | numeric | YES |  |  |
| price_trend | text | YES |  |  |
| source | text | YES |  |  |

Foreign keys:
- `crop_id` -> `pr_crop(id)` (ON DELETE SET NULL)

## profit_scenarios

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | integer | NO | nextval('profit_scenarios_id_seq'::regclass) | PK |
| farmgate_price_id | integer | NO |  | FK |
| crop_key | character varying | NO |  |  |
| display_name | character varying | NO |  |  |
| commodity | character varying | NO |  |  |
| variety_type | character varying | NO |  |  |
| price_scenario | character varying | NO |  |  |
| water_scenario | character varying | NO |  |  |
| water_price_ml | double precision | NO |  |  |
| farmgate_price | double precision | NO |  |  |
| cost_of_production | double precision | NO |  |  |
| yield_t_ha | double precision | NO |  |  |
| water_usage_ml_ha | double precision | NO |  |  |
| water_cost | double precision | NO |  |  |
| revenue_per_ha | double precision | NO |  |  |
| cost_per_ha | double precision | NO |  |  |
| total_cost_per_ha | double precision | NO |  |  |
| net_margin | double precision | NO |  |  |
| revenue_per_ml | double precision | NO |  |  |
| risk_adjusted_revenue_per_ml | double precision | NO |  |  |
| risk_level | character varying | NO |  |  |
| water_efficiency_rank | integer | YES |  |  |
| is_wine_grape | boolean | NO | false |  |
| is_recommended | boolean | NO | true |  |
| updated_at | timestamp with time zone | NO | now() |  |
| cost_quality | character varying | NO | 'derived'::character varying |  |
| electricity_factor_per_ha | double precision | NO | 0 |  |
| water_trend_factor_per_ha | double precision | NO | 0 |  |

Foreign keys:
- `farmgate_price_id` -> `farmgate_prices(id)` (ON DELETE CASCADE)

## satellite_cache

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| block_id | uuid | NO |  | PK, FK |
| geometry_hash | character varying | NO |  |  |
| payload | jsonb | NO |  |  |
| data_quality | character varying | NO |  |  |
| composite_date_from | date | YES |  |  |
| composite_date_to | date | YES |  |  |
| pixel_count | integer | NO |  |  |
| gee_execution_ms | integer | YES |  |  |
| map_tile_url | text | YES |  |  |
| last_updated | timestamp with time zone | NO |  |  |
| refreshed_at | timestamp with time zone | NO |  |  |
| expires_at | timestamp with time zone | NO |  |  |

Foreign keys:
- `block_id` -> `blocks(id)` (ON DELETE CASCADE)

## satellite_refresh_events

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | integer | NO | nextval('satellite_refresh_events_id_seq'::regclass) | PK |
| block_id | uuid | NO |  | FK |
| event | character varying | NO |  |  |
| reason | character varying | NO |  |  |
| data_quality | character varying | YES |  |  |
| error | text | YES |  |  |
| latency_ms | integer | YES |  |  |
| created_at | timestamp with time zone | NO |  |  |

Foreign keys:
- `block_id` -> `blocks(id)` (ON DELETE CASCADE)

## satellite_refresh_jobs

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| block_id | uuid | NO |  | PK, FK |
| status | character varying | NO |  |  |
| reason | character varying | NO |  |  |
| priority | integer | NO |  |  |
| requested_at | timestamp with time zone | NO |  |  |
| scheduled_for | timestamp with time zone | NO |  |  |
| started_at | timestamp with time zone | YES |  |  |
| finished_at | timestamp with time zone | YES |  |  |
| attempts | integer | NO |  |  |
| last_error | text | YES |  |  |
| last_duration_ms | integer | YES |  |  |

Foreign keys:
- `block_id` -> `blocks(id)` (ON DELETE CASCADE)

## satellite_timeseries

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | integer | NO | nextval('satellite_timeseries_id_seq'::regclass) | PK |
| block_id | uuid | NO |  | FK |
| observed_on | date | NO |  |  |
| recorded_at | timestamp with time zone | NO |  |  |
| composite_date_from | date | YES |  |  |
| composite_date_to | date | YES |  |  |
| geometry_hash | character varying | NO |  |  |
| ndvi | double precision | YES |  |  |
| ndwi | double precision | YES |  |  |
| evi | double precision | YES |  |  |
| ndre | double precision | YES |  |  |
| lai | double precision | YES |  |  |
| cloud_cover_pct | double precision | YES |  |  |
| pixel_count | integer | NO |  |  |
| data_quality | character varying | NO |  |  |

Foreign keys:
- `block_id` -> `blocks(id)` (ON DELETE CASCADE)

## satellite_yield_training_data

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | integer | NO | nextval('satellite_yield_training_data_id_seq'::regclass) | PK |
| crop_type | character varying | NO |  |  |
| yield_t_ha | double precision | YES |  |  |
| lai | double precision | YES |  |  |
| ndvi | double precision | YES |  |  |
| ndwi | double precision | YES |  |  |
| ndre | double precision | YES |  |  |
| evi | double precision | YES |  |  |
| water_alloc_pct | double precision | YES |  |  |
| water_market_price_ml | double precision | YES |  |  |
| water_use_ml_ha | double precision | YES |  |  |
| rainfall_mm_annual | double precision | YES |  |  |
| max_temp_avg_c | double precision | YES |  |  |
| input_cost_ha | double precision | YES |  |  |
| scenario_label | character varying | YES |  |  |
| raw_payload | jsonb | NO |  |  |

Foreign keys: none

## scenario_training_data

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | integer | NO | nextval('scenario_training_data_id_seq'::regclass) | PK |
| year | integer | YES |  |  |
| region | character varying | YES |  |  |
| crop_type | character varying | NO |  |  |
| water_alloc_pct | double precision | YES |  |  |
| water_market_price_ml | double precision | YES |  |  |
| water_delivery_cost_ml | double precision | YES |  |  |
| landscape_levy_ml | double precision | YES |  |  |
| water_use_ml_ha | double precision | YES |  |  |
| rainfall_mm_annual | double precision | YES |  |  |
| max_temp_avg_c | double precision | YES |  |  |
| growing_degree_days | double precision | YES |  |  |
| grape_price_red_per_t | double precision | YES |  |  |
| grape_price_white_per_t | double precision | YES |  |  |
| yield_t_ha | double precision | YES |  |  |
| input_cost_ha | double precision | YES |  |  |
| water_total_cost_ha | double precision | YES |  |  |
| revenue_ha | double precision | YES |  |  |
| net_margin_ha | double precision | YES |  |  |
| capital_investment | double precision | YES |  |  |
| years_to_profit | character varying | YES |  |  |
| scenario_label | character varying | YES |  |  |
| data_source | text | YES |  |  |
| raw_payload | jsonb | NO |  |  |

Foreign keys: none

## sensor_definitions

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | uuid | NO |  | PK |
| user_id | uuid | NO |  | FK |
| block_id | uuid | NO |  | FK |
| sensor_type | character varying | NO |  |  |
| label | character varying | NO |  |  |
| unit | character varying | NO |  |  |
| threshold_low | double precision | YES |  |  |
| threshold_high | double precision | YES |  |  |
| suggested_min | double precision | YES |  |  |
| suggested_max | double precision | YES |  |  |
| is_active | boolean | NO | true |  |
| created_at | timestamp with time zone | NO | now() |  |
| updated_at | timestamp with time zone | NO | now() |  |

Foreign keys:
- `user_id` -> `users(id)` (ON DELETE CASCADE)
- `block_id` -> `blocks(id)` (ON DELETE CASCADE)

## sensor_latest

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| sensor_id | uuid | NO |  | PK, FK |
| value | double precision | NO |  |  |
| status | character varying | NO | 'Normal'::character varying |  |
| observed_at | timestamp with time zone | NO |  |  |
| updated_at | timestamp with time zone | NO | now() |  |

Foreign keys:
- `sensor_id` -> `sensor_definitions(id)` (ON DELETE CASCADE)

## sensor_readings

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | bigint | NO |  | PK |
| sensor_id | uuid | NO |  | FK |
| value | double precision | NO |  |  |
| status | character varying | NO | 'Normal'::character varying |  |
| granularity | character varying | NO | 'raw'::character varying |  |
| observed_at | timestamp with time zone | NO | now() |  |
| recorded_at | timestamp with time zone | NO | now() |  |

Foreign keys:
- `sensor_id` -> `sensor_definitions(id)` (ON DELETE CASCADE)

## spatial_ref_sys

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| srid | integer | NO |  | PK |
| auth_name | character varying | YES |  |  |
| auth_srid | integer | YES |  |  |
| srtext | character varying | YES |  |  |
| proj4text | character varying | YES |  |  |

Foreign keys: none

## users

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | uuid | NO |  | PK |
| name | text | NO |  |  |
| region | text | YES |  |  |
| council | text | YES |  |  |
| farm_name | text | YES |  |  |
| farm_location | text | YES |  |  |
| primary_crop | text | YES |  |  |
| primary_soil | text | YES |  |  |

Foreign keys: none

## water_allocation_history

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | integer | NO | nextval('water_allocation_history_id_seq'::regclass) | PK |
| water_year | character varying | NO |  |  |
| water_year_label | character varying | YES |  |  |
| region | character varying | YES |  |  |
| entitlement_class | character varying | YES |  |  |
| opening_allocation_pct | double precision | YES |  |  |
| final_allocation_pct | double precision | YES |  |  |
| carryover_allowed | character varying | YES |  |  |
| notes | text | YES |  |  |
| source | text | YES |  |  |
| raw_payload | jsonb | NO |  |  |

Foreign keys: none

## water_costs

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | integer | NO | nextval('water_costs_id_seq'::regclass) | PK |
| cost_component | character varying | NO |  |  |
| cost_category | character varying | NO |  |  |
| trust | character varying | YES |  |  |
| district_coverage | text | YES |  |  |
| unit | character varying | YES |  |  |
| rate_low | double precision | YES |  |  |
| rate_high | double precision | YES |  |  |
| minimum_charge | double precision | YES |  |  |
| peak_offpeak_distinction | character varying | YES |  |  |
| notes | text | YES |  |  |
| valid_from | date | YES |  |  |
| valid_to | date | YES |  |  |
| source | text | YES |  |  |
| raw_payload | jsonb | NO |  |  |

Foreign keys: none

## water_delivery_costs

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | integer | NO | nextval('water_delivery_costs_id_seq'::regclass) | PK |
| trust | character varying | NO |  |  |
| trust_full | character varying | YES |  |  |
| district | character varying | YES |  |  |
| pressure_zone | character varying | YES |  |  |
| service_charge_per_ha | double precision | YES |  |  |
| service_charge_min | double precision | YES |  |  |
| delivery_fee_offpeak_ml | double precision | YES |  |  |
| delivery_fee_peak_ml | double precision | YES |  |  |
| drainage_fee_ha | double precision | YES |  |  |
| landscape_levy_ml | double precision | YES |  |  |
| peak_window | character varying | YES |  |  |
| valid_from | date | YES |  |  |
| valid_to | date | YES |  |  |
| source | text | YES |  |  |
| raw_payload | jsonb | NO |  |  |

Foreign keys: none

## water_market_price_history

| Column | Type | Nullable | Default | Keys |
|---|---|---|---|---|
| id | integer | NO | nextval('water_market_price_history_id_seq'::regclass) | PK |
| water_year | character varying | NO |  |  |
| region | character varying | YES |  |  |
| annual_vwap_price_ml | double precision | YES |  |  |
| price_scenario | character varying | YES |  |  |
| data_quality | character varying | YES |  |  |
| source | text | YES |  |  |
| raw_payload | jsonb | NO |  |  |

Foreign keys: none
