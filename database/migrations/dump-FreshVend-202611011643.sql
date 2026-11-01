--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.0

-- Started on 2026-11-01 16:43:38

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
-- TOC entry 2 (class 3079 OID 16438)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 5187 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 272 (class 1255 OID 16475)
-- Name: trigger_set_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trigger_set_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.trigger_set_timestamp() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 234 (class 1259 OID 16748)
-- Name: alerts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alerts (
    alert_id uuid DEFAULT gen_random_uuid() NOT NULL,
    machine_id uuid NOT NULL,
    alert_type character varying(50) NOT NULL,
    message text NOT NULL,
    status character varying(20) DEFAULT 'OPEN'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_alerts_status CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'ACKNOWLEDGED'::character varying, 'RESOLVED'::character varying])::text[])))
);


ALTER TABLE public.alerts OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 16522)
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    audit_log_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16534)
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    category_id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_name character varying(100) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 16637)
-- Name: inventories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventories (
    inventory_id uuid DEFAULT gen_random_uuid() NOT NULL,
    slot_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_inventories_quantity CHECK ((quantity >= 0))
);


ALTER TABLE public.inventories OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 16717)
-- Name: machine_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.machine_events (
    machine_event_id uuid DEFAULT gen_random_uuid() NOT NULL,
    machine_id uuid NOT NULL,
    order_id uuid,
    slot_id uuid,
    event_type character varying(50) NOT NULL,
    severity character varying(20) NOT NULL,
    event_status character varying(20) DEFAULT 'RECEIVED'::character varying NOT NULL,
    retry_quantity integer DEFAULT 0 NOT NULL,
    error_code character varying(50),
    error_message text,
    idempotency_key character varying(100) NOT NULL,
    payload jsonb,
    occurred_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_machine_events_retry CHECK ((retry_quantity >= 0)),
    CONSTRAINT chk_machine_events_severity CHECK (((severity)::text = ANY ((ARRAY['INFO'::character varying, 'WARNING'::character varying, 'ERROR'::character varying, 'CRITICAL'::character varying])::text[]))),
    CONSTRAINT chk_machine_events_status CHECK (((event_status)::text = ANY ((ARRAY['RECEIVED'::character varying, 'PROCESSED'::character varying, 'FAILED'::character varying])::text[])))
);


ALTER TABLE public.machine_events OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 16621)
-- Name: machine_slots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.machine_slots (
    slot_id uuid DEFAULT gen_random_uuid() NOT NULL,
    machine_id uuid NOT NULL,
    slot_code character varying(20) NOT NULL,
    capacity integer NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    CONSTRAINT chk_machine_slots_capacity CHECK ((capacity > 0)),
    CONSTRAINT chk_machine_slots_status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);


ALTER TABLE public.machine_slots OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 16588)
-- Name: machine_statuses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.machine_statuses (
    machine_status_id uuid DEFAULT gen_random_uuid() NOT NULL,
    machine_id uuid NOT NULL,
    connection_status character varying(20) NOT NULL,
    operation_status character varying(20) NOT NULL,
    health_status character varying(20) NOT NULL,
    door_status character varying(20) NOT NULL,
    last_temperature numeric(4,1),
    last_humidity numeric(4,1),
    last_error_code character varying(50),
    last_seen_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_machine_statuses_conn CHECK (((connection_status)::text = ANY ((ARRAY['ONLINE'::character varying, 'OFFLINE'::character varying])::text[]))),
    CONSTRAINT chk_machine_statuses_door CHECK (((door_status)::text = ANY ((ARRAY['OPEN'::character varying, 'CLOSED'::character varying])::text[]))),
    CONSTRAINT chk_machine_statuses_health CHECK (((health_status)::text = ANY ((ARRAY['NORMAL'::character varying, 'WARNING'::character varying, 'ERROR'::character varying])::text[])))
);


