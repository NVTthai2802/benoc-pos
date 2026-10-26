-- =====================================================================
-- CẬP NHẬT 24: DỮ LIỆU HUẤN LUYỆN CHO MÔ HÌNH ĐỌC ĐƠN
--   * Mỗi lần bot nhờ AI đọc tin khách, lưu lại 1 "mẫu": đoạn chat (ĐÃ ẨN tên, SĐT,
--     số tài khoản; địa chỉ giữ nguyên) + đơn bot tách ra.
--   * Khi chủ quán DUYỆT đơn: mẫu cuối của đơn được gắn thêm "bản chủ quán duyệt"
--     (đáp án đúng) và danh sách chỗ chủ quán phải sửa so với bot.
--     Khi chủ quán HUỶ đơn: các mẫu của đơn đánh dấu huỷ (không dùng làm đáp án).
--   * Dữ liệu này dùng để (1) đo AI đang đọc đúng bao nhiêu %, (2) sau này tự huấn
--     luyện mô hình riêng của quán. Chỉ chủ quán xem được, tải về ở
--     Quản lý → Facebook → Cài đặt bot. Khách nhắn "xoá dữ liệu của tôi" thì bot xoá luôn.
--   * Công tắc shop_settings.fb_train_on: tắt thì bot không lưu thêm mẫu nào.
-- Chạy sau cập nhật 22. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

alter table shop_settings add column if not exists fb_train_on boolean not null default true;

-- Ảnh chụp menu tại lúc lưu mẫu (để đọc lại số thứ tự món / lựa chọn về sau). Một menu = một dòng.
create table if not exists fb_train_menu (
  hash       text primary key,
  menu       jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists fb_train (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  thread_hash  text not null,                 -- băm của PSID: gom mẫu cùng 1 khách, không lần ngược ra khách được
  draft_id     uuid,                          -- đơn nháp của mẫu (trống nếu lượt này chưa thành đơn)
  now_vn       text not null,                 -- "2026-10-24 15:00" giờ Việt Nam lúc khách nhắn
  convo        jsonb not null default '[]',   -- [{"s":"khach|bot|quan","t":"…"}] đã ẩn tên, SĐT, số tài khoản
  state_before jsonb not null default '{}',   -- đơn đang ghi trước tin mới
  intent       text,                          -- order | question | human | other
  target       jsonb,                         -- đơn bot tách ra sau khi kiểm lại theo menu (null nếu intent = human)
  answer       text,                          -- câu AI trả lời khi khách hỏi thông tin
  model        text,                          -- AI nào đã đọc (vd gemini-3.8-flash)
  menu_hash    text,
  outcome      text not null default 'chua_ro' check (outcome in ('chua_ro', 'da_duyet', 'huy')),
  final        jsonb,                         -- bản chủ quán duyệt (đáp án đúng), chỉ có ở mẫu cuối của đơn đã duyệt
  edits        text[]                         -- chủ quán đã sửa: items | dine_type | time (rỗng = bot đọc đúng hết)
);
create index if not exists fb_train_draft  on fb_train(draft_id) where draft_id is not null;
create index if not exists fb_train_thread on fb_train(thread_hash);

alter table fb_train enable row level security;
alter table fb_train_menu enable row level security;
drop policy if exists fb_train_owner_read on fb_train;
create policy fb_train_owner_read on fb_train for select using (my_role() = 'owner');
drop policy if exists fb_train_owner_del on fb_train;
create policy fb_train_owner_del on fb_train for delete using (my_role() = 'owner');
drop policy if exists fb_train_menu_owner on fb_train_menu;
create policy fb_train_menu_owner on fb_train_menu for select using (my_role() = 'owner');
revoke all on fb_train, fb_train_menu from anon, authenticated;
grant select, delete on fb_train to authenticated;
grant select on fb_train_menu to authenticated;
revoke all on sequence fb_train_id_seq from anon, authenticated;

-- Chuỗi so sánh danh sách món: "menu_item_id|số lượng|các lựa chọn", đã sắp xếp
create or replace function private.fb_items_sig(p_items jsonb) returns text
language sql immutable as $$
  select coalesce(string_agg(x, ';' order by x), '')
    from (select (e ->> 'menu_item_id') || '|' || coalesce((e ->> 'qty')::int, 1)::text || '|' ||
                 coalesce((select string_agg(c, ',' order by c::int) from jsonb_array_elements_text(coalesce(e -> 'choice_ids', '[]'::jsonb)) c), '') as x
            from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e) q;
$$;

-- Chủ quán duyệt xong: gắn đáp án đúng vào mẫu cuối của đơn
create or replace function private.fb_train_close(p_draft uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare d fb_drafts; s fb_train; v_final jsonb; v_edits text[] := '{}'; v_date text; v_time text;
begin
  select * into d from fb_drafts where id = p_draft;
  if not found then return; end if;
  update fb_train set outcome = 'da_duyet' where draft_id = p_draft;
  select * into s from fb_train where draft_id = p_draft and target is not null order by id desc limit 1;
  if not found then return; end if;
  v_date := to_char(d.at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD');
  v_time := to_char(d.at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI');
  v_final := jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'name', i.item_name, 'qty', i.qty,
                'choices', coalesce((select jsonb_agg(o ->> 'choice') from jsonb_array_elements(i.options) o), '[]'::jsonb),
                'note', nullif(regexp_replace(coalesce(i.note, ''), '\d{9,}', '<SO>', 'g'), '')) order by i.id)
              from order_items i where i.order_id = d.order_id), '[]'::jsonb),
    'dine_type', d.dine_type, 'date', v_date, 'time', v_time,
    'address', d.address,
    'phone',   case when d.customer_phone is not null then '<SDT>' end);
  -- Chủ quán sửa gì so với bot? (so với đơn nháp bot đã ghi: d.items vẫn là bản của bot)
  if private.fb_items_sig(d.items) is distinct from private.fb_items_sig(p_items) then v_edits := array_append(v_edits, 'items'); end if;
  if (s.target ->> 'dine_type') is distinct from d.dine_type then v_edits := array_append(v_edits, 'dine_type'); end if;
  if (s.target ->> 'time') is distinct from v_time or (s.target ->> 'date') is distinct from v_date then v_edits := array_append(v_edits, 'time'); end if;
  update fb_train set final = v_final, edits = v_edits where id = s.id;
end $$;

-- Chủ quán huỷ đơn nháp → các mẫu của đơn không phải đáp án đúng
create or replace function private.fb_train_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'huy' and old.status is distinct from 'huy' then
    update fb_train set outcome = 'huy' where draft_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists fb_drafts_train_cancel on fb_drafts;
create trigger fb_drafts_train_cancel after update of status on fb_drafts
  for each row execute function private.fb_train_cancel();

-- fb_approve (như cập nhật 22) + gọi fb_train_close ở cuối
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
  perform private.fb_train_close(p_draft, p_items);
  return jsonb_build_object('order_id', v_order.id, 'total', v_total);
end $$;
grant execute on function fb_approve(uuid, text, text, text, text, timestamptz, jsonb, text) to authenticated;
revoke all on function private.fb_items_sig(jsonb), private.fb_train_close(uuid, jsonb), private.fb_train_cancel() from public;

commit;

select 'Đã thêm dữ liệu huấn luyện' as ket_qua, (select count(*) from fb_train) as so_mau;
