-- =====================================================================
-- CẬP NHẬT 42 + 43 + 44 — GỘP 1 FILE (chạy 1 lần trên Supabase Product)
-- ---------------------------------------------------------------------
--   42. Sửa chặn trùng giao dịch theo mã FT (cùng 1 khoản tiền không bị ghi 2 lần).
--   43. Gán tay tiền QR loa vào đơn (hàm cho nút 🔔 ở Bếp / Pha chế; giao diện bật sau).
--   44. Khách thấy đơn bị HUỶ và quán đã SỬA gì trong đơn.
-- Cần đã chạy cập nhật 39 và 41. Chỉ thêm / thay hàm, thêm bảng, cột, trigger;
-- không xoá hay sửa dữ liệu. Chạy lại nhiều lần vẫn an toàn.
-- Cả file chạy trong 1 giao dịch: lỗi ở đâu thì không có gì thay đổi.
-- =====================================================================

begin;

-- =====================================================================
-- CẬP NHẬT 42 — Sửa chặn trùng giao dịch theo mã FT… (lỗi của cập nhật 41)
-- ---------------------------------------------------------------------
-- Cập nhật 41 dùng '\b' để tìm mã FT…, nhưng trong PostgreSQL '\b' KHÔNG phải ranh giới từ
-- nên mã FT không bao giờ đọc được → cùng 1 giao dịch gửi 2 lần (app quét lại thông báo,
-- hoặc 2 máy cùng đọc) vẫn tạo 2 dòng / 2 hoá đơn không gắn mã. Bản này dùng '\m…\M'.
-- Chỉ thay hàm bank_noti_ingest. Chạy lại nhiều lần vẫn an toàn. Cần đã chạy 41.
-- =====================================================================

