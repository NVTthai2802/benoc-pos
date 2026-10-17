# Bé Nốc POS — hướng dẫn cài đặt

Hệ thống gồm 4 trang web, chạy trên mọi điện thoại, máy tính bảng, laptop. Không cần cài app.

| Trang | Ai dùng | Thiết bị |
|---|---|---|
| `index.html` | Khách quét QR gọi món | Điện thoại của khách |
| `bep.html` | Bếp nóng: nhận đơn món ăn, báo thời gian chờ, ra món. Đây cũng là nơi thu tiền | Máy tính bảng ở bếp |
| `phache.html` | Quầy pha chế: nhận đơn đồ uống (trà sữa, trà hoa quả, cà phê...), báo thời gian chờ, ra món | Máy tính bảng ở quầy pha chế |
| `quanly.html` | Chủ quán: doanh thu, menu, kho, nhân viên, cài đặt. Nhân viên: chấm công, nhập hàng | Điện thoại |

Khi `config.js` để trống, cả 4 trang chạy ở **chế độ xem thử**: dữ liệu lưu trong trình duyệt, chỉ để thử giao diện.

## 1. Tạo cơ sở dữ liệu Supabase (miễn phí)

1. Vào https://supabase.com, đăng ký, bấm **New project**. Chọn vùng **Southeast Asia (Singapore)** cho nhanh.
2. Vào **Authentication → Sign In / Providers → Email**, **tắt "Confirm email"**. Nhân viên đăng nhập bằng số điện thoại, hệ thống tự đổi thành dạng `0912345678@benoc.app` nên không có email thật để xác nhận.
3. Vào **SQL Editor**, dán toàn bộ `sql/schema.sql`, bấm **Run**. Sau đó dán `sql/seed_menu.sql`, bấm **Run** (nạp menu Bé Nốc, 81 món, đủ size/topping/ảnh).
4. Vào **Project Settings → API**, chép **Project URL** và **anon public key** vào `config.js`.

## 2. Đưa trang lên mạng (miễn phí)

Cách nhanh nhất: **Netlify Drop**.

1. Vào https://app.netlify.com/drop.
2. Kéo cả thư mục `benoc-pos` (thư mục chứa `index.html`) thả vào trang.
3. Netlify cho một địa chỉ dạng `https://ten-gi-do.netlify.app`. Có thể đổi tên trong Site settings.

Trang phải chạy qua `https://` thì điện thoại mới cho chụp ảnh chấm công và quét mã vạch.

## 3. Cài đặt lần đầu

1. Mở `https://<địa-chỉ>/quanly.html`. Lần đầu sẽ hiện **Cài đặt lần đầu**: nhập tên, số điện thoại, mật khẩu để tạo tài khoản chủ quán.
2. Vào **Nhân viên → Thêm nhân viên** cho từng người: họ tên, số điện thoại, lương/giờ, mật khẩu. Đưa số điện thoại + mật khẩu cho nhân viên.
3. Tạo thêm hai tài khoản dùng chung: vai trò **Máy bếp** cho máy tính bảng ở bếp, vai trò **Máy pha chế** cho máy tính bảng ở quầy pha chế.
4. Vào **Menu → Danh mục**: mỗi danh mục có mục **Món trong danh mục này làm ở đâu** (Bếp hoặc Quầy pha chế). Menu Bé Nốc được gán sẵn: trà sữa, trà hoa quả, sốt khoai môn tươi, cà phê, matcha · cacao · khoai môn, món nên thử → quầy pha chế; cơm, mì, kimbap, đồ ăn vặt, nước uống → bếp. Đổi lại cho đúng với quán nếu cần.
5. Vào **Cài đặt**: chọn cách làm tròn giờ công, số đơn bếp và số đơn quầy pha chế làm cùng lúc. Mã QR ở đây trỏ tới trang khách: chụp lại hoặc in ra, dán ở quầy bếp và trên bàn.

## 4. Dùng hằng ngày

- **Máy bếp**: mở `bep.html`, đăng nhập tài khoản máy bếp, bấm **Bật chuông báo** (trình duyệt chỉ cho phát âm thanh sau khi bấm). Nên chọn "Thêm vào màn hình chính" để mở như app.
- **Máy pha chế**: mở `phache.html`, đăng nhập tài khoản máy pha chế, cũng bấm **Bật chuông báo** (chuông pha chế khác âm với chuông bếp).
- **Đơn của khách**: khách vẫn gọi một lần, một số thẻ. Hệ thống tự chia món: phần món ăn hiện ở màn bếp, phần đồ uống pha chế hiện ở màn pha chế. Mỗi nơi tự bấm **Nhận đơn**, báo thời gian và bấm **Ra món** riêng. Khách thấy tiến độ từng phần trên điện thoại.
- **Thu tiền**: vẫn ở màn bếp. Đơn sang cột **Chờ thanh toán** khi cả bếp và quầy pha chế đều đã ra món (đơn chỉ có đồ uống pha chế cũng hiện ở đó khi pha chế xong). Nếu bếp xong trước, đơn nằm chờ và chưa cho thu tiền.
- **Huỷ đơn**: màn bếp huỷ được mọi đơn. Màn pha chế chỉ huỷ được đơn chỉ có đồ uống, để không huỷ nhầm phần của bếp.
- **Nhân viên**: mở `quanly.html` trên điện thoại mình → **Chấm công** → chụp ảnh vào ca, cuối ca chụp ảnh ra ca.
- **Hàng về**: **Kho hàng → Nhập hàng** → chụp mã vạch. Hàng mới thì nhập tên một lần, lần sau chụp là ra.
- **Hết món**: **Menu** → gạt công tắc **Đang bán** sang **Hết món**, khách sẽ không thấy món đó.
- **Đổi ảnh món**: **Menu** → bấm món → **Chọn ảnh** → **Lưu**.

## Lưu ý

- Đổi mật khẩu nhân viên: Supabase → **Authentication → Users** → chọn người → đặt lại mật khẩu.
- Dự án Supabase miễn phí tự tạm dừng nếu một tuần không ai dùng; quán mở hằng ngày thì không bị.
- Đơn của khách bị xoá khi thanh toán xong; doanh thu được giữ ở bảng tóm tắt hoá đơn (không giữ tên, số điện thoại khách).
- Ảnh chấm công lưu riêng tư, chỉ chủ quán và chính nhân viên đó xem được.

## Cập nhật từ bản cũ (đã cài trước 17/10/2026)

Bản tách màn bếp / quầy pha chế cần thêm bảng và hàm trong cơ sở dữ liệu. **Chạy file này một lần, trước khi dùng bản web mới:**

1. Vào Supabase → **SQL Editor** → dán toàn bộ `sql/cap-nhat-2-quay-pha-che.sql` → **Run**.
2. Tải lại các trang. Nếu màn hình báo "Cơ sở dữ liệu chưa được cập nhật" nghĩa là chưa chạy file này.
3. Vào **Nhân viên**, tạo tài khoản vai trò **Máy pha chế** cho máy ở quầy pha chế.

File cập nhật không làm mất dữ liệu. Đơn đang mở lúc cập nhật được coi là của bếp. Chạy lại lần hai cũng không sao. Khách đang dùng trang cũ vẫn đặt và xem đơn bình thường.
