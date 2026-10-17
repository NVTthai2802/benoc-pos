-- =====================================================================
-- CẬP NHẬT 2 (17/10/2026): tách BẾP và QUẦY PHA CHẾ.
-- Mỗi danh mục menu có "nơi làm" (bep | pha_che). Đơn có món của cả hai nơi
-- được chia: mỗi nơi tự nhận, báo giờ, ra món phần của mình.
-- Chạy MỘT LẦN trên cơ sở dữ liệu đã cài trước ngày này (sau cập nhật 1).
-- Cài mới từ đầu thì không cần: schema.sql đã có sẵn thay đổi này.
-- =====================================================================

-- Vai trò mới: tài khoản dùng chung cho máy ở quầy pha chế
alter type staff_role add value if not exists 'bar';

alter table shop_settings add column if not exists bar_capacity int not null default 2
  check (bar_capacity > 0);  -- số đơn quầy pha chế làm cùng lúc

alter table menu_categories add column if not exists station text not null default 'bep'
  check (station in ('bep', 'pha_che'));
update menu_categories set station = 'pha_che'
 where name in ('Trà sữa', 'Trà hoa quả', 'Sốt khoai môn tươi', 'Cà phê',
                'Matcha · Cacao · Khoai môn', 'Món nên thử');

alter table order_items add column if not exists station text not null default 'bep'
  check (station in ('bep', 'pha_che'));

-- Tiến độ của từng nơi trong một đơn
create table if not exists order_stations (
  order_id           uuid not null references orders(id) on delete cascade,
  station            text not null check (station in ('bep', 'pha_che')),
  status             order_status not null default 'cho_nhan',
  accepted_at        timestamptz,
  estimated_ready_at timestamptz,
  served_at          timestamptz,
  primary key (order_id, station)
);
create index if not exists order_stations_station_status on order_stations(station, status);

-- Đơn đang mở từ trước cập nhật (nếu có): coi là của bếp
insert into order_stations (order_id, station, status, accepted_at, estimated_ready_at, served_at)
select id, 'bep', status, accepted_at, estimated_ready_at, served_at from orders
on conflict do nothing;

-- Thời gian làm thực tế của từng nơi, ví dụ {"bep": 9, "pha_che": 4}
alter table sales add column if not exists station_minutes jsonb;

alter table order_stations enable row level security;
drop policy if exists ost_read on order_stations;
create policy ost_read on order_stations for select using (my_role() is not null);
grant select, insert, update, delete on order_stations to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'order_stations') then
    alter publication supabase_realtime add table order_stations;
  end if;
end $$;

-- Các hàm cũ nhận đơn theo cả đơn: thay bằng bản theo từng nơi
drop function if exists suggest_wait_minutes(uuid);
drop function if exists accept_order(uuid, int);
drop function if exists extend_wait(uuid, int);
drop function if exists mark_served(uuid);

-- ---------------------------------------------------------------------
-- Trạng thái chung của đơn tính từ các nơi:
--   tất cả đã ra món -> da_ra_mon; có nơi đã nhận -> dang_lam; còn lại cho_nhan.
--   Giờ dự kiến = nơi xong muộn nhất trong các nơi chưa ra món.
-- ---------------------------------------------------------------------
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
end $$;

-- Toàn bộ menu đang bán, trả về trong 1 lần gọi (trang khách gọi khi mở).
-- Danh mục không còn món nào đang bán sẽ tự ẩn.
create or replace function get_menu() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(c order by c_sort, c_id), '[]'::jsonb) from (
    select mc.id as c_id, mc.sort_order as c_sort,
      jsonb_build_object(
        'id', mc.id, 'name', mc.name, 'color', mc.color, 'station', mc.station,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', mi.id, 'name', mi.name, 'description', mi.description,
            'price', mi.price, 'image_path', mi.image_path, 'tag', mi.tag,
            'option_groups', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', g.id, 'title', g.title, 'min', g.min_select, 'max', g.max_select,
                'choices', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'id', ch.id, 'name', ch.name,
                           'price', ch.price_delta, 'default', ch.is_default)
                         order by ch.sort_order, ch.id)
                    from option_choices ch
                   where ch.group_id = g.id and ch.is_available), '[]'::jsonb)
              ) order by mog.sort_order, g.sort_order, g.id)
                from menu_item_option_groups mog join option_groups g on g.id = mog.group_id
               where mog.menu_item_id = mi.id), '[]'::jsonb)
          ) order by mi.sort_order, mi.name)
            from menu_items mi
           where mi.category_id = mc.id and mi.is_available), '[]'::jsonb)
      ) as c
    from menu_categories mc
  ) s
  where jsonb_array_length(c -> 'items') > 0
$$;

