# Security Audit Summary

Date: 2026-10-30 · Phạm vi: mã nguồn nhánh `main` (commit `07e3652`), toàn bộ lịch sử git, `sql/schema.sql`, edge function `bot-don`.

## Live scan

Quét `https://benoc-pos.pages.dev/` (Product) ngày 2026-10-30, trước khi deploy bản sửa:

```bash
python3 check.py https://benoc-pos.pages.dev/ --api https://hixdacnaxfuxuccbajzn.supabase.co/functions/v1/bot-don
```

| | Trước (bản đang chạy) | Sau |
|---|---|---|
| FAIL | 3: thiếu CSP, thiếu chống nhúng khung (XFO / frame-ancestors), thiếu HSTS | chưa quét (cần deploy `_headers`) |
| WARN | 3: HSTS thiếu ở file tĩnh, `Access-Control-Allow-Origin: *` ở trang và file tĩnh (Cloudflare tự thêm) | chưa quét |
| PASS | 13: không lộ `.env` / `.git` / dump, không liệt kê thư mục, không có source map, có `nosniff` + `Referrer-Policy`, không có trang debug, function `bot-don` không mở CORS cho web lạ | |

Kiểm tra live thêm (chỉ đọc, bằng anon key Product):

- `GET /rest/v1/orders`, `employees`, `sales` → `[]`: RLS chặn đúng.
- `POST /rest/v1/rpc/suggest_wait_minutes` bằng anon → trả `10`: **xác nhận lỗi quyền chạy hàm đang có trên Product** (cập nhật 30 sửa). Không thử `refresh_order_status` vì hàm đó ghi dữ liệu.
- `GET /auth/v1/settings` → `disable_signup: false`, `mailer_autoconfirm: true`: **xác nhận ai cũng tự đăng ký được tài khoản** (xem AUTH_MIDDLEWARE).
- `https://benoc-pos.pages.dev/sql/schema.sql`, `/supabase/functions/bot-don/index.ts`, `/HUONG-DAN.md` → 200: mã database và bot đang công khai (xem SECRETS_EXPOSURE). `security/` chưa có trên Product (đường dẫn lạ trả về trang chủ).

## Cách kiểm chứng phần database

Dựng Postgres 16 + giả lập Supabase (role `anon` / `authenticated` / `service_role`, `auth.uid()`, `storage.objects`, quyền mặc định của Supabase), nạp `schema.sql` + `seed_menu.sql`, rồi thử từng vai trò **trước** và **sau** cập nhật 30. Kết quả nằm trong các report DATABASE_ACCESS và RATE_LIMITING.

## Results

| # | Category | Status | Report | Plan |
|---|----------|--------|--------|------|
| 1 | SECRETS_EXPOSURE | LOW | [report](reports/SECRETS_EXPOSURE_REPORT.md) | [plan](plans/SECRETS_EXPOSURE_PLAN.md) |
| 2 | DATABASE_ACCESS | MEDIUM | [report](reports/DATABASE_ACCESS_REPORT.md) | [plan](plans/DATABASE_ACCESS_PLAN.md) |
| 3 | AUTH_MIDDLEWARE | MEDIUM | [report](reports/AUTH_MIDDLEWARE_REPORT.md) | [plan](plans/AUTH_MIDDLEWARE_PLAN.md) |
| 4 | ACCESS_CONTROL | PASS | [report](reports/ACCESS_CONTROL_REPORT.md) | — |
| 5 | FRONTEND_SECRETS | LOW | [report](reports/FRONTEND_SECRETS_REPORT.md) | [plan](plans/FRONTEND_SECRETS_PLAN.md) |
| 6 | SSRF | LOW | [report](reports/SSRF_REPORT.md) | — |
| 7 | CSRF | PASS | [report](reports/CSRF_REPORT.md) | — |
| 8 | SECURITY_HEADERS | MEDIUM | [report](reports/SECURITY_HEADERS_REPORT.md) | [plan](plans/SECURITY_HEADERS_PLAN.md) |
| 9 | CORS | LOW | [report](reports/CORS_REPORT.md) | — |
| 10 | RATE_LIMITING | MEDIUM | [report](reports/RATE_LIMITING_REPORT.md) | [plan](plans/RATE_LIMITING_PLAN.md) |
| 11 | SQL_INJECTION | PASS | [report](reports/SQL_INJECTION_REPORT.md) | — |
| 12 | XSS | PASS | [report](reports/XSS_REPORT.md) | — |
| 13 | PAYMENT_WEBHOOKS | N/A | [report](reports/PAYMENT_WEBHOOKS_REPORT.md) | — |
| 14 | FILE_UPLOADS | LOW | [report](reports/FILE_UPLOADS_REPORT.md) | — |
| 15 | ERROR_HANDLING | LOW | [report](reports/ERROR_HANDLING_REPORT.md) | — |
| 16 | PASSWORD_HASHING | N/A | [report](reports/PASSWORD_HASHING_REPORT.md) | — |
| 17 | DEPENDENCIES | LOW | [report](reports/DEPENDENCIES_REPORT.md) | — |

