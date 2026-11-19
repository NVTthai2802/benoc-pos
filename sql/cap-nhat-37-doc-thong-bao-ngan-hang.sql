-- =====================================================================
-- CẬP NHẬT 37 — Tự biết khách đã chuyển khoản, đọc thông báo app ngân hàng
-- ---------------------------------------------------------------------
-- Máy Android cài app Bé Nốc POS (bản 1.3+) và app nhận thông báo của
-- Techcombank (Share Noti). Có tiền vào → Share Noti hiện thông báo →
-- Bé Nốc POS đọc → gửi tới /api/bank-noti (Cloudflare, đã bỏ số dư)
-- → hàm bank_noti_ingest() dưới đây đọc số tiền + mã thanh toán BN…
-- → khớp đơn → đủ tiền thì ghi "Đã thu · Chuyển khoản" như bấm tay.
--
-- Khớp đơn:
--   1. Có mã BN + 6 ký tự (đứng đầu nội dung CK trong mã QR của đơn) → đúng đơn đó.
--   2. Không có mã (thông báo không hiện nội dung) → chỉ khớp khi có ĐÚNG 1 đơn
--      chưa thu, tạo trong 6 giờ gần đây, tổng tiền bằng đúng số tiền nhận.
--   Còn lại → "Chưa khớp", nhân viên bấm tay như cũ.
--
-- Dùng chung bảng giao dịch + khoá với cập nhật 36 (SePay, để dùng sau).
-- Chạy được dù đã hay chưa chạy 36. Chạy lại nhiều lần vẫn an toàn.
-- Chỉ thêm bảng / hàm mới, không sửa hay xoá dữ liệu đơn hàng.
-- =====================================================================

-- 1. Khoá bí mật (app Android và SePay dùng chung)
create schema if not exists private;
create table if not exists private.sepay_config (
  id      int primary key default 1 check (id = 1),
  api_key text not null default replace(gen_random_uuid()::text, '-', '')
);
insert into private.sepay_config (id) values (1) on conflict (id) do nothing;

-- 2. Bảng giao dịch tiền vào
create table if not exists bank_txns (
  id           bigserial primary key,
  sepay_id     bigint unique,
  amount       int not null,
  content      text,
  ref          text,
  txn_at       timestamptz,
  pay_code     text,
  order_id     uuid,
  status       text not null default 'chua_khop',
  note         text,
  created_at   timestamptz not null default now()
);
alter table bank_txns add column if not exists src text not null default 'sepay';   -- sepay | noti
alter table bank_txns add column if not exists src_hash text;                       -- chống ghi trùng thông báo
alter table bank_txns add column if not exists device text;                         -- máy gửi (vd android-thai)
create unique index if not exists bank_txns_src_hash on bank_txns(src_hash);
create index if not exists bank_txns_created on bank_txns(created_at desc);
-- Trạng thái: thêm 'mau' (ghi thử, không khớp đơn)
alter table bank_txns drop constraint if exists bank_txns_status_check;
alter table bank_txns add constraint bank_txns_status_check
  check (status in ('da_khop', 'thieu_tien', 'chua_khop', 'don_da_thu', 'mau'));
alter table bank_txns enable row level security;
drop policy if exists bank_txns_staff_read on bank_txns;
create policy bank_txns_staff_read on bank_txns for select using (my_role() is not null);

-- 3. Mã thanh toán của đơn: BN + 6 ký tự đầu mã đơn
create or replace function private.pay_code(p_id uuid) returns text
language sql immutable as $$ select 'BN' || upper(left(replace(p_id::text, '-', ''), 6)) $$;

-- 4. Đọc số tiền trong chữ: "+75,000 VND", "75.000đ", "75,000.00"… → 75000 (null nếu không thấy)
create or replace function private.money_in(p_text text) returns int
language plpgsql immutable as $$
declare t text := coalesce(p_text, ''); m text[]; s text;
begin
  -- Ưu tiên số có dấu + (tiền vào)
  m := regexp_match(t, '\+\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]+)');
  if m is null then
    -- "Nhận / thanh toán / số tiền ... 75,000 VND"
    m := regexp_match(t, '(?:nhận|nhan|thanh toán|thanh toan|số tiền|so tien|ghi có|ghi co)[^0-9+\-]{0,30}([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{4,})', 'i');
  end if;
  if m is null then
    -- Số kèm đơn vị tiền
    m := regexp_match(t, '([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{4,})\s*(?:vnd|vnđ|đ|₫)', 'i');
  end if;
  if m is null then return null; end if;
  s := m[1];
  s := regexp_replace(s, '[.,][0-9]{1,2}$', '');   -- bỏ phần lẻ ",00"
  s := regexp_replace(s, '[.,]', '', 'g');
  if s = '' or length(s) > 10 then return null; end if;
  return s::bigint::int;
end $$;

