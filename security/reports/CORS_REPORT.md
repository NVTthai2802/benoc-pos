# CORS Security Report

## Status: LOW

## Findings

- Edge function `bot-don` trả `Access-Control-Allow-Origin: *`. Lệnh quản lý cần JWT chủ quán trong header `Authorization` (không phải cookie), nên `*` không cho trang lạ dùng phiên của chủ quán.
- CORS của REST API Supabase do Supabase quản lý (cho mọi origin; bảo vệ bằng RLS).

## What's at risk

Không đáng kể.

## What's already secure

Không dùng cookie nên không có lỗi `credentials` + `*`.

## Recommendations

(Tuỳ chọn) Giới hạn origin của `bot-don` về `https://benoc-pos.pages.dev`.
