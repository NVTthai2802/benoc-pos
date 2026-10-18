-- =====================================================================
-- CẬP NHẬT 10: hoá đơn lưu tên khách (và SĐT, địa chỉ nếu đi ship)
-- - Chỉ THÊM 3 cột vào bảng sales và sửa hàm hoàn tất đơn. Không xoá, không sửa dữ liệu cũ.
-- - Hoá đơn từ trước bản này không có tên (lúc đó hệ thống chưa lưu), hiện là "—".
-- Chạy trên Supabase SQL Editor (test trước, product sau). Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================
alter table sales add column if not exists customer_name  text;
alter table sales add column if not exists customer_phone text;
alter table sales add column if not exists address        text;

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
         coalesce(o.paid_by, my_employee_id()),
         o.customer_name, o.customer_phone, o.address;
  delete from orders where id = o.id;
end $$;
revoke all on all functions in schema private from public;

-- Kiểm tra: phải thấy 3 cột mới, số hoá đơn giữ nguyên
select (select count(*) from information_schema.columns where table_name = 'sales' and column_name in ('customer_name','customer_phone','address')) as so_cot_moi,
       (select count(*) from sales) as so_hoa_don;
