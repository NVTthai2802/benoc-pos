-- =====================================================================
-- CẬP NHẬT 27: BOT LÊN ĐƠN GỬI THẲNG VÀO BẾP / PHA CHẾ
--   * Chủ quán đã chốt đơn với khách rồi mới gửi ảnh cho bot, nên bot tạo ĐƠN THẬT ngay
--     (không qua bước duyệt). Đơn hiện ở bếp / pha chế với nhãn "ĐƠN ONLINE" (orders.source = 'fb').
--   * Nhắn chữ sửa đơn / "huỷ" trong lúc bếp CHƯA NHẬN đơn: bot sửa / huỷ đơn thật luôn.
--     Bếp đã bấm Nhận thì bot không sửa nữa, sửa trên màn hình bếp (Sửa đơn).
--   * Các hàm chỉ bot (service_role) gọi được.
-- Chạy sau cập nhật 25. Chỉ thêm hàm. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

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

commit;

select 'Bot gửi thẳng đơn vào bếp' as ket_qua;
