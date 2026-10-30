# DATABASE_ACCESS Fix Plan

## Changes

- `sql/cap-nhat-30-bao-mat.sql` — thu hồi quyền chạy hàm của `public`/`anon`, chỉ cấp lại cho đúng các hàm trang khách dùng; đổi quyền mặc định để hàm mới không tự mở cho anon; `suggest_wait_minutes` kiểm tra vai trò; `checkin_upload` đòi `my_role() is not null`.
- `sql/schema.sql` — thêm mục CẬP NHẬT 30 (giống file trên).
- `HUONG-DAN.md` — ghi chú cập nhật 30.

## New files

- `sql/cap-nhat-30-bao-mat.sql`

## Verification goals

- [x] Anon: `refresh_order_status`, `suggest_wait_minutes`, `apply_rounding` → `permission denied` (đã thử trên Postgres 16 + giả lập Supabase)
- [x] Anon vẫn xem menu, `get_menu`, `get_payment_info`, `place_order` chạy bình thường
- [x] Tài khoản tự đăng ký: tải ảnh vào `checkin-photos` → bị RLS chặn; `suggest_wait_minutes` → `FORBIDDEN`
- [x] Nhân viên: xem đơn, nhận đơn, ra món, thu tiền, chấm công, tải ảnh chấm công vẫn chạy
- [x] Hàm tạo mới sau cập nhật: anon không chạy được, authenticated / service_role chạy được
- [x] Cài mới từ `schema.sql` (đã gộp cập nhật 30) chạy không lỗi; chạy lại file cập nhật 2 lần vẫn an toàn

## Manual verification (for the human)

- Chạy `sql/cap-nhat-30-bao-mat.sql` trên Supabase **Test**, thử: khách gọi món + xem trạng thái + gọi nhân viên + mã QR; bếp/pha chế nhận đơn, gợi ý phút, ra món, thu tiền; quản lý: chấm công có ảnh, kho, ưu đãi, đơn online, lấy mã bot.
- Ổn thì chạy trên **Product**.
