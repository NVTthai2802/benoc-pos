# Bé Nốc POS

Gọi món qua QR, màn hình bếp nóng, màn hình quầy pha chế và quản lý quán (menu, nhân viên, chấm công, doanh thu).

- `index.html` — khách gọi món. `?menu=an` là menu Ăn vặt (mã QR bếp nóng), `?menu=tra` là menu Trà · Cà phê (mã QR quầy pha chế)
- `bep.html` — màn hình bếp nóng (nhận đơn món ăn và nước uống của bếp, ra món, thu tiền đơn của bếp)
- `phache.html` — màn hình quầy pha chế (nhận đơn trà, cà phê, ra món, thu tiền đơn của quầy)
- `kitchen.js`, `kitchen.css` — mã dùng chung của hai màn hình trên
- `quanly.html` — quản lý / chấm công
- `sql/` — cơ sở dữ liệu Supabase (`schema.sql` rồi `seed_menu.sql`; các file `cap-nhat-*.sql` để nâng cấp bản đã cài; `xoa-du-lieu-test.sql` để dọn dữ liệu thử)
- `public/` — tệp tĩnh chép nguyên lên web: ảnh món (`img/`), tiếng chuông (`sound/`), APK (`app/`), thư viện quét mã (`lib/`), CSS, `_headers`
- Đóng gói bằng **Vite** (`npm ci && npm run build` → thư mục `dist/`). Cloudflare Pages tự chạy lệnh này mỗi lần đẩy code.
  JS được nén, gắn mã băm vào tên tệp; supabase-js đóng gói cùng trang (không tải từ CDN nữa).
  Chạy thử trên máy: `npm ci && npm run dev`.
- Quy trình: làm trên nhánh riêng → Cloudflare tạo link xem trước `<nhánh>.benoc-pos.pages.dev` (dùng dữ liệu quán thật, có dải BẢN XEM TRƯỚC) → ổn thì gộp vào `main` (Product).
  Môi trường Test và thư mục `test/` đã bỏ (11/2026).
- `HUONG-DAN.md` — hướng dẫn cài đặt, gồm cách dùng hai môi trường
- `HUONG-DAN-PHIM-TAT-IPHONE.md` — lên đơn bằng Phím tắt iPhone (gõ lưng máy chụp màn hình chat)
- `HUONG-DAN-APP-ANDROID.md` — app Android (APK): POS + nút nổi chụp đơn. Tải: https://benoc-pos.pages.dev/app/benoc-pos.apk. Mã nguồn `android/`
- `tools/ocr/` — OCR trên máy (PP-OCRv5 mobile, chế độ TEST của app Android): pipeline Python tham chiếu, sinh ảnh chat giả lập, đo CER. Kết quả lưu bảng `ocr_mau` (cập nhật 34, chỉ Supabase Test)