ALTER TABLE public.machine_statuses OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16568)
-- Name: machines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.machines (
    machine_id uuid DEFAULT gen_random_uuid() NOT NULL,
    machine_code character varying(20) NOT NULL,
    machine_name character varying(100) NOT NULL,
    location_name character varying(150) NOT NULL,
    address character varying(255) NOT NULL,
    lifecycle_status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    min_temperature numeric(4,1) DEFAULT 2.0 NOT NULL,
    max_temperature numeric(4,1) DEFAULT 8.0 NOT NULL,
    alert_delay_minutes integer DEFAULT 5 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_machines_alert_delay CHECK ((alert_delay_minutes >= 0)),
    CONSTRAINT chk_machines_lifecycle_status CHECK (((lifecycle_status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying, 'MAINTENANCE'::character varying])::text[]))),
    CONSTRAINT chk_machines_temp_range CHECK ((min_temperature < max_temperature))
);


ALTER TABLE public.machines OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 16676)
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    order_item_id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    CONSTRAINT chk_order_items_quantity CHECK ((quantity > 0)),
    CONSTRAINT chk_order_items_subtotal CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT chk_order_items_unit_price CHECK ((unit_price > (0)::numeric))
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 16658)
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    order_id uuid DEFAULT gen_random_uuid() NOT NULL,
    machine_id uuid NOT NULL,
    order_status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    total_amount numeric(10,2) DEFAULT 0.00 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_orders_status CHECK (((order_status)::text = ANY ((ARRAY['PENDING'::character varying, 'PAID'::character varying, 'DISPENSING'::character varying, 'COMPLETED'::character varying, 'FAILED'::character varying, 'CANCELLED'::character varying])::text[]))),
    CONSTRAINT chk_orders_total_amount CHECK ((total_amount >= (0)::numeric))
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 16697)
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    payment_id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    payment_method character varying(30) NOT NULL,
    payment_status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    amount numeric(10,2) NOT NULL,
    transaction_reference character varying(255),
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_payments_amount CHECK ((amount >= (0)::numeric)),
    CONSTRAINT chk_payments_method CHECK (((payment_method)::text = ANY ((ARRAY['CASH'::character varying, 'CARD'::character varying, 'QR'::character varying])::text[]))),
    CONSTRAINT chk_payments_status CHECK (((payment_status)::text = ANY ((ARRAY['PENDING'::character varying, 'SUCCESS'::character varying, 'FAILED'::character varying, 'REFUNDED'::character varying])::text[])))
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 16499)
-- Name: permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.permissions (
    permission_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL
);


ALTER TABLE public.permissions OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 16547)
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    product_id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    product_name character varying(150) NOT NULL,
    description text,
    unit_price numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_products_status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[]))),
    CONSTRAINT chk_products_unit_price CHECK ((unit_price > (0)::numeric))
);


ALTER TABLE public.products OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 16764)
-- Name: restock_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.restock_events (
    restock_event_id uuid DEFAULT gen_random_uuid() NOT NULL,
    machine_id uuid NOT NULL,
    user_id uuid NOT NULL,
    restock_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    notes text
);


ALTER TABLE public.restock_events OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16507)
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


ALTER TABLE public.role_permissions OWNER TO postgres;

--
-- TOC entry 218 (class 1259 OID 16476)
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    role_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16607)
-- Name: temperature_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.temperature_logs (
    temperature_log_id uuid DEFAULT gen_random_uuid() NOT NULL,
    machine_id uuid NOT NULL,
    temperature numeric(4,1) NOT NULL,
    humidity numeric(4,1),
    sensor_status character varying(20) NOT NULL,
    is_out_of_range boolean DEFAULT false NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_temperature_logs_sensor CHECK (((sensor_status)::text = ANY ((ARRAY['OK'::character varying, 'ERROR'::character varying])::text[])))
);


ALTER TABLE public.temperature_logs OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16484)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    user_id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    fullname character varying(150) NOT NULL,
    password_hash character varying(255) NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 5180 (class 0 OID 16748)
-- Dependencies: 234
-- Data for Name: alerts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alerts (alert_id, machine_id, alert_type, message, status, created_at) FROM stdin;
08916786-c362-4687-b017-42971af996f1	8fd61456-cef0-497a-8a4a-b88aa3aee00c	LOW_STOCK_WARNING	Khay A02 (Orange) chỉ còn 8 sản phẩm. Khuyến nghị chuẩn bị restock.	OPEN	2026-10-31 22:52:31.955073+07
\.


