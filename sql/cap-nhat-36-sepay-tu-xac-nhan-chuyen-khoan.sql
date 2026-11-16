-- =====================================================================
-- CẬP NHẬT 36 — SePay: tự biết khách đã chuyển khoản
-- ---------------------------------------------------------------------
-- SePay đọc biến động số dư tài khoản quán → gọi trang /api/sepay (Cloudflare)
-- → trang đó gọi hàm sepay_ingest() dưới đây → hàm tìm đơn theo MÃ THANH TOÁN
-- trong nội dung chuyển khoản (BN + 6 ký tự, in sẵn trong mã QR của đơn)
-- → đủ tiền thì ghi "Đã thu · Chuyển khoản" như khi nhân viên bấm tay.
--
-- An toàn: chỉ thêm bảng / hàm mới, không sửa hay xoá dữ liệu đơn hàng.
-- Chạy lại nhiều lần vẫn được.
-- =====================================================================

-- 1. Khoá bí mật để SePay gọi vào (chỉ hàm của hệ thống đọc được, không lộ ra trang web)
create schema if not exists private;
create table if not exists private.sepay_config (
  id      int primary key default 1 check (id = 1),
  api_key text not null default replace(gen_random_uuid()::text, '-', '')
);
insert into private.sepay_config (id) values (1) on conflict (id) do nothing;

-- 2. Giao dịch ngân hàng SePay báo về (lưu để đối soát; không lưu số dư tài khoản)
create table if not exists bank_txns (
  id           bigserial primary key,
  sepay_id     bigint unique,                 -- mã giao dịch của SePay (chống ghi trùng khi SePay gửi lại)
  amount       int not null,
  content      text,                          -- nội dung chuyển khoản
  ref          text,                          -- mã tham chiếu ngân hàng
  txn_at       timestamptz,
  pay_code     text,                          -- mã thanh toán đọc được (VD: BNA1B2C3)
  order_id     uuid,                          -- đơn đã khớp (đơn đã đóng thì vẫn giữ mã)
  status       text not null default 'chua_khop'
               check (status in ('da_khop', 'thieu_tien', 'chua_khop', 'don_da_thu')),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists bank_txns_created on bank_txns(created_at desc);
alter table bank_txns enable row level security;
drop policy if exists bank_txns_staff_read on bank_txns;
create policy bank_txns_staff_read on bank_txns for select using (my_role() is not null);

-- 3. Mã thanh toán của 1 đơn: BN + 6 ký tự đầu mã đơn (viết hoa)
create or replace function private.pay_code(p_id uuid) returns text
language sql immutable as $$ select 'BN' || upper(left(replace(p_id::text, '-', ''), 6)) $$;

-- 4. SePay gọi vào (qua trang /api/sepay). p_key = khoá bí mật, p = nội dung SePay gửi
create or replace function sepay_ingest(p_key text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_key text; v_amount int; v_content text; v_code text; v_txn bigint;
  o orders; v_n int; v_due int; v_status text; v_note text; v_at timestamptz;
begin
  select api_key into v_key from private.sepay_config where id = 1;
  if p_key is null or v_key is null or p_key <> v_key then raise exception 'BAD_KEY'; end if;

  -- Chỉ xử lý tiền vào
  if coalesce(p ->> 'transferType', 'in') <> 'in' then return jsonb_build_object('ok', true, 'skip', 'out'); end if;
  v_amount := coalesce((p ->> 'transferAmount')::numeric, 0)::int;
  if v_amount <= 0 then return jsonb_build_object('ok', true, 'skip', 'zero'); end if;
  v_content := upper(coalesce(p ->> 'content', '') || ' ' || coalesce(p ->> 'description', '') || ' ' || coalesce(p ->> 'code', ''));
  v_code := (regexp_match(v_content, 'BN\s?([0-9A-F]{6})'))[1];
  if v_code is not null then v_code := 'BN' || v_code; end if;

  -- Ghi giao dịch; SePay gửi lại cùng giao dịch thì bỏ qua
  begin v_at := (p ->> 'transactionDate')::timestamp at time zone 'Asia/Ho_Chi_Minh';
  exception when others then v_at := now(); end;
  insert into bank_txns (sepay_id, amount, content, ref, txn_at, pay_code)
  values (nullif(p ->> 'id', '')::bigint, v_amount, left(coalesce(p ->> 'content', p ->> 'description'), 300),
          left(p ->> 'referenceCode', 60), coalesce(v_at, now()), v_code)
  on conflict (sepay_id) do nothing
  returning id into v_txn;
  if v_txn is null then return jsonb_build_object('ok', true, 'skip', 'duplicate'); end if;

  if v_code is null then
    update bank_txns set note = 'Không có mã thanh toán trong nội dung' where id = v_txn;
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  -- Tìm đơn trong 3 ngày gần nhất có mã này
  select count(*) into v_n from orders
   where private.pay_code(id) = v_code and created_at > now() - interval '3 days';
  if v_n <> 1 then
    update bank_txns set note = case when v_n = 0 then 'Không thấy đơn ' || v_code else 'Nhiều đơn trùng mã ' || v_code end where id = v_txn;
    return jsonb_build_object('ok', true, 'matched', false);
  end if;
  select * into o from orders
   where private.pay_code(id) = v_code and created_at > now() - interval '3 days' for update;

  v_due := o.total - coalesce(o.paid_amount, 0);
  if v_due <= 0 then
    v_status := 'don_da_thu'; v_note := 'Đơn đã thu đủ trước đó, kiểm tra trả lại khách';
  elsif v_amount >= v_due then
    -- Đủ tiền: giống nhân viên bấm "Đã nhận chuyển khoản" (paid_by để trống = máy tự ghi)
    update orders set paid_amount = total, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = null where id = o.id;
    if o.status = 'da_ra_mon' then perform private.finalize_order(o.id, 'chuyen_khoan'); end if;
    v_status := 'da_khop';
    v_note := case when v_amount > v_due then 'Khách chuyển dư ' || (v_amount - v_due) || 'đ' end;
  else
    -- Thiếu tiền: cộng phần đã nhận, đơn vẫn còn phải thu
    update orders set paid_amount = coalesce(paid_amount, 0) + v_amount, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = null where id = o.id;
    v_status := 'thieu_tien'; v_note := 'Còn thiếu ' || (v_due - v_amount) || 'đ';
  end if;
  update bank_txns set order_id = o.id, status = v_status, note = v_note where id = v_txn;
  return jsonb_build_object('ok', true, 'matched', true, 'status', v_status);
end $$;
revoke all on function sepay_ingest(text, jsonb) from public;
grant execute on function sepay_ingest(text, jsonb) to anon, authenticated;

-- 5. Chủ quán xem khoá + đường dẫn để dán vào SePay, và đổi khoá khi cần
create or replace function get_sepay_key() returns text
language plpgsql security definer set search_path = public as $$
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  return (select api_key from private.sepay_config where id = 1);
end $$;
create or replace function reset_sepay_key() returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  update private.sepay_config set api_key = replace(gen_random_uuid()::text, '-', '') where id = 1 returning api_key into v;
  return v;
end $$;
grant execute on function get_sepay_key(), reset_sepay_key() to authenticated;

-- 6. Màn hình bếp / pha chế biết ngay khi tiền về (realtime)
do $$ begin
  alter publication supabase_realtime add table bank_txns;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- Kiểm tra: phải ra 1 dòng khoá và bảng bank_txns rỗng (hoặc có giao dịch cũ)
select 'Đã cài SePay. Khoá dài ' || length(api_key) || ' ký tự' as ket_qua from private.sepay_config;
