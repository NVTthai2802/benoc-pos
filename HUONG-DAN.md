# Bé Nốc POS — hướng dẫn cài đặt

Hệ thống gồm 4 trang web, chạy trên mọi điện thoại, máy tính bảng, laptop. Không cần cài app.

| Trang | Ai dùng | Thiết bị |
|---|---|---|
| `index.html` | Khách quét QR gọi món | Điện thoại của khách |
| `bep.html` | Bếp nóng: nhận đơn cơm, mì, kimbap, đồ ăn vặt, nước uống (sữa đậu, trà quất...), báo thời gian chờ, ra món, thu tiền | Máy tính bảng / điện thoại ở bếp |
| `phache.html` | Quầy pha chế: nhận đơn trà sữa, trà hoa quả, cà phê, matcha..., báo thời gian chờ, ra món, thu tiền | Máy tính bảng / điện thoại ở quầy pha chế |
| `quanly.html` | Chủ quán: doanh thu, menu, nhân viên, chấm công, cài đặt. Nhân viên: chấm công | Điện thoại |

Khi `config.js` để trống, cả 4 trang chạy ở **chế độ xem thử**: dữ liệu lưu trong trình duyệt, chỉ để thử giao diện.

## Hai mã QR, hai menu

- **Mã QR bếp nóng** mở menu **Ăn vặt** (cơm trộn, mì trộn, kimbap, đồ ăn vặt, nước uống). Đơn về màn hình bếp, bếp thu tiền.
- **Mã QR quầy pha chế** mở menu **Trà · Cà phê** (trà sữa, trà hoa quả, sốt khoai môn tươi, cà phê, matcha · cacao · khoai môn, món nên thử). Đơn về màn hình pha chế, quầy pha chế thu tiền.
- Mỗi menu có nút nhỏ **Xem menu …** để khách sang menu kia. Giỏ hàng hai menu tách riêng, nên mỗi lần gửi là một đơn cho một quầy. Khách dùng chung một số thẻ cho cả hai đơn.
- Món nào thuộc menu nào là theo **danh mục**. Đổi trong **Quản lý → Menu → Danh mục → Thuộc menu nào**.

## Hai môi trường: Product và Test

| | Product (quán dùng thật) | Test (thử tính năng mới) |
|---|---|---|
| Trang | https://benoc-pos.pages.dev/ | https://benoc-pos.pages.dev/test/ |
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

Đang chạy trên **Cloudflare Pages** (miễn phí, được dùng cho kinh doanh): https://benoc-pos.pages.dev/

- Cloudflare tự lấy code từ nhánh `main` trên GitHub mỗi khi có thay đổi, khoảng 1 phút là cập nhật.
- Các link phụ Cloudflare tự tạo (dạng `xxxx.benoc-pos.pages.dev`) luôn dùng Supabase **test**, không đụng dữ liệu quán.
- Bản cũ trên GitHub Pages (`nvtthai2802.github.io/benoc-pos`) vẫn chạy song song; tắt trong GitHub → Settings → Pages khi không cần nữa.

Trang phải chạy qua `https://` thì điện thoại mới cho chụp ảnh chấm công.

## 3. Cài đặt lần đầu

1. Mở `quanly.html`. Lần đầu sẽ hiện **Cài đặt lần đầu**: nhập tên, số điện thoại, mật khẩu để tạo tài khoản chủ quán.
2. Vào **Nhân viên → Thêm nhân viên** cho từng người: họ tên, số điện thoại, lương/giờ, mật khẩu. Đưa số điện thoại + mật khẩu cho nhân viên.
3. Tạo thêm hai tài khoản dùng chung: vai trò **Máy bếp** cho máy ở bếp, vai trò **Máy pha chế** cho máy ở quầy pha chế. Đăng nhập tài khoản nào thì trang tự mở đúng màn hình.
4. Vào **Cài đặt**: chọn cách tính lương, số đơn bếp và số đơn quầy pha chế làm cùng lúc (dùng để ước tính thời gian chờ).
5. Cũng trong **Cài đặt** có **hai mã QR**. Chụp lại hoặc in ra: mã bếp nóng dán ở khu bếp, mã quầy pha chế dán ở quầy pha chế.

## 4. Dùng hằng ngày

