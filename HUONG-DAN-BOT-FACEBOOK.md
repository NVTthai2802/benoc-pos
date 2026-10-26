# Bot nhận đơn Fanpage Bé Nốc — hướng dẫn cài đặt (TEST rồi PRODUCT)

## Bot làm gì

Khách nhắn Fanpage Bé Nốc → bot hỏi đủ các ý:

- Ăn gì, uống gì (gọi đồ ăn mà chưa gọi nước thì gợi ý 1 lần, và ngược lại)
- Qua lấy / Ăn tại quán / Ship (có nút bấm nhanh)
- Giờ hẹn: giờ qua lấy, giờ đến quán, hoặc giờ nhận ship
- Địa chỉ + SĐT (chỉ khi ship)

Khách thiếu ý nào bot hỏi lại đúng ý đó. Đủ rồi, đơn hiện ở **Quản lý → Facebook**. Chủ quán mở đoạn chat đối chiếu, bấm **Duyệt → gửi bếp**: đơn sang bếp / pha chế như đơn thường, bot nhắn khách xác nhận kèm tổng tiền.

---

## Tiến độ

| Việc | Trạng thái |
|---|---|
| Chạy SQL cập nhật 21 (mã vạch kho) và 22 (đơn Facebook) trên Supabase TEST | ✅ Đã xong |
| Chạy SQL cập nhật 24 (dữ liệu huấn luyện) trên Supabase TEST, đưa lại bot `fb-bot` bản mới | ✅ Đã xong (xem phần "Dữ liệu huấn luyện" cuối file) |
| Đưa bot `fb-bot` lên Supabase TEST, tắt Verify JWT | ✅ Đã xong |
| Trang web test có tab Facebook, nút Quét mã | ✅ Đã xong |
| Lấy khoá AI | ⬜ Bước 1 |
| Tạo app Meta, lấy App secret + Page token | ⬜ Bước 2 |
| Nhập secret vào Supabase | ⬜ Bước 3 |
| Nối webhook Facebook với bot | ⬜ Bước 4 |
| Kiểm tra, nhắn thử | ⬜ Bước 5, 6 |
| PRODUCT: chạy SQL 21, 22, 24 | ✅ Đã xong 26/10 |
| PRODUCT: đưa bot `fb-bot` (tắt Verify JWT), đưa giao diện mới | ✅ Đã xong 26/10 |
| PRODUCT: nhập secret, đổi webhook Meta, kiểm tra | ⬜ Phần "Đưa lên PRODUCT" (P2, P4, P5, P6) |

**Địa chỉ bot (dùng ở Bước 4):**
```
https://bsnpcinocphuruahpzwr.supabase.co/functions/v1/fb-bot
```
Mở địa chỉ này trên trình duyệt thấy chữ "Bé Nốc fb-bot đang chạy" là bot đã sẵn sàng.

---

## Bước 1. Lấy khoá AI

Chọn **một** trong hai.

**Cách A — Gemini (khuyên dùng, có gói miễn phí):**
1. Vào https://aistudio.google.com bằng tài khoản Google (dùng luôn tài khoản đang có Gemini Pro).
2. Bấm **Get API key → Create API key** → chọn hoặc tạo một project Google Cloud.
3. Chép khoá (dạng `AIza…`), cất tạm vào Ghi chú.

Gói **Gemini Pro (Google AI Pro)** chỉ tăng lượt dùng trên web AI Studio / app Gemini, **không** áp vào khoá API mà bot dùng. Khoá API vẫn chạy gói miễn phí của Gemini API: có giới hạn số lượt, đủ cho quán nhỏ; Google có thể dùng dữ liệu gói miễn phí để cải thiện sản phẩm.

