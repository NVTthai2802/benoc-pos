-- =====================================================================
-- CẬP NHẬT 13: ƯU ĐÃI — combo giá ưu đãi, mua X tặng Y
--   * Chủ quán tạo ưu đãi ở Quản lý → Ưu đãi: chọn món, giá, thời gian hiển thị
--     (từ ngày… đến ngày…, khung giờ mỗi ngày, các thứ trong tuần).
--   * Khách thấy ưu đãi đang chạy ở đầu menu, bấm chọn là thêm vào giỏ.
--   * Giá ưu đãi luôn tính ở máy chủ (khách không sửa được).
--   * Đơn về bếp / pha chế, chi tiết đơn và lịch sử hoá đơn ghi rõ món nào thuộc combo,
--     món nào khách mua, món nào được tặng.
-- - Chỉ THÊM bảng / cột / hàm mới và cập nhật vài hàm đặt món.
--   KHÔNG xoá món, KHÔNG đổi giá, KHÔNG đụng đơn đang mở hay hoá đơn cũ.
-- Chạy trên Supabase SQL Editor (test trước, rồi product). Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================
begin;

-- 0. Cột tên khách trên hoá đơn (cập nhật 10) — thêm nếu môi trường này chưa chạy
alter table sales add column if not exists customer_name  text;
alter table sales add column if not exists customer_phone text;
alter table sales add column if not exists address        text;

-- 1. Bảng ưu đãi
create table if not exists promotions (
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
create table if not exists promotion_items (
  id           bigserial primary key,
  promotion_id uuid not null references promotions(id) on delete cascade,
  part         text not null check (part in ('combo', 'mua', 'tang')),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  qty          int  not null default 1 check (qty between 1 and 20),
  sort_order   int  not null default 0,
  unique (promotion_id, part, menu_item_id)
);
create index if not exists promotion_items_promo on promotion_items(promotion_id);

-- 2. Dòng món trong đơn: ghi món này thuộc ưu đãi nào
alter table order_items add column if not exists promo_id    uuid references promotions(id) on delete set null;
alter table order_items add column if not exists promo_name  text;      -- chụp lại tên ưu đãi lúc đặt
alter table order_items add column if not exists promo_kind  text;      -- 'combo' | 'mua_tang'
alter table order_items add column if not exists promo_group uuid;      -- các món cùng 1 phần ưu đãi khách chọn
alter table order_items add column if not exists promo_part  text;      -- 'combo' | 'mua' | 'tang'

-- 3. Ưu đãi có đang hiển thị lúc p_at không (giờ Việt Nam)
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

-- 4. Ưu đãi đang chạy cho trang khách (chỉ ưu đãi còn đủ món đang bán)
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

-- 5. Kiểm tra tuỳ chọn của 1 món, trả về tiền cộng thêm và danh sách tuỳ chọn đã chọn
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

-- 6. Thêm 1 phần ưu đãi vào đơn.
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
    update _pu set price = case when v_sum > 0 then (floor(p.price::numeric * base / v_sum / 1000) * 1000)::int else 0 end;
    select min(i) into v_first from _pu;
    update _pu set price = price + (p.price - (select sum(price) from _pu)) where i = v_first;
    update _pu set price = price + extra;
  else
    if (select count(*) from _pu where part = 'mua') <> p.buy_qty or (select count(*) from _pu where part = 'tang') <> p.get_qty then
      raise exception 'PROMO_INVALID' using hint = format('%s: chọn đúng %s món mua và %s món tặng', p.name, p.buy_qty, p.get_qty);
    end if;
    if p.gift_same and exists (select 1 from _pu g where g.part = 'tang'
                                 and not exists (select 1 from _pu b where b.part = 'mua' and b.menu_item_id = g.menu_item_id)) then
      raise exception 'PROMO_INVALID' using hint = format('%s: món tặng phải là món bạn mua', p.name);
    end if;
    update _pu set price = case when part = 'mua' then base + extra else extra end;
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

-- 7. Thêm món vào đơn: món thường như cũ, phần tử có "promo_id" là 1 phần ưu đãi
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

-- 8. Hoá đơn lưu cả thông tin ưu đãi của từng món
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

-- 9. Khách xem đơn của mình: kèm món nào thuộc combo / được tặng
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

-- 10. Sửa đơn: món thuộc ưu đãi chỉ bỏ được cả phần ưu đãi (để không lệch giá)
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

-- 11. Phân quyền: ai cũng xem ưu đãi đang chạy qua get_promotions(); chỉ chủ quán sửa
alter table promotions      enable row level security;
alter table promotion_items enable row level security;
drop policy if exists promo_owner on promotions;
create policy promo_owner on promotions for all using (my_role() = 'owner') with check (my_role() = 'owner');
drop policy if exists promo_staff_read on promotions;
create policy promo_staff_read on promotions for select using (my_role() is not null);
drop policy if exists promoi_owner on promotion_items;
create policy promoi_owner on promotion_items for all using (my_role() = 'owner') with check (my_role() = 'owner');
drop policy if exists promoi_staff_read on promotion_items;
create policy promoi_staff_read on promotion_items for select using (my_role() is not null);
grant select, insert, update, delete on promotions, promotion_items to authenticated;
grant usage, select on sequence promotion_items_id_seq to authenticated;
grant execute on function get_promotions() to anon, authenticated;
grant execute on function promo_live(promotions, timestamptz) to anon, authenticated;
grant execute on function get_my_order(uuid) to anon, authenticated;
grant execute on function staff_set_item_qty(bigint, int) to authenticated;

-- 12. Đổi ưu đãi: báo trang khách đang mở tải lại (giống khi đổi menu)
drop trigger if exists trg_promotions_changed on promotions;
create trigger trg_promotions_changed after insert or update or delete on promotions
  for each statement execute function notify_menu_change();
drop trigger if exists trg_promotion_items_changed on promotion_items;
create trigger trg_promotion_items_changed after insert or update or delete on promotion_items
  for each statement execute function notify_menu_change();

commit;

-- Kiểm tra: bảng mới đã có, số ưu đãi đang chạy (lần đầu là 0)
select (select count(*) from promotions) as so_uu_dai,
       jsonb_array_length(get_promotions()) as dang_chay,
       (select count(*) from information_schema.columns where table_name = 'order_items' and column_name like 'promo_%') as cot_moi_tren_don;
