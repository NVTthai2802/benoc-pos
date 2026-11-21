-- Bé Nốc POS — schema mốc (baseline) lấy từ Supabase Product 22/11/2026 00:07
-- Sinh tự động từ pg_catalog. Dùng để dựng môi trường mới; KHÔNG chạy lại trên Product.

set check_function_bodies = off;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

-- ===== Kiểu dữ liệu, sequence =====
create type public.order_status as enum ('cho_nhan', 'dang_lam', 'da_ra_mon');
create type public.staff_role as enum ('owner', 'kitchen', 'staff', 'bar');
create sequence if not exists public.bank_txns_id_seq;
create sequence if not exists public.bot_photos_id_seq;
create sequence if not exists public.chat_captures_id_seq;
create sequence if not exists public.fb_messages_id_seq;
create sequence if not exists public.fb_train_id_seq;
create sequence if not exists public.menu_categories_id_seq;
create sequence if not exists public.option_choices_id_seq;
create sequence if not exists public.option_groups_id_seq;
create sequence if not exists public.order_changes_id_seq;
create sequence if not exists public.order_items_id_seq;
create sequence if not exists public.promotion_items_id_seq;
create sequence if not exists public.staff_calls_id_seq;
create sequence if not exists public.stock_moves_id_seq;
create sequence if not exists public.stock_packs_id_seq;
create sequence if not exists public.stock_receipts_id_seq;

-- ===== Bảng =====
create table if not exists private.bot_link (
   code text not null,
   until timestamp with time zone not null,
   created_by text,
  constraint bot_link_pkey PRIMARY KEY (code));

create table if not exists private.order_edit_tx (
   order_id uuid not null,
   txid bigint not null,
   before jsonb not null,
   before_total integer,
  constraint order_edit_tx_pkey PRIMARY KEY (order_id, txid));

create table if not exists private.sepay_config (
   id integer default 1 not null,
   api_key text default replace((gen_random_uuid())::text, '-'::text, ''::text) not null,
  constraint sepay_config_pkey PRIMARY KEY (id),
  constraint sepay_config_id_check CHECK ((id = 1)));

create table if not exists public.bank_txns (
   id bigint default nextval('bank_txns_id_seq'::regclass) not null,
   sepay_id bigint,
   amount integer not null,
   content text,
   ref text,
   txn_at timestamp with time zone,
   pay_code text,
   order_id uuid,
   status text default 'chua_khop'::text not null,
   note text,
   created_at timestamp with time zone default now() not null,
   src text default 'sepay'::text not null,
   src_hash text,
   device text,
   sale_id uuid,
   reviewed_at timestamp with time zone,
   reviewed_by uuid,
  constraint bank_txns_sepay_id_key UNIQUE (sepay_id),
  constraint bank_txns_pkey PRIMARY KEY (id),
  constraint bank_txns_status_check CHECK ((status = ANY (ARRAY['da_khop'::text, 'thieu_tien'::text, 'chua_khop'::text, 'don_da_thu'::text, 'mau'::text, 'khong_ma'::text]))));

create table if not exists public.bot_photos (
   id bigint default nextval('bot_photos_id_seq'::regclass) not null,
   kenh text not null,
   chat_id text not null,
   ref text not null,
   caption text,
   done boolean default false not null,
   created_at timestamp with time zone default now() not null,
  constraint bot_photos_pkey PRIMARY KEY (id));

create table if not exists public.bot_users (
   kenh text not null,
   chat_id text not null,
   name text,
   created_at timestamp with time zone default now() not null,
  constraint bot_users_pkey PRIMARY KEY (kenh, chat_id),
  constraint bot_users_kenh_check CHECK ((kenh = ANY (ARRAY['zalo'::text, 'tele'::text]))));

create table if not exists public.chat_captures (
   id bigint generated always as identity not null,
   created_at timestamp with time zone default now() not null,
   source text default 'ios-shortcut'::text not null,
   device text,
   image_path text not null,
   image_sha256 text not null,
   image_bytes integer,
   image_type text,
   ios_text text,
   ai_model text,
   ai_ms integer,
   ai_json jsonb,
   ai_text text,
   ai_error text,
   status text default 'new'::text not null,
   label_json jsonb,
   note text,
  constraint chat_captures_image_sha256_key UNIQUE (image_sha256),
  constraint chat_captures_pkey PRIMARY KEY (id),
  constraint chat_captures_status_check CHECK ((status = ANY (ARRAY['new'::text, 'seen'::text, 'labeled'::text, 'ignored'::text]))));

create table if not exists public.employees (
   id uuid default gen_random_uuid() not null,
   auth_user_id uuid,
   full_name text not null,
   phone text,
   role staff_role default 'staff'::staff_role not null,
   hourly_rate integer default 0 not null,
   is_active boolean default true not null,
   created_at timestamp with time zone default now() not null,
  constraint employees_auth_user_id_key UNIQUE (auth_user_id),
  constraint employees_pkey PRIMARY KEY (id),
  constraint employees_hourly_rate_check CHECK ((hourly_rate >= 0)));

create table if not exists public.fb_drafts (
   id uuid default gen_random_uuid() not null,
   psid text,
   status text default 'dang_hoi'::text not null,
   dine_type text,
   at timestamp with time zone,
   customer_name text,
   customer_phone text,
   address text,
   note text,
   items jsonb default '[]'::jsonb not null,
   unknown jsonb default '[]'::jsonb not null,
   missing text[] default '{}'::text[] not null,
   total_est integer default 0 not null,
   changed_after boolean default false not null,
   asked text[] default '{}'::text[] not null,
   order_id uuid,
   approved_by text,
   approved_at timestamp with time zone,
   created_at timestamp with time zone default now() not null,
   updated_at timestamp with time zone default now() not null,
   kenh text default 'fb'::text not null,
   chat_id text,
   nguoi_gui text,
   anh text[] default '{}'::text[] not null,
   convo jsonb default '[]'::jsonb not null,
  constraint fb_drafts_pkey PRIMARY KEY (id),
  constraint fb_drafts_dine_type_check CHECK ((dine_type = ANY (ARRAY['mang_ve'::text, 'tai_quan'::text, 'giao_hang'::text]))),
  constraint fb_drafts_kenh_check CHECK ((kenh = ANY (ARRAY['fb'::text, 'zalo'::text, 'tele'::text, 'ios'::text]))),
  constraint fb_drafts_status_check CHECK ((status = ANY (ARRAY['dang_hoi'::text, 'cho_duyet'::text, 'da_duyet'::text, 'huy'::text]))));

create table if not exists public.fb_messages (
   id bigint default nextval('fb_messages_id_seq'::regclass) not null,
   psid text not null,
   mid text,
   sender text not null,
   text text,
   created_at timestamp with time zone default now() not null,
  constraint fb_messages_mid_key UNIQUE (mid),
  constraint fb_messages_pkey PRIMARY KEY (id),
  constraint fb_messages_sender_check CHECK ((sender = ANY (ARRAY['khach'::text, 'bot'::text, 'quan'::text]))));

create table if not exists public.fb_threads (
   psid text not null,
   name text,
   link text,
   paused_until timestamp with time zone,
   need_human boolean default false not null,
   last_at timestamp with time zone default now() not null,
   created_at timestamp with time zone default now() not null,
  constraint fb_threads_pkey PRIMARY KEY (psid));

create table if not exists public.fb_train (
   id bigint default nextval('fb_train_id_seq'::regclass) not null,
   created_at timestamp with time zone default now() not null,
   thread_hash text not null,
   draft_id uuid,
   now_vn text not null,
   convo jsonb default '[]'::jsonb not null,
   state_before jsonb default '{}'::jsonb not null,
   intent text,
   target jsonb,
   answer text,
   model text,
   menu_hash text,
   outcome text default 'chua_ro'::text not null,
   final jsonb,
   edits text[],
  constraint fb_train_pkey PRIMARY KEY (id),
  constraint fb_train_outcome_check CHECK ((outcome = ANY (ARRAY['chua_ro'::text, 'da_duyet'::text, 'huy'::text]))));

create table if not exists public.fb_train_menu (
   hash text not null,
   menu jsonb not null,
   created_at timestamp with time zone default now() not null,
  constraint fb_train_menu_pkey PRIMARY KEY (hash));

create table if not exists public.menu_categories (
   id integer default nextval('menu_categories_id_seq'::regclass) not null,
   name text not null,
   color text default 'vang'::text not null,
   sort_order integer default 0 not null,
   station text default 'bep'::text not null,
  constraint menu_categories_pkey PRIMARY KEY (id),
  constraint menu_categories_color_check CHECK ((color = ANY (ARRAY['vang'::text, 'cam'::text, 'hong'::text, 'xanhla'::text, 'xanhduong'::text, 'tim'::text, 'nau'::text]))),
  constraint menu_categories_station_check CHECK ((station = ANY (ARRAY['bep'::text, 'pha_che'::text]))));

create table if not exists public.menu_item_option_groups (
   menu_item_id uuid not null,
   group_id integer not null,
   sort_order integer default 0 not null,
  constraint menu_item_option_groups_pkey PRIMARY KEY (menu_item_id, group_id));

create table if not exists public.menu_items (
   id uuid default gen_random_uuid() not null,
   category_id integer,
   name text not null,
   description text,
   price integer not null,
   image_path text,
   prep_minutes integer default 5 not null,
   tag text,
   is_available boolean default true not null,
   sort_order integer default 0 not null,
  constraint menu_items_pkey PRIMARY KEY (id),
  constraint menu_items_prep_minutes_check CHECK ((prep_minutes > 0)),
  constraint menu_items_price_check CHECK ((price >= 0)));

create table if not exists public.monitor_samples (
   at timestamp with time zone default now() not null,
   rest_ms integer,
   auth_ms integer,
   storage_ms integer,
   site_ms integer,
   rpc_ms integer,
   rest_ok boolean,
   auth_ok boolean,
   storage_ok boolean,
   site_ok boolean,
   conns integer,
   conns_max integer,
   db_bytes bigint,
   cache_hit numeric,
   locks integer,
   long_q integer,
   active_orders integer,
   stale_orders integer,
   xact_commit bigint,
   deadlocks bigint,
   colo text,
  constraint monitor_samples_pkey PRIMARY KEY (at));

create table if not exists public.option_choices (
   id integer default nextval('option_choices_id_seq'::regclass) not null,
   group_id integer not null,
   name text not null,
   price_delta integer default 0 not null,
   is_default boolean default false not null,
   is_available boolean default true not null,
   sort_order integer default 0 not null,
  constraint option_choices_pkey PRIMARY KEY (id),
  constraint option_choices_price_delta_check CHECK ((price_delta >= 0)));

create table if not exists public.option_groups (
   id integer default nextval('option_groups_id_seq'::regclass) not null,
   name text not null,
   title text not null,
   min_select integer default 0 not null,
   max_select integer default 1 not null,
   sort_order integer default 0 not null,
   kind text default 'do_an'::text not null,
  constraint option_groups_name_key UNIQUE (name),
  constraint option_groups_pkey PRIMARY KEY (id),
  constraint option_groups_check CHECK ((max_select >= min_select)),
  constraint option_groups_kind_check CHECK ((kind = ANY (ARRAY['do_an'::text, 'do_uong'::text]))),
  constraint option_groups_max_select_check CHECK ((max_select >= 1)),
  constraint option_groups_min_select_check CHECK ((min_select >= 0)));

create table if not exists public.order_changes (
   id bigint default nextval('order_changes_id_seq'::regclass) not null,
   order_id uuid not null,
   token uuid,
   kind text not null,
   lines jsonb default '[]'::jsonb not null,
   by_staff boolean default true not null,
   created_at timestamp with time zone default now() not null,
  constraint order_changes_pkey PRIMARY KEY (id),
  constraint order_changes_kind_check CHECK ((kind = ANY (ARRAY['sua'::text, 'huy'::text]))));

create table if not exists public.order_items (
   id bigint default nextval('order_items_id_seq'::regclass) not null,
   order_id uuid not null,
   menu_item_id uuid,
   item_name text not null,
   unit_price integer not null,
   options jsonb default '[]'::jsonb not null,
   qty integer not null,
   note text,
   station text default 'bep'::text not null,
   added_at timestamp with time zone default now() not null,
   promo_id uuid,
   promo_name text,
   promo_kind text,
   promo_group uuid,
   promo_part text,
   edited_at timestamp with time zone,
   promo_units integer,
  constraint order_items_pkey PRIMARY KEY (id),
  constraint order_items_qty_check CHECK (((qty >= 1) AND (qty <= 50))),
  constraint order_items_station_check CHECK ((station = ANY (ARRAY['bep'::text, 'pha_che'::text]))));

create table if not exists public.order_stations (
   order_id uuid not null,
   station text not null,
   status order_status default 'cho_nhan'::order_status not null,
   accepted_at timestamp with time zone,
   estimated_ready_at timestamp with time zone,
   served_at timestamp with time zone,
  constraint order_stations_pkey PRIMARY KEY (order_id, station),
  constraint order_stations_station_check CHECK ((station = ANY (ARRAY['bep'::text, 'pha_che'::text]))));

create table if not exists public.orders (
   id uuid default gen_random_uuid() not null,
   access_token uuid default gen_random_uuid() not null,
   queue_number integer,
   customer_name text not null,
   customer_phone text,
   note text,
   status order_status default 'cho_nhan'::order_status not null,
   total integer default 0 not null,
   created_at timestamp with time zone default now() not null,
   accepted_at timestamp with time zone,
   estimated_ready_at timestamp with time zone,
   served_at timestamp with time zone,
   dine_type text default 'tai_quan'::text not null,
   address text,
   deliver_at timestamp with time zone,
   paid_amount integer,
   paid_method text,
   paid_at timestamp with time zone,
   paid_by uuid,
   source text default 'qr'::text not null,
  constraint orders_access_token_key UNIQUE (access_token),
  constraint orders_pkey PRIMARY KEY (id),
  constraint orders_customer_name_check CHECK ((length(TRIM(BOTH FROM customer_name)) > 0)),
  constraint orders_dine_type_check CHECK ((dine_type = ANY (ARRAY['tai_quan'::text, 'mang_ve'::text, 'giao_hang'::text]))),
  constraint orders_paid_method_check CHECK ((paid_method = ANY (ARRAY['tien_mat'::text, 'chuyen_khoan'::text]))),
  constraint orders_queue_number_check CHECK ((queue_number > 0)),
  constraint orders_queue_or_takeaway CHECK (((dine_type <> 'tai_quan'::text) OR (queue_number IS NOT NULL) OR (source = 'fb'::text))),
  constraint orders_source_check CHECK ((source = ANY (ARRAY['qr'::text, 'quan'::text, 'fb'::text]))));

create table if not exists public.promotion_items (
   id bigint default nextval('promotion_items_id_seq'::regclass) not null,
   promotion_id uuid not null,
   part text not null,
   menu_item_id uuid not null,
   qty integer default 1 not null,
   sort_order integer default 0 not null,
  constraint promotion_items_promotion_id_part_menu_item_id_key UNIQUE (promotion_id, part, menu_item_id),
  constraint promotion_items_pkey PRIMARY KEY (id),
  constraint promotion_items_part_check CHECK ((part = ANY (ARRAY['combo'::text, 'mua'::text, 'tang'::text, 'giam'::text]))),
  constraint promotion_items_qty_check CHECK (((qty >= 1) AND (qty <= 20))));

