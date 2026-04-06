--
-- PostgreSQL database dump
--

\restrict IgsQ7P2K6fe4pA8fTofbpwf9y8XweOxYVmSveVPggcGVYaf2aFHv41jyvr2frve

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

-- Started on 2026-04-02 18:11:43

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 16389)
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- TOC entry 6089 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- TOC entry 618 (class 1255 OID 17680)
-- Name: fn_update_sensor_latest(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_update_sensor_latest() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
                BEGIN
                    INSERT INTO sensor_latest (sensor_id, value, status, observed_at, updated_at)
                    VALUES (NEW.sensor_id, NEW.value, NEW.status, NEW.observed_at, NOW())
                    ON CONFLICT (sensor_id) DO UPDATE
                    SET
                        value = EXCLUDED.value,
                        status = EXCLUDED.status,
                        observed_at = EXCLUDED.observed_at,
                        updated_at = NOW()
                    WHERE EXCLUDED.observed_at >= sensor_latest.observed_at;

                    RETURN NEW;
                END;
                $$;


ALTER FUNCTION public.fn_update_sensor_latest() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 240 (class 1259 OID 17732)
-- Name: block_decisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.block_decisions (
    block_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    satellite_ready boolean DEFAULT false NOT NULL,
    weather_ready boolean DEFAULT false NOT NULL,
    sensors_ready boolean DEFAULT false NOT NULL,
    decision_payload jsonb,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL
);


ALTER TABLE public.block_decisions OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 17471)
-- Name: blocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.blocks (
    id uuid NOT NULL,
    user_id uuid,
    lanslu text,
    soil_subgroup text,
    soil_class text,
    description text,
    area_ha double precision,
    crop text,
    geom public.geometry(Polygon,4326) NOT NULL,
    timezone text DEFAULT 'Australia/Adelaide'::text NOT NULL
);


ALTER TABLE public.blocks OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 17761)
-- Name: crop_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.crop_config (
    crop text NOT NULL,
    optimal_moisture_min double precision,
    optimal_moisture_max double precision,
    root_depth_mm integer,
    mad double precision
);


ALTER TABLE public.crop_config OWNER TO postgres;

--
-- TOC entry 245 (class 1259 OID 17993)
-- Name: growing_opportunity_news_cache; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.growing_opportunity_news_cache (
    cache_key character varying(128) NOT NULL,
    query text NOT NULL,
    payload jsonb NOT NULL,
    warning text,
    refreshed_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE public.growing_opportunity_news_cache OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 17521)
-- Name: satellite_cache; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.satellite_cache (
    block_id uuid NOT NULL,
    geometry_hash character varying(128) NOT NULL,
    payload jsonb NOT NULL,
    data_quality character varying(32) NOT NULL,
    composite_date_from date,
    composite_date_to date,
    pixel_count integer NOT NULL,
    gee_execution_ms integer,
    map_tile_url text,
    last_updated timestamp with time zone NOT NULL,
    refreshed_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE public.satellite_cache OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 17564)
-- Name: satellite_refresh_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.satellite_refresh_events (
    id integer NOT NULL,
    block_id uuid NOT NULL,
    event character varying(32) NOT NULL,
    reason character varying(64) NOT NULL,
    data_quality character varying(32),
    error text,
    latency_ms integer,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.satellite_refresh_events OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 17563)
-- Name: satellite_refresh_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.satellite_refresh_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.satellite_refresh_events_id_seq OWNER TO postgres;

--
-- TOC entry 6090 (class 0 OID 0)
-- Dependencies: 229
-- Name: satellite_refresh_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.satellite_refresh_events_id_seq OWNED BY public.satellite_refresh_events.id;


--
-- TOC entry 228 (class 1259 OID 17543)
-- Name: satellite_refresh_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.satellite_refresh_jobs (
    block_id uuid NOT NULL,
    status character varying(32) NOT NULL,
    reason character varying(64) NOT NULL,
    priority integer NOT NULL,
    requested_at timestamp with time zone NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    attempts integer NOT NULL,
    last_error text,
    last_duration_ms integer
);


ALTER TABLE public.satellite_refresh_jobs OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 17585)
-- Name: satellite_timeseries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.satellite_timeseries (
    id integer NOT NULL,
    block_id uuid NOT NULL,
    observed_on date NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    composite_date_from date,
    composite_date_to date,
    geometry_hash character varying(128) NOT NULL,
    ndvi double precision,
    ndwi double precision,
    evi double precision,
    ndre double precision,
    lai double precision,
    cloud_cover_pct double precision,
    pixel_count integer NOT NULL,
    data_quality character varying(32) NOT NULL
);