create or replace function bank_noti_ingest(p_key text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  v_text text;
  v_up text;
  v_amount int;
  v_code text;
  v_ft text;
  v_hash text;
  v_txn bigint;
  v_at timestamptz;
  v_res jsonb;
  v_test boolean;
begin
  select api_key into v_key from private.sepay_config where id = 1;
  if p_key is null or v_key is null or p_key <> v_key then raise exception 'BAD_KEY'; end if;
  if coalesce((p ->> 'ping')::boolean, false) then return jsonb_build_object('ok', true, 'ping', true); end if;

  v_text := left(btrim(coalesce(p ->> 'title', '') || ' | ' || coalesce(p ->> 'text', ''), ' |'), 500);
  -- Phòng hờ: bỏ mọi đoạn số dư nếu còn sót
  v_text := regexp_replace(v_text, '(số dư|so du|sd)\s*[:：]?\s*[-+]?[0-9][0-9.,]*\s*(vnđ|vnd|đ|₫|d(?![a-z]))?', '[số dư]', 'gi');
  if v_text = '' then return jsonb_build_object('ok', true, 'skip', 'empty'); end if;
  v_up := upper(v_text);
  -- Tiền ra thì bỏ qua (chỉ bỏ qua khi đầu thông báo hoặc sau dấu | là dấu trừ số tiền, tránh nhầm dấu gạch ngang trong mã MoMo 157683-0399...)
  if v_up ~ '(^|\|\s*)-\s*[0-9]' and v_up !~ '\+\s*[0-9]' then
    return jsonb_build_object('ok', true, 'skip', 'out');
  end if;

  v_amount := coalesce(private.money_in(v_text), 0);
  v_code := (regexp_match(v_up, 'BN\s*([0-9A-F]{6})'))[1];
  if v_code is not null then v_code := 'BN' || v_code; end if;
  v_ft := (regexp_match(v_up, '\m(FT[0-9A-Z]{8,20})\M'))[1];
  v_test := coalesce((p ->> 'test')::boolean, false);
  begin v_at := to_timestamp((p ->> 'posted_at')::bigint / 1000.0); exception when others then v_at := now(); end;

  -- Nếu có mã giao dịch FT... và không phải ghi thử thì dùng FT... làm khoá chống trùng (an toàn khi quét lại thanh thông báo)
  v_hash := case
    when not v_test and v_ft is not null then md5('ft|' || v_ft || '|' || v_amount::text)
    else md5(coalesce(p ->> 'key', '') || '|' || coalesce(p ->> 'posted_at', '') || '|' || v_text)
  end;

  insert into bank_txns (src, src_hash, device, amount, content, ref, txn_at, pay_code, status, note)
  values ('noti', v_hash,
          left(p ->> 'device', 40), v_amount, v_text, v_ft, coalesce(v_at, now()), v_code,
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


-- =====================================================================
-- CẬP NHẬT 43 — Gán tay tiền QR loa vào đơn (nút 🔔 Thông báo ở Bếp / Pha chế)
-- ---------------------------------------------------------------------
-- Khách có đơn (tự gọi món / ship) nhưng lại quét QR dán trên loa → tiền vào không có mã BN…
-- → máy ghi "Đơn không gắn mã" (cập nhật 39/41). Ở màn hình Bếp / Pha chế, nút 🔔 gợi ý
-- các đơn chưa thu cùng số tiền; nhân viên bấm:
--   • "Gán vào Bàn X"  → link_bank_txn(): đơn đó Đã thu · Chuyển khoản (đã ra món thì đóng đơn),
--                        bỏ hoá đơn "không gắn mã" (không tính doanh thu 2 lần).
--   • "Không phải"     → dismiss_bank_txn(): giữ là đơn không gắn mã (khách gọi mồm), ẩn gợi ý.
-- Máy KHÔNG tự gán. Cần đã chạy 39 (và 41). Chỉ thêm cột / hàm. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

alter table bank_txns add column if not exists reviewed_at timestamptz;   -- nhân viên đã xử lý gợi ý
alter table bank_txns add column if not exists reviewed_by uuid;

create or replace function link_bank_txn(p_txn bigint, p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t bank_txns; o orders; v_due int; v_status text; v_note text; v_where text;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  select * into t from bank_txns where id = p_txn for update;
  if not found then raise exception 'TXN_NOT_FOUND'; end if;
  if t.status <> 'khong_ma' or t.sale_id is null then raise exception 'TXN_ALREADY_HANDLED'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  v_due := o.total - coalesce(o.paid_amount, 0);
  if v_due <= 0 then raise exception 'ORDER_ALREADY_PAID'; end if;
  v_where := case when o.queue_number is not null then 'Bàn ' || o.queue_number else coalesce(o.customer_name, 'đơn') end;

  -- Bỏ hoá đơn "không gắn mã" của khoản này (tiền này là của đơn)
  delete from sales where id = t.sale_id and source = 'khong_ma';

  if t.amount >= v_due then
    update orders set paid_amount = total, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = my_employee_id() where id = o.id;
    v_status := 'da_khop';
    v_note := 'Gán tay vào ' || v_where || case when t.amount > v_due then ' · khách chuyển dư ' || (t.amount - v_due) || 'đ' else '' end;
  else
    update orders set paid_amount = coalesce(paid_amount, 0) + t.amount, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = my_employee_id() where id = o.id;
    v_status := 'thieu_tien';
    v_note := 'Gán tay vào ' || v_where || ' · còn thiếu ' || (v_due - t.amount) || 'đ';
  end if;
  update bank_txns set order_id = o.id, sale_id = null, status = v_status, note = v_note,
         reviewed_at = now(), reviewed_by = my_employee_id() where id = t.id;
  -- Đã ra món và đủ tiền → đóng đơn (finalize lấy bank_txn_id theo order_id)
  if v_status = 'da_khop' and o.status = 'da_ra_mon' then perform private.finalize_order(o.id, 'chuyen_khoan'); end if;
  return jsonb_build_object('ok', true, 'status', v_status, 'where', v_where);
end $$;

create or replace function dismiss_bank_txn(p_txn bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  update bank_txns set reviewed_at = now(), reviewed_by = my_employee_id()
   where id = p_txn and status = 'khong_ma' and reviewed_at is null;
end $$;

revoke all on function link_bank_txn(bigint, uuid), dismiss_bank_txn(bigint) from public;
grant execute on function link_bank_txn(bigint, uuid), dismiss_bank_txn(bigint) to authenticated;


-- =====================================================================
-- CẬP NHẬT 44 — Khách thấy đúng đơn bị HUỶ và đơn được SỬA gì
-- ---------------------------------------------------------------------
-- Trước đây: đơn bị huỷ bị xoá → trang khách tưởng là "Đã thanh toán" (đơn thu xong cũng biến mất).
--            Quán sửa đơn (thêm / bỏ món, đổi số lượng, tuỳ chọn, đổi bàn…) → khách không biết.
-- Bản này ghi lại mỗi lần HUỶ / SỬA vào bảng order_changes (bằng trigger, không đổi các hàm sẵn có):
--   • Xoá đơn mà KHÔNG chuyển sang hoá đơn (sales) → "huy".
--   • Đổi món trong đơn (sau lúc đặt) → so trước / sau khi lưu → "Thêm 1× Trà đào", "Bỏ 1× Kimbap",
--     "Cơm gà: 1 → 2 phần", "Tổng tiền: 95.000đ → 120.000đ".
--   • Đổi bàn / ăn tại quán ↔ mang về / địa chỉ / giờ giao / ghi chú.
-- Trang khách đọc qua get_order_changes(mã đơn của khách).
-- Lỗi khi ghi nhật ký không bao giờ chặn việc đặt / sửa / huỷ / thu tiền.
-- Chỉ thêm bảng / hàm / trigger. Không sửa dữ liệu. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

create schema if not exists private;

create table if not exists order_changes (
  id         bigserial primary key,
  order_id   uuid not null,
  token      uuid,                                   -- mã đơn của khách (access_token)
  kind       text not null check (kind in ('sua', 'huy')),
  lines      jsonb not null default '[]'::jsonb,     -- các dòng mô tả thay đổi
  by_staff   boolean not null default true,          -- quán sửa (true) / khách tự sửa (false)
  created_at timestamptz not null default now()
);
create index if not exists order_changes_token on order_changes(token);
alter table order_changes enable row level security;  -- không cấp quyền đọc trực tiếp: chỉ qua hàm
drop policy if exists order_changes_staff_read on order_changes;
create policy order_changes_staff_read on order_changes for select using (my_role() is not null);

-- Ảnh chụp món trong đơn lúc bắt đầu sửa (mỗi giao dịch 1 dòng / đơn)
create table if not exists private.order_edit_tx (
  order_id     uuid   not null,
  txid         bigint not null,
  before       jsonb  not null,
  before_total int,
  primary key (order_id, txid)
);

create or replace function private.vnd(n int) returns text language sql immutable as
$$ select replace(to_char(coalesce(n, 0), 'FM999,999,999,990'), ',', '.') || 'đ' $$;

-- Món trong đơn: [{k: "Trà đào (Size L, Ít đá) · ít ngọt", q: 2}]
create or replace function private.items_snapshot(p_order uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'k', i.item_name
                || coalesce(' (' || nullif((select string_agg(x ->> 'choice', ', ') from jsonb_array_elements(case when jsonb_typeof(i.options) = 'array' then i.options else '[]'::jsonb end) x), '') || ')', '')
                || coalesce(' · ' || nullif(btrim(i.note), ''), '')
                || case when i.promo_part = 'tang' then ' (tặng)' else '' end,
           'q', i.qty)), '[]'::jsonb)
    from order_items i where i.order_id = p_order
$$;

-- Trước khi đổi món: chụp lại món của đơn (lần đầu trong giao dịch). Đơn vừa đặt trong cùng giao dịch / đơn đang bị xoá: bỏ qua.
create or replace function private.trg_items_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_order uuid := coalesce(new.order_id, old.order_id); v_created timestamptz; v_total int;
begin
  select created_at, total into v_created, v_total from orders where id = v_order;
  if found and v_created < now() then
    insert into private.order_edit_tx (order_id, txid, before, before_total)
    values (v_order, txid_current(), private.items_snapshot(v_order), v_total)
    on conflict do nothing;
  end if;
  return coalesce(new, old);
exception when others then return coalesce(new, old);   -- ghi nhật ký lỗi cũng không được chặn việc sửa đơn
end $$;
drop trigger if exists order_items_track_edit on order_items;
create trigger order_items_track_edit before insert or update or delete on order_items
  for each row execute function private.trg_items_before();

-- Lúc lưu (cuối giao dịch): so món trước / sau → ghi 1 dòng "sua"
create or replace function private.trg_edit_commit() returns trigger
language plpgsql security definer set search_path = public as $$
declare o orders; v_lines jsonb := '[]'::jsonb; r record;
begin
  delete from private.order_edit_tx where order_id = new.order_id and txid = new.txid;
  select * into o from orders where id = new.order_id;
  if not found then return null; end if;               -- đơn đã bị huỷ / đóng trong cùng giao dịch
  for r in
    with b as (select x ->> 'k' as k, sum((x ->> 'q')::int) as q from jsonb_array_elements(new.before) x group by 1),
         a as (select x ->> 'k' as k, sum((x ->> 'q')::int) as q from jsonb_array_elements(private.items_snapshot(new.order_id)) x group by 1)
    select coalesce(a.k, b.k) as k, coalesce(b.q, 0) as bq, coalesce(a.q, 0) as aq
      from a full join b on a.k = b.k
     where coalesce(a.q, 0) <> coalesce(b.q, 0)
     order by (coalesce(b.q, 0) = 0), coalesce(a.k, b.k)
  loop
    v_lines := v_lines || to_jsonb(case when r.bq = 0 then 'Thêm ' || r.aq || '× ' || r.k
                                        when r.aq = 0 then 'Bỏ ' || r.bq || '× ' || r.k
                                        else r.k || ': ' || r.bq || ' → ' || r.aq || ' phần' end);
  end loop;
  if jsonb_array_length(v_lines) = 0 then return null; end if;
  if o.total is distinct from new.before_total then
    v_lines := v_lines || to_jsonb('Tổng tiền: ' || private.vnd(new.before_total) || ' → ' || private.vnd(o.total));
  end if;
  insert into order_changes (order_id, token, kind, lines, by_staff) values (o.id, o.access_token, 'sua', v_lines, my_role() is not null);
  return null;
exception when others then return null;
end $$;
drop trigger if exists order_edit_commit on private.order_edit_tx;
create constraint trigger order_edit_commit after insert on private.order_edit_tx
  deferrable initially deferred for each row execute function private.trg_edit_commit();

-- Đổi bàn / kiểu đơn / địa chỉ / giờ giao / ghi chú (sau lúc đặt)
create or replace function private.trg_order_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lines jsonb := '[]'::jsonb;
  lbl text;
begin
  if old.created_at >= now() then return new; end if;
  if new.dine_type is distinct from old.dine_type then
    lbl := case new.dine_type when 'tai_quan' then 'Ăn tại quán' when 'mang_ve' then 'Mang về' when 'giao_hang' then 'Giao hàng' else new.dine_type end;
    v_lines := v_lines || to_jsonb('Đổi sang: ' || lbl);
  end if;
  if new.queue_number is distinct from old.queue_number and new.queue_number is not null then
    v_lines := v_lines || to_jsonb(case when old.queue_number is null then 'Số bàn: ' || new.queue_number else 'Đổi số bàn: ' || old.queue_number || ' → ' || new.queue_number end);
  end if;
  if new.address is distinct from old.address and nullif(btrim(new.address), '') is not null then
    v_lines := v_lines || to_jsonb('Địa chỉ giao: ' || new.address);
  end if;
  if new.deliver_at is distinct from old.deliver_at and new.deliver_at is not null then
    v_lines := v_lines || to_jsonb('Giờ giao: ' || to_char(new.deliver_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'));
  end if;
  if new.note is distinct from old.note and nullif(btrim(new.note), '') is not null then
    v_lines := v_lines || to_jsonb('Ghi chú: ' || new.note);
  end if;
  if jsonb_array_length(v_lines) > 0 then
    insert into order_changes (order_id, token, kind, lines, by_staff) values (new.id, new.access_token, 'sua', v_lines, my_role() is not null);
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists orders_track_update on orders;
create trigger orders_track_update before update of dine_type, queue_number, address, deliver_at, note on orders
  for each row execute function private.trg_order_update();

-- Xoá đơn mà không chuyển sang hoá đơn → đơn bị HUỶ
create or replace function private.trg_order_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sales where id = old.id) then
    insert into order_changes (order_id, token, kind, lines, by_staff)
    values (old.id, old.access_token, 'huy', '["Quán đã huỷ đơn"]'::jsonb, my_role() is not null);
  end if;
  return old;
exception when others then return old;
end $$;
drop trigger if exists orders_track_delete on orders;
create trigger orders_track_delete before delete on orders
  for each row execute function private.trg_order_delete();

-- Trang khách: các lần sửa / huỷ của đơn (theo mã đơn của khách)
create or replace function get_order_changes(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'lines', lines, 'at', created_at, 'staff', by_staff) order by id), '[]'::jsonb)
    from order_changes where token = p_token and p_token is not null
$$;
revoke all on function get_order_changes(uuid) from public;
grant execute on function get_order_changes(uuid) to anon, authenticated;
revoke all on all functions in schema private from public;


commit;

select 'Đã cập nhật 42 + 43 + 44' as ket_qua;

-- Kiểm tra: giao dịch bị ghi trùng (cùng mã FT) trong 3 ngày gần đây — nếu có, xoá tay hoá đơn thừa ở tab Đơn không gắn mã (nút Bỏ)
select (regexp_match(upper(content), '\m(FT[0-9A-Z]{8,20})\M'))[1] as ma_ft, amount, count(*) as so_lan
  from bank_txns where created_at > now() - interval '3 days'
 group by 1, 2 having count(*) > 1 and (regexp_match(upper(content), '\m(FT[0-9A-Z]{8,20})\M'))[1] is not null;
