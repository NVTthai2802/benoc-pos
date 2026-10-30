# RATE_LIMITING Fix Plan

## Changes

- `sql/cap-nhat-30-bao-mat.sql` — bảng `private.bot_link_fail` + kiểm tra số lần sai trong `private.bot_link_use` (đã làm).
- (Đề xuất) giới hạn trong `place_order` / `call_staff`.

## New files

- `sql/cap-nhat-30-bao-mat.sql`

## Verification goals

- [x] 6 mã sai liên tiếp từ 1 tài khoản → lần nhập đúng sau đó vẫn bị từ chối; tài khoản khác nhập đúng → kết nối được (đã thử)
- [ ] Bật CAPTCHA Supabase Auth
- [ ] Giới hạn đơn khách

## Manual verification (for the human)

- Trên Test: nhắn sai mã 5 lần cho bot, lần 6 nhập đúng phải báo sai; đợi 10 phút thì dùng được.