ALTER TABLE public.satellite_timeseries OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 17584)
-- Name: satellite_timeseries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.satellite_timeseries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.satellite_timeseries_id_seq OWNER TO postgres;

--
-- TOC entry 6091 (class 0 OID 0)
-- Dependencies: 231
-- Name: satellite_timeseries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.satellite_timeseries_id_seq OWNED BY public.satellite_timeseries.id;


--
-- TOC entry 233 (class 1259 OID 17605)
-- Name: sensor_definitions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sensor_definitions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    block_id uuid NOT NULL,
    sensor_type character varying(64) NOT NULL,
    label character varying(128) NOT NULL,
    unit character varying(16) NOT NULL,
    threshold_low double precision,
    threshold_high double precision,
    suggested_min double precision,
    suggested_max double precision,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_sensor_definitions_sensor_type CHECK (((sensor_type)::text = ANY ((ARRAY['soil_moisture'::character varying, 'soil_temperature'::character varying, 'air_temperature'::character varying, 'humidity'::character varying, 'ph_level'::character varying])::text[])))
);


ALTER TABLE public.sensor_definitions OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 17663)
-- Name: sensor_latest; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sensor_latest (
    sensor_id uuid NOT NULL,
    value double precision NOT NULL,
    status character varying(16) DEFAULT 'Normal'::character varying NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sensor_latest OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 17638)
-- Name: sensor_readings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sensor_readings (
    id bigint NOT NULL,
    sensor_id uuid NOT NULL,
    value double precision NOT NULL,
    status character varying(16) DEFAULT 'Normal'::character varying NOT NULL,
    granularity character varying(16) DEFAULT 'raw'::character varying NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_sensor_readings_granularity CHECK (((granularity)::text = ANY ((ARRAY['raw'::character varying, 'hourly'::character varying, 'daily'::character varying, 'weekly'::character varying])::text[]))),
    CONSTRAINT ck_sensor_readings_status CHECK (((status)::text = ANY ((ARRAY['Normal'::character varying, 'High'::character varying, 'Low'::character varying])::text[])))
);


ALTER TABLE public.sensor_readings OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 17637)
-- Name: sensor_readings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.sensor_readings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sensor_readings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 244 (class 1259 OID 17921)
-- Name: soil_class_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.soil_class_config (
    code text NOT NULL,
    series text NOT NULL,
    label text NOT NULL,
    irrigation_factor double precision NOT NULL,
    field_capacity double precision NOT NULL,
    wilting_point double precision NOT NULL,
    drainage_class text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.soil_class_config OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 17898)
-- Name: soil_reference; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.soil_reference (
    id integer NOT NULL,
    region text NOT NULL,
    lanslu text NOT NULL,
    soil_subgroup text,
    shape_area double precision,
    shape_length double precision,
    primary_soil_classification text,
    primary_soil_value integer,
    secondary_soil_classification text,
    secondary_soil_value integer,
    tertiary_soil_classification text,
    tertiary_soil_value integer,
    total_soil_classifications_count integer,
    total_soil_classification_value integer,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.soil_reference OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 17897)
-- Name: soil_reference_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.soil_reference_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.soil_reference_id_seq OWNER TO postgres;

--
-- TOC entry 6092 (class 0 OID 0)
-- Dependencies: 242
-- Name: soil_reference_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.soil_reference_id_seq OWNED BY public.soil_reference.id;


