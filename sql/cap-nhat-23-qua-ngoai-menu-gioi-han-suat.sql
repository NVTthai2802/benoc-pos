-- =====================================================================
-- CẬP NHẬT 23: ƯU ĐÃI — quà tặng ngoài menu + giới hạn số suất
--   * Mua X tặng Y: tặng được món KHÔNG có trong menu (ví dụ "Sữa đậu 500ml"),
--     chủ quán gõ tên quà và chọn nơi đưa quà (bếp / quầy pha chế).
--   * Mọi loại ưu đãi đặt được giới hạn: "15 suất mỗi ngày" hoặc "100 suất cả đợt".
--       - Combo / mua tặng: 1 suất = 1 phần ưu đãi khách chọn.
--       - Giảm giá / đồng giá: 1 suất = 1 món (1 ly).
--     Hết suất thì ưu đãi tự ẩn khỏi menu khách, món đồng giá về giá gốc.
--     Huỷ đơn / bỏ món thì suất được trả lại. Khách đặt cùng lúc vẫn không vượt giới hạn.
-- Chạy sau cập nhật 20. Chỉ thêm cột / hàm. Không xoá dữ liệu. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

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
revoke all on all functions in schema private from public;

commit;

-- Kiểm tra: cột mới đã có
select (select count(*) from information_schema.columns where table_name = 'promotions' and column_name in ('gift_name', 'gift_station', 'limit_qty', 'limit_per')) as cot_uu_dai,
       (select count(*) from information_schema.columns where table_name = 'order_items' and column_name = 'promo_units') as cot_suat,
       jsonb_array_length(get_promotions()) as dang_chay;
