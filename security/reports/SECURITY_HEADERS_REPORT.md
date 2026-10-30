# SECURITY_HEADERS Security Report

## Status: MEDIUM

## Findings

- Repo **không có** `_headers` / cấu hình header nào. Cloudflare Pages mặc định không gửi CSP, `X-Frame-Options`, `Permissions-Policy`. (Chưa xác nhận live vì mạng môi trường chặn `benoc-pos.pages.dev`.)
- Thiếu `X-Frame-Options` / `frame-ancestors`: trang khác nhúng được `quanly.html` vào khung để lừa chủ quán bấm (clickjacking).
- HSTS: tên miền `.dev` đã nằm trong danh sách HSTS preload của trình duyệt, nên `pages.dev` luôn HTTPS.
- GitHub Pages (bản cũ `nvtthai2802.github.io/benoc-pos`) không cho đặt header.

## What's at risk

Clickjacking trang Quản lý; không có lớp CSP chặn XSS.

## What's already secure

Không có `eval`; mọi chỗ ghi HTML đều `esc()`.

## Recommendations

1. Thêm `_headers` (đã làm): XFO SAMEORIGIN, nosniff, Referrer-Policy, HSTS, Permissions-Policy, CSP **Report-Only**.
2. Sau khi Console không còn báo vi phạm CSP, đổi sang `Content-Security-Policy` thật.
3. Dừng bản GitHub Pages nếu không còn dùng (nó trỏ vào cùng database Product nhưng không có header).
