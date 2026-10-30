# FILE_UPLOADS Security Report

## Status: LOW

## Findings

- Ảnh chấm công (`checkin-photos`, riêng tư): trước đây tài khoản tự đăng ký cũng tải lên được → **đã sửa** (đòi là nhân viên).
- Ảnh món (`menu-images`, công khai): chỉ chủ quán tải / sửa / xoá.
- Ảnh đơn (`don-anh`, riêng tư): bot tải lên bằng service key; kiểm tra content-type / magic bytes, tối đa 8MB.
- Các bucket **không đặt** `file_size_limit` và `allowed_mime_types`, nên người có quyền tải lên tải được file bất kỳ, kích thước bất kỳ (tới giới hạn chung của project).
- File lưu trên tên miền Supabase, tách khỏi trang web.

## What's at risk

Dùng bucket để chứa file lạ (đã chặn với tài khoản lạ).

## What's already secure

Bucket riêng tư cho ảnh nhạy cảm; đường dẫn theo uid.

## Recommendations

Đặt giới hạn bucket: `update storage.buckets set file_size_limit = 5242880, allowed_mime_types = '{image/jpeg,image/png,image/webp}' where id in ('checkin-photos','menu-images','don-anh');` (kiểm tra ảnh trang Quản lý nén về JPEG trước).