Nếu sau này cần nhiều lượt hơn hoặc không muốn Google dùng dữ liệu: bật **Cloud Billing** cho project của khoá. Người có Google AI Pro có thể được tặng credit Google Cloud hằng tháng qua Google Developer Program để trừ vào tiền API, xem trang [Google AI plans](https://ai.google.dev/gemini-api/docs/google-ai-plans).

Bot tự chọn model Gemini đang có (thử `gemini-3.8-flash`, rồi `gemini-3.5-flash-lite`, rồi `gemini-2.5-flash`), không cần cài thêm.

**Cách B — Claude (trả phí theo lượt dùng):**
1. Vào https://console.anthropic.com, đăng ký.
2. **Billing**: nạp tiền.
3. **API Keys → Create Key** → chép khoá (dạng `sk-ant-…`).

---

## Bước 2. Tạo app trên Meta for Developers

Dùng nick Facebook **đang là admin Fanpage Bé Nốc**.

1. Vào https://developers.facebook.com → **My Apps → Create App**.
2. Tên app: `Bé Nốc Bot`, email liên hệ: email của bạn.
3. Chọn use case **Engage with customers on Messenger from Meta**. Nếu hỏi loại app, chọn **Business**. Bấm tạo app.
4. Menu trái **App settings → Basic**:
   - **App secret** → bấm **Show** → nhập mật khẩu Facebook → chép, cất vào Ghi chú.
   - **Privacy Policy URL**: `https://benoc-pos.pages.dev/test/chinh-sach.html`
   - Bấm **Save changes**.
5. Menu trái **Use cases → Messenger → Customize → Messenger API Settings**.
6. Kéo tới mục **Generate access tokens**:
   - Bấm **Connect** (hoặc **Add Page**) → chọn Fanpage **Bé Nốc** → cho phép đủ quyền.
   - Bấm **Generate** cạnh Fanpage → tích đồng ý → chép token (chuỗi rất dài), cất vào Ghi chú.
   - Giữ nguyên trang này, Bước 4 quay lại.

---

## Bước 3. Nhập secret vào Supabase

1. Vào https://supabase.com/dashboard/project/bsnpcinocphuruahpzwr/functions/secrets
   (Supabase → dự án **benoc-pos-test** → **Edge Functions → Secrets**).
2. Ở khung **Add or replace secrets**, mỗi dòng nhập **Name** và **Value**, bấm **Add another** để thêm dòng:

| Name | Value |
|---|---|
| `FB_VERIFY_TOKEN` | Tự đặt một chuỗi, ví dụ `benoc-test-7Kq2xP9` (ghi lại, Bước 4 dùng) |
| `FB_APP_SECRET` | App secret ở Bước 2.4 |
| `FB_PAGE_TOKEN` | Token ở Bước 2.6 |

   Thêm khoá AI theo cách đã chọn ở Bước 1:

| Gemini | Claude |
|---|---|
| `GEMINI_API_KEY` = khoá `AIza…` (chỉ cần 1 dòng này, bot tự biết dùng Gemini) | `ANTHROPIC_API_KEY` = khoá `sk-ant-…` |

3. Bấm **Save**. Bảng **Custom secrets** bên dưới phải hiện đủ các tên vừa nhập.

---

## Bước 4. Nối webhook Facebook với bot

Quay lại trang **Messenger API Settings** ở Bước 2.5.

1. Mục **Configure webhooks**:
   - **Callback URL**: `https://bsnpcinocphuruahpzwr.supabase.co/functions/v1/fb-bot`
   - **Verify token**: đúng chuỗi `FB_VERIFY_TOKEN` ở Bước 3 (giống từng ký tự).
   - Bấm **Verify and save**.
2. Ở dòng Fanpage **Bé Nốc** (mục Generate access tokens hoặc Webhooks), bấm **Add subscriptions** → tích:
   - `messages`
   - `messaging_postbacks`
   - `message_echoes`

   → **Confirm / Save**.

Nếu **Verify and save** báo lỗi: kiểm tra verify token gõ có khớp không, và đã bấm Save secret ở Bước 3 chưa.

---

## Bước 5. Kiểm tra từ trang Quản lý

1. Mở https://benoc-pos.pages.dev/test/quanly.html, đăng nhập tài khoản **chủ quán**.
2. Tab **Facebook → Cài đặt bot**.
3. Bấm **Kiểm tra kết nối bot**. Phải hiện đủ 4 dấu ✅:
   - ✅ Nối Fanpage Bé Nốc
   - ✅ AI
   - ✅ App secret
   - ✅ Verify token
4. Bấm **Cài nút "Bắt đầu" trên Messenger**: khách mới mở chat sẽ thấy nút Bắt đầu, bấm vào là bot gửi mẫu đặt món.
5. Chỉnh **giờ nhận đơn** (mặc định 07:00–22:00), câu chào nếu muốn → **Lưu**.

Có dấu ❌ thì xem bảng **Khi có sự cố** cuối trang.

---

## Bước 6. Nhắn thử

App Meta mới tạo ở chế độ **Development**: bot **chỉ trả lời người có vai trò trong app**. Nick của bạn (người tạo app) dùng được ngay. Muốn người khác thử: Meta → **App roles → Roles → Add People → Tester**, người đó vào https://developers.facebook.com/requests để chấp nhận.

Dùng nick cá nhân nhắn vào Fanpage Bé Nốc lần lượt:

| Bạn nhắn | Bot phải làm |
|---|---|
| `2 ts trân châu ít đá, 1 cơm gà viên thêm trứng` | Tóm tắt đơn, hỏi qua lấy / ăn tại quán / ship (có nút) và giờ |
| Bấm nút **Ship**, nhắn `6r tối nhé` | Hỏi địa chỉ và SĐT |
| `12 ngõ 5 Nguyễn Trãi, 0912345678` | Báo đã gửi quán xác nhận |

Rồi vào **Quản lý → Facebook**:

1. Đơn nằm ở **Chờ duyệt** → bấm **Xem & duyệt**.
2. Bên trái là tin nhắn, bên phải là đơn bot tách → kiểm tra, sửa nếu sai → **Duyệt → gửi bếp**.
3. Messenger của bạn nhận tin "quán đã xác nhận" kèm tổng tiền.
4. Mở màn hình **Bếp** (trang test): có đơn **GIAO 18:00**, dòng **ĐẶT QUA FACEBOOK**. Bấm **Nhận đơn** là in phiếu như thường.

Thử thêm các trường hợp:

- Nhắn giờ đã qua → bot bảo chọn giờ khác.
- Nhắn món không có trong menu → bot báo chưa tìm thấy món.
- Nhắn `shipper giao trễ quá` → bot nhờ chủ quán, khách hiện ở khung **Khách cần bạn trả lời**.
- Bạn tự trả lời khách trong hộp thư Fanpage → bot im với khách đó 30 phút.
- Chọn **Ăn tại quán** → bếp thấy ô tím **ĐẶT BÀN hh:mm**; khách đến thì bấm **Sửa đơn** điền số bàn.

---

## Khi có sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| ❌ Chưa nối Fanpage | Token ở Bước 2.6 sai / hết hạn → tạo token mới, thay `FB_PAGE_TOKEN` |
| ❌ Chưa có khoá AI | Chưa nhập `GEMINI_API_KEY` hoặc `ANTHROPIC_API_KEY` |
| Bot không trả lời gì | Công tắc **Bot tự trả lời** đã bật chưa · người nhắn có phải Tester/admin app không · đã tích `messages` ở Bước 4.2 chưa · xem Supabase → Edge Functions → fb-bot → **Logs** |
| Bot luôn trả lời "chủ quán sẽ trả lời mình ngay" | Khoá AI sai, hết lượt hoặc hết tiền → xem Logs dòng "AI lỗi" |
| Duyệt được nhưng khách không nhận tin xác nhận | Đã quá 24 giờ từ tin cuối của khách (Facebook chặn) hoặc token hết hạn |
| Tab Facebook báo "Chưa cài bot" | Supabase của trang đó chưa có bot / secret (Test: `/test/quanly.html`, Product: `/quanly.html`) |

---

## Đưa lên PRODUCT (quán thật)

**Đã xong (26/10/2026):**
- Chạy SQL 21, 22, 24 trên Supabase Product (`benoc-pos`). Đơn cũ còn nguyên.
- Đưa bot `fb-bot` lên Product, đã **tắt Verify JWT**. Link `https://hixdacnaxfuxuccbajzn.supabase.co/functions/v1/fb-bot` hiện "Bé Nốc fb-bot đang chạy".
- Đưa giao diện mới lên https://benoc-pos.pages.dev/ (tab Facebook, nút Quét mã ở kho).

**Bạn làm tiếp:** P2 → P4 → P5 → P6 (P1, P3 đã xong, giữ lại để tham khảo khi cài lại).

### P1. Đưa bot `fb-bot` lên Supabase Product ✅
1. Supabase → project **benoc-pos** → **Edge Functions** → **Deploy a new function** → **Via Editor**, tên `fb-bot`, dán code `supabase/functions/fb-bot/index.ts` → **Deploy function**.
2. **fb-bot → Settings**: tắt **Verify JWT** → **Save changes**.

### P2. Nhập secret cho Product
Supabase **benoc-pos** → **Edge Functions → Secrets** (secret của Test không tự sang Product, phải nhập lại). Nhập 4 dòng, giá trị giống bên Test:

| Tên | Giá trị |
|---|---|
| `FB_VERIFY_TOKEN` | chuỗi bạn tự đặt (giống bên Test cũng được) |
| `FB_APP_SECRET` | App secret của app Meta |
| `FB_PAGE_TOKEN` | Page access token của Fanpage Bé Nốc |
| `GEMINI_API_KEY` hoặc `ANTHROPIC_API_KEY` | khoá AI |

### P3. Đưa giao diện mới lên quán ✅
Trong thư mục code (Git Bash / Terminal), nhánh `test` đã commit sạch:
```
bash scripts/dua-len-product.sh
```
Khoảng 1 phút sau, https://benoc-pos.pages.dev/ có tab **Facebook** và nút **Quét mã** ở kho. Mở **Quản lý** trên máy quán, tải lại trang (Ctrl+F5) để chắc chắn lấy bản mới.

### P4. Chuyển webhook Meta sang Product
1. Meta for Developers → app của quán → **Messenger → Messenger API Settings → Configure webhooks → Edit**.
2. Callback URL (URL gọi lại): `https://hixdacnaxfuxuccbajzn.supabase.co/functions/v1/fb-bot` (**hixdacnax…**, không phải bsnpcinoc… của Test) · Verify token (mã xác minh): đúng `FB_VERIFY_TOKEN` vừa nhập ở P2 → **Verify and save**.
   Báo "Không thể xác thực URL gọi lại hoặc mã xác minh": URL đang trỏ sang Test, hoặc chưa nhập `FB_VERIFY_TOKEN` ở Product, hoặc mã có dấu cách thừa.
3. **App settings → Basic → Privacy Policy URL**: `https://benoc-pos.pages.dev/chinh-sach.html` → Save.

Một app Meta chỉ có 1 Callback URL: chuyển sang Product thì bot Test thôi nhận tin. Muốn thử lại trên Test thì đổi URL về `https://bsnpcinocphuruahpzwr.supabase.co/functions/v1/fb-bot`.

### P5. Kiểm tra trên Product
1. Đăng nhập https://benoc-pos.pages.dev/quanly.html bằng tài khoản chủ quán → tab **Facebook → Cài đặt bot → Kiểm tra kết nối bot**: đủ 4 dấu ✅.
2. Dùng nick là admin / tester của app nhắn Fanpage một đơn thử → đơn hiện ở tab Facebook → **Huỷ** đơn thử (đừng Duyệt, kẻo thành đơn thật trong doanh thu).

### P6. Mở cho mọi khách
1. Meta → **App Review**: xin quyền **pages_messaging** (quay video bot đang chạy, mô tả cách dùng). Có thể cần xác minh doanh nghiệp. Duyệt xong, chuyển app sang **Live**. Trước khi Live, chỉ admin / tester của app nhắn mới được bot trả lời.
2. Đổi link đặt món trên nick cá nhân thành `m.me/<tên Fanpage>` để khách chuyển sang nhắn Fanpage.

Bot không tự tạo đơn thật: mọi đơn đều qua chủ quán duyệt, giá tính lại ở máy chủ theo menu và ưu đãi hiện tại.

---

## Dữ liệu huấn luyện (để sau này tự build mô hình)

Bot đọc tin khách bằng AI API (Gemini / Claude). Để dần thay bằng mô hình của riêng quán, bot tự thu dữ liệu từ bây giờ.

**Cài đặt (Supabase TEST):**
1. Chạy `sql/cap-nhat-24-du-lieu-huan-luyen.sql` trong SQL Editor (chạy sau cập nhật 22).
2. Đưa lại bot: Supabase → Edge Functions → `fb-bot` → dán code mới từ `supabase/functions/fb-bot/index.ts` → Deploy (vẫn tắt Verify JWT).

**Bot lưu gì:** mỗi lượt AI đọc tin khách, bot lưu đoạn chat (đã ẩn tên, SĐT, số tài khoản; **địa chỉ giữ nguyên** để mô hình học trích địa chỉ) + đơn đang ghi + đơn AI đọc ra. Chủ quán bấm **Duyệt** thì đơn đã duyệt được gắn vào làm **đáp án đúng**, kèm chỗ chủ quán phải sửa. Đơn bị huỷ không dùng làm đáp án.

**Dùng thế nào:**
- **Quản lý → Facebook → Cài đặt bot**: xem số mẫu, tỉ lệ bot đọc đúng, bật / tắt lưu, **Tải dữ liệu huấn luyện (.jsonl)**.
- Đo AI đọc đúng bao nhiêu % và các bước tự build mô hình: `tools/train/README.md`.
- Khách nhắn **“xoá dữ liệu của tôi”**: bot xoá tin nhắn, đơn nháp và mẫu huấn luyện của khách đó rồi nhắn lại xác nhận (hoá đơn đã duyệt vẫn giữ để đối soát doanh thu).

**Lưu ý riêng tư:**
- Việc ẩn tên, SĐT là cố gắng hết sức, không đảm bảo tuyệt đối. File tải về còn **địa chỉ khách**, chỉ để bạn dùng, đừng đăng công khai hay đưa lên dịch vụ ngoài.
- Khi còn dùng API, tin nhắn khách vẫn gửi cho Google / Anthropic. Gemini gói miễn phí có thể dùng dữ liệu để cải thiện sản phẩm; muốn tránh thì bật **Cloud Billing** cho khoá Gemini hoặc dùng Claude API.
- Trang chính sách riêng tư (`chinh-sach.html`) đã ghi rõ việc lưu dữ liệu huấn luyện và cách xoá.