-- Đặt món.
-- p_items = [{"menu_item_id": "...", "qty": 2, "note": "ít cay", "choice_ids": [3, 7]}]
-- Giá luôn tính ở server (giá món + tuỳ chọn), không tin giá client gửi lên.
-- Mỗi món được gắn nơi làm theo danh mục của nó (bếp / quầy pha chế).
-- Nếu số thứ tự đã có đơn chưa thanh toán (gọi thêm món / ngồi ghép / nhập nhầm số)
-- → báo DUPLICATE_QUEUE, app hỏi lại khách rồi gửi p_confirm_duplicate = true.
create or replace function place_order(
  p_queue_number      int,
  p_customer_name     text,
  p_items             jsonb,
  p_customer_phone    text    default null,
  p_confirm_duplicate boolean default false,
  p_note              text    default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
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
  if p_queue_number is null or p_queue_number <= 0 then
    raise exception 'MISSING_QUEUE_NUMBER' using hint = 'Vui lòng nhập số thứ tự trên thẻ bạn vừa lấy';
  end if;
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'MISSING_NAME' using hint = 'Vui lòng nhập tên để quán liên hệ khi cần';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  select o.customer_name into v_dup from orders o where o.queue_number = p_queue_number limit 1;
  if found and not p_confirm_duplicate then
    raise exception 'DUPLICATE_QUEUE'
      using hint = format('Số %s đang có đơn của %s chưa thanh toán', p_queue_number, v_dup);
  end if;

  insert into orders (queue_number, customer_name, customer_phone, note)
  values (p_queue_number, trim(p_customer_name), nullif(trim(p_customer_phone), ''),
          nullif(left(trim(p_note), 300), ''))
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

-- Khách xem trạng thái đơn của mình (app gọi lại mỗi ~15 giây).
-- Trả về null nghĩa là đơn đã thanh toán xong.
create or replace function get_my_order(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'queue_number',       o.queue_number,
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

-- Gợi ý số phút chờ khi một nơi (bếp / quầy pha chế) nhận phần của mình:
--   thời gian món lâu nhất của nơi đó trong đơn
-- + (số đơn nơi đó đang làm / số đơn làm song song) × thời gian làm trung bình 14 ngày gần nhất của nơi đó
-- làm tròn lên bội số 5 phút. Người làm có thể chỉnh trước khi bấm nhận.
create or replace function suggest_wait_minutes(p_order_id uuid, p_station text default 'bep') returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_own   int;
  v_ahead int;
  v_cap   int;
  v_avg   numeric;
begin
  select coalesce(max(m.prep_minutes), 10) into v_own
    from order_items i join menu_items m on m.id = i.menu_item_id
   where i.order_id = p_order_id and i.station = p_station;
  select count(*) into v_ahead from order_stations where station = p_station and status = 'dang_lam';
  select case when p_station = 'pha_che' then bar_capacity else kitchen_capacity end
    into v_cap from shop_settings where id = 1;
  select avg((station_minutes ->> p_station)::numeric) into v_avg from sales
   where paid_at > now() - interval '14 days' and station_minutes ? p_station;
  return (ceil((v_own + floor(v_ahead::numeric / greatest(v_cap, 1)) * coalesce(v_avg, v_own)) / 5.0) * 5)::int;
end $$;

create or replace function accept_order(p_order_id uuid, p_minutes int, p_station text default 'bep') returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  update order_stations
     set status = 'dang_lam',
         accepted_at = now(),
         estimated_ready_at = now() + make_interval(mins => greatest(p_minutes, 1))
   where order_id = p_order_id and station = p_station and status = 'cho_nhan';
  perform refresh_order_status(p_order_id);
end $$;

-- Người làm báo "cần thêm X phút"
create or replace function extend_wait(p_order_id uuid, p_extra_minutes int, p_station text default 'bep') returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  update order_stations
     set estimated_ready_at = greatest(estimated_ready_at, now()) + make_interval(mins => p_extra_minutes)
   where order_id = p_order_id and station = p_station and status = 'dang_lam';
  perform refresh_order_status(p_order_id);
end $$;

create or replace function mark_served(p_order_id uuid, p_station text default 'bep') returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  update order_stations set status = 'da_ra_mon', served_at = now()
   where order_id = p_order_id and station = p_station and status = 'dang_lam';
  perform refresh_order_status(p_order_id);
end $$;

-- Thanh toán: chép tóm tắt sang sales rồi xoá order (order_items, order_stations, staff_calls xoá theo)
create or replace function complete_payment(p_order_id uuid, p_method text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  insert into sales (id, queue_number, total, payment_method, items,
                     ordered_at, accepted_at, served_at, cook_minutes, station_minutes, cashier_id)
  select o.id, o.queue_number, o.total, p_method,
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

grant execute on function refresh_order_status(uuid) to authenticated;
grant execute on function suggest_wait_minutes(uuid, text) to authenticated;
grant execute on function accept_order(uuid, int, text) to authenticated;
grant execute on function extend_wait(uuid, int, text) to authenticated;
grant execute on function mark_served(uuid, text) to authenticated;
grant execute on function get_menu(), get_my_order(uuid),
  place_order(int, text, jsonb, text, boolean, text) to anon;
