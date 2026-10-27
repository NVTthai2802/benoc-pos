-- =====================================================================
-- POS QUÁN ĂN — SCHEMA PHÁC THẢO (Supabase / PostgreSQL)
-- Cách dùng: Supabase Dashboard > SQL Editor > dán toàn bộ file > Run
-- Quy ước: tiền lưu bằng số nguyên VNĐ; thời gian luôn lấy theo giờ server.
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- 0. CẤU HÌNH QUÁN (chỉ có 1 dòng)
-- =====================================================================
create table shop_settings (
  id               int primary key default 1 check (id = 1),
  shop_name        text not null default 'Quán của tôi',
  -- Làm tròn giờ công: mặc định 1 = KHÔNG làm tròn, tính đúng từng phút. Chủ quán tự bật trong Cài đặt.
  round_minutes    int  not null default 1 check (round_minutes in (1, 5, 10, 15, 30, 60)),
  round_mode       text not null default 'nearest' check (round_mode in ('up', 'down', 'nearest')),
  -- Làm tròn tiền lương mỗi ca tới bội số này (gần nhất). 1 = giữ nguyên số lẻ.
  pay_round        int  not null default 1000 check (pay_round in (1, 100, 500, 1000)),
  kitchen_capacity int  not null default 2 check (kitchen_capacity > 0), -- số đơn bếp làm song song
  bar_capacity     int  not null default 2 check (bar_capacity > 0),     -- số đơn quầy pha chế làm song song
  bank_bin         text not null default '970422',     -- tài khoản nhận chuyển khoản (mã VietQR): mã BIN ngân hàng
  bank_name        text not null default 'MB Bank',
  bank_account     text not null default '0393247469',
  bank_holder      text not null default '',           -- tên chủ tài khoản (không bắt buộc)
  bank_note        text not null default 'BENOC {ban} {ten}', -- mẫu nội dung chuyển khoản: {ban} {ten}
  updated_at       timestamptz not null default now()
);
insert into shop_settings default values;

-- =====================================================================
-- 1. NHÂN VIÊN & CHẤM CÔNG
-- =====================================================================
create type staff_role as enum ('owner', 'kitchen', 'bar', 'staff');  -- kitchen = máy bếp, bar = máy quầy pha chế

create table employees (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null, -- tài khoản đăng nhập
  full_name    text not null,
  phone        text,
  role         staff_role not null default 'staff',  -- 'kitchen' = máy bếp, 'bar' = máy quầy pha chế
  hourly_rate  int  not null default 0 check (hourly_rate >= 0), -- VNĐ/giờ
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table shifts (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references employees(id),
  employee_name   text not null,  -- tên lúc vào ca, đổi tên / nghỉ việc sau này ca cũ vẫn giữ tên
  check_in_at     timestamptz not null default now(),   -- giờ server, client không tự đặt
  check_in_photo  text not null,                        -- đường dẫn ảnh trong Storage
  check_out_at    timestamptz,
  check_out_photo text,
  hourly_rate     int  not null,  -- chụp lại lương/giờ lúc vào ca, đổi lương sau không ảnh hưởng ca cũ
  round_minutes   int,            -- quy tắc làm tròn giờ đã áp dụng (1 = không làm tròn)
  round_mode      text,
  pay_round       int,            -- làm tròn tiền đã áp dụng (lưu để đối chiếu)
  actual_minutes  int generated always as (
                    case when check_out_at is null then null
                         else floor(extract(epoch from (check_out_at - check_in_at)) / 60)::int end
                  ) stored,       -- số phút thực tế
  paid_minutes    int,            -- số phút tính lương sau làm tròn
  pay_amount      int,            -- tiền lương ca (VNĐ)
  note            text,           -- chủ ghi chú/điều chỉnh
  paid_out_at     timestamptz,    -- chủ đã trả lương ca này chưa
  check (check_out_at is null or check_out_at > check_in_at)
);
-- Mỗi nhân viên chỉ có tối đa 1 ca đang mở
create unique index one_open_shift_per_employee on shifts(employee_id) where check_out_at is null;
create index shifts_employee_time on shifts(employee_id, check_in_at desc);

-- =====================================================================
-- 3. MENU
-- =====================================================================
create table menu_categories (
  id         serial primary key,
  name       text not null,
  color      text not null default 'vang'   -- màu khung + nền tiêu đề giống tờ menu
             check (color in ('vang', 'cam', 'hong', 'xanhla', 'xanhduong', 'tim', 'nau')),
  station    text not null default 'bep'    -- nơi làm các món trong danh mục: bếp hoặc quầy pha chế
             check (station in ('bep', 'pha_che')),
  sort_order int  not null default 0
);

create table menu_items (
  id           uuid primary key default gen_random_uuid(),
  category_id  int  references menu_categories(id) on delete set null,
  name         text not null,
  description  text,
  price        int  not null check (price >= 0),
  image_path   text,
  prep_minutes int  not null default 5 check (prep_minutes > 0), -- dùng để ước tính thời gian chờ
  tag          text,                                            -- nhãn nổi bật: "Best seller", "Đặc biệt"
  is_available boolean not null default true,                   -- tắt khi hết món
  sort_order   int  not null default 0
);

-- ---------- Tuỳ chọn món (size, topping, combo, chọn kem...) ----------
-- Một nhóm tuỳ chọn dùng chung cho nhiều món, ví dụ "Topping thêm" gắn cho mọi món cơm, mì.
create table option_groups (
  id         serial primary key,
  name       text not null unique,  -- tên nội bộ cho chủ quản lý, ví dụ "Upsize (+5k)"
  title      text not null,         -- tên khách thấy, ví dụ "Upsize"
  kind       text not null default 'do_an' check (kind in ('do_an', 'do_uong')), -- tuỳ chọn cho đồ ăn hay đồ uống
  min_select int  not null default 0 check (min_select >= 0),  -- 1 = bắt buộc chọn
  max_select int  not null default 1 check (max_select >= 1),  -- 1 = chọn một, >1 = chọn nhiều
  sort_order int  not null default 0,
  check (max_select >= min_select)
);

create table option_choices (
  id           serial primary key,
  group_id     int  not null references option_groups(id) on delete cascade,
  name         text not null,
  price_delta  int  not null default 0 check (price_delta >= 0), -- cộng thêm vào giá món
  is_default   boolean not null default false,                 -- chọn sẵn (ví dụ size M)
  is_available boolean not null default true,                 -- tắt khi hết topping
  sort_order   int  not null default 0
);

create table menu_item_option_groups (
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  group_id     int  not null references option_groups(id) on delete cascade,
  sort_order   int  not null default 0,
  primary key (menu_item_id, group_id)
);

-- =====================================================================
-- 3b. ƯU ĐÃI (combo giá ưu đãi, mua X tặng Y) — xem sql/cap-nhat-13
-- =====================================================================
-- Bảng ưu đãi
create table promotions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),  -- "Combo no nê", "Mua 1 tặng 1 trà sữa"
  kind        text not null check (kind in ('combo', 'mua_tang')),
  description text,
  image_path  text,
  price       int  check (price >= 0),                         -- combo: giá cả combo
  buy_qty     int  not null default 1 check (buy_qty between 1 and 20),   -- mua_tang: mua X
  get_qty     int  not null default 1 check (get_qty between 1 and 20),   -- mua_tang: tặng Y
  gift_same   boolean not null default false,                  -- mua_tang: tặng đúng món khách mua
  -- Topping / upsize có phí trong combo và món tặng:
  --   cong_them = cộng thêm như bình thường, mien_phi = 0đ, khong_phi = không cho chọn
  option_mode text not null default 'cong_them' check (option_mode in ('cong_them', 'mien_phi', 'khong_phi')),
  start_at    timestamptz,            -- trống = bắt đầu ngay
  end_at      timestamptz,            -- trống = không hết hạn
  days        int[],                  -- thứ trong tuần 1 = Thứ 2 … 7 = Chủ nhật; trống = mọi ngày
  time_from   time,                   -- khung giờ mỗi ngày (giờ Việt Nam); trống = cả ngày
  time_to     time,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- Món trong ưu đãi: part = 'combo' (món của combo, kèm số lượng),
-- 'mua' (món được tính là món mua), 'tang' (món được tặng)
create table promotion_items (
  id           bigserial primary key,
  promotion_id uuid not null references promotions(id) on delete cascade,
  part         text not null check (part in ('combo', 'mua', 'tang')),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  qty          int  not null default 1 check (qty between 1 and 20),
  sort_order   int  not null default 0,
  unique (promotion_id, part, menu_item_id)
);
create index promotion_items_promo on promotion_items(promotion_id);

-- =====================================================================
-- 4. ORDER (chỉ tồn tại đến khi thanh toán xong)
-- =====================================================================
create type order_status as enum ('cho_nhan', 'dang_lam', 'da_ra_mon');

create table orders (
  id                 uuid primary key default gen_random_uuid(),
  access_token       uuid not null unique default gen_random_uuid(), -- khách dùng để xem đơn của mình
  queue_number       int  check (queue_number > 0),                  -- số thứ tự khách lấy ở bếp (trống nếu mang về)
  dine_type          text not null default 'tai_quan' check (dine_type in ('tai_quan', 'mang_ve', 'giao_hang')), -- ăn tại quán / mang về / giao hàng
  address            text,          -- địa chỉ giao (đơn giao hàng do quán tự nhập)
  deliver_at         timestamptz,   -- giờ hẹn giao
  paid_amount        int,           -- đã thu bao nhiêu (thu trước khi ra món); trống = chưa thu
  paid_method        text check (paid_method in ('tien_mat', 'chuyen_khoan')),
  paid_at            timestamptz,
  paid_by            uuid references employees(id),
  customer_name      text not null check (length(trim(customer_name)) > 0),
  pickup             boolean not null default false, -- mang về do quán tạo (nút Qua lấy) = ĐẾN LẤY
  customer_phone     text,
  note               text,          -- ghi chú chung cho cả đơn (khách viết ở cuối giỏ hàng)
  status             order_status not null default 'cho_nhan',
  total              int  not null default 0,
  created_at         timestamptz not null default now(),
  accepted_at        timestamptz,   -- lúc bếp bấm nhận
  estimated_ready_at timestamptz,   -- giờ dự kiến xong, khách thấy đếm ngược
  served_at          timestamptz    -- lúc ra món
);
create index orders_queue_number on orders(queue_number);
alter table orders add constraint orders_queue_or_takeaway check (dine_type <> 'tai_quan' or queue_number is not null);
create index orders_status_created on orders(status, created_at);

