-- =====================================================================
-- CẬP NHẬT 20: ƯU ĐÃI GIẢM GIÁ — đồng giá nhiều món, giảm %, giảm số tiền
--   * Chủ quán tạo ở Quản lý → Ưu đãi → "Giảm giá / đồng giá": chọn món, cách giảm, thời gian.
--     - Đồng giá: các món đã chọn cùng bán 1 giá (ví dụ đồng giá 20.000đ).
--     - Giảm %: mỗi món giảm N% (làm tròn xuống nghìn).
--     - Giảm tiền: mỗi món bớt N đồng.
--   * Giảm trên GIÁ MÓN; topping / upsize / size L vẫn cộng thêm như thường.
--   * Khách gọi món như bình thường, giá giảm tự áp (tính ở máy chủ). Món có nhiều ưu đãi giảm
--     giá cùng lúc thì lấy giá thấp nhất. Không bao giờ làm món đắt hơn giá gốc.
--   * Món giảm giá vẫn sửa số lượng / tuỳ chọn được như món thường; hoá đơn ghi tên ưu đãi.
-- Chỉ THÊM cột / hàm. Không xoá dữ liệu, không đổi giá gốc của món. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

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

commit;

-- Kiểm tra: loại ưu đãi mới đã nhận, hàm giá giảm chạy được
select (select count(*) from information_schema.columns where table_name = 'promotions' and column_name in ('sale_mode', 'sale_value')) as cot_moi,
       (select count(*) from promotions where kind = 'giam_gia') as uu_dai_giam_gia,
       jsonb_array_length(get_promotions()) as dang_chay;
