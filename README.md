# Bé Nốc POS

Gọi món qua QR, màn hình bếp nóng, màn hình quầy pha chế và quản lý quán (menu, kho, nhân viên, chấm công, doanh thu).

- `index.html` — khách gọi món. `?menu=an` là menu Ăn vặt (mã QR bếp nóng), `?menu=tra` là menu Trà · Cà phê (mã QR quầy pha chế)
- `bep.html` — màn hình bếp nóng (nhận đơn món ăn và nước uống của bếp, ra món, thu tiền đơn của bếp)
- `phache.html` — màn hình quầy pha chế (nhận đơn trà, cà phê, ra món, thu tiền đơn của quầy)
- `kitchen.js`, `kitchen.css` — mã dùng chung của hai màn hình trên
- `quanly.html` — quản lý / chấm công
- `sql/` — cơ sở dữ liệu Supabase (`schema.sql` rồi `seed_menu.sql`; các file `cap-nhat-*.sql` để nâng cấp bản đã cài; `xoa-du-lieu-test.sql` để dọn dữ liệu thử)
- `HUONG-DAN.md` — hướng dẫn cài đặt
