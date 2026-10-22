-- =====================================================================
-- CẬP NHẬT 17: QUY CÁCH NHẬP HÀNG (giống "Tuỳ chọn" của menu)
--   Chủ quán tự tạo quy cách dùng chung: "Thùng 24 gói", "Thùng 4 can", "Can", "Bao 25kg"…
--   rồi gắn cho từng mặt hàng. Sửa quy cách thì mọi mặt hàng đang dùng nó đổi theo.
-- Chạy sau cập nhật 16. Chỉ thêm bảng / cột mới, không đụng tồn kho. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

create table if not exists stock_packs (
  id         bigserial primary key,
  name       text not null unique check (length(trim(name)) > 0), -- tên quy cách: "Thùng 24 gói"
  buy_unit   text not null,                                       -- đơn vị nhập: thùng
  use_unit   text not null,                                       -- đơn vị dùng: gói
  per_buy    numeric not null check (per_buy > 0),                -- 1 thùng = 24 gói
  sort_order int not null default 0
);
alter table stock_items add column if not exists pack_id bigint references stock_packs(id) on delete set null;

-- Quy cách mẫu (chỉ thêm nếu chưa có)
insert into stock_packs (name, buy_unit, use_unit, per_buy, sort_order) values
  ('Thùng 24 gói', 'thùng', 'gói', 24, 1),
  ('Thùng 4 can', 'thùng', 'can', 4, 2),
  ('Can (nhập, dùng theo can)', 'can', 'can', 1, 3),
  ('Bao 25 kg', 'bao', 'kg', 25, 4),
  ('Thùng 48 hộp', 'thùng', 'hộp', 48, 5),
  ('Thùng 20 cây', 'thùng', 'cây', 20, 6)
on conflict (name) do nothing;

-- Sửa quy cách → mặt hàng đang dùng quy cách đó đổi đơn vị theo (tồn vẫn giữ theo đơn vị dùng)
create or replace function sync_stock_pack() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update stock_items set buy_unit = new.buy_unit, use_unit = new.use_unit, per_buy = new.per_buy
   where pack_id = new.id;
  return null;
end $$;
drop trigger if exists trg_stock_pack_sync on stock_packs;
create trigger trg_stock_pack_sync after update on stock_packs for each row execute function sync_stock_pack();

alter table stock_packs enable row level security;
drop policy if exists stock_packs_read on stock_packs;
create policy stock_packs_read on stock_packs for select using (my_role() is not null);
drop policy if exists stock_packs_owner on stock_packs;
create policy stock_packs_owner on stock_packs for all using (my_role() = 'owner') with check (my_role() = 'owner');
grant select, insert, update, delete on stock_packs to authenticated;
grant usage, select on sequence stock_packs_id_seq to authenticated;

commit;

select 'Đã thêm quy cách nhập hàng' as ket_qua, (select count(*) from stock_packs) as so_quy_cach;
