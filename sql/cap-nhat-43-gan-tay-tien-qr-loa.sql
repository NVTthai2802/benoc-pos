-- =====================================================================
-- CẬP NHẬT 43 — Gán tay tiền QR loa vào đơn (nút 🔔 Thông báo ở Bếp / Pha chế)
-- ---------------------------------------------------------------------
-- Khách có đơn (tự gọi món / ship) nhưng lại quét QR dán trên loa → tiền vào không có mã BN…
-- → máy ghi "Đơn không gắn mã" (cập nhật 39/41). Ở màn hình Bếp / Pha chế, nút 🔔 gợi ý
-- các đơn chưa thu cùng số tiền; nhân viên bấm:
--   • "Gán vào Bàn X"  → link_bank_txn(): đơn đó Đã thu · Chuyển khoản (đã ra món thì đóng đơn),
--                        bỏ hoá đơn "không gắn mã" (không tính doanh thu 2 lần).
--   • "Không phải"     → dismiss_bank_txn(): giữ là đơn không gắn mã (khách gọi mồm), ẩn gợi ý.
-- Máy KHÔNG tự gán. Cần đã chạy 39 (và 41). Chỉ thêm cột / hàm. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

alter table bank_txns add column if not exists reviewed_at timestamptz;   -- nhân viên đã xử lý gợi ý
alter table bank_txns add column if not exists reviewed_by uuid;

create or replace function link_bank_txn(p_txn bigint, p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t bank_txns; o orders; v_due int; v_status text; v_note text; v_where text;
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  select * into t from bank_txns where id = p_txn for update;
  if not found then raise exception 'TXN_NOT_FOUND'; end if;
  if t.status <> 'khong_ma' or t.sale_id is null then raise exception 'TXN_ALREADY_HANDLED'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  v_due := o.total - coalesce(o.paid_amount, 0);
  if v_due <= 0 then raise exception 'ORDER_ALREADY_PAID'; end if;
  v_where := case when o.queue_number is not null then 'Bàn ' || o.queue_number else coalesce(o.customer_name, 'đơn') end;

  -- Bỏ hoá đơn "không gắn mã" của khoản này (tiền này là của đơn)
  delete from sales where id = t.sale_id and source = 'khong_ma';

  if t.amount >= v_due then
    update orders set paid_amount = total, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = my_employee_id() where id = o.id;
    v_status := 'da_khop';
    v_note := 'Gán tay vào ' || v_where || case when t.amount > v_due then ' · khách chuyển dư ' || (t.amount - v_due) || 'đ' else '' end;
  else
    update orders set paid_amount = coalesce(paid_amount, 0) + t.amount, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = my_employee_id() where id = o.id;
    v_status := 'thieu_tien';
    v_note := 'Gán tay vào ' || v_where || ' · còn thiếu ' || (v_due - t.amount) || 'đ';
  end if;
  update bank_txns set order_id = o.id, sale_id = null, status = v_status, note = v_note,
         reviewed_at = now(), reviewed_by = my_employee_id() where id = t.id;
  -- Đã ra món và đủ tiền → đóng đơn (finalize lấy bank_txn_id theo order_id)
  if v_status = 'da_khop' and o.status = 'da_ra_mon' then perform private.finalize_order(o.id, 'chuyen_khoan'); end if;
  return jsonb_build_object('ok', true, 'status', v_status, 'where', v_where);
end $$;

create or replace function dismiss_bank_txn(p_txn bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() is null then raise exception 'FORBIDDEN'; end if;
  update bank_txns set reviewed_at = now(), reviewed_by = my_employee_id()
   where id = p_txn and status = 'khong_ma' and reviewed_at is null;
end $$;

revoke all on function link_bank_txn(bigint, uuid), dismiss_bank_txn(bigint) from public;
grant execute on function link_bank_txn(bigint, uuid), dismiss_bank_txn(bigint) to authenticated;

select 'Đã cập nhật: gán tay tiền QR loa vào đơn' as ket_qua;