create table order_items (
  id           bigserial primary key,
  order_id     uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete set null,
  item_name    text not null,   -- chụp lại tên/giá lúc đặt, đổi menu sau không ảnh hưởng
  unit_price   int  not null,   -- giá 1 phần ĐÃ cộng tuỳ chọn
  options      jsonb not null default '[]'::jsonb, -- [{"group":"Chọn size","choice":"L","price":5000}]
  qty          int  not null check (qty between 1 and 50),
  note         text,            -- "ít cay", "không hành"...
  station      text not null default 'bep' check (station in ('bep', 'pha_che')),  -- nơi làm món này
  added_at     timestamptz not null default now(),  -- món thêm sau khi bếp đã nhận đơn hiện nhãn MỚI
  promo_id     uuid references promotions(id) on delete set null, -- món thuộc ưu đãi nào
  promo_name   text,            -- chụp lại tên ưu đãi lúc đặt
  promo_kind   text,            -- 'combo' | 'mua_tang'
  promo_group  uuid,            -- các món cùng 1 phần ưu đãi khách chọn
  promo_part   text,            -- 'combo' | 'mua' | 'tang'
  edited_at    timestamptz      -- lúc đổi tuỳ chọn gần nhất (hiện nhãn ĐÃ SỬA)
);

-- Tiến độ của từng nơi trong một đơn (đơn có cả đồ ăn và đồ uống có 2 dòng)
create table order_stations (
  order_id           uuid not null references orders(id) on delete cascade,
  station            text not null check (station in ('bep', 'pha_che')),
  status             order_status not null default 'cho_nhan',
  accepted_at        timestamptz,
  estimated_ready_at timestamptz,
  served_at          timestamptz,
  primary key (order_id, station)
);
create index order_stations_station_status on order_stations(station, status);

create table staff_calls (         -- khách bấm "gọi nhân viên"
  id           bigserial primary key,
  order_id     uuid references orders(id) on delete cascade,
  queue_number int,                  -- trống nếu đơn mang về
  message      text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

-- =====================================================================
-- 5. TÓM TẮT HOÁ ĐƠN (giữ lâu dài để theo dõi doanh thu)
--    Không lưu tên / SĐT khách.
-- =====================================================================
create table sales (
  id             uuid primary key,          -- = id của order đã thanh toán
  queue_number   int,                       -- trống nếu đơn mang về
  dine_type      text not null default 'tai_quan' check (dine_type in ('tai_quan', 'mang_ve', 'giao_hang')),
  total          int  not null,
  payment_method text not null check (payment_method in ('tien_mat', 'chuyen_khoan')),
  items          jsonb not null,            -- [{menu_item_id, name, price, qty, options}]
  ordered_at     timestamptz not null,
  accepted_at    timestamptz,
  served_at      timestamptz,
  paid_at        timestamptz not null default now(),
  cook_minutes   int,                       -- từ lúc nhận đến lúc ra món cả đơn
  station_minutes jsonb,                    -- thời gian làm từng nơi, ví dụ {"bep": 9, "pha_che": 4} (để ước tính chờ)
  cashier_id     uuid references employees(id),
  customer_name  text,                      -- tên khách trên hoá đơn
  customer_phone text,
  address        text                       -- địa chỉ nếu là đơn đi ship
);
create index sales_paid_at on sales(paid_at desc);

-- =====================================================================
-- 6. HÀM TIỆN ÍCH
-- =====================================================================
create or replace function my_role() returns staff_role
language sql stable security definer set search_path = public as $$
  select role from employees where auth_user_id = auth.uid() and is_active
$$;

create or replace function my_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from employees where auth_user_id = auth.uid() and is_active
$$;

create or replace function apply_rounding(p_minutes int, p_step int, p_mode text) returns int
language sql immutable as $$
  select (case p_mode
            when 'up'   then ceil(p_minutes::numeric / p_step) * p_step
            when 'down' then floor(p_minutes::numeric / p_step) * p_step
            else round(p_minutes::numeric / p_step) * p_step
          end)::int
$$;

-- Làm tròn tiền tới bội số gần nhất, ví dụ 96.667 với bước 1.000 -> 97.000
create or replace function round_money(p_amount numeric, p_step int) returns int
language sql immutable as $$
  select (round(p_amount / greatest(coalesce(p_step, 1), 1)) * greatest(coalesce(p_step, 1), 1))::int
$$;

-- =====================================================================
-- 7. CHẤM CÔNG (giờ lấy từ server)
-- =====================================================================
create or replace function check_in(p_photo text) returns uuid
language plpgsql security definer set search_path = public as $$
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
end $$;

create or replace function check_out(p_photo text) returns shifts
language plpgsql security definer set search_path = public as $$
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
end $$;

-- =====================================================================
-- 7b. HÀM NỘI BỘ (schema private: không gọi được từ trang web, chỉ các hàm khác dùng)
-- =====================================================================
create schema if not exists private;
revoke all on schema private from public;

-- Ưu đãi có đang hiển thị lúc p_at không (giờ Việt Nam)
create or replace function promo_live(p promotions, p_at timestamptz default now()) returns boolean
language sql stable set search_path = public as $$
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
$$;

-- Ưu đãi đang chạy cho trang khách (chỉ ưu đãi còn đủ món đang bán)
create or replace function get_promotions() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by s, n), '[]'::jsonb) from (
    select p.sort_order as s, p.name as n,
      jsonb_build_object(
        'id', p.id, 'name', p.name, 'kind', p.kind, 'description', p.description, 'image_path', p.image_path,
        'price', p.price, 'buy_qty', p.buy_qty, 'get_qty', p.get_qty, 'gift_same', p.gift_same,
        'option_mode', p.option_mode, 'start_at', p.start_at, 'end_at', p.end_at, 'days', p.days,
        'time_from', to_char(p.time_from, 'HH24:MI'), 'time_to', to_char(p.time_to, 'HH24:MI'),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('part', pi.part, 'menu_item_id', pi.menu_item_id, 'qty', pi.qty)
                                            order by pi.sort_order, pi.id), '[]'::jsonb)
                    from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                   where pi.promotion_id = p.id and mi.is_available)
      ) as x
    from promotions p
    where promo_live(p)
      and case when p.kind = 'combo' then
                 p.price is not null
             and exists (select 1 from promotion_items pi where pi.promotion_id = p.id and pi.part = 'combo')
             and not exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                              where pi.promotion_id = p.id and pi.part = 'combo' and not mi.is_available)
           else exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                         where pi.promotion_id = p.id and pi.part = 'mua' and mi.is_available)
            and (p.gift_same or exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                                         where pi.promotion_id = p.id and pi.part = 'tang' and mi.is_available))
      end
  ) t
$$;

-- Kiểm tra tuỳ chọn của 1 món, trả về tiền cộng thêm và danh sách tuỳ chọn đã chọn
create or replace function private.item_options(p_item uuid, p_ids int[], out o_extra int, out o_opts jsonb)
language plpgsql security definer set search_path = public as $$
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
end $$;

-- Thêm 1 phần ưu đãi vào đơn.
-- p_pkg = {"promo_id": "...", "qty": 1, "parts": [
--           {"part": "combo"|"mua"|"tang", "menu_item_id": "...", "choice_ids": [..], "note": "..."}, ...]}
-- Mỗi phần tử parts là 1 món (1 phần). Combo 2 cơm + 1 trà → 3 phần tử.
-- Giá: combo = giá combo chia theo tỉ lệ giá gốc từng món (làm tròn nghìn, phần lẻ cộng vào món đầu);
--      mua X tặng Y = món mua giá thường, món tặng 0đ. Tuỳ chọn có phí theo cài đặt của ưu đãi.
create or replace function private.add_promo(p_order uuid, p_pkg jsonb) returns void
language plpgsql security definer set search_path = public as $$
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
  v_alloc  int;
  v_first  int;
  v_group  uuid := gen_random_uuid();
  v_i      int := 0;
  r        record;
begin
  select * into p from promotions where id = nullif(p_pkg ->> 'promo_id', '')::uuid;
  -- Cho 10 phút du di: khách bỏ vào giỏ lúc 16:58, gửi lúc 17:02 vẫn được giá ưu đãi
  if not found or not (promo_live(p) or promo_live(p, now() - interval '10 minutes')) then
    raise exception 'PROMO_ENDED' using hint = coalesce(p.name, '');
  end if;
  v_k := least(greatest(coalesce((p_pkg ->> 'qty')::int, 1), 1), 20);
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
       or (p.kind = 'mua_tang' and v_part not in ('mua', 'tang')) then
      raise exception 'PROMO_INVALID' using hint = p.name;
    end if;
    select * into mi from menu_items where id = nullif(u ->> 'menu_item_id', '')::uuid and is_available;
    if not found then raise exception 'ITEM_UNAVAILABLE' using hint = coalesce(u ->> 'menu_item_id', ''); end if;
    -- Món phải nằm trong danh sách chủ quán đặt (món tặng "đúng món khách mua" kiểm tra ở dưới)
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

  -- Đủ đúng món và số lượng
  if p.kind = 'combo' then
    if exists (select 1 from promotion_items pi where pi.promotion_id = p.id and pi.part = 'combo'
                 and pi.qty <> (select count(*) from _pu where menu_item_id = pi.menu_item_id))
       or (select count(*) from _pu) <> (select sum(qty) from promotion_items where promotion_id = p.id and part = 'combo') then
      raise exception 'PROMO_INVALID' using hint = format('Combo %s chưa đủ món', p.name);
    end if;
    -- Chia giá combo cho từng món theo tỉ lệ giá gốc
    select coalesce(sum(base), 0) into v_sum from _pu;
    update _pu set price = case when v_sum > 0 then (floor(p.price::numeric * base / v_sum / 1000) * 1000)::int else 0 end where i is not null;  -- Supabase chặn UPDATE không có WHERE
    select min(i) into v_first from _pu;
    update _pu set price = price + (p.price - (select sum(price) from _pu)) where i = v_first;
    update _pu set price = price + extra where i is not null;  -- Supabase chặn UPDATE không có WHERE
  else
    if (select count(*) from _pu where part = 'mua') <> p.buy_qty or (select count(*) from _pu where part = 'tang') <> p.get_qty then
      raise exception 'PROMO_INVALID' using hint = format('%s: chọn đúng %s món mua và %s món tặng', p.name, p.buy_qty, p.get_qty);
    end if;
    if p.gift_same and exists (select 1 from _pu g where g.part = 'tang'
                                 and not exists (select 1 from _pu b where b.part = 'mua' and b.menu_item_id = g.menu_item_id)) then
      raise exception 'PROMO_INVALID' using hint = format('%s: món tặng phải là món bạn mua', p.name);
    end if;
    update _pu set price = case when part = 'mua' then base + extra else extra end where i is not null;  -- Supabase chặn UPDATE không có WHERE
  end if;

  -- Gộp các phần giống hệt nhau thành 1 dòng
  for r in select part, menu_item_id, name, opts, note, station, price, count(*)::int * v_k as qty, min(i) as i
             from _pu group by part, menu_item_id, name, opts, ckey, note, station, price order by min(i) loop
    if r.qty > 50 then raise exception 'PROMO_INVALID' using hint = 'Mỗi lần đặt tối đa 50 phần một món'; end if;
    insert into order_items (order_id, menu_item_id, item_name, unit_price, options, qty, note, station,
                             promo_id, promo_name, promo_kind, promo_group, promo_part)
    values (p_order, r.menu_item_id, r.name, r.price, r.opts, r.qty, r.note, r.station,
            p.id, p.name, p.kind, v_group, r.part);
  end loop;
