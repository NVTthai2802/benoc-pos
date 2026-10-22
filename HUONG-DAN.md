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
- Quét mã nào chỉ xem được menu đó (quét món ăn chỉ thấy món ăn, không có nút sang menu kia). Khách muốn gọi cả đồ uống thì quét thêm mã QR quầy pha chế; hai đơn dùng chung một số thẻ.
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
- **Tiếng chuông khi có đơn mới**: chuông 2 nốt (bếp và pha chế khác giai điệu) rồi giọng đọc **"Bé Nốc ơi, bé Nốc ơi"** (file `sound/be-noc.mp3`, tạo bằng giọng đọc tiếng Việt của Google). Khách gọi nhân viên thì chỉ kêu chuông, không có giọng. Muốn đổi giọng khác, thay file `sound/be-noc.mp3` bằng file mp3 mới cùng tên. Nhớ tăng âm lượng và tắt chế độ im lặng trên điện thoại.
- **Ăn tại quán / Mang về**: khách chọn trước khi chọn món. Ăn tại quán thì nhập số trên thẻ, tên và số điện thoại; mang về thì nhập tên và số điện thoại. Số điện thoại bắt buộc (10 số) để quán liên hệ khi có việc. Trên màn hình bếp và pha chế, đơn mang về có ô **MANG VỀ** màu vàng thay cho số thẻ. Món xong thì gọi tên khách ra quầy nhận.
- Mỗi màn hình có 3 cột: **Chờ nhận → Đang làm → Chờ thanh toán**. Bấm **Nhận đơn** (chọn số phút chờ, có gợi ý sẵn), làm xong bấm **Ra món**, khách trả tiền thì bấm **Thu tiền** (có tính tiền thối).
- **Khách trả tiền trước**: bấm **Thu tiền** ngay trên thẻ đơn ở cột nào cũng được. Thẻ hiện **Đã thu …**, đơn vẫn làm tiếp; ra món xong đơn tự hoàn tất, không phải thu lại. Khách cũng thấy "Đã thanh toán trước" trên điện thoại.
- **Xem chi tiết đơn**: bấm vào phần món trên thẻ đơn (hoặc dòng **Xem chi tiết đơn**) để xem toàn bộ đơn, gồm cả món của bếp và pha chế: size, đường, đá, topping, ghi chú và giá từng món.
- **Sửa đơn sau khi đã nhận**: bấm **Sửa đơn** trên thẻ → đổi **Ăn tại quán / Mang về** và **số bàn** rồi bấm **Lưu**; bấm **Tuỳ chọn** ở món đã có để thêm/bớt topping, đổi đường, đá, size (giá tự tính lại, món có nhãn **ĐÃ SỬA**); **−/+** để đổi số lượng (bấm **×** để bỏ món); **+ Thêm món** chỉ dùng khi khách gọi món mới. Bếp và pha chế sửa món của mình, chủ quán sửa được cả đơn. Món thêm sau có nhãn **MỚI**. Nếu đơn đã thu tiền mà sửa làm đổi tổng, thẻ hiện **thu thêm** hoặc **trả lại** bao nhiêu.
- **Đơn giao hàng (khách nhắn Facebook)**: chủ quán bấm **+ Đơn giao hàng** (trang Quản lý hoặc màn hình bếp) → chọn **Qua lấy** (khách tới quán lấy, chỉ cần tên) hoặc **Đơn đi ship** (cần địa chỉ, giờ giao) → tích món → **Xem giỏ** → nhập thông tin, tích **Khách đã chuyển khoản** nếu đã nhận tiền → tạo đơn. Đơn qua lấy hiện ô **MANG VỀ** trên bếp/pha chế; đơn đi ship hiện ô **GIAO hh:mm** màu xanh ngọc kèm địa chỉ. Cần đăng nhập tài khoản chủ quán hoặc nhân viên.
- **Doanh thu** có bảng **Tiền theo quầy**: mỗi quầy thu bao nhiêu tiền mặt, bao nhiêu chuyển khoản, để cuối ngày đối chiếu két.
- **Nhân viên**: mở `quanly.html` trên điện thoại mình → **Chấm công** → chụp ảnh vào ca, cuối ca chụp ảnh ra ca.
- **Tìm món**: menu khách có ô **Tìm món…** ngay trên thanh danh mục, chỉ tìm trong menu của mã QR đang mở (gõ không dấu cũng được, ví dụ "tra sua"). Trang Quản lý → Menu có ô tìm riêng cho **Món** và cho **Tuỳ chọn** (tìm được theo tên món đang dùng nhóm đó). Màn hình bếp/pha chế khi **+ Thêm món** vào đơn cũng có ô tìm.
- **Hết món**: **Menu** → gạt công tắc **Đang bán** sang **Hết món**. Món biến mất khỏi menu khách trong vài giây (không cần tải lại trang); khách nào đã bỏ món đó vào giỏ sẽ được báo và món tự bỏ khỏi giỏ.
- **Đổi ảnh món**: **Menu** → bấm món → **Chọn ảnh** → **Lưu**.
- **Ưu đãi (combo, mua X tặng Y)**: **Quản lý → Ưu đãi → + Tạo ưu đãi**.
  - **Combo giá ưu đãi**: tích các món trong combo (dùng ô tìm), chỉnh số lượng từng món bằng −/+, nhập **Giá combo**. Bên cạnh có giá gốc để so sánh.
  - **Mua X tặng Y**: nhập X, Y; tích các món được tính là món mua; tích các món được tặng, hoặc tích **Tặng đúng món khách mua** (ví dụ mua 1 ly trà sữa nào thì tặng 1 ly giống hệt).
  - **Topping, upsize có phí** trong combo / món tặng: chọn **Cộng thêm tiền**, **Miễn phí** hoặc **Không cho chọn**. Món mua trong mua X tặng Y luôn tính giá thường.
  - **Thời gian hiển thị**: từ ngày… đến ngày… (để trống là chạy luôn, không hết hạn), khung giờ mỗi ngày (ví dụ 14:00–17:00, để trống là cả ngày), các thứ trong tuần. Công tắc **Bật/Tắt** để dừng ngay. Danh sách ghi rõ ưu đãi **Đang hiện cho khách**, **Ngoài khung giờ**, **Chưa tới ngày** hay **Đã hết hạn**.
  - Khách thấy ưu đãi đang chạy ở **đầu menu** (ô màu nổi bật), bấm **Chọn ngay** để chọn đường, đá, topping cho từng món rồi thêm vào giỏ. Ưu đãi có món ăn hiện ở menu Ăn vặt, có đồ uống hiện ở menu Trà · Cà phê. Khách đã bỏ vào giỏ thì được giữ giá thêm 10 phút sau khi hết khung giờ.
  - Trên **bếp / pha chế**, món thuộc ưu đãi nằm dưới dòng **COMBO …** hoặc **ƯU ĐÃI …**, món được tặng có nhãn **TẶNG** màu cam, món mua có nhãn **MUA**. Combo có cả đồ ăn và đồ uống thì mỗi nơi thấy phần của mình. **Sửa đơn**: món thuộc ưu đãi không đổi số lượng được, chỉ có nút **Bỏ cả phần**.
  - **Doanh thu**: hoá đơn ghi tên ưu đãi, tiền của phần đó và món nào được tặng; có thêm bảng **Ưu đãi đã bán** (số lần, số món tặng, tiền thu).
  - Giá ưu đãi luôn tính ở máy chủ. Giá combo được chia vào từng món theo tỉ lệ giá gốc (để thống kê món bán chạy vẫn đúng), tổng luôn bằng đúng giá combo.
