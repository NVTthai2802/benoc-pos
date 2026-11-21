# Cơ sở dữ liệu Supabase — migrations

Từ 22/11/2026, mọi thay đổi cấu trúc cơ sở dữ liệu đi qua thư mục `supabase/migrations/` (chuẩn Supabase CLI),
thay cho việc dán tay từng tệp `sql/cap-nhat-*.sql` vào SQL Editor.

- `20261122000000_baseline.sql`: toàn bộ cấu trúc của Product lúc đó (34 bảng, 75 hàm, 57 chính sách RLS, trigger,
  realtime, 5 kho ảnh). Sinh tự động từ `pg_catalog`, đã chạy thử sạch trên PostgreSQL 16 trống.
  Đã đánh dấu "đã chạy" trên Product — **không chạy lại trên Product**. Dùng để dựng một Supabase mới (ví dụ môi trường thử).
- 4 tệp ngày 21/11 trước baseline chỉ để khớp số phiên bản Supabase đã ghi.
- `sql/` giữ lại làm lịch sử (cap-nhat-2 … 46), không chạy nữa.

## Thêm thay đổi mới

```bash
npx supabase migration new ten-thay-doi       # tạo supabase/migrations/<thời gian>_ten-thay-doi.sql
# viết SQL vào tệp đó
npx supabase db push --db-url "$SUPABASE_DB_URL"  # chạy các migration chưa chạy lên Product
```

`SUPABASE_DB_URL` lấy ở Supabase → Project Settings → Database → Connection string (URI), không đưa lên GitHub.

## Kiểu dữ liệu TypeScript

`src/types/database.ts` sinh từ cơ sở dữ liệu: `npx supabase gen types typescript --project-id hixdacnaxfuxuccbajzn > src/types/database.ts`
(cần `supabase login`). Sinh lại mỗi khi thêm migration.
