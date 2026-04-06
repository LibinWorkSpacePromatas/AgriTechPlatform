--
-- PostgreSQL database dump
--

\restrict nxJazp0C0Ch1E8SAcwWPxL5mctI2cdx3JyIiNXPm07XvWp1vv6YTYvKmxgoVyjx

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

-- Started on 2026-03-27 11:10:19

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
-- TOC entry 2 (class 3079 OID 17516)
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- TOC entry 6033 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- TOC entry 471 (class 1255 OID 41037)
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
-- TOC entry 226 (class 1259 OID 18607)
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
    geom public.geometry(Polygon,4326) NOT NULL
);


ALTER TABLE public.blocks OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 24596)
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
-- TOC entry 232 (class 1259 OID 32769)
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
-- TOC entry 231 (class 1259 OID 32768)
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
-- TOC entry 6034 (class 0 OID 0)
-- Dependencies: 231
-- Name: satellite_refresh_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.satellite_refresh_events_id_seq OWNED BY public.satellite_refresh_events.id;


--
-- TOC entry 228 (class 1259 OID 24618)
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
-- TOC entry 230 (class 1259 OID 24639)
-- Name: satellite_timeseries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.satellite_timeseries (
    id integer NOT NULL,
    block_id uuid NOT NULL,
    observed_on date NOT NULL,
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
    data_quality character varying(32) NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.satellite_timeseries OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 24638)
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
-- TOC entry 6035 (class 0 OID 0)
-- Dependencies: 229
-- Name: satellite_timeseries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.satellite_timeseries_id_seq OWNED BY public.satellite_timeseries.id;


--
-- TOC entry 233 (class 1259 OID 40962)
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
-- TOC entry 236 (class 1259 OID 41020)
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
-- TOC entry 235 (class 1259 OID 40995)
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
-- TOC entry 234 (class 1259 OID 40994)
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
-- TOC entry 225 (class 1259 OID 18598)
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
-- TOC entry 5806 (class 2604 OID 32772)
-- Name: satellite_refresh_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_refresh_events ALTER COLUMN id SET DEFAULT nextval('public.satellite_refresh_events_id_seq'::regclass);


--
-- TOC entry 5804 (class 2604 OID 24642)
-- Name: satellite_timeseries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_timeseries ALTER COLUMN id SET DEFAULT nextval('public.satellite_timeseries_id_seq'::regclass);


--
-- TOC entry 6017 (class 0 OID 18607)
-- Dependencies: 226
-- Data for Name: blocks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.blocks (id, user_id, lanslu, soil_subgroup, soil_class, description, area_ha, crop, geom) FROM stdin;
e9732f6b-d0f9-4ee8-b068-6b79518ec79b	11111111-1111-1111-1111-111111111111	BCPKFB	\N	\N		0.6944421220134944	Shiraz	0103000020E61000000100000005000000C310397DBDFA6040323A2009FBAE40C05F29CB10C7FA6040B64C86E3F9AE40C05F29CB10C7FA604071AAB5300BAF40C04CE0D6DDBCFA60403410CB660EAF40C0C310397DBDFA6040323A2009FBAE40C0
f4cf6f9d-bbe8-44f4-a98f-5a94f9adf710	77777777-7777-7777-7777-777777777777	CLARE-B1	\N	\N		0.814	Shiraz	0103000020E61000000100000005000000C310397DBDFA6040323A2009FBAE40C05F29CB10C7FA6040B64C86E3F9AE40C05F29CB10C7FA604071AAB5300BAF40C04CE0D6DDBCFA60403410CB660EAF40C0C310397DBDFA6040323A2009FBAE40C0
\.


--
-- TOC entry 6018 (class 0 OID 24596)
-- Dependencies: 227
-- Data for Name: satellite_cache; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.satellite_cache (block_id, geometry_hash, payload, data_quality, composite_date_from, composite_date_to, pixel_count, gee_execution_ms, map_tile_url, last_updated, refreshed_at, expires_at) FROM stdin;
e9732f6b-d0f9-4ee8-b068-6b79518ec79b	9cab36daa896019d0dbd55e27c041263e8df0a0366b5fc3f4180a188a0850ca0	{"evi": 0.2048, "lai": 5.6165, "ndre": 0.2866, "ndvi": 0.3645, "ndwi": -0.4422, "source": "real", "block_id": "e9732f6b-d0f9-4ee8-b068-6b79518ec79b", "pixel_count": 104, "data_quality": "good", "map_tile_url": "https://earthengine.googleapis.com/v1/projects/agritech-gee/maps/471a71d987faf58e86b12fbb9c88f060-0ecaa08af1de5abc8a844c2e6d55a5ce/tiles/{z}/{x}/{y}", "map_tile_type": "ndwi", "cloud_cover_pct": 0.08, "freshness_status": "fresh", "search_window_to": "2026-03-27", "composite_date_to": "2026-03-22", "search_window_from": "2026-03-13", "composite_date_from": "2026-03-07", "acquisition_metadata": {"image_count": 2, "actual_dates": ["2026-03-07", "2026-03-22"]}, "last_satellite_update": "2026-03-22"}	good	2026-03-07	2026-03-22	104	5805	https://earthengine.googleapis.com/v1/projects/agritech-gee/maps/471a71d987faf58e86b12fbb9c88f060-0ecaa08af1de5abc8a844c2e6d55a5ce/tiles/{z}/{x}/{y}	2026-03-27 10:58:42.563201+05:30	2026-03-27 10:58:42.563201+05:30	2026-04-01 10:58:42.563201+05:30
\.


--
-- TOC entry 6023 (class 0 OID 32769)
-- Dependencies: 232
-- Data for Name: satellite_refresh_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.satellite_refresh_events (id, block_id, event, reason, data_quality, error, latency_ms, created_at) FROM stdin;
250	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	queued	api_request	\N	\N	\N	2026-03-23 15:45:51.049153+05:30
251	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	running	worker_started	\N	\N	\N	2026-03-23 15:45:51.802059+05:30
252	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	completed	refresh_completed	good	\N	4791	2026-03-23 15:45:56.661475+05:30
253	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	queued	api_request	\N	\N	\N	2026-03-23 15:47:08.038235+05:30
254	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	running	worker_started	\N	\N	\N	2026-03-23 15:47:08.497289+05:30
255	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	completed	refresh_completed	good	\N	2352	2026-03-23 15:47:10.86154+05:30
256	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	queued	scheduled	\N	\N	\N	2026-03-23 15:53:19.850681+05:30
257	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	running	worker_started	\N	\N	\N	2026-03-23 15:53:20.149884+05:30
258	e9732f6b-d0f9-4ee8-b06
\.


