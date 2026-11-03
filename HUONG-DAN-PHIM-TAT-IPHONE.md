# Cài Phím tắt lên đơn trên iPhone (làm từ đầu)

Dùng khi cài cho **một iPhone mới** (chủ quán đổi máy, thêm máy nhân viên trực tin nhắn…). Phía Supabase đã cài xong, chỉ cần làm trên iPhone.

**Kết quả:** đang mở đoạn chat với khách → **gõ 3 lần vào lưng máy** → 1–2 giây sau hiện **"📥 Đã nhận ảnh"** → **chụp tiếp đơn khác ngay**, không phải đợi. Bot gom các ảnh chụp liền nhau, đọc và đưa đơn vào thẳng bếp / pha chế với nhãn **ĐƠN ONLINE** (khoảng 10–20 giây sau), giống bot Zalo. Kết quả không báo lại trên iPhone: xem đơn ở màn hình bếp / Quản lý.

Cần: iPhone 8 trở lên (iOS 14+), có app **Phím tắt** (Shortcuts, có sẵn; bị xoá thì tải lại trên App Store).

---

## Chuẩn bị 3 thông tin

| Thông tin | Giá trị |
|---|---|
| **Địa chỉ bot** | `https://hixdacnaxfuxuccbajzn.supabase.co/functions/v1/bot-don` |
| **Mã bí mật** (`CAPTURE_KEY`) | Lấy từ người quản lý POS. Supabase không cho xem lại mã sau khi lưu, nên chép từ Phím tắt trên máy đang chạy (mở phím tắt, xem tiêu đề `x-capture-key`) |
| **Tên máy** (`x-device`) | Đặt riêng cho máy này, **không dấu, không cách**, vd `iphone-chu-quan`, `iphone-nhan-vien-2` |

Tên máy là cách bot biết "đơn vừa lên" của máy nào: nhắn "huỷ" / "thêm 1 trà đào" chỉ sửa đơn **của chính máy đó**. Hai máy không dùng chung tên.

> **Cách nhanh hơn:** trên máy đang chạy, mở app Phím tắt → bấm giữ phím tắt → **Chia sẻ** → **AirDrop** sang máy mới (làm cho cả 2 phím tắt). Sang máy mới chỉ cần làm **Bước 1**, sửa **tên máy** ở tác vụ "Nhận nội dung của URL", rồi làm **Bước 4–5**. Chỉ AirDrop / gửi riêng: mã bí mật nằm trong phím tắt, không đăng lên nhóm.

---

## Bước 1. Cho phép gửi ảnh

**Cài đặt** → kéo xuống chọn **Phím tắt** → **Nâng cao** → bật **Cho phép chia sẻ số lượng lớn dữ liệu**.

(Không bật thì mỗi lần gửi ảnh iOS có thể hỏi lại, mất "gõ là gửi".)

## Bước 2. Phím tắt "Gửi đơn Bé Nốc" (chụp và gửi)

Mở **app Phím tắt** (biểu tượng ô vuông xanh-hồng, không phải trong Cài đặt) → tab **Phím tắt** → **+** (góc trên phải). Bấm tên ở trên cùng → **Đổi tên** → `Gửi đơn Bé Nốc`.

Thêm lần lượt 5 tác vụ bằng ô **Tìm kiếm tác vụ** ở dưới:

**① Chụp ảnh màn hình**
Gõ `chụp ảnh màn hình` → chọn. Không chỉnh gì.

**② Chuyển đổi hình ảnh**
Gõ `chuyển đổi hình ảnh` → chọn. Câu phải đọc là: *Chuyển đổi* **Ảnh chụp màn hình** *sang* **JPEG**.
Bấm mũi tên **›** mở rộng: **Chất lượng** khoảng 80%, **Bảo toàn siêu dữ liệu**: tắt.

**③ Nhận nội dung của URL**
Gõ `URL` → chọn tác vụ có biểu tượng **quả địa cầu / mũi tên tải xuống màu xanh lá** (tên kiểu *Nhận nội dung của URL* hoặc *Lấy nội dung URL*; **không** chọn tác vụ chỉ tên "URL").
- Bấm vào chữ **URL** màu xanh → dán **Địa chỉ bot**.
- Bấm mũi tên **›** mở rộng:
  - **Phương thức**: chọn `POST`.
  - **Tiêu đề** → **Thêm tiêu đề mới**, làm 2 lần:

    | Khoá | Văn bản |
    |---|---|
    | `x-capture-key` | mã bí mật |
    | `x-device` | tên máy (vd `iphone-nhan-vien-2`) |

  - **Phần thân yêu cầu**: chọn **Tệp** → bấm ô **Tệp** → chọn biến **Ảnh đã chuyển đổi** (kết quả tác vụ ②).

