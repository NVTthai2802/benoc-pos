-- =====================================================================
-- CẬP NHẬT 16: KHO HÀNG (nhập theo thùng, dùng theo gói…)
--   * Mỗi mặt hàng có đơn vị NHẬP (thùng, can, bao…) và đơn vị DÙNG (gói, can, kg…),
--     kèm quy đổi: 1 thùng = 24 gói. Hàng nhập và dùng cùng một đơn vị
--     (ví dụ can đường) thì để 1 can = 1 can.
--   * Tồn kho tính theo đơn vị dùng. Nhập hàng, lấy dùng, báo hỏng, kiểm kho
--     đều ghi vào lịch sử (ai làm, lúc nào).
--   * Báo "sắp hết" khi tồn ≤ mức chủ quán đặt.
--   Chủ quán: thêm/sửa mặt hàng, xem tiền nhập. Nhân viên: nhập hàng, lấy dùng, kiểm kho.
-- Chỉ thêm bảng / hàm mới, không đụng dữ liệu cũ. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

create table if not exists stock_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  grp         text,                                   -- nhóm: Đồ khô, Nguyên liệu pha chế, Gia vị…
  use_unit    text not null default 'gói',            -- đơn vị dùng (tồn kho tính theo đơn vị này)
  buy_unit    text not null default 'thùng',          -- đơn vị nhập
  per_buy     numeric not null default 1 check (per_buy > 0), -- 1 đơn vị nhập = bao nhiêu đơn vị dùng
  qty         numeric not null default 0,             -- tồn hiện tại (đơn vị dùng)
  min_qty     numeric not null default 0 check (min_qty >= 0), -- tồn ≤ mức này thì báo sắp hết
  cost_per_buy int check (cost_per_buy >= 0),         -- giá nhập 1 đơn vị nhập (để gợi ý tiền)
  note        text,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists stock_moves (
  id          bigserial primary key,
  item_id     uuid not null references stock_items(id) on delete cascade,
  kind        text not null check (kind in ('nhap', 'dung', 'hong', 'kiem')), -- nhập / lấy dùng / hỏng-mất / kiểm kho
  delta       numeric not null,        -- thay đổi tồn (đơn vị dùng), âm là giảm
  qty_after   numeric not null,        -- tồn sau khi ghi
  amount      numeric not null,        -- số lượng người ghi nhập vào
  unit        text not null,           -- đơn vị người ghi chọn (thùng / gói…)
  cost        int,                     -- tiền nhập (phiếu nhập)
  note        text,
  employee_id uuid references employees(id) on delete set null,
  employee_name text,
  created_at  timestamptz not null default now()
);
create index if not exists stock_moves_item_time on stock_moves(item_id, created_at desc);
create index if not exists stock_moves_time on stock_moves(created_at desc);

-- Ghi một lần nhập / lấy dùng / hỏng / kiểm kho.
--   p_amount: số lượng; p_in_buy_unit: true = theo đơn vị nhập (thùng), false = theo đơn vị dùng (gói)
--   kiểm kho: p_amount là số đếm được thực tế, máy tự tính chênh lệch.
create or replace function stock_move(p_item uuid, p_kind text, p_amount numeric, p_in_buy_unit boolean default false,
                                      p_note text default null, p_cost int default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare it stock_items; v_use numeric; v_delta numeric; v_emp employees;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  if p_kind not in ('nhap', 'dung', 'hong', 'kiem') then raise exception 'BAD_KIND'; end if;
  if p_amount is null or p_amount < 0 or (p_kind <> 'kiem' and p_amount = 0) then raise exception 'BAD_QTY'; end if;
  select * into it from stock_items where id = p_item for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  v_use := p_amount * case when p_in_buy_unit then it.per_buy else 1 end;
  v_delta := case p_kind when 'nhap' then v_use when 'kiem' then v_use - it.qty else -v_use end;
  update stock_items set qty = qty + v_delta where id = p_item;
  select * into v_emp from employees where id = my_employee_id();
  insert into stock_moves (item_id, kind, delta, qty_after, amount, unit, cost, note, employee_id, employee_name)
  values (p_item, p_kind, v_delta, it.qty + v_delta, p_amount, case when p_in_buy_unit then it.buy_unit else it.use_unit end,
          case when p_kind = 'nhap' then p_cost end, nullif(left(trim(p_note), 200), ''), v_emp.id, v_emp.full_name);
  return jsonb_build_object('qty', it.qty + v_delta, 'delta', v_delta);
end $$;

alter table stock_items enable row level security;
alter table stock_moves enable row level security;
drop policy if exists stock_items_read on stock_items;
create policy stock_items_read on stock_items for select using (my_role() is not null);
drop policy if exists stock_items_owner on stock_items;
create policy stock_items_owner on stock_items for all using (my_role() = 'owner') with check (my_role() = 'owner');
drop policy if exists stock_moves_read on stock_moves;
create policy stock_moves_read on stock_moves for select using (my_role() is not null);
drop policy if exists stock_moves_owner_del on stock_moves;
create policy stock_moves_owner_del on stock_moves for delete using (my_role() = 'owner');
grant select, insert, update, delete on stock_items, stock_moves to authenticated;
grant usage, select on sequence stock_moves_id_seq to authenticated;
grant execute on function stock_move(uuid, text, numeric, boolean, text, int) to authenticated;

commit;

select 'Đã thêm kho hàng' as ket_qua, (select count(*) from stock_items) as so_mat_hang;