--
-- TOC entry 6019 (class 0 OID 24618)
-- Dependencies: 228
-- Data for Name: satellite_refresh_jobs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.satellite_refresh_jobs (block_id, status, reason, priority, requested_at, scheduled_for, started_at, finished_at, attempts, last_error, last_duration_ms) FROM stdin;
e9732f6b-d0f9-4ee8-b068-6b79518ec79b	idle	scheduled	100	2026-03-27 10:58:33.006597+05:30	2026-03-27 10:58:33.006597+05:30	2026-03-27 10:58:33.29935+05:30	2026-03-27 10:58:42.571156+05:30	169	\N	9270
\.


--
-- TOC entry 6021 (class 0 OID 24639)
-- Dependencies: 230
-- Data for Name: satellite_timeseries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.satellite_timeseries (id, block_id, observed_on, composite_date_from, composite_date_to, geometry_hash, ndvi, ndwi, evi, ndre, lai, cloud_cover_pct, pixel_count, data_quality, recorded_at) FROM stdin;
229	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	2026-03-22	2026-03-07	2026-03-22	9cab36daa896019d0dbd55e27c041263e8df0a0366b5fc3f4180a188a0850ca0	0.3645	-0.4422	0.2048	0.2866	5.6165	0.08	104	good	2026-03-26 17:29:22.907294+05:30
230	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	2025-12-27	2025-12-22	2025-12-27	9cab36daa896019d0dbd55e27c041263e8df0a0366b5fc3f4180a188a0850ca0	0.296	-0.3842	0.1799	0.2167	4.6222	1.21	104	good	2026-01-02 17:30:00+05:30
231	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	2026-01-06	2025-12-27	2026-01-06	9cab36daa896019d0dbd55e27c041263e8df0a0366b5fc3f4180a188a0850ca0	0.3006	-0.3896	0.181	0.2222	4.6838	0	104	good	2026-01-09 17:30:00+05:30
232	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	2026-01-11	2026-01-06	2026-01-11	9cab36daa896019d0dbd55e27c041263e8df0a0366b5fc3f4180a188a0850ca0	0.2993	-0.3895	0.1795	0.2219	4.668	1.86	104	good	2026-01-16 17:30:00+05:30
233	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	2026-01-26	2026-01-11	2026-01-26	9cab36daa896019d0dbd55e27c041263e8df0a0366b5fc3f4180a188a0850ca0	0.2984	-0.3856	0.178	0.2369	4.6552	1.87	104	good	2026-01-30 17:30:00+05:30
234	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	2026-02-05	2026-01-26	2026-02-05	9cab36daa896019d0dbd55e27c041263e8df0a0366b5fc3f4180a188a0850ca0	0.3037	-0.3911	0.1828	0.2384	4.7268	5.48	104	good	2026-02-06 17:30:00+05:30
235	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	2026-02-10	2026-02-05	2026-02-10	9cab36daa896019d0dbd55e27c041263e8df0a0366b5fc3f4180a188a0850ca0	0.3075	-0.3998	0.1787	0.2383	4.7782	5.47	104	good	2026-02-13 17:30:00+05:30
236	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	2026-02-25	2026-02-10	2026-02-25	9cab36daa896019d0dbd55e27c041263e8df0a0366b5fc3f4180a188a0850ca0	0.3206	-0.4144	0.1782	0.2529	4.9632	0.03	104	good	2026-02-27 17:30:00+05:30
237	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	2026-03-07	2026-02-25	2026-03-07	9cab36daa896019d0dbd55e27c041263e8df0a0366b5fc3f4180a188a0850ca0	0.3456	-0.4301	0.1959	0.2755	5.3282	0.11	104	good	2026-03-13 17:30:00+05:30
\.


--
-- TOC entry 6024 (class 0 OID 40962)
-- Dependencies: 233
-- Data for Name: sensor_definitions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sensor_definitions (id, user_id, block_id, sensor_type, label, unit, threshold_low, threshold_high, suggested_min, suggested_max, is_active, created_at, updated_at) FROM stdin;
53335f0a-63e3-4552-8e55-7fc1a8f71e17	11111111-1111-1111-1111-111111111111	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	soil_moisture	Soil Moisture	%	20	80	0	100	t	2026-03-26 16:43:52.50093+05:30	2026-03-26 16:43:52.50093+05:30
e5a0b376-9e0d-49a6-9198-b1d102ad7399	11111111-1111-1111-1111-111111111111	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	soil_temperature	Soil Temperature	C	10	30	0	40	t	2026-03-26 16:43:52.50093+05:30	2026-03-26 16:43:52.50093+05:30
326a3111-3b38-4f22-858f-c9ae299356ad	11111111-1111-1111-1111-111111111111	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	air_temperature	Air Temperature	C	15	35	0	50	t	2026-03-26 16:43:52.50093+05:30	2026-03-26 16:43:52.50093+05:30
9a24b708-1cdc-4805-9548-aa020fa4c124	11111111-1111-1111-1111-111111111111	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	humidity	Humidity	%	20	80	0	100	t	2026-03-26 16:43:52.50093+05:30	2026-03-26 16:43:52.50093+05:30
66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	11111111-1111-1111-1111-111111111111	e9732f6b-d0f9-4ee8-b068-6b79518ec79b	ph_level	pH Level		5	8	0	14	t	2026-03-26 16:43:52.50093+05:30	2026-03-26 16:43:52.50093+05:30
\.


--
-- TOC entry 6027 (class 0 OID 41020)
-- Dependencies: 236
-- Data for Name: sensor_latest; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sensor_latest (sensor_id, value, status, observed_at, updated_at) FROM stdin;
53335f0a-63e3-4552-8e55-7fc1a8f71e17	27	Normal	2026-03-27 11:02:31.980908+05:30	2026-03-27 11:02:31.966928+05:30
e5a0b376-9e0d-49a6-9198-b1d102ad7399	21.4	Normal	2026-03-27 11:02:31.980908+05:30	2026-03-27 11:02:31.966928+05:30
326a3111-3b38-4f22-858f-c9ae299356ad	27.9	Normal	2026-03-27 11:02:31.980908+05:30	2026-03-27 11:02:31.966928+05:30
9a24b708-1cdc-4805-9548-aa020fa4c124	40.8	Normal	2026-03-27 11:02:31.980908+05:30	2026-03-27 11:02:31.966928+05:30
66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.3	Normal	2026-03-27 11:02:31.980908+05:30	2026-03-27 11:02:31.966928+05:30
\.


