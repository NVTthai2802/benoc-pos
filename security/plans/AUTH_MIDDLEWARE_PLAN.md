# AUTH_MIDDLEWARE Fix Plan

## Changes

- `sql/cap-nhat-30-bao-mat.sql` — đã làm (xem DATABASE_ACCESS).
- (Đề xuất) edge function mới `tao-nhan-vien` + sửa `core.js` `saveEmployee` gọi function đó; tắt sign-up.

## New files

- `sql/cap-nhat-30-bao-mat.sql`

## Verification goals

- [x] Hàm nhân viên gọi bằng tài khoản lạ → FORBIDDEN / permission denied
- [ ] Tắt sign-up mà chủ quán vẫn tạo được nhân viên (chưa làm)

## Manual verification (for the human)

- Sau khi làm bước 2: thử tạo nhân viên trong Quản lý; thử `signUp` bằng anon key phải bị từ chối.