- **Máy bếp**: mở `bep.html`, đăng nhập tài khoản máy bếp, bấm **Bật chuông báo** (trình duyệt chỉ cho phát âm thanh sau khi bấm). Nên chọn "Thêm vào màn hình chính" để mở như app.
- **Máy pha chế**: mở `phache.html`, đăng nhập tài khoản máy pha chế, cũng bấm **Bật chuông báo**.
- **Ăn tại quán / Mang về**: khách chọn trước khi chọn món. Ăn tại quán thì nhập số trên thẻ và tên; mang về thì chỉ cần tên. Trên màn hình bếp và pha chế, đơn mang về có ô **MANG VỀ** màu vàng thay cho số thẻ. Món xong thì gọi tên khách ra quầy nhận.
- Mỗi màn hình có 3 cột: **Chờ nhận → Đang làm → Chờ thanh toán**. Bấm **Nhận đơn** (chọn số phút chờ, có gợi ý sẵn), làm xong bấm **Ra món**, khách trả tiền thì bấm **Thu tiền** (có tính tiền thối).
- **Khách trả tiền trước**: bấm **Thu tiền** ngay trên thẻ đơn ở cột nào cũng được. Thẻ hiện **Đã thu …**, đơn vẫn làm tiếp; ra món xong đơn tự hoàn tất, không phải thu lại. Khách cũng thấy "Đã thanh toán trước" trên điện thoại.
- **Sửa đơn sau khi đã nhận**: bấm **Sửa đơn** trên thẻ → **−/+** để đổi số lượng (bấm **×** để bỏ món), **+ Thêm món** để chọn món và tuỳ chọn. Bếp và pha chế sửa món của mình, chủ quán sửa được cả đơn. Món thêm sau có nhãn **MỚI**. Nếu đơn đã thu tiền mà sửa làm đổi tổng, thẻ hiện **thu thêm** hoặc **trả lại** bao nhiêu.
- **Đơn giao hàng (khách nhắn Facebook)**: chủ quán bấm **+ Đơn giao hàng** (trang Quản lý hoặc màn hình bếp) → tích món như khách → **Xem giỏ** → nhập tên, địa chỉ, giờ giao, tích **Khách đã chuyển khoản** nếu đã nhận tiền → **Tạo đơn giao hàng**. Đơn hiện trên bếp và pha chế với ô **GIAO hh:mm** màu xanh ngọc và địa chỉ. Cần đăng nhập tài khoản chủ quán hoặc nhân viên.
- **Doanh thu** có bảng **Tiền theo quầy**: mỗi quầy thu bao nhiêu tiền mặt, bao nhiêu chuyển khoản, để cuối ngày đối chiếu két.
- **Nhân viên**: mở `quanly.html` trên điện thoại mình → **Chấm công** → chụp ảnh vào ca, cuối ca chụp ảnh ra ca.
- **Hết món**: **Menu** → gạt công tắc **Đang bán** sang **Hết món**. Món biến mất khỏi menu khách trong vài giây (không cần tải lại trang); khách nào đã bỏ món đó vào giỏ sẽ được báo và món tự bỏ khỏi giỏ.
- **Đổi ảnh món**: **Menu** → bấm món → **Chọn ảnh** → **Lưu**.
- **Tuỳ chọn món** (upsize, chọn kem, topping…): **Menu → Tuỳ chọn**, chia hai khung Đồ uống và Đồ ăn. Khi sửa món, tuỳ chọn hợp với món hiện trước, loại kia thu gọn bên dưới.

## Lưu ý

- Đổi mật khẩu nhân viên: Supabase → **Authentication → Users** → chọn người → đặt lại mật khẩu.
- Dự án Supabase miễn phí tự tạm dừng nếu một tuần không ai dùng; quán mở hằng ngày thì không bị.
- Đơn của khách bị xoá khi thanh toán xong; doanh thu được giữ ở bảng tóm tắt hoá đơn (không giữ tên, số điện thoại khách).
- Ảnh chấm công lưu riêng tư, chỉ chủ quán và chính nhân viên đó xem được.
- Thời gian chờ gợi ý càng dùng càng sát: hệ thống lấy trung bình thời gian làm thực tế 14 ngày gần nhất của từng quầy.

## Nâng cấp bản đã cài

Chạy trong Supabase → **SQL Editor** → dán toàn bộ file → **Run**. Chạy ở Supabase **test** trước, ổn rồi mới chạy ở **product**. Chạy lại lần hai cũng không sao.

- `sql/cap-nhat-2-quay-pha-che.sql`: tách bếp nóng / quầy pha chế (đã chạy ở cả hai bên). Đơn đang mở lúc cập nhật được tính là của bếp.
- `sql/cap-nhat-3-bo-kho-hang.sql`: bỏ hẳn phần kho hàng (bảng hàng hoá, phiếu nhập, lịch sử kho). Nếu kho còn hàng thì file tự dừng, không xoá gì.
- `sql/cap-nhat-4-tuy-chon-do-uong-do-an.sql`: chia nhóm tuỳ chọn thành **Đồ uống** / **Đồ ăn**; gộp size thành **Upsize (+5k)** và **Upsize (+10k)** (bỏ Size M/L, Size to). Giá các món không đổi.
- `sql/cap-nhat-5-topping-duong-da.sql`: thêm nhóm **Topping đồ uống** (7 loại, mỗi loại +5.000đ), **Lượng đường** và **Lượng đá** (mặc định bình thường). Trang khách hiện đường, đá thành 3 ô có hình. Chỉ thêm, không xoá gì.
- `sql/cap-nhat-6-mang-ve.sql`: thêm **đơn mang về**. Khách chọn Ăn tại quán (nhập số thẻ như cũ) hoặc Mang về (chỉ cần tên). Chạy file này **trước** khi đưa giao diện mới lên.
- `sql/cap-nhat-7-trang-thai-tuc-thi.sql`: khách thấy trạng thái đơn **ngay** khi bếp/pha chế bấm (trước đây trễ tới 15 giây). Chỉ thêm hàm và trigger.
- `sql/cap-nhat-8-giao-hang-thu-truoc-sua-don.sql`: **đơn giao hàng** do chủ quán tạo, **thu tiền trước**, **sửa đơn** sau khi đã nhận, và báo **hết món** tức thì cho khách. Chạy file này **trước** khi đưa giao diện mới lên.

## Xoá dữ liệu thử trước khi dùng thật

`sql/xoa-du-lieu-test.sql`: phần 1 xoá đơn, doanh thu, ca làm; giữ menu. Phần 2 (bỏ dấu `--` mới chạy) xoá luôn mọi tài khoản để tạo lại từ đầu.
