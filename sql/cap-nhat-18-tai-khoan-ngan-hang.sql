-- =====================================================================
-- CẬP NHẬT 18: TÀI KHOẢN NHẬN CHUYỂN KHOẢN (mã VietQR)
--   Chủ quán đổi ngân hàng / số tài khoản / tên chủ tài khoản / nội dung chuyển khoản ở Quản lý → Cài đặt.
--   Màn hình quầy và điện thoại khách đều đọc từ đây (get_payment_info).
--   Mặc định: MB Bank · 0393247469.
-- Chỉ thêm cột và 1 hàm. Không đụng dữ liệu. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

alter table shop_settings add column if not exists bank_bin     text not null default '970422';     -- mã ngân hàng (BIN) theo VietQR
alter table shop_settings add column if not exists bank_name    text not null default 'MB Bank';
alter table shop_settings add column if not exists bank_account text not null default '0393247469';
alter table shop_settings add column if not exists bank_holder  text not null default '';           -- tên chủ tài khoản (không bắt buộc)
-- Mẫu nội dung chuyển khoản: {ban} = số bàn / MV / GIAO, {ten} = tên khách, {ma} = mã đơn 4 ký tự
alter table shop_settings add column if not exists bank_note    text not null default 'BENOC {ban} {ma}';

-- Khách (chưa đăng nhập) chỉ đọc được 5 thông tin này để tạo mã QR, không đọc được cài đặt khác
create or replace function get_payment_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('bin', bank_bin, 'bank', bank_name, 'account', bank_account, 'holder', bank_holder, 'note', bank_note)
    from shop_settings where id = 1
$$;
grant execute on function get_payment_info() to anon, authenticated;

commit;

select get_payment_info() as tai_khoan_hien_tai;
