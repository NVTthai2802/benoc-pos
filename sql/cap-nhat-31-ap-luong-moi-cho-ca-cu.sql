-- =====================================================================
-- CẬP NHẬT 31: ÁP MỨC LƯƠNG MỚI CHO CÁC CA ĐÃ LÀM
--   Trước đây đổi lương/giờ chỉ áp dụng cho ca từ lúc đổi trở đi. Chủ quán quên đổi
--   vài buổi thì các ca đó vẫn tính lương cũ.
--   Hàm mới owner_set_shift_rate: chủ quán đặt lại lương/giờ cho các ca được chọn
--   (khi sửa nhân viên chọn "áp dụng từ ngày…", hoặc sửa riêng 1 ca).
--   - Ca đã kết thúc: tính lại tiền theo số phút tính lương và cách làm tròn tiền của ca đó.
--   - Ca đang làm: đổi lương/giờ, lúc ra ca sẽ tính theo mức mới.
--   - Ca ĐÃ ĐÁNH DẤU TRẢ thì KHÔNG đổi (tiền đã đưa nhân viên). Phần chênh trả bù bên ngoài.
--   - Ghi chú của ca tự thêm dòng "Lương/giờ 22.000đ → 25.000đ" để đối chiếu.
-- Chạy sau cập nhật 30. Chạy trên TEST trước, rồi Product. Không xoá dữ liệu, chạy lại vẫn an toàn.
-- =====================================================================
begin;

create or replace function owner_set_shift_rate(p_ids uuid[], p_rate int)
returns int  -- số ca đã đổi
language plpgsql security definer set search_path = public as $$
declare
  n   int;
  cfg shop_settings;
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  if p_rate is null or p_rate < 0 then raise exception 'BAD_RATE'; end if;
  select * into cfg from shop_settings where id = 1;
  update shifts s
     set hourly_rate = p_rate,
         pay_amount  = case when s.check_out_at is null or s.paid_minutes is null then s.pay_amount
                            else round_money(s.paid_minutes * p_rate / 60.0, coalesce(s.pay_round, cfg.pay_round)) end,
         note        = left(concat_ws(' · ', nullif(trim(s.note), ''),
                         'Lương/giờ ' || replace(to_char(s.hourly_rate, 'FM999,999,999'), ',', '.') || 'đ → '
                                      || replace(to_char(p_rate, 'FM999,999,999'), ',', '.') || 'đ'), 300)
   where s.id = any(p_ids)
     and s.paid_out_at is null
     and s.hourly_rate is distinct from p_rate;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function owner_set_shift_rate(uuid[], int) from public, anon;
grant execute on function owner_set_shift_rate(uuid[], int) to authenticated;

commit;

-- Báo cho trang web biết có hàm mới (PostgREST tải lại danh sách hàm)
notify pgrst, 'reload schema';
