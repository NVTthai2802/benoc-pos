# Bé Nốc POS — hướng dẫn cài đặt

Hệ thống gồm 4 trang web, chạy trên mọi điện thoại, máy tính bảng, laptop. Không cần cài app.

| Trang | Ai dùng | Thiết bị |
|---|---|---|
| `index.html` | Khách quét QR gọi món | Điện thoại của khách |
| `bep.html` | Bếp nóng: nhận đơn cơm, mì, kimbap, đồ ăn vặt, nước uống (sữa đậu, trà quất...), báo thời gian chờ, ra món, thu tiền | Máy tính bảng / điện thoại ở bếp |
| `phache.html` | Quầy pha chế: nhận đơn trà sữa, trà hoa quả, cà phê, matcha..., báo thời gian chờ, ra món, thu tiền | Máy tính bảng / điện thoại ở quầy pha chế |
| `quanly.html` | Chủ quán: doanh thu, menu, kho, nhân viên, cài đặt. Nhân viên: chấm công, nhập hàng | Điện thoại |

Khi `config.js` để trống, cả 4 trang chạy ở **chế độ xem thử**: dữ liệu lưu trong trình duyệt, chỉ để thử giao diện.

## Hai mã QR, hai menu

- **Mã QR bếp nóng** mở menu **Ăn vặt** (cơm trộn, mì trộn, kimbap, đồ ăn vặt, nước uống). Đơn về màn hình bếp, bếp thu tiền.
- **Mã QR quầy pha chế** mở menu **Trà · Cà phê** (trà sữa, trà hoa quả, sốt khoai môn tươi, cà phê, matcha · cacao · khoai môn, món nên thử). Đơn về màn hình pha chế, quầy pha chế thu tiền.
- Mỗi menu có nút nhỏ **Xem menu …** để khách sang menu kia. Giỏ hàng hai menu tách riêng, nên mỗi lần gửi là một đơn cho một quầy. Khách dùng chung một số thẻ cho cả hai đơn.
- Món nào thuộc menu nào là theo **danh mục**. Đổi trong **Quản lý → Menu → Danh mục → Thuộc menu nào**.

## Hai môi trường: Product và Test

| | Product (quán dùng thật) | Test (thử tính năng mới) |
|---|---|---|
| Trang | https://nvtthai2802.github.io/benoc-pos/ | https://nvtthai2802.github.io/benoc-pos/test/ |
| Cơ sở dữ liệu | Supabase **benoc-pos** | Supabase **benoc-pos-test** |
| Tài khoản, đơn, doanh thu | thật | riêng, thử thoải mái |

- Trang test có dải vàng đen **MÔI TRƯỜNG TEST** ở trên cùng. Mã QR trong Cài đặt của trang test trỏ về trang test, **đừng in mã này dán ở quán**.
- Tài khoản hai bên tách riêng: tạo chủ quán, máy bếp, máy pha chế ở mỗi bên.
- `config.js` chứa cấu hình cả hai bên; trang nằm trong thư mục `test/` thì tự dùng Supabase test.
- Quy trình sửa: làm trên nhánh `test` → `scripts/dua-len-test.sh` (lên trang test) → thử → nếu có `sql/cap-nhat-*.sql` mới thì chạy trên Supabase product → `scripts/dua-len-product.sh` (lên quán).
- File SQL cập nhật luôn chạy trên Supabase **test trước**, ổn rồi mới chạy trên product.

## 1. Tạo cơ sở dữ liệu Supabase (miễn phí)

1. Vào https://supabase.com, đăng ký, bấm **New project**. Chọn vùng **Southeast Asia (Singapore)** cho nhanh.
2. Vào **Authentication → Sign In / Providers → Email**, **tắt "Confirm email"**. Nhân viên đăng nhập bằng số điện thoại, hệ thống tự đổi thành dạng `0912345678@benoc.app` nên không có email thật để xác nhận.
3. Vào **SQL Editor**, dán toàn bộ `sql/schema.sql`, bấm **Run**. Sau đó dán `sql/seed_menu.sql`, bấm **Run** (nạp menu Bé Nốc, 81 món, đủ size/topping/ảnh).
4. Vào **Project Settings → API**, chép **Project URL** và **anon public key** vào `config.js`.

