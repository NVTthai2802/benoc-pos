-- =====================================================================
-- CẬP NHẬT 25: LÊN ĐƠN TỪ ẢNH CHỤP MÀN HÌNH (bot Zalo / Telegram)
--   * Chủ quán vẫn tự nhắn khách trên Facebook. Chụp màn hình đoạn chat, gửi cho bot
--     Zalo (hoặc Telegram) của quán → bot (Edge Function "bot-don") đọc ảnh, tách món,
--     giờ hẹn, địa chỉ… thành ĐƠN NHÁP chờ duyệt trong tab "Đơn online" (bảng fb_drafts cũ).
--   * Chỉ tài khoản Zalo / Telegram đã KẾT NỐI bằng mã lấy trong trang Quản lý mới dùng được bot.
--   * Ảnh chụp lưu ở bucket riêng tư "don-anh" (chỉ chủ quán xem) để đối chiếu khi duyệt.
--   * Bot Fanpage tự trả lời (cập nhật 22) thôi dùng: các bảng cũ vẫn giữ, không xoá dữ liệu.
-- Chạy sau cập nhật 24. Chỉ thêm bảng / cột / hàm. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

-- 1. Đơn nháp: thêm nguồn (kênh), ảnh chụp, bản chép đoạn chat, người gửi
alter table fb_drafts alter column psid drop not null;
alter table fb_drafts add column if not exists kenh      text not null default 'fb';
alter table fb_drafts drop constraint if exists fb_drafts_kenh_check;
alter table fb_drafts add constraint fb_drafts_kenh_check check (kenh in ('fb', 'zalo', 'tele'));
alter table fb_drafts add column if not exists chat_id   text;                       -- tài khoản Zalo / Telegram đã gửi ảnh (để bot nhắn lại)
alter table fb_drafts add column if not exists nguoi_gui text;                       -- tên người gửi ảnh
alter table fb_drafts add column if not exists anh       text[] not null default '{}'; -- đường dẫn ảnh trong bucket don-anh
alter table fb_drafts add column if not exists convo     jsonb not null default '[]';  -- đoạn chat bot chép lại từ ảnh [{"s":"khach|quan","t":"…"}]
create index if not exists fb_drafts_chat on fb_drafts(kenh, chat_id, updated_at desc) where chat_id is not null;

-- 2. Tài khoản Zalo / Telegram được dùng bot
create table if not exists bot_users (
  kenh       text not null check (kenh in ('zalo', 'tele')),
  chat_id    text not null,
  name       text,
  created_at timestamptz not null default now(),
  primary key (kenh, chat_id)
);
alter table bot_users enable row level security;
drop policy if exists bot_users_owner_read on bot_users;
create policy bot_users_owner_read on bot_users for select using (my_role() = 'owner');
drop policy if exists bot_users_owner_del on bot_users;
create policy bot_users_owner_del on bot_users for delete using (my_role() = 'owner');
revoke all on bot_users from anon, authenticated;
grant select, delete on bot_users to authenticated;

-- 3. Ảnh đang chờ đọc (bot gom các ảnh gửi liền nhau thành 1 đơn). Chỉ bot dùng (service_role).
create table if not exists bot_photos (
  id         bigserial primary key,
  kenh       text not null,
  chat_id    text not null,
  ref        text not null,            -- link ảnh (Zalo) hoặc file_id (Telegram)
  caption    text,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bot_photos_wait on bot_photos(kenh, chat_id, id) where not done;
alter table bot_photos enable row level security;
revoke all on bot_photos from anon, authenticated;

-- 4. Mã kết nối: chủ quán bấm "Lấy mã" trong Quản lý, nhắn mã cho bot trong 10 phút
create table if not exists private.bot_link (
  code       text primary key,
  until      timestamptz not null,
  created_by text
);
create or replace function bot_link_code() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_code text; v_until timestamptz := now() + interval '10 minutes'; v_emp employees;
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  delete from private.bot_link where until < now();
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  select * into v_emp from employees where id = my_employee_id();
  insert into private.bot_link (code, until, created_by) values (v_code, v_until, v_emp.full_name)
    on conflict (code) do update set until = excluded.until, created_by = excluded.created_by;
  return jsonb_build_object('code', v_code, 'until', v_until);
end $$;
grant execute on function bot_link_code() to authenticated;

-- Bot đổi mã lấy quyền dùng (chỉ service_role gọi được)
create or replace function private.bot_link_use(p_code text, p_kenh text, p_chat text, p_name text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from private.bot_link where code = p_code and until >= now();
  if not found then return false; end if;
  insert into bot_users (kenh, chat_id, name) values (p_kenh, p_chat, left(p_name, 80))
    on conflict (kenh, chat_id) do update set name = excluded.name;
  return true;
end $$;
revoke all on function private.bot_link_use(text, text, text, text) from public;
create or replace function bot_link_use(p_code text, p_kenh text, p_chat text, p_name text) returns boolean
language sql security definer set search_path = public as $$ select private.bot_link_use(p_code, p_kenh, p_chat, p_name) $$;
revoke all on function bot_link_use(text, text, text, text) from public, anon, authenticated;
grant execute on function bot_link_use(text, text, text, text) to service_role;

-- 5. Ảnh chụp: bucket riêng tư, chỉ chủ quán xem (bot tải lên bằng service_role)
insert into storage.buckets (id, name, public) values ('don-anh', 'don-anh', false) on conflict (id) do nothing;
drop policy if exists don_anh_view on storage.objects;
create policy don_anh_view on storage.objects for select to authenticated
  using (bucket_id = 'don-anh' and public.my_role() = 'owner');

commit;

select 'Đã thêm lên đơn từ ảnh chụp' as ket_qua, (select count(*) from bot_users) as so_tai_khoan;
