-- =====================================================================
-- XOÁ DỮ LIỆU TEST — chạy trong Supabase > SQL Editor khi thử xong.
-- PHẦN 1 (luôn chạy): xoá đơn, doanh thu, ca làm, kho hàng.
--   GIỮ NGUYÊN: menu, ảnh món, tuỳ chọn, cài đặt quán, tài khoản đăng nhập.
-- =====================================================================
begin;
delete from staff_calls;
delete from order_items;
delete from orders;
delete from sales;
delete from shifts;
delete from stock_movements;
delete from stock_receipts;
delete from products;
commit;

-- =====================================================================
-- PHẦN 2 (tuỳ chọn): xoá LUÔN MỌI TÀI KHOẢN, kể cả chủ quán.
-- Sau đó mở trang quanly.html sẽ hiện lại "Cài đặt lần đầu" để tạo chủ quán mới.
-- Muốn dùng: bỏ dấu "--" ở 2 dòng dưới rồi chạy (chạy sau phần 1).
-- =====================================================================
-- delete from employees;
-- delete from auth.users;

-- Ảnh chấm công và ảnh món tải lên lúc test nằm ở Storage
-- (checkin-photos, menu-images/items). Muốn xoá: Supabase > Storage > chọn file > Delete.
-- Ảnh menu gốc nằm trong trang web (thư mục img/), không bị ảnh hưởng.