--
-- TOC entry 237 (class 1259 OID 17682)
-- Name: unified_farm_state; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.unified_farm_state AS
 SELECT b.id AS block_id,
    max(
        CASE
            WHEN ((sd.sensor_type)::text = 'soil_moisture'::text) THEN sl.value
            ELSE NULL::double precision
        END) AS soil_moisture,
    max(
        CASE
            WHEN ((sd.sensor_type)::text = 'soil_temperature'::text) THEN sl.value
            ELSE NULL::double precision
        END) AS soil_temperature,
    max(
        CASE
            WHEN ((sd.sensor_type)::text = 'air_temperature'::text) THEN sl.value
            ELSE NULL::double precision
        END) AS air_temperature,
    max(
        CASE
            WHEN ((sd.sensor_type)::text = 'humidity'::text) THEN sl.value
            ELSE NULL::double precision
        END) AS humidity,
    max(
        CASE
            WHEN ((sd.sensor_type)::text = 'ph_level'::text) THEN sl.value
            ELSE NULL::double precision
        END) AS ph_level,
    ((sc.payload ->> 'ndvi'::text))::double precision AS ndvi,
    ((sc.payload ->> 'ndwi'::text))::double precision AS ndwi,
    ((sc.payload ->> 'evi'::text))::double precision AS evi,
    ((sc.payload ->> 'lai'::text))::double precision AS lai,
    sc.data_quality,
    sc.composite_date_to
   FROM (((public.blocks b
     LEFT JOIN public.sensor_definitions sd ON ((sd.block_id = b.id)))
     LEFT JOIN public.sensor_latest sl ON ((sl.sensor_id = sd.id)))
     LEFT JOIN public.satellite_cache sc ON ((sc.block_id = b.id)))
  GROUP BY b.id, sc.payload, sc.data_quality, sc.composite_date_to;


ALTER VIEW public.unified_farm_state OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 17490)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    name text NOT NULL,
    region text,
    council text,
    farm_name text,
    farm_location text,
    primary_crop text,
    primary_soil text
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 17688)
-- Name: weather_timeseries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.weather_timeseries (
    id integer NOT NULL,
    block_id uuid NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    temperature double precision,
    humidity double precision,
    precipitation double precision,
    source character varying(32) DEFAULT 'open-meteo'::character varying,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.weather_timeseries OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 17687)
-- Name: weather_timeseries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.weather_timeseries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.weather_timeseries_id_seq OWNER TO postgres;

--
-- TOC entry 6093 (class 0 OID 0)
-- Dependencies: 238
-- Name: weather_timeseries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.weather_timeseries_id_seq OWNED BY public.weather_timeseries.id;


--
-- TOC entry 5835 (class 2604 OID 17567)
-- Name: satellite_refresh_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_refresh_events ALTER COLUMN id SET DEFAULT nextval('public.satellite_refresh_events_id_seq'::regclass);


--
-- TOC entry 5836 (class 2604 OID 17588)
-- Name: satellite_timeseries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_timeseries ALTER COLUMN id SET DEFAULT nextval('public.satellite_timeseries_id_seq'::regclass);


--
-- TOC entry 5854 (class 2604 OID 17901)
-- Name: soil_reference id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.soil_reference ALTER COLUMN id SET DEFAULT nextval('public.soil_reference_id_seq'::regclass);


--
-- TOC entry 5846 (class 2604 OID 17691)
-- Name: weather_timeseries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weather_timeseries ALTER COLUMN id SET DEFAULT nextval('public.weather_timeseries_id_seq'::regclass);


--
-- TOC entry 5902 (class 2606 OID 17749)
-- Name: block_decisions block_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.block_decisions
    ADD CONSTRAINT block_decisions_pkey PRIMARY KEY (block_id);


--
-- TOC entry 5865 (class 2606 OID 17498)
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);


--
-- TOC entry 5905 (class 2606 OID 17768)
-- Name: crop_config crop_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.crop_config
    ADD CONSTRAINT crop_config_pkey PRIMARY KEY (crop);


--
-- TOC entry 5916 (class 2606 OID 18005)
-- Name: growing_opportunity_news_cache growing_opportunity_news_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.growing_opportunity_news_cache
    ADD CONSTRAINT growing_opportunity_news_cache_pkey PRIMARY KEY (cache_key);


--
-- TOC entry 5872 (class 2606 OID 17535)
-- Name: satellite_cache satellite_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_cache
    ADD CONSTRAINT satellite_cache_pkey PRIMARY KEY (block_id);


--
-- TOC entry 5879 (class 2606 OID 17576)
-- Name: satellite_refresh_events satellite_refresh_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_refresh_events
    ADD CONSTRAINT satellite_refresh_events_pkey PRIMARY KEY (id);


--
-- TOC entry 5875 (class 2606 OID 17556)
-- Name: satellite_refresh_jobs satellite_refresh_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_refresh_jobs
    ADD CONSTRAINT satellite_refresh_jobs_pkey PRIMARY KEY (block_id);


--
-- TOC entry 5883 (class 2606 OID 17597)
-- Name: satellite_timeseries satellite_timeseries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_timeseries
    ADD CONSTRAINT satellite_timeseries_pkey PRIMARY KEY (id);