--
-- TOC entry 5168 (class 0 OID 16522)
-- Dependencies: 222
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (audit_log_id, user_id, action, created_at) FROM stdin;
293953ac-3da5-4d03-b4d6-2269de976329	53a91d05-2c59-4dd0-a27f-18ffa3bfaee7	SYSTEM_INITIALIZE_SEED_DATA	2026-10-31 21:02:31.955073+07
\.


--
-- TOC entry 5169 (class 0 OID 16534)
-- Dependencies: 223
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (category_id, category_name, description, created_at, updated_at) FROM stdin;
5765a4da-3f51-4caa-bf2b-e554f877a3d4	Fruit	Trái cây tươi chọn lọc hàng ngày	2026-10-31 23:02:31.955073+07	2026-10-31 23:02:31.955073+07
283a2989-92e7-4e20-be8e-59d8e84cc3e0	Juice	Nước ép trái cây nguyên chất đóng chai	2026-10-31 23:02:31.955073+07	2026-10-31 23:02:31.955073+07
2f94a1af-4543-4892-a02d-f0d446a75c21	Fresh Food	Thực phẩm sạch chế biến sẵn bảo quản mát	2026-10-31 23:02:31.955073+07	2026-10-31 23:02:31.955073+07
\.


--
-- TOC entry 5175 (class 0 OID 16637)
-- Dependencies: 229
-- Data for Name: inventories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventories (inventory_id, slot_id, product_id, quantity, updated_at) FROM stdin;
8a63a274-800e-4de4-ac30-a658e9b845d1	b120647d-32f6-4f5f-809c-695564b25a6b	f88b5118-a85a-4488-b7ec-8d8b20d78b96	10	2026-10-31 23:02:31.955073+07
e8da66fa-c1b6-4cba-a543-3b25e9e334cc	2935c1a4-de18-4c31-bf7c-4f1d2051ee8b	3575e93f-8458-4bb2-923b-1de5cfc8a8cf	8	2026-10-31 23:02:31.955073+07
034343e7-efec-4bfa-8aa1-e43978bd79bb	fbf0da53-6435-4f12-b948-4ce0ce85613b	f9f599ea-be8e-45bd-b341-6addd5930ff8	15	2026-10-31 23:02:31.955073+07
\.


--
-- TOC entry 5179 (class 0 OID 16717)
-- Dependencies: 233
-- Data for Name: machine_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.machine_events (machine_event_id, machine_id, order_id, slot_id, event_type, severity, event_status, retry_quantity, error_code, error_message, idempotency_key, payload, occurred_at, created_at) FROM stdin;
365d86aa-661b-4b45-8a18-adb600e246e8	8fd61456-cef0-497a-8a4a-b88aa3aee00c	\N	b120647d-32f6-4f5f-809c-695564b25a6b	DISPENSE_SUCCESS	INFO	PROCESSED	0	\N	\N	IDEM_EVT_VM001_A01_20261031220000	{"motor_step": 360, "duration_ms": 1420, "sensor_drop_detected": true}	2026-10-31 22:32:31.955073+07	2026-10-31 22:32:31.955073+07
\.


--
-- TOC entry 5174 (class 0 OID 16621)
-- Dependencies: 228
-- Data for Name: machine_slots; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.machine_slots (slot_id, machine_id, slot_code, capacity, status) FROM stdin;
b120647d-32f6-4f5f-809c-695564b25a6b	8fd61456-cef0-497a-8a4a-b88aa3aee00c	A01	20	ACTIVE
2935c1a4-de18-4c31-bf7c-4f1d2051ee8b	8fd61456-cef0-497a-8a4a-b88aa3aee00c	A02	20	ACTIVE
fbf0da53-6435-4f12-b948-4ce0ce85613b	8fd61456-cef0-497a-8a4a-b88aa3aee00c	A03	20	ACTIVE
f75484bb-a114-4bbd-8d8b-805eea712ba0	8fd61456-cef0-497a-8a4a-b88aa3aee00c	A04	15	ACTIVE
\.


