-- =====================================================================
-- CẬP NHẬT 6 (17/10/2026): ĐƠN MANG VỀ
-- Khách chọn "Ăn tại quán" (nhập số thẻ như cũ) hoặc "Mang về" (chỉ cần tên, không cần số thẻ).
--   - orders.dine_type, sales.dine_type: 'tai_quan' | 'mang_ve'
--   - queue_number được để trống khi mang về (ăn tại quán vẫn bắt buộc có số)
--   - place_order có thêm tham số p_dine_type; get_my_order, complete_payment trả/lưu loại đơn
-- Không mất dữ liệu: đơn và hoá đơn cũ được tính là ăn tại quán. Chạy lại lần hai không sao.
-- Chạy TRƯỚC khi đưa giao diện mới lên (giao diện cũ vẫn chạy được sau khi chạy file này).
-- =====================================================================
begin;

alter table orders add column if not exists dine_type text not null default 'tai_quan'
  check (dine_type in ('tai_quan', 'mang_ve'));
alter table orders alter column queue_number drop not null;
alter table orders drop constraint if exists orders_queue_or_takeaway;
alter table orders add constraint orders_queue_or_takeaway check (dine_type = 'mang_ve' or queue_number is not null);

alter table sales add column if not exists dine_type text not null default 'tai_quan'
  check (dine_type in ('tai_quan', 'mang_ve'));
alter table sales alter column queue_number drop not null;
alter table staff_calls alter column queue_number drop not null;

-- Hàm gọi món mới có thêm p_dine_type: bỏ bản cũ để không bị trùng tên
drop function if exists place_order(int, text, jsonb, text, boolean, text);

create or replace function place_order(
  p_queue_number      int,
  p_customer_name     text,
  p_items             jsonb,
  p_customer_phone    text    default null,
  p_confirm_duplicate boolean default false,
  p_note              text    default null,
  p_dine_type         text    default 'tai_quan'   -- 'tai_quan' (ăn tại quán) | 'mang_ve' (mang về, không cần số thẻ)
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_dine       text := case when p_dine_type = 'mang_ve' then 'mang_ve' else 'tai_quan' end;
  v_queue      int  := case when p_dine_type = 'mang_ve' then null else p_queue_number end;
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
  if v_dine = 'tai_quan' and (v_queue is null or v_queue <= 0) then
    raise exception 'MISSING_QUEUE_NUMBER' using hint = 'Vui lòng nhập số thứ tự trên thẻ bạn vừa lấy';
  end if;
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'MISSING_NAME' using hint = 'Vui lòng nhập tên để quán liên hệ khi cần';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  if v_queue is not null then
    select o.customer_name into v_dup from orders o where o.queue_number = v_queue limit 1;
    if found and not p_confirm_duplicate then
      raise exception 'DUPLICATE_QUEUE'
        using hint = format('Số %s đang có đơn của %s chưa thanh toán', v_queue, v_dup);
    end if;
  end if;

  insert into orders (queue_number, customer_name, customer_phone, note, dine_type)
  values (v_queue, trim(p_customer_name), nullif(trim(p_customer_phone), ''),
          nullif(left(trim(p_note), 300), ''), v_dine)
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

create or replace function get_my_order(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'queue_number',       o.queue_number,
    'dine_type',          o.dine_type,
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

create or replace function complete_payment(p_order_id uuid, p_method text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  insert into sales (id, queue_number, dine_type, total, payment_method, items,
                     ordered_at, accepted_at, served_at, cook_minutes, station_minutes, cashier_id)
  select o.id, o.queue_number, o.dine_type, o.total, p_method,
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

grant execute on function place_order(int, text, jsonb, text, boolean, text, text) to anon, authenticated;
grant execute on function get_my_order(uuid) to anon, authenticated;
grant execute on function complete_payment(uuid, text) to authenticated;

commit;

-- Kiểm tra: phải ra 1 dòng place_order có 7 tham số
select p.proname, pg_get_function_identity_arguments(p.oid) from pg_proc p where p.proname = 'place_order';
