-- =====================================================================
-- CẬP NHẬT 48 — Chốt ngày: tiền QR loa tự "đã xem", đơn trả muộn tính về ngày đặt
-- ---------------------------------------------------------------------
-- 1. Mỗi đêm 00:05 (giờ VN): khoản tiền QR loa (không gắn mã) của các ngày trước mà chưa ai
--    gán / bấm "Không phải" → tự đánh dấu đã xem. Doanh thu của khoản đó đã nằm sẵn ở
--    "Đơn không gắn mã" đúng ngày tiền về, nên không cộng thêm.
-- 2. Đơn đặt hôm trước nhưng hôm sau mới bấm Thanh toán → doanh thu tính về NGÀY ĐẶT
--    (đơn hẹn giờ lấy / giao thì tính về ngày hẹn). Giờ thu thật giữ ở cột paid_real_at.
-- 3. Áp luôn cho dữ liệu cũ (giữ giờ thu thật ở paid_real_at, muốn trả lại thì xem cuối file).
-- Không xoá dữ liệu. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

create schema if not exists private;

-- ---- 2. Đơn trả muộn → doanh thu về ngày đặt
alter table sales add column if not exists paid_real_at timestamptz;  -- giờ bấm thu thật (khi khác ngày đặt)

create or replace function private.vn_day(t timestamptz) returns date
language sql immutable as $$ select (t at time zone 'Asia/Ho_Chi_Minh')::date $$;

create or replace function private.vn_day_end(d date) returns timestamptz
language sql immutable as $$ select ((d + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh') - interval '1 second' $$;

create or replace function private.trg_sale_day() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_day date;
begin
  if new.source = 'khong_ma' or new.ordered_at is null or new.paid_at is null then return new; end if;
  -- ngày phục vụ: ngày hẹn (đơn đặt trước) hoặc ngày đặt
  select private.vn_day(coalesce(o.deliver_at, new.ordered_at)) into v_day from orders o where o.id = new.id;
  v_day := coalesce(v_day, private.vn_day(new.ordered_at));
  if v_day < private.vn_day(new.paid_at) then
    new.paid_real_at := new.paid_at;
    new.paid_at := private.vn_day_end(v_day);   -- 23:59:59 ngày đặt
  end if;
  return new;
exception when others then return new;   -- không bao giờ chặn việc thu tiền
end $$;
drop trigger if exists sales_ve_ngay_dat on sales;
create trigger sales_ve_ngay_dat before insert on sales for each row execute function private.trg_sale_day();

-- Dữ liệu cũ: hoá đơn đã thu muộn sang hôm sau → về ngày đặt
update sales set paid_real_at = paid_at, paid_at = private.vn_day_end(private.vn_day(ordered_at))
 where paid_real_at is null and coalesce(source, 'pos') <> 'khong_ma'
   and private.vn_day(ordered_at) < private.vn_day(paid_at);

-- ---- 1. Chốt ngày: tiền QR loa của ngày trước tự "đã xem"
create or replace function private.chot_ngay() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update bank_txns set reviewed_at = now(),
         note = coalesce(note || ' · ', '') || 'Tự đánh dấu đã xem khi chốt ngày'
   where status = 'khong_ma' and reviewed_at is null
     and private.vn_day(created_at) < private.vn_day(now());
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on all functions in schema private from public;

create extension if not exists pg_cron;
do $$ begin perform cron.unschedule('benoc-chot-ngay'); exception when others then null; end $$;
select cron.schedule('benoc-chot-ngay', '5 17 * * *', 'select private.chot_ngay()');   -- 17:05 UTC = 00:05 giờ VN

select private.chot_ngay() as da_danh_dau_da_xem,
       (select count(*) from sales where paid_real_at is not null) as hoa_don_ve_ngay_dat;

-- Muốn trả lại giờ thu cũ cho dữ liệu cũ:
--   update sales set paid_at = paid_real_at, paid_real_at = null where paid_real_at is not null;