--
-- TOC entry 5172 (class 0 OID 16588)
-- Dependencies: 226
-- Data for Name: machine_statuses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.machine_statuses (machine_status_id, machine_id, connection_status, operation_status, health_status, door_status, last_temperature, last_humidity, last_error_code, last_seen_at, created_at, updated_at) FROM stdin;
a327eaee-7f2c-45e4-a58b-b5330ed2b7eb	8fd61456-cef0-497a-8a4a-b88aa3aee00c	ONLINE	IDLE	NORMAL	CLOSED	4.5	65.0	\N	2026-10-31 23:02:31.955073+07	2026-10-31 23:02:31.955073+07	2026-10-31 23:02:31.955073+07
\.


--
-- TOC entry 5171 (class 0 OID 16568)
-- Dependencies: 225
-- Data for Name: machines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.machines (machine_id, machine_code, machine_name, location_name, address, lifecycle_status, min_temperature, max_temperature, alert_delay_minutes, created_at, updated_at) FROM stdin;
8fd61456-cef0-497a-8a4a-b88aa3aee00c	VM001	FreshVend Landmark 81	Tầng 1 Sảnh B - Tòa Landmark 81	720A Điện Biên Phủ, Phường 22, Bình Thạnh, TP.HCM	ACTIVE	2.0	8.0	5	2026-10-31 23:02:31.955073+07	2026-10-31 23:02:31.955073+07
\.


--
-- TOC entry 5177 (class 0 OID 16676)
-- Dependencies: 231
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (order_item_id, order_id, product_id, quantity, unit_price, subtotal) FROM stdin;
e65137e5-fb03-46a9-8ede-a5be3dec5eaa	91117d02-18ed-4b71-a72a-048a083db384	f88b5118-a85a-4488-b7ec-8d8b20d78b96	1	25000.00	25000.00
a8317b1c-e9bc-46b6-9485-11e073d589b4	91117d02-18ed-4b71-a72a-048a083db384	f9f599ea-be8e-45bd-b341-6addd5930ff8	1	15000.00	15000.00
\.


--
-- TOC entry 5176 (class 0 OID 16658)
-- Dependencies: 230
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (order_id, machine_id, order_status, total_amount, created_at, updated_at) FROM stdin;
91117d02-18ed-4b71-a72a-048a083db384	8fd61456-cef0-497a-8a4a-b88aa3aee00c	COMPLETED	40000.00	2026-10-31 22:32:31.955073+07	2026-10-31 23:02:31.955073+07
\.


--
-- TOC entry 5178 (class 0 OID 16697)
-- Dependencies: 232
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (payment_id, order_id, payment_method, payment_status, amount, transaction_reference, paid_at, created_at) FROM stdin;
e901cd22-42ed-470a-bdfe-0f5a5b50fd94	91117d02-18ed-4b71-a72a-048a083db384	QR	SUCCESS	40000.00	VNPAY_REF_20261031_0001	2026-10-31 22:33:31.955073+07	2026-10-31 22:32:31.955073+07
\.


--
-- TOC entry 5166 (class 0 OID 16499)
-- Dependencies: 220
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.permissions (permission_id, name) FROM stdin;
00e6b6ab-80fd-4226-b458-ac2ae2a100f6	MANAGE_USER
dfb86130-cfcf-4a58-ace6-4ce0dcd8bd3e	MANAGE_PRODUCT
017f4a43-4cb2-4214-bc87-80d2c71a87eb	MANAGE_INVENTORY
40cd65c4-082c-4c09-b35d-aad7d18bca0f	VIEW_MACHINE
e65bbd8f-5e6f-4058-b8af-6d40c77dad42	MANAGE_ALERT
ad1a12f3-5419-4ab8-a3e0-36b5ccfabd06	VIEW_REPORT
\.


