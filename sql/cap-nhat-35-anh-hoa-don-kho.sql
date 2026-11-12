-- =====================================================================
-- CẬP NHẬT 35: ẢNH HOÁ ĐƠN NHẬP KHO
--   * Mỗi lần nhập hàng chụp / tải được ảnh hoá đơn của nhà cung cấp.
--   * Một hoá đơn thường có nhiều mặt hàng: chụp 1 lần, các lần nhập sau
--     chọn lại "hoá đơn vừa chụp" là các mặt hàng cùng gắn vào 1 ảnh.
--   * Ảnh lưu ở bucket riêng tư "hoa-don-kho": nhân viên + chủ quán xem được,
--     chỉ chủ quán xoá được.
-- Chỉ thêm bảng / cột / bucket và thay hàm stock_move (thêm tham số
-- p_receipt, không bắt buộc). Không đụng tồn kho. Chạy lại vẫn an toàn.
-- Chạy sau cập nhật 16. Chạy trên Test trước, thử rồi mới chạy trên Product.
-- =====================================================================
begin;

-- 1. Bảng hoá đơn nhập (mỗi ảnh là 1 dòng)
create table if not exists stock_receipts (
  id            bigserial primary key,
  photo_path    text not null,          -- đường dẫn trong bucket hoa-don-kho
  supplier      text,                   -- nhà cung cấp
  invoice_no    text,                   -- số hoá đơn
  note          text,
  employee_id   uuid references employees(id) on delete set null,
  employee_name text,
  created_at    timestamptz not null default now()
);
create index if not exists stock_receipts_time on stock_receipts(created_at desc);

alter table stock_moves add column if not exists receipt_id bigint references stock_receipts(id) on delete set null;
create index if not exists stock_moves_receipt on stock_moves(receipt_id) where receipt_id is not null;

alter table stock_receipts enable row level security;
drop policy if exists stock_receipts_read on stock_receipts;
create policy stock_receipts_read on stock_receipts for select using (my_role() is not null);
drop policy if exists stock_receipts_owner on stock_receipts;
create policy stock_receipts_owner on stock_receipts for all using (my_role() = 'owner') with check (my_role() = 'owner');
grant select, insert, update, delete on stock_receipts to authenticated;
grant usage, select on sequence stock_receipts_id_seq to authenticated;

-- 2. Thêm hoá đơn (nhân viên cũng dùng được; tên người chụp lấy theo tài khoản)
create or replace function stock_receipt_add(p_path text, p_supplier text default null, p_invoice_no text default null, p_note text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_emp employees; v_id bigint;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  if p_path is null or p_path !~ '^[0-9]{4}-[0-9]{2}/[A-Za-z0-9._-]{1,80}\.jpg$' then raise exception 'BAD_PATH'; end if;
  select * into v_emp from employees where id = my_employee_id();
  insert into stock_receipts (photo_path, supplier, invoice_no, note, employee_id, employee_name)
  values (p_path, nullif(left(trim(p_supplier), 80), ''), nullif(left(trim(p_invoice_no), 40), ''),
          nullif(left(trim(p_note), 200), ''), v_emp.id, v_emp.full_name)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function stock_receipt_add(text, text, text, text) from public, anon;
grant execute on function stock_receipt_add(text, text, text, text) to authenticated;

-- 3. stock_move: thêm p_receipt (gắn lần nhập vào hoá đơn). Bỏ bản cũ để không trùng tên hàm.
drop function if exists stock_move(uuid, text, numeric, boolean, text, int);
create or replace function stock_move(p_item uuid, p_kind text, p_amount numeric, p_in_buy_unit boolean default false,
                                      p_note text default null, p_cost int default null, p_receipt bigint default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare it stock_items; v_use numeric; v_delta numeric; v_emp employees;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  if p_kind not in ('nhap', 'dung', 'hong', 'kiem') then raise exception 'BAD_KIND'; end if;
  if p_amount is null or p_amount < 0 or (p_kind <> 'kiem' and p_amount = 0) then raise exception 'BAD_QTY'; end if;
  if p_receipt is not null and not exists (select 1 from stock_receipts where id = p_receipt) then raise exception 'RECEIPT_NOT_FOUND'; end if;
  select * into it from stock_items where id = p_item for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  v_use := p_amount * case when p_in_buy_unit then it.per_buy else 1 end;
  v_delta := case p_kind when 'nhap' then v_use when 'kiem' then v_use - it.qty else -v_use end;
  update stock_items set qty = qty + v_delta where id = p_item;
  select * into v_emp from employees where id = my_employee_id();
  insert into stock_moves (item_id, kind, delta, qty_after, amount, unit, cost, note, employee_id, employee_name, receipt_id)
  values (p_item, p_kind, v_delta, it.qty + v_delta, p_amount, case when p_in_buy_unit then it.buy_unit else it.use_unit end,
          case when p_kind = 'nhap' then p_cost end, nullif(left(trim(p_note), 200), ''), v_emp.id, v_emp.full_name,
          case when p_kind = 'nhap' then p_receipt end);
  return jsonb_build_object('qty', it.qty + v_delta, 'delta', v_delta);
end $$;
revoke execute on function stock_move(uuid, text, numeric, boolean, text, int, bigint) from public, anon;
grant execute on function stock_move(uuid, text, numeric, boolean, text, int, bigint) to authenticated;

-- 4. Bucket ảnh hoá đơn (riêng tư, tối đa 2MB / ảnh — app đã thu nhỏ ảnh còn ~150–300KB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hoa-don-kho', 'hoa-don-kho', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;
drop policy if exists hoa_don_kho_upload on storage.objects;
create policy hoa_don_kho_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'hoa-don-kho' and public.my_role() is not null);
drop policy if exists hoa_don_kho_view on storage.objects;
create policy hoa_don_kho_view on storage.objects for select to authenticated
  using (bucket_id = 'hoa-don-kho' and public.my_role() is not null);
drop policy if exists hoa_don_kho_del on storage.objects;
create policy hoa_don_kho_del on storage.objects for delete to authenticated
  using (bucket_id = 'hoa-don-kho' and public.my_role() = 'owner');

commit;

select 'Đã thêm ảnh hoá đơn nhập kho' as ket_qua, (select count(*) from stock_receipts) as so_hoa_don;