end $$;

-- Thêm món vào đơn: món thường như cũ, phần tử có "promo_id" là 1 phần ưu đãi
create or replace function private.add_items(p_order uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  it           jsonb;
  mi           menu_items;
  v_qty        int;
  v_extra      int;
  v_opts       jsonb;
  v_choice_ids int[];
  v_station    text;
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
    insert into order_items (order_id, menu_item_id, item_name, unit_price, options, qty, note, station)
    values (p_order, mi.id, mi.name, mi.price + v_extra, v_opts, v_qty, nullif(trim(it ->> 'note'), ''), v_station);
  end loop;

  -- Nơi làm mới thì thêm dòng tiến độ; nơi đã ra món mà có món mới thì quay về "chờ nhận"
  insert into order_stations (order_id, station)
  select distinct p_order, station from order_items where order_id = p_order
  on conflict (order_id, station) do nothing;
  update order_stations s
     set status = 'cho_nhan', accepted_at = null, estimated_ready_at = null, served_at = null
   where s.order_id = p_order and s.status = 'da_ra_mon'
     and exists (select 1 from order_items i where i.order_id = p_order and i.station = s.station and i.added_at > s.served_at);

  update orders set total = (select coalesce(sum(unit_price * qty), 0) from order_items where order_id = p_order)
   where id = p_order;
end $$;


-- Chép tóm tắt đơn sang sales rồi xoá đơn (đơn đã thu tiền xong và đã ra món)
create or replace function private.finalize_order(p_order uuid, p_method text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order for update;
  if not found then return; end if;
  insert into sales (id, queue_number, dine_type, total, payment_method, items,
                     ordered_at, accepted_at, served_at, paid_at, cook_minutes, station_minutes, cashier_id,
                     customer_name, customer_phone, address)
  select o.id, o.queue_number, o.dine_type, o.total, coalesce(p_method, o.paid_method, 'tien_mat'),
         coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'menu_item_id', i.menu_item_id, 'name', i.item_name,
                     'price', i.unit_price, 'qty', i.qty, 'options', i.options, 'station', i.station,
                     'promo_id', i.promo_id, 'promo_name', i.promo_name, 'promo_kind', i.promo_kind,
                     'promo_group', i.promo_group, 'promo_part', i.promo_part)) order by i.id)
                   from order_items i where i.order_id = o.id), '[]'::jsonb),
         o.created_at, o.accepted_at, o.served_at, coalesce(o.paid_at, now()),
         case when o.accepted_at is not null and o.served_at is not null
              then round(extract(epoch from (o.served_at - o.accepted_at)) / 60)::int end,
         (select jsonb_object_agg(s.station, round(extract(epoch from (s.served_at - s.accepted_at)) / 60)::int)
            from order_stations s
           where s.order_id = o.id and s.accepted_at is not null and s.served_at is not null),
         coalesce(o.paid_by, my_employee_id()),
         o.customer_name, o.customer_phone, o.address;
  delete from orders where id = o.id;
end $$;
revoke all on all functions in schema private from public;

