-- =====================================================================
-- CẬP NHẬT 29: ƯU ĐÃI "ĐƠN TỪ XX TẶNG QUÀ" — thêm điều kiện món phải mua + loại đơn
--   * Món bắt buộc mua: ví dụ "mua ít nhất 1 trà sữa / trà hoa quả bất kỳ" (chọn nhóm món + số món tối thiểu).
--   * Mức tiền đơn (từ xx đồng) giờ không bắt buộc: có thể chỉ cần mua đủ số món (vd "mua 2 trà sữa tặng 1 nước").
--   * Áp dụng cho loại đơn: ăn tại quán / mang về (qua lấy) / giao hàng (ship). Bỏ trống = mọi loại.
--   * Đổi ăn tại quán ↔ mang về trên bếp / pha chế thì quà tự thêm / bỏ theo loại đơn mới.
-- Chạy sau cập nhật 28. Chỉ thêm cột / hàm. Không xoá dữ liệu. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

alter table promotions add column if not exists need_qty   int;      -- số món bắt buộc mua (món trong danh sách "mua")
alter table promotions add column if not exists dine_types text[];   -- loại đơn áp dụng; trống = tất cả
alter table promotions drop constraint if exists promotions_need_qty_check;
alter table promotions add constraint promotions_need_qty_check check (need_qty is null or need_qty > 0);

create or replace function private.apply_gifts(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
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
end $$;

create or replace function get_promotions() returns jsonb
language sql stable security definer set search_path = public as $$
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
$$;
grant execute on function get_promotions() to anon, authenticated;


-- Đổi ăn tại quán / mang về: xét lại quà theo loại đơn mới
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
  perform private.apply_gifts(p_order_id);
  update orders set total = (select coalesce(sum(unit_price * qty), 0) from order_items where order_id = p_order_id)
   where id = p_order_id;
  perform refresh_order_status(p_order_id);
  if p_dine_type = 'tai_quan' then
    select customer_name into v_dup from orders where queue_number = p_queue_number and id <> p_order_id limit 1;
  end if;
  return jsonb_build_object('duplicate_with', v_dup);
end $$;
revoke all on all functions in schema private from public;

commit;

select (select count(*) from information_schema.columns where table_name = 'promotions' and column_name in ('need_qty', 'dine_types')) as cot_moi,
       jsonb_array_length(get_promotions()) as dang_chay;