**④ Lấy giá trị từ điển**
Gõ `từ điển` → chọn **Lấy giá trị từ điển** (biểu tượng cam). Câu phải đọc là: *Lấy* **Giá trị** *cho* `tom_tat` *trong* **Nội dung của URL**.
`tom_tat` dùng **gạch dưới** `_` (bàn phím **123** → **#+=**), không phải gạch ngang.

**⑤ Hiển thị thông báo**
Gõ `hiển thị thông báo` → chọn.
- Bấm vào ô **Văn bản** (chữ "Xin chào thế giới!"), xoá hết, rồi chọn biến **Giá trị từ điển** trên thanh gợi ý phía trên bàn phím.
- Ô **Tệp đính kèm** để **trống** (đặt nhầm biến vào đây thì bấm vào → Xoá).

Bấm **Xong**.

## Bước 3. Phím tắt "Sửa đơn Bé Nốc" (sửa / huỷ bằng chữ)

Phím tắt mới → đổi tên `Sửa đơn Bé Nốc` → thêm 4 tác vụ:

**① Yêu cầu đầu vào**
Gõ `yêu cầu đầu vào` → chọn. Loại **Văn bản**, lời nhắc: `Sửa đơn (vd: thêm 1 trà đào / giờ 18h30 / huỷ)`.
Muốn nói thay gõ: dùng tác vụ **Đọc chính tả văn bản** (ngôn ngữ Tiếng Việt) thay cho tác vụ này.

**② Nhận nội dung của URL**
Như ③ ở Bước 2, cùng **Địa chỉ bot**, **POST**, 2 tiêu đề `x-capture-key` và `x-device` (**cùng tên máy** với Bước 2). Khác ở:
- **Phần thân yêu cầu**: chọn **JSON** → **Thêm trường mới** → **Văn bản** → khoá `text`, giá trị = biến **Đầu vào được cung cấp** (hoặc **Văn bản đã đọc chính tả**).

**③ Lấy giá trị từ điển**: `tom_tat` trong **Nội dung của URL** (như ④ ở Bước 2).

**④ Hiển thị thông báo**: ô Văn bản = **Giá trị từ điển** (như ⑤ ở Bước 2).

Bấm **Xong**.

## Bước 4. Chạy thử lần đầu (bắt buộc)

1. Trong app Phím tắt, bấm vào **Gửi đơn Bé Nốc**.
2. iOS hỏi cho phép kết nối tới **hixdacnaxfuxuccbajzn.supabase.co** → chọn **Luôn cho phép**.
3. Lần này chụp trúng màn hình app Phím tắt nên thông báo sẽ là *"Ảnh này không thấy đoạn chat đặt món…"*: **đúng như vậy là đã thông**, không có đơn nào được tạo.
4. Bấm thử **Sửa đơn Bé Nốc**, gõ `hd` → thông báo hướng dẫn của bot. Lần đầu cũng chọn **Luôn cho phép**.

Không chọn "Luôn cho phép" ở bước này thì lúc gõ lưng máy phím tắt sẽ bị dừng để hỏi.

## Bước 5. Gán gõ lưng máy / nút nổi

**Gõ lưng máy:** **Cài đặt** → **Trợ năng** → **Cảm ứng** → kéo xuống cuối → **Chạm vào mặt sau**:
- **Chạm ba lần** → **Gửi đơn Bé Nốc**
- **Chạm hai lần** → **Sửa đơn Bé Nốc** (tuỳ chọn)

Dùng *ba lần* cho phím gửi đơn để đỡ chạm nhầm khi cầm máy. Ốp lưng quá dày có thể khó nhận.

**Hoặc nút nổi:** **Cài đặt** → **Trợ năng** → **Cảm ứng** → **AssistiveTouch** → bật → **Chạm hai lần** → **Gửi đơn Bé Nốc** (chạm một lần vẫn mở menu bình thường). Kéo nút tròn ra mép màn hình cho đỡ vướng.

---

## Dùng hằng ngày

| Làm gì | Kết quả |
|---|---|
| Đang mở đoạn chat đã chốt đơn → gõ lưng 3 lần | **📥 Đã nhận ảnh** → mở chat khách khác, gõ lưng tiếp |
| Chụp liên tục nhiều khách | Bot gom ảnh chụp cách nhau dưới ~3 giây thành 1 lượt đọc, **mỗi khách 1 đơn** |
| Đoạn chat dài: cuộn tiếp, gõ lưng lần nữa | Ảnh của **cùng khách** chụp liền nhau gộp 1 đơn; chụp sau (trong 90 phút, bếp chưa nhận) thì **sửa đơn đó** |
| Muốn xem bot đọc ra gì | Màn hình bếp / Quản lý → Đơn online. Hoặc **Sửa đơn Bé Nốc** gõ bất kỳ sửa đổi nào: thông báo hiện lại tóm tắt đơn |
| Sửa đơn Bé Nốc → `thêm 1 trà đào`, `bỏ kimbap`, `giờ 18h30`, `ship 12 ngõ 5…, sđt 09…` | **🔄 Đã sửa đơn ở bếp** |
| Sửa đơn Bé Nốc → `huỷ` | **🗑 Đã huỷ đơn** (khi bếp chưa nhận) |

- Chụp sao cho thấy **tên khách ở đầu màn hình** và phần có món, giờ hẹn, địa chỉ.
- Chưa rõ qua lấy / ăn tại quán / ship thì bot tạm để **Mang về**. Thiếu địa chỉ / giờ hoặc món tạm hết thì đơn ở bếp hiện thiếu, nhắn bổ sung bằng "Sửa đơn" (thông báo của "Sửa đơn" luôn hiện kết quả).
- Muốn từng ảnh đều hiện kết quả trên iPhone (chậm hơn, phải đợi): thêm tiêu đề thứ 3 `x-wait` = `1` vào phím tắt Gửi đơn.
- Bếp đã bấm **Nhận** thì bot không sửa / huỷ nữa: sửa trên màn hình bếp.
- Mỗi lần gõ lưng là **đơn thật ở bếp**. Chụp nhầm đơn thử thì "Sửa đơn" → `huỷ` ngay.

## Khi có sự cố

| Thông báo / hiện tượng | Cách xử lý |
|---|---|
| ⛔ Sai mã x-capture-key | Mã trong tiêu đề sai hoặc thừa dấu cách. Chép lại từ máy đang chạy |
| ⚠️ Không phải ảnh JPG / PNG | ③ *Phần thân yêu cầu* phải là **Tệp** = **Ảnh đã chuyển đổi** |
| Thông báo trống | ④ khoá phải là `tom_tat` (gạch dưới); ⑤ biến phải nằm ở ô **Văn bản**, không phải Tệp đính kèm |
| Phím tắt dừng lại hỏi quyền | Làm lại **Bước 4**, chọn **Luôn cho phép**; kiểm tra **Bước 1** |
| Nhắn sửa nhưng bot nói "không có đơn nào vừa lên" | `x-device` ở 2 phím tắt khác nhau, hoặc đơn đã quá 90 phút |
| Gõ lưng xong mà bếp không có đơn (sau ~30 giây) | Ảnh không có đoạn chat đặt món, hoặc AI quá tải: chụp lại; muốn biết lý do thì thêm tạm `x-wait` = `1` rồi chụp lại. Hoặc xem Supabase → Edge Functions → `bot-don` → Logs |
| Gõ lưng không chạy | Kiểm tra **Bước 5**; thử tháo ốp; hoặc dùng nút AssistiveTouch |
| Không tìm thấy tác vụ khi gõ tên | Tên tác vụ trên iOS tiếng Việt hơi khác: gõ ít chữ hơn (`URL`, `từ điển`, `thông báo`) rồi chọn theo biểu tượng |

## Bảo mật

- Mã bí mật nằm trong 2 phím tắt: chỉ chia sẻ qua AirDrop / gửi riêng cho người trong quán.
- Máy bị mất hoặc nhân viên nghỉ: đổi secret `CAPTURE_KEY` trên Supabase (Edge Functions → Secrets), rồi sửa mã mới trong phím tắt của các máy còn dùng.
- Ảnh chụp được gửi cho AI (Google Gemini) để đọc và lưu ở kho ảnh riêng tư của quán, giống bot Zalo.

---

<details>
<summary>Dành cho người quản lý POS: phía Supabase (đã cài trên Product ngày 03/11/2026)</summary>

- SQL `sql/cap-nhat-33-phim-tat-iphone.sql`: cho phép đơn kênh `ios`.
- Function `bot-don` bản có `handleShortcut` (Verify JWT tắt). Ảnh chế độ nhanh lưu tạm ở `don-anh/ios-tam/`, đọc xong tự xoá; gom qua bảng `bot_photos` như Zalo.
- Secret `CAPTURE_KEY` (chữ và số, ~32 ký tự), dùng chung cả project.
- Kiểm tra: Quản lý → Đơn online → Cài đặt bot → **Kiểm tra bot** → *✅ Phím tắt iPhone: đã có CAPTURE_KEY*.
- Function `chup-chat` (cập nhật 32) + `tools/chup-chat.html` chỉ dùng để thu ảnh chép nguyên văn cho mô hình tự build; quán dùng hằng ngày không cần.

</details>
