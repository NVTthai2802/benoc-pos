# AUTH_MIDDLEWARE Security Report

## Status: MEDIUM

## Findings

Không có server riêng; “route” là các hàm RPC của Supabase và edge function `bot-don`.

| Lối vào | Ai gọi | Kiểm tra |
|---|---|---|
| `get_menu`, `get_promotions`, `get_payment_info`, `has_owner` | khách | công khai (đúng) |
| `place_order` | khách | đơn giao hàng đòi `my_role()` |
| `get_my_order`, `call_staff` | khách | `access_token` UUID |
| `accept_order`, `extend_wait`, `mark_served`, `cancel_order`, `complete_payment`, `staff_*`, `stock_move` | nhân viên | `my_role() is null → FORBIDDEN` |
| `owner_update_shift`, `fb_approve`, `bot_link_code` | chủ quán | `my_role() = 'owner'` |
| `check_in`, `check_out` | nhân viên | `auth.uid()` khớp nhân viên đang làm |
| `claim_owner` | lần cài đầu | khoá khi đã có chủ quán |
| `suggest_wait_minutes` | nhân viên | **không kiểm tra** → đã sửa |
| `refresh_order_status` | nội bộ | **anon gọi được** → đã sửa |
| `bot_link_use`, `bot_dat_don`, `bot_huy_don`, `bot_don_mo` | bot | chỉ `service_role` |
| `bot-don` (webhook) | Zalo/Telegram | so mã bí mật webhook suy từ token |
| `bot-don` (lệnh quản lý) | chủ quán | `auth.getUser(jwt)` + `employees.role = 'owner'` |

**Đăng ký mở (MEDIUM, chưa sửa):** vì nhân viên được tạo bằng `auth.signUp` trên trình duyệt, ai cũng tạo được tài khoản. Hệ quả:
- Chiếm trước số điện thoại: kẻ xấu đăng ký `0912345678@benoc.app` trước, chủ quán tạo nhân viên với số đó sẽ bị `PHONE_TAKEN`.
- Tạo hàng loạt tài khoản rác trong Supabase Auth.

## What's at risk

Chiếm trước SĐT nhân viên; rác trong danh sách Auth. Tài khoản lạ không đọc / sửa được dữ liệu quán.

## What's already secure

Mọi hàm nhân viên / chủ quán đều kiểm tra vai trò ngay đầu hàm. Webhook bot có mã bí mật; lệnh quản lý của bot kiểm tra JWT + vai trò chủ quán.

## Recommendations

1. Chạy cập nhật 30 (đã sửa 2 hàm thiếu kiểm tra).
2. Chuyển việc tạo tài khoản nhân viên sang edge function (dùng `auth.admin.createUser` bằng service key, kiểm tra người gọi là chủ quán), rồi **tắt** “Allow new users to sign up”. Lần cài đầu (`claim_owner`) có thể tạo chủ quán trong Supabase Dashboard.
3. Trong lúc chưa làm bước 2: bật CAPTCHA (Cloudflare Turnstile) trong Supabase Auth → Attack Protection.
