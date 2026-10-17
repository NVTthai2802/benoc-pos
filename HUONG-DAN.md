# Bé Nốc POS — hướng dẫn cài đặt

Hệ thống gồm 3 trang web, chạy trên mọi điện thoại, máy tính bảng, laptop. Không cần cài app.

| Trang | Ai dùng | Thiết bị |
|---|---|---|
| `index.html` | Khách quét QR gọi món | Điện thoại của khách |
| `bep.html` | Bếp nhận đơn, báo thời gian chờ, thu tiền | Máy tính bảng ở bếp |
| `quanly.html` | Chủ quán: doanh thu, menu, kho, nhân viên, cài đặt. Nhân viên: chấm công, nhập hàng | Điện thoại |

Khi `config.js` để trống, cả 3 trang chạy ở **chế độ xem thử**: dữ liệu lưu trong trình duyệt, chỉ để thử giao diện.

## 1. Tạo cơ sở dữ liệu Supabase (miễn phí)

1. Vào https://supabase.com, đăng ký, bấm **New project**. Chọn vùng **Southeast Asia (Singapore)** cho nhanh.
2. Vào **Authentication → Sign In / Providers → Email**, **tắt "Confirm email"**. Nhân viên đăng nhập bằng số điện thoại, hệ thống tự đổi thành dạng `0912345678@benoc.app` nên không có email thật để xác nhận.
3. Vào **SQL Editor**, dán toàn bộ `schema.sql`, bấm **Run**. Sau đó dán `seed_menu.sql`, bấm **Run** (nạp menu Bé Nốc, 81 món, đủ size/topping/ảnh).
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
3. Tạo thêm một tài khoản vai trò **Máy bếp** cho máy tính bảng ở bếp.
4. Vào **Cài đặt**: chọn cách làm tròn giờ công, số đơn bếp làm cùng lúc. Mã QR ở đây trỏ tới trang khách: chụp lại hoặc in ra, dán ở quầy bếp và trên bàn.

## 4. Dùng hằng ngày

- **Máy bếp**: mở `bep.html`, đăng nhập tài khoản máy bếp, bấm **Bật chuông báo** (trình duyệt chỉ cho phát âm thanh sau khi bấm). Nên chọn "Thêm vào màn hình chính" để mở như app.
- **Nhân viên**: mở `quanly.html` trên điện thoại mình → **Chấm công** → chụp ảnh vào ca, cuối ca chụp ảnh ra ca.
- **Hàng về**: **Kho hàng → Nhập hàng** → chụp mã vạch. Hàng mới thì nhập tên một lần, lần sau chụp là ra.
- **Hết món**: **Menu** → gạt công tắc **Đang bán** sang **Hết món**, khách sẽ không thấy món đó.
- **Đổi ảnh món**: **Menu** → bấm món → **Chọn ảnh** → **Lưu**.

## Lưu ý

- Đổi mật khẩu nhân viên: Supabase → **Authentication → Users** → chọn người → đặt lại mật khẩu.
- Dự án Supabase miễn phí tự tạm dừng nếu một tuần không ai dùng; quán mở hằng ngày thì không bị.
- Đơn của khách bị xoá khi thanh toán xong; doanh thu được giữ ở bảng tóm tắt hoá đơn (không giữ tên, số điện thoại khách).
- Ảnh chấm công lưu riêng tư, chỉ chủ quán và chính nhân viên đó xem được.
