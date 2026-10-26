-- =====================================================================
-- CẬP NHẬT 26: ĐƠN ONLINE HIỆN NGAY (realtime)
--   Bot lên đơn nháp là tab "Đơn online" của chủ quán hiện ngay, không phải đợi tự tải lại.
--   Chỉ chủ quán nhận được (theo quyền đọc của bảng fb_drafts). Chạy sau cập nhật 25. Chạy lại vẫn an toàn.
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fb_drafts') then
    alter publication supabase_realtime add table fb_drafts;
  end if;
end $$;

select 'Đơn online đã hiện tức thì' as ket_qua;