create table if not exists public.promotions (
   id uuid default gen_random_uuid() not null,
   name text not null,
   kind text not null,
   description text,
   image_path text,
   price integer,
   buy_qty integer default 1 not null,
   get_qty integer default 1 not null,
   gift_same boolean default false not null,
   option_mode text default 'cong_them'::text not null,
   start_at timestamp with time zone,
   end_at timestamp with time zone,
   days integer[],
   time_from time without time zone,
   time_to time without time zone,
   is_active boolean default true not null,
   sort_order integer default 0 not null,
   created_at timestamp with time zone default now() not null,
   sale_mode text default 'dong_gia'::text not null,
   sale_value integer,
   gift_name text,
   gift_station text default 'pha_che'::text not null,
   limit_qty integer,
   limit_per text default 'ngay'::text not null,
   min_total integer,
   need_qty integer,
   dine_types text[],
  constraint promotions_pkey PRIMARY KEY (id),
  constraint promotions_buy_qty_check CHECK (((buy_qty >= 1) AND (buy_qty <= 20))),
  constraint promotions_get_qty_check CHECK (((get_qty >= 1) AND (get_qty <= 20))),
  constraint promotions_gift_station_check CHECK ((gift_station = ANY (ARRAY['bep'::text, 'pha_che'::text]))),
  constraint promotions_kind_check CHECK ((kind = ANY (ARRAY['combo'::text, 'mua_tang'::text, 'giam_gia'::text, 'don_tang'::text]))),
  constraint promotions_limit_per_check CHECK ((limit_per = ANY (ARRAY['ngay'::text, 'tong'::text]))),
  constraint promotions_limit_qty_check CHECK (((limit_qty IS NULL) OR (limit_qty > 0))),
  constraint promotions_min_total_check CHECK (((min_total IS NULL) OR (min_total > 0))),
  constraint promotions_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
  constraint promotions_need_qty_check CHECK (((need_qty IS NULL) OR (need_qty > 0))),
  constraint promotions_option_mode_check CHECK ((option_mode = ANY (ARRAY['cong_them'::text, 'mien_phi'::text, 'khong_phi'::text]))),
  constraint promotions_price_check CHECK ((price >= 0)),
  constraint promotions_sale_mode_check CHECK ((sale_mode = ANY (ARRAY['dong_gia'::text, 'phan_tram'::text, 'tru_tien'::text]))),
  constraint promotions_sale_value_check CHECK (((sale_value IS NULL) OR (sale_value >= 0))));

create table if not exists public.sales (
   id uuid not null,
   queue_number integer,
   total integer not null,
   payment_method text not null,
   items jsonb not null,
   ordered_at timestamp with time zone not null,
   accepted_at timestamp with time zone,
   served_at timestamp with time zone,
   paid_at timestamp with time zone default now() not null,
   cook_minutes integer,
   cashier_id uuid,
   station_minutes jsonb,
   dine_type text default 'tai_quan'::text not null,
   customer_name text,
   customer_phone text,
   address text,
   source text default 'pos'::text not null,
   bank_txn_id bigint,
  constraint sales_pkey PRIMARY KEY (id),
  constraint sales_dine_type_check CHECK ((dine_type = ANY (ARRAY['tai_quan'::text, 'mang_ve'::text, 'giao_hang'::text]))),
  constraint sales_payment_method_check CHECK ((payment_method = ANY (ARRAY['tien_mat'::text, 'chuyen_khoan'::text]))),
  constraint sales_source_check CHECK ((source = ANY (ARRAY['pos'::text, 'khong_ma'::text]))));

create table if not exists public.shifts (
   id uuid default gen_random_uuid() not null,
   employee_id uuid not null,
   employee_name text not null,
   check_in_at timestamp with time zone default now() not null,
   check_in_photo text not null,
   check_out_at timestamp with time zone,
   check_out_photo text,
   hourly_rate integer not null,
   round_minutes integer,
   round_mode text,
   actual_minutes integer generated always as (
CASE
    WHEN (check_out_at IS NULL) THEN NULL::integer
    ELSE (floor((EXTRACT(epoch FROM (check_out_at - check_in_at)) / (60)::numeric)))::integer
END) stored,
   paid_minutes integer,
   pay_amount integer,
   note text,
   paid_out_at timestamp with time zone,
   pay_round integer,
  constraint shifts_pkey PRIMARY KEY (id),
  constraint shifts_check CHECK (((check_out_at IS NULL) OR (check_out_at > check_in_at))));

create table if not exists public.shop_settings (
   id integer default 1 not null,
   shop_name text default 'Quán của tôi'::text not null,
   round_minutes integer default 1 not null,
   round_mode text default 'nearest'::text not null,
   kitchen_capacity integer default 2 not null,
   updated_at timestamp with time zone default now() not null,
   pay_round integer default 1000 not null,
   bar_capacity integer default 2 not null,
   fb_bot_on boolean default true not null,
   fb_open text default '07:00'::text not null,
   fb_close text default '22:00'::text not null,
   fb_hello text,
   fb_train_on boolean default true not null,
   bank_bin text default '970422'::text not null,
   bank_name text default 'MB Bank'::text not null,
   bank_account text default '0393247469'::text not null,
   bank_holder text default ''::text not null,
   bank_note text default 'BENOC {ban} {ten}'::text not null,
  constraint shop_settings_pkey PRIMARY KEY (id),
  constraint shop_settings_bar_capacity_check CHECK ((bar_capacity > 0)),
  constraint shop_settings_id_check CHECK ((id = 1)),
  constraint shop_settings_kitchen_capacity_check CHECK ((kitchen_capacity > 0)),
  constraint shop_settings_pay_round_check CHECK ((pay_round = ANY (ARRAY[1, 100, 500, 1000]))),
  constraint shop_settings_round_minutes_check CHECK ((round_minutes = ANY (ARRAY[1, 5, 10, 15, 30, 60]))),
  constraint shop_settings_round_mode_check CHECK ((round_mode = ANY (ARRAY['up'::text, 'down'::text, 'nearest'::text]))));

create table if not exists public.staff_calls (
   id bigint default nextval('staff_calls_id_seq'::regclass) not null,
   order_id uuid,
   queue_number integer,
   message text,
   created_at timestamp with time zone default now() not null,
   resolved_at timestamp with time zone,
  constraint staff_calls_pkey PRIMARY KEY (id));

create table if not exists public.stock_barcodes (
   code text not null,
   item_id uuid not null,
   unit_kind text default 'buy'::text not null,
   created_by text,
   created_at timestamp with time zone default now() not null,
  constraint stock_barcodes_pkey PRIMARY KEY (code),
  constraint stock_barcodes_code_check CHECK ((code ~ '^[0-9A-Za-z.\-]{3,64}$'::text)),
  constraint stock_barcodes_unit_kind_check CHECK ((unit_kind = ANY (ARRAY['buy'::text, 'use'::text]))));

create table if not exists public.stock_items (
   id uuid default gen_random_uuid() not null,
   name text not null,
   grp text,
   use_unit text default 'gói'::text not null,
   buy_unit text default 'thùng'::text not null,
   per_buy numeric default 1 not null,
   qty numeric default 0 not null,
   min_qty numeric default 0 not null,
   cost_per_buy integer,
   note text,
   is_active boolean default true not null,
   sort_order integer default 0 not null,
   created_at timestamp with time zone default now() not null,
   pack_id bigint,
  constraint stock_items_pkey PRIMARY KEY (id),
  constraint stock_items_cost_per_buy_check CHECK ((cost_per_buy >= 0)),
  constraint stock_items_min_qty_check CHECK ((min_qty >= (0)::numeric)),
  constraint stock_items_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
  constraint stock_items_per_buy_check CHECK ((per_buy > (0)::numeric)));

create table if not exists public.stock_moves (
   id bigint default nextval('stock_moves_id_seq'::regclass) not null,
   item_id uuid not null,
   kind text not null,
   delta numeric not null,
   qty_after numeric not null,
   amount numeric not null,
   unit text not null,
   cost integer,
   note text,
   employee_id uuid,
   employee_name text,
   created_at timestamp with time zone default now() not null,
   receipt_id bigint,
  constraint stock_moves_pkey PRIMARY KEY (id),
  constraint stock_moves_kind_check CHECK ((kind = ANY (ARRAY['nhap'::text, 'dung'::text, 'hong'::text, 'kiem'::text]))));

create table if not exists public.stock_packs (
   id bigint default nextval('stock_packs_id_seq'::regclass) not null,
   name text not null,
   buy_unit text not null,
   use_unit text not null,
   per_buy numeric not null,
   sort_order integer default 0 not null,
  constraint stock_packs_name_key UNIQUE (name),
  constraint stock_packs_pkey PRIMARY KEY (id),
  constraint stock_packs_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
  constraint stock_packs_per_buy_check CHECK ((per_buy > (0)::numeric)));

create table if not exists public.stock_receipts (
   id bigint default nextval('stock_receipts_id_seq'::regclass) not null,
   photo_path text not null,
   supplier text,
   invoice_no text,
   note text,
   employee_id uuid,
   employee_name text,
   created_at timestamp with time zone default now() not null,
  constraint stock_receipts_pkey PRIMARY KEY (id));

alter sequence public.fb_messages_id_seq owned by public.fb_messages.id;
alter sequence public.stock_moves_id_seq owned by public.stock_moves.id;
alter sequence public.fb_train_id_seq owned by public.fb_train.id;
alter sequence public.promotion_items_id_seq owned by public.promotion_items.id;
alter sequence public.bank_txns_id_seq owned by public.bank_txns.id;
alter sequence public.stock_packs_id_seq owned by public.stock_packs.id;
alter sequence public.menu_categories_id_seq owned by public.menu_categories.id;
alter sequence public.option_groups_id_seq owned by public.option_groups.id;
alter sequence public.option_choices_id_seq owned by public.option_choices.id;
alter sequence public.order_items_id_seq owned by public.order_items.id;
alter sequence public.staff_calls_id_seq owned by public.staff_calls.id;
alter sequence public.bot_photos_id_seq owned by public.bot_photos.id;
alter sequence public.order_changes_id_seq owned by public.order_changes.id;
alter sequence public.stock_receipts_id_seq owned by public.stock_receipts.id;

-- ===== Khoá ngoại =====
alter table public.employees add constraint employees_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.fb_drafts add constraint fb_drafts_psid_fkey FOREIGN KEY (psid) REFERENCES fb_threads(psid) ON DELETE CASCADE;
alter table public.fb_messages add constraint fb_messages_psid_fkey FOREIGN KEY (psid) REFERENCES fb_threads(psid) ON DELETE CASCADE;
alter table public.menu_item_option_groups add constraint menu_item_option_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES option_groups(id) ON DELETE CASCADE;
alter table public.menu_item_option_groups add constraint menu_item_option_groups_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE;
alter table public.menu_items add constraint menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE SET NULL;
alter table public.option_choices add constraint option_choices_group_id_fkey FOREIGN KEY (group_id) REFERENCES option_groups(id) ON DELETE CASCADE;
alter table public.order_items add constraint order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL;
alter table public.order_items add constraint order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.order_items add constraint order_items_promo_id_fkey FOREIGN KEY (promo_id) REFERENCES promotions(id) ON DELETE SET NULL;
alter table public.order_stations add constraint order_stations_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.orders add constraint orders_paid_by_fkey FOREIGN KEY (paid_by) REFERENCES employees(id);
alter table public.promotion_items add constraint promotion_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE;
alter table public.promotion_items add constraint promotion_items_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE;
alter table public.sales add constraint sales_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES employees(id);
alter table public.shifts add constraint shifts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
alter table public.staff_calls add constraint staff_calls_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.stock_barcodes add constraint stock_barcodes_item_id_fkey FOREIGN KEY (item_id) REFERENCES stock_items(id) ON DELETE CASCADE;
alter table public.stock_items add constraint stock_items_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES stock_packs(id) ON DELETE SET NULL;
alter table public.stock_moves add constraint stock_moves_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
alter table public.stock_moves add constraint stock_moves_item_id_fkey FOREIGN KEY (item_id) REFERENCES stock_items(id) ON DELETE CASCADE;
alter table public.stock_moves add constraint stock_moves_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES stock_receipts(id) ON DELETE SET NULL;
alter table public.stock_receipts add constraint stock_receipts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

-- ===== Chỉ mục =====
CREATE INDEX bank_txns_created ON public.bank_txns USING btree (created_at DESC);
CREATE INDEX bot_photos_wait ON public.bot_photos USING btree (kenh, chat_id, id) WHERE (NOT done);
CREATE INDEX chat_captures_created_idx ON public.chat_captures USING btree (created_at DESC);
CREATE INDEX fb_drafts_chat ON public.fb_drafts USING btree (kenh, chat_id, updated_at DESC) WHERE (chat_id IS NOT NULL);
CREATE INDEX fb_drafts_psid ON public.fb_drafts USING btree (psid, updated_at DESC);
CREATE INDEX fb_drafts_status ON public.fb_drafts USING btree (status, updated_at DESC);
CREATE INDEX fb_messages_thread ON public.fb_messages USING btree (psid, created_at DESC);
CREATE INDEX fb_train_draft ON public.fb_train USING btree (draft_id) WHERE (draft_id IS NOT NULL);
CREATE INDEX fb_train_thread ON public.fb_train USING btree (thread_hash);
CREATE INDEX menu_item_option_groups_group_id_idx ON public.menu_item_option_groups USING btree (group_id);
CREATE INDEX menu_items_category_id_idx ON public.menu_items USING btree (category_id);
CREATE INDEX option_choices_group_id_idx ON public.option_choices USING btree (group_id);
CREATE INDEX order_changes_token ON public.order_changes USING btree (token);
CREATE INDEX order_items_menu_item_id_idx ON public.order_items USING btree (menu_item_id);
CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);
CREATE INDEX order_items_promo_id_idx ON public.order_items USING btree (promo_id);
CREATE INDEX order_stations_station_status ON public.order_stations USING btree (station, status);
CREATE INDEX orders_paid_by_idx ON public.orders USING btree (paid_by);
CREATE INDEX orders_queue_number ON public.orders USING btree (queue_number);
CREATE INDEX orders_status_created ON public.orders USING btree (status, created_at);
CREATE INDEX promotion_items_menu_item_id_idx ON public.promotion_items USING btree (menu_item_id);
CREATE INDEX promotion_items_promo ON public.promotion_items USING btree (promotion_id);
CREATE INDEX sales_cashier_id_idx ON public.sales USING btree (cashier_id);
CREATE INDEX sales_paid_at ON public.sales USING btree (paid_at DESC);
CREATE INDEX shifts_employee_time ON public.shifts USING btree (employee_id, check_in_at DESC);
CREATE INDEX staff_calls_order_id_idx ON public.staff_calls USING btree (order_id);
CREATE INDEX stock_barcodes_item ON public.stock_barcodes USING btree (item_id);
CREATE INDEX stock_items_pack_id_idx ON public.stock_items USING btree (pack_id);
CREATE INDEX stock_moves_employee_id_idx ON public.stock_moves USING btree (employee_id);
CREATE INDEX stock_moves_item_time ON public.stock_moves USING btree (item_id, created_at DESC);
CREATE INDEX stock_moves_receipt ON public.stock_moves USING btree (receipt_id) WHERE (receipt_id IS NOT NULL);
CREATE INDEX stock_moves_time ON public.stock_moves USING btree (created_at DESC);
CREATE INDEX stock_receipts_employee_id_idx ON public.stock_receipts USING btree (employee_id);
CREATE INDEX stock_receipts_time ON public.stock_receipts USING btree (created_at DESC);
CREATE UNIQUE INDEX bank_txns_src_hash ON public.bank_txns USING btree (src_hash);
CREATE UNIQUE INDEX one_open_shift_per_employee ON public.shifts USING btree (employee_id) WHERE (check_out_at IS NULL);

