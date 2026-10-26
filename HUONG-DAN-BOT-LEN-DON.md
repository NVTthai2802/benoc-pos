# Bot lên đơn từ ảnh chụp — hướng dẫn cài đặt và sử dụng

> Cập nhật 27: bot **gửi thẳng đơn vào bếp / pha chế** (nhãn **ĐƠN ONLINE**), không còn tab Đơn online và bước duyệt.

## Cách hoạt động

1. Chủ quán nhắn khách trên Facebook như bình thường và **chốt đơn** với khách.
2. **Chụp màn hình đoạn chat** (1 hoặc nhiều ảnh) và gửi cho **bot Zalo của quán**.
3. Bot đọc ảnh bằng AI (Gemini), tách món, hình thức (qua lấy / ăn tại quán / ship), giờ hẹn, địa chỉ, SĐT → tạo **đơn thật vào thẳng bếp / pha chế**. Trên thẻ đơn ở bếp và phiếu in có nhãn **ĐƠN ONLINE**. Bot nhắn lại tóm tắt và phần còn thiếu.
4. Thiếu gì thì nhắn chữ cho bot để bổ sung / sửa. Bếp bấm Nhận đơn, in phiếu như đơn thường.

Chưa rõ hình thức thì bot tạm để **Mang về**; chưa có tên khách thì để **Khách online**.

Bot nhận ra giao diện **Messenger** và **Zalo**, và biết ảnh chụp từ máy quán hay máy khách: đầu màn hình là tên khách thì bên phải là quán; đầu màn hình là "Bé Nốc" thì bên phải là khách. Ghi chú đơn tự có nguồn (vd **"Messenger · gọi trước khi giao"**); yêu cầu riêng ("nhiều tương", "không hành") ghi vào đúng món. Ảnh chụp lại màn hình điện thoại bằng máy khác cũng đọc được, nhưng ảnh chụp màn hình thẳng (screenshot) vẫn chính xác nhất.

Bot không nhắn gì cho khách, nên không cần Meta duyệt app hay xác minh doanh nghiệp. Chỉ tài khoản Zalo đã **kết nối bằng mã** lấy trong Quản lý mới dùng được bot.

| Nhắn cho bot | Bot làm gì |
|---|---|
| Ảnh chụp đoạn chat (gửi một lần nhiều ảnh, nhiều khách cũng được, tối đa 30 ảnh) | Gom ảnh, tự nhóm theo khách: **mỗi khách 1 đơn** vào bếp, **mỗi đơn 1 tin** trả lời. Ảnh của cùng khách gửi tiếp trong 90 phút (bếp chưa nhận) thì sửa đơn đó |
| "thêm 1 trà đào", "bỏ kimbap", "giờ 18h30", "ship 12 ngõ 5 Quang Trung, sđt 09…" | Sửa đơn vừa lên. Bếp đã bấm Nhận thì bot báo, sửa trên màn hình bếp (Sửa đơn) |
| Cả đơn gõ bằng chữ (khi chưa có đơn vừa lên) | Lên đơn từ chữ |
| "huỷ" | Huỷ đơn vừa lên (khi bếp chưa nhận) |
| "hd" / "hi" | Hướng dẫn dùng |

## Tiến độ

| Việc | Trạng thái |
|---|---|
| Viết bot `bot-don`, SQL cập nhật 25, 26, 27 (gửi thẳng bếp) | ✅ Xong (15/15 bài thử bot, chạy thử SQL trên Postgres, thử giao diện) |
| Gỡ bot Fanpage cũ (`fb-bot`) khỏi code | ✅ Xong |
| Supabase TEST và PRODUCT: chạy SQL 25, đưa bot `bot-don` lên, tắt Verify JWT, gỡ `fb-bot` | ✅ Xong 26/10 |
| Giao diện mới (tab **Đơn online**) trên trang test và trang quán | ✅ Xong 26/10 |
| Tạo bot Zalo, nhập `ZALO_BOT_TOKEN` | ⬜ Bước 1–2 |
| Cài webhook, kết nối Zalo chủ quán | ⬜ Bước 3–4 |

---

## Bước 1. Tạo bot Zalo

1. Mở https://bot.zapps.me trên máy tính, quét mã QR bằng app Zalo (nên dùng Zalo của chủ quán).
2. Bấm tạo bot, đặt tên kiểu **"Bé Nốc lên đơn"**, thêm mô tả. Tên bot **chưa đổi được** sau khi tạo.
3. Copy **Bot Token**. Không gửi token cho ai.

Gói miễn phí: tối đa 3 bot, mỗi bot 50 người dùng, 3.000 tin / tháng (đủ cho quán). Zalo Bot đang ở bản beta.

## Bước 2. Nhập token vào Supabase

Supabase → project **benoc-pos** (Product) → **Edge Functions → Secrets** → **Add new secret**:

| Tên | Giá trị |
|---|---|
| `ZALO_BOT_TOKEN` | token vừa copy |

`GEMINI_API_KEY` đã có từ trước thì giữ nguyên. Một bot Zalo chỉ nối được **một** môi trường (Test hoặc Product), nên chỉ nhập token ở môi trường quán dùng thật.

