# RATE_LIMITING Security Report

## Status: MEDIUM

## Findings

- **Mã kết nối bot (đã sửa):** mã 6 số, sống 10 phút, trước đây nhắn thử không giới hạn. Ai tìm ra bot có thể dò mã trong lúc chủ quán vừa lấy mã → được quyền lên đơn thẳng vào bếp và tiêu tiền AI. Cập nhật 30 khoá sau 5 lần sai / 10 phút mỗi tài khoản, 30 lần sai / 10 phút toàn quán.
- **Đặt món không giới hạn:** `place_order` là hàm công khai; script có thể bắn hàng trăm đơn giả lên màn bếp (mỗi đơn tối đa 50 món × số dòng không giới hạn). `call_staff` giới hạn 1 lần gọi mở / đơn, nhưng `p_message`, `p_customer_name`, `p_customer_phone` không giới hạn độ dài.
- **Đăng nhập:** dùng giới hạn sẵn của Supabase Auth; mật khẩu tối thiểu 6 ký tự; tên đăng nhập là SĐT (dễ đoán).

## What's at risk

Làm loạn màn bếp bằng đơn giả; dò mật khẩu nhân viên; chiếm quyền bot.

## What's already secure

Supabase Auth có rate limit theo IP; `call_staff` chống bấm liên tục.

## Recommendations

1. Chạy cập nhật 30 (bot).
2. Bật CAPTCHA (Turnstile) cho Supabase Auth; nâng mật khẩu tối thiểu lên 8 trong Auth → Policies.
3. Giới hạn đơn khách: vd tối đa 30 đơn chưa thanh toán toàn quán, hoặc 3 đơn / 1 phút; cắt `left(…, 100)` cho tên, SĐT, lời nhắn.
