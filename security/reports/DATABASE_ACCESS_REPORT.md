# DATABASE_ACCESS Security Report

## Status: MEDIUM

## Findings

- **RLS:** cả 24 bảng ở schema `public` đều bật RLS và có policy theo `my_role()`. Bảng menu đọc công khai bằng `using (true)` là cố ý (khách cần xem menu). Bảng `orders`, `sales`, `employees`, `shifts`, `fb_*`, `bot_*` chỉ nhân viên / chủ quán đọc được. Anon key không đọc được đơn hàng (đã thử).
- **Quyền chạy hàm (đã sửa):** Postgres và Supabase mặc định cho `PUBLIC`/`anon` chạy **mọi** hàm mới tạo trong `public`. `schema.sql` chỉ ghi rõ quyền cho anon, không thu hồi phần mặc định. Thử trên database giả lập: anon key gọi được
  - `refresh_order_status(uuid)` (security definer, không kiểm tra vai trò, có thể chốt đơn sang doanh thu),
  - `suggest_wait_minutes(uuid, text)` (lộ thời gian làm món trung bình, số đơn đang làm),
  - `apply_rounding`, `round_money`, `promo_usage`...
  - **Đã xác nhận trên Product:** `POST /rest/v1/rpc/suggest_wait_minutes` bằng anon key trả `10`. Bảng `orders`, `employees`, `sales` trả `[]` (RLS chặn đúng).
- **Đăng ký mở:** app tạo tài khoản nhân viên bằng `auth.signUp` ngay trên trình duyệt (`core.js:246`, `core.js:467`), nên Supabase **phải** bật “Allow new users to sign up” (Product: `disable_signup: false`, `mailer_autoconfirm: true`). Ai có anon key cũng tự tạo tài khoản `authenticated`. Tài khoản lạ này không đọc được dữ liệu nhờ RLS, nhưng **tải được file vào bucket `checkin-photos`** (policy chỉ kiểm tra thư mục = uid). Đã sửa.
- **Lộ tên khách (LOW):** `place_order` báo lỗi `DUPLICATE_QUEUE` kèm *tên khách* đang ngồi ở số thẻ đó (`schema.sql:713`). Ai cũng dò được số 1..50 để xem tên khách đang ngồi. Đây là tính năng (“Số 7 đang có đơn của Lan”), nên tôi chưa đổi.

## What's at risk

Người ngoài gọi hàm nội bộ bằng anon key, dùng bucket ảnh chấm công làm kho chứa file, xem tên khách đang ngồi quán.

## What's already secure

RLS bật ở mọi bảng; hàm nhân viên đều kiểm tra `my_role()`; hàm bot chỉ cho `service_role`; schema `private` đã bị thu hồi quyền; giá luôn tính ở server; `access_token` của đơn là UUID ngẫu nhiên.

## Recommendations

1. Chạy `sql/cap-nhat-30-bao-mat.sql` (Test trước, rồi Product).
2. (Tuỳ chọn) Bỏ tên khách khỏi thông báo `DUPLICATE_QUEUE` khi người gọi là khách chưa đăng nhập.
