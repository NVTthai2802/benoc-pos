# SECURITY_HEADERS Fix Plan

## Changes

- `_headers` (mới) — header bảo mật cho mọi đường dẫn trên Cloudflare Pages.

## New files

- `_headers`

## Verification goals

- [x] File `_headers` có đủ 5 header + CSP có `default-src`, `object-src 'none'`, `base-uri`, `form-action`, `frame-ancestors`
- [ ] Sau khi deploy: `curl -sI https://benoc-pos.pages.dev/quanly.html` thấy đủ header
- [ ] Console không có vi phạm CSP rồi mới bật CSP thật (còn `'unsafe-inline'` cho script vì các trang có `<script>` viết trong HTML)

## Manual verification (for the human)

- Deploy, chạy lại `vibe-check` (`check.py https://benoc-pos.pages.dev/`).
- Mở index / bếp / pha chế / quản lý, xem Console có cảnh báo CSP không; thử camera chấm công, quét mã vạch, máy in Bluetooth, khung mở trang khác trên màn bếp.
