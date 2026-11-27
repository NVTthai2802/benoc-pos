# benoc-health-bot (Cloudflare Worker)

Bot sức khoẻ + trang Monitoring + theo dõi chi phí của Bé Nốc POS.

- `src/worker.js`: logic (đo mỗi 5 phút, cảnh báo, báo cáo 7h, thu hạn mức / chi phí mỗi giờ).
- `src/dashboard.html`: trang `/dashboard`.
- `worker.js`: tệp ghép sẵn để dán vào Cloudflare → Edit code. **Không sửa tay**: sửa ở `src/` rồi chạy `node build.mjs`.

Cron cần có: `*/5 * * * *` và `0 0 * * *`. Biến / secret xem đầu `src/worker.js`; phần chi phí xem `HUONG-DAN-CHI-PHI.md` ở gốc repo.
