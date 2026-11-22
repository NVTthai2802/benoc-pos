-- Địa chỉ + số điện thoại in dưới tên quán trên phiếu (sửa ở Quản lý → Cài đặt → Quán).
-- Chỉ thêm cột, không đổi gì khác: bản phần mềm cũ vẫn chạy bình thường.
alter table public.shop_settings add column if not exists print_address text not null default '';
alter table public.shop_settings add column if not exists print_phone text not null default '';