--
-- TOC entry 6026 (class 0 OID 40995)
-- Dependencies: 235
-- Data for Name: sensor_readings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sensor_readings (id, sensor_id, value, status, granularity, observed_at, recorded_at) FROM stdin;
1	53335f0a-63e3-4552-8e55-7fc1a8f71e17	30.3	Normal	hourly	2026-03-25 17:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
2	53335f0a-63e3-4552-8e55-7fc1a8f71e17	31.3	Normal	hourly	2026-03-25 18:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
3	53335f0a-63e3-4552-8e55-7fc1a8f71e17	32.2	Normal	hourly	2026-03-25 19:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
4	53335f0a-63e3-4552-8e55-7fc1a8f71e17	31.1	Normal	hourly	2026-03-25 20:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
5	53335f0a-63e3-4552-8e55-7fc1a8f71e17	30	Normal	hourly	2026-03-25 21:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
6	53335f0a-63e3-4552-8e55-7fc1a8f71e17	29	Normal	hourly	2026-03-25 22:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
7	53335f0a-63e3-4552-8e55-7fc1a8f71e17	28.1	Normal	hourly	2026-03-25 23:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
8	53335f0a-63e3-4552-8e55-7fc1a8f71e17	28.2	Normal	hourly	2026-03-26 00:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
9	53335f0a-63e3-4552-8e55-7fc1a8f71e17	29.3	Normal	hourly	2026-03-26 01:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
10	53335f0a-63e3-4552-8e55-7fc1a8f71e17	30.2	Normal	hourly	2026-03-26 02:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
11	53335f0a-63e3-4552-8e55-7fc1a8f71e17	32.1	Normal	hourly	2026-03-26 03:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
12	53335f0a-63e3-4552-8e55-7fc1a8f71e17	35	Normal	hourly	2026-03-26 04:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
13	53335f0a-63e3-4552-8e55-7fc1a8f71e17	38	Normal	hourly	2026-03-26 05:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
14	53335f0a-63e3-4552-8e55-7fc1a8f71e17	40.1	Normal	hourly	2026-03-26 06:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
15	53335f0a-63e3-4552-8e55-7fc1a8f71e17	42.2	Normal	hourly	2026-03-26 07:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
16	53335f0a-63e3-4552-8e55-7fc1a8f71e17	41.3	Normal	hourly	2026-03-26 08:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
17	53335f0a-63e3-4552-8e55-7fc1a8f71e17	39.3	Normal	hourly	2026-03-26 09:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
18	53335f0a-63e3-4552-8e55-7fc1a8f71e17	37.2	Normal	hourly	2026-03-26 10:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
19	53335f0a-63e3-4552-8e55-7fc1a8f71e17	35.1	Normal	hourly	2026-03-26 11:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
20	53335f0a-63e3-4552-8e55-7fc1a8f71e17	34	Normal	hourly	2026-03-26 12:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
21	53335f0a-63e3-4552-8e55-7fc1a8f71e17	33.1	Normal	hourly	2026-03-26 13:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
22	53335f0a-63e3-4552-8e55-7fc1a8f71e17	32.2	Normal	hourly	2026-03-26 14:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
23	53335f0a-63e3-4552-8e55-7fc1a8f71e17	32.3	Normal	hourly	2026-03-26 15:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
24	53335f0a-63e3-4552-8e55-7fc1a8f71e17	27.1	Normal	hourly	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
25	53335f0a-63e3-4552-8e55-7fc1a8f71e17	35.3	Normal	daily	2026-03-20 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
26	53335f0a-63e3-4552-8e55-7fc1a8f71e17	34.3	Normal	daily	2026-03-21 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
27	53335f0a-63e3-4552-8e55-7fc1a8f71e17	38.2	Normal	daily	2026-03-22 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
28	53335f0a-63e3-4552-8e55-7fc1a8f71e17	42.1	Normal	daily	2026-03-23 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
29	53335f0a-63e3-4552-8e55-7fc1a8f71e17	40	Normal	daily	2026-03-24 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
30	53335f0a-63e3-4552-8e55-7fc1a8f71e17	36	Normal	daily	2026-03-25 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
31	53335f0a-63e3-4552-8e55-7fc1a8f71e17	27.1	Normal	daily	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
32	53335f0a-63e3-4552-8e55-7fc1a8f71e17	45.3	Normal	weekly	2026-03-05 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
33	53335f0a-63e3-4552-8e55-7fc1a8f71e17	40.4	Normal	weekly	2026-03-12 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
34	53335f0a-63e3-4552-8e55-7fc1a8f71e17	38.2	Normal	weekly	2026-03-19 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
35	53335f0a-63e3-4552-8e55-7fc1a8f71e17	27.1	Normal	weekly	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
36	e5a0b376-9e0d-49a6-9198-b1d102ad7399	12.6	Normal	hourly	2026-03-25 17:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
37	e5a0b376-9e0d-49a6-9198-b1d102ad7399	12.5	Normal	hourly	2026-03-25 18:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
38	e5a0b376-9e0d-49a6-9198-b1d102ad7399	13.5	Normal	hourly	2026-03-25 19:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
39	e5a0b376-9e0d-49a6-9198-b1d102ad7399	14.5	Normal	hourly	2026-03-25 20:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
40	e5a0b376-9e0d-49a6-9198-b1d102ad7399	15.6	Normal	hourly	2026-03-25 21:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
41	e5a0b376-9e0d-49a6-9198-b1d102ad7399	16.6	Normal	hourly	2026-03-25 22:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
42	e5a0b376-9e0d-49a6-9198-b1d102ad7399	17.6	Normal	hourly	2026-03-25 23:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
43	e5a0b376-9e0d-49a6-9198-b1d102ad7399	18.6	Normal	hourly	2026-03-26 00:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
44	e5a0b376-9e0d-49a6-9198-b1d102ad7399	19.5	Normal	hourly	2026-03-26 01:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
45	e5a0b376-9e0d-49a6-9198-b1d102ad7399	19.5	Normal	hourly	2026-03-26 02:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
46	e5a0b376-9e0d-49a6-9198-b1d102ad7399	18.5	Normal	hourly	2026-03-26 03:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
47	e5a0b376-9e0d-49a6-9198-b1d102ad7399	17.6	Normal	hourly	2026-03-26 04:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
48	e5a0b376-9e0d-49a6-9198-b1d102ad7399	16.6	Normal	hourly	2026-03-26 05:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
49	e5a0b376-9e0d-49a6-9198-b1d102ad7399	15.6	Normal	hourly	2026-03-26 06:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
50	e5a0b376-9e0d-49a6-9198-b1d102ad7399	15.6	Normal	hourly	2026-03-26 07:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
51	e5a0b376-9e0d-49a6-9198-b1d102ad7399	15.5	Normal	hourly	2026-03-26 08:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
52	e5a0b376-9e0d-49a6-9198-b1d102ad7399	16.5	Normal	hourly	2026-03-26 09:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
53	e5a0b376-9e0d-49a6-9198-b1d102ad7399	17	Normal	hourly	2026-03-26 10:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
54	e5a0b376-9e0d-49a6-9198-b1d102ad7399	17.5	Normal	hourly	2026-03-26 11:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
55	e5a0b376-9e0d-49a6-9198-b1d102ad7399	17.7	Normal	hourly	2026-03-26 12:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
56	e5a0b376-9e0d-49a6-9198-b1d102ad7399	17.6	Normal	hourly	2026-03-26 13:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
57	e5a0b376-9e0d-49a6-9198-b1d102ad7399	16.6	Normal	hourly	2026-03-26 14:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
58	e5a0b376-9e0d-49a6-9198-b1d102ad7399	15.6	Normal	hourly	2026-03-26 15:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
59	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21	Normal	hourly	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
60	e5a0b376-9e0d-49a6-9198-b1d102ad7399	15.5	Normal	daily	2026-03-20 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
61	e5a0b376-9e0d-49a6-9198-b1d102ad7399	16.5	Normal	daily	2026-03-21 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
62	e5a0b376-9e0d-49a6-9198-b1d102ad7399	18.5	Normal	daily	2026-03-22 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
63	e5a0b376-9e0d-49a6-9198-b1d102ad7399	17.5	Normal	daily	2026-03-23 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
64	e5a0b376-9e0d-49a6-9198-b1d102ad7399	16.6	Normal	daily	2026-03-24 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
65	e5a0b376-9e0d-49a6-9198-b1d102ad7399	15.6	Normal	daily	2026-03-25 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
66	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21	Normal	daily	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
67	e5a0b376-9e0d-49a6-9198-b1d102ad7399	19.5	Normal	weekly	2026-03-05 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
68	e5a0b376-9e0d-49a6-9198-b1d102ad7399	17.5	Normal	weekly	2026-03-12 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
69	e5a0b376-9e0d-49a6-9198-b1d102ad7399	15.5	Normal	weekly	2026-03-19 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
70	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21	Normal	weekly	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
71	326a3111-3b38-4f22-858f-c9ae299356ad	18.2	Normal	hourly	2026-03-25 17:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
72	326a3111-3b38-4f22-858f-c9ae299356ad	19.1	Normal	hourly	2026-03-25 18:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
73	326a3111-3b38-4f22-858f-c9ae299356ad	21.1	Normal	hourly	2026-03-25 19:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
74	326a3111-3b38-4f22-858f-c9ae299356ad	23.1	Normal	hourly	2026-03-25 20:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
75	326a3111-3b38-4f22-858f-c9ae299356ad	26.1	Normal	hourly	2026-03-25 21:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
76	326a3111-3b38-4f22-858f-c9ae299356ad	28.2	Normal	hourly	2026-03-25 22:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
77	326a3111-3b38-4f22-858f-c9ae299356ad	30.2	Normal	hourly	2026-03-25 23:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
78	326a3111-3b38-4f22-858f-c9ae299356ad	31.2	Normal	hourly	2026-03-26 00:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
79	326a3111-3b38-4f22-858f-c9ae299356ad	32.1	Normal	hourly	2026-03-26 01:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
80	326a3111-3b38-4f22-858f-c9ae299356ad	31.1	Normal	hourly	2026-03-26 02:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
81	326a3111-3b38-4f22-858f-c9ae299356ad	30.1	Normal	hourly	2026-03-26 03:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
82	326a3111-3b38-4f22-858f-c9ae299356ad	29.1	Normal	hourly	2026-03-26 04:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
83	326a3111-3b38-4f22-858f-c9ae299356ad	28.2	Normal	hourly	2026-03-26 05:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
84	326a3111-3b38-4f22-858f-c9ae299356ad	27.2	Normal	hourly	2026-03-26 06:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
85	326a3111-3b38-4f22-858f-c9ae299356ad	26.2	Normal	hourly	2026-03-26 07:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
86	326a3111-3b38-4f22-858f-c9ae299356ad	25.1	Normal	hourly	2026-03-26 08:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
87	326a3111-3b38-4f22-858f-c9ae299356ad	24.1	Normal	hourly	2026-03-26 09:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
88	326a3111-3b38-4f22-858f-c9ae299356ad	25.1	Normal	hourly	2026-03-26 10:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
89	326a3111-3b38-4f22-858f-c9ae299356ad	26.1	Normal	hourly	2026-03-26 11:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
90	326a3111-3b38-4f22-858f-c9ae299356ad	27.1	Normal	hourly	2026-03-26 12:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
91	326a3111-3b38-4f22-858f-c9ae299356ad	28.2	Normal	hourly	2026-03-26 13:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
92	326a3111-3b38-4f22-858f-c9ae299356ad	29.2	Normal	hourly	2026-03-26 14:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
93	326a3111-3b38-4f22-858f-c9ae299356ad	29.6	Normal	hourly	2026-03-26 15:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
94	326a3111-3b38-4f22-858f-c9ae299356ad	27.9	Normal	hourly	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
95	326a3111-3b38-4f22-858f-c9ae299356ad	23.2	Normal	daily	2026-03-20 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
96	326a3111-3b38-4f22-858f-c9ae299356ad	26.1	Normal	daily	2026-03-21 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
97	326a3111-3b38-4f22-858f-c9ae299356ad	28	Normal	daily	2026-03-22 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
98	326a3111-3b38-4f22-858f-c9ae299356ad	30	Normal	daily	2026-03-23 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
99	326a3111-3b38-4f22-858f-c9ae299356ad	32.1	Normal	daily	2026-03-24 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
100	326a3111-3b38-4f22-858f-c9ae299356ad	31.2	Normal	daily	2026-03-25 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
101	326a3111-3b38-4f22-858f-c9ae299356ad	27.9	Normal	daily	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
102	326a3111-3b38-4f22-858f-c9ae299356ad	26.2	Normal	weekly	2026-03-05 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
103	326a3111-3b38-4f22-858f-c9ae299356ad	28.1	Normal	weekly	2026-03-12 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
104	326a3111-3b38-4f22-858f-c9ae299356ad	30	Normal	weekly	2026-03-19 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
105	326a3111-3b38-4f22-858f-c9ae299356ad	27.9	Normal	weekly	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
106	9a24b708-1cdc-4805-9548-aa020fa4c124	44	Normal	hourly	2026-03-25 17:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
107	9a24b708-1cdc-4805-9548-aa020fa4c124	42	Normal	hourly	2026-03-25 18:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
108	9a24b708-1cdc-4805-9548-aa020fa4c124	40	Normal	hourly	2026-03-25 19:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
109	9a24b708-1cdc-4805-9548-aa020fa4c124	38.8	Normal	hourly	2026-03-25 20:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
110	9a24b708-1cdc-4805-9548-aa020fa4c124	37.7	Normal	hourly	2026-03-25 21:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
111	9a24b708-1cdc-4805-9548-aa020fa4c124	36.7	Normal	hourly	2026-03-25 22:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
112	9a24b708-1cdc-4805-9548-aa020fa4c124	35.8	Normal	hourly	2026-03-25 23:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
113	9a24b708-1cdc-4805-9548-aa020fa4c124	34.9	Normal	hourly	2026-03-26 00:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
114	9a24b708-1cdc-4805-9548-aa020fa4c124	34	Normal	hourly	2026-03-26 01:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
115	9a24b708-1cdc-4805-9548-aa020fa4c124	33	Normal	hourly	2026-03-26 02:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
116	9a24b708-1cdc-4805-9548-aa020fa4c124	31.9	Normal	hourly	2026-03-26 03:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
117	9a24b708-1cdc-4805-9548-aa020fa4c124	31.7	Normal	hourly	2026-03-26 04:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
118	9a24b708-1cdc-4805-9548-aa020fa4c124	32.3	Normal	hourly	2026-03-26 05:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
119	9a24b708-1cdc-4805-9548-aa020fa4c124	32.7	Normal	hourly	2026-03-26 06:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
120	9a24b708-1cdc-4805-9548-aa020fa4c124	33.9	Normal	hourly	2026-03-26 07:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
121	9a24b708-1cdc-4805-9548-aa020fa4c124	36	Normal	hourly	2026-03-26 08:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
122	9a24b708-1cdc-4805-9548-aa020fa4c124	38	Normal	hourly	2026-03-26 09:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
123	9a24b708-1cdc-4805-9548-aa020fa4c124	38.9	Normal	hourly	2026-03-26 10:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
124	9a24b708-1cdc-4805-9548-aa020fa4c124	39.8	Normal	hourly	2026-03-26 11:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
125	9a24b708-1cdc-4805-9548-aa020fa4c124	38.7	Normal	hourly	2026-03-26 12:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
126	9a24b708-1cdc-4805-9548-aa020fa4c124	37.7	Normal	hourly	2026-03-26 13:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
127	9a24b708-1cdc-4805-9548-aa020fa4c124	35.8	Normal	hourly	2026-03-26 14:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
128	9a24b708-1cdc-4805-9548-aa020fa4c124	33.9	Normal	hourly	2026-03-26 15:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
129	9a24b708-1cdc-4805-9548-aa020fa4c124	41.1	Normal	hourly	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
130	9a24b708-1cdc-4805-9548-aa020fa4c124	49	Normal	daily	2026-03-20 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
131	9a24b708-1cdc-4805-9548-aa020fa4c124	44.1	Normal	daily	2026-03-21 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
132	9a24b708-1cdc-4805-9548-aa020fa4c124	39	Normal	daily	2026-03-22 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
133	9a24b708-1cdc-4805-9548-aa020fa4c124	33.8	Normal	daily	2026-03-23 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
134	9a24b708-1cdc-4805-9548-aa020fa4c124	35.6	Normal	daily	2026-03-24 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
135	9a24b708-1cdc-4805-9548-aa020fa4c124	38.6	Normal	daily	2026-03-25 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
136	9a24b708-1cdc-4805-9548-aa020fa4c124	41.1	Normal	daily	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
137	9a24b708-1cdc-4805-9548-aa020fa4c124	54.1	Normal	weekly	2026-03-05 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
138	9a24b708-1cdc-4805-9548-aa020fa4c124	49.2	Normal	weekly	2026-03-12 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
139	9a24b708-1cdc-4805-9548-aa020fa4c124	44.1	Normal	weekly	2026-03-19 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
140	9a24b708-1cdc-4805-9548-aa020fa4c124	41.1	Normal	weekly	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
141	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.9	Normal	hourly	2026-03-25 17:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
142	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.8	Normal	hourly	2026-03-25 18:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
143	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.8	Normal	hourly	2026-03-25 19:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
144	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.7	Normal	hourly	2026-03-25 20:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
145	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.7	Normal	hourly	2026-03-25 21:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
146	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.6	Normal	hourly	2026-03-25 22:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
147	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.6	Normal	hourly	2026-03-25 23:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
148	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.6	Normal	hourly	2026-03-26 00:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
149	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.5	Normal	hourly	2026-03-26 01:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
150	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.5	Normal	hourly	2026-03-26 02:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
151	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.5	Normal	hourly	2026-03-26 03:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
152	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.5	Normal	hourly	2026-03-26 04:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
153	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.6	Normal	hourly	2026-03-26 05:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
154	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.6	Normal	hourly	2026-03-26 06:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
155	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.6	Normal	hourly	2026-03-26 07:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
156	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.5	Normal	hourly	2026-03-26 08:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
157	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.5	Normal	hourly	2026-03-26 09:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
158	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.5	Normal	hourly	2026-03-26 10:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
159	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.5	Normal	hourly	2026-03-26 11:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
160	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.4	Normal	hourly	2026-03-26 12:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
161	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.4	Normal	hourly	2026-03-26 13:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
162	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.4	Normal	hourly	2026-03-26 14:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
163	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.4	Normal	hourly	2026-03-26 15:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
164	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.4	Normal	hourly	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
165	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.9	Normal	daily	2026-03-20 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
166	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.8	Normal	daily	2026-03-21 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
167	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.7	Normal	daily	2026-03-22 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
168	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.6	Normal	daily	2026-03-23 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
169	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.6	Normal	daily	2026-03-24 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
170	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.5	Normal	daily	2026-03-25 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
171	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.4	Normal	daily	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
172	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.9	Normal	weekly	2026-03-05 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
173	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.7	Normal	weekly	2026-03-12 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
174	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.6	Normal	weekly	2026-03-19 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
175	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.4	Normal	weekly	2026-03-26 16:43:52.519421+05:30	2026-03-26 16:43:52.50093+05:30
176	53335f0a-63e3-4552-8e55-7fc1a8f71e17	27.6	Normal	raw	2026-03-26 16:44:27.40715+05:30	2026-03-26 16:44:27.402244+05:30
177	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21.1	Normal	raw	2026-03-26 16:44:27.40715+05:30	2026-03-26 16:44:27.402244+05:30
178	326a3111-3b38-4f22-858f-c9ae299356ad	28	Normal	raw	2026-03-26 16:44:27.40715+05:30	2026-03-26 16:44:27.402244+05:30
179	9a24b708-1cdc-4805-9548-aa020fa4c124	40.2	Normal	raw	2026-03-26 16:44:27.40715+05:30	2026-03-26 16:44:27.402244+05:30
180	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.4	Normal	raw	2026-03-26 16:44:27.40715+05:30	2026-03-26 16:44:27.402244+05:30
181	53335f0a-63e3-4552-8e55-7fc1a8f71e17	27.4	Normal	raw	2026-03-26 16:45:18.815436+05:30	2026-03-26 16:45:18.806025+05:30
182	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21.3	Normal	raw	2026-03-26 16:45:18.815436+05:30	2026-03-26 16:45:18.806025+05:30
183	326a3111-3b38-4f22-858f-c9ae299356ad	27.5	Normal	raw	2026-03-26 16:45:18.815436+05:30	2026-03-26 16:45:18.806025+05:30
184	9a24b708-1cdc-4805-9548-aa020fa4c124	39.7	Normal	raw	2026-03-26 16:45:18.815436+05:30	2026-03-26 16:45:18.806025+05:30
185	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.4	Normal	raw	2026-03-26 16:45:18.815436+05:30	2026-03-26 16:45:18.806025+05:30
186	53335f0a-63e3-4552-8e55-7fc1a8f71e17	26.6	Normal	raw	2026-03-26 16:45:49.090913+05:30	2026-03-26 16:45:49.086723+05:30
187	e5a0b376-9e0d-49a6-9198-b1d102ad7399	20.9	Normal	raw	2026-03-26 16:45:49.090913+05:30	2026-03-26 16:45:49.086723+05:30
188	326a3111-3b38-4f22-858f-c9ae299356ad	28	Normal	raw	2026-03-26 16:45:49.090913+05:30	2026-03-26 16:45:49.086723+05:30
189	9a24b708-1cdc-4805-9548-aa020fa4c124	39.7	Normal	raw	2026-03-26 16:45:49.090913+05:30	2026-03-26 16:45:49.086723+05:30
190	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.4	Normal	raw	2026-03-26 16:45:49.090913+05:30	2026-03-26 16:45:49.086723+05:30
191	53335f0a-63e3-4552-8e55-7fc1a8f71e17	26.4	Normal	raw	2026-03-26 16:46:19.098623+05:30	2026-03-26 16:46:19.092168+05:30
192	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21	Normal	raw	2026-03-26 16:46:19.098623+05:30	2026-03-26 16:46:19.092168+05:30
193	326a3111-3b38-4f22-858f-c9ae299356ad	27.7	Normal	raw	2026-03-26 16:46:19.098623+05:30	2026-03-26 16:46:19.092168+05:30
194	9a24b708-1cdc-4805-9548-aa020fa4c124	39.6	Normal	raw	2026-03-26 16:46:19.098623+05:30	2026-03-26 16:46:19.092168+05:30
195	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.3	Normal	raw	2026-03-26 16:46:19.098623+05:30	2026-03-26 16:46:19.092168+05:30
196	53335f0a-63e3-4552-8e55-7fc1a8f71e17	26.5	Normal	raw	2026-03-26 16:46:49.294681+05:30	2026-03-26 16:46:49.290033+05:30
197	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21.4	Normal	raw	2026-03-26 16:46:49.294681+05:30	2026-03-26 16:46:49.290033+05:30
198	326a3111-3b38-4f22-858f-c9ae299356ad	27.4	Normal	raw	2026-03-26 16:46:49.294681+05:30	2026-03-26 16:46:49.290033+05:30
199	9a24b708-1cdc-4805-9548-aa020fa4c124	39.9	Normal	raw	2026-03-26 16:46:49.294681+05:30	2026-03-26 16:46:49.290033+05:30
200	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.3	Normal	raw	2026-03-26 16:46:49.294681+05:30	2026-03-26 16:46:49.290033+05:30
201	53335f0a-63e3-4552-8e55-7fc1a8f71e17	27.3	Normal	raw	2026-03-26 16:49:11.338176+05:30	2026-03-26 16:49:11.329948+05:30
202	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21.7	Normal	raw	2026-03-26 16:49:11.338176+05:30	2026-03-26 16:49:11.329948+05:30
203	326a3111-3b38-4f22-858f-c9ae299356ad	27.1	Normal	raw	2026-03-26 16:49:11.338176+05:30	2026-03-26 16:49:11.329948+05:30
204	9a24b708-1cdc-4805-9548-aa020fa4c124	39.4	Normal	raw	2026-03-26 16:49:11.338176+05:30	2026-03-26 16:49:11.329948+05:30
205	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.3	Normal	raw	2026-03-26 16:49:11.338176+05:30	2026-03-26 16:49:11.329948+05:30
206	53335f0a-63e3-4552-8e55-7fc1a8f71e17	27.1	Normal	raw	2026-03-26 17:09:47.170394+05:30	2026-03-26 17:09:47.166215+05:30
207	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21.3	Normal	raw	2026-03-26 17:09:47.170394+05:30	2026-03-26 17:09:47.166215+05:30
208	326a3111-3b38-4f22-858f-c9ae299356ad	27.1	Normal	raw	2026-03-26 17:09:47.170394+05:30	2026-03-26 17:09:47.166215+05:30
209	9a24b708-1cdc-4805-9548-aa020fa4c124	39.8	Normal	raw	2026-03-26 17:09:47.170394+05:30	2026-03-26 17:09:47.166215+05:30
210	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.4	Normal	raw	2026-03-26 17:09:47.170394+05:30	2026-03-26 17:09:47.166215+05:30
211	53335f0a-63e3-4552-8e55-7fc1a8f71e17	27.2	Normal	raw	2026-03-26 17:10:23.043081+05:30	2026-03-26 17:10:23.036151+05:30
212	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21.6	Normal	raw	2026-03-26 17:10:23.043081+05:30	2026-03-26 17:10:23.036151+05:30
213	326a3111-3b38-4f22-858f-c9ae299356ad	26.8	Normal	raw	2026-03-26 17:10:23.043081+05:30	2026-03-26 17:10:23.036151+05:30
214	9a24b708-1cdc-4805-9548-aa020fa4c124	40	Normal	raw	2026-03-26 17:10:23.043081+05:30	2026-03-26 17:10:23.036151+05:30
215	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.4	Normal	raw	2026-03-26 17:10:23.043081+05:30	2026-03-26 17:10:23.036151+05:30
216	53335f0a-63e3-4552-8e55-7fc1a8f71e17	26.7	Normal	raw	2026-03-26 17:12:04.406116+05:30	2026-03-26 17:12:04.399563+05:30
217	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21.6	Normal	raw	2026-03-26 17:12:04.406116+05:30	2026-03-26 17:12:04.399563+05:30
218	326a3111-3b38-4f22-858f-c9ae299356ad	27.2	Normal	raw	2026-03-26 17:12:04.406116+05:30	2026-03-26 17:12:04.399563+05:30
219	9a24b708-1cdc-4805-9548-aa020fa4c124	41.2	Normal	raw	2026-03-26 17:12:04.406116+05:30	2026-03-26 17:12:04.399563+05:30
220	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.5	Normal	raw	2026-03-26 17:12:04.406116+05:30	2026-03-26 17:12:04.399563+05:30
221	53335f0a-63e3-4552-8e55-7fc1a8f71e17	27.1	Normal	raw	2026-03-26 18:55:26.118552+05:30	2026-03-26 18:55:26.1089+05:30
222	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21.9	Normal	raw	2026-03-26 18:55:26.118552+05:30	2026-03-26 18:55:26.1089+05:30
223	326a3111-3b38-4f22-858f-c9ae299356ad	27.5	Normal	raw	2026-03-26 18:55:26.118552+05:30	2026-03-26 18:55:26.1089+05:30
224	9a24b708-1cdc-4805-9548-aa020fa4c124	41.7	Normal	raw	2026-03-26 18:55:26.118552+05:30	2026-03-26 18:55:26.1089+05:30
225	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.5	Normal	raw	2026-03-26 18:55:26.118552+05:30	2026-03-26 18:55:26.1089+05:30
226	53335f0a-63e3-4552-8e55-7fc1a8f71e17	26.9	Normal	raw	2026-03-26 19:09:48.892708+05:30	2026-03-26 19:09:48.886954+05:30
227	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21.8	Normal	raw	2026-03-26 19:09:48.892708+05:30	2026-03-26 19:09:48.886954+05:30
228	326a3111-3b38-4f22-858f-c9ae299356ad	27.5	Normal	raw	2026-03-26 19:09:48.892708+05:30	2026-03-26 19:09:48.886954+05:30
229	9a24b708-1cdc-4805-9548-aa020fa4c124	41.1	Normal	raw	2026-03-26 19:09:48.892708+05:30	2026-03-26 19:09:48.886954+05:30
230	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.4	Normal	raw	2026-03-26 19:09:48.892708+05:30	2026-03-26 19:09:48.886954+05:30
231	53335f0a-63e3-4552-8e55-7fc1a8f71e17	26.5	Normal	raw	2026-03-26 19:12:06.514549+05:30	2026-03-26 19:12:06.50901+05:30
232	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21.5	Normal	raw	2026-03-26 19:12:06.514549+05:30	2026-03-26 19:12:06.50901+05:30
233	326a3111-3b38-4f22-858f-c9ae299356ad	27.8	Normal	raw	2026-03-26 19:12:06.514549+05:30	2026-03-26 19:12:06.50901+05:30
234	9a24b708-1cdc-4805-9548-aa020fa4c124	41.1	Normal	raw	2026-03-26 19:12:06.514549+05:30	2026-03-26 19:12:06.50901+05:30
235	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.3	Normal	raw	2026-03-26 19:12:06.514549+05:30	2026-03-26 19:12:06.50901+05:30
236	53335f0a-63e3-4552-8e55-7fc1a8f71e17	27	Normal	raw	2026-03-27 11:02:31.980908+05:30	2026-03-27 11:02:31.966928+05:30
237	e5a0b376-9e0d-49a6-9198-b1d102ad7399	21.4	Normal	raw	2026-03-27 11:02:31.980908+05:30	2026-03-27 11:02:31.966928+05:30
238	326a3111-3b38-4f22-858f-c9ae299356ad	27.9	Normal	raw	2026-03-27 11:02:31.980908+05:30	2026-03-27 11:02:31.966928+05:30
239	9a24b708-1cdc-4805-9548-aa020fa4c124	40.8	Normal	raw	2026-03-27 11:02:31.980908+05:30	2026-03-27 11:02:31.966928+05:30
240	66cc15f2-ea1a-4ff8-9376-fdd01ecd65eb	6.3	Normal	raw	2026-03-27 11:02:31.980908+05:30	2026-03-27 11:02:31.966928+05:30
\.


