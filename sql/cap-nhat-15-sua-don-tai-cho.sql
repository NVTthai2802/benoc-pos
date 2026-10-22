-- =====================================================================
-- CẬP NHẬT 15: sửa đơn ngay trên màn hình bếp / pha chế
--   * Đổi "Ăn tại quán" ↔ "Mang về" và đổi số bàn (số thẻ) của đơn đã gửi.
--   * Đổi tuỳ chọn (topping, đường, đá, size…) của món đã có trong đơn,
--     không phải bỏ món rồi thêm lại. Giá món tự tính lại.
--   Món vừa đổi tuỳ chọn có nhãn "ĐÃ SỬA" để người làm không bỏ sót.
-- Chỉ thêm 1 cột và 2 hàm mới. Không đụng dữ liệu. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

alter table order_items add column if not exists edited_at timestamptz; -- lúc đổi tuỳ chọn gần nhất

-- 1. Đổi ăn tại quán / mang về, số bàn. Đơn giao hàng không đổi ở đây.
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

-- 2. Đổi tuỳ chọn của 1 dòng món trong đơn. p_choice_ids = toàn bộ lựa chọn mới của món.
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

grant execute on function staff_update_order(uuid, text, int) to authenticated;
grant execute on function staff_set_item_options(bigint, int[]) to authenticated;

commit;

select 'Đã thêm sửa đơn tại chỗ' as ket_qua,
       (select count(*) from information_schema.columns where table_name = 'order_items' and column_name = 'edited_at') as cot_moi;
