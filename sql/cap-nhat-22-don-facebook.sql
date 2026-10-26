-- =====================================================================
-- CẬP NHẬT 22: ĐƠN ĐẶT QUA FACEBOOK (bot Fanpage)
--   * Bot (Edge Function fb-bot) đọc tin nhắn khách trên Fanpage, tách thành ĐƠN NHÁP:
--     món ăn, đồ uống, qua lấy / ăn tại quán / đi ship, giờ hẹn, địa chỉ (ship), SĐT.
--     Thiếu ý nào bot hỏi lại ý đó. Đủ rồi thì đơn nháp chuyển sang CHỜ DUYỆT.
--   * Chủ quán mở tab Facebook trong trang Quản lý, bấm mở đoạn chat để đối chiếu,
--     sửa nếu cần rồi DUYỆT → thành đơn thật, sang bếp / pha chế như đơn thường.
--   * Cả 3 loại đều có giờ hẹn (orders.deliver_at). Ăn tại quán đặt trước chưa có số bàn:
--     khách đến thì bếp bấm Sửa đơn để điền số bàn.
-- Chỉ thêm bảng / cột / hàm mới, không đụng đơn cũ. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

-- 1. Đơn thật: nguồn đơn + cho phép "ăn tại quán" chưa có số bàn nếu đặt qua Facebook
alter table orders add column if not exists source text not null default 'qr';
alter table orders drop constraint if exists orders_source_check;
alter table orders add constraint orders_source_check check (source in ('qr', 'quan', 'fb'));
alter table orders drop constraint if exists orders_queue_or_takeaway;
alter table orders add constraint orders_queue_or_takeaway check (dine_type <> 'tai_quan' or queue_number is not null or source = 'fb');

-- 2. Cài đặt bot
alter table shop_settings add column if not exists fb_bot_on   boolean not null default true;  -- tắt: bot im, chủ quán tự nhắn
alter table shop_settings add column if not exists fb_open     text not null default '07:00';  -- giờ nhận đơn (bot từ chối giờ hẹn ngoài khung này)
alter table shop_settings add column if not exists fb_close    text not null default '22:00';
alter table shop_settings add column if not exists fb_hello    text;                            -- câu chào riêng (để trống dùng mặc định)