--
-- TOC entry 5803 (class 0 OID 17835)
-- Dependencies: 221
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text) FROM stdin;
\.


--
-- TOC entry 6016 (class 0 OID 18598)
-- Dependencies: 225
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, region, council, farm_name, farm_location, primary_crop, primary_soil) FROM stdin;
11111111-1111-1111-1111-111111111111	James Mitchell	Riverland	MID MURRAY COUNCIL	Riverbend Vineyards	Renmark, SA	Shiraz	Loamy
77777777-7777-7777-7777-777777777777	Olivia Parker	Clare Valley	CLARE AND GILBERT VALLEYS COUNCIL	Valley Crest Farm	Clare, SA	Shiraz	Loam
\.


--
-- TOC entry 6036 (class 0 OID 0)
-- Dependencies: 231
-- Name: satellite_refresh_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.satellite_refresh_events_id_seq', 780, true);


--
-- TOC entry 6037 (class 0 OID 0)
-- Dependencies: 229
-- Name: satellite_timeseries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.satellite_timeseries_id_seq', 237, true);


--
-- TOC entry 6038 (class 0 OID 0)
-- Dependencies: 234
-- Name: sensor_readings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.sensor_readings_id_seq', 240, true);


--
-- TOC entry 5825 (class 2606 OID 18615)
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);