-- ===== Hàm =====
CREATE OR REPLACE FUNCTION private.add_items(p_order uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  it           jsonb;
  mi           menu_items;
  v_qty        int;
  v_extra      int;
  v_opts       jsonb;
  v_choice_ids int[];
  v_station    text;
  v_price      int;
  v_promo      uuid;
  v_pname      text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if it ? 'promo_id' then
      perform private.add_promo(p_order, it);
      continue;
    end if;
    select * into mi from menu_items where id = (it ->> 'menu_item_id')::uuid and is_available;
    if not found then
      raise exception 'ITEM_UNAVAILABLE' using hint = coalesce(it ->> 'menu_item_id', '');
    end if;
    v_qty := least(greatest(coalesce((it ->> 'qty')::int, 1), 1), 50);
    v_choice_ids := array(select e::int
                            from jsonb_array_elements_text(coalesce(it -> 'choice_ids', '[]'::jsonb)) e);
    select o_extra, o_opts into v_extra, v_opts from private.item_options(mi.id, v_choice_ids);
    select coalesce((select mc.station from menu_categories mc where mc.id = mi.category_id), 'bep')
      into v_station;
    select o_price, o_promo, o_name into v_price, v_promo, v_pname
      from private.sale_price(mi.id, nullif(it ->> 'sale_id', '')::uuid, v_qty);
    insert into order_items (order_id, menu_item_id, item_name, unit_price, options, qty, note, station,
                             promo_id, promo_name, promo_kind, promo_part)
    values (p_order, mi.id, mi.name, v_price + v_extra, v_opts, v_qty, nullif(trim(it ->> 'note'), ''), v_station,
            v_promo, v_pname, case when v_promo is not null then 'giam_gia' end, case when v_promo is not null then 'giam' end);
  end loop;

  perform private.apply_gifts(p_order);   -- đủ mốc thì tự thêm quà

  insert into order_stations (order_id, station)
  select distinct p_order, station from order_items where order_id = p_order
  on conflict (order_id, station) do nothing;
  update order_stations s
     set status = 'cho_nhan', accepted_at = null, estimated_ready_at = null, served_at = null
   where s.order_id = p_order and s.status = 'da_ra_mon'
     and exists (select 1 from order_items i where i.order_id = p_order and i.station = s.station and i.added_at > s.served_at);

  update orders set total = (select coalesce(sum(unit_price * qty), 0) from order_items where order_id = p_order)
   where id = p_order;
end $function$
;
CREATE OR REPLACE FUNCTION private.add_promo(p_order uuid, p_pkg jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p        promotions;
  u        jsonb;
  mi       menu_items;
  v_k      int;
  v_part   text;
  v_ids    int[];
  v_extra  int;
  v_opts   jsonb;
  v_sum    int;
  v_first  int;
  v_group  uuid := gen_random_uuid();
  v_i      int := 0;
  v_left   int;
  v_gift   text;
  v_units  int;
  v_need   int;
  r        record;
begin
  select * into p from promotions where id = nullif(p_pkg ->> 'promo_id', '')::uuid;
  -- Cho 10 phút du di: khách bỏ vào giỏ lúc 16:58, gửi lúc 17:02 vẫn được giá ưu đãi
  if not found or not (promo_live(p) or promo_live(p, now() - interval '10 minutes')) then
    raise exception 'PROMO_ENDED' using hint = coalesce(p.name, '');
  end if;
  v_k := least(greatest(coalesce((p_pkg ->> 'qty')::int, 1), 1), 20);
  -- Giới hạn số suất (khoá theo ưu đãi để 2 khách đặt cùng lúc không vượt)
  if p.limit_qty is not null then
    perform pg_advisory_xact_lock(hashtext('promo:' || p.id::text));
    v_left := private.promo_left(p);
    if v_left < v_k then
      raise exception 'PROMO_SOLD_OUT' using hint = case when v_left > 0
        then format('%s chỉ còn %s suất. Bớt số phần rồi gửi lại.', p.name, v_left)
        else format('%s vừa hết suất. Bỏ ưu đãi khỏi giỏ rồi gửi lại.', p.name) end;
    end if;
  end if;
  v_gift := case when p.kind = 'mua_tang' and not p.gift_same then nullif(trim(p.gift_name), '') end;
  if jsonb_typeof(p_pkg -> 'parts') <> 'array' or jsonb_array_length(p_pkg -> 'parts') = 0
     or jsonb_array_length(p_pkg -> 'parts') > 40 then
    raise exception 'PROMO_INVALID' using hint = p.name;
  end if;

  create temp table if not exists _pu (
    i int, part text, menu_item_id uuid, name text, base int, extra int, opts jsonb,
    ckey text, note text, station text, price int
  ) on commit drop;
  truncate _pu;

  for u in select * from jsonb_array_elements(p_pkg -> 'parts') loop
    v_i := v_i + 1;
    v_part := u ->> 'part';
    if (p.kind = 'combo' and v_part is distinct from 'combo')
       or (p.kind = 'mua_tang' and v_part not in ('mua', 'tang'))
       or (v_gift is not null and v_part = 'tang') then     -- quà ngoài menu: máy chủ tự thêm
      raise exception 'PROMO_INVALID' using hint = p.name;
    end if;
    select * into mi from menu_items where id = nullif(u ->> 'menu_item_id', '')::uuid and is_available;
    if not found then raise exception 'ITEM_UNAVAILABLE' using hint = coalesce(u ->> 'menu_item_id', ''); end if;
    if not (p.kind = 'mua_tang' and v_part = 'tang' and p.gift_same)
       and not exists (select 1 from promotion_items pi
                        where pi.promotion_id = p.id and pi.part = v_part and pi.menu_item_id = mi.id) then
      raise exception 'PROMO_INVALID' using hint = format('%s không thuộc ưu đãi %s', mi.name, p.name);
    end if;
    v_ids := array(select e::int from jsonb_array_elements_text(coalesce(u -> 'choice_ids', '[]'::jsonb)) e order by 1);
    select o_extra, o_opts into v_extra, v_opts from private.item_options(mi.id, v_ids);
    if v_part in ('combo', 'tang') then
      if p.option_mode = 'khong_phi' and exists (select 1 from jsonb_array_elements(v_opts) e where (e ->> 'price')::int > 0) then
        raise exception 'PROMO_OPTION' using hint = format('%s trong ưu đãi không chọn được tuỳ chọn có phí', mi.name);
      elsif p.option_mode = 'mien_phi' then
        v_extra := 0;
        v_opts := coalesce((select jsonb_agg(e || '{"price": 0}'::jsonb) from jsonb_array_elements(v_opts) e), '[]'::jsonb);
      end if;
    end if;
    insert into _pu values (v_i, v_part, mi.id, mi.name, mi.price, v_extra, v_opts, array_to_string(v_ids, ','),
                            nullif(trim(u ->> 'note'), ''),
                            coalesce((select mc.station from menu_categories mc where mc.id = mi.category_id), 'bep'), 0);
  end loop;

  if p.kind = 'combo' then
    if exists (select 1 from promotion_items pi where pi.promotion_id = p.id and pi.part = 'combo'
                 and pi.qty <> (select count(*) from _pu where menu_item_id = pi.menu_item_id))
       or (select count(*) from _pu) <> (select sum(qty) from promotion_items where promotion_id = p.id and part = 'combo') then
      raise exception 'PROMO_INVALID' using hint = format('Combo %s chưa đủ món', p.name);
    end if;
    select coalesce(sum(base), 0) into v_sum from _pu;
    update _pu set price = case when v_sum > 0 then (floor(p.price::numeric * base / v_sum / 1000) * 1000)::int else 0 end where i is not null;  -- Supabase chặn UPDATE không có WHERE
    select min(i) into v_first from _pu;
    update _pu set price = price + (p.price - (select sum(price) from _pu)) where i = v_first;
    update _pu set price = price + extra where i is not null;
  else
    v_need := coalesce(case when v_gift is not null then 0 else p.get_qty end, 0);  -- quà ngoài menu: khách không chọn món tặng
    if (select count(*) from _pu where part = 'mua') <> p.buy_qty
       or (select count(*) from _pu where part = 'tang') <> v_need then
      raise exception 'PROMO_INVALID' using hint = format('%s: chọn đúng %s món mua và %s món tặng', p.name, p.buy_qty, p.get_qty);
    end if;
    if p.gift_same and exists (select 1 from _pu g where g.part = 'tang'
                                 and not exists (select 1 from _pu b where b.part = 'mua' and b.menu_item_id = g.menu_item_id)) then
      raise exception 'PROMO_INVALID' using hint = format('%s: món tặng phải là món bạn mua', p.name);
    end if;
    update _pu set price = case when part = 'mua' then base + extra else extra end where i is not null;
  end if;

  -- Gộp các phần giống hệt nhau thành 1 dòng; dòng đầu ghi số suất
  v_units := v_k;
  for r in select part, menu_item_id, name, opts, note, station, price, count(*)::int * v_k as qty, min(i) as i
             from _pu group by part, menu_item_id, name, opts, ckey, note, station, price order by min(i) loop
    if r.qty > 50 then raise exception 'PROMO_INVALID' using hint = 'Mỗi lần đặt tối đa 50 phần một món'; end if;
    insert into order_items (order_id, menu_item_id, item_name, unit_price, options, qty, note, station,
                             promo_id, promo_name, promo_kind, promo_group, promo_part, promo_units)
    values (p_order, r.menu_item_id, r.name, r.price, r.opts, r.qty, r.note, r.station,
            p.id, p.name, p.kind, v_group, r.part, v_units);
    v_units := null;
  end loop;
  -- Quà ngoài menu (0đ), đưa ở nơi chủ quán chọn
  if v_gift is not null then
    if p.get_qty * v_k > 50 then raise exception 'PROMO_INVALID' using hint = 'Mỗi lần đặt tối đa 50 phần quà'; end if;
    insert into order_items (order_id, menu_item_id, item_name, unit_price, options, qty, note, station,
                             promo_id, promo_name, promo_kind, promo_group, promo_part)
    values (p_order, null, v_gift, 0, '[]'::jsonb, p.get_qty * v_k, null, p.gift_station,
            p.id, p.name, p.kind, v_group, 'tang');
  end if;
end $function$
;
CREATE OR REPLACE FUNCTION private.apply_gifts(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p        promotions;
  mi       menu_items;
  v_base   int;
  v_dine   text;
  v_cnt    int;
  v_has    boolean;
  v_name   text;
  v_mid    uuid;
  v_st     text;
begin
  select coalesce(sum(unit_price * qty), 0) into v_base
    from order_items where order_id = p_order and promo_kind is distinct from 'don_tang';
  select dine_type into v_dine from orders where id = p_order;
  for p in select pr.* from promotions pr
            where pr.kind = 'don_tang' and (pr.min_total is not null or pr.need_qty is not null) and promo_live(pr)
            order by pr.sort_order, pr.created_at loop
    v_has := exists (select 1 from order_items where order_id = p_order and promo_id = p.id and promo_kind = 'don_tang');
    -- Số món "bắt buộc mua" (ví dụ trà sữa / trà hoa quả) trong đơn
    v_cnt := case when p.need_qty is null then 0 else coalesce((
               select sum(i.qty) from order_items i
                where i.order_id = p_order and i.promo_kind is distinct from 'don_tang'
                  and exists (select 1 from promotion_items pi where pi.promotion_id = p.id and pi.part = 'mua' and pi.menu_item_id = i.menu_item_id)), 0) end;
    if (p.dine_types is null or v_dine = any (p.dine_types))
       and (p.min_total is null or v_base >= p.min_total)
       and (p.need_qty is null or v_cnt >= p.need_qty) then
      if v_has then continue; end if;
      if p.limit_qty is not null then
        perform pg_advisory_xact_lock(hashtext('promo:' || p.id::text));
        if private.promo_left(p) < 1 then continue; end if;      -- hết suất: đơn này không nhận quà
      end if;
      v_name := nullif(trim(p.gift_name), '');
      v_mid := null;
      if v_name is not null then
        v_st := p.gift_station;
      else
        select m.* into mi from promotion_items pi join menu_items m on m.id = pi.menu_item_id
         where pi.promotion_id = p.id and pi.part = 'tang' and m.is_available
         order by pi.sort_order, pi.id limit 1;
        if not found then continue; end if;                       -- món quà đang hết: bỏ qua
        v_name := mi.name; v_mid := mi.id;
        v_st := coalesce((select mc.station from menu_categories mc where mc.id = mi.category_id), 'bep');
      end if;
      insert into order_items (order_id, menu_item_id, item_name, unit_price, options, qty, note, station,
                               promo_id, promo_name, promo_kind, promo_group, promo_part, promo_units)
      values (p_order, v_mid, v_name, 0, '[]'::jsonb, least(greatest(p.get_qty, 1), 20), null, v_st,
              p.id, p.name, 'don_tang', gen_random_uuid(), 'tang', 1);
    elsif v_has then
      delete from order_items where order_id = p_order and promo_id = p.id and promo_kind = 'don_tang';
    end if;
  end loop;
  insert into order_stations (order_id, station)
  select distinct p_order, station from order_items where order_id = p_order
  on conflict (order_id, station) do nothing;
  delete from order_stations s
   where s.order_id = p_order
     and not exists (select 1 from order_items i where i.order_id = p_order and i.station = s.station);
end $function$
;
CREATE OR REPLACE FUNCTION private.bank_apply(p_txn bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t bank_txns; o orders; s sales; v_n int; v_due int; v_status text; v_note text; v_sale uuid; v_name text;
begin
  select * into t from bank_txns where id = p_txn for update;
  if not found then return jsonb_build_object('matched', false, 'reason', 'not_found'); end if;
  if t.amount <= 0 then
    update bank_txns set note = coalesce(note, 'Không đọc được số tiền') where id = t.id;
    return jsonb_build_object('matched', false, 'reason', 'no_amount');
  end if;

  if t.pay_code is not null then
    select count(*) into v_n from orders where private.pay_code(id) = t.pay_code and created_at > now() - interval '3 days';
    if v_n = 1 then
      select * into o from orders where private.pay_code(id) = t.pay_code and created_at > now() - interval '3 days' for update;
    elsif v_n = 0 then
      select * into s from sales where source = 'pos' and private.pay_code(id) = t.pay_code and paid_at > now() - interval '3 days' order by paid_at desc limit 1;
      if found then
        update sales set bank_txn_id = coalesce(bank_txn_id, t.id) where id = s.id;
        update bank_txns set order_id = s.id, status = 'don_da_thu',
               note = 'Đơn ' || coalesce(case when s.queue_number is not null then 'Bàn ' || s.queue_number else s.customer_name end, t.pay_code) || ' đã được bấm thu trước đó'
         where id = t.id;
        return jsonb_build_object('matched', true, 'status', 'don_da_thu', 'where', case when s.queue_number is not null then 'Bàn ' || s.queue_number else coalesce(s.customer_name, 'đơn') end);
      end if;
      update bank_txns set note = 'Không thấy đơn ' || t.pay_code where id = t.id;
      return jsonb_build_object('matched', false, 'reason', 'code');
    else
      update bank_txns set note = 'Nhiều đơn trùng mã ' || t.pay_code where id = t.id;
      return jsonb_build_object('matched', false, 'reason', 'code');
    end if;
  else
    v_sale := gen_random_uuid();
    v_name := coalesce(private.sender_name(t.content), 'Khách quét QR');
    insert into sales (id, queue_number, dine_type, total, payment_method, items, ordered_at, paid_at, customer_name, source, bank_txn_id)
    values (v_sale, null, 'tai_quan', t.amount, 'chuyen_khoan', '[]'::jsonb, coalesce(t.txn_at, now()), coalesce(t.txn_at, now()),
            v_name, 'khong_ma', t.id);
    update bank_txns set status = 'khong_ma', sale_id = v_sale, note = 'Không có mã đơn (quét QR loa) → đã ghi Đơn không gắn mã' where id = t.id;
    return jsonb_build_object('matched', false, 'reason', 'no_code', 'sale', true, 'sender', v_name);
  end if;

  v_due := o.total - coalesce(o.paid_amount, 0);
  if v_due <= 0 then
    v_status := 'don_da_thu'; v_note := 'Đơn đã thu đủ trước đó, kiểm tra trả lại khách';
  elsif t.amount >= v_due then
    update orders set paid_amount = total, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = null where id = o.id;
    v_status := 'da_khop';
    v_note := case when t.amount > v_due then 'Khách chuyển dư ' || (t.amount - v_due) || 'đ' end;
    update bank_txns set order_id = o.id, status = v_status, note = v_note where id = t.id;
    if o.status = 'da_ra_mon' then perform private.finalize_order(o.id, 'chuyen_khoan'); end if;
    return jsonb_build_object('matched', true, 'status', v_status,
      'where', case when o.queue_number is not null then 'Bàn ' || o.queue_number else coalesce(o.customer_name, 'đơn') end);
  else
    update orders set paid_amount = coalesce(paid_amount, 0) + t.amount, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = null where id = o.id;
    v_status := 'thieu_tien'; v_note := 'Còn thiếu ' || (v_due - t.amount) || 'đ';
  end if;
  update bank_txns set order_id = o.id, status = v_status, note = v_note where id = t.id;
  return jsonb_build_object('matched', true, 'status', v_status,
    'where', case when o.queue_number is not null then 'Bàn ' || o.queue_number else coalesce(o.customer_name, 'đơn') end);
end $function$
;
CREATE OR REPLACE FUNCTION private.bot_dat_don(p_draft uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d fb_drafts; v_items jsonb; v_order uuid; v_total int; v_action text; v_dine text; v_name text;
begin
  select * into d from fb_drafts where id = p_draft for update;
  if not found then raise exception 'DRAFT_NOT_FOUND'; end if;
  v_items := coalesce((select jsonb_agg(jsonb_build_object('menu_item_id', e ->> 'menu_item_id', 'qty', coalesce((e ->> 'qty')::int, 1),
                         'choice_ids', coalesce(e -> 'choice_ids', '[]'::jsonb), 'note', e ->> 'note'))
                         from jsonb_array_elements(d.items) e), '[]'::jsonb);
  if jsonb_array_length(v_items) = 0 then raise exception 'EMPTY_ORDER'; end if;
  v_dine := coalesce(d.dine_type, 'mang_ve');
  v_name := coalesce(nullif(trim(d.customer_name), ''), 'Khách online');

  if d.order_id is not null and exists (select 1 from orders where id = d.order_id) then
    if not private.bot_order_open(d.order_id) then
      return jsonb_build_object('action', 'locked', 'order_id', d.order_id);
    end if;
    v_order := d.order_id; v_action := 'updated';
    delete from order_items where order_id = v_order;
    delete from order_stations where order_id = v_order;
    update orders set customer_name = left(v_name, 60), customer_phone = d.customer_phone, note = nullif(left(trim(d.note), 300), ''),
           dine_type = v_dine, address = case when v_dine = 'giao_hang' then nullif(left(trim(d.address), 300), '') end, deliver_at = d.at
     where id = v_order;
  else
    insert into orders (queue_number, customer_name, customer_phone, note, dine_type, address, deliver_at, source)
    values (null, left(v_name, 60), d.customer_phone, nullif(left(trim(d.note), 300), ''), v_dine,
            case when v_dine = 'giao_hang' then nullif(left(trim(d.address), 300), '') end, d.at, 'fb')
    returning id into v_order;
    v_action := 'created';
  end if;
  perform private.add_items(v_order, v_items);
  select total into v_total from orders where id = v_order;
  update fb_drafts set status = 'da_duyet', order_id = v_order, approved_by = 'Bot lên đơn', approved_at = coalesce(approved_at, now()),
         total_est = v_total, updated_at = now()
   where id = p_draft;
  return jsonb_build_object('action', v_action, 'order_id', v_order, 'total', v_total);
end $function$
;
CREATE OR REPLACE FUNCTION private.bot_huy_don(p_draft uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d fb_drafts;
begin
  select * into d from fb_drafts where id = p_draft for update;
  if not found then return jsonb_build_object('action', 'none'); end if;
  if d.order_id is not null and exists (select 1 from orders where id = d.order_id) then
    if not private.bot_order_open(d.order_id) then return jsonb_build_object('action', 'locked'); end if;
    delete from orders where id = d.order_id;
  end if;
  update fb_drafts set status = 'huy', updated_at = now() where id = p_draft;
  return jsonb_build_object('action', 'cancelled');
end $function$
;
CREATE OR REPLACE FUNCTION private.bot_link_use(p_code text, p_kenh text, p_chat text, p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from private.bot_link where code = p_code and until >= now();
  if not found then return false; end if;
  insert into bot_users (kenh, chat_id, name) values (p_kenh, p_chat, left(p_name, 80))
    on conflict (kenh, chat_id) do update set name = excluded.name;
  return true;
end $function$
;
CREATE OR REPLACE FUNCTION private.bot_order_open(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from orders o where o.id = p_order and o.status = 'cho_nhan')
     and not exists (select 1 from order_stations s where s.order_id = p_order and s.status <> 'cho_nhan');
$function$
;
CREATE OR REPLACE FUNCTION private.fb_items_sig(p_items jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(string_agg(x, ';' order by x), '')
    from (select (e ->> 'menu_item_id') || '|' || coalesce((e ->> 'qty')::int, 1)::text || '|' ||
                 coalesce((select string_agg(c, ',' order by c::int) from jsonb_array_elements_text(coalesce(e -> 'choice_ids', '[]'::jsonb)) c), '') as x
            from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e) q;
$function$
;
CREATE OR REPLACE FUNCTION private.fb_train_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'huy' and old.status is distinct from 'huy' then
    update fb_train set outcome = 'huy' where draft_id = new.id;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.fb_train_close(p_draft uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d fb_drafts; s fb_train; v_final jsonb; v_edits text[] := '{}'; v_date text; v_time text;
begin
  select * into d from fb_drafts where id = p_draft;
  if not found then return; end if;
  update fb_train set outcome = 'da_duyet' where draft_id = p_draft;
  select * into s from fb_train where draft_id = p_draft and target is not null order by id desc limit 1;
  if not found then return; end if;
  v_date := to_char(d.at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD');
  v_time := to_char(d.at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI');
  v_final := jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'name', i.item_name, 'qty', i.qty,
                'choices', coalesce((select jsonb_agg(o ->> 'choice') from jsonb_array_elements(i.options) o), '[]'::jsonb),
                'note', nullif(regexp_replace(coalesce(i.note, ''), '\d{9,}', '<SO>', 'g'), '')) order by i.id)
              from order_items i where i.order_id = d.order_id), '[]'::jsonb),
    'dine_type', d.dine_type, 'date', v_date, 'time', v_time,
    'address', d.address,
    'phone',   case when d.customer_phone is not null then '<SDT>' end);
  if private.fb_items_sig(d.items) is distinct from private.fb_items_sig(p_items) then v_edits := array_append(v_edits, 'items'); end if;
  if (s.target ->> 'dine_type') is distinct from d.dine_type then v_edits := array_append(v_edits, 'dine_type'); end if;
  if (s.target ->> 'time') is distinct from v_time or (s.target ->> 'date') is distinct from v_date then v_edits := array_append(v_edits, 'time'); end if;
  update fb_train set final = v_final, edits = v_edits where id = s.id;
end $function$
;
CREATE OR REPLACE FUNCTION private.finalize_order(p_order uuid, p_method text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o orders; v_txn bigint;
begin
  select * into o from orders where id = p_order for update;
  if not found then return; end if;
  select id into v_txn from bank_txns where order_id = o.id order by id desc limit 1;
  insert into sales (id, queue_number, dine_type, total, payment_method, items,
                     ordered_at, accepted_at, served_at, paid_at, cook_minutes, station_minutes, cashier_id,
                     customer_name, customer_phone, address, bank_txn_id)
  select o.id, o.queue_number, o.dine_type, o.total, coalesce(p_method, o.paid_method, 'tien_mat'),
         coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'menu_item_id', i.menu_item_id, 'name', i.item_name,
                     'price', i.unit_price, 'qty', i.qty, 'options', i.options, 'station', i.station,
                     'promo_id', i.promo_id, 'promo_name', i.promo_name, 'promo_kind', i.promo_kind,
                     'promo_group', i.promo_group, 'promo_part', i.promo_part, 'promo_units', i.promo_units)) order by i.id)
                   from order_items i where i.order_id = o.id), '[]'::jsonb),
         o.created_at, o.accepted_at, o.served_at, coalesce(o.paid_at, now()),
         case when o.accepted_at is not null and o.served_at is not null
              then round(extract(epoch from (o.served_at - o.accepted_at)) / 60)::int end,
         (select jsonb_object_agg(s.station, round(extract(epoch from (s.served_at - s.accepted_at)) / 60)::int)
            from order_stations s
           where s.order_id = o.id and s.accepted_at is not null and s.served_at is not null),
         coalesce(o.paid_by, my_employee_id()),
         o.customer_name, o.customer_phone, o.address, v_txn;
  delete from orders where id = o.id;
end $function$
;
CREATE OR REPLACE FUNCTION private.item_options(p_item uuid, p_ids integer[], OUT o_extra integer, OUT o_opts jsonb)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare mi menu_items; v_bad text;
begin
  select * into mi from menu_items where id = p_item;
  if exists (select 1 from unnest(p_ids) cid
              where not exists (select 1 from option_choices ch
                                  join menu_item_option_groups mog on mog.group_id = ch.group_id
                                 where ch.id = cid and ch.is_available and mog.menu_item_id = mi.id)) then
    raise exception 'OPTION_INVALID' using hint = mi.name;
  end if;
  select g.title into v_bad
    from menu_item_option_groups mog join option_groups g on g.id = mog.group_id
   where mog.menu_item_id = mi.id
     and (select count(*) from option_choices ch where ch.group_id = g.id and ch.id = any(p_ids))
         not between g.min_select and g.max_select
   limit 1;
  if found then
    raise exception 'OPTION_REQUIRED' using hint = format('%s: kiểm tra lại mục "%s"', mi.name, v_bad);
  end if;
  select coalesce(sum(ch.price_delta), 0)::int,
         coalesce(jsonb_agg(jsonb_build_object('group', g.title, 'choice', ch.name, 'price', ch.price_delta)
                            order by g.sort_order, ch.sort_order, ch.id), '[]'::jsonb)
    into o_extra, o_opts
    from option_choices ch join option_groups g on g.id = ch.group_id
   where ch.id = any(p_ids);
end $function$
;
CREATE OR REPLACE FUNCTION private.items_snapshot(p_order uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'k', i.item_name
                || coalesce(' (' || nullif((select string_agg(x ->> 'choice', ', ') from jsonb_array_elements(case when jsonb_typeof(i.options) = 'array' then i.options else '[]'::jsonb end) x), '') || ')', '')
                || coalesce(' · ' || nullif(btrim(i.note), ''), '')
                || case when i.promo_part = 'tang' then ' (tặng)' else '' end,
           'q', i.qty)), '[]'::jsonb)
    from order_items i where i.order_id = p_order
