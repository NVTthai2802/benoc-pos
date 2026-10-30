# ERROR_HANDLING Security Report

## Status: LOW

## Findings

- App đổi mã lỗi (`FORBIDDEN`, `DUPLICATE_QUEUE`…) thành câu tiếng Việt; một số chỗ hiện thẳng `error.message` của Supabase (`core.js`, 6 chỗ) — có thể lộ tên bảng / ràng buộc, chỉ người dùng đang thao tác thấy.
- Edge function trả `String(e.message)` chỉ cho chủ quán đã đăng nhập; webhook luôn trả `ok`.
- Không có trang debug / API docs. (Supabase tự công khai OpenAPI ở `/rest/v1/` cho anon key — mặc định của Supabase.)

## What's at risk

Lộ chi tiết lỗi kỹ thuật (thấp).

## What's already secure

Có bảng mã lỗi thân thiện; webhook không lộ lỗi.

## Recommendations

Không bắt buộc.