--
-- TOC entry 5830 (class 2606 OID 24610)
-- Name: satellite_cache satellite_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_cache
    ADD CONSTRAINT satellite_cache_pkey PRIMARY KEY (block_id);


--
-- TOC entry 5841 (class 2606 OID 32781)
-- Name: satellite_refresh_events satellite_refresh_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_refresh_events
    ADD CONSTRAINT satellite_refresh_events_pkey PRIMARY KEY (id);


--
-- TOC entry 5833 (class 2606 OID 24631)
-- Name: satellite_refresh_jobs satellite_refresh_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_refresh_jobs
    ADD CONSTRAINT satellite_refresh_jobs_pkey PRIMARY KEY (block_id);


--
-- TOC entry 5837 (class 2606 OID 24650)
-- Name: satellite_timeseries satellite_timeseries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_timeseries
    ADD CONSTRAINT satellite_timeseries_pkey PRIMARY KEY (id);


--
-- TOC entry 5845 (class 2606 OID 40979)
-- Name: sensor_definitions sensor_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_definitions
    ADD CONSTRAINT sensor_definitions_pkey PRIMARY KEY (id);


--
-- TOC entry 5853 (class 2606 OID 41031)
-- Name: sensor_latest sensor_latest_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_latest
    ADD CONSTRAINT sensor_latest_pkey PRIMARY KEY (sensor_id);


