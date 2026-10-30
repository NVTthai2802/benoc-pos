# SECRETS_EXPOSURE Security Report

## Status: LOW

## Findings

- `config.js`: chỉ có 2 **anon key** Supabase (Product `hixdacnaxfuxuccbajzn`, Test `bsnpcinocphuruahpzwr`). Đã giải mã JWT: cả hai là `"role":"anon"` — key công khai, được phép nằm ở frontend.
- Quét toàn bộ lịch sử git (213 commit, đã `--unshallow`) tìm `service_role` JWT, `sb_secret_`, `sk-ant-`, `AIza…` (Gemini), token bot Telegram (`123:AA…`), `sk_live_`, `AKIA`, private key: **không có**.
- Không có file `.env`, `.pem`, dump, `.bak` nào từng được commit.
- Token bot Zalo/Telegram, khoá Gemini/Anthropic, service key đều đọc từ Supabase Secrets (`Deno.env`) trong `supabase/functions/bot-don/index.ts`. Đúng cách.
- `tools/train/sample_export.jsonl` là dữ liệu mẫu tự tạo (thread_hash `aaaa…`), không chứa SĐT / tên khách thật. `tools/train/data/` đã nằm trong `.gitignore`.
- **Lưu ý (LOW):** Cloudflare Pages xuất bản **toàn bộ thư mục gốc**, nên `sql/`, `supabase/functions/`, `tools/`, `scripts/`, `HUONG-DAN*.md` ai cũng tải được. Không lộ bí mật nhưng lộ toàn bộ cấu trúc database và logic bot cho người muốn tấn công.
- Không quét live được (`benoc-pos.pages.dev` bị mạng của môi trường chặn), nên chưa xác nhận `/.git/config`, `/.env` trả 404 trên bản thật. Cloudflare Pages build từ git không xuất bản `.git/`.
- `gitleaks` chưa cài (cài: `brew install gitleaks` hoặc tải ở https://github.com/gitleaks/gitleaks/releases); đã thay bằng quét regex toàn lịch sử ở trên.

## What's at risk

Kẻ xấu đọc được `sql/schema.sql` để biết hàm nào gọi được, bảng nào có gì (giúp tìm lỗi như mục DATABASE_ACCESS).

## What's already secure

Không có secret thật nào trong mã hoặc lịch sử git. Khoá AI / bot nằm trong Supabase Secrets.

## Recommendations

1. (Tuỳ chọn) Tách phần web ra thư mục riêng (vd `web/`) và đặt *Build output directory* của Cloudflare Pages là thư mục đó, để `sql/`, `supabase/`, `tools/` không bị xuất bản.
2. Chạy `gitleaks detect --source . --verbose` định kỳ.
