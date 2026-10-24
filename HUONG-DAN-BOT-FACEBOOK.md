# Bot nhận đơn Fanpage Bé Nốc — cài đặt môi trường TEST

Bot đọc tin nhắn khách gửi Fanpage, hỏi đủ các ý rồi đưa đơn vào **Quản lý → Facebook** để chủ quán duyệt:

| Bot hỏi | Khi nào |
|---|---|
| Món ăn, đồ uống | luôn hỏi (gọi đồ ăn mà chưa gọi nước thì gợi ý 1 lần, và ngược lại) |
| Qua lấy / Ăn tại quán / Ship | luôn hỏi, có nút bấm nhanh |
| Giờ hẹn | cả 3 loại: giờ qua lấy, giờ đến quán, giờ nhận ship |
| Địa chỉ + SĐT | chỉ khi ship |

Khách gửi thiếu ý nào bot hỏi lại đúng ý đó. Đủ rồi thì báo khách "đã gửi quán xác nhận". Chủ quán duyệt xong, bot nhắn khách tổng tiền và giờ hẹn; đơn sang bếp như đơn thường.

```
Khách nhắn Fanpage → Meta gửi tới → Supabase Edge Function "fb-bot" → AI tách đơn → bảng fb_drafts
                                                  ↓ trả lời / hỏi lại khách
Chủ quán: Quản lý → Facebook → Duyệt → đơn thật → bếp / pha chế (Nhận đơn thì in phiếu)
```

Làm hết trên **Supabase TEST** (`benoc-pos-test`) trước. Ổn rồi mới làm lại các bước tương tự cho Product.

---

## Bước 1. Chạy SQL trên Supabase TEST

Supabase → dự án **benoc-pos-test** → **SQL Editor**, dán từng file rồi **Run**:

1. `sql/cap-nhat-21-ma-vach-kho.sql` (mã vạch kho)
2. `sql/cap-nhat-22-don-facebook.sql` (đơn Facebook)

## Bước 2. Đưa bot lên Supabase (Edge Function)

**Cách dễ — trên web Supabase:**

1. **Edge Functions → Deploy a new function → Via Editor**.
2. Đặt tên đúng **`fb-bot`**, xoá code mẫu, dán toàn bộ file `supabase/functions/fb-bot/index.ts`, bấm **Deploy**.
3. Mở function **fb-bot → Details** (hoặc Settings), **tắt "Verify JWT" / "Enforce JWT verification"** rồi lưu. Facebook không gửi JWT; bot tự kiểm tra chữ ký Facebook.
4. Chép **địa chỉ function**, dạng:
   `https://bsnpcinocphuruahpzwr.supabase.co/functions/v1/fb-bot`
   Mở thử trên trình duyệt phải thấy chữ **"Bé Nốc fb-bot đang chạy"**.

**Cách dùng máy tính (nếu đã cài Node):** `npx supabase functions deploy fb-bot --project-ref bsnpcinocphuruahpzwr` (file `supabase/config.toml` đã tắt sẵn Verify JWT).

Sửa code bot sau này: dán lại file `index.ts` vào editor rồi Deploy.

## Bước 3. Lấy khoá AI

Chọn **một** trong hai:

| | Claude (mặc định) | Gemini |
|---|---|---|
| Lấy khoá | https://console.anthropic.com → API Keys (cần nạp tiền, tính theo lượt dùng) | https://aistudio.google.com → Get API key (có gói miễn phí) |
| Secret | `ANTHROPIC_API_KEY` | `GEMINI_API_KEY` và `AI_PROVIDER` = `gemini` |
| Model | `claude-haiku-5-5` (đổi bằng `CLAUDE_MODEL`) | `gemini-2.5-flash` (đổi bằng `GEMINI_MODEL`) |

Lưu ý: gói miễn phí của Gemini có thể dùng dữ liệu gửi lên để cải thiện sản phẩm của Google; gói trả phí thì không.

## Bước 4. Tạo app trên Meta for Developers

1. Vào https://developers.facebook.com bằng nick Facebook **đang là admin Fanpage Bé Nốc** → **My Apps → Create App**.
2. Tên app: `Bé Nốc Bot`. Use case chọn **Engage with customers on Messenger from Meta** (Messenger). Nếu được hỏi loại app, chọn **Business**.
3. **App settings → Basic**:
   - Chép **App secret** (bấm Show) → dùng cho secret `FB_APP_SECRET` ở Bước 5.
   - **Privacy Policy URL**: `https://benoc-pos.pages.dev/test/chinh-sach.html` (trang có sẵn trong repo, chủ quán đọc lại nội dung trước khi dùng thật).
   - Lưu.
4. **Use cases → Messenger → Customize → Messenger API Settings**:
   - Mục **Generate access tokens**: **Connect / Add Page** → chọn Fanpage **Bé Nốc** → cấp đủ quyền → bấm **Generate** → chép token → dùng cho `FB_PAGE_TOKEN`.
   - Để mục **Configure webhooks** cho Bước 6.

## Bước 5. Nhập secret cho bot

Supabase TEST → **Edge Functions → Secrets** (hoặc Project Settings → Edge Functions) → thêm:

| Tên | Giá trị |
|---|---|
| `FB_VERIFY_TOKEN` | tự đặt một chuỗi khó đoán, ví dụ `benoc-test-7Kq2xP9` |
| `FB_APP_SECRET` | App secret ở Bước 4.3 |
| `FB_PAGE_TOKEN` | Page token ở Bước 4.4 |
| `ANTHROPIC_API_KEY` **hoặc** `GEMINI_API_KEY` + `AI_PROVIDER=gemini` | Bước 3 |
| `BOT_PAUSE_MINUTES` (không bắt buộc) | chủ quán tự nhắn thì bot im bao nhiêu phút, mặc định 30 |

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` Supabase tự có, không cần thêm.

## Bước 6. Nối webhook

Meta → **Messenger API Settings → Configure webhooks**:

1. **Callback URL**: địa chỉ function ở Bước 2.4.
2. **Verify token**: đúng chuỗi `FB_VERIFY_TOKEN` ở Bước 5.
3. Bấm **Verify and save**. Báo lỗi thì kiểm tra lại Verify JWT đã tắt chưa và verify token có giống hệt không.
4. Ở dòng Fanpage Bé Nốc, bấm **Add subscriptions** → tích **messages**, **messaging_postbacks**, **message_echoes** → Save.

## Bước 7. Kiểm tra từ trang Quản lý

Mở https://benoc-pos.pages.dev/test/quanly.html bằng tài khoản chủ quán → tab **Facebook** → **Cài đặt bot**:

- **Kiểm tra kết nối bot**: phải hiện đủ 4 dấu ✅ (Fanpage, AI, App secret, Verify token).
- **Cài nút "Bắt đầu" trên Messenger**: khách mới mở chat sẽ thấy nút Bắt đầu, bấm vào là bot gửi mẫu đặt món.
- Chỉnh **giờ nhận đơn** (mặc định 07:00–22:00) và câu chào nếu muốn.

## Bước 8. Nhắn thử

Khi app còn ở chế độ **Development**, bot **chỉ trả lời người có vai trò trong app**. Thêm người test: Meta → **App roles → Roles → Add People → Tester** (người đó phải chấp nhận lời mời). Dùng nick cá nhân của bạn (đã là admin app) nhắn Fanpage là thử được ngay.

Kịch bản thử:

1. Nhắn: `2 ts trân châu ít đá, 1 cơm gà viên thêm trứng` → bot tóm tắt đơn, hỏi qua lấy / ăn tại quán / ship (có nút) và giờ.
2. Bấm **Ship**, nhắn `6r tối nhé` → bot hỏi địa chỉ và SĐT.
3. Nhắn địa chỉ + SĐT → bot báo đã gửi quán xác nhận.
4. Trang Quản lý → **Facebook**: đơn ở **Chờ duyệt** → **Xem & duyệt** → **Duyệt → gửi bếp** → khách nhận tin xác nhận, màn hình bếp có đơn **GIAO 18:30 · ĐẶT QUA FACEBOOK**.
5. Thử thêm: nhắn giờ đã qua, nhắn món không có trong menu, nhắn "shipper giao trễ quá" (bot phải nhờ chủ quán), tự trả lời khách trong hộp thư Fanpage (bot phải im).

## Bước 9. Mở cho mọi khách (sau khi test ổn)

- Meta yêu cầu **xét duyệt quyền `pages_messaging`** (App Review) và chuyển app sang **Live** thì bot mới trả lời khách bình thường. Trong Messenger API Settings có mục **Complete App Review** hướng dẫn từng bước (quay video bot đang chạy, mô tả cách dùng). Có thể cần xác minh doanh nghiệp.
- Làm lại Bước 1, 2, 5, 6 trên Supabase **Product** (địa chỉ function đổi thành `https://hixdacnaxfuxuccbajzn.supabase.co/functions/v1/fb-bot`), Privacy Policy URL đổi thành `https://benoc-pos.pages.dev/chinh-sach.html`.
- Ghim link `m.me/<tên Fanpage>` lên nick cá nhân / bài ghim để khách chuyển sang nhắn Fanpage.

## Khi có sự cố

| Hiện tượng | Xem ở đâu |
|---|---|
| Bot không trả lời | Supabase → Edge Functions → fb-bot → **Logs**. Kiểm tra công tắc **Bot tự trả lời** đã bật, khách có đang bị "bot im" không (vừa có người tự nhắn), app còn Development thì khách phải là Tester |
| Bot trả lời "chủ quán sẽ trả lời mình ngay" liên tục | Khoá AI sai / hết tiền / sai tên model → xem Logs dòng "AI lỗi" |
| Duyệt được nhưng khách không nhận tin xác nhận | Quá 24 giờ kể từ tin cuối của khách (Facebook không cho Page nhắn tiếp) hoặc Page token hết hạn → tạo token mới ở Bước 4.4 |
| Tab Facebook báo "Chưa cài bot" | Chưa chạy `sql/cap-nhat-22-don-facebook.sql` |

Bot không tự tạo đơn thật: mọi đơn đều qua chủ quán duyệt, giá tính lại ở máy chủ theo menu và ưu đãi hiện tại.