--
-- TOC entry 5851 (class 2606 OID 41012)
-- Name: sensor_readings sensor_readings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_readings
    ADD CONSTRAINT sensor_readings_pkey PRIMARY KEY (id);


--
-- TOC entry 5847 (class 2606 OID 40981)
-- Name: sensor_definitions uq_sensor_definitions_block_sensor_type; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_definitions
    ADD CONSTRAINT uq_sensor_definitions_block_sensor_type UNIQUE (block_id, sensor_type);


--
-- TOC entry 5823 (class 2606 OID 18606)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5826 (class 1259 OID 18626)
-- Name: idx_blocks_geom; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_blocks_geom ON public.blocks USING gist (geom);


--
-- TOC entry 5827 (class 1259 OID 24616)
-- Name: ix_satellite_cache_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_cache_expires_at ON public.satellite_cache USING btree (expires_at);


--
-- TOC entry 5828 (class 1259 OID 24617)
-- Name: ix_satellite_cache_last_updated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_cache_last_updated ON public.satellite_cache USING btree (last_updated);


--
-- TOC entry 5838 (class 1259 OID 32788)
-- Name: ix_satellite_refresh_events_block_id_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_refresh_events_block_id_id ON public.satellite_refresh_events USING btree (block_id, id);


--
-- TOC entry 5839 (class 1259 OID 32787)
-- Name: ix_satellite_refresh_events_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_refresh_events_created_at ON public.satellite_refresh_events USING btree (created_at);