$function$
;
CREATE OR REPLACE FUNCTION private.money_in(p_text text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare t text := coalesce(p_text, ''); m text[]; s text;
begin
  -- Ưu tiên số có dấu + (tiền vào)
  m := regexp_match(t, '\+\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]+)');
  if m is null then
    -- "Nhận / thanh toán / số tiền ... 75,000 VND"
    m := regexp_match(t, '(?:nhận|nhan|thanh toán|thanh toan|số tiền|so tien|ghi có|ghi co)[^0-9+\-]{0,30}([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{4,})', 'i');
  end if;
  if m is null then
    -- Số kèm đơn vị tiền
    m := regexp_match(t, '([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{4,})\s*(?:vnd|vnđ|đ|₫)', 'i');
  end if;
  if m is null then return null; end if;
  s := m[1];
  s := regexp_replace(s, '[.,][0-9]{1,2}$', '');   -- bỏ phần lẻ ",00"
  s := regexp_replace(s, '[.,]', '', 'g');
  if s = '' or length(s) > 10 then return null; end if;
  return s::bigint::int;
end $function$
;
CREATE OR REPLACE FUNCTION private.pay_code(p_id uuid)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ select 'BN' || upper(left(replace(p_id::text, '-', ''), 6)) $function$
;
CREATE OR REPLACE FUNCTION private.promo_left(p promotions)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when p.limit_qty is null then null else greatest(p.limit_qty - private.promo_used(p), 0) end
$function$
;
CREATE OR REPLACE FUNCTION private.promo_used(p promotions)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (select case when p.limit_per = 'tong' then least(coalesce(p.start_at, p.created_at), p.created_at)
                         else (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh') end as t0)
  select (coalesce((select sum(case when i.promo_kind = 'giam_gia' then i.qty else coalesce(i.promo_units, 0) end)
                      from order_items i, s where i.promo_id = p.id and i.added_at >= s.t0), 0)
        + coalesce((select sum(case when x ->> 'promo_kind' = 'giam_gia' then (x ->> 'qty')::int else coalesce((x ->> 'promo_units')::int, 0) end)
                      from s, sales sa cross join lateral jsonb_array_elements(sa.items) x
                     where sa.ordered_at >= s.t0 and x ->> 'promo_id' = p.id::text), 0))::int
$function$
;
CREATE OR REPLACE FUNCTION private.sale_price(p_item uuid, p_hint uuid DEFAULT NULL::uuid, p_qty integer DEFAULT 1, OUT o_price integer, OUT o_promo uuid, OUT o_name text)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare mi menu_items; r promotions; v int; v_left int;
begin
  select * into mi from menu_items where id = p_item;
  o_price := mi.price;
  for r in select p.* from promotions p join promotion_items pi on pi.promotion_id = p.id
            where p.kind = 'giam_gia' and pi.part = 'giam' and pi.menu_item_id = p_item and p.sale_value is not null
              and (promo_live(p) or (p.id = p_hint and promo_live(p, now() - interval '10 minutes')))
            order by p.sort_order, p.created_at loop
    if r.limit_qty is not null then
      perform pg_advisory_xact_lock(hashtext('promo:' || r.id::text)); -- đặt cùng lúc không vượt giới hạn
      v_left := private.promo_left(r);
      if v_left < p_qty then
        if r.id = p_hint then
          raise exception 'PROMO_SOLD_OUT' using hint = case when v_left > 0
            then format('%s chỉ còn %s suất. Bớt số lượng %s rồi gửi lại.', r.name, v_left, mi.name)
            else format('%s vừa hết suất. Giỏ đã về giá gốc, bạn xem lại rồi gửi.', r.name) end;
        end if;
        continue;
      end if;
    end if;
    v := case r.sale_mode
           when 'dong_gia'  then r.sale_value
           when 'phan_tram' then (floor(mi.price::numeric * (100 - least(r.sale_value, 100)) / 100 / 1000) * 1000)::int
           else greatest(mi.price - r.sale_value, 0) end;
    if v < o_price then o_price := v; o_promo := r.id; o_name := r.name; end if;
  end loop;
end $function$
;
CREATE OR REPLACE FUNCTION private.sender_name(p_content text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  t text := coalesce(p_content, '');
  m text[];
  v_raw text;
begin
  m := regexp_match(t, '[0-9]{6,}-[0-9]{8,12}-([A-Za-zÀ-ỹ ]{2,50}?)\s+(?:chuyen\s+tien|chuyển\s+tiền|thanh\s+toan|thanh\s+toán)', 'i');
  if m is not null then v_raw := btrim(m[1]); end if;

  if v_raw is null or v_raw = '' then
    m := regexp_match(t, ',\s*([A-Za-zÀ-ỹ ]{2,50}?)\s+(?:chuyen\s+tien|chuyển\s+tiền)', 'i');
    if m is not null and m[1] !~* '(CONG TY|CTCP|DICH VU|TRUC TUYEN|NGAN HANG)' then v_raw := btrim(m[1]); end if;
  end if;

  if v_raw is null or v_raw = '' then
    m := regexp_match(t, 'FT[0-9A-Z]+\s*,\s*([^,|]{2,60}?)\s*,', 'i');
    if m is not null and m[1] !~* '(CONG TY|CTCP|DICH VU DI DONG|TRUC TUYEN|NAPAS|MOMO|ZALOPAY|VNPAY)' then v_raw := btrim(m[1]); end if;
  end if;

  if v_raw is null or v_raw = '' then return null; end if;
  return initcap(lower(regexp_replace(v_raw, '\s+', ' ', 'g')));
end $function$
;
CREATE OR REPLACE FUNCTION private.trg_edit_commit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o orders; v_lines jsonb := '[]'::jsonb; r record;
begin
  delete from private.order_edit_tx where order_id = new.order_id and txid = new.txid;
  select * into o from orders where id = new.order_id;
  if not found then return null; end if;               -- đơn đã bị huỷ / đóng trong cùng giao dịch
  for r in
    with b as (select x ->> 'k' as k, sum((x ->> 'q')::int) as q from jsonb_array_elements(new.before) x group by 1),
         a as (select x ->> 'k' as k, sum((x ->> 'q')::int) as q from jsonb_array_elements(private.items_snapshot(new.order_id)) x group by 1)
    select coalesce(a.k, b.k) as k, coalesce(b.q, 0) as bq, coalesce(a.q, 0) as aq
      from a full join b on a.k = b.k
     where coalesce(a.q, 0) <> coalesce(b.q, 0)
     order by (coalesce(b.q, 0) = 0), coalesce(a.k, b.k)
  loop
    v_lines := v_lines || to_jsonb(case when r.bq = 0 then 'Thêm ' || r.aq || '× ' || r.k
                                        when r.aq = 0 then 'Bỏ ' || r.bq || '× ' || r.k
                                        else r.k || ': ' || r.bq || ' → ' || r.aq || ' phần' end);
  end loop;
  if jsonb_array_length(v_lines) = 0 then return null; end if;
  if o.total is distinct from new.before_total then
    v_lines := v_lines || to_jsonb('Tổng tiền: ' || private.vnd(new.before_total) || ' → ' || private.vnd(o.total));
  end if;
  insert into order_changes (order_id, token, kind, lines, by_staff) values (o.id, o.access_token, 'sua', v_lines, my_role() is not null);
  return null;
exception when others then return null;
end $function$
;
CREATE OR REPLACE FUNCTION private.trg_items_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_order uuid := coalesce(new.order_id, old.order_id); v_created timestamptz; v_total int;
begin
  select created_at, total into v_created, v_total from orders where id = v_order;
  if found and v_created < now() then
    insert into private.order_edit_tx (order_id, txid, before, before_total)
    values (v_order, txid_current(), private.items_snapshot(v_order), v_total)
    on conflict do nothing;
  end if;
  return coalesce(new, old);
exception when others then return coalesce(new, old);   -- ghi nhật ký lỗi cũng không được chặn việc sửa đơn
end $function$
;
CREATE OR REPLACE FUNCTION private.trg_order_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from sales where id = old.id) then
    insert into order_changes (order_id, token, kind, lines, by_staff)
    values (old.id, old.access_token, 'huy', '["Quán đã huỷ đơn"]'::jsonb, my_role() is not null);
  end if;
  return old;
exception when others then return old;
end $function$
;
CREATE OR REPLACE FUNCTION private.trg_order_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_lines jsonb := '[]'::jsonb;
  lbl text;
begin
  if old.created_at >= now() then return new; end if;
  if new.dine_type is distinct from old.dine_type then
    lbl := case new.dine_type when 'tai_quan' then 'Ăn tại quán' when 'mang_ve' then 'Mang về' when 'giao_hang' then 'Giao hàng' else new.dine_type end;
    v_lines := v_lines || to_jsonb('Đổi sang: ' || lbl);
  end if;
  if new.queue_number is distinct from old.queue_number and new.queue_number is not null then
    v_lines := v_lines || to_jsonb(case when old.queue_number is null then 'Số bàn: ' || new.queue_number else 'Đổi số bàn: ' || old.queue_number || ' → ' || new.queue_number end);
  end if;
  if new.address is distinct from old.address and nullif(btrim(new.address), '') is not null then
    v_lines := v_lines || to_jsonb('Địa chỉ giao: ' || new.address);
  end if;
  if new.deliver_at is distinct from old.deliver_at and new.deliver_at is not null then
    v_lines := v_lines || to_jsonb('Giờ giao: ' || to_char(new.deliver_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'));
  end if;
  if new.note is distinct from old.note and nullif(btrim(new.note), '') is not null then
    v_lines := v_lines || to_jsonb('Ghi chú: ' || new.note);
  end if;
  if jsonb_array_length(v_lines) > 0 then
    insert into order_changes (order_id, token, kind, lines, by_staff) values (new.id, new.access_token, 'sua', v_lines, my_role() is not null);
  end if;
  return new;
exception when others then return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.vnd(n integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ select replace(to_char(coalesce(n, 0), 'FM999,999,999,990'), ',', '.') || 'đ' $function$
;
CREATE OR REPLACE FUNCTION public.accept_order(p_order_id uuid, p_minutes integer, p_station text DEFAULT 'bep'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  update order_stations
     set status = 'dang_lam',
         accepted_at = now(),
         estimated_ready_at = now() + make_interval(mins => greatest(p_minutes, 1))
   where order_id = p_order_id and station = p_station and status = 'cho_nhan';
  perform refresh_order_status(p_order_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.apply_rounding(p_minutes integer, p_step integer, p_mode text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (case p_mode
            when 'up'   then ceil(p_minutes::numeric / p_step) * p_step
            when 'down' then floor(p_minutes::numeric / p_step) * p_step
            else round(p_minutes::numeric / p_step) * p_step
          end)::int
$function$
;
CREATE OR REPLACE FUNCTION public.bank_noti_ingest(p_key text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key text;
  v_text text;
  v_up text;
  v_amount int;
  v_code text;
  v_ft text;
  v_hash text;
  v_txn bigint;
  v_at timestamptz;
  v_res jsonb;
  v_test boolean;
begin
  select api_key into v_key from private.sepay_config where id = 1;
  if p_key is null or v_key is null or p_key <> v_key then raise exception 'BAD_KEY'; end if;
  if coalesce((p ->> 'ping')::boolean, false) then return jsonb_build_object('ok', true, 'ping', true); end if;

  v_text := left(btrim(coalesce(p ->> 'title', '') || ' | ' || coalesce(p ->> 'text', ''), ' |'), 500);
  -- Phòng hờ: bỏ mọi đoạn số dư nếu còn sót
  v_text := regexp_replace(v_text, '(số dư|so du|sd)\s*[:：]?\s*[-+]?[0-9][0-9.,]*\s*(vnđ|vnd|đ|₫|d(?![a-z]))?', '[số dư]', 'gi');
  if v_text = '' then return jsonb_build_object('ok', true, 'skip', 'empty'); end if;
  v_up := upper(v_text);
  -- Tiền ra thì bỏ qua (chỉ bỏ qua khi đầu thông báo hoặc sau dấu | là dấu trừ số tiền, tránh nhầm dấu gạch ngang trong mã MoMo 157683-0399...)
  if v_up ~ '(^|\|\s*)-\s*[0-9]' and v_up !~ '\+\s*[0-9]' then
    return jsonb_build_object('ok', true, 'skip', 'out');
  end if;

  v_amount := coalesce(private.money_in(v_text), 0);
  v_code := (regexp_match(v_up, 'BN\s*([0-9A-F]{6})'))[1];
  if v_code is not null then v_code := 'BN' || v_code; end if;
  v_ft := (regexp_match(v_up, '\m(FT[0-9A-Z]{8,20})\M'))[1];
  v_test := coalesce((p ->> 'test')::boolean, false);
  begin v_at := to_timestamp((p ->> 'posted_at')::bigint / 1000.0); exception when others then v_at := now(); end;

  -- Nếu có mã giao dịch FT... và không phải ghi thử thì dùng FT... làm khoá chống trùng (an toàn khi quét lại thanh thông báo)
  v_hash := case
    when not v_test and v_ft is not null then md5('ft|' || v_ft || '|' || v_amount::text)
    else md5(coalesce(p ->> 'key', '') || '|' || coalesce(p ->> 'posted_at', '') || '|' || v_text)
  end;

  insert into bank_txns (src, src_hash, device, amount, content, ref, txn_at, pay_code, status, note)
  values ('noti', v_hash,
          left(p ->> 'device', 40), v_amount, v_text, v_ft, coalesce(v_at, now()), v_code,
          case when v_test then 'mau' else 'chua_khop' end,
          case when v_test then 'Ghi thử từ ' || coalesce(p ->> 'pkg', '?') end)
  on conflict (src_hash) do nothing
  returning id into v_txn;
  if v_txn is null then return jsonb_build_object('ok', true, 'skip', 'duplicate'); end if;
  if v_test then
    return jsonb_build_object('ok', true, 'test', true, 'amount', v_amount, 'code', v_code);
  end if;

  v_res := private.bank_apply(v_txn);
  return jsonb_build_object('ok', true, 'amount', v_amount, 'code', v_code) || v_res;
end $function$
;
CREATE OR REPLACE FUNCTION public.best_sellers(p_days integer DEFAULT 7)
 RETURNS TABLE(menu_item_id uuid, station text, qty bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (
    select (i ->> 'menu_item_id')::uuid as mid,
           sum(coalesce((i ->> 'qty')::int, 0)) as q
      from sales, jsonb_array_elements(items) i
     where paid_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 60)))
       and coalesce(i ->> 'promo_part', '') <> 'tang'
       and (i ->> 'menu_item_id') is not null
     group by 1
  ), r as (
    select s.mid, coalesce(c.station, 'bep') as st, s.q,
           rank() over (partition by m.category_id order by s.q desc) as rk
      from s join menu_items m on m.id = s.mid
      left join menu_categories c on c.id = m.category_id
     where m.category_id is not null
  )
  select mid, st, q from r where rk = 1 and q > 0
$function$
;
CREATE OR REPLACE FUNCTION public.bot_dat_don(p_draft uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select private.bot_dat_don(p_draft) $function$
;
CREATE OR REPLACE FUNCTION public.bot_don_mo(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select private.bot_order_open(p_order) $function$
;
CREATE OR REPLACE FUNCTION public.bot_huy_don(p_draft uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select private.bot_huy_don(p_draft) $function$
;
CREATE OR REPLACE FUNCTION public.bot_link_code()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_code text; v_until timestamptz := now() + interval '10 minutes'; v_emp employees;
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  delete from private.bot_link where until < now();
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  select * into v_emp from employees where id = my_employee_id();
  insert into private.bot_link (code, until, created_by) values (v_code, v_until, v_emp.full_name)
    on conflict (code) do update set until = excluded.until, created_by = excluded.created_by;
  return jsonb_build_object('code', v_code, 'until', v_until);
end $function$
;
CREATE OR REPLACE FUNCTION public.bot_link_use(p_code text, p_kenh text, p_chat text, p_name text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select private.bot_link_use(p_code, p_kenh, p_chat, p_name) $function$
;
CREATE OR REPLACE FUNCTION public.call_staff(p_token uuid, p_message text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o orders;
begin
  select * into o from orders where access_token = p_token;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  -- chống bấm liên tục: tối đa 1 lần gọi chưa xử lý mỗi đơn
  if exists (select 1 from staff_calls where order_id = o.id and resolved_at is null) then
    return;
  end if;
  insert into staff_calls (order_id, queue_number, message) values (o.id, o.queue_number, p_message);
end $function$
;
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  delete from orders where id = p_order_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.check_in(p_photo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp employees;
  v_id  uuid;
begin
  select * into v_emp from employees where auth_user_id = auth.uid() and is_active;
  if not found then raise exception 'NOT_EMPLOYEE'; end if;
  if exists (select 1 from shifts where employee_id = v_emp.id and check_out_at is null) then
    raise exception 'ALREADY_CHECKED_IN' using hint = 'Bạn đang có ca chưa kết thúc';
  end if;
  insert into shifts (employee_id, employee_name, check_in_photo, hourly_rate)
  values (v_emp.id, v_emp.full_name, p_photo, v_emp.hourly_rate)
  returning id into v_id;
  return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.check_out(p_photo text)
 RETURNS shifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s   shifts;
  cfg shop_settings;
  m   int;
  pm  int;
begin
  select * into cfg from shop_settings where id = 1;
  select sh.* into s
    from shifts sh join employees e on e.id = sh.employee_id
   where e.auth_user_id = auth.uid() and sh.check_out_at is null
   for update of sh;
  if not found then raise exception 'NOT_CHECKED_IN'; end if;

  m  := floor(extract(epoch from (now() - s.check_in_at)) / 60);
  pm := apply_rounding(m, cfg.round_minutes, cfg.round_mode);

  update shifts
     set check_out_at    = now(),
         check_out_photo = p_photo,
         round_minutes   = cfg.round_minutes,
         round_mode      = cfg.round_mode,
         pay_round       = cfg.pay_round,
         paid_minutes    = pm,
         pay_amount      = round_money(pm * s.hourly_rate / 60.0, cfg.pay_round)
   where id = s.id
  returning * into s;
  return s;
end $function$
;
CREATE OR REPLACE FUNCTION public.claim_owner(p_full_name text, p_phone text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if exists (select 1 from employees where role = 'owner') then raise exception 'OWNER_EXISTS'; end if;
  insert into employees (auth_user_id, full_name, phone, role)
  values (auth.uid(), coalesce(nullif(trim(p_full_name), ''), 'Chủ quán'), p_phone, 'owner')
  returning id into v_id;
  return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.complete_payment(p_order_id uuid, p_method text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o orders;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  if p_method not in ('tien_mat', 'chuyen_khoan') then raise exception 'BAD_METHOD'; end if;
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status = 'da_ra_mon' then
    -- Đã ra món hết: thu xong là đóng đơn
    update orders set paid_amount = total, paid_method = p_method, paid_at = now(), paid_by = my_employee_id() where id = o.id;
    perform private.finalize_order(o.id, p_method);
  else
    -- Khách trả trước: ghi nhận đã thu, đơn vẫn làm tiếp; ra món xong tự đóng
    update orders set paid_amount = total, paid_method = p_method, paid_at = now(), paid_by = my_employee_id() where id = o.id;
  end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.dismiss_bank_txn(p_txn bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  update bank_txns set reviewed_at = now(), reviewed_by = my_employee_id()
   where id = p_txn and status = 'khong_ma' and reviewed_at is null;
end $function$
;
CREATE OR REPLACE FUNCTION public.extend_wait(p_order_id uuid, p_extra_minutes integer, p_station text DEFAULT 'bep'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  update order_stations
     set estimated_ready_at = greatest(estimated_ready_at, now()) + make_interval(mins => p_extra_minutes)
   where order_id = p_order_id and station = p_station and status = 'dang_lam';
  perform refresh_order_status(p_order_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.fb_approve(p_draft uuid, p_dine text, p_name text, p_phone text, p_address text, p_at timestamp with time zone, p_items jsonb, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d fb_drafts; v_order orders; v_total int; v_emp employees;
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  select * into d from fb_drafts where id = p_draft for update;
  if not found then raise exception 'DRAFT_NOT_FOUND'; end if;
  if d.status = 'da_duyet' then raise exception 'DRAFT_DONE' using hint = 'Đơn này đã duyệt rồi'; end if;
  if p_dine not in ('mang_ve', 'tai_quan', 'giao_hang') then raise exception 'BAD_DINE' using hint = 'Chọn qua lấy / ăn tại quán / đi ship'; end if;
  if p_at is null then raise exception 'MISSING_TIME' using hint = 'Nhập giờ hẹn'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'MISSING_NAME' using hint = 'Nhập tên khách'; end if;
  if p_dine = 'giao_hang' and coalesce(trim(p_address), '') = '' then raise exception 'MISSING_ADDRESS' using hint = 'Nhập địa chỉ giao hàng'; end if;

  insert into orders (queue_number, customer_name, customer_phone, note, dine_type, address, deliver_at, source)
  values (null, trim(p_name), nullif(trim(p_phone), ''), nullif(left(trim(p_note), 300), ''), p_dine,
          case when p_dine = 'giao_hang' then nullif(left(trim(p_address), 300), '') end, p_at, 'fb')
  returning * into v_order;
  perform private.add_items(v_order.id, p_items);
  select total into v_total from orders where id = v_order.id;

  select * into v_emp from employees where id = my_employee_id();
  update fb_drafts set status = 'da_duyet', order_id = v_order.id, approved_by = v_emp.full_name, approved_at = now(),
         dine_type = p_dine, at = p_at, customer_name = trim(p_name), customer_phone = nullif(trim(p_phone), ''),
         address = nullif(trim(p_address), ''), note = nullif(trim(p_note), ''), total_est = v_total,
         changed_after = false, updated_at = now()
   where id = p_draft;
  perform private.fb_train_close(p_draft, p_items);
  return jsonb_build_object('order_id', v_order.id, 'total', v_total);
end $function$
;
CREATE OR REPLACE FUNCTION public.get_menu()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(c order by c_sort, c_id), '[]'::jsonb) from (
    select mc.id as c_id, mc.sort_order as c_sort,
      jsonb_build_object(
        'id', mc.id, 'name', mc.name, 'color', mc.color, 'station', mc.station,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', mi.id, 'name', mi.name, 'description', mi.description,
            'price', mi.price, 'image_path', mi.image_path, 'tag', mi.tag,
            'option_groups', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', g.id, 'title', g.title, 'min', g.min_select, 'max', g.max_select,
                'choices', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'id', ch.id, 'name', ch.name,
                           'price', ch.price_delta, 'default', ch.is_default)
                         order by ch.sort_order, ch.id)
                    from option_choices ch
                   where ch.group_id = g.id and ch.is_available), '[]'::jsonb)
              ) order by mog.sort_order, g.sort_order, g.id)
                from menu_item_option_groups mog join option_groups g on g.id = mog.group_id
               where mog.menu_item_id = mi.id), '[]'::jsonb)
          ) order by mi.sort_order, mi.name)
            from menu_items mi
           where mi.category_id = mc.id and mi.is_available), '[]'::jsonb)
      ) as c
    from menu_categories mc
  ) s
  where jsonb_array_length(c -> 'items') > 0
$function$
;
CREATE OR REPLACE FUNCTION public.get_my_order(p_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'queue_number',       o.queue_number,
    'dine_type',          o.dine_type,
    'address',            o.address,
    'deliver_at',         o.deliver_at,
    'paid_amount',        o.paid_amount,
    'customer_name',      o.customer_name,
    'status',             o.status,
    'total',              o.total,
    'note',               o.note,
    'created_at',         o.created_at,
    'estimated_ready_at', o.estimated_ready_at,
    'orders_ahead', (select count(distinct xs.order_id) from order_stations xs join orders x on x.id = xs.order_id
                      where xs.status in ('cho_nhan', 'dang_lam') and x.created_at < o.created_at
                        and xs.station in (select station from order_stations where order_id = o.id)),
    'has_open_call', exists (select 1 from staff_calls c where c.order_id = o.id and c.resolved_at is null),
    'stations', (select jsonb_agg(jsonb_build_object(
                         'station', s.station, 'status', s.status,
                         'estimated_ready_at', s.estimated_ready_at) order by s.station)
                   from order_stations s where s.order_id = o.id),
    'items', (select jsonb_agg(jsonb_build_object(
                       'name', i.item_name, 'qty', i.qty, 'note', i.note, 'station', i.station,
                       'price', i.unit_price, 'options', i.options,
                       'promo_name', i.promo_name, 'promo_kind', i.promo_kind,
                       'promo_group', i.promo_group, 'promo_part', i.promo_part) order by i.id)
                from order_items i where i.order_id = o.id)
  )
  from orders o where o.access_token = p_token
$function$
;
CREATE OR REPLACE FUNCTION public.get_order_changes(p_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'lines', lines, 'at', created_at, 'staff', by_staff) order by id), '[]'::jsonb)
    from order_changes where token = p_token and p_token is not null
$function$
;
CREATE OR REPLACE FUNCTION public.get_payment_info()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('bin', bank_bin, 'bank', bank_name, 'account', bank_account, 'holder', bank_holder, 'note', bank_note)
    from shop_settings where id = 1
$function$
;
CREATE OR REPLACE FUNCTION public.get_promotions()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by s, n), '[]'::jsonb) from (
    select p.sort_order as s, p.name as n,
      jsonb_build_object(
        'id', p.id, 'name', p.name, 'kind', p.kind, 'description', p.description, 'image_path', p.image_path,
        'price', p.price, 'buy_qty', p.buy_qty, 'get_qty', p.get_qty, 'gift_same', p.gift_same,
        'option_mode', p.option_mode, 'start_at', p.start_at, 'end_at', p.end_at, 'days', p.days,
        'time_from', to_char(p.time_from, 'HH24:MI'), 'time_to', to_char(p.time_to, 'HH24:MI'),
        'sale_mode', p.sale_mode, 'sale_value', p.sale_value, 'min_total', p.min_total, 'need_qty', p.need_qty, 'dine_types', p.dine_types,
        'gift_name', p.gift_name, 'limit_qty', p.limit_qty, 'limit_per', p.limit_per, 'left', private.promo_left(p),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('part', pi.part, 'menu_item_id', pi.menu_item_id, 'qty', pi.qty)
                                            order by pi.sort_order, pi.id), '[]'::jsonb)
                    from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                   where pi.promotion_id = p.id and mi.is_available)
      ) as x
    from promotions p
    where promo_live(p)
      and (p.limit_qty is null or private.promo_left(p) > 0)
      and case when p.kind = 'combo' then
                 p.price is not null
             and exists (select 1 from promotion_items pi where pi.promotion_id = p.id and pi.part = 'combo')
             and not exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                              where pi.promotion_id = p.id and pi.part = 'combo' and not mi.is_available)
           when p.kind = 'giam_gia' then
                 p.sale_value is not null
             and exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                          where pi.promotion_id = p.id and pi.part = 'giam' and mi.is_available)
           when p.kind = 'don_tang' then
                 (p.min_total is not null or p.need_qty is not null)
             and (p.need_qty is null or exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                                                 where pi.promotion_id = p.id and pi.part = 'mua' and mi.is_available))
             and (nullif(trim(p.gift_name), '') is not null
                  or exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                              where pi.promotion_id = p.id and pi.part = 'tang' and mi.is_available))
           else exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                         where pi.promotion_id = p.id and pi.part = 'mua' and mi.is_available)
            and (p.gift_same or nullif(trim(p.gift_name), '') is not null
                 or exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                             where pi.promotion_id = p.id and pi.part = 'tang' and mi.is_available))
      end
  ) t