--
-- TOC entry 5170 (class 0 OID 16547)
-- Dependencies: 224
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.products (product_id, category_id, product_name, description, unit_price, status, created_at, updated_at) FROM stdin;
f88b5118-a85a-4488-b7ec-8d8b20d78b96	5765a4da-3f51-4caa-bf2b-e554f877a3d4	Apple	Táo Envy New Zealand nhập khẩu bảo quản lạnh	25000.00	ACTIVE	2026-10-31 23:02:31.955073+07	2026-10-31 23:02:31.955073+07
3575e93f-8458-4bb2-923b-1de5cfc8a8cf	5765a4da-3f51-4caa-bf2b-e554f877a3d4	Orange	Cam sành mọng nước bổ sung Vitamin C	20000.00	ACTIVE	2026-10-31 23:02:31.955073+07	2026-10-31 23:02:31.955073+07
f9f599ea-be8e-45bd-b341-6addd5930ff8	5765a4da-3f51-4caa-bf2b-e554f877a3d4	Banana	Chuối ngự Laba sấy lạnh đóng gói	15000.00	ACTIVE	2026-10-31 23:02:31.955073+07	2026-10-31 23:02:31.955073+07
de0a7781-9a77-46ee-9677-45015de5fd69	283a2989-92e7-4e20-be8e-59d8e84cc3e0	Cold-pressed Orange Juice	Nước cam ép tươi nguyên chất chai 330ml	35000.00	ACTIVE	2026-10-31 23:02:31.955073+07	2026-10-31 23:02:31.955073+07
\.


--
-- TOC entry 5181 (class 0 OID 16764)
-- Dependencies: 235
-- Data for Name: restock_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.restock_events (restock_event_id, machine_id, user_id, restock_date, notes) FROM stdin;
8352febd-d7b6-43b3-8693-d180b693e695	8fd61456-cef0-497a-8a4a-b88aa3aee00c	a746a9bc-85c4-4c72-ad11-d9ce5b9e1310	2026-10-30 23:02:31.955073+07	Nạp đầy đủ hàng ban đầu cho các khay A01, A02, A03
\.


--
-- TOC entry 5167 (class 0 OID 16507)
-- Dependencies: 221
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.role_permissions (role_id, permission_id) FROM stdin;
2089312e-f84f-4928-a892-0a4ea44e688a	00e6b6ab-80fd-4226-b458-ac2ae2a100f6
2089312e-f84f-4928-a892-0a4ea44e688a	dfb86130-cfcf-4a58-ace6-4ce0dcd8bd3e
2089312e-f84f-4928-a892-0a4ea44e688a	017f4a43-4cb2-4214-bc87-80d2c71a87eb
2089312e-f84f-4928-a892-0a4ea44e688a	40cd65c4-082c-4c09-b35d-aad7d18bca0f
2089312e-f84f-4928-a892-0a4ea44e688a	e65bbd8f-5e6f-4058-b8af-6d40c77dad42
2089312e-f84f-4928-a892-0a4ea44e688a	ad1a12f3-5419-4ab8-a3e0-36b5ccfabd06
42f83904-588e-4c05-b677-24a12967f709	017f4a43-4cb2-4214-bc87-80d2c71a87eb
42f83904-588e-4c05-b677-24a12967f709	40cd65c4-082c-4c09-b35d-aad7d18bca0f
42f83904-588e-4c05-b677-24a12967f709	e65bbd8f-5e6f-4058-b8af-6d40c77dad42
42f83904-588e-4c05-b677-24a12967f709	ad1a12f3-5419-4ab8-a3e0-36b5ccfabd06
\.


--
-- TOC entry 5164 (class 0 OID 16476)
-- Dependencies: 218
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (role_id, name) FROM stdin;
2089312e-f84f-4928-a892-0a4ea44e688a	ADMIN
42f83904-588e-4c05-b677-24a12967f709	OPERATOR
\.


--
-- TOC entry 5173 (class 0 OID 16607)
-- Dependencies: 227
-- Data for Name: temperature_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.temperature_logs (temperature_log_id, machine_id, temperature, humidity, sensor_status, is_out_of_range, recorded_at, received_at) FROM stdin;
1173a2a8-68b5-4873-a76e-a313083ee4f6	8fd61456-cef0-497a-8a4a-b88aa3aee00c	4.2	64.5	OK	f	2026-10-31 22:47:31.955073+07	2026-10-31 22:47:31.955073+07
fe414564-9488-4e8d-8755-63753901e818	8fd61456-cef0-497a-8a4a-b88aa3aee00c	4.5	65.0	OK	f	2026-10-31 22:57:31.955073+07	2026-10-31 22:57:31.955073+07
\.


