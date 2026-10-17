-- =====================================================================
-- CẬP NHẬT 7 (17/10/2026): KHÁCH THẤY TRẠNG THÁI ĐƠN NGAY LẬP TỨC
-- Trước: trang khách tự hỏi lại 15 giây/lần nên trễ trung bình ~7 giây so với màn hình bếp.
-- Nay: mỗi khi đơn đổi trạng thái, cơ sở dữ liệu gửi tín hiệu lên kênh riêng của đơn đó,
-- trang khách nhận được là hỏi lại ngay. Vẫn giữ hỏi lại 15 giây/lần để phòng mất mạng.
-- Chỉ thêm hàm + trigger, không đổi dữ liệu. Chạy lại lần hai không sao.
-- =====================================================================
begin;

-- Báo ngay cho điện thoại của khách khi đơn đổi trạng thái (nhận đơn, ra món, thanh toán, nhân viên tới…).
-- Mỗi đơn một kênh riêng "don-<id đơn>", tin nhắn chỉ là tín hiệu, không chứa dữ liệu đơn;
-- trang khách nhận tín hiệu thì tự hỏi lại trạng thái bằng get_my_order như cũ.
create or replace function notify_order_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if tg_table_name = 'orders' then v_id := coalesce(new.id, old.id);
  else v_id := coalesce(new.order_id, old.order_id);
  end if;
  if v_id is not null then
    begin
      perform realtime.send(jsonb_build_object('t', tg_table_name), 'changed', 'don-' || v_id::text, false);
    exception when others then null;  -- lỗi gửi tín hiệu không được làm hỏng việc chính (khách vẫn tự hỏi lại 15 giây/lần)
    end;
  end if;
  return null;
end $$;

drop trigger if exists trg_notify_orders on orders;
create trigger trg_notify_orders after update or delete on orders
  for each row execute function notify_order_change();
drop trigger if exists trg_notify_stations on order_stations;
create trigger trg_notify_stations after update on order_stations
  for each row execute function notify_order_change();
drop trigger if exists trg_notify_calls on staff_calls;
create trigger trg_notify_calls after update on staff_calls
  for each row execute function notify_order_change();

commit;

-- Kiểm tra: phải ra 3 trigger
select tgname, tgrelid::regclass from pg_trigger where tgname like 'trg_notify_%' order by 1;