$function$
;
CREATE OR REPLACE FUNCTION public.get_sepay_key()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  return (select api_key from private.sepay_config where id = 1);
end $function$
;
CREATE OR REPLACE FUNCTION public.has_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from employees where role = 'owner')
$function$
;
CREATE OR REPLACE FUNCTION public.health_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  result jsonb;
  extra  jsonb;
begin
  -- 1) Số liệu chung của database
  select jsonb_build_object(
    'db_size_bytes',    pg_database_size(current_database()),
    'connections_used', (select count(*) from pg_stat_activity),
    'connections_max',  current_setting('max_connections')::int,
    'cache_hit_ratio',  (select round(100.0 * sum(heap_blks_hit)
                           / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2)
                         from pg_statio_user_tables),
    'long_queries',     (select count(*) from pg_stat_activity
                         where state = 'active' and backend_type = 'client backend'
                           and pid <> pg_backend_pid()
                           and now() - query_start > interval '5 minutes'),
    'waiting_locks',    (select count(*) from pg_locks where not granted),
    'top_tables',       (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
                           select relname as name,
                                  n_live_tup as rows,
                                  pg_total_relation_size(relid) as bytes
                           from pg_stat_user_tables
                           where schemaname = 'public'
                           order by pg_total_relation_size(relid) desc
                           limit 5) t),
    'checked_at',       now()
  ) into result;

  -- 2) Dung lượng Storage (ảnh chấm công...) — tách riêng để lỗi không làm hỏng cả báo cáo
  begin
    select jsonb_build_object('storage_bytes',
             coalesce(sum((metadata->>'size')::bigint), 0))
      into extra
      from storage.objects;
    result := result || extra;
  exception when others then
    result := result || jsonb_build_object('storage_error', sqlerrm);
  end;

  -- 3) Dữ liệu quán (theo schema POS: đơn thanh toán xong chuyển sang sales rồi xoá khỏi orders)
  --    "Hôm qua" tính theo giờ Việt Nam.
  if to_regclass('public.sales') is not null then
    begin
      execute $q$
        with d as (
          select (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') - interval '1 day')
                   at time zone 'Asia/Ho_Chi_Minh' as y_start,
                 date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                   at time zone 'Asia/Ho_Chi_Minh' as t_start)
        select jsonb_build_object(
          'sales_yesterday',   count(*),
          'revenue_yesterday', coalesce(sum(total), 0),
          'last_sale_at',      (select max(paid_at) from public.sales))
        from public.sales, d
        where paid_at >= d.y_start and paid_at < d.t_start
      $q$ into extra;
      result := result || extra;
    exception when others then
      result := result || jsonb_build_object('sales_error', sqlerrm);
    end;
  end if;

  if to_regclass('public.orders') is not null then
    begin
      execute $q$
        select jsonb_build_object(
          'open_orders',  count(*),
          'stale_orders', count(*) filter (where created_at <
                            date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                              at time zone 'Asia/Ho_Chi_Minh'))
        from public.orders
      $q$ into extra;
      result := result || extra;
    exception when others then
      result := result || jsonb_build_object('orders_error', sqlerrm);
    end;
  end if;

  if to_regclass('public.fb_drafts') is not null then
    begin
      execute $q$
        select jsonb_build_object('fb_pending', count(*))
        from public.fb_drafts where status = 'cho_duyet'
      $q$ into extra;
      result := result || extra;
    exception when others then
      null;
    end;
  end if;

  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.link_bank_txn(p_txn bigint, p_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t bank_txns; o orders; v_due int; v_status text; v_note text; v_where text;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  select * into t from bank_txns where id = p_txn for update;
  if not found then raise exception 'TXN_NOT_FOUND'; end if;
  if t.status <> 'khong_ma' or t.sale_id is null then raise exception 'TXN_ALREADY_HANDLED'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  v_due := o.total - coalesce(o.paid_amount, 0);
  if v_due <= 0 then raise exception 'ORDER_ALREADY_PAID'; end if;
  v_where := case when o.queue_number is not null then 'Bàn ' || o.queue_number else coalesce(o.customer_name, 'đơn') end;

  -- Bỏ hoá đơn "không gắn mã" của khoản này (tiền này là của đơn)
  delete from sales where id = t.sale_id and source = 'khong_ma';

  if t.amount >= v_due then
    update orders set paid_amount = total, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = my_employee_id() where id = o.id;
    v_status := 'da_khop';
    v_note := 'Gán tay vào ' || v_where || case when t.amount > v_due then ' · khách chuyển dư ' || (t.amount - v_due) || 'đ' else '' end;
  else
    update orders set paid_amount = coalesce(paid_amount, 0) + t.amount, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = my_employee_id() where id = o.id;
    v_status := 'thieu_tien';
    v_note := 'Gán tay vào ' || v_where || ' · còn thiếu ' || (v_due - t.amount) || 'đ';
  end if;
  update bank_txns set order_id = o.id, sale_id = null, status = v_status, note = v_note,
         reviewed_at = now(), reviewed_by = my_employee_id() where id = t.id;
  -- Đã ra món và đủ tiền → đóng đơn (finalize lấy bank_txn_id theo order_id)
  if v_status = 'da_khop' and o.status = 'da_ra_mon' then perform private.finalize_order(o.id, 'chuyen_khoan'); end if;
  return jsonb_build_object('ok', true, 'status', v_status, 'where', v_where);
end $function$
;
CREATE OR REPLACE FUNCTION public.mark_served(p_order_id uuid, p_station text DEFAULT 'bep'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  update order_stations set status = 'da_ra_mon', served_at = now()
   where order_id = p_order_id and station = p_station and status = 'dang_lam';
  perform refresh_order_status(p_order_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.monitor_collect(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  r public.monitor_samples;
  vn_today timestamptz := date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
begin
  insert into public.monitor_samples (
    at, rest_ms, auth_ms, storage_ms, site_ms, rpc_ms,
    rest_ok, auth_ok, storage_ok, site_ok,
    conns, conns_max, db_bytes, cache_hit, locks, long_q,
    active_orders, stale_orders, xact_commit, deadlocks, colo)
  values (
    now(),
    (p->>'rest_ms')::int, (p->>'auth_ms')::int, (p->>'storage_ms')::int, (p->>'site_ms')::int, (p->>'rpc_ms')::int,
    (p->>'rest_ok')::boolean, (p->>'auth_ok')::boolean, (p->>'storage_ok')::boolean, (p->>'site_ok')::boolean,
    (select count(*) from pg_stat_activity),
    current_setting('max_connections')::int,
    pg_database_size(current_database()),
    (select round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2)
       from pg_statio_user_tables),
    (select count(*) from pg_locks where not granted),
    (select count(*) from pg_stat_activity
      where state = 'active' and backend_type = 'client backend' and pid <> pg_backend_pid() and now() - query_start > interval '5 minutes'),
    (select count(*) from public.orders),
    (select count(*) from public.orders where created_at < vn_today),
    (select xact_commit from pg_stat_database where datname = current_database()),
    (select deadlocks from pg_stat_database where datname = current_database()),
    p->>'colo')
  on conflict (at) do nothing
  returning * into r;

  delete from public.monitor_samples where at < now() - interval '35 days';
  return to_jsonb(r);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.monitor_dashboard(p_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
#variable_conflict use_column
declare
  h       int := least(greatest(coalesce(p_hours, 24), 1), 24 * 35);
  bucket  int := case when h <= 24 then 5 when h <= 168 then 60 else 360 end;
  since   timestamptz := now() - make_interval(hours => h);
  tz      text := 'Asia/Ho_Chi_Minh';
  today   timestamptz := date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
  d30     timestamptz := today - interval '29 days';
  out     jsonb := '{}'::jsonb;
begin
  out := jsonb_build_object('hours', h, 'bucket_min', bucket, 'generated_at', now());

  out := out || jsonb_build_object('series', (
    with raw as (
      select s.*,
             case when lag(xact_commit) over w is not null and xact_commit >= lag(xact_commit) over w
                  then (xact_commit - lag(xact_commit) over w)
                       / nullif(extract(epoch from at - lag(at) over w) / 60, 0) end as tpm
        from public.monitor_samples s
       where at >= since - interval '10 minutes'
      window w as (order by at)
    ), b as (
      select to_timestamp(floor(extract(epoch from at) / (bucket * 60)) * bucket * 60) as t, *
        from raw where at >= since
    )
    select coalesce(jsonb_agg(x order by x.t), '[]'::jsonb) from (
      select t,
             round(avg(rest_ms)) rest, round(max(rest_ms)) rest_max,
             round(avg(auth_ms)) auth, round(avg(storage_ms)) storage, round(avg(site_ms)) site,
             round(100.0 * avg(case when rest_ok and auth_ok and storage_ok and coalesce(site_ok, true) then 1 else 0 end), 1) up,
             round(avg(conns)) conns, max(conns_max) conns_max,
             max(db_bytes) db_bytes, round(avg(cache_hit), 2) cache_hit,
             max(locks) locks, max(long_q) long_q,
             max(active_orders) active_orders, round(avg(tpm)) tpm
        from b group by t) x));

  out := out || jsonb_build_object('summary', (
    select jsonb_build_object(
      'samples',    count(*),
      'uptime_all', round(100.0 * avg(case when rest_ok and auth_ok and storage_ok and coalesce(site_ok, true) then 1 else 0 end), 2),
      'uptime', jsonb_build_object(
          'rest',    round(100.0 * avg(case when rest_ok    then 1 else 0 end), 2),
          'auth',    round(100.0 * avg(case when auth_ok    then 1 else 0 end), 2),
          'storage', round(100.0 * avg(case when storage_ok then 1 else 0 end), 2),
          'site',    round(100.0 * avg(case when coalesce(site_ok, true) then 1 else 0 end), 2)),
      'p50', jsonb_build_object(
          'rest',    percentile_cont(0.5)  within group (order by rest_ms),
          'auth',    percentile_cont(0.5)  within group (order by auth_ms),
          'storage', percentile_cont(0.5)  within group (order by storage_ms),
          'site',    percentile_cont(0.5)  within group (order by site_ms)),
      'p95', jsonb_build_object(
          'rest',    percentile_cont(0.95) within group (order by rest_ms),
          'auth',    percentile_cont(0.95) within group (order by auth_ms),
          'storage', percentile_cont(0.95) within group (order by storage_ms),
          'site',    percentile_cont(0.95) within group (order by site_ms)),
      'deadlocks', max(deadlocks) - min(deadlocks))
    from public.monitor_samples where at >= since));

  out := out || jsonb_build_object('incidents', (
    select coalesce(jsonb_agg(x order by x.at desc), '[]'::jsonb) from (
      select at, rest_ms, auth_ms, storage_ms, site_ms, rest_ok, auth_ok, storage_ok, site_ok, locks, long_q
        from public.monitor_samples
       where at >= since
         and (not rest_ok or not auth_ok or not storage_ok or site_ok = false
              or rest_ms > 1500 or auth_ms > 1500 or storage_ms > 1500 or locks > 0 or long_q > 0)
       order by at desc limit 30) x));

  out := out || jsonb_build_object('current', (
    select jsonb_build_object(
      'last',          (select to_jsonb(s) from public.monitor_samples s order by at desc limit 1),
      'db_bytes',      pg_database_size(current_database()),
      'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
      'storage_by_bucket', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                               select bucket_id, count(*) files, coalesce(sum((metadata->>'size')::bigint), 0) bytes
                                 from storage.objects group by bucket_id order by 3 desc) x),
      'top_tables',    (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                               select relname name, n_live_tup rows_, pg_total_relation_size(relid) bytes
                                 from pg_stat_user_tables where schemaname = 'public'
                                order by pg_total_relation_size(relid) desc limit 8) x),
      'db_growth',     (select coalesce(jsonb_agg(x order by x.d), '[]'::jsonb) from (
                               select (at at time zone tz)::date d, max(db_bytes) bytes
                                 from public.monitor_samples where at >= now() - interval '30 days'
                                group by 1) x))));

  out := out || jsonb_build_object('ops', jsonb_build_object(
    'today', (
      select jsonb_build_object(
        'orders',   count(*),
        'revenue',  coalesce(sum(total), 0),
        'avg_wait', round(avg(extract(epoch from served_at - ordered_at) / 60)
                          filter (where served_at is not null and ordered_at is not null), 1),
        'last_sale', max(paid_at))
      from public.sales where paid_at >= today),
    'active_now',  (select count(*) from public.orders),
    'stale_now',   (select count(*) from public.orders where created_at < today),
    'stations_now', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
                       select station || ':' || status::text k, count(*) v
                         from public.order_stations group by 1) x),
    'today_hourly', (
      select coalesce(jsonb_agg(x order by x.h), '[]'::jsonb) from (
        select extract(hour from paid_at at time zone tz)::int h, count(*) orders, sum(total) revenue
          from public.sales where paid_at >= today group by 1) x),
    'peak_hours', (
      select coalesce(jsonb_agg(x order by x.h), '[]'::jsonb) from (
        select h, round(count(*)::numeric / greatest(count(distinct d), 1), 1) avg_orders
          from (select extract(hour from ordered_at at time zone tz)::int h,
                       (ordered_at at time zone tz)::date d
                  from public.sales where ordered_at >= d30) s
         group by h) x),
    'daily', (
      select coalesce(jsonb_agg(x order by x.d), '[]'::jsonb) from (
        select (paid_at at time zone tz)::date d,
               count(*) orders,
               sum(total) revenue,
               sum(total) filter (where payment_method = 'tien_mat') cash,
               sum(total) filter (where payment_method = 'chuyen_khoan') transfer,
               count(*) filter (where dine_type = 'tai_quan') tai_quan,
               count(*) filter (where dine_type = 'mang_ve') mang_ve,
               count(*) filter (where dine_type = 'giao_hang') giao_hang,
               count(*) filter (where source = 'khong_ma') khong_ma,
               round(avg(extract(epoch from served_at - ordered_at) / 60)
                     filter (where served_at is not null and ordered_at is not null
                               and served_at - ordered_at < interval '3 hours'), 1) avg_wait,
               round(avg((station_minutes->>'bep')::numeric), 1) bep_min,
               round(avg((station_minutes->>'pha_che')::numeric), 1) pha_che_min
          from public.sales where paid_at >= d30 group by 1) x),
    'top_items_7d', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select i->>'name' name, sum(coalesce((i->>'qty')::int, 1)) qty,
               sum(coalesce((i->>'qty')::int, 1) * coalesce((i->>'price')::int, 0)) revenue
          from public.sales s, jsonb_array_elements(s.items) i
         where s.paid_at >= today - interval '6 days'
         group by 1 order by 2 desc limit 10) x)
  ));

  out := out || jsonb_build_object('pay', jsonb_build_object(
    'daily', (
      select coalesce(jsonb_agg(x order by x.d), '[]'::jsonb) from (
        select (coalesce(txn_at, created_at) at time zone tz)::date d,
               count(*) n,
               sum(amount) amount,
               count(*) filter (where status = 'da_khop') da_khop,
               count(*) filter (where status = 'don_da_thu') don_da_thu,
               count(*) filter (where status = 'khong_ma') khong_ma,
               sum(amount) filter (where status = 'khong_ma') khong_ma_amount
          from public.bank_txns where coalesce(txn_at, created_at) >= d30 group by 1) x),
    'unreviewed', (select count(*) from public.bank_txns where status = 'khong_ma' and reviewed_at is null),
    'last_txn',   (select max(coalesce(txn_at, created_at)) from public.bank_txns),
    'devices',    (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                     select coalesce(device, '?') device, count(*) n, max(created_at) last_at
                       from public.bank_txns group by 1 order by 3 desc) x),
    'method_30d', (select jsonb_build_object(
                     'tien_mat',     coalesce(sum(total) filter (where payment_method = 'tien_mat'), 0),
                     'chuyen_khoan', coalesce(sum(total) filter (where payment_method = 'chuyen_khoan'), 0))
                     from public.sales where paid_at >= d30)
  ));

  out := out || jsonb_build_object('bot', jsonb_build_object(
    'captures_daily', (
      select coalesce(jsonb_agg(x order by x.d), '[]'::jsonb) from (
        select (created_at at time zone tz)::date d, count(*) n,
               count(*) filter (where ai_error is not null) errors,
               round(avg(ai_ms)) avg_ms, max(ai_ms) max_ms
          from public.chat_captures where created_at >= d30 group by 1) x),
    'drafts_daily', (
      select coalesce(jsonb_agg(x order by x.d), '[]'::jsonb) from (
        select (created_at at time zone tz)::date d, count(*) n,
               count(*) filter (where status = 'da_duyet') da_duyet,
               count(*) filter (where status = 'huy') huy,
               count(*) filter (where status not in ('da_duyet', 'huy')) cho
          from public.fb_drafts where created_at >= d30 group by 1) x),
    'drafts_by_channel', (
      select coalesce(jsonb_object_agg(coalesce(kenh, '?'), n), '{}'::jsonb) from (
        select kenh, count(*) n from public.fb_drafts where created_at >= d30 group by 1) x),
    'photos_daily', (
      select coalesce(jsonb_agg(x order by x.d), '[]'::jsonb) from (
        select (created_at at time zone tz)::date d, count(*) n,
               count(*) filter (where not done) pending
          from public.bot_photos where created_at >= d30 group by 1) x),
    'pending_photos', (select count(*) from public.bot_photos where not done),
    'last_capture', (select max(created_at) from public.chat_captures),
    'last_error',   (select jsonb_build_object('at', created_at, 'error', left(ai_error, 200))
                       from public.chat_captures where ai_error is not null order by created_at desc limit 1)
  ));

  return out;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.my_employee_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from employees where auth_user_id = auth.uid() and is_active
