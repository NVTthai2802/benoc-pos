# CSRF Security Report

## Status: PASS

## Findings

Supabase lưu phiên trong `localStorage` và gửi bằng header `Authorization: Bearer`. Không dùng cookie đăng nhập, nên trang khác không gửi request thay người dùng được. Không có GET nào đổi dữ liệu (edge function GET chỉ trả chữ “đang chạy”).

## What's at risk

Không có.

## What's already secure

Như trên.

## Recommendations

Không cần sửa.
