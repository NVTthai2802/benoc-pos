# CORS Security Report

## Status: LOW

## Findings

- **Live:** trang và file tĩnh trên `benoc-pos.pages.dev` trả `Access-Control-Allow-Origin: *` (Cloudflare Pages tự thêm). Đã thêm `! Access-Control-Allow-Origin` vào `_headers` để bỏ. Function `bot-don`: vibe-check xác nhận không mở CORS cho web lạ ở request thật.

- Edge function `bot-don` trả `Access-Control-Allow-Origin: *`. Lệnh quản lý cần JWT chủ quán trong header `Authorization` (không phải cookie), nên `*` không cho trang lạ dùng phiên của chủ quán.
- CORS của REST API Supabase do Supabase quản lý (cho mọi origin; bảo vệ bằng RLS).

## What's at risk

Không đáng kể.

## What's already secure

Không dùng cookie nên không có lỗi `credentials` + `*`.

## Recommendations

(Tuỳ chọn) Giới hạn origin của `bot-don` về `https://benoc-pos.pages.dev`.
