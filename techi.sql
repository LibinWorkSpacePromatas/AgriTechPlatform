--
-- PostgreSQL database dump
--

\restrict xKv7OzQgudvktKvfE86BtRckTXu8ytiFJcG1McRnfEYmIPiuGxqvYhCKcPh5udl

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

-- Started on 2026-03-19 17:20:07

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
-- TOC entry 5949 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


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
-- TOC entry 227 (class 1259 OID 24576)
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
    refreshed_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE public.satellite_cache OWNER TO postgres;

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
-- TOC entry 5942 (class 0 OID 18607)
-- Dependencies: 226
-- Data for Name: blocks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.blocks (id, user_id, lanslu, soil_subgroup, soil_class, description, area_ha, crop, geom) FROM stdin;
22222222-2222-2222-2222-222222222222	11111111-1111-1111-1111-111111111111	BCPKFB	A6	A6	Loamy sand over red clay	9	Shiraz	0103000020E61000000100000021000000F241CF66D59761403C4ED1915C1641C0D9ACC762D59761401CA278355D1641C03592D856D59761406BF2D5D25D1641C0EF597743D5976140CC1ADD635E1641C033AC6229D5976140A254FBE25E1641C0BD1D9B09D5976140940B4E4B5F1641C0A55359E5D4976140ABECD2985F1641C091FF01BED49761403E578FC85F1641C0992A1895D4976140A0ABADD85F1641C0A1552E6CD49761403E578FC85F1641C08D01D744D4976140ABECD2985F1641C075379520D4976140940B4E4B5F1641C0FFA8CD00D4976140A254FBE25E1641C043FBB8E6D3976140CC1ADD635E1641C0FDC257D3D39761406BF2D5D25D1641C059A868C7D39761401CA278355D1641C0401361C3D39761403C4ED1915C1641C059A868C7D39761405CFA29EE5B1641C0FDC257D3D39761400DAACC505B1641C043FBB8E6D3976140AC81C5BF5A1641C0FFA8CD00D4976140D647A7405A1641C075379520D4976140E49054D8591641C08D01D744D4976140CDAFCF8A591641C0A1552E6CD49761403A45135B591641C0992A1895D4976140D8F0F44A591641C091FF01BED49761403A45135B591641C0A55359E5D4976140CDAFCF8A591641C0BD1D9B09D5976140E49054D8591641C033AC6229D5976140D647A7405A1641C0EF597743D5976140AC81C5BF5A1641C03592D856D59761400DAACC505B1641C0D9ACC762D59761405CFA29EE5B1641C0F241CF66D59761403C4ED1915C1641C0
\.


--
-- TOC entry 5943 (class 0 OID 24576)
-- Dependencies: 227
-- Data for Name: satellite_cache; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.satellite_cache (block_id, geometry_hash, payload, data_quality, composite_date_from, composite_date_to, pixel_count, gee_execution_ms, map_tile_url, refreshed_at, expires_at) FROM stdin;
22222222-2222-2222-2222-222222222222	794dc8bf5c3c18e27dd3d3cca7d650d3f69f2f461ae43f5709542636ae09f771	{"evi": 0.0804, "lai": 2.5421, "ndre": -0.0284, "ndvi": 0.1113, "ndwi": -0.2352, "block_id": "22222222-2222-2222-2222-222222222222", "pixel_count": 10, "data_quality": "good", "map_tile_url": null, "cloud_cover_pct": 0.0, "composite_date_to": "2026-03-13", "composite_date_from": "2026-03-06"}	good	2026-03-06	2026-03-13	10	2753	\N	2026-03-19 17:12:48.708467+05:30	2026-03-24 17:12:48.708467+05:30
\.


--
-- TOC entry 5775 (class 0 OID 17835)
-- Dependencies: 221
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text) FROM stdin;
\.


--
-- TOC entry 5941 (class 0 OID 18598)
-- Dependencies: 225
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, region, council, farm_name, farm_location, primary_crop, primary_soil) FROM stdin;
11111111-1111-1111-1111-111111111111	James Mitchell	Riverland	MID MURRAY COUNCIL	Riverbend Vineyards	Renmark, SA	Shiraz	Loamy
\.


--
-- TOC entry 5782 (class 2606 OID 18615)
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);


--
-- TOC entry 5786 (class 2606 OID 24589)
-- Name: satellite_cache satellite_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_cache
    ADD CONSTRAINT satellite_cache_pkey PRIMARY KEY (block_id);


--
-- TOC entry 5780 (class 2606 OID 18606)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5783 (class 1259 OID 18626)
-- Name: idx_blocks_geom; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_blocks_geom ON public.blocks USING gist (geom);


--
-- TOC entry 5784 (class 1259 OID 24595)
-- Name: ix_satellite_cache_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_satellite_cache_expires_at ON public.satellite_cache USING btree (expires_at);


--
-- TOC entry 5787 (class 2606 OID 18627)
-- Name: blocks blocks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5788 (class 2606 OID 24590)
-- Name: satellite_cache satellite_cache_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.satellite_cache
    ADD CONSTRAINT satellite_cache_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id) ON DELETE CASCADE;


-- Completed on 2026-03-19 17:20:07

--
-- PostgreSQL database dump complete
--

\unrestrict xKv7OzQgudvktKvfE86BtRckTXu8ytiFJcG1McRnfEYmIPiuGxqvYhCKcPh5udl

