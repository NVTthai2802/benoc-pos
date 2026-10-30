# SECRETS_EXPOSURE Fix Plan

## Changes

- (tuỳ chọn) chuyển file web vào thư mục riêng và đổi Build output directory trên Cloudflare Pages.

## New files

- (không)

## Verification goals

- [x] Không có secret trong mã / lịch sử git
- [x] Chỉ có anon key ở frontend
- [x] `/.env`, `/.git/config` và các file dump không truy cập được (vibe-check live: PASS)

## Manual verification (for the human)

- Mở `https://benoc-pos.pages.dev/.env`, `/.git/config` → phải là 404.
