-- =====================================================================
-- CẬP NHẬT 28: ƯU ĐÃI "ĐƠN TỪ XX ĐỒNG TRỞ LÊN THÌ ĐƯỢC TẶNG QUÀ"
--   * Chủ quán tạo ở Quản lý → Ưu đãi → "Đơn từ … tặng quà": nhập mốc (ví dụ 100.000đ),
--     chọn quà (1 món trong menu hoặc quà ngoài menu), số phần quà, thời gian, giới hạn suất.
--   * Tính theo tổng tiền các món khách đang gọi trong đơn (không tính phí ship).
--     Đủ mốc thì quà TỰ THÊM vào đơn (0đ, nhãn TẶNG, đưa tới bếp / quầy pha chế).
--     Gọi thêm món làm đủ mốc thì quà cũng tự thêm; bỏ món làm tụt dưới mốc thì quà tự bỏ.
--   * Mỗi đơn nhận quà 1 lần cho mỗi ưu đãi. 1 suất = 1 đơn nhận quà. Hết suất thì ưu đãi tự ẩn.
-- Chạy sau cập nhật 23. Chỉ thêm cột / hàm. Không xoá dữ liệu. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

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

commit;

-- Kiểm tra: cột mới đã có, hàm chạy được
select (select count(*) from information_schema.columns where table_name = 'promotions' and column_name = 'min_total') as cot_moc,
       (select count(*) from promotions where kind = 'don_tang') as uu_dai_don_tang,
       jsonb_array_length(get_promotions()) as dang_chay;
