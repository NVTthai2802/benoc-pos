-- =====================================================================
-- CẬP NHẬT 38 — Tiền vào KHÔNG có mã đơn thì không đoán theo số tiền
-- ---------------------------------------------------------------------
-- Khách gọi mồm (không có đơn trong phần mềm) vẫn quét QR dán trên loa.
-- Trước đây (cập nhật 37) tiền vào không có mã BN… sẽ tự khớp nếu có đúng 1 đơn
-- chưa thu cùng số tiền → dễ đánh dấu nhầm đơn của bàn khác.
-- Từ bản này: chỉ khớp theo mã BN…; không có mã → ghi "Không gắn đơn" để đối soát.
-- Chỉ thay hàm khớp + thêm 1 trạng thái. Không sửa dữ liệu. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

alter table bank_txns drop constraint if exists bank_txns_status_check;
alter table bank_txns add constraint bank_txns_status_check
  check (status in ('da_khop', 'thieu_tien', 'chua_khop', 'don_da_thu', 'mau', 'khong_ma'));

-- 5. Khớp 1 giao dịch với đơn (dùng chung cho mọi nguồn)
create or replace function private.bank_apply(p_txn bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t bank_txns; o orders; v_n int; v_due int; v_status text; v_note text;
begin
  select * into t from bank_txns where id = p_txn for update;
  if t.amount <= 0 then
    update bank_txns set note = coalesce(note, 'Không đọc được số tiền') where id = t.id;
    return jsonb_build_object('matched', false, 'reason', 'no_amount');
  end if;

  if t.pay_code is not null then
    select count(*) into v_n from orders where private.pay_code(id) = t.pay_code and created_at > now() - interval '3 days';
    if v_n = 1 then
      select * into o from orders where private.pay_code(id) = t.pay_code and created_at > now() - interval '3 days' for update;
    else
      update bank_txns set note = case when v_n = 0 then 'Không thấy đơn ' || t.pay_code else 'Nhiều đơn trùng mã ' || t.pay_code end where id = t.id;
      return jsonb_build_object('matched', false, 'reason', 'code');
    end if;
  else
    -- Không có mã BN…: khách quét QR dán trên loa / chuyển tay (thường là khách gọi mồm, không có đơn).
    -- KHÔNG đoán theo số tiền (dễ gán nhầm sang đơn khác cùng giá). Chỉ ghi lại để đối soát.
    update bank_txns set status = 'khong_ma', note = 'Không có mã đơn (quét QR loa / chuyển tay)' where id = t.id;
    return jsonb_build_object('matched', false, 'reason', 'no_code');
  end if;

  v_due := o.total - coalesce(o.paid_amount, 0);
  if v_due <= 0 then
    v_status := 'don_da_thu'; v_note := 'Đơn đã thu đủ trước đó, kiểm tra trả lại khách';
  elsif t.amount >= v_due then
    update orders set paid_amount = total, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = null where id = o.id;
    if o.status = 'da_ra_mon' then perform private.finalize_order(o.id, 'chuyen_khoan'); end if;
    v_status := 'da_khop';
    v_note := case when t.amount > v_due then 'Khách chuyển dư ' || (t.amount - v_due) || 'đ' end;
  else
    update orders set paid_amount = coalesce(paid_amount, 0) + t.amount, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = null where id = o.id;
    v_status := 'thieu_tien'; v_note := 'Còn thiếu ' || (v_due - t.amount) || 'đ';
  end if;
  update bank_txns set order_id = o.id, status = v_status, note = v_note where id = t.id;
  return jsonb_build_object('matched', true, 'status', v_status,
    'where', case when o.queue_number is not null then 'Bàn ' || o.queue_number else coalesce(o.customer_name, 'đơn') end);
end $$;

select 'Đã cập nhật: chỉ khớp đơn theo mã BN…' as ket_qua;