$function$
;
CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS staff_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from employees where auth_user_id = auth.uid() and is_active
$function$
;
CREATE OR REPLACE FUNCTION public.notify_menu_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  begin
    perform realtime.send(jsonb_build_object('t', tg_table_name), 'changed', 'menu', false);
  exception when others then null;
  end;
  return null;
end $function$
;
CREATE OR REPLACE FUNCTION public.notify_order_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if tg_table_name = 'orders' then v_id := coalesce(new.id, old.id);
  else v_id := coalesce(new.order_id, old.order_id);
  end if;
  if v_id is not null then
    begin
      perform realtime.send(jsonb_build_object('t', tg_table_name), 'changed', 'don-' || v_id::text, false);
    exception when others then null;  -- lỗi gửi tín hiệu không được làm hỏng việc chính (khách vẫn tự hỏi lại 15 giây/lần)
    end;
  end if;
  return null;
end $function$
;
CREATE OR REPLACE FUNCTION public.owner_update_shift(p_id uuid, p_in timestamp with time zone, p_out timestamp with time zone, p_note text)
 RETURNS shifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s   shifts;
  cfg shop_settings;
  m   int;
  pm  int;
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  if p_out is not null and p_out <= p_in then raise exception 'BAD_TIME'; end if;
  select * into cfg from shop_settings where id = 1;
  select * into s from shifts where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_out is null then
    update shifts set check_in_at = p_in, check_out_at = null, paid_minutes = null, pay_amount = null,
                      note = nullif(trim(p_note), '')
     where id = p_id returning * into s;
    return s;
  end if;
  m  := floor(extract(epoch from (p_out - p_in)) / 60);
  pm := apply_rounding(m, coalesce(s.round_minutes, cfg.round_minutes), coalesce(s.round_mode, cfg.round_mode));
  update shifts
     set check_in_at   = p_in,
         check_out_at  = p_out,
         round_minutes = coalesce(s.round_minutes, cfg.round_minutes),
         round_mode    = coalesce(s.round_mode, cfg.round_mode),
         pay_round     = coalesce(s.pay_round, cfg.pay_round),
         paid_minutes  = pm,
         pay_amount    = round_money(pm * s.hourly_rate / 60.0, coalesce(s.pay_round, cfg.pay_round)),
         note          = nullif(trim(p_note), '')
   where id = p_id
  returning * into s;
  return s;