-- 3. Khách nhắn Fanpage (mỗi khách 1 dòng, khoá là PSID của Facebook)
create table if not exists fb_threads (
  psid         text primary key,
  name         text,                       -- tên Facebook của khách
  link         text,                       -- link mở đoạn chat trong hộp thư Fanpage
  paused_until timestamptz,                -- chủ quán đang tự nhắn → bot im tới lúc này
  need_human   boolean not null default false, -- bot nhờ chủ quán trả lời (khiếu nại, câu hỏi khó…)
  last_at      timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create table if not exists fb_messages (
  id         bigserial primary key,
  psid       text not null references fb_threads(psid) on delete cascade,
  mid        text unique,                  -- mã tin nhắn của Facebook (chống nhận trùng)
  sender     text not null check (sender in ('khach', 'bot', 'quan')), -- quan = chủ quán tự nhắn trong hộp thư
  text       text,
  created_at timestamptz not null default now()
);
create index if not exists fb_messages_thread on fb_messages(psid, created_at desc);

-- 4. Đơn nháp bot tách từ tin nhắn
create table if not exists fb_drafts (
  id             uuid primary key default gen_random_uuid(),
  psid           text not null references fb_threads(psid) on delete cascade,
  status         text not null default 'dang_hoi' check (status in ('dang_hoi', 'cho_duyet', 'da_duyet', 'huy')),
  dine_type      text check (dine_type in ('mang_ve', 'tai_quan', 'giao_hang')), -- qua lấy / ăn tại quán / đi ship
  at             timestamptz,              -- giờ hẹn: giờ qua lấy / giờ đến ăn / giờ giao
  customer_name  text,
  customer_phone text,
  address        text,
  note           text,
  items          jsonb not null default '[]', -- [{menu_item_id, name, qty, choice_ids, choices, note, price}]
  unknown        jsonb not null default '[]', -- món khách gọi mà bot không khớp được menu
  missing        text[] not null default '{}', -- còn thiếu: items, dine_type, at, address, phone
  total_est      int not null default 0,       -- tạm tính (giá thật tính lại khi duyệt)
  changed_after  boolean not null default false, -- khách nhắn sửa sau khi đã chờ duyệt
  asked          text[] not null default '{}', -- bot đã hỏi gợi ý (đồ uống / đồ ăn) rồi thì không hỏi lại
  order_id       uuid,
  approved_by    text,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists fb_drafts_status on fb_drafts(status, updated_at desc);
create index if not exists fb_drafts_psid on fb_drafts(psid, updated_at desc);

-- 5. Quyền: chủ quán xem / sửa; bot dùng khoá service_role (không qua RLS)
alter table fb_threads enable row level security;
alter table fb_messages enable row level security;
alter table fb_drafts enable row level security;
drop policy if exists fb_threads_owner on fb_threads;
create policy fb_threads_owner on fb_threads for all using (my_role() = 'owner') with check (my_role() = 'owner');
drop policy if exists fb_messages_owner on fb_messages;
create policy fb_messages_owner on fb_messages for select using (my_role() = 'owner');
drop policy if exists fb_drafts_owner on fb_drafts;
create policy fb_drafts_owner on fb_drafts for all using (my_role() = 'owner') with check (my_role() = 'owner');
grant select, insert, update, delete on fb_threads, fb_drafts to authenticated;
grant select on fb_messages to authenticated;

-- 6. Duyệt đơn nháp → tạo đơn thật (giá tính ở máy chủ như mọi đơn khác)
--    p_items = [{"menu_item_id": "...", "qty": 2, "note": "ít cay", "choice_ids": [3, 7]}]
create or replace function fb_approve(
  p_draft   uuid,
  p_dine    text,
  p_name    text,
  p_phone   text,
  p_address text,
  p_at      timestamptz,
  p_items   jsonb,
  p_note    text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d fb_drafts; v_order orders; v_total int; v_emp employees;
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  select * into d from fb_drafts where id = p_draft for update;
  if not found then raise exception 'DRAFT_NOT_FOUND'; end if;
  if d.status = 'da_duyet' then raise exception 'DRAFT_DONE' using hint = 'Đơn này đã duyệt rồi'; end if;
  if p_dine not in ('mang_ve', 'tai_quan', 'giao_hang') then raise exception 'BAD_DINE' using hint = 'Chọn qua lấy / ăn tại quán / đi ship'; end if;
  if p_at is null then raise exception 'MISSING_TIME' using hint = 'Nhập giờ hẹn'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'MISSING_NAME' using hint = 'Nhập tên khách'; end if;
  if p_dine = 'giao_hang' and coalesce(trim(p_address), '') = '' then raise exception 'MISSING_ADDRESS' using hint = 'Nhập địa chỉ giao hàng'; end if;

  insert into orders (queue_number, customer_name, customer_phone, note, dine_type, address, deliver_at, source)
  values (null, trim(p_name), nullif(trim(p_phone), ''), nullif(left(trim(p_note), 300), ''), p_dine,
          case when p_dine = 'giao_hang' then nullif(left(trim(p_address), 300), '') end, p_at, 'fb')
  returning * into v_order;
  perform private.add_items(v_order.id, p_items);
  select total into v_total from orders where id = v_order.id;

  select * into v_emp from employees where id = my_employee_id();
  update fb_drafts set status = 'da_duyet', order_id = v_order.id, approved_by = v_emp.full_name, approved_at = now(),
         dine_type = p_dine, at = p_at, customer_name = trim(p_name), customer_phone = nullif(trim(p_phone), ''),
         address = nullif(trim(p_address), ''), note = nullif(trim(p_note), ''), total_est = v_total,
         changed_after = false, updated_at = now()
   where id = p_draft;
  return jsonb_build_object('order_id', v_order.id, 'total', v_total);
end $$;
grant execute on function fb_approve(uuid, text, text, text, text, timestamptz, jsonb, text) to authenticated;

commit;

select 'Đã thêm đơn Facebook' as ket_qua, (select count(*) from fb_drafts) as so_don_nhap;
