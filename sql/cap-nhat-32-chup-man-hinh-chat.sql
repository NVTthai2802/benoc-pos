-- Cập nhật 32 · Nhận ảnh chụp màn hình đoạn chat từ iPhone (Phím tắt / Shortcut)
-- Chạy trên Supabase PRODUCT → SQL Editor. Chạy lại nhiều lần cũng không sao.
-- Chỉ THÊM bảng + bucket mới. Không sửa bảng đơn, bếp, bot Zalo.
-- Giai đoạn này CHỈ chép lại nội dung ảnh, chưa tạo đơn.

create table if not exists public.chat_captures (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  source        text not null default 'ios-shortcut',
  device        text,                              -- vd "iPhone chủ quán"
  image_path    text not null,                     -- đường dẫn trong bucket chat-captures
  image_sha256  text not null unique,              -- chống gửi trùng 1 ảnh
  image_bytes   integer,
  image_type    text,
  ios_text      text,                              -- (tuỳ chọn) chữ do iPhone tự đọc, để so sánh
  ai_model      text,                              -- model đã chép ảnh
  ai_ms         integer,                           -- thời gian chép (ms)
  ai_json       jsonb,                             -- bản chép có cấu trúc: từng bong bóng, bên trái/phải
  ai_text       text,                              -- bản chép dạng chữ để đọc nhanh
  ai_error      text,
  status        text not null default 'new'
                check (status in ('new','seen','labeled','ignored')),
  label_json    jsonb,                             -- bản đã sửa tay = nhãn đúng để huấn luyện / chấm điểm
  note          text
);

create index if not exists chat_captures_created_idx
  on public.chat_captures (created_at desc);

-- RLS bật, KHÔNG có policy: chỉ Edge Function (service role) đọc/ghi.
alter table public.chat_captures enable row level security;

-- Bucket ảnh riêng tư; ảnh chỉ xem qua link ký tạm 1 giờ.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-captures', 'chat-captures', false, 8388608)
on conflict (id) do nothing;
