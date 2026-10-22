-- =====================================================================
-- CẬP NHẬT 19: phân biệt "Đến lấy" với "Mang về"; bỏ mã đơn khỏi nội dung chuyển khoản
--   * Đơn mang về do chủ quán / nhân viên tạo (nút "Qua lấy" ở trang Đơn giao hàng)
--     được đánh dấu là ĐẾN LẤY để phiếu in và màn hình ghi đúng.
--     Đơn khách tự quét QR chọn mang về vẫn là MANG VỀ.
--   * Nội dung chuyển khoản mặc định đổi từ "BENOC {ban} {ma}" thành "BENOC {ban} {ten}"
--     (chỉ đổi nếu chủ quán chưa tự sửa mẫu).
-- Chạy sau cập nhật 18. Không xoá dữ liệu. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

alter table orders add column if not exists pickup boolean not null default false; -- true = khách đến lấy (quán tạo đơn)

create or replace function mark_pickup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.pickup := new.dine_type = 'mang_ve' and my_role() is not null;
  return new;
end $$;
drop trigger if exists trg_orders_pickup on orders;
create trigger trg_orders_pickup before insert on orders for each row execute function mark_pickup();

-- Đổi sang ăn tại quán / giao hàng thì không còn là đến lấy
create or replace function clear_pickup() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.dine_type <> 'mang_ve' then new.pickup := false; end if;
  return new;
end $$;
drop trigger if exists trg_orders_pickup_upd on orders;
create trigger trg_orders_pickup_upd before update of dine_type on orders for each row execute function clear_pickup();

alter table shop_settings alter column bank_note set default 'BENOC {ban} {ten}';
update shop_settings set bank_note = 'BENOC {ban} {ten}' where bank_note = 'BENOC {ban} {ma}';

commit;

select get_payment_info() ->> 'note' as noi_dung_chuyen_khoan,
       (select count(*) from information_schema.columns where table_name = 'orders' and column_name = 'pickup') as cot_den_lay;
