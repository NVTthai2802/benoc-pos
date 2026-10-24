-- =====================================================================
-- CẬP NHẬT 21: MÃ VẠCH CHO KHO HÀNG
--   * Mỗi mặt hàng gắn được nhiều mã vạch: mã in trên THÙNG và mã in trên GÓI
--     thường khác nhau. Quét mã thùng → nhập theo thùng, quét mã gói → theo gói.
--   * Lần đầu quét một mã lạ: chọn mặt hàng (hoặc chủ quán thêm hàng mới),
--     máy nhớ mã → lần sau quét là ra ngay.
--   Nhân viên: gắn mã mới cho hàng có sẵn. Chủ quán: gắn, đổi, gỡ mã.
-- Chạy sau cập nhật 16. Chỉ thêm bảng mới, không đụng tồn kho. Chạy lại vẫn an toàn.
-- =====================================================================
begin;

create table if not exists stock_barcodes (
  code       text primary key check (code ~ '^[0-9A-Za-z.\-]{3,64}$'),
  item_id    uuid not null references stock_items(id) on delete cascade,
  unit_kind  text not null default 'buy' check (unit_kind in ('buy', 'use')), -- mã in trên đơn vị nhập (thùng) hay đơn vị dùng (gói)
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists stock_barcodes_item on stock_barcodes(item_id);

alter table stock_barcodes enable row level security;
drop policy if exists stock_barcodes_read on stock_barcodes;
create policy stock_barcodes_read on stock_barcodes for select using (my_role() is not null);
drop policy if exists stock_barcodes_add on stock_barcodes;
create policy stock_barcodes_add on stock_barcodes for insert with check (my_role() is not null);
drop policy if exists stock_barcodes_owner on stock_barcodes;
create policy stock_barcodes_owner on stock_barcodes for all using (my_role() = 'owner') with check (my_role() = 'owner');
grant select, insert, update, delete on stock_barcodes to authenticated;

commit;

select 'Đã thêm mã vạch kho' as ket_qua, (select count(*) from stock_barcodes) as so_ma;
