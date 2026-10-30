# FRONTEND_SECRETS Security Report

## Status: LOW

## Findings

- Frontend chỉ có anon key (xem SECRETS_EXPOSURE). Gọi AI (Gemini / Anthropic) và Zalo / Telegram đều qua edge function, không đi thẳng từ trình duyệt.
- Không có bước build nên không có source map (`.js.map`).
- Thư viện ngoài tải từ CDN **có ghi phiên bản** nhưng **không có SRI** (`integrity=`): `@supabase/supabase-js@2.45.4` (jsdelivr, `import()` động), `qrcodejs/1.0.0`, `exceljs/4.4.0` (cdnjs). Nếu CDN bị chiếm, mã lạ chạy trên trang Quản lý có phiên đăng nhập chủ quán.

## What's at risk

Rủi ro chuỗi cung ứng qua CDN (thấp).

## What's already secure

Không có secret ở frontend; mọi khoá AI ở server.

## Recommendations

1. Thêm `integrity` + `crossorigin` cho thẻ `<script>` cdnjs, hoặc tải các file đó về thư mục `lib/` (như đã làm với zxing).
2. Tải `supabase-js` bản ESM về `lib/` để không phụ thuộc jsdelivr.