end $function$
;
CREATE OR REPLACE FUNCTION public.place_order(p_queue_number integer, p_customer_name text, p_items jsonb, p_customer_phone text DEFAULT NULL::text, p_confirm_duplicate boolean DEFAULT false, p_note text DEFAULT NULL::text, p_dine_type text DEFAULT 'tai_quan'::text, p_address text DEFAULT NULL::text, p_deliver_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dine  text := case when p_dine_type in ('mang_ve', 'giao_hang') then p_dine_type else 'tai_quan' end;
  v_queue int  := case when p_dine_type in ('mang_ve', 'giao_hang') then null else p_queue_number end;
  v_order orders;
  v_dup   text;
  v_total int;
begin
  if v_dine = 'giao_hang' then
    -- Đơn giao hàng (khách nhắn Facebook, gọi điện) chỉ chủ quán / nhân viên đã đăng nhập mới tạo được
    if my_role() is null then raise exception 'FORBIDDEN'; end if;
    if coalesce(trim(p_address), '') = '' then
      raise exception 'MISSING_ADDRESS' using hint = 'Nhập địa chỉ giao hàng';
    end if;
  end if;
  if v_dine = 'tai_quan' and (v_queue is null or v_queue <= 0) then
    raise exception 'MISSING_QUEUE_NUMBER' using hint = 'Vui lòng nhập số thứ tự trên thẻ bạn vừa lấy';
  end if;
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'MISSING_NAME' using hint = 'Vui lòng nhập tên để quán liên hệ khi cần';
  end if;

  if v_queue is not null then
    select o.customer_name into v_dup from orders o where o.queue_number = v_queue limit 1;
    if found and not p_confirm_duplicate then
      raise exception 'DUPLICATE_QUEUE'
        using hint = format('Số %s đang có đơn của %s chưa thanh toán', v_queue, v_dup);
    end if;
  end if;

  insert into orders (queue_number, customer_name, customer_phone, note, dine_type, address, deliver_at)
  values (v_queue, trim(p_customer_name), nullif(trim(p_customer_phone), ''),
          nullif(left(trim(p_note), 300), ''), v_dine,
          case when v_dine = 'giao_hang' then nullif(left(trim(p_address), 300), '') end,
          case when v_dine = 'giao_hang' then p_deliver_at end)
  returning * into v_order;

  perform private.add_items(v_order.id, p_items);
  select total into v_total from orders where id = v_order.id;
  return jsonb_build_object('order_id', v_order.id, 'access_token', v_order.access_token, 'total', v_total);
end $function$
;
CREATE OR REPLACE FUNCTION public.promo_live(p promotions, p_at timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select p.is_active
     and (p.start_at is null or p_at >= p.start_at)
     and (p.end_at   is null or p_at <  p.end_at)
     and (p.days is null or cardinality(p.days) = 0
          or extract(isodow from p_at at time zone 'Asia/Ho_Chi_Minh')::int = any(p.days))
     and (p.time_from is null or p.time_to is null or p.time_from = p.time_to
          or case when p.time_from < p.time_to
                  then (p_at at time zone 'Asia/Ho_Chi_Minh')::time >= p.time_from
                   and (p_at at time zone 'Asia/Ho_Chi_Minh')::time <  p.time_to
                  -- khung giờ qua nửa đêm, ví dụ 22:00 → 02:00
                  else (p_at at time zone 'Asia/Ho_Chi_Minh')::time >= p.time_from
                    or (p_at at time zone 'Asia/Ho_Chi_Minh')::time <  p.time_to end)
$function$
;
CREATE OR REPLACE FUNCTION public.promo_usage()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_object_agg(p.id, private.promo_used(p)), '{}'::jsonb)
    from promotions p where p.limit_qty is not null and my_role() is not null
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_order_status(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update orders o
     set status = s.st, accepted_at = s.acc, estimated_ready_at = s.eta, served_at = s.srv
    from (select case when bool_and(status = 'da_ra_mon') then 'da_ra_mon'::order_status
                      when bool_or(status <> 'cho_nhan') then 'dang_lam'::order_status
                      else 'cho_nhan'::order_status end as st,
                 min(accepted_at) as acc,
                 coalesce(max(estimated_ready_at) filter (where status <> 'da_ra_mon'),
                          max(estimated_ready_at)) as eta,
                 case when bool_and(status = 'da_ra_mon') then max(served_at) end as srv
            from order_stations where order_id = p_order) s
   where o.id = p_order and s.st is not null;
  -- Đã thu tiền trước (đủ số) và mọi nơi đã ra món: đơn xong, chuyển sang doanh thu
  if exists (select 1 from orders where id = p_order and status = 'da_ra_mon'
                and paid_amount is not null and paid_amount = total) then
    perform private.finalize_order(p_order, null);
  end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.reset_sepay_key()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text;
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  update private.sepay_config set api_key = replace(gen_random_uuid()::text, '-', '') where id = 1 returning api_key into v;
  return v;
end $function$
;
CREATE OR REPLACE FUNCTION public.round_money(p_amount numeric, p_step integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (round(p_amount / greatest(coalesce(p_step, 1), 1)) * greatest(coalesce(p_step, 1), 1))::int
$function$
;
CREATE OR REPLACE FUNCTION public.staff_add_items(p_order_id uuid, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_total int;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from orders where id = p_order_id) then raise exception 'ORDER_NOT_FOUND'; end if;
  perform private.add_items(p_order_id, p_items);
  perform refresh_order_status(p_order_id);
  select total into v_total from orders where id = p_order_id;
  return v_total;
end $function$
;
CREATE OR REPLACE FUNCTION public.staff_set_item_options(p_item_id bigint, p_choice_ids integer[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  i order_items; p promotions; v_extra int; v_opts jsonb; v_base int; v_total int;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  select * into i from order_items where id = p_item_id for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  if i.menu_item_id is null or not exists (select 1 from menu_items where id = i.menu_item_id) then
    raise exception 'ITEM_UNAVAILABLE' using hint = i.item_name;
  end if;
  select o_extra, o_opts into v_extra, v_opts from private.item_options(i.menu_item_id, coalesce(p_choice_ids, '{}'));
  v_base := i.unit_price - coalesce((select sum((e ->> 'price')::int) from jsonb_array_elements(i.options) e), 0);
  if i.promo_group is not null and i.promo_part in ('combo', 'tang') then
    select * into p from promotions where id = i.promo_id;
    if found and (p.kind = 'don_tang' or p.option_mode = 'mien_phi') then
      v_extra := 0;
      v_opts := coalesce((select jsonb_agg(e || '{"price": 0}'::jsonb) from jsonb_array_elements(v_opts) e), '[]'::jsonb);
    elsif found and p.option_mode = 'khong_phi' and exists (select 1 from jsonb_array_elements(v_opts) e where (e ->> 'price')::int > 0) then
      raise exception 'PROMO_OPTION' using hint = format('%s trong ưu đãi không chọn được tuỳ chọn có phí', i.item_name);
    end if;
  end if;
  update order_items set options = v_opts, unit_price = v_base + v_extra, edited_at = now() where id = p_item_id;
  update order_stations s
     set status = 'cho_nhan', accepted_at = null, estimated_ready_at = null, served_at = null
   where s.order_id = i.order_id and s.station = i.station and s.status = 'da_ra_mon';
  perform private.apply_gifts(i.order_id);
  update orders set total = (select coalesce(sum(unit_price * qty), 0) from order_items where order_id = i.order_id)
   where id = i.order_id;
  perform refresh_order_status(i.order_id);
  select total into v_total from orders where id = i.order_id;
  return v_total;
end $function$
;
CREATE OR REPLACE FUNCTION public.staff_set_item_qty(p_item_id bigint, p_qty integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_order uuid; v_group uuid; v_kind text; v_total int;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  select order_id, promo_group, promo_kind into v_order, v_group, v_kind from order_items where id = p_item_id;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  if v_group is not null and coalesce(p_qty, 0) > 0 then
    raise exception 'PROMO_LOCKED';
  end if;
  if coalesce(p_qty, 0) <= 0 then
    if not exists (select 1 from order_items where order_id = v_order
                      and id <> p_item_id and (v_group is null or promo_group is distinct from v_group)
                      and promo_kind is distinct from 'don_tang') then
      raise exception 'ORDER_WOULD_BE_EMPTY' using hint = 'Đơn chỉ còn món này. Muốn bỏ hết thì huỷ đơn.';
    end if;
    delete from order_items where id = p_item_id or (v_group is not null and order_id = v_order and promo_group = v_group);
    if v_kind is distinct from 'don_tang' then
      perform private.apply_gifts(v_order);
    end if;
    delete from order_stations s
     where s.order_id = v_order
       and not exists (select 1 from order_items i where i.order_id = v_order and i.station = s.station);
  else
    update order_items set qty = least(p_qty, 50) where id = p_item_id;
    perform private.apply_gifts(v_order);
  end if;
  update orders set total = (select coalesce(sum(unit_price * qty), 0) from order_items where order_id = v_order)
   where id = v_order;
  perform refresh_order_status(v_order);
  select total into v_total from orders where id = v_order;
  return v_total;
end $function$
;
CREATE OR REPLACE FUNCTION public.staff_update_order(p_order_id uuid, p_dine_type text, p_queue_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o orders; v_dup text;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.dine_type = 'giao_hang' then raise exception 'DELIVERY_LOCKED'; end if;
  if p_dine_type not in ('tai_quan', 'mang_ve') then raise exception 'BAD_DINE'; end if;
  if p_dine_type = 'tai_quan' and (p_queue_number is null or p_queue_number <= 0) then
    raise exception 'MISSING_QUEUE_NUMBER';
  end if;
  update orders
     set dine_type = p_dine_type,
         queue_number = case when p_dine_type = 'tai_quan' then p_queue_number end
   where id = p_order_id;
  perform private.apply_gifts(p_order_id);
  update orders set total = (select coalesce(sum(unit_price * qty), 0) from order_items where order_id = p_order_id)
   where id = p_order_id;
  perform refresh_order_status(p_order_id);
  if p_dine_type = 'tai_quan' then
    select customer_name into v_dup from orders where queue_number = p_queue_number and id <> p_order_id limit 1;
  end if;
  return jsonb_build_object('duplicate_with', v_dup);
end $function$
;
CREATE OR REPLACE FUNCTION public.stock_move(p_item uuid, p_kind text, p_amount numeric, p_in_buy_unit boolean DEFAULT false, p_note text DEFAULT NULL::text, p_cost integer DEFAULT NULL::integer, p_receipt bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare it stock_items; v_use numeric; v_delta numeric; v_emp employees;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  if p_kind not in ('nhap', 'dung', 'hong', 'kiem') then raise exception 'BAD_KIND'; end if;
  if p_amount is null or p_amount < 0 or (p_kind <> 'kiem' and p_amount = 0) then raise exception 'BAD_QTY'; end if;
  if p_receipt is not null and not exists (select 1 from stock_receipts where id = p_receipt) then raise exception 'RECEIPT_NOT_FOUND'; end if;
  select * into it from stock_items where id = p_item for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  v_use := p_amount * case when p_in_buy_unit then it.per_buy else 1 end;
  v_delta := case p_kind when 'nhap' then v_use when 'kiem' then v_use - it.qty else -v_use end;
  update stock_items set qty = qty + v_delta where id = p_item;
  select * into v_emp from employees where id = my_employee_id();
  insert into stock_moves (item_id, kind, delta, qty_after, amount, unit, cost, note, employee_id, employee_name, receipt_id)
  values (p_item, p_kind, v_delta, it.qty + v_delta, p_amount, case when p_in_buy_unit then it.buy_unit else it.use_unit end,
          case when p_kind = 'nhap' then p_cost end, nullif(left(trim(p_note), 200), ''), v_emp.id, v_emp.full_name,
          case when p_kind = 'nhap' then p_receipt end);
  return jsonb_build_object('qty', it.qty + v_delta, 'delta', v_delta);
end $function$
;
CREATE OR REPLACE FUNCTION public.stock_receipt_add(p_path text, p_supplier text DEFAULT NULL::text, p_invoice_no text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_emp employees; v_id bigint;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  if p_path is null or p_path !~ '^[0-9]{4}-[0-9]{2}/[A-Za-z0-9._-]{1,80}\.jpg$' then raise exception 'BAD_PATH'; end if;
  select * into v_emp from employees where id = my_employee_id();
  insert into stock_receipts (photo_path, supplier, invoice_no, note, employee_id, employee_name)
  values (p_path, nullif(left(trim(p_supplier), 80), ''), nullif(left(trim(p_invoice_no), 40), ''),
          nullif(left(trim(p_note), 200), ''), v_emp.id, v_emp.full_name)
  returning id into v_id;
  return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.suggest_wait_minutes(p_order_id uuid, p_station text DEFAULT 'bep'::text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_own   int;
  v_ahead int;
  v_cap   int;
  v_avg   numeric;
begin
  select coalesce(max(m.prep_minutes), 10) into v_own
    from order_items i join menu_items m on m.id = i.menu_item_id
   where i.order_id = p_order_id and i.station = p_station;
  select count(*) into v_ahead from order_stations where station = p_station and status = 'dang_lam';
  select case when p_station = 'pha_che' then bar_capacity else kitchen_capacity end
    into v_cap from shop_settings where id = 1;
  select avg((station_minutes ->> p_station)::numeric) into v_avg from sales
   where paid_at > now() - interval '14 days' and station_minutes ? p_station;
  return (ceil((v_own + floor(v_ahead::numeric / greatest(v_cap, 1)) * coalesce(v_avg, v_own)) / 5.0) * 5)::int;
end $function$
;
CREATE OR REPLACE FUNCTION public.sync_stock_pack()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update stock_items set buy_unit = new.buy_unit, use_unit = new.use_unit, per_buy = new.per_buy
   where pack_id = new.id;
  return null;
end $function$
;
CREATE OR REPLACE FUNCTION public.unlink_sale(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  update bank_txns set sale_id = null, note = 'Đã bỏ khỏi doanh thu (trùng với đơn đã thu)' where sale_id = p_id;
  delete from sales where id = p_id and source = 'khong_ma';
end $function$
;

-- ===== Trigger =====
CREATE CONSTRAINT TRIGGER order_edit_commit AFTER INSERT ON private.order_edit_tx DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.trg_edit_commit();
CREATE TRIGGER fb_drafts_train_cancel AFTER UPDATE OF status ON public.fb_drafts FOR EACH ROW EXECUTE FUNCTION private.fb_train_cancel();
CREATE TRIGGER order_items_track_edit BEFORE INSERT OR DELETE OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION private.trg_items_before();
CREATE TRIGGER orders_track_delete BEFORE DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.trg_order_delete();
CREATE TRIGGER orders_track_update BEFORE UPDATE OF dine_type, queue_number, address, deliver_at, note ON public.orders FOR EACH ROW EXECUTE FUNCTION private.trg_order_update();
CREATE TRIGGER trg_menu_categories_changed AFTER INSERT OR DELETE OR UPDATE ON public.menu_categories FOR EACH STATEMENT EXECUTE FUNCTION notify_menu_change();
CREATE TRIGGER trg_menu_items_changed AFTER INSERT OR DELETE OR UPDATE ON public.menu_items FOR EACH STATEMENT EXECUTE FUNCTION notify_menu_change();
CREATE TRIGGER trg_menu_links_changed AFTER INSERT OR DELETE OR UPDATE ON public.menu_item_option_groups FOR EACH STATEMENT EXECUTE FUNCTION notify_menu_change();
CREATE TRIGGER trg_notify_calls AFTER UPDATE ON public.staff_calls FOR EACH ROW EXECUTE FUNCTION notify_order_change();
CREATE TRIGGER trg_notify_orders AFTER DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION notify_order_change();
CREATE TRIGGER trg_notify_stations AFTER UPDATE ON public.order_stations FOR EACH ROW EXECUTE FUNCTION notify_order_change();
CREATE TRIGGER trg_option_choices_changed AFTER INSERT OR DELETE OR UPDATE ON public.option_choices FOR EACH STATEMENT EXECUTE FUNCTION notify_menu_change();
CREATE TRIGGER trg_promotion_items_changed AFTER INSERT OR DELETE OR UPDATE ON public.promotion_items FOR EACH STATEMENT EXECUTE FUNCTION notify_menu_change();
CREATE TRIGGER trg_promotions_changed AFTER INSERT OR DELETE OR UPDATE ON public.promotions FOR EACH STATEMENT EXECUTE FUNCTION notify_menu_change();
CREATE TRIGGER trg_stock_pack_sync AFTER UPDATE ON public.stock_packs FOR EACH ROW EXECUTE FUNCTION sync_stock_pack();

-- ===== Bảo mật theo dòng (RLS) =====
alter table private.bot_link enable row level security;
alter table public.bank_txns enable row level security;
alter table public.bot_photos enable row level security;
alter table public.bot_users enable row level security;
alter table public.chat_captures enable row level security;
alter table public.employees enable row level security;
alter table public.fb_drafts enable row level security;
alter table public.fb_messages enable row level security;
alter table public.fb_threads enable row level security;
alter table public.fb_train enable row level security;
alter table public.fb_train_menu enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_item_option_groups enable row level security;
alter table public.menu_items enable row level security;
alter table public.monitor_samples enable row level security;
alter table public.option_choices enable row level security;
alter table public.option_groups enable row level security;
alter table public.order_changes enable row level security;
alter table public.order_items enable row level security;
alter table public.order_stations enable row level security;
alter table public.orders enable row level security;
alter table public.promotion_items enable row level security;
alter table public.promotions enable row level security;
alter table public.sales enable row level security;
alter table public.shifts enable row level security;
alter table public.shop_settings enable row level security;
alter table public.staff_calls enable row level security;
alter table public.stock_barcodes enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_moves enable row level security;
alter table public.stock_packs enable row level security;
alter table public.stock_receipts enable row level security;
create policy bank_txns_staff_read on public.bank_txns as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));
create policy bot_users_owner_del on public.bot_users as PERMISSIVE for DELETE to public using ((my_role() = 'owner'::staff_role));
create policy bot_users_owner_read on public.bot_users as PERMISSIVE for SELECT to public using ((my_role() = 'owner'::staff_role));
create policy call_done on public.staff_calls as PERMISSIVE for UPDATE to public using ((my_role() IS NOT NULL));
create policy call_read on public.staff_calls as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));
create policy checkin_upload on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'checkin-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy checkin_view on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'checkin-photos'::text) AND ((my_role() = 'owner'::staff_role) OR ((storage.foldername(name))[1] = (auth.uid())::text))));
create policy don_anh_view on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'don-anh'::text) AND (my_role() = 'owner'::staff_role)));
create policy emp_owner on public.employees as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy emp_self on public.employees as PERMISSIVE for SELECT to public using ((auth_user_id = ( SELECT auth.uid() AS uid)));
create policy fb_drafts_owner on public.fb_drafts as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy fb_messages_owner on public.fb_messages as PERMISSIVE for SELECT to public using ((my_role() = 'owner'::staff_role));
create policy fb_threads_owner on public.fb_threads as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy fb_train_menu_owner on public.fb_train_menu as PERMISSIVE for SELECT to public using ((my_role() = 'owner'::staff_role));
create policy fb_train_owner_del on public.fb_train as PERMISSIVE for DELETE to public using ((my_role() = 'owner'::staff_role));
create policy fb_train_owner_read on public.fb_train as PERMISSIVE for SELECT to public using ((my_role() = 'owner'::staff_role));
create policy hoa_don_kho_del on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'hoa-don-kho'::text) AND (my_role() = 'owner'::staff_role)));
create policy hoa_don_kho_upload on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'hoa-don-kho'::text) AND (my_role() IS NOT NULL)));
create policy hoa_don_kho_view on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'hoa-don-kho'::text) AND (my_role() IS NOT NULL)));
create policy mcat_owner on public.menu_categories as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy mcat_read on public.menu_categories as PERMISSIVE for SELECT to public using (true);
create policy menu_img_delete on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'menu-images'::text) AND (my_role() = 'owner'::staff_role)));
create policy menu_img_insert on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'menu-images'::text) AND (my_role() = 'owner'::staff_role)));
create policy menu_img_read on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'menu-images'::text));
create policy menu_img_update on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'menu-images'::text) AND (my_role() = 'owner'::staff_role)));
create policy mi_owner on public.menu_items as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy mi_read on public.menu_items as PERMISSIVE for SELECT to public using (true);
create policy miog_owner on public.menu_item_option_groups as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy miog_read on public.menu_item_option_groups as PERMISSIVE for SELECT to public using (true);
create policy oc_owner on public.option_choices as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy oc_read on public.option_choices as PERMISSIVE for SELECT to public using (true);
create policy og_owner on public.option_groups as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy og_read on public.option_groups as PERMISSIVE for SELECT to public using (true);
create policy oi_read on public.order_items as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));
create policy ord_read on public.orders as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));
create policy order_changes_staff_read on public.order_changes as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));
create policy ost_read on public.order_stations as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));
create policy promo_owner on public.promotions as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy promo_staff_read on public.promotions as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));
create policy promoi_owner on public.promotion_items as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy promoi_staff_read on public.promotion_items as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));
create policy sales_owner on public.sales as PERMISSIVE for SELECT to public using ((my_role() = 'owner'::staff_role));
create policy settings_owner on public.shop_settings as PERMISSIVE for UPDATE to public using ((my_role() = 'owner'::staff_role));
create policy settings_read on public.shop_settings as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));
create policy shift_owner on public.shifts as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy shift_self on public.shifts as PERMISSIVE for SELECT to public using ((employee_id = my_employee_id()));
create policy stock_barcodes_add on public.stock_barcodes as PERMISSIVE for INSERT to public with check ((my_role() IS NOT NULL));
create policy stock_barcodes_owner on public.stock_barcodes as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy stock_barcodes_read on public.stock_barcodes as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));
create policy stock_items_owner on public.stock_items as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy stock_items_read on public.stock_items as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));
create policy stock_moves_owner_del on public.stock_moves as PERMISSIVE for DELETE to public using ((my_role() = 'owner'::staff_role));
create policy stock_moves_read on public.stock_moves as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));
create policy stock_packs_owner on public.stock_packs as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy stock_packs_read on public.stock_packs as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));
create policy stock_receipts_owner on public.stock_receipts as PERMISSIVE for ALL to public using ((my_role() = 'owner'::staff_role)) with check ((my_role() = 'owner'::staff_role));
create policy stock_receipts_read on public.stock_receipts as PERMISSIVE for SELECT to public using ((my_role() IS NOT NULL));

-- ===== Realtime =====
alter publication supabase_realtime add table public.bank_txns;
alter publication supabase_realtime add table public.fb_drafts;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.order_stations;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.staff_calls;

-- ===== Kho ảnh (Storage) =====
insert into storage.buckets (id, name, public) values ('chat-captures', 'chat-captures', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('checkin-photos', 'checkin-photos', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('don-anh', 'don-anh', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('hoa-don-kho', 'hoa-don-kho', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', true) on conflict (id) do nothing;