--
-- TOC entry 5831 (class 1259 OID 24637)
-- Name: ix_satellite_refresh_jobs_status_scheduled_for; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_refresh_jobs_status_scheduled_for ON public.satellite_refresh_jobs USING btree (status, scheduled_for);


--
-- TOC entry 5834 (class 1259 OID 24656)
-- Name: ix_satellite_timeseries_block_observed_on; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_timeseries_block_observed_on ON public.satellite_timeseries USING btree (block_id, observed_on);


--
-- TOC entry 5835 (class 1259 OID 32791)
-- Name: ix_satellite_timeseries_block_recorded_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_timeseries_block_recorded_at ON public.satellite_timeseries USING btree (block_id, recorded_at);


--
-- TOC entry 5842 (class 1259 OID 40993)
-- Name: ix_sensor_definitions_block_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_sensor_definitions_block_id ON public.sensor_definitions USING btree (block_id);


--
-- TOC entry 5843 (class 1259 OID 40992)
-- Name: ix_sensor_definitions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_sensor_definitions_user_id ON public.sensor_definitions USING btree (user_id);


--
-- TOC entry 5848 (class 1259 OID 41018)
-- Name: ix_sensor_readings_raw_recent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_sensor_readings_raw_recent ON public.sensor_readings USING btree (sensor_id, observed_at) WHERE ((granularity)::text = 'raw'::text);