--
-- TOC entry 5165 (class 0 OID 16484)
-- Dependencies: 219
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (user_id, role_id, email, fullname, password_hash) FROM stdin;
53a91d05-2c59-4dd0-a27f-18ffa3bfaee7	2089312e-f84f-4928-a892-0a4ea44e688a	admin@freshvend.com	System Administrator	$2b$12$eA8bZ3y9Y9mY0mJk3pZzYeOQvR1tX2b8v.uV6r5aZ1kP5c7hD4p2m
a746a9bc-85c4-4c72-ad11-d9ce5b9e1310	42f83904-588e-4c05-b677-24a12967f709	operator@freshvend.com	Field Operator Huy	$2b$12$eA8bZ3y9Y9mY0mJk3pZzYeOQvR1tX2b8v.uV6r5aZ1kP5c7hD4p2m
\.


--
-- TOC entry 4989 (class 2606 OID 16758)
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (alert_id);


--
-- TOC entry 4933 (class 2606 OID 16528)
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (audit_log_id);


--
-- TOC entry 4936 (class 2606 OID 16543)
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (category_id);


--
-- TOC entry 4963 (class 2606 OID 16644)
-- Name: inventories inventories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventories
    ADD CONSTRAINT inventories_pkey PRIMARY KEY (inventory_id);


--
-- TOC entry 4985 (class 2606 OID 16730)
-- Name: machine_events machine_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_events
    ADD CONSTRAINT machine_events_pkey PRIMARY KEY (machine_event_id);


--
-- TOC entry 4958 (class 2606 OID 16629)
-- Name: machine_slots machine_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_slots
    ADD CONSTRAINT machine_slots_pkey PRIMARY KEY (slot_id);


--
-- TOC entry 4949 (class 2606 OID 16598)
-- Name: machine_statuses machine_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_statuses
    ADD CONSTRAINT machine_statuses_pkey PRIMARY KEY (machine_status_id);


--
-- TOC entry 4945 (class 2606 OID 16584)
-- Name: machines machines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_pkey PRIMARY KEY (machine_id);


--
-- TOC entry 4973 (class 2606 OID 16684)
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (order_item_id);


--
-- TOC entry 4969 (class 2606 OID 16669)
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (order_id);


--
-- TOC entry 4977 (class 2606 OID 16707)
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (payment_id);


--
-- TOC entry 4927 (class 2606 OID 16504)
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (permission_id);


--
-- TOC entry 4931 (class 2606 OID 16511)
-- Name: role_permissions pk_role_permissions; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT pk_role_permissions PRIMARY KEY (role_id, permission_id);


--
-- TOC entry 4941 (class 2606 OID 16559)
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (product_id);


--
-- TOC entry 4992 (class 2606 OID 16772)
-- Name: restock_events restock_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restock_events
    ADD CONSTRAINT restock_events_pkey PRIMARY KEY (restock_event_id);


--
-- TOC entry 4919 (class 2606 OID 16481)
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (role_id);


--
-- TOC entry 4955 (class 2606 OID 16615)
-- Name: temperature_logs temperature_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.temperature_logs
    ADD CONSTRAINT temperature_logs_pkey PRIMARY KEY (temperature_log_id);


--
-- TOC entry 4938 (class 2606 OID 16545)
-- Name: categories uq_category_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT uq_category_name UNIQUE (category_name);


--
-- TOC entry 4987 (class 2606 OID 16732)
-- Name: machine_events uq_idempotency; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_events
    ADD CONSTRAINT uq_idempotency UNIQUE (idempotency_key);


--
-- TOC entry 4965 (class 2606 OID 16646)
-- Name: inventories uq_inventory_slot; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventories
    ADD CONSTRAINT uq_inventory_slot UNIQUE (slot_id);


--
-- TOC entry 4947 (class 2606 OID 16586)
-- Name: machines uq_machine_code; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT uq_machine_code UNIQUE (machine_code);


--
-- TOC entry 4960 (class 2606 OID 16631)
-- Name: machine_slots uq_machine_slot; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_slots
    ADD CONSTRAINT uq_machine_slot UNIQUE (machine_id, slot_code);