Không có mục CRITICAL / HIGH. RLS bật ở mọi bảng, không lộ secret, không thấy XSS / SQLi.

## Đã sửa trong nhánh này (chưa áp dụng lên Supabase / chưa deploy)

1. `sql/cap-nhat-30-bao-mat.sql` (+ gộp vào `sql/schema.sql`, ghi chú trong `HUONG-DAN.md`):
   - anon chỉ chạy được đúng các hàm của trang gọi món; hàm tạo mới không tự mở cho anon;
   - `suggest_wait_minutes` chỉ cho nhân viên; `refresh_order_status` không gọi trực tiếp được nữa;
   - chỉ nhân viên mới tải được ảnh chấm công;
   - chống dò mã kết nối bot (5 lần sai / 10 phút / tài khoản, 30 lần / 10 phút toàn quán).
2. `_headers`: X-Frame-Options, nosniff, Referrer-Policy, HSTS, Permissions-Policy, CSP ở chế độ Report-Only; bỏ `Access-Control-Allow-Origin: *` mặc định của Cloudflare.

## Critical issues

Không có.

## Việc nên làm tiếp (theo thứ tự)

1. Chạy `sql/cap-nhat-30-bao-mat.sql` trên **Test**, thử đủ luồng, rồi chạy trên **Product**.
2. Đưa `_headers` lên (test → product), chạy lại live scan, xem Console có báo CSP không, rồi bật CSP thật.
3. **Lưu ý khi đưa lên Product:** `security/` sẽ bị xuất bản công khai như `sql/` (Cloudflare xuất bản cả thư mục gốc). Bỏ `security/` ra trước khi chạy `scripts/dua-len-product.sh`, hoặc chỉ giữ nó trên nhánh này.
4. Bật CAPTCHA (Turnstile) và mật khẩu tối thiểu 8 trong Supabase Auth.
5. Chuyển việc tạo nhân viên sang edge function và **tắt đăng ký công khai** (hết chiếm trước SĐT, hết tài khoản rác).
6. Giới hạn số đơn / độ dài chữ trong `place_order`, `call_staff` để chống bắn đơn giả lên màn bếp.
7. SRI hoặc tải về `lib/` cho thư viện CDN; ghim bản `supabase-js` trong edge function; đặt giới hạn kích thước / loại file cho bucket.

## Remaining manual verification

- Chạy cập nhật 30 trên Test rồi thử: khách gọi món, xem trạng thái, gọi nhân viên, mã QR; bếp / pha chế nhận đơn, gợi ý phút, ra món, thu tiền; quản lý chấm công có ảnh, kho, ưu đãi, đơn online, lấy mã bot + kết nối bot.
- Nhắn sai mã cho bot 5 lần → lần 6 đúng vẫn bị từ chối; sau 10 phút dùng lại được.
- Sau deploy: `/.env`, `/.git/config` trả 404; `curl -sI https://benoc-pos.pages.dev/quanly.html` có đủ header; Console không có vi phạm CSP.
- Session cookie: không áp dụng (Supabase dùng localStorage).
