# Lên đơn bằng Phím tắt iPhone (gõ lưng máy)

Cập nhật 33. Luồng giống **bot Zalo**: chụp đoạn chat → AI đọc → **đơn vào thẳng bếp / pha chế** (nhãn **ĐƠN ONLINE**), chỉ khác là không phải mở Zalo gửi ảnh.

## Cách dùng

| Làm gì | Kết quả |
|---|---|
| Đang mở đoạn chat với khách, **gõ 3 lần vào lưng iPhone** | Phím tắt tự chụp màn hình gửi cho bot. Vài giây sau hiện thông báo **"✅ Đã gửi bếp · tên khách"** kèm món, giờ, phần còn thiếu |
| Đoạn chat dài: cuộn xuống, gõ lưng máy tiếp | Ảnh sau của **cùng khách** trong 90 phút (bếp chưa nhận) thì **sửa đơn đó**, không tạo đơn mới |
| Chạy Phím tắt **"Sửa đơn Bé Nốc"**, gõ/đọc "thêm 1 trà đào", "giờ 18h30", "ship 12 ngõ 5…" | Sửa đơn vừa lên. Thông báo **"🔄 Đã sửa đơn ở bếp"** |
| "Sửa đơn Bé Nốc" → **huỷ** | Huỷ đơn vừa lên (khi bếp chưa nhận) |

Giống bot Zalo: chưa rõ hình thức thì tạm **Mang về**; chưa có tên thì **Khách online**; món tạm hết, thiếu giờ, thiếu địa chỉ ship… đều báo trong thông báo. Bếp đã bấm **Nhận** thì sửa trên màn hình bếp. Ảnh lưu ở `don-anh`, mẫu huấn luyện ghi vào `fb_train` như bot Zalo. Bot Zalo vẫn chạy song song, dùng bên nào cũng được.

Phím tắt chạy ngầm: gõ lưng máy xong cứ nhắn tiếp với khách, không phải đợi.

---

## Bước 1. Supabase Product

1. **SQL Editor** → chạy `sql/cap-nhat-33-phim-tat-iphone.sql` (cho phép đơn kênh `ios`).
2. **Edge Functions → `bot-don`** → **Code** → dán đè toàn bộ `supabase/functions/bot-don/index.ts` mới → **Deploy**. Verify JWT vẫn **tắt**.
3. Secret `CAPTURE_KEY` đã có từ lúc thử `chup-chat` (secret dùng chung cả project) → không phải thêm.
4. Kiểm tra: Quản lý → Đơn online → **Cài đặt bot** → **Kiểm tra bot** → có dòng **✅ Phím tắt iPhone: đã có CAPTURE_KEY**.

## Bước 2. Sửa Phím tắt "Gửi chat Bé Nốc" có sẵn

Mở app **Phím tắt** → bấm giữ phím tắt → **Sửa**:

1. Tác vụ **Nhận nội dung của URL**: đổi URL cuối từ `/chup-chat` thành **`/bot-don`**
   (`https://xxxx.supabase.co/functions/v1/bot-don`).
2. Tiêu đề: giữ `x-capture-key` và `x-device` (`iphone-chu-quan`). **Xoá `x-wait`** nếu có.
3. Các tác vụ còn lại giữ nguyên (thông báo vẫn lấy `tom_tat`).
4. Đổi tên thành **Gửi đơn Bé Nốc** cho dễ nhớ (không bắt buộc).

Chạy thử 1 lần từ trong app Phím tắt (sẽ báo "không thấy đoạn chat đặt món", không tạo đơn), rồi mở một đoạn chat đặt món thật và gõ lưng máy.

## Bước 3. Phím tắt "Sửa đơn Bé Nốc" (sửa / huỷ bằng chữ)

Phím tắt mới → thêm 4 tác vụ:

1. **Yêu cầu đầu vào** (Ask for Input): loại **Văn bản**, lời nhắc *"Sửa đơn (vd: thêm 1 trà đào / huỷ)"*.
2. **Nhận nội dung của URL**: URL `…/functions/v1/bot-don`, **POST**, tiêu đề `x-capture-key` = mã, `x-device` = **`iphone-chu-quan`** (phải **giống hệt** phím tắt chụp, bot dựa vào đây để biết "đơn vừa lên" là đơn nào). **Phần thân yêu cầu: JSON** → thêm trường **Văn bản**, khoá `text`, giá trị = biến **Đầu vào được cung cấp**.
3. **Lấy giá trị từ điển**: `tom_tat` trong **Nội dung của URL**.
4. **Hiển thị thông báo**: **Giá trị từ điển**.

Muốn nói thay gõ: thay tác vụ 1 bằng **Đọc chính tả văn bản** (ngôn ngữ Tiếng Việt). Có thể đặt phím tắt này vào AssistiveTouch (chạm hai lần) hoặc Chạm vào mặt sau → **Chạm hai lần**.

---

## Khi có sự cố

| Thông báo / hiện tượng | Cách xử lý |
|---|---|
| ⛔ Sai mã x-capture-key | Mã trong Phím tắt khác secret `CAPTURE_KEY` |
| ⚠️ Chưa cài secret CAPTURE_KEY | Thêm secret ở Edge Functions → Secrets |
| ⚠️ Không phải ảnh JPG / PNG | Phần thân yêu cầu phải là **Tệp** = *Ảnh đã chuyển đổi* (JPEG) |
| AI đang quá tải | Gõ lưng máy lại sau ít phút |
| Ảnh này không thấy đoạn chat đặt món | Chụp đúng màn hình chat có món / giờ hẹn |
| Đơn không hiện ở bếp, lỗi ràng buộc `fb_drafts_kenh_check` | Chưa chạy SQL cập nhật 33 |
| Nhắn sửa nhưng bot nói "không có đơn nào vừa lên" | `x-device` ở 2 phím tắt khác nhau, hoặc đơn đã quá 90 phút |
| Thông báo trống | Chạy tay trong app Phím tắt để xem lỗi; xem Supabase → Edge Functions → `bot-don` → Logs |

## Riêng tư

Giống bot Zalo: ảnh gửi cho Google Gemini để đọc; ảnh lưu ở bucket riêng tư `don-anh`; mẫu huấn luyện đã ẩn tên, SĐT. Không ai có `CAPTURE_KEY` thì không gửi được đơn, nên **đừng chia sẻ phím tắt** (mã nằm trong đó). Lộ mã thì đổi secret và sửa lại Phím tắt.

Trang `tools/chup-chat.html` + function `chup-chat` (cập nhật 32) vẫn giữ để thu ảnh chép nguyên văn cho việc tự build mô hình; quán dùng hằng ngày thì chỉ cần `bot-don`.