## 2. Đưa trang lên mạng (miễn phí)

Đang chạy trên GitHub Pages: https://nvtthai2802.github.io/benoc-pos/

Trang phải chạy qua `https://` thì điện thoại mới cho chụp ảnh chấm công và quét mã vạch.

## 3. Cài đặt lần đầu

1. Mở `quanly.html`. Lần đầu sẽ hiện **Cài đặt lần đầu**: nhập tên, số điện thoại, mật khẩu để tạo tài khoản chủ quán.
2. Vào **Nhân viên → Thêm nhân viên** cho từng người: họ tên, số điện thoại, lương/giờ, mật khẩu. Đưa số điện thoại + mật khẩu cho nhân viên.
3. Tạo thêm hai tài khoản dùng chung: vai trò **Máy bếp** cho máy ở bếp, vai trò **Máy pha chế** cho máy ở quầy pha chế. Đăng nhập tài khoản nào thì trang tự mở đúng màn hình.
4. Vào **Cài đặt**: chọn cách tính lương, số đơn bếp và số đơn quầy pha chế làm cùng lúc (dùng để ước tính thời gian chờ).
5. Cũng trong **Cài đặt** có **hai mã QR**. Chụp lại hoặc in ra: mã bếp nóng dán ở khu bếp, mã quầy pha chế dán ở quầy pha chế.

## 4. Dùng hằng ngày

- **Máy bếp**: mở `bep.html`, đăng nhập tài khoản máy bếp, bấm **Bật chuông báo** (trình duyệt chỉ cho phát âm thanh sau khi bấm). Nên chọn "Thêm vào màn hình chính" để mở như app.
- **Máy pha chế**: mở `phache.html`, đăng nhập tài khoản máy pha chế, cũng bấm **Bật chuông báo**.
- Mỗi màn hình có 3 cột: **Chờ nhận → Đang làm → Chờ thanh toán**. Bấm **Nhận đơn** (chọn số phút chờ, có gợi ý sẵn), làm xong bấm **Ra món**, khách trả tiền thì bấm **Thu tiền** (có tính tiền thối).
- **Doanh thu** có bảng **Tiền theo quầy**: mỗi quầy thu bao nhiêu tiền mặt, bao nhiêu chuyển khoản, để cuối ngày đối chiếu két.
- **Nhân viên**: mở `quanly.html` trên điện thoại mình → **Chấm công** → chụp ảnh vào ca, cuối ca chụp ảnh ra ca.
- **Hàng về**: **Kho hàng → Nhập hàng** → chụp mã vạch. Hàng mới thì nhập tên một lần, lần sau chụp là ra.
- **Hết món**: **Menu** → gạt công tắc **Đang bán** sang **Hết món**, khách sẽ không thấy món đó.
- **Đổi ảnh món**: **Menu** → bấm món → **Chọn ảnh** → **Lưu**.

## Lưu ý

- Đổi mật khẩu nhân viên: Supabase → **Authentication → Users** → chọn người → đặt lại mật khẩu.
- Dự án Supabase miễn phí tự tạm dừng nếu một tuần không ai dùng; quán mở hằng ngày thì không bị.
- Đơn của khách bị xoá khi thanh toán xong; doanh thu được giữ ở bảng tóm tắt hoá đơn (không giữ tên, số điện thoại khách).
- Ảnh chấm công lưu riêng tư, chỉ chủ quán và chính nhân viên đó xem được.
- Thời gian chờ gợi ý càng dùng càng sát: hệ thống lấy trung bình thời gian làm thực tế 14 ngày gần nhất của từng quầy.

## Nâng cấp bản đã cài (trước 17/10/2026)

Chạy file này một lần trong Supabase → **SQL Editor** → dán toàn bộ `sql/cap-nhat-2-quay-pha-che.sql` → **Run**. File không làm mất dữ liệu, chạy lại lần hai cũng không sao. Đơn đang mở lúc cập nhật được tính là của bếp.

## Xoá dữ liệu thử trước khi dùng thật

`sql/xoa-du-lieu-test.sql`: phần 1 xoá đơn, doanh thu, ca làm, kho; giữ menu. Phần 2 (bỏ dấu `--` mới chạy) xoá luôn mọi tài khoản để tạo lại từ đầu.
