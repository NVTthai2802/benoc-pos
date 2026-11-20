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

select 'Đã cập nhật: khách thấy đơn bị huỷ / được sửa' as ket_qua;