-- 5. Khớp 1 giao dịch với đơn (dùng chung cho mọi nguồn)
create or replace function private.bank_apply(p_txn bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t bank_txns; o orders; v_n int; v_due int; v_status text; v_note text; v_by text := '';
begin
  select * into t from bank_txns where id = p_txn for update;
  if t.amount <= 0 then
    update bank_txns set note = coalesce(note, 'Không đọc được số tiền') where id = t.id;
    return jsonb_build_object('matched', false, 'reason', 'no_amount');
  end if;

  if t.pay_code is not null then
    select count(*) into v_n from orders where private.pay_code(id) = t.pay_code and created_at > now() - interval '3 days';
    if v_n = 1 then
      select * into o from orders where private.pay_code(id) = t.pay_code and created_at > now() - interval '3 days' for update;
    else
      update bank_txns set note = case when v_n = 0 then 'Không thấy đơn ' || t.pay_code else 'Nhiều đơn trùng mã ' || t.pay_code end where id = t.id;
      return jsonb_build_object('matched', false, 'reason', 'code');
    end if;
  else
    -- Không có mã: chỉ khớp khi có đúng 1 đơn chưa thu, cùng số tiền, trong 6 giờ
    select count(*) into v_n from orders
     where coalesce(paid_amount, 0) = 0 and total = t.amount and created_at > now() - interval '6 hours';
    if v_n <> 1 then
      update bank_txns set note = case when v_n = 0 then 'Không có mã đơn, không thấy đơn chưa thu ' || t.amount || 'đ'
                                       else 'Không có mã đơn, ' || v_n || ' đơn cùng ' || t.amount || 'đ: bấm tay' end where id = t.id;
      return jsonb_build_object('matched', false, 'reason', 'amount');
    end if;
    select * into o from orders
     where coalesce(paid_amount, 0) = 0 and total = t.amount and created_at > now() - interval '6 hours' for update;
    v_by := 'Khớp theo số tiền.';
  end if;

  v_due := o.total - coalesce(o.paid_amount, 0);
  if v_due <= 0 then
    v_status := 'don_da_thu'; v_note := 'Đơn đã thu đủ trước đó, kiểm tra trả lại khách';
  elsif t.amount >= v_due then
    update orders set paid_amount = total, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = null where id = o.id;
    if o.status = 'da_ra_mon' then perform private.finalize_order(o.id, 'chuyen_khoan'); end if;
    v_status := 'da_khop';
    v_note := case when t.amount > v_due then 'Khách chuyển dư ' || (t.amount - v_due) || 'đ' end;
  else
    update orders set paid_amount = coalesce(paid_amount, 0) + t.amount, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = null where id = o.id;
    v_status := 'thieu_tien'; v_note := 'Còn thiếu ' || (v_due - t.amount) || 'đ';
  end if;
  update bank_txns set order_id = o.id, status = v_status, note = nullif(btrim(v_by || ' ' || coalesce(v_note, '')), '') where id = t.id;
  return jsonb_build_object('matched', true, 'status', v_status,
    'where', case when o.queue_number is not null then 'Bàn ' || o.queue_number else coalesce(o.customer_name, 'đơn') end);
end $$;

-- 6. App Android gửi thông báo vào (qua /api/bank-noti)
--    p = { text, title, pkg, key, posted_at (ms), device, test (true = ghi thử, không khớp đơn) }
create or replace function bank_noti_ingest(p_key text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_key text; v_text text; v_up text; v_amount int; v_code text; v_txn bigint; v_at timestamptz; v_res jsonb; v_test boolean;
begin
  select api_key into v_key from private.sepay_config where id = 1;
  if p_key is null or v_key is null or p_key <> v_key then raise exception 'BAD_KEY'; end if;
  if coalesce((p ->> 'ping')::boolean, false) then return jsonb_build_object('ok', true, 'ping', true); end if;

  v_text := left(btrim(coalesce(p ->> 'title', '') || ' | ' || coalesce(p ->> 'text', ''), ' |'), 500);
  -- Phòng hờ: bỏ mọi đoạn số dư nếu còn sót
  v_text := regexp_replace(v_text, '(số dư|so du|sd)\s*[:：]?\s*[-+]?[0-9][0-9.,]*\s*(vnđ|vnd|đ|₫|d(?![a-z]))?', '[số dư]', 'gi');
  if v_text = '' then return jsonb_build_object('ok', true, 'skip', 'empty'); end if;
  v_up := upper(v_text);
  -- Tiền ra thì bỏ qua (Share Noti chỉ báo tiền vào, phòng hờ)
  if v_up ~ '(^|\s)-\s*[0-9]' and v_up !~ '\+\s*[0-9]' then return jsonb_build_object('ok', true, 'skip', 'out'); end if;

  v_amount := coalesce(private.money_in(v_text), 0);
  v_code := (regexp_match(v_up, 'BN\s?([0-9A-F]{6})'))[1];
  if v_code is not null then v_code := 'BN' || v_code; end if;
  v_test := coalesce((p ->> 'test')::boolean, false);
  begin v_at := to_timestamp((p ->> 'posted_at')::bigint / 1000.0); exception when others then v_at := now(); end;

  insert into bank_txns (src, src_hash, device, amount, content, txn_at, pay_code, status, note)
  values ('noti', md5(coalesce(p ->> 'key', '') || '|' || coalesce(p ->> 'posted_at', '') || '|' || v_text),
          left(p ->> 'device', 40), v_amount, v_text, coalesce(v_at, now()), v_code,
          case when v_test then 'mau' else 'chua_khop' end,
          case when v_test then 'Ghi thử từ ' || coalesce(p ->> 'pkg', '?') end)
  on conflict (src_hash) do nothing
  returning id into v_txn;
  if v_txn is null then return jsonb_build_object('ok', true, 'skip', 'duplicate'); end if;
  if v_test then
    return jsonb_build_object('ok', true, 'test', true, 'amount', v_amount, 'code', v_code);
  end if;

  v_res := private.bank_apply(v_txn);
  return jsonb_build_object('ok', true, 'amount', v_amount, 'code', v_code) || v_res;
end $$;
revoke all on function bank_noti_ingest(text, jsonb) from public;
grant execute on function bank_noti_ingest(text, jsonb) to anon, authenticated;

-- 7. Chủ quán xem / đổi khoá (dán vào app Android)
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

-- 8. Màn hình bếp / pha chế biết ngay khi tiền về
do $$ begin
  alter publication supabase_realtime add table bank_txns;
exception when duplicate_object then null; when undefined_object then null; end $$;

select 'Đã cài đọc thông báo ngân hàng. Khoá dài ' || length(api_key) || ' ký tự' as ket_qua from private.sepay_config;