- **Kho hàng**: **Quản lý → Kho**. Chủ quán bấm **+ Thêm hàng**: đặt tên, nhóm, cách nhập và dùng (chọn nhanh *Thùng → gói*, *Thùng → can*, *Can*, *Bao → kg*… hoặc tự gõ, ví dụ 1 thùng = 24 gói), tồn hiện có, mức báo sắp hết, giá nhập.
  - Mỗi mặt hàng có nút **Nhập** (mặc định theo thùng, đổi sang gói được, máy gợi ý tiền theo giá nhập) và **Lấy dùng** (mặc định theo gói). Bấm tên hàng để **Kiểm kho** (đếm số thùng nguyên + số gói lẻ, máy tự tính chênh lệch), **Hỏng / mất**, xem lịch sử, sửa mặt hàng.
  - Tồn hiện dạng "2 thùng + 5 gói (53 gói)". Hàng còn ≤ mức báo nằm ở khung **Sắp hết · cần nhập thêm** trên cùng.
  - **Quy cách nhập hàng** (giống Tuỳ chọn của menu): Kho → **Quy cách nhập hàng** → tạo / sửa / xoá các quy cách dùng chung như *Thùng 24 gói*, *Thùng 4 can*, *Can*, *Két 24 chai*. Khi thêm hàng chỉ cần bấm chọn quy cách (hoặc **Tự đặt**). Sửa một quy cách thì mọi mặt hàng đang dùng nó đổi theo, số tồn giữ nguyên.
  - Nhân viên cũng mở được tab Kho để nhập hàng, lấy dùng, kiểm kho; chỉ chủ quán thêm/sửa/xoá mặt hàng và thấy tiền nhập (tổng tiền nhập tháng này hiện ở đầu trang).