Muốn dùng Telegram thay / thêm: nhắn **@BotFather** trên Telegram → `/newbot` → lấy token → thêm secret `TELEGRAM_BOT_TOKEN`.

## Bước 3. Cài webhook

Quản lý → **Cài đặt → Bot lên đơn (Zalo) → Cài đặt bot** → **Kiểm tra bot**: phải thấy tên bot Zalo. Bấm **Cài webhook** → hiện **✅ Đã cài webhook Zalo**. Bấm **Kiểm tra bot** lại: dòng Zalo có **webhook đã cài**.

## Bước 4. Kết nối Zalo của chủ quán

1. Cài đặt bot → **Lấy mã kết nối** → hiện mã 6 số (dùng trong 10 phút).
2. Mở Zalo, tìm bot (tên đặt ở Bước 1), nhắn đúng 6 số đó.
3. Bot trả lời **"✅ Đã kết nối"** và tên tài khoản hiện ở danh sách trong Cài đặt bot.

Mỗi người dùng bot (chủ quán, nhân viên trực tin nhắn) lấy 1 mã riêng. Gỡ quyền: bấm **Gỡ** cạnh tên.

## Bước 5. Thử

Chụp màn hình một đoạn chat đặt món (hoặc tự soạn), gửi cho bot. Vài giây sau bot nhắn tóm tắt, đơn hiện ở bếp / pha chế với nhãn **ĐƠN ONLINE**. Nhắn "huỷ" để huỷ đơn thử (khi bếp chưa nhận).

Mẹo chụp: chụp đủ phần khách gọi món, giờ hẹn, địa chỉ; tên khách ở đầu màn hình nằm trong ảnh thì bot lấy được tên.

---

## Khi có sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Bot không trả lời gì | **Kiểm tra bot**: token đúng chưa, webhook đã cài chưa (bấm **Cài webhook** lại). Xem Supabase → Edge Functions → `bot-don` → **Logs** |
| Bot báo "chưa được dùng bot" | Tài khoản Zalo chưa kết nối: làm Bước 4 |
| "Mã không đúng hoặc đã hết hạn" | Mã chỉ dùng 1 lần, trong 10 phút. Lấy mã mới |
| "AI đang quá tải" | Gemini quá tải, bot đã tự thử 3 model. Gửi lại ảnh sau ít phút |
| "Bot chưa tải được ảnh" | Gửi ảnh dạng ảnh thường (JPG / PNG), dưới 8MB |
| Bot đọc sai món / giờ | Nhắn chữ để sửa (khi bếp chưa nhận), hoặc sửa trên màn hình bếp. Tin sửa được ghi lại làm dữ liệu huấn luyện |
| "Món … đang tạm hết" | Món đang tắt trong Menu. Nhắn "bỏ …" hoặc đổi món |
| Đơn không hiện ở bếp | Chưa chạy SQL cập nhật 27 trên Supabase |

## Khách yêu cầu xoá dữ liệu

Trang chính sách hứa: khách nhắn "xoá dữ liệu của tôi" thì quán xoá ảnh chụp và bản chép đoạn chat của khách.

1. Supabase → **Table Editor → fb_drafts**: tìm dòng có `customer_name` của khách, copy cột `id`.
2. Supabase → **Storage → don-anh**: xoá thư mục trùng `id` đó (chứa ảnh chụp).
3. Supabase → **SQL Editor** chạy (thay `<id>`):
   ```sql
   delete from fb_train where draft_id = '<id>';
   update fb_drafts set convo = '[]', anh = '{}' where id = '<id>';
   ```
4. Nhắn khách đã xoá xong. Hoá đơn đã duyệt vẫn giữ để đối soát doanh thu.

## Riêng tư

- Ảnh chụp lưu ở bucket riêng tư `don-anh`, chỉ tài khoản chủ quán xem được (link ảnh tự hết hạn sau 1 giờ).
- Ảnh được gửi cho Google Gemini để đọc. Gói Gemini miễn phí có thể dùng dữ liệu để cải thiện sản phẩm; muốn tránh thì bật **Cloud Billing** cho khoá hoặc dùng Claude API (`ANTHROPIC_API_KEY`).
- Dữ liệu huấn luyện: bản chép đoạn chat đã ẩn tên, SĐT, số tài khoản; địa chỉ giữ nguyên. Tải ở **Cài đặt bot → Tải dữ liệu huấn luyện**, dùng theo `tools/train/README.md`.

## Gỡ bot Fanpage cũ

Bot Fanpage tự trả lời (cập nhật 22) đã bỏ. Bảng dữ liệu cũ giữ nguyên, không ảnh hưởng.

- ✅ Đã xoá function `fb-bot` trên Supabase Test và Product (code cũ vẫn còn trong lịch sử git).
- Còn lại (không bắt buộc): xoá secret `FB_VERIFY_TOKEN`, `FB_APP_SECRET`, `FB_PAGE_TOKEN` trên Supabase; Meta for Developers → app **Bé Nốc Bot**: huỷ bản gửi xét duyệt, bỏ Callback URL hoặc xoá hẳn app.
