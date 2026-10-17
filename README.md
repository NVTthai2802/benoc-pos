# Bé Nốc POS

Gọi món qua QR, màn hình bếp và quản lý quán (menu, kho, nhân viên, chấm công, doanh thu).

- `index.html` — khách gọi món (mã QR trỏ vào đây)
- `bep.html` — màn hình bếp nóng (nhận đơn món ăn, ra món, thu tiền)
- `phache.html` — màn hình quầy pha chế (nhận đơn đồ uống pha chế, ra món)
- `quanly.html` — quản lý / chấm công
- `board.js`, `board.css` — mã dùng chung của màn bếp và màn pha chế
- `sql/` — cơ sở dữ liệu Supabase (`schema.sql` rồi `seed_menu.sql`; các file `cap-nhat-*.sql` để nâng cấp bản cũ)
- `HUONG-DAN.md` — hướng dẫn cài đặt
