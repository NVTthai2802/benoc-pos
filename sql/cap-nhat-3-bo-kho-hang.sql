-- =====================================================================
-- CẬP NHẬT 3 (17/10/2026): BỎ PHẦN KHO HÀNG / NHẬP HÀNG
-- Xoá các bảng, hàm và quyền của kho: product_categories, products,
-- stock_receipts, stock_movements, create_receipt, apply_stock_movement.
-- Không đụng tới menu, đơn, doanh thu, nhân viên, chấm công.
--
-- An toàn: nếu kho còn hàng hoá hoặc phiếu nhập thì file DỪNG, không xoá gì.
-- (Muốn xoá luôn dữ liệu đó thì tự xoá trong Table Editor trước rồi chạy lại.)
-- Chạy trên Supabase TEST trước, ổn rồi mới chạy trên PRODUCT. Chạy lại lần hai không sao.
-- =====================================================================
begin;

do $$
declare n bigint := 0;
begin
  if to_regclass('public.products') is not null then
    execute 'select count(*) from products' into n;
    if n > 0 then
      raise exception 'Kho còn % mặt hàng. Chưa xoá gì. Xoá hàng trong Table Editor > products trước nếu thật sự muốn bỏ.', n;
    end if;
  end if;
  if to_regclass('public.stock_receipts') is not null then
    execute 'select count(*) from stock_receipts' into n;
    if n > 0 then
      raise exception 'Còn % phiếu nhập hàng. Chưa xoá gì.', n;
    end if;
  end if;
end $$;

drop function if exists create_receipt(text, text, jsonb);
drop table if exists stock_movements;
drop function if exists apply_stock_movement();
drop table if exists stock_receipts;
drop table if exists products;
drop table if exists product_categories;   -- chỉ còn 3 loại hàng mặc định
drop type if exists stock_reason;

commit;

-- Kiểm tra: phải ra 0 dòng
select tablename from pg_tables
 where schemaname = 'public' and tablename in ('product_categories', 'products', 'stock_receipts', 'stock_movements');