--
-- TOC entry 5887 (class 2606 OID 17622)
-- Name: sensor_definitions sensor_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_definitions
    ADD CONSTRAINT sensor_definitions_pkey PRIMARY KEY (id);


--
-- TOC entry 5895 (class 2606 OID 17674)
-- Name: sensor_latest sensor_latest_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_latest
    ADD CONSTRAINT sensor_latest_pkey PRIMARY KEY (sensor_id);


--
-- TOC entry 5893 (class 2606 OID 17655)
-- Name: sensor_readings sensor_readings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_readings
    ADD CONSTRAINT sensor_readings_pkey PRIMARY KEY (id);


--
-- TOC entry 5914 (class 2606 OID 17935)
-- Name: soil_class_config soil_class_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.soil_class_config
    ADD CONSTRAINT soil_class_config_pkey PRIMARY KEY (code);


--
-- TOC entry 5910 (class 2606 OID 17911)
-- Name: soil_reference soil_reference_lanslu_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.soil_reference
    ADD CONSTRAINT soil_reference_lanslu_key UNIQUE (lanslu);


--
-- TOC entry 5912 (class 2606 OID 17909)
-- Name: soil_reference soil_reference_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.soil_reference
    ADD CONSTRAINT soil_reference_pkey PRIMARY KEY (id);


--
-- TOC entry 5889 (class 2606 OID 17624)
-- Name: sensor_definitions uq_sensor_definitions_block_sensor_type; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_definitions
    ADD CONSTRAINT uq_sensor_definitions_block_sensor_type UNIQUE (block_id, sensor_type);


--
-- TOC entry 5898 (class 2606 OID 17705)
-- Name: weather_timeseries uq_weather; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weather_timeseries
    ADD CONSTRAINT uq_weather UNIQUE (block_id, observed_at);


--
-- TOC entry 5868 (class 2606 OID 17502)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5900 (class 2606 OID 17698)
-- Name: weather_timeseries weather_timeseries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weather_timeseries
    ADD CONSTRAINT weather_timeseries_pkey PRIMARY KEY (id);


--
-- TOC entry 5866 (class 1259 OID 17503)
-- Name: idx_blocks_geom; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_blocks_geom ON public.blocks USING gist (geom);


--
-- TOC entry 5906 (class 1259 OID 17912)
-- Name: idx_soil_reference_lanslu; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_soil_reference_lanslu ON public.soil_reference USING btree (lanslu);


--
-- TOC entry 5907 (class 1259 OID 17913)
-- Name: idx_soil_reference_region; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_soil_reference_region ON public.soil_reference USING btree (region);


--
-- TOC entry 5908 (class 1259 OID 17914)
-- Name: idx_soil_reference_subgroup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_soil_reference_subgroup ON public.soil_reference USING btree (soil_subgroup);


--
-- TOC entry 5896 (class 1259 OID 17706)
-- Name: idx_weather_block_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_weather_block_time ON public.weather_timeseries USING btree (block_id, observed_at DESC);


--
-- TOC entry 5903 (class 1259 OID 17755)
-- Name: ix_block_decisions_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_block_decisions_created_at ON public.block_decisions USING btree (created_at);


--
-- TOC entry 5917 (class 1259 OID 18007)
-- Name: ix_growing_opportunity_news_cache_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_growing_opportunity_news_cache_expires_at ON public.growing_opportunity_news_cache USING btree (expires_at);


--
-- TOC entry 5918 (class 1259 OID 18006)
-- Name: ix_growing_opportunity_news_cache_refreshed_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_growing_opportunity_news_cache_refreshed_at ON public.growing_opportunity_news_cache USING btree (refreshed_at);


--
-- TOC entry 5869 (class 1259 OID 17542)
-- Name: ix_satellite_cache_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_cache_expires_at ON public.satellite_cache USING btree (expires_at);


--
-- TOC entry 5870 (class 1259 OID 17541)
-- Name: ix_satellite_cache_last_updated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_cache_last_updated ON public.satellite_cache USING btree (last_updated);


--
-- TOC entry 5876 (class 1259 OID 17582)
-- Name: ix_satellite_refresh_events_block_id_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_refresh_events_block_id_id ON public.satellite_refresh_events USING btree (block_id, id);


--
-- TOC entry 5877 (class 1259 OID 17583)
-- Name: ix_satellite_refresh_events_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_refresh_events_created_at ON public.satellite_refresh_events USING btree (created_at);


