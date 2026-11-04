-- =====================================================================
-- CẬP NHẬT 34: OCR TRÊN MÁY (app Android, chế độ TEST) — LƯU SONG SONG ĐỂ SO VỚI GEMINI
--   App Android ở chế độ TEST tự đọc chữ ảnh chụp bằng mô hình nhẹ chạy trên điện thoại
--   (PP-OCRv5 mobile, ONNX), gửi kèm ảnh vào bot-don. Gemini VẪN đọc ảnh và lên đơn như cũ;
--   kết quả OCR chỉ được lưu vào bảng ocr_mau (kèm 1 bản ảnh trong bucket don-anh/ocr-mau/)
--   để đo: tốc độ trên máy, và tỉ lệ sai ký tự so với đoạn chat Gemini chép ra.
--   Ảnh + chữ ở đây là chat thật của khách (CHƯA ẩn tên / SĐT): chỉ chủ quán xem được.
-- CHỈ CHẠY TRÊN SUPABASE TEST. Product không cần (thiếu bảng thì bot chỉ ghi log, đơn vẫn lên).
-- Chạy lại vẫn an toàn.
-- =====================================================================
begin;

create table if not exists ocr_mau (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  device        text not null,              -- tên máy (x-device)
  ref           text,                       -- ảnh tạm bot-don đọc (ios-tam/…): để gắn với đơn khi Gemini đọc xong
  anh           text,                       -- bản ảnh lưu lại: don-anh/ocr-mau/<ngày>/<uuid>.jpg
  model         text,                       -- mô hình app dùng, vd "PP-OCRv5_mobile_det + latin_PP-OCRv5_mobile_rec"
  w             int,                        -- kích thước ảnh (toạ độ dòng tính theo ảnh này)
  h             int,
  det_ms        int,                        -- thời gian phát hiện vùng chữ trên máy
  rec_ms        int,                        -- thời gian đọc chữ tất cả các dòng trên máy
  n_dong        int,
  lines         jsonb not null default '[]',-- [{"b":[x0,y0,x1,y1],"t":"chữ","c":0.97}]
  chu           text,                       -- các dòng nối lại theo thứ tự đọc
  draft_id      uuid,                       -- đơn Gemini lên từ ảnh này
  gemini_convo  jsonb,                      -- đoạn chat Gemini chép ra: [{"s":"khach|quan","t":"…"}]
  cer_gemini    numeric,                    -- % sai ký tự của OCR, lấy chữ Gemini làm đáp án tạm
  n_ky_tu       int,                        -- số ký tự đã so
  dap_an        text                        -- (để trống) chép tay đúng nguyên văn ảnh khi làm bộ đánh giá
);
create index if not exists ocr_mau_ref on ocr_mau(ref);
create index if not exists ocr_mau_time on ocr_mau(created_at desc);

alter table ocr_mau enable row level security;
drop policy if exists ocr_mau_owner on ocr_mau;
create policy ocr_mau_owner on ocr_mau for select using (my_role() = 'owner');
drop policy if exists ocr_mau_owner_del on ocr_mau;
create policy ocr_mau_owner_del on ocr_mau for delete using (my_role() = 'owner');
drop policy if exists ocr_mau_owner_upd on ocr_mau;
create policy ocr_mau_owner_upd on ocr_mau for update using (my_role() = 'owner') with check (my_role() = 'owner');
revoke all on ocr_mau from anon, authenticated;
grant select, delete on ocr_mau to authenticated;
grant update (dap_an) on ocr_mau to authenticated;
revoke all on sequence ocr_mau_id_seq from anon, authenticated;

-- Tổng hợp theo mô hình: xem ở SQL Editor bằng  select * from ocr_tong_hop;
create or replace view ocr_tong_hop with (security_invoker = true) as
select model,
       count(*)                                                      as so_anh,
       round(avg(det_ms))                                            as det_ms_tb,
       round(avg(rec_ms))                                            as rec_ms_tb,
       round(avg(det_ms + rec_ms))                                   as tong_ms_tb,
       percentile_cont(0.9) within group (order by det_ms + rec_ms)  as tong_ms_p90,
       round(avg(n_dong), 1)                                         as dong_tb,
       count(cer_gemini)                                             as so_anh_da_so,
       round(sum(cer_gemini * n_ky_tu) / nullif(sum(n_ky_tu) filter (where cer_gemini is not null), 0), 2) as cer_gemini_pct
from ocr_mau group by model order by max(created_at) desc;
grant select on ocr_tong_hop to authenticated;

commit;