--
-- TOC entry 4951 (class 2606 OID 16600)
-- Name: machine_statuses uq_machine_status; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_statuses
    ADD CONSTRAINT uq_machine_status UNIQUE (machine_id);


--
-- TOC entry 4975 (class 2606 OID 16686)
-- Name: order_items uq_order_product; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT uq_order_product UNIQUE (order_id, product_id);


--
-- TOC entry 4979 (class 2606 OID 16709)
-- Name: payments uq_payment_order; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT uq_payment_order UNIQUE (order_id);


--
-- TOC entry 4981 (class 2606 OID 16711)
-- Name: payments uq_payment_transaction_ref; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT uq_payment_transaction_ref UNIQUE (transaction_reference);


--
-- TOC entry 4929 (class 2606 OID 16506)
-- Name: permissions uq_permission_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT uq_permission_name UNIQUE (name);


--
-- TOC entry 4943 (class 2606 OID 16561)
-- Name: products uq_product_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT uq_product_name UNIQUE (product_name);


--
-- TOC entry 4921 (class 2606 OID 16483)
-- Name: roles uq_role_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT uq_role_name UNIQUE (name);


--
-- TOC entry 4923 (class 2606 OID 16493)
-- Name: users uq_user_email; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT uq_user_email UNIQUE (email);


--
-- TOC entry 4925 (class 2606 OID 16491)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- TOC entry 4990 (class 1259 OID 16793)
-- Name: idx_alerts_open; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_alerts_open ON public.alerts USING btree (machine_id, status) WHERE ((status)::text = 'OPEN'::text);


--
-- TOC entry 4934 (class 1259 OID 16795)
-- Name: idx_audit_logs_user_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_user_created ON public.audit_logs USING btree (user_id, created_at DESC);


--
-- TOC entry 4961 (class 1259 OID 16788)
-- Name: idx_inventories_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventories_product_id ON public.inventories USING btree (product_id);


--
-- TOC entry 4982 (class 1259 OID 16791)
-- Name: idx_machine_events_machine_occurred; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_machine_events_machine_occurred ON public.machine_events USING btree (machine_id, occurred_at DESC);


--
-- TOC entry 4983 (class 1259 OID 16792)
-- Name: idx_machine_events_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_machine_events_status ON public.machine_events USING btree (event_status) WHERE ((event_status)::text = 'RECEIVED'::text);


--
-- TOC entry 4956 (class 1259 OID 16787)
-- Name: idx_machine_slots_machine_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_machine_slots_machine_id ON public.machine_slots USING btree (machine_id);


--
-- TOC entry 4970 (class 1259 OID 16785)
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- TOC entry 4971 (class 1259 OID 16786)
-- Name: idx_order_items_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_product_id ON public.order_items USING btree (product_id);


--
-- TOC entry 4966 (class 1259 OID 16794)
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at DESC);


--
-- TOC entry 4967 (class 1259 OID 16784)
-- Name: idx_orders_machine_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_machine_id ON public.orders USING btree (machine_id);


--
-- TOC entry 4939 (class 1259 OID 16783)
-- Name: idx_products_category_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_category_id ON public.products USING btree (category_id);


--
-- TOC entry 4952 (class 1259 OID 16789)
-- Name: idx_temperature_logs_machine_recorded; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_temperature_logs_machine_recorded ON public.temperature_logs USING btree (machine_id, recorded_at DESC);


--
-- TOC entry 4953 (class 1259 OID 16790)
-- Name: idx_temperature_logs_out_of_range; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_temperature_logs_out_of_range ON public.temperature_logs USING btree (machine_id, is_out_of_range) WHERE (is_out_of_range = true);


