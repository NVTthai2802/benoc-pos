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
-- 4. ORDER (chỉ tồn tại đến khi thanh toán xong)
-- =====================================================================
create type order_status as enum ('cho_nhan', 'dang_lam', 'da_ra_mon');

create table orders (
  id                 uuid primary key default gen_random_uuid(),
  access_token       uuid not null unique default gen_random_uuid(), -- khách dùng để xem đơn của mình
  queue_number       int  not null check (queue_number > 0),         -- số thứ tự khách lấy ở bếp
  customer_name      text not null check (length(trim(customer_name)) > 0),
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
  station      text not null default 'bep' check (station in ('bep', 'pha_che'))  -- nơi làm món này
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
  queue_number int  not null,
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
  queue_number   int  not null,
  total          int  not null,
  payment_method text not null check (payment_method in ('tien_mat', 'chuyen_khoan')),
  items          jsonb not null,            -- [{menu_item_id, name, price, qty, options}]
  ordered_at     timestamptz not null,
  accepted_at    timestamptz,
  served_at      timestamptz,
  paid_at        timestamptz not null default now(),
  cook_minutes   int,                       -- từ lúc nhận đến lúc ra món cả đơn
  station_minutes jsonb,                    -- thời gian làm từng nơi, ví dụ {"bep": 9, "pha_che": 4} (để ước tính chờ)
  cashier_id     uuid references employees(id)
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
  p_note              text    default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order      orders;
  v_dup        text;
  v_bad        text;
  v_qty        int;
  v_extra      int;
  v_opts       jsonb;
  v_choice_ids int[];
  v_station    text;
  v_total      int := 0;
  it           jsonb;
  mi           menu_items;
begin
  if p_queue_number is null or p_queue_number <= 0 then
    raise exception 'MISSING_QUEUE_NUMBER' using hint = 'Vui lòng nhập số thứ tự trên thẻ bạn vừa lấy';
  end if;
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'MISSING_NAME' using hint = 'Vui lòng nhập tên để quán liên hệ khi cần';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  select o.customer_name into v_dup from orders o where o.queue_number = p_queue_number limit 1;
  if found and not p_confirm_duplicate then
    raise exception 'DUPLICATE_QUEUE'
      using hint = format('Số %s đang có đơn của %s chưa thanh toán', p_queue_number, v_dup);
  end if;

  insert into orders (queue_number, customer_name, customer_phone, note)
  values (p_queue_number, trim(p_customer_name), nullif(trim(p_customer_phone), ''),
          nullif(left(trim(p_note), 300), ''))
  returning * into v_order;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into mi from menu_items where id = (it ->> 'menu_item_id')::uuid and is_available;
    if not found then
      raise exception 'ITEM_UNAVAILABLE' using hint = coalesce(it ->> 'menu_item_id', '');
    end if;
    v_qty := coalesce((it ->> 'qty')::int, 1);
    v_choice_ids := array(select e::int
                            from jsonb_array_elements_text(coalesce(it -> 'choice_ids', '[]'::jsonb)) e);

    -- Mọi lựa chọn phải còn bán và thuộc nhóm tuỳ chọn gắn với món này
    if exists (select 1 from unnest(v_choice_ids) cid
                where not exists (select 1 from option_choices ch
                                    join menu_item_option_groups mog on mog.group_id = ch.group_id
                                   where ch.id = cid and ch.is_available and mog.menu_item_id = mi.id)) then
      raise exception 'OPTION_INVALID' using hint = mi.name;
    end if;

    -- Số lựa chọn trong mỗi nhóm phải nằm trong [min, max] (ví dụ size bắt buộc chọn đúng 1)
    select g.title into v_bad
      from menu_item_option_groups mog join option_groups g on g.id = mog.group_id
     where mog.menu_item_id = mi.id
       and (select count(*) from option_choices ch
             where ch.group_id = g.id and ch.id = any(v_choice_ids))
           not between g.min_select and g.max_select
     limit 1;
    if found then
      raise exception 'OPTION_REQUIRED' using hint = format('%s: kiểm tra lại mục "%s"', mi.name, v_bad);
    end if;

    select coalesce(sum(ch.price_delta), 0),
           coalesce(jsonb_agg(jsonb_build_object('group', g.title, 'choice', ch.name, 'price', ch.price_delta)
                              order by g.sort_order, ch.sort_order, ch.id), '[]'::jsonb)
      into v_extra, v_opts
      from option_choices ch join option_groups g on g.id = ch.group_id
     where ch.id = any(v_choice_ids);

    select coalesce((select mc.station from menu_categories mc where mc.id = mi.category_id), 'bep')
      into v_station;

    insert into order_items (order_id, menu_item_id, item_name, unit_price, options, qty, note, station)
    values (v_order.id, mi.id, mi.name, mi.price + v_extra, v_opts, v_qty, nullif(trim(it ->> 'note'), ''), v_station);
    v_total := v_total + (mi.price + v_extra) * v_qty;
  end loop;

  insert into order_stations (order_id, station)
  select distinct v_order.id, station from order_items where order_id = v_order.id;

  update orders set total = v_total where id = v_order.id;
  return jsonb_build_object('order_id', v_order.id, 'access_token', v_order.access_token, 'total', v_total);
end $$;

-- Khách xem trạng thái đơn của mình (app gọi lại mỗi ~15 giây).
-- Trả về null nghĩa là đơn đã thanh toán xong.
create or replace function get_my_order(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'queue_number',       o.queue_number,
    'customer_name',      o.customer_name,
    'status',             o.status,
    'total',              o.total,
    'note',               o.note,
    'created_at',         o.created_at,
    'estimated_ready_at', o.estimated_ready_at,
    -- số đơn trước mình ở cùng quầy (khách gọi trà không phải chờ các đơn cơm)
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
                       'price', i.unit_price, 'options', i.options) order by i.id)
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
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  insert into sales (id, queue_number, total, payment_method, items,
                     ordered_at, accepted_at, served_at, cook_minutes, station_minutes, cashier_id)
  select o.id, o.queue_number, o.total, p_method,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'menu_item_id', i.menu_item_id, 'name', i.item_name,
                     'price', i.unit_price, 'qty', i.qty, 'options', i.options, 'station', i.station))
                   from order_items i where i.order_id = o.id), '[]'::jsonb),
         o.created_at, o.accepted_at, o.served_at,
         case when o.accepted_at is not null and o.served_at is not null
              then round(extract(epoch from (o.served_at - o.accepted_at)) / 60)::int end,
         (select jsonb_object_agg(s.station, round(extract(epoch from (s.served_at - s.accepted_at)) / 60)::int)
            from order_stations s
           where s.order_id = o.id and s.accepted_at is not null and s.served_at is not null),
         my_employee_id();

  delete from orders where id = o.id;
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

-- =====================================================================
-- 10b. QUYỀN TRUY CẬP API (ghi rõ để chạy được kể cả khi project tắt
--      "Automatically expose new tables"). RLS ở trên vẫn quyết định ai thấy dòng nào.
-- =====================================================================
grant usage on schema public to anon, authenticated;
-- Khách (chưa đăng nhập): chỉ đọc menu + gọi các hàm đặt món
grant select on menu_categories, menu_items, option_groups, option_choices, menu_item_option_groups to anon;
grant execute on function get_menu(), get_my_order(uuid), call_staff(uuid, text), has_owner(),
  place_order(int, text, jsonb, text, boolean, text) to anon;
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
