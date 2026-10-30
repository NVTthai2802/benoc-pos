# DEPENDENCIES Security Report

## Status: LOW

## Findings

- Không có `package.json` / lock file; `npm audit` không áp dụng.
- Thư viện CDN: `@supabase/supabase-js@2.45.4`, `qrcodejs@1.0.0` (cũ, không còn bảo trì), `exceljs@4.4.0`; vendored `lib/zxing-browser.min.js`. Đều là gói thật, phổ biến.
- Edge function: `jsr:@supabase/supabase-js@2` — chỉ ghim major, mỗi lần deploy có thể lấy bản mới.
- `semgrep`, `gitleaks`, `pip-audit` chưa cài trong môi trường (cài: `pip install semgrep`, `brew install gitleaks`).

## What's at risk

Bản cập nhật lạ của thư viện được kéo về khi deploy bot.

## What's already secure

Hầu hết đã ghim phiên bản cụ thể.

## Recommendations

Ghim `jsr:@supabase/supabase-js@2.x.y` cụ thể; cân nhắc thay `qrcodejs`.