-- =====================================================================
-- 8. ORDER PHÍA KHÁCH (khách không đăng nhập, chỉ gọi các hàm này)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Trạng thái chung của đơn tính từ các nơi:
--   tất cả đã ra món -> da_ra_mon; có nơi đã nhận -> dang_lam; còn lại cho_nhan.
--   Giờ dự kiến = nơi xong muộn nhất trong các nơi chưa ra món.
-- ---------------------------------------------------------------------
create or replace function refresh_order_status(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
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
end $$;

-- Toàn bộ menu đang bán, trả về trong 1 lần gọi (trang khách gọi khi mở).
-- Danh mục không còn món nào đang bán sẽ tự ẩn.
create or replace function get_menu() returns jsonb
language sql stable security definer set search_path = public as $$
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
$$;

-- Đặt món.
-- p_items = [{"menu_item_id": "...", "qty": 2, "note": "ít cay", "choice_ids": [3, 7]}]
-- Giá luôn tính ở server (giá món + tuỳ chọn), không tin giá client gửi lên.
-- Mỗi món được gắn nơi làm theo danh mục của nó (bếp / quầy pha chế).
-- Nếu số thứ tự đã có đơn chưa thanh toán (gọi thêm món / ngồi ghép / nhập nhầm số)
-- → báo DUPLICATE_QUEUE, app hỏi lại khách rồi gửi p_confirm_duplicate = true.
create or replace function place_order(
  p_queue_number      int,
  p_customer_name     text,
  p_items             jsonb,
  p_customer_phone    text    default null,
  p_confirm_duplicate boolean default false,
  p_note              text    default null,
  p_dine_type         text    default 'tai_quan',  -- 'tai_quan' | 'mang_ve' (không cần số thẻ) | 'giao_hang' (chỉ nhân viên tạo)
  p_address           text    default null,        -- địa chỉ giao (giao hàng)
  p_deliver_at        timestamptz default null     -- giờ hẹn giao (giao hàng)
) returns jsonb
language plpgsql security definer set search_path = public as $$
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
end $$;

-- Khách xem trạng thái đơn của mình (app gọi lại mỗi ~15 giây).
-- Trả về null nghĩa là đơn đã thanh toán xong.
create or replace function get_my_order(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
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
$$;

create or replace function call_staff(p_token uuid, p_message text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where access_token = p_token;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  -- chống bấm liên tục: tối đa 1 lần gọi chưa xử lý mỗi đơn
  if exists (select 1 from staff_calls where order_id = o.id and resolved_at is null) then
    return;
  end if;
  insert into staff_calls (order_id, queue_number, message) values (o.id, o.queue_number, p_message);
end $$;

-- =====================================================================
-- 9. ORDER PHÍA BẾP / THU NGÂN
-- =====================================================================

-- Gợi ý số phút chờ khi một nơi (bếp / quầy pha chế) nhận phần của mình:
--   thời gian món lâu nhất của nơi đó trong đơn
-- + (số đơn nơi đó đang làm / số đơn làm song song) × thời gian làm trung bình 14 ngày gần nhất của nơi đó
-- làm tròn lên bội số 5 phút. Người làm có thể chỉnh trước khi bấm nhận.
create or replace function suggest_wait_minutes(p_order_id uuid, p_station text default 'bep') returns int
language plpgsql stable security definer set search_path = public as $$
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
end $$;

create or replace function accept_order(p_order_id uuid, p_minutes int, p_station text default 'bep') returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  update order_stations
     set status = 'dang_lam',
         accepted_at = now(),
         estimated_ready_at = now() + make_interval(mins => greatest(p_minutes, 1))
   where order_id = p_order_id and station = p_station and status = 'cho_nhan';
  perform refresh_order_status(p_order_id);
end $$;

-- Người làm báo "cần thêm X phút"
create or replace function extend_wait(p_order_id uuid, p_extra_minutes int, p_station text default 'bep') returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  update order_stations
     set estimated_ready_at = greatest(estimated_ready_at, now()) + make_interval(mins => p_extra_minutes)
   where order_id = p_order_id and station = p_station and status = 'dang_lam';
  perform refresh_order_status(p_order_id);
end $$;

create or replace function mark_served(p_order_id uuid, p_station text default 'bep') returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  update order_stations set status = 'da_ra_mon', served_at = now()
   where order_id = p_order_id and station = p_station and status = 'dang_lam';
  perform refresh_order_status(p_order_id);
end $$;

-- Huỷ đơn (đơn ảo, khách bỏ về): xoá hẳn, không tính doanh thu
create or replace function cancel_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  delete from orders where id = p_order_id;
end $$;

-- Thanh toán: chép tóm tắt sang sales rồi xoá order (order_items, order_stations, staff_calls xoá theo)
create or replace function complete_payment(p_order_id uuid, p_method text) returns void
language plpgsql security definer set search_path = public as $$
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
end $$;

-- Nhân viên / chủ thêm món vào đơn đã gửi (khách báo gọi thêm, đổi món)
create or replace function staff_add_items(p_order_id uuid, p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_total int;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from orders where id = p_order_id) then raise exception 'ORDER_NOT_FOUND'; end if;
  perform private.add_items(p_order_id, p_items);
  perform refresh_order_status(p_order_id);
  select total into v_total from orders where id = p_order_id;
  return v_total;
end $$;

-- Nhân viên / chủ đổi số lượng một món trong đơn; số lượng 0 = bỏ món
create or replace function staff_set_item_qty(p_item_id bigint, p_qty int) returns int
language plpgsql security definer set search_path = public as $$
declare v_order uuid; v_group uuid; v_total int;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  select order_id, promo_group into v_order, v_group from order_items where id = p_item_id;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  if v_group is not null and coalesce(p_qty, 0) > 0 then
    raise exception 'PROMO_LOCKED';
  end if;
  if coalesce(p_qty, 0) <= 0 then
    if not exists (select 1 from order_items where order_id = v_order
                      and id <> p_item_id and (v_group is null or promo_group is distinct from v_group)) then
      raise exception 'ORDER_WOULD_BE_EMPTY' using hint = 'Đơn chỉ còn món này. Muốn bỏ hết thì huỷ đơn.';
    end if;
    delete from order_items where id = p_item_id or (v_group is not null and order_id = v_order and promo_group = v_group);
    delete from order_stations s
     where s.order_id = v_order
       and not exists (select 1 from order_items i where i.order_id = v_order and i.station = s.station);
  else
    update order_items set qty = least(p_qty, 50) where id = p_item_id;
  end if;
  update orders set total = (select coalesce(sum(unit_price * qty), 0) from order_items where order_id = v_order)
   where id = v_order;
  perform refresh_order_status(v_order);
  select total into v_total from orders where id = v_order;
  return v_total;
end $$;

-- Đổi ăn tại quán / mang về, số bàn. Đơn giao hàng không đổi ở đây.
create or replace function staff_update_order(p_order_id uuid, p_dine_type text, p_queue_number int default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
  -- Báo lại nếu số bàn mới trùng đơn khác chưa thanh toán (vẫn cho lưu, người làm tự quyết)
  if p_dine_type = 'tai_quan' then
    select customer_name into v_dup from orders where queue_number = p_queue_number and id <> p_order_id limit 1;
  end if;
  return jsonb_build_object('duplicate_with', v_dup);
end $$;

-- Đổi tuỳ chọn của 1 dòng món trong đơn. p_choice_ids = toàn bộ lựa chọn mới của món.
--    Món thuộc ưu đãi giữ giá phần ưu đãi, chỉ tính lại tiền tuỳ chọn theo cài đặt của ưu đãi.
create or replace function staff_set_item_options(p_item_id bigint, p_choice_ids int[]) returns int
language plpgsql security definer set search_path = public as $$
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
  -- Giá gốc của dòng = giá hiện tại trừ tiền tuỳ chọn đang có
  v_base := i.unit_price - coalesce((select sum((e ->> 'price')::int) from jsonb_array_elements(i.options) e), 0);
  if i.promo_group is not null and i.promo_part in ('combo', 'tang') then
    select * into p from promotions where id = i.promo_id;
    if found and p.option_mode = 'khong_phi' and exists (select 1 from jsonb_array_elements(v_opts) e where (e ->> 'price')::int > 0) then
      raise exception 'PROMO_OPTION' using hint = format('%s trong ưu đãi không chọn được tuỳ chọn có phí', i.item_name);
    elsif found and p.option_mode = 'mien_phi' then
      v_extra := 0;
      v_opts := coalesce((select jsonb_agg(e || '{"price": 0}'::jsonb) from jsonb_array_elements(v_opts) e), '[]'::jsonb);
    end if;
  end if;
  update order_items set options = v_opts, unit_price = v_base + v_extra, edited_at = now() where id = p_item_id;
  -- Nơi làm đã ra món mà món vừa đổi thì quay lại "chờ nhận"
  update order_stations s
     set status = 'cho_nhan', accepted_at = null, estimated_ready_at = null, served_at = null
   where s.order_id = i.order_id and s.station = i.station and s.status = 'da_ra_mon';
  update orders set total = (select coalesce(sum(unit_price * qty), 0) from order_items where order_id = i.order_id)
   where id = i.order_id;
  perform refresh_order_status(i.order_id);
  select total into v_total from orders where id = i.order_id;
  return v_total;
end $$;

-- =====================================================================
-- 9b. QUẢN LÝ
-- =====================================================================

-- Lần đầu cài đặt: người đăng ký đầu tiên tự nhận vai trò chủ quán.
-- Khi đã có chủ quán thì hàm này bị khoá.
create or replace function claim_owner(p_full_name text, p_phone text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if exists (select 1 from employees where role = 'owner') then raise exception 'OWNER_EXISTS'; end if;
  insert into employees (auth_user_id, full_name, phone, role)
  values (auth.uid(), coalesce(nullif(trim(p_full_name), ''), 'Chủ quán'), p_phone, 'owner')
  returning id into v_id;
  return v_id;
end $$;

-- Ứng dụng hỏi xem đã có chủ quán chưa để hiện màn hình cài đặt lần đầu
create or replace function has_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from employees where role = 'owner')
$$;

-- Chủ sửa giờ vào/ra của một ca (nhân viên quên chấm, chấm nhầm). Lương tính lại tự động.
create or replace function owner_update_shift(p_id uuid, p_in timestamptz, p_out timestamptz, p_note text)
returns shifts
language plpgsql security definer set search_path = public as $$
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
end $$;

-- Báo ngay cho điện thoại của khách khi đơn đổi trạng thái (nhận đơn, ra món, thanh toán, nhân viên tới…).
-- Mỗi đơn một kênh riêng "don-<id đơn>", tin nhắn chỉ là tín hiệu, không chứa dữ liệu đơn;
-- trang khách nhận tín hiệu thì tự hỏi lại trạng thái bằng get_my_order như cũ.
create or replace function notify_order_change() returns trigger
language plpgsql security definer set search_path = public as $$
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
end $$;

drop trigger if exists trg_notify_orders on orders;
create trigger trg_notify_orders after update or delete on orders
  for each row execute function notify_order_change();
drop trigger if exists trg_notify_stations on order_stations;
create trigger trg_notify_stations after update on order_stations
  for each row execute function notify_order_change();
-- Menu đổi (hết món, mở bán lại, đổi giá, tuỳ chọn…): báo trang khách đang mở tải lại menu
create or replace function notify_menu_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform realtime.send(jsonb_build_object('t', tg_table_name), 'changed', 'menu', false);
  exception when others then null;
  end;
  return null;
end $$;
drop trigger if exists trg_menu_items_changed on menu_items;
create trigger trg_menu_items_changed after insert or update or delete on menu_items
  for each statement execute function notify_menu_change();
drop trigger if exists trg_option_choices_changed on option_choices;
create trigger trg_option_choices_changed after insert or update or delete on option_choices
  for each statement execute function notify_menu_change();
drop trigger if exists trg_menu_links_changed on menu_item_option_groups;
create trigger trg_menu_links_changed after insert or update or delete on menu_item_option_groups
  for each statement execute function notify_menu_change();
drop trigger if exists trg_menu_categories_changed on menu_categories;
create trigger trg_menu_categories_changed after insert or update or delete on menu_categories
  for each statement execute function notify_menu_change();
drop trigger if exists trg_promotions_changed on promotions;
create trigger trg_promotions_changed after insert or update or delete on promotions
  for each statement execute function notify_menu_change();
drop trigger if exists trg_promotion_items_changed on promotion_items;
create trigger trg_promotion_items_changed after insert or update or delete on promotion_items
  for each statement execute function notify_menu_change();

drop trigger if exists trg_notify_calls on staff_calls;
create trigger trg_notify_calls after update on staff_calls
  for each row execute function notify_order_change();

-- =====================================================================
-- 10. PHÂN QUYỀN (Row Level Security)
--   Khách (anon): chỉ đọc menu + gọi các hàm ở mục 8.
--   Nhân viên/bếp: đọc đơn, xem ca của mình.
--   Chủ: toàn quyền.
-- =====================================================================
alter table shop_settings      enable row level security;
alter table employees          enable row level security;
alter table shifts             enable row level security;
alter table menu_categories    enable row level security;
alter table menu_items         enable row level security;
alter table option_groups      enable row level security;
alter table option_choices     enable row level security;
alter table menu_item_option_groups enable row level security;
alter table orders             enable row level security;
alter table order_items        enable row level security;
alter table order_stations     enable row level security;
alter table staff_calls        enable row level security;
alter table sales              enable row level security;

-- Cấu hình
create policy settings_read  on shop_settings for select using (my_role() is not null);
create policy settings_owner on shop_settings for update using (my_role() = 'owner');

-- Nhân viên & ca
create policy emp_self  on employees for select using (auth_user_id = auth.uid());
create policy emp_owner on employees for all using (my_role() = 'owner') with check (my_role() = 'owner');
create policy shift_self  on shifts for select using (employee_id = my_employee_id());
create policy shift_owner on shifts for all using (my_role() = 'owner') with check (my_role() = 'owner');

-- Menu: ai cũng xem được, chỉ chủ sửa
create policy mcat_read  on menu_categories for select using (true);
create policy mcat_owner on menu_categories for all using (my_role() = 'owner') with check (my_role() = 'owner');
create policy mi_read    on menu_items for select using (true);
create policy mi_owner   on menu_items for all using (my_role() = 'owner') with check (my_role() = 'owner');
create policy og_read    on option_groups for select using (true);
create policy og_owner   on option_groups for all using (my_role() = 'owner') with check (my_role() = 'owner');
create policy oc_read    on option_choices for select using (true);
create policy oc_owner   on option_choices for all using (my_role() = 'owner') with check (my_role() = 'owner');
create policy miog_read  on menu_item_option_groups for select using (true);
create policy miog_owner on menu_item_option_groups for all using (my_role() = 'owner') with check (my_role() = 'owner');

-- Order: nhân viên đọc (màn hình bếp nghe realtime); mọi thay đổi đi qua các hàm ở trên
create policy ord_read   on orders      for select using (my_role() is not null);
create policy oi_read    on order_items for select using (my_role() is not null);
create policy ost_read   on order_stations for select using (my_role() is not null);
create policy call_read  on staff_calls for select using (my_role() is not null);
create policy call_done  on staff_calls for update using (my_role() is not null);

-- Doanh thu: chỉ chủ xem
create policy sales_owner on sales for select using (my_role() = 'owner');
-- Ưu đãi: khách xem qua get_promotions(); nhân viên đọc; chỉ chủ sửa
alter table promotions      enable row level security;
alter table promotion_items enable row level security;
create policy promo_owner on promotions for all using (my_role() = 'owner') with check (my_role() = 'owner');
create policy promo_staff_read on promotions for select using (my_role() is not null);
create policy promoi_owner on promotion_items for all using (my_role() = 'owner') with check (my_role() = 'owner');
create policy promoi_staff_read on promotion_items for select using (my_role() is not null);


-- =====================================================================
-- 10b. QUYỀN TRUY CẬP API (ghi rõ để chạy được kể cả khi project tắt
--      "Automatically expose new tables"). RLS ở trên vẫn quyết định ai thấy dòng nào.
-- =====================================================================
grant usage on schema public to anon, authenticated;
-- Khách (chưa đăng nhập): chỉ đọc menu + gọi các hàm đặt món
grant select on menu_categories, menu_items, option_groups, option_choices, menu_item_option_groups to anon;
grant execute on function get_menu(), get_promotions(), promo_live(promotions, timestamptz), get_my_order(uuid), call_staff(uuid, text), has_owner(),
  place_order(int, text, jsonb, text, boolean, text, text, text, timestamptz) to anon;
-- Nhân viên / chủ (đã đăng nhập): RLS lọc theo vai trò
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- =====================================================================
-- 11. REALTIME cho màn hình bếp
--    (Khách không dùng realtime mà gọi get_my_order định kỳ → tiết kiệm kết nối)
-- =====================================================================
alter publication supabase_realtime add table orders, order_items, order_stations, staff_calls;

-- =====================================================================
-- 12. LƯU ẢNH CHẤM CÔNG (Supabase Storage, bucket riêng tư)
--    Đường dẫn ảnh: <auth_user_id>/<thời_gian>.jpg
-- =====================================================================
insert into storage.buckets (id, name, public) values ('checkin-photos', 'checkin-photos', false);

create policy checkin_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'checkin-photos'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy checkin_view on storage.objects for select to authenticated
  using (bucket_id = 'checkin-photos'
         and (public.my_role() = 'owner' or (storage.foldername(name))[1] = auth.uid()::text));

-- =====================================================================
-- 13. ẢNH MÓN ĂN (bucket công khai: ai cũng xem được, chỉ chủ tải lên/sửa/xoá)
-- =====================================================================
insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', true);

create policy menu_img_read on storage.objects for select
  using (bucket_id = 'menu-images');
create policy menu_img_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images' and public.my_role() = 'owner');
create policy menu_img_update on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and public.my_role() = 'owner');
create policy menu_img_delete on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and public.my_role() = 'owner');

-- =====================================================================
-- 14. KHO HÀNG (nhập theo thùng, dùng theo gói…) — xem sql/cap-nhat-16
-- =====================================================================
create table stock_packs (
  id         bigserial primary key,
  name       text not null unique check (length(trim(name)) > 0), -- tên quy cách: "Thùng 24 gói"
  buy_unit   text not null,                                       -- đơn vị nhập: thùng
  use_unit   text not null,                                       -- đơn vị dùng: gói
  per_buy    numeric not null check (per_buy > 0),                -- 1 thùng = 24 gói
  sort_order int not null default 0
);

create table stock_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  grp         text,                                   -- nhóm: Đồ khô, Nguyên liệu pha chế, Gia vị…
  use_unit    text not null default 'gói',            -- đơn vị dùng (tồn kho tính theo đơn vị này)
  buy_unit    text not null default 'thùng',          -- đơn vị nhập
  per_buy     numeric not null default 1 check (per_buy > 0), -- 1 đơn vị nhập = bao nhiêu đơn vị dùng
  qty         numeric not null default 0,             -- tồn hiện tại (đơn vị dùng)
  min_qty     numeric not null default 0 check (min_qty >= 0), -- tồn ≤ mức này thì báo sắp hết
  cost_per_buy int check (cost_per_buy >= 0),         -- giá nhập 1 đơn vị nhập (để gợi ý tiền)
  note        text,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  pack_id     bigint references stock_packs(id) on delete set null, -- quy cách nhập hàng đang dùng
  created_at  timestamptz not null default now()
);

create table stock_moves (
  id          bigserial primary key,
  item_id     uuid not null references stock_items(id) on delete cascade,
  kind        text not null check (kind in ('nhap', 'dung', 'hong', 'kiem')), -- nhập / lấy dùng / hỏng-mất / kiểm kho
  delta       numeric not null,        -- thay đổi tồn (đơn vị dùng), âm là giảm
  qty_after   numeric not null,        -- tồn sau khi ghi
  amount      numeric not null,        -- số lượng người ghi nhập vào
  unit        text not null,           -- đơn vị người ghi chọn (thùng / gói…)
  cost        int,                     -- tiền nhập (phiếu nhập)
  note        text,
  employee_id uuid references employees(id) on delete set null,
  employee_name text,
  created_at  timestamptz not null default now()
);
create index stock_moves_item_time on stock_moves(item_id, created_at desc);
create index stock_moves_time on stock_moves(created_at desc);

-- Ghi một lần nhập / lấy dùng / hỏng / kiểm kho.
--   p_amount: số lượng; p_in_buy_unit: true = theo đơn vị nhập (thùng), false = theo đơn vị dùng (gói)
--   kiểm kho: p_amount là số đếm được thực tế, máy tự tính chênh lệch.
create or replace function stock_move(p_item uuid, p_kind text, p_amount numeric, p_in_buy_unit boolean default false,
                                      p_note text default null, p_cost int default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare it stock_items; v_use numeric; v_delta numeric; v_emp employees;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  if p_kind not in ('nhap', 'dung', 'hong', 'kiem') then raise exception 'BAD_KIND'; end if;
  if p_amount is null or p_amount < 0 or (p_kind <> 'kiem' and p_amount = 0) then raise exception 'BAD_QTY'; end if;
  select * into it from stock_items where id = p_item for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  v_use := p_amount * case when p_in_buy_unit then it.per_buy else 1 end;
  v_delta := case p_kind when 'nhap' then v_use when 'kiem' then v_use - it.qty else -v_use end;
  update stock_items set qty = qty + v_delta where id = p_item;
  select * into v_emp from employees where id = my_employee_id();
  insert into stock_moves (item_id, kind, delta, qty_after, amount, unit, cost, note, employee_id, employee_name)
  values (p_item, p_kind, v_delta, it.qty + v_delta, p_amount, case when p_in_buy_unit then it.buy_unit else it.use_unit end,
          case when p_kind = 'nhap' then p_cost end, nullif(left(trim(p_note), 200), ''), v_emp.id, v_emp.full_name);
  return jsonb_build_object('qty', it.qty + v_delta, 'delta', v_delta);
end $$;

alter table stock_items enable row level security;
alter table stock_moves enable row level security;
drop policy if exists stock_items_read on stock_items;
create policy stock_items_read on stock_items for select using (my_role() is not null);
drop policy if exists stock_items_owner on stock_items;
create policy stock_items_owner on stock_items for all using (my_role() = 'owner') with check (my_role() = 'owner');
drop policy if exists stock_moves_read on stock_moves;
create policy stock_moves_read on stock_moves for select using (my_role() is not null);
drop policy if exists stock_moves_owner_del on stock_moves;
create policy stock_moves_owner_del on stock_moves for delete using (my_role() = 'owner');
grant select, insert, update, delete on stock_items, stock_moves to authenticated;
grant usage, select on sequence stock_moves_id_seq to authenticated;
grant execute on function stock_move(uuid, text, numeric, boolean, text, int) to authenticated;

-- Quy cách nhập hàng (cập nhật 17)
-- Quy cách mẫu (chỉ thêm nếu chưa có)
insert into stock_packs (name, buy_unit, use_unit, per_buy, sort_order) values
  ('Thùng 24 gói', 'thùng', 'gói', 24, 1),
  ('Thùng 4 can', 'thùng', 'can', 4, 2),
  ('Can (nhập, dùng theo can)', 'can', 'can', 1, 3),
  ('Bao 25 kg', 'bao', 'kg', 25, 4),
  ('Thùng 48 hộp', 'thùng', 'hộp', 48, 5),
  ('Thùng 20 cây', 'thùng', 'cây', 20, 6)
on conflict (name) do nothing;

-- Sửa quy cách → mặt hàng đang dùng quy cách đó đổi đơn vị theo (tồn vẫn giữ theo đơn vị dùng)
create or replace function sync_stock_pack() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update stock_items set buy_unit = new.buy_unit, use_unit = new.use_unit, per_buy = new.per_buy
   where pack_id = new.id;
  return null;
end $$;
drop trigger if exists trg_stock_pack_sync on stock_packs;
create trigger trg_stock_pack_sync after update on stock_packs for each row execute function sync_stock_pack();

alter table stock_packs enable row level security;
drop policy if exists stock_packs_read on stock_packs;
create policy stock_packs_read on stock_packs for select using (my_role() is not null);
drop policy if exists stock_packs_owner on stock_packs;
create policy stock_packs_owner on stock_packs for all using (my_role() = 'owner') with check (my_role() = 'owner');
grant select, insert, update, delete on stock_packs to authenticated;
grant usage, select on sequence stock_packs_id_seq to authenticated;

-- Tài khoản nhận chuyển khoản cho mã VietQR (cập nhật 18)
-- Khách (chưa đăng nhập) chỉ đọc được 5 thông tin này để tạo mã QR, không đọc được cài đặt khác
create or replace function get_payment_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('bin', bank_bin, 'bank', bank_name, 'account', bank_account, 'holder', bank_holder, 'note', bank_note)
    from shop_settings where id = 1
$$;
grant execute on function get_payment_info() to anon, authenticated;

-- Đơn ĐẾN LẤY: mang về do chủ quán / nhân viên tạo (cập nhật 19)
create or replace function mark_pickup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.pickup := new.dine_type = 'mang_ve' and my_role() is not null;
  return new;
end $$;
drop trigger if exists trg_orders_pickup on orders;
create trigger trg_orders_pickup before insert on orders for each row execute function mark_pickup();

-- Đổi sang ăn tại quán / giao hàng thì không còn là đến lấy
create or replace function clear_pickup() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.dine_type <> 'mang_ve' then new.pickup := false; end if;
  return new;
end $$;
drop trigger if exists trg_orders_pickup_upd on orders;
create trigger trg_orders_pickup_upd before update of dine_type on orders for each row execute function clear_pickup();

-- ===== CẬP NHẬT 20: ưu đãi giảm giá / đồng giá =====
-- 1. Loại ưu đãi mới 'giam_gia' + cách giảm
alter table promotions drop constraint if exists promotions_kind_check;
alter table promotions add constraint promotions_kind_check check (kind in ('combo', 'mua_tang', 'giam_gia'));
alter table promotions add column if not exists sale_mode  text not null default 'dong_gia';
alter table promotions add column if not exists sale_value int;   -- đồng giá: giá bán; giảm %: số %; giảm tiền: số đồng
alter table promotions drop constraint if exists promotions_sale_mode_check;
alter table promotions add constraint promotions_sale_mode_check check (sale_mode in ('dong_gia', 'phan_tram', 'tru_tien'));
alter table promotions drop constraint if exists promotions_sale_value_check;
alter table promotions add constraint promotions_sale_value_check check (sale_value is null or sale_value >= 0);

alter table promotion_items drop constraint if exists promotion_items_part_check;
alter table promotion_items add constraint promotion_items_part_check check (part in ('combo', 'mua', 'tang', 'giam'));

-- 2. Giá bán của 1 món sau giảm giá (giá món, chưa tính tuỳ chọn).
--    p_hint = ưu đãi khách thấy lúc bỏ vào giỏ: cho 10 phút du di như combo.
create or replace function private.sale_price(p_item uuid, p_hint uuid default null,
                                              out o_price int, out o_promo uuid, out o_name text)
language plpgsql stable security definer set search_path = public as $$
declare mi menu_items; r record; v int;
begin
  select * into mi from menu_items where id = p_item;
  o_price := mi.price;
  for r in select p.* from promotions p join promotion_items pi on pi.promotion_id = p.id
            where p.kind = 'giam_gia' and pi.part = 'giam' and pi.menu_item_id = p_item and p.sale_value is not null
              and (promo_live(p) or (p.id = p_hint and promo_live(p, now() - interval '10 minutes')))
            order by p.sort_order, p.created_at loop
    v := case r.sale_mode
           when 'dong_gia'  then r.sale_value
           when 'phan_tram' then (floor(mi.price::numeric * (100 - least(r.sale_value, 100)) / 100 / 1000) * 1000)::int
           else greatest(mi.price - r.sale_value, 0) end;
    if v < o_price then o_price := v; o_promo := r.id; o_name := r.name; end if;
  end loop;
end $$;

-- 3. Ưu đãi đang chạy cho trang khách: thêm loại giảm giá
create or replace function get_promotions() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by s, n), '[]'::jsonb) from (
    select p.sort_order as s, p.name as n,
      jsonb_build_object(
        'id', p.id, 'name', p.name, 'kind', p.kind, 'description', p.description, 'image_path', p.image_path,
        'price', p.price, 'buy_qty', p.buy_qty, 'get_qty', p.get_qty, 'gift_same', p.gift_same,
        'option_mode', p.option_mode, 'start_at', p.start_at, 'end_at', p.end_at, 'days', p.days,
        'time_from', to_char(p.time_from, 'HH24:MI'), 'time_to', to_char(p.time_to, 'HH24:MI'),
        'sale_mode', p.sale_mode, 'sale_value', p.sale_value,
        'items', (select coalesce(jsonb_agg(jsonb_build_object('part', pi.part, 'menu_item_id', pi.menu_item_id, 'qty', pi.qty)
                                            order by pi.sort_order, pi.id), '[]'::jsonb)
                    from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                   where pi.promotion_id = p.id and mi.is_available)
      ) as x
    from promotions p
    where promo_live(p)
      and case when p.kind = 'combo' then
                 p.price is not null
             and exists (select 1 from promotion_items pi where pi.promotion_id = p.id and pi.part = 'combo')
             and not exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                              where pi.promotion_id = p.id and pi.part = 'combo' and not mi.is_available)
           when p.kind = 'giam_gia' then
                 p.sale_value is not null
             and exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                          where pi.promotion_id = p.id and pi.part = 'giam' and mi.is_available)
           else exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                         where pi.promotion_id = p.id and pi.part = 'mua' and mi.is_available)
            and (p.gift_same or exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                                         where pi.promotion_id = p.id and pi.part = 'tang' and mi.is_available))
      end
  ) t
