# Theo dõi chi phí cloud và token AI

Trang Monitoring (`/dashboard` của bot `benoc-health-bot`) có thêm mục **Chi phí & hạn mức**:

- **Token AI**: mỗi lần `bot-don` / `chup-chat` gọi Gemini hay Claude, function ghi 1 dòng vào bảng `ai_usage` (model, token vào / ra / suy nghĩ, thời gian). Không ghi nội dung tin nhắn hay ảnh.
- **Tiền AI**: tính từ bảng giá `ai_prices` theo ngày gọi, quy ra đồng theo tỷ giá trong `cost_settings`. Có 2 con số: **thật** (gói miễn phí = 0đ) và **nếu trả tiền** (để biết trước khi bật thanh toán).
- **Hạn mức cloud**: mỗi giờ bot đọc số lượt gọi Workers / KV của Cloudflare và egress, lượt gọi API, lượt gọi Edge Function của Supabase, lưu vào `cloud_usage`.
- **Cảnh báo Telegram** (mỗi loại tối đa 1 lần / ngày): AI 1 ngày tốn quá ngưỡng, dự báo cả tháng vượt ngân sách, bị chặn hạn mức (HTTP 429) từ 5 lần / ngày, hạn mức gói miễn phí dùng quá 80%.
- **Báo cáo 7h sáng** thêm mục "— Chi phí —": AI hôm qua, tháng này, dự báo, hạn mức dùng nhiều nhất.

## Cài đặt (làm theo thứ tự)

### 1. Supabase: chạy migration

```bash
npx supabase db push --db-url "$SUPABASE_DB_URL"
```

Hoặc dán `supabase/migrations/20261127090000_chi_phi_cloud_ai.sql` vào SQL Editor. Chạy lại vẫn an toàn.

### 2. Supabase: deploy lại 2 function

```bash
npx supabase functions deploy bot-don --no-verify-jwt
npx supabase functions deploy chup-chat --no-verify-jwt
```

Không cần thêm secret. Chưa chạy bước 1 thì function chỉ ghi cảnh báo vào log, đơn vẫn lên bình thường.

### 3. Cloudflare: cập nhật Worker `benoc-health-bot`

1. Trong thư mục `cloudflare/benoc-health-bot` chạy `node build.mjs` (đã build sẵn `worker.js`).
2. Cloudflare → Workers → `benoc-health-bot` → **Edit code** → dán toàn bộ `worker.js` → **Deploy**.
3. **Settings → Variables and Secrets**, thêm:

| Tên | Loại | Lấy ở đâu |
|---|---|---|
| `CF_ACCOUNT_ID` | Text | Cloudflare → Workers & Pages → cột phải "Account ID" |
| `CF_API_TOKEN` | Secret | My Profile → API Tokens → Create Token → Custom token → quyền **Account → Account Analytics → Read** (chỉ quyền này) |
| `SUPABASE_PAT` | Secret, tuỳ chọn | supabase.com/dashboard/account/tokens → Generate new token, đặt ngày hết hạn |

> `SUPABASE_PAT` có quyền trên **toàn bộ tài khoản Supabase** của bạn (không giới hạn 1 project). Chỉ lưu dạng Secret, đặt hạn dùng, và thu hồi ngay nếu nghi lộ. Không muốn rủi ro này thì bỏ qua: trang vẫn có chi phí AI, Cloudflare, dung lượng DB / Storage; egress thì xem tay ở Supabase → Organization → Usage.

4. Thu số liệu ngay, không cần đợi 1 giờ:

```bash
curl -X POST -H "x-key: <DASH_KEY>" https://<worker>/api/cost
```

Kết quả có `notes` báo bước nào còn lỗi (token sai quyền, chưa chạy migration…).

## Chỉnh cài đặt

Mọi cài đặt nằm trong bảng `cost_settings` (1 dòng). Sửa trong SQL Editor:

```sql
-- Đã bật thanh toán (Cloud Billing) cho khoá Gemini:
update cost_settings set gemini_paid = true where id = 1;

-- Ngân sách AI / tháng, ngưỡng báo 1 ngày, ngưỡng % hạn mức
update cost_settings set budget_vnd_month = 200000, alert_ai_day_vnd = 15000, alert_quota_pct = 80 where id = 1;

-- Tỷ giá
update cost_settings set usd_vnd = 26300 where id = 1;

-- Hạn mức lượt gọi / ngày của gói miễn phí Gemini (xem trong Google AI Studio → Rate limit), để bot báo khi sắp hết
update cost_settings set gemini_rpd = '{"gemini-3.5-flash-lite": 1000, "gemini-3.5-flash": 250}' where id = 1;

-- Chi phí cố định (tên miền, gói Zalo OA…): vnd_thang hoặc vnd_nam
update cost_settings set fixed_costs = '[{"ten":"Tên miền","vnd_nam":300000}]' where id = 1;
```

Số `gemini_rpd` ở trên chỉ là ví dụ; lấy số thật trong AI Studio vì Google đổi hạn mức theo từng tài khoản.

## Khi hãng đổi giá hoặc dùng model mới

Thêm dòng mới, **không sửa dòng cũ** (để số liệu tháng trước vẫn đúng giá lúc đó):

```sql
insert into ai_prices (model, valid_from, in_usd, out_usd, cached_usd, note)
values ('gemini-3.8-flash', '2027-01-01', 1.50, 7.50, 0.15, 'giá chuẩn từ 1/1/2027');
```

Model chưa có giá sẽ hiện "(chưa có giá)" trên trang và trong báo cáo 7h. Giá trong migration kiểm ngày 27/11/2026:

| Model | Vào | Ra (gồm suy nghĩ) | Ghi chú |
|---|---|---|---|
| gemini-3.5-flash | $1.50 | $9.00 | chup-chat dùng model này |
| gemini-3.5-flash-lite | $0.30 | $2.50 | bot-don dùng trước tiên |
| gemini-2.5-flash | $0.30 | $2.50 | |
| gemini-3.8-flash | $0.75 → $1.50 từ 1/1/2027 | $3.75 → $7.50 | giá giới thiệu hết 31/12/2026, đã nhập sẵn cả 2 mức |
| claude-haiku-5-5 | $0.10 | $0.50 | prompt dưới 100K token |

## Lưu ý về độ chính xác

- Token lấy từ chính phản hồi của Gemini (`usageMetadata`) / Claude (`usage`), nên khớp hoá đơn; lượt gọi lỗi không tính tiền.
- Egress Supabase là **ước tính** từ nhật ký API: chỉ cộng phản hồi có ghi độ dài, nên thường thấp hơn số thật. Số chính xác ở trang Usage của Supabase.
- Hạn mức Cloudflare reset 00:00 UTC (7h sáng giờ VN); ngày trên biểu đồ Cloudflare / Supabase là ngày UTC.
- Bot Worker tự gọi Supabase khoảng 900 lần / ngày để đo sức khoẻ (đường `/storage/v1/bucket`, `/auth/v1/health`…); số này nằm trong biểu đồ "Lượt gọi Supabase".