--
-- TOC entry 5013 (class 2620 OID 16546)
-- Name: categories trg_categories_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- TOC entry 5017 (class 2620 OID 16657)
-- Name: inventories trg_inventories_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_inventories_updated_at BEFORE UPDATE ON public.inventories FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- TOC entry 5016 (class 2620 OID 16606)
-- Name: machine_statuses trg_machine_statuses_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_machine_statuses_updated_at BEFORE UPDATE ON public.machine_statuses FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- TOC entry 5015 (class 2620 OID 16587)
-- Name: machines trg_machines_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_machines_updated_at BEFORE UPDATE ON public.machines FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- TOC entry 5018 (class 2620 OID 16675)
-- Name: orders trg_orders_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- TOC entry 5014 (class 2620 OID 16567)
-- Name: products trg_products_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- TOC entry 5010 (class 2606 OID 16759)
-- Name: alerts fk_alerts_machine; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT fk_alerts_machine FOREIGN KEY (machine_id) REFERENCES public.machines(machine_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4996 (class 2606 OID 16529)
-- Name: audit_logs fk_audit_logs_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- TOC entry 5001 (class 2606 OID 16652)
-- Name: inventories fk_inventories_product; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventories
    ADD CONSTRAINT fk_inventories_product FOREIGN KEY (product_id) REFERENCES public.products(product_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 5002 (class 2606 OID 16647)
-- Name: inventories fk_inventories_slot; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventories
    ADD CONSTRAINT fk_inventories_slot FOREIGN KEY (slot_id) REFERENCES public.machine_slots(slot_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 5007 (class 2606 OID 16733)
-- Name: machine_events fk_machine_events_machine; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_events
    ADD CONSTRAINT fk_machine_events_machine FOREIGN KEY (machine_id) REFERENCES public.machines(machine_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 5008 (class 2606 OID 16738)
-- Name: machine_events fk_machine_events_order; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_events
    ADD CONSTRAINT fk_machine_events_order FOREIGN KEY (order_id) REFERENCES public.orders(order_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- TOC entry 5009 (class 2606 OID 16743)
-- Name: machine_events fk_machine_events_slot; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_events
    ADD CONSTRAINT fk_machine_events_slot FOREIGN KEY (slot_id) REFERENCES public.machine_slots(slot_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- TOC entry 5000 (class 2606 OID 16632)
-- Name: machine_slots fk_machine_slots_machine; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_slots
    ADD CONSTRAINT fk_machine_slots_machine FOREIGN KEY (machine_id) REFERENCES public.machines(machine_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4998 (class 2606 OID 16601)
-- Name: machine_statuses fk_machine_statuses_machine; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.machine_statuses
    ADD CONSTRAINT fk_machine_statuses_machine FOREIGN KEY (machine_id) REFERENCES public.machines(machine_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 5004 (class 2606 OID 16687)
-- Name: order_items fk_order_items_order; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES public.orders(order_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 5005 (class 2606 OID 16692)
-- Name: order_items fk_order_items_product; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES public.products(product_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 5003 (class 2606 OID 16670)
-- Name: orders fk_orders_machine; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_orders_machine FOREIGN KEY (machine_id) REFERENCES public.machines(machine_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 5006 (class 2606 OID 16712)
-- Name: payments fk_payments_order; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES public.orders(order_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4997 (class 2606 OID 16562)
-- Name: products fk_products_category; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 5011 (class 2606 OID 16773)
-- Name: restock_events fk_restock_events_machine; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restock_events
    ADD CONSTRAINT fk_restock_events_machine FOREIGN KEY (machine_id) REFERENCES public.machines(machine_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 5012 (class 2606 OID 16778)
-- Name: restock_events fk_restock_events_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.restock_events
    ADD CONSTRAINT fk_restock_events_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4994 (class 2606 OID 16517)
-- Name: role_permissions fk_role_permissions_permission; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES public.permissions(permission_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4995 (class 2606 OID 16512)
-- Name: role_permissions fk_role_permissions_role; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES public.roles(role_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4999 (class 2606 OID 16616)
-- Name: temperature_logs fk_temperature_logs_machine; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.temperature_logs
    ADD CONSTRAINT fk_temperature_logs_machine FOREIGN KEY (machine_id) REFERENCES public.machines(machine_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4993 (class 2606 OID 16494)
-- Name: users fk_users_role; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES public.roles(role_id) ON UPDATE CASCADE ON DELETE RESTRICT;


-- Completed on 2026-11-01 16:43:38

--
-- PostgreSQL database dump complete
--