- **Tuỳ chọn món** (size M/L, chọn kem, topping…): **Menu → Tuỳ chọn**, chia hai khung Đồ uống và Đồ ăn. Khi sửa món, tuỳ chọn hợp với món hiện trước, loại kia thu gọn bên dưới.

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
- `sql/cap-nhat-9-size-m-l.sql`: đồ uống có Upsize đổi thành chọn **Size M** (giá gốc, chọn sẵn) / **Size L** (+5k hoặc +10k như cũ). Menu khách hiện cả 2 giá "M 22K · L 32K", màn hình pha chế có nhãn **SIZE M / SIZE L** trên từng ly. Món không có Upsize giữ nguyên 1 giá. Giao diện mới chạy được cả trước và sau khi chạy file này.
- `sql/cap-nhat-10-ten-khach-hoa-don.sql`: **Hoá đơn gần đây** hiện tên khách (kèm SĐT, địa chỉ nếu đi ship). Chỉ thêm cột, không đụng dữ liệu cũ; hoá đơn trước bản này hiện "—" vì lúc đó chưa lưu tên.
- `sql/cap-nhat-11-size-chi-ca-phe-matcha.sql`: chỉ danh mục **Cà phê** và **Matcha · Cacao · Khoai môn** có chọn Size M / Size L; các đồ uống khác bỏ mục size, chỉ còn một giá. Chỉ gỡ liên kết món ↔ nhóm Size, không xoá món, không đổi giá.
- `sql/cap-nhat-12-sap-xep-size-upsize.sql`: sắp xếp lại size đồ uống: **Nước uống** (menu Ăn vặt) có tuỳ chọn **Size XL +5k**; **Trà sữa, Trà hoa quả, Sốt khoai môn tươi, Món nên thử, Cà phê, Matcha · Cacao · Khoai môn** size nhỏ nhất là L, tuỳ chọn **Upsize +10k**; **Sốt cốm tươi** tuỳ chọn **Upsize +15k**. Không xoá món, không đổi giá món, không đụng đơn/hoá đơn. (Thay cho cập nhật 9 và 11.)
- `sql/cap-nhat-13-uu-dai-combo-mua-tang.sql`: thêm **Ưu đãi** (combo giá ưu đãi, mua X tặng Y, hẹn giờ hiển thị). Chỉ thêm bảng/cột/hàm mới và cập nhật hàm đặt món, không xoá món, không đổi giá, không đụng đơn/hoá đơn cũ. Tự thêm cột tên khách trên hoá đơn nếu môi trường chưa chạy cập nhật 10. Chạy **trước** khi đưa giao diện mới lên.
- `sql/cap-nhat-14-sua-loi-dat-uu-dai.sql`: sửa lỗi "UPDATE requires a WHERE clause" khi khách đặt ưu đãi. Chỉ thay hàm tính giá ưu đãi, không đụng dữ liệu. Chạy sau cập nhật 13.
- `sql/cap-nhat-15-sua-don-tai-cho.sql`: sửa đơn ngay trên bếp/pha chế: đổi ăn tại quán ↔ mang về, đổi số bàn, đổi tuỳ chọn (topping, đường, đá, size) của món đã có. Thêm 1 cột và 2 hàm, không đụng dữ liệu.
- `sql/cap-nhat-16-kho-hang.sql`: thêm lại **Kho hàng** (nhập theo thùng, dùng theo gói, quy đổi tuỳ từng mặt hàng; lịch sử nhập / dùng / kiểm kho). Chỉ thêm bảng và hàm mới.
- `sql/cap-nhat-17-quy-cach-kho.sql`: thêm **Quy cách nhập hàng** dùng chung (Thùng 24 gói, Thùng 4 can, Can…). Chạy sau cập nhật 16.

## Xoá dữ liệu thử trước khi dùng thật

`sql/xoa-du-lieu-test.sql`: phần 1 xoá đơn, doanh thu, ca làm; giữ menu. Phần 2 (bỏ dấu `--` mới chạy) xoá luôn mọi tài khoản để tạo lại từ đầu.
