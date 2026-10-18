-- =====================================================================
-- CẬP NHẬT 8 (18/10/2026): ĐƠN GIAO HÀNG, THU TIỀN TRƯỚC, SỬA ĐƠN, BÁO HẾT MÓN NGAY
--   1. Đơn giao hàng (khách nhắn Facebook): chủ quán / nhân viên tự tạo, có địa chỉ và giờ giao.
--   2. Thu tiền bất cứ lúc nào: thu trước khi ra món thì ra món xong đơn tự đóng.
--   3. Bếp / chủ quán sửa đơn đã nhận: thêm món, đổi số lượng, bỏ món; tổng tiền tự tính lại.
--   4. Chủ quán gạt "Hết món": trang khách đang mở tự tải lại menu.
-- Không mất dữ liệu. Chạy lại lần hai không sao. Chạy TRƯỚC khi đưa giao diện mới lên.
-- =====================================================================
begin;

alter table orders add column if not exists address     text;
alter table orders add column if not exists deliver_at  timestamptz;
alter table orders add column if not exists paid_amount int;
alter table orders add column if not exists paid_method text;
alter table orders add column if not exists paid_at     timestamptz;
alter table orders add column if not exists paid_by     uuid references employees(id);
alter table orders drop constraint if exists orders_paid_method_check;
alter table orders add constraint orders_paid_method_check check (paid_method in ('tien_mat', 'chuyen_khoan'));
alter table orders drop constraint if exists orders_dine_type_check;
alter table orders add constraint orders_dine_type_check check (dine_type in ('tai_quan', 'mang_ve', 'giao_hang'));
alter table orders drop constraint if exists orders_queue_or_takeaway;
alter table orders add constraint orders_queue_or_takeaway check (dine_type <> 'tai_quan' or queue_number is not null);
alter table sales drop constraint if exists sales_dine_type_check;
alter table sales add constraint sales_dine_type_check check (dine_type in ('tai_quan', 'mang_ve', 'giao_hang'));
alter table order_items add column if not exists added_at timestamptz not null default now();

-- =====================================================================
-- 7b. HÀM NỘI BỘ (schema private: không gọi được từ trang web, chỉ các hàm khác dùng)
-- =====================================================================
create schema if not exists private;
revoke all on schema private from public;

-- Thêm món vào một đơn (dùng khi khách gọi món và khi nhân viên thêm món vào đơn đã nhận).
-- p_items = [{"menu_item_id": "...", "qty": 2, "note": "ít cay", "choice_ids": [1, 5]}]
create or replace function private.add_items(p_order uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  it           jsonb;
  mi           menu_items;
  v_bad        text;
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
    select * into mi from menu_items where id = (it ->> 'menu_item_id')::uuid and is_available;
    if not found then
      raise exception 'ITEM_UNAVAILABLE' using hint = coalesce(it ->> 'menu_item_id', '');
    end if;
    v_qty := least(greatest(coalesce((it ->> 'qty')::int, 1), 1), 50);
    v_choice_ids := array(select e::int
                            from jsonb_array_elements_text(coalesce(it -> 'choice_ids', '[]'::jsonb)) e);

    -- Mọi lựa chọn phải còn bán và thuộc nhóm tuỳ chọn gắn với món này
    if exists (select 1 from unnest(v_choice_ids) cid
                where not exists (select 1 from option_choices ch
                                    join menu_item_option_groups mog on mog.group_id = ch.group_id
                                   where ch.id = cid and ch.is_available and mog.menu_item_id = mi.id)) then
      raise exception 'OPTION_INVALID' using hint = mi.name;
    end if;

    -- Số lựa chọn trong mỗi nhóm phải nằm trong [min, max] (ví dụ đường/đá bắt buộc chọn đúng 1)
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
                     ordered_at, accepted_at, served_at, paid_at, cook_minutes, station_minutes, cashier_id)
  select o.id, o.queue_number, o.dine_type, o.total, coalesce(p_method, o.paid_method, 'tien_mat'),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'menu_item_id', i.menu_item_id, 'name', i.item_name,
                     'price', i.unit_price, 'qty', i.qty, 'options', i.options, 'station', i.station))
                   from order_items i where i.order_id = o.id), '[]'::jsonb),
         o.created_at, o.accepted_at, o.served_at, coalesce(o.paid_at, now()),
         case when o.accepted_at is not null and o.served_at is not null
              then round(extract(epoch from (o.served_at - o.accepted_at)) / 60)::int end,
         (select jsonb_object_agg(s.station, round(extract(epoch from (s.served_at - s.accepted_at)) / 60)::int)
            from order_stations s
           where s.order_id = o.id and s.accepted_at is not null and s.served_at is not null),
         coalesce(o.paid_by, my_employee_id());
  delete from orders where id = o.id;
end $$;
revoke all on all functions in schema private from public;

-- Hàm gọi món có thêm địa chỉ + giờ giao: bỏ bản cũ để không trùng tên
drop function if exists place_order(int, text, jsonb, text, boolean, text, text);

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

create or replace function staff_set_item_qty(p_item_id bigint, p_qty int) returns int
language plpgsql security definer set search_path = public as $$
declare v_order uuid; v_station text; v_total int;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  select order_id, station into v_order, v_station from order_items where id = p_item_id;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  if coalesce(p_qty, 0) <= 0 then
    if (select count(*) from order_items where order_id = v_order) <= 1 then
      raise exception 'ORDER_WOULD_BE_EMPTY' using hint = 'Đơn chỉ còn món này. Muốn bỏ hết thì huỷ đơn.';
    end if;
    delete from order_items where id = p_item_id;
    delete from order_stations s
     where s.order_id = v_order and s.station = v_station
       and not exists (select 1 from order_items i where i.order_id = v_order and i.station = v_station);
  else
    update order_items set qty = least(p_qty, 50) where id = p_item_id;
  end if;
  update orders set total = (select coalesce(sum(unit_price * qty), 0) from order_items where order_id = v_order)
   where id = v_order;
  perform refresh_order_status(v_order);
  select total into v_total from orders where id = v_order;
  return v_total;
end $$;

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

grant execute on function place_order(int, text, jsonb, text, boolean, text, text, text, timestamptz) to anon, authenticated;
grant execute on function get_my_order(uuid) to anon, authenticated;
grant execute on function complete_payment(uuid, text), staff_add_items(uuid, jsonb), staff_set_item_qty(bigint, int) to authenticated;

commit;

-- Kiểm tra
select p.proname, pg_get_function_identity_arguments(p.oid) as tham_so from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'private') and p.proname in ('place_order', 'staff_add_items', 'staff_set_item_qty', 'add_items', 'finalize_order')
 order by 1;