$$;
grant execute on function get_promotions() to anon, authenticated;

-- 4. Thêm món vào đơn: món thường tự áp giá giảm (nếu có), ghi tên ưu đãi lên dòng món
create or replace function private.add_items(p_order uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
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
      from private.sale_price(mi.id, nullif(it ->> 'sale_id', '')::uuid);
    insert into order_items (order_id, menu_item_id, item_name, unit_price, options, qty, note, station,
                             promo_id, promo_name, promo_kind, promo_part)
    values (p_order, mi.id, mi.name, v_price + v_extra, v_opts, v_qty, nullif(trim(it ->> 'note'), ''), v_station,
            v_promo, v_pname, case when v_promo is not null then 'giam_gia' end, case when v_promo is not null then 'giam' end);
  end loop;

  -- Nơi làm mới thì thêm dòng tiến độ; nơi đã ra món mà có món mới thì quay về "chờ nhận"
  insert into order_stations (order_id, station)
  select distinct p_order, station from order_items where order_id = p_order
  on conflict (order_id, station) do nothing;
  update order_stations s
     set status = 'cho_nhan', accepted_at = null, estimated_ready_at = null, served_at = null
   where s.order_id = p_order and s.status = 'da_ra_mon'
     and exists (select 1 from order_items i where i.order_id = p_order and i.station = s.station and i.added_at > s.served_at);

  update orders set total = (select coalesce(sum(unit_price * qty), 0) from order_items where order_id = p_order)
   where id = p_order;
end $$;
revoke all on all functions in schema private from public;

-- ===== CẬP NHẬT 21: mã vạch cho kho hàng =====

create table if not exists stock_barcodes (
  code       text primary key check (code ~ '^[0-9A-Za-z.\-]{3,64}$'),
  item_id    uuid not null references stock_items(id) on delete cascade,
  unit_kind  text not null default 'buy' check (unit_kind in ('buy', 'use')), -- mã in trên đơn vị nhập (thùng) hay đơn vị dùng (gói)
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists stock_barcodes_item on stock_barcodes(item_id);

alter table stock_barcodes enable row level security;
drop policy if exists stock_barcodes_read on stock_barcodes;
create policy stock_barcodes_read on stock_barcodes for select using (my_role() is not null);
drop policy if exists stock_barcodes_add on stock_barcodes;
create policy stock_barcodes_add on stock_barcodes for insert with check (my_role() is not null);
drop policy if exists stock_barcodes_owner on stock_barcodes;
create policy stock_barcodes_owner on stock_barcodes for all using (my_role() = 'owner') with check (my_role() = 'owner');
grant select, insert, update, delete on stock_barcodes to authenticated;


-- ===== CẬP NHẬT 22: đơn đặt qua Facebook (bot Fanpage) =====

-- 1. Đơn thật: nguồn đơn + cho phép "ăn tại quán" chưa có số bàn nếu đặt qua Facebook
alter table orders add column if not exists source text not null default 'qr';
alter table orders drop constraint if exists orders_source_check;
alter table orders add constraint orders_source_check check (source in ('qr', 'quan', 'fb'));
alter table orders drop constraint if exists orders_queue_or_takeaway;
alter table orders add constraint orders_queue_or_takeaway check (dine_type <> 'tai_quan' or queue_number is not null or source = 'fb');

-- 2. Cài đặt bot
alter table shop_settings add column if not exists fb_bot_on   boolean not null default true;  -- tắt: bot im, chủ quán tự nhắn
alter table shop_settings add column if not exists fb_open     text not null default '07:00';  -- giờ nhận đơn (bot từ chối giờ hẹn ngoài khung này)
alter table shop_settings add column if not exists fb_close    text not null default '22:00';
alter table shop_settings add column if not exists fb_hello    text;                            -- câu chào riêng (để trống dùng mặc định)

-- 3. Khách nhắn Fanpage (mỗi khách 1 dòng, khoá là PSID của Facebook)
create table if not exists fb_threads (
  psid         text primary key,
  name         text,                       -- tên Facebook của khách
  link         text,                       -- link mở đoạn chat trong hộp thư Fanpage
  paused_until timestamptz,                -- chủ quán đang tự nhắn → bot im tới lúc này
  need_human   boolean not null default false, -- bot nhờ chủ quán trả lời (khiếu nại, câu hỏi khó…)
  last_at      timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create table if not exists fb_messages (
  id         bigserial primary key,
  psid       text not null references fb_threads(psid) on delete cascade,
  mid        text unique,                  -- mã tin nhắn của Facebook (chống nhận trùng)
  sender     text not null check (sender in ('khach', 'bot', 'quan')), -- quan = chủ quán tự nhắn trong hộp thư
  text       text,
  created_at timestamptz not null default now()
);
create index if not exists fb_messages_thread on fb_messages(psid, created_at desc);

-- 4. Đơn nháp bot tách từ tin nhắn
create table if not exists fb_drafts (
  id             uuid primary key default gen_random_uuid(),
  psid           text not null references fb_threads(psid) on delete cascade,
  status         text not null default 'dang_hoi' check (status in ('dang_hoi', 'cho_duyet', 'da_duyet', 'huy')),
  dine_type      text check (dine_type in ('mang_ve', 'tai_quan', 'giao_hang')), -- qua lấy / ăn tại quán / đi ship
  at             timestamptz,              -- giờ hẹn: giờ qua lấy / giờ đến ăn / giờ giao
  customer_name  text,
  customer_phone text,
  address        text,
  note           text,
  items          jsonb not null default '[]', -- [{menu_item_id, name, qty, choice_ids, choices, note, price}]
  unknown        jsonb not null default '[]', -- món khách gọi mà bot không khớp được menu
  missing        text[] not null default '{}', -- còn thiếu: items, dine_type, at, address, phone
  total_est      int not null default 0,       -- tạm tính (giá thật tính lại khi duyệt)
  changed_after  boolean not null default false, -- khách nhắn sửa sau khi đã chờ duyệt
  asked          text[] not null default '{}', -- bot đã hỏi gợi ý (đồ uống / đồ ăn) rồi thì không hỏi lại
  order_id       uuid,
  approved_by    text,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists fb_drafts_status on fb_drafts(status, updated_at desc);
create index if not exists fb_drafts_psid on fb_drafts(psid, updated_at desc);

-- 5. Quyền: chủ quán xem / sửa; bot dùng khoá service_role (không qua RLS)
alter table fb_threads enable row level security;
alter table fb_messages enable row level security;
alter table fb_drafts enable row level security;
drop policy if exists fb_threads_owner on fb_threads;
create policy fb_threads_owner on fb_threads for all using (my_role() = 'owner') with check (my_role() = 'owner');
drop policy if exists fb_messages_owner on fb_messages;
create policy fb_messages_owner on fb_messages for select using (my_role() = 'owner');
drop policy if exists fb_drafts_owner on fb_drafts;
create policy fb_drafts_owner on fb_drafts for all using (my_role() = 'owner') with check (my_role() = 'owner');
grant select, insert, update, delete on fb_threads, fb_drafts to authenticated;
grant select on fb_messages to authenticated;

-- 6. Duyệt đơn nháp → tạo đơn thật (giá tính ở máy chủ như mọi đơn khác)
--    p_items = [{"menu_item_id": "...", "qty": 2, "note": "ít cay", "choice_ids": [3, 7]}]
create or replace function fb_approve(
  p_draft   uuid,
  p_dine    text,
  p_name    text,
  p_phone   text,
  p_address text,
  p_at      timestamptz,
  p_items   jsonb,
  p_note    text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
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
  return jsonb_build_object('order_id', v_order.id, 'total', v_total);
end $$;
grant execute on function fb_approve(uuid, text, text, text, text, timestamptz, jsonb, text) to authenticated;

-- ===== CẬP NHẬT 23: quà ngoài menu + giới hạn số suất =====
-- 1. Cột mới
alter table promotions add column if not exists gift_name    text;                 -- quà ngoài menu (mua tặng)
alter table promotions add column if not exists gift_station text not null default 'pha_che';
alter table promotions drop constraint if exists promotions_gift_station_check;
alter table promotions add constraint promotions_gift_station_check check (gift_station in ('bep', 'pha_che'));
alter table promotions add column if not exists limit_qty    int;                  -- trống = không giới hạn
alter table promotions add column if not exists limit_per    text not null default 'ngay';
alter table promotions drop constraint if exists promotions_limit_qty_check;
alter table promotions add constraint promotions_limit_qty_check check (limit_qty is null or limit_qty > 0);
alter table promotions drop constraint if exists promotions_limit_per_check;
alter table promotions add constraint promotions_limit_per_check check (limit_per in ('ngay', 'tong'));
alter table order_items add column if not exists promo_units int;                  -- số suất của phần ưu đãi (ghi ở dòng đầu)

-- 2. Đã dùng bao nhiêu suất (đơn đang mở + hoá đơn đã thu). Mỗi ngày: tính từ 0h giờ Việt Nam.
create or replace function private.promo_used(p promotions) returns int
language sql stable security definer set search_path = public as $$
  with s as (select case when p.limit_per = 'tong' then least(coalesce(p.start_at, p.created_at), p.created_at)
                         else (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh') end as t0)
  select (coalesce((select sum(case when i.promo_kind = 'giam_gia' then i.qty else coalesce(i.promo_units, 0) end)
                      from order_items i, s where i.promo_id = p.id and i.added_at >= s.t0), 0)
        + coalesce((select sum(case when x ->> 'promo_kind' = 'giam_gia' then (x ->> 'qty')::int else coalesce((x ->> 'promo_units')::int, 0) end)
                      from s, sales sa cross join lateral jsonb_array_elements(sa.items) x
                     where sa.ordered_at >= s.t0 and x ->> 'promo_id' = p.id::text), 0))::int
$$;
-- Còn bao nhiêu suất (trống = không giới hạn)
create or replace function private.promo_left(p promotions) returns int
language sql stable security definer set search_path = public as $$
  select case when p.limit_qty is null then null else greatest(p.limit_qty - private.promo_used(p), 0) end
$$;
-- Chủ quán xem số suất đã dùng của từng ưu đãi có giới hạn
create or replace function promo_usage() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(p.id, private.promo_used(p)), '{}'::jsonb)
    from promotions p where p.limit_qty is not null and my_role() is not null
$$;
grant execute on function promo_usage() to authenticated;

-- 3. Giá giảm của 1 món: bỏ qua ưu đãi hết suất. Khách đã thấy giá giảm (p_hint) mà
--    ưu đãi không còn đủ suất thì báo để khách bớt số lượng (không lặng lẽ tính giá gốc).
drop function if exists private.sale_price(uuid, uuid);
create or replace function private.sale_price(p_item uuid, p_hint uuid default null, p_qty int default 1,
                                              out o_price int, out o_promo uuid, out o_name text)
language plpgsql security definer set search_path = public as $$
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
end $$;

-- 4. Ưu đãi đang chạy cho trang khách: thêm quà ngoài menu, số suất còn lại; hết suất thì ẩn
create or replace function get_promotions() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by s, n), '[]'::jsonb) from (
    select p.sort_order as s, p.name as n,
      jsonb_build_object(
        'id', p.id, 'name', p.name, 'kind', p.kind, 'description', p.description, 'image_path', p.image_path,
        'price', p.price, 'buy_qty', p.buy_qty, 'get_qty', p.get_qty, 'gift_same', p.gift_same,
        'option_mode', p.option_mode, 'start_at', p.start_at, 'end_at', p.end_at, 'days', p.days,
        'time_from', to_char(p.time_from, 'HH24:MI'), 'time_to', to_char(p.time_to, 'HH24:MI'),
        'sale_mode', p.sale_mode, 'sale_value', p.sale_value,
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
           else exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                         where pi.promotion_id = p.id and pi.part = 'mua' and mi.is_available)
            and (p.gift_same or nullif(trim(p.gift_name), '') is not null
                 or exists (select 1 from promotion_items pi join menu_items mi on mi.id = pi.menu_item_id
                             where pi.promotion_id = p.id and pi.part = 'tang' and mi.is_available))
      end
  ) t
$$;
grant execute on function get_promotions() to anon, authenticated;

-- 5. Thêm 1 phần ưu đãi vào đơn: kiểm tra số suất; quà ngoài menu thêm thành 1 dòng 0đ
create or replace function private.add_promo(p_order uuid, p_pkg jsonb) returns void
language plpgsql security definer set search_path = public as $$
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
end $$;

-- 6. Thêm món vào đơn: giá giảm kiểm tra cả số suất (theo số lượng món)
create or replace function private.add_items(p_order uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
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

  insert into order_stations (order_id, station)
  select distinct p_order, station from order_items where order_id = p_order
  on conflict (order_id, station) do nothing;
  update order_stations s
     set status = 'cho_nhan', accepted_at = null, estimated_ready_at = null, served_at = null
   where s.order_id = p_order and s.status = 'da_ra_mon'
     and exists (select 1 from order_items i where i.order_id = p_order and i.station = s.station and i.added_at > s.served_at);

  update orders set total = (select coalesce(sum(unit_price * qty), 0) from order_items where order_id = p_order)
   where id = p_order;
end $$;

-- 7. Hoá đơn giữ cả số suất (để đếm giới hạn sau khi đơn đã thu tiền)
create or replace function private.finalize_order(p_order uuid, p_method text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order for update;
  if not found then return; end if;
  insert into sales (id, queue_number, dine_type, total, payment_method, items,
                     ordered_at, accepted_at, served_at, paid_at, cook_minutes, station_minutes, cashier_id,
                     customer_name, customer_phone, address)
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
         o.customer_name, o.customer_phone, o.address;
  delete from orders where id = o.id;
end $$;

-- ===== CẬP NHẬT 24: dữ liệu huấn luyện cho mô hình đọc đơn =====
alter table shop_settings add column if not exists fb_train_on boolean not null default true;

-- Ảnh chụp menu tại lúc lưu mẫu (để đọc lại số thứ tự món / lựa chọn về sau). Một menu = một dòng.
create table if not exists fb_train_menu (
  hash       text primary key,
  menu       jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists fb_train (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  thread_hash  text not null,                 -- băm của PSID: gom mẫu cùng 1 khách, không lần ngược ra khách được
  draft_id     uuid,                          -- đơn nháp của mẫu (trống nếu lượt này chưa thành đơn)
  now_vn       text not null,                 -- "2026-10-24 15:00" giờ Việt Nam lúc khách nhắn
  convo        jsonb not null default '[]',   -- [{"s":"khach|bot|quan","t":"…"}] đã ẩn thông tin cá nhân
  state_before jsonb not null default '{}',   -- đơn đang ghi trước tin mới
  intent       text,                          -- order | question | human | other
  target       jsonb,                         -- đơn bot tách ra sau khi kiểm lại theo menu (null nếu intent = human)
  answer       text,                          -- câu AI trả lời khi khách hỏi thông tin
  model        text,                          -- AI nào đã đọc (vd gemini-3.8-flash)
  menu_hash    text,
  outcome      text not null default 'chua_ro' check (outcome in ('chua_ro', 'da_duyet', 'huy')),
  final        jsonb,                         -- bản chủ quán duyệt (đáp án đúng), chỉ có ở mẫu cuối của đơn đã duyệt
  edits        text[]                         -- chủ quán đã sửa: items | dine_type | time (rỗng = bot đọc đúng hết)
);
create index if not exists fb_train_draft  on fb_train(draft_id) where draft_id is not null;
create index if not exists fb_train_thread on fb_train(thread_hash);

alter table fb_train enable row level security;
alter table fb_train_menu enable row level security;
drop policy if exists fb_train_owner_read on fb_train;
create policy fb_train_owner_read on fb_train for select using (my_role() = 'owner');
drop policy if exists fb_train_owner_del on fb_train;
create policy fb_train_owner_del on fb_train for delete using (my_role() = 'owner');
drop policy if exists fb_train_menu_owner on fb_train_menu;
create policy fb_train_menu_owner on fb_train_menu for select using (my_role() = 'owner');
revoke all on fb_train, fb_train_menu from anon, authenticated;
grant select, delete on fb_train to authenticated;
grant select on fb_train_menu to authenticated;
revoke all on sequence fb_train_id_seq from anon, authenticated;

-- Chuỗi so sánh danh sách món: "menu_item_id|số lượng|các lựa chọn", đã sắp xếp
create or replace function private.fb_items_sig(p_items jsonb) returns text
language sql immutable as $$
  select coalesce(string_agg(x, ';' order by x), '')
    from (select (e ->> 'menu_item_id') || '|' || coalesce((e ->> 'qty')::int, 1)::text || '|' ||
                 coalesce((select string_agg(c, ',' order by c::int) from jsonb_array_elements_text(coalesce(e -> 'choice_ids', '[]'::jsonb)) c), '') as x
            from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e) q;
$$;

-- Chủ quán duyệt xong: gắn đáp án đúng vào mẫu cuối của đơn
create or replace function private.fb_train_close(p_draft uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
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
  -- Chủ quán sửa gì so với bot? (so với đơn nháp bot đã ghi: d.items vẫn là bản của bot)
  if private.fb_items_sig(d.items) is distinct from private.fb_items_sig(p_items) then v_edits := array_append(v_edits, 'items'); end if;
  if (s.target ->> 'dine_type') is distinct from d.dine_type then v_edits := array_append(v_edits, 'dine_type'); end if;
  if (s.target ->> 'time') is distinct from v_time or (s.target ->> 'date') is distinct from v_date then v_edits := array_append(v_edits, 'time'); end if;
  update fb_train set final = v_final, edits = v_edits where id = s.id;
end $$;

-- Chủ quán huỷ đơn nháp → các mẫu của đơn không phải đáp án đúng
create or replace function private.fb_train_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'huy' and old.status is distinct from 'huy' then
    update fb_train set outcome = 'huy' where draft_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists fb_drafts_train_cancel on fb_drafts;
create trigger fb_drafts_train_cancel after update of status on fb_drafts
  for each row execute function private.fb_train_cancel();

-- fb_approve (như cập nhật 22) + gọi fb_train_close ở cuối
create or replace function fb_approve(
  p_draft   uuid,
  p_dine    text,
  p_name    text,
  p_phone   text,
  p_address text,
  p_at      timestamptz,
  p_items   jsonb,
  p_note    text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
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
end $$;
grant execute on function fb_approve(uuid, text, text, text, text, timestamptz, jsonb, text) to authenticated;
revoke all on function private.fb_items_sig(jsonb), private.fb_train_close(uuid, jsonb), private.fb_train_cancel() from public;


-- ===== CẬP NHẬT 25: lên đơn từ ảnh chụp màn hình (bot Zalo / Telegram) =====
-- 1. Đơn nháp: thêm nguồn (kênh), ảnh chụp, bản chép đoạn chat, người gửi
alter table fb_drafts alter column psid drop not null;
alter table fb_drafts add column if not exists kenh      text not null default 'fb';
alter table fb_drafts drop constraint if exists fb_drafts_kenh_check;
alter table fb_drafts add constraint fb_drafts_kenh_check check (kenh in ('fb', 'zalo', 'tele'));
alter table fb_drafts add column if not exists chat_id   text;                       -- tài khoản Zalo / Telegram đã gửi ảnh (để bot nhắn lại)
alter table fb_drafts add column if not exists nguoi_gui text;                       -- tên người gửi ảnh
alter table fb_drafts add column if not exists anh       text[] not null default '{}'; -- đường dẫn ảnh trong bucket don-anh
alter table fb_drafts add column if not exists convo     jsonb not null default '[]';  -- đoạn chat bot chép lại từ ảnh [{"s":"khach|quan","t":"…"}]
create index if not exists fb_drafts_chat on fb_drafts(kenh, chat_id, updated_at desc) where chat_id is not null;

-- 2. Tài khoản Zalo / Telegram được dùng bot
create table if not exists bot_users (
  kenh       text not null check (kenh in ('zalo', 'tele')),
  chat_id    text not null,
  name       text,
  created_at timestamptz not null default now(),
  primary key (kenh, chat_id)
);
alter table bot_users enable row level security;
drop policy if exists bot_users_owner_read on bot_users;
create policy bot_users_owner_read on bot_users for select using (my_role() = 'owner');
drop policy if exists bot_users_owner_del on bot_users;
create policy bot_users_owner_del on bot_users for delete using (my_role() = 'owner');
revoke all on bot_users from anon, authenticated;
grant select, delete on bot_users to authenticated;

-- 3. Ảnh đang chờ đọc (bot gom các ảnh gửi liền nhau thành 1 đơn). Chỉ bot dùng (service_role).
create table if not exists bot_photos (
  id         bigserial primary key,
  kenh       text not null,
  chat_id    text not null,
  ref        text not null,            -- link ảnh (Zalo) hoặc file_id (Telegram)
  caption    text,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bot_photos_wait on bot_photos(kenh, chat_id, id) where not done;
alter table bot_photos enable row level security;
revoke all on bot_photos from anon, authenticated;

-- 4. Mã kết nối: chủ quán bấm "Lấy mã" trong Quản lý, nhắn mã cho bot trong 10 phút
create table if not exists private.bot_link (
  code       text primary key,
  until      timestamptz not null,
  created_by text
);
create or replace function bot_link_code() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_until timestamptz := now() + interval '10 minutes'; v_emp employees;
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  delete from private.bot_link where until < now();
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  select * into v_emp from employees where id = my_employee_id();
  insert into private.bot_link (code, until, created_by) values (v_code, v_until, v_emp.full_name)
    on conflict (code) do update set until = excluded.until, created_by = excluded.created_by;
  return jsonb_build_object('code', v_code, 'until', v_until);
end $$;
grant execute on function bot_link_code() to authenticated;

-- Bot đổi mã lấy quyền dùng (chỉ service_role gọi được)
create or replace function private.bot_link_use(p_code text, p_kenh text, p_chat text, p_name text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from private.bot_link where code = p_code and until >= now();
  if not found then return false; end if;
  insert into bot_users (kenh, chat_id, name) values (p_kenh, p_chat, left(p_name, 80))
    on conflict (kenh, chat_id) do update set name = excluded.name;
  return true;
end $$;
revoke all on function private.bot_link_use(text, text, text, text) from public;
create or replace function bot_link_use(p_code text, p_kenh text, p_chat text, p_name text) returns boolean
language sql security definer set search_path = public as $$ select private.bot_link_use(p_code, p_kenh, p_chat, p_name) $$;
revoke all on function bot_link_use(text, text, text, text) from public, anon, authenticated;
grant execute on function bot_link_use(text, text, text, text) to service_role;

-- 5. Ảnh chụp: bucket riêng tư, chỉ chủ quán xem (bot tải lên bằng service_role)
insert into storage.buckets (id, name, public) values ('don-anh', 'don-anh', false) on conflict (id) do nothing;
drop policy if exists don_anh_view on storage.objects;
create policy don_anh_view on storage.objects for select to authenticated
  using (bucket_id = 'don-anh' and public.my_role() = 'owner');


-- ===== CẬP NHẬT 26: đơn online hiện ngay (realtime) =====
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fb_drafts') then
    alter publication supabase_realtime add table fb_drafts;
  end if;
end $$;


-- ===== CẬP NHẬT 27: bot lên đơn gửi thẳng vào bếp / pha chế =====
-- Đơn của bot còn sửa được không: chưa có trạm (bếp / pha chế) nào bấm Nhận
create or replace function private.bot_order_open(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from orders o where o.id = p_order and o.status = 'cho_nhan')
     and not exists (select 1 from order_stations s where s.order_id = p_order and s.status <> 'cho_nhan');
$$;

-- Từ đơn nháp bot vừa ghi (fb_drafts) → tạo đơn thật, hoặc thay toàn bộ đơn thật nếu bếp chưa nhận.
-- Trả về {action: created | updated | locked, order_id, total}
create or replace function private.bot_dat_don(p_draft uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
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
end $$;

-- "huỷ": xoá đơn thật nếu bếp chưa nhận. Trả về {action: cancelled | locked | none}
create or replace function private.bot_huy_don(p_draft uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
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
end $$;

-- Lối gọi cho bot (service_role); khách / nhân viên không gọi được
create or replace function bot_dat_don(p_draft uuid) returns jsonb
language sql security definer set search_path = public as $$ select private.bot_dat_don(p_draft) $$;
create or replace function bot_huy_don(p_draft uuid) returns jsonb
language sql security definer set search_path = public as $$ select private.bot_huy_don(p_draft) $$;
create or replace function bot_don_mo(p_order uuid) returns boolean
language sql security definer set search_path = public as $$ select private.bot_order_open(p_order) $$;
revoke all on function private.bot_order_open(uuid), private.bot_dat_don(uuid), private.bot_huy_don(uuid) from public;
revoke all on function bot_dat_don(uuid), bot_huy_don(uuid), bot_don_mo(uuid) from public, anon, authenticated;
grant execute on function bot_dat_don(uuid), bot_huy_don(uuid), bot_don_mo(uuid) to service_role;

revoke all on all functions in schema private from public;

-- ===== CẬP NHẬT 28: đơn từ xx đồng tặng quà =====
-- 1. Loại ưu đãi mới + mốc tiền
alter table promotions drop constraint if exists promotions_kind_check;
alter table promotions add constraint promotions_kind_check check (kind in ('combo', 'mua_tang', 'giam_gia', 'don_tang'));
alter table promotions add column if not exists min_total int;
alter table promotions drop constraint if exists promotions_min_total_check;
alter table promotions add constraint promotions_min_total_check check (min_total is null or min_total > 0);

-- 2. Tự thêm / bỏ quà theo tổng tiền đơn
create or replace function private.apply_gifts(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p        promotions;
  mi       menu_items;
  v_base   int;
  v_has    boolean;
  v_name   text;
  v_mid    uuid;
  v_st     text;
begin
  select coalesce(sum(unit_price * qty), 0) into v_base
    from order_items where order_id = p_order and promo_kind is distinct from 'don_tang';
  for p in select pr.* from promotions pr
            where pr.kind = 'don_tang' and pr.min_total is not null and promo_live(pr)
            order by pr.sort_order, pr.created_at loop
    v_has := exists (select 1 from order_items where order_id = p_order and promo_id = p.id and promo_kind = 'don_tang');
    if v_base >= p.min_total then
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
end $$;

-- 3. Ưu đãi đang chạy cho trang khách: thêm loại "đơn từ xx tặng quà"
create or replace function get_promotions() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by s, n), '[]'::jsonb) from (
    select p.sort_order as s, p.name as n,
      jsonb_build_object(
        'id', p.id, 'name', p.name, 'kind', p.kind, 'description', p.description, 'image_path', p.image_path,
        'price', p.price, 'buy_qty', p.buy_qty, 'get_qty', p.get_qty, 'gift_same', p.gift_same,
        'option_mode', p.option_mode, 'start_at', p.start_at, 'end_at', p.end_at, 'days', p.days,
        'time_from', to_char(p.time_from, 'HH24:MI'), 'time_to', to_char(p.time_to, 'HH24:MI'),
        'sale_mode', p.sale_mode, 'sale_value', p.sale_value, 'min_total', p.min_total,
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
                 p.min_total is not null
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
$$;
grant execute on function get_promotions() to anon, authenticated;

-- 4. Thêm món vào đơn: xong thì xét quà theo mốc
create or replace function private.add_items(p_order uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
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
end $$;

-- 5. Nhân viên đổi số lượng / bỏ món: tụt dưới mốc thì bỏ quà. Bỏ chính dòng quà thì chỉ bỏ quà.
create or replace function staff_set_item_qty(p_item_id bigint, p_qty int) returns int
language plpgsql security definer set search_path = public as $$
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
end $$;

-- 6. Nhân viên đổi tuỳ chọn có phí: có thể làm đủ mốc → xét quà
create or replace function staff_set_item_options(p_item_id bigint, p_choice_ids int[]) returns int
language plpgsql security definer set search_path = public as $$
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
end $$;
revoke all on all functions in schema private from public;
