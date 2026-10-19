-- =====================================================================
-- CẬP NHẬT 14: sửa lỗi "UPDATE requires a WHERE clause" khi đặt ưu đãi
--   Supabase chặn lệnh UPDATE không có WHERE; hàm tính giá ưu đãi (cập nhật 13)
--   có 3 lệnh như vậy trên bảng tạm. Chỉ thay lại hàm private.add_promo.
--   Không đụng dữ liệu. Chạy sau cập nhật 13 (test trước, rồi product). Chạy lại vẫn an toàn.
-- =====================================================================
begin;

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

revoke all on all functions in schema private from public;

commit;

select 'Đã sửa hàm tính giá ưu đãi' as ket_qua;
