# SSRF Security Report

## Status: LOW

## Findings

- `bot-don/index.ts` `fetchImage()`: với Zalo, URL ảnh lấy thẳng từ nội dung webhook (`m.photo`) rồi `fetch(url)`.
- Webhook đã được xác thực bằng mã bí mật và chỉ xử lý ảnh của tài khoản đã kết nối (`isAllowed`), nên chỉ Zalo mới đưa được URL vào. Edge function chạy trên hạ tầng Supabase, không có mạng nội bộ nhạy cảm.
- `quanly.html` gọi `world.openfoodfacts.org` từ trình duyệt (không phải SSRF).

## What's at risk

Rất thấp: cần lộ mã bí mật webhook trước.

## What's already secure

Có xác thực webhook, giới hạn 8MB, chỉ nhận JPEG/PNG/WebP.

## Recommendations

Chỉ cho tải ảnh Zalo từ host của Zalo (vd `*.zdn.vn`, `*.zadn.vn` — kiểm tra lại host thật trong log) và chỉ `https:`.
