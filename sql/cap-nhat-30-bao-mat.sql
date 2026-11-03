-- =====================================================================
-- CẬP NHẬT 30: SIẾT BẢO MẬT (từ đợt kiểm tra bảo mật security/AUDIT_SUMMARY.md)
--   1. Khách chưa đăng nhập (anon) chỉ gọi được đúng các hàm trang gọi món cần.
--      Trước đây Postgres / Supabase tự cho anon chạy MỌI hàm mới tạo trong schema public,
--      nên ai cũng gọi được refresh_order_status, suggest_wait_minutes... bằng anon key.
--      Từ nay hàm mới tạo KHÔNG tự cho anon chạy: hàm nào khách cần thì phải grant ... to anon.
--   2. suggest_wait_minutes chỉ cho nhân viên / chủ quán.
--   3. Ảnh chấm công: chỉ nhân viên đang làm mới tải lên được
--      (trước đây ai tự đăng ký tài khoản bằng anon key cũng tải file vào bucket được).
--   4. Mã kết nối bot 6 số: mỗi tài khoản Zalo / Telegram nhập sai tối đa 5 lần / 10 phút,
--      cả quán tối đa 30 lần sai / 10 phút (chống dò mã).
-- Chạy sau cập nhật 29. Chạy trên TEST trước, thử trang khách + bếp + quản lý rồi mới chạy Product.
-- Không xoá dữ liệu. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

-- 1. Quyền chạy hàm -----------------------------------------------------
revoke execute on all functions in schema public from public, anon;
-- Hàm mới tạo sau này (bởi postgres, trong SQL Editor) không tự cho public / anon chạy
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- Khách: xem menu, đặt món, xem đơn của mình, gọi nhân viên, mã QR chuyển khoản.
-- my_role / my_employee_id nằm trong RLS của bảng menu nên anon vẫn phải chạy được.
grant execute on function
  get_menu(), get_promotions(), promo_live(promotions, timestamptz), get_my_order(uuid), call_staff(uuid, text),
  has_owner(), get_payment_info(), my_role(), my_employee_id(),
  place_order(int, text, jsonb, text, boolean, text, text, text, timestamptz)
to anon;

-- Nhân viên / chủ quán (ghi rõ, không dựa vào quyền mặc định). Hàm tự kiểm tra vai trò bên trong.
grant execute on function
  get_menu(), get_promotions(), promo_live(promotions, timestamptz), get_my_order(uuid), call_staff(uuid, text),
  has_owner(), get_payment_info(), my_role(), my_employee_id(),
  place_order(int, text, jsonb, text, boolean, text, text, text, timestamptz),
  check_in(text), check_out(text), claim_owner(text, text), owner_update_shift(uuid, timestamptz, timestamptz, text),
  suggest_wait_minutes(uuid, text), accept_order(uuid, int, text), extend_wait(uuid, int, text), mark_served(uuid, text),
  cancel_order(uuid), complete_payment(uuid, text), staff_add_items(uuid, jsonb), staff_set_item_qty(bigint, int),
  staff_update_order(uuid, text, int), staff_set_item_options(bigint, int[]),
  stock_move(uuid, text, numeric, boolean, text, int), promo_usage(), bot_link_code(),
  fb_approve(uuid, text, text, text, text, timestamptz, jsonb, text)
to authenticated;

-- Hàm nội bộ, trang web không gọi trực tiếp
revoke execute on function refresh_order_status(uuid) from authenticated;
revoke execute on function bot_link_use(text, text, text, text), bot_dat_don(uuid), bot_huy_don(uuid), bot_don_mo(uuid) from authenticated;

-- Bot (service_role) vẫn chạy được mọi hàm như trước
grant execute on all functions in schema public to service_role;

-- 2. Gợi ý phút chờ: chỉ nhân viên --------------------------------------
create or replace function suggest_wait_minutes(p_order_id uuid, p_station text default 'bep') returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_own   int;
  v_ahead int;
  v_cap   int;
  v_avg   numeric;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  select coalesce(max(m.prep_minutes), 10) into v_own
    from order_items i join menu_items m on m.id = i.menu_item_id
   where i.order_id = p_order_id and i.station = p_station;
  select count(*) into v_ahead from order_stations where station = p_station and status = 'dang_lam';
  select case when p_station = 'pha_che' then bar_capacity else kitchen_capacity end
    into v_cap from shop_settings where id = 1;
  select avg((station_minutes ->> p_station)::numeric) into v_avg from sales
   where paid_at > now() - interval '14 days' and station_minutes ? p_station;
  return (ceil((v_own + floor(v_ahead::numeric / greatest(v_cap, 1)) * coalesce(v_avg, v_own)) / 5.0) * 5)::int;
end $$;

-- 3. Ảnh chấm công: chỉ nhân viên đang làm ------------------------------
drop policy if exists checkin_upload on storage.objects;
create policy checkin_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'checkin-photos'
              and public.my_role() is not null
              and (storage.foldername(name))[1] = auth.uid()::text);

-- 4. Chống dò mã kết nối bot --------------------------------------------
create table if not exists private.bot_link_fail (
  id      bigserial primary key,
  kenh    text not null,
  chat_id text not null,
  at      timestamptz not null default now()
);
create index if not exists bot_link_fail_at on private.bot_link_fail(at);

create or replace function private.bot_link_use(p_code text, p_kenh text, p_chat text, p_name text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from private.bot_link_fail where at < now() - interval '10 minutes';
  if (select count(*) from private.bot_link_fail where kenh = p_kenh and chat_id = p_chat) >= 5
     or (select count(*) from private.bot_link_fail) >= 30 then
    return false;
  end if;
  delete from private.bot_link where code = p_code and until >= now();
  if not found then
    insert into private.bot_link_fail (kenh, chat_id) values (p_kenh, p_chat);
    return false;
  end if;
  insert into bot_users (kenh, chat_id, name) values (p_kenh, p_chat, left(p_name, 80))
    on conflict (kenh, chat_id) do update set name = excluded.name;
  return true;
end $$;
revoke all on function private.bot_link_use(text, text, text, text) from public;

revoke all on all functions in schema private from public;
commit;