--
-- TOC entry 5849 (class 1259 OID 41019)
-- Name: ix_sensor_readings_sensor_granularity_observed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_sensor_readings_sensor_granularity_observed ON public.sensor_readings USING btree (sensor_id, granularity, observed_at);


--
-- TOC entry 5863 (class 2620 OID 41039)
-- Name: sensor_readings trg_sensor_latest; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sensor_latest AFTER INSERT ON public.sensor_readings FOR EACH ROW EXECUTE FUNCTION public.fn_update_sensor_latest();


--
-- TOC entry 5854 (class 2606 OID 18627)
-- Name: blocks blocks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5855 (class 2606 OID 24611)
-- Name: satellite_cache satellite_cache_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_cache
    ADD CONSTRAINT satellite_cache_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- TOC entry 5858 (class 2606 OID 32782)
-- Name: satellite_refresh_events satellite_refresh_events_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_refresh_events
    ADD CONSTRAINT satellite_refresh_events_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- TOC entry 5856 (class 2606 OID 24632)
-- Name: satellite_refresh_jobs satellite_refresh_jobs_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_refresh_jobs
    ADD CONSTRAINT satellite_refresh_jobs_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- TOC entry 5857 (class 2606 OID 24651)
-- Name: satellite_timeseries satellite_timeseries_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_timeseries
    ADD CONSTRAINT satellite_timeseries_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- TOC entry 5859 (class 2606 OID 40987)
-- Name: sensor_definitions sensor_definitions_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_definitions
    ADD CONSTRAINT sensor_definitions_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


--
-- TOC entry 5860 (class 2606 OID 40982)
-- Name: sensor_definitions sensor_definitions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_definitions
    ADD CONSTRAINT sensor_definitions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5862 (class 2606 OID 41032)
-- Name: sensor_latest sensor_latest_sensor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_latest
    ADD CONSTRAINT sensor_latest_sensor_id_fkey FOREIGN KEY (sensor_id) REFERENCES public.sensor_definitions(id) ON DELETE CASCADE;


--
-- TOC entry 5861 (class 2606 OID 41013)
-- Name: sensor_readings sensor_readings_sensor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sensor_readings
    ADD CONSTRAINT sensor_readings_sensor_id_fkey FOREIGN KEY (sensor_id) REFERENCES public.sensor_definitions(id) ON DELETE CASCADE;


-- Completed on 2026-03-27 11:10:20

--
-- PostgreSQL database dump complete
--

\unrestrict nxJazp0C0Ch1E8SAcwWPxL5mctI2cdx3JyIiNXPm07XvWp1vv6YTYvKmxgoVyjx