--
-- TOC entry 5873 (class 1259 OID 17562)
-- Name: ix_satellite_refresh_jobs_status_scheduled_for; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_refresh_jobs_status_scheduled_for ON public.satellite_refresh_jobs USING btree (status, scheduled_for);


--
-- TOC entry 5880 (class 1259 OID 17603)
-- Name: ix_satellite_timeseries_block_observed_on; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_timeseries_block_observed_on ON public.satellite_timeseries USING btree (block_id, observed_on);


--
-- TOC entry 5881 (class 1259 OID 17604)
-- Name: ix_satellite_timeseries_block_recorded_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_timeseries_block_recorded_at ON public.satellite_timeseries USING btree (block_id, recorded_at);


--
-- TOC entry 5884 (class 1259 OID 17636)
-- Name: ix_sensor_definitions_block_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_sensor_definitions_block_id ON public.sensor_definitions USING btree (block_id);


--
-- TOC entry 5885 (class 1259 OID 17635)
-- Name: ix_sensor_definitions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_sensor_definitions_user_id ON public.sensor_definitions USING btree (user_id);


--
-- TOC entry 5890 (class 1259 OID 17661)
-- Name: ix_sensor_readings_raw_recent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_sensor_readings_raw_recent ON public.sensor_readings USING btree (sensor_id, observed_at) WHERE ((granularity)::text = 'raw'::text);


--
-- TOC entry 5891 (class 1259 OID 17662)
-- Name: ix_sensor_readings_sensor_granularity_observed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_sensor_readings_sensor_granularity_observed ON public.sensor_readings USING btree (sensor_id, granularity, observed_at);


--
-- TOC entry 5930 (class 2620 OID 18011)
-- Name: sensor_readings trg_sensor_latest; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sensor_latest AFTER INSERT ON public.sensor_readings FOR EACH ROW EXECUTE FUNCTION public.fn_update_sensor_latest();


--
-- TOC entry 5929 (class 2606 OID 17750)
-- Name: block_decisions block_decisions_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.block_decisions
    ADD CONSTRAINT block_decisions_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- TOC entry 5919 (class 2606 OID 17505)
-- Name: blocks blocks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5920 (class 2606 OID 17536)
-- Name: satellite_cache satellite_cache_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_cache
    ADD CONSTRAINT satellite_cache_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- TOC entry 5922 (class 2606 OID 17577)
-- Name: satellite_refresh_events satellite_refresh_events_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_refresh_events
    ADD CONSTRAINT satellite_refresh_events_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- TOC entry 5921 (class 2606 OID 17557)
-- Name: satellite_refresh_jobs satellite_refresh_jobs_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_refresh_jobs
    ADD CONSTRAINT satellite_refresh_jobs_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- TOC entry 5923 (class 2606 OID 17598)
-- Name: satellite_timeseries satellite_timeseries_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_timeseries
    ADD CONSTRAINT satellite_timeseries_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- TOC entry 5924 (class 2606 OID 17630)
-- Name: sensor_definitions sensor_definitions_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_definitions
    ADD CONSTRAINT sensor_definitions_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- TOC entry 5925 (class 2606 OID 17625)
-- Name: sensor_definitions sensor_definitions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_definitions
    ADD CONSTRAINT sensor_definitions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5927 (class 2606 OID 17675)
-- Name: sensor_latest sensor_latest_sensor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_latest
    ADD CONSTRAINT sensor_latest_sensor_id_fkey FOREIGN KEY (sensor_id) REFERENCES public.sensor_definitions(id) ON DELETE CASCADE;


--
-- TOC entry 5926 (class 2606 OID 17656)
-- Name: sensor_readings sensor_readings_sensor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_readings
    ADD CONSTRAINT sensor_readings_sensor_id_fkey FOREIGN KEY (sensor_id) REFERENCES public.sensor_definitions(id) ON DELETE CASCADE;


--
-- TOC entry 5928 (class 2606 OID 17699)
-- Name: weather_timeseries weather_timeseries_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weather_timeseries
    ADD CONSTRAINT weather_timeseries_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


-- Completed on 2026-04-02 18:11:43

--
-- PostgreSQL database dump complete
--

\unrestrict IgsQ7P2K6fe4pA8fTofbpwf9y8XweOxYVmSveVPggcGVYaf2aFHv41jyvr2frve

