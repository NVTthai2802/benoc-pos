-- =====================================================================
-- CẬP NHẬT 39 — Đơn không gắn mã vào doanh thu + Best seller tự động
-- ---------------------------------------------------------------------
-- (Đã gồm cập nhật 38: không chạy 38 cũng được. Cần đã chạy 37.)
--
-- 1. Tiền vào KHÔNG có mã BN… (khách gọi mồm quét QR dán trên loa…):
--    - không đoán gán vào đơn nào (tránh đánh dấu nhầm bàn khác cùng giá);
--    - tự tạo 1 hoá đơn "không gắn mã" (chuyển khoản, không có món) → tính vào doanh thu,
--      xem ở Doanh thu → Hoá đơn → tab "Đơn không gắn mã".
--    - Chủ quán bấm "Bỏ" nếu khoản đó thực ra là tiền của 1 đơn đã thu tay (tránh tính 2 lần).
-- 2. best_sellers(): món bán chạy nhất 7 ngày của từng quầy (bếp / pha chế) → menu khách
--    tự gắn nhãn "Best seller".
--
-- Chỉ thêm cột / hàm. Không sửa dữ liệu cũ. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

-- Hoá đơn có nguồn: pos (đơn trong phần mềm) | khong_ma (tiền vào không có mã đơn)
alter table sales add column if not exists source text not null default 'pos';
alter table sales drop constraint if exists sales_source_check;
alter table sales add constraint sales_source_check check (source in ('pos', 'khong_ma'));
alter table sales add column if not exists bank_txn_id bigint;
alter table bank_txns add column if not exists sale_id uuid;

alter table bank_txns drop constraint if exists bank_txns_status_check;
alter table bank_txns add constraint bank_txns_status_check
  check (status in ('da_khop', 'thieu_tien', 'chua_khop', 'don_da_thu', 'mau', 'khong_ma'));

-- Khớp 1 giao dịch với đơn (thay bản của cập nhật 37/38)
create or replace function private.bank_apply(p_txn bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t bank_txns; o orders; v_n int; v_due int; v_status text; v_note text; v_sale uuid; v_name text;
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
    -- → tạo 1 hoá đơn "không gắn mã" để tính vào doanh thu (tab Đơn không gắn mã trong Hoá đơn)
    v_sale := gen_random_uuid();
    v_name := initcap(lower(btrim((regexp_match(coalesce(t.content, ''), 'FT[0-9A-Z]+\s*,\s*([^,|]{2,60}?)\s*,'))[1])));
    insert into sales (id, queue_number, dine_type, total, payment_method, items, ordered_at, paid_at, customer_name, source, bank_txn_id)
    values (v_sale, null, 'tai_quan', t.amount, 'chuyen_khoan', '[]'::jsonb, coalesce(t.txn_at, now()), coalesce(t.txn_at, now()),
            coalesce(nullif(v_name, ''), 'Khách quét QR'), 'khong_ma', t.id);
    update bank_txns set status = 'khong_ma', sale_id = v_sale, note = 'Không có mã đơn (quét QR loa) → đã ghi doanh thu' where id = t.id;
    return jsonb_build_object('matched', false, 'reason', 'no_code', 'sale', true);
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


-- Chủ quán bỏ 1 hoá đơn không gắn mã khỏi doanh thu (khoản đó đã được tính ở 1 đơn khác)
create or replace function unlink_sale(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  update bank_txns set sale_id = null, note = 'Đã bỏ khỏi doanh thu (trùng với đơn đã thu)' where sale_id = p_id;
  delete from sales where id = p_id and source = 'khong_ma';
end $$;
grant execute on function unlink_sale(uuid) to authenticated;

-- Món bán chạy nhất N ngày (mặc định 7) của mỗi quầy, theo số lượng (bằng nhau thì theo tiền). Không tính món tặng.
create or replace function best_sellers(p_days int default 7)
returns table (menu_item_id uuid, station text, qty bigint)
language sql stable security definer set search_path = public as $$
  with s as (
    select (i ->> 'menu_item_id')::uuid as mid,
           coalesce(i ->> 'station', 'bep') as st,
           sum(coalesce((i ->> 'qty')::int, 0)) as q,
           sum(coalesce((i ->> 'price')::int, 0) * coalesce((i ->> 'qty')::int, 0)) as rev
      from sales, jsonb_array_elements(items) i
     where paid_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 60)))
       and coalesce(i ->> 'promo_part', '') <> 'tang'
       and (i ->> 'menu_item_id') is not null
     group by 1, 2
  ), r as (
    select s.mid, s.st, s.q, row_number() over (partition by s.st order by s.q desc, s.rev desc) as rn
      from s join menu_items m on m.id = s.mid
  )
  select mid, st, q from r where rn = 1 and q > 0
$$;
grant execute on function best_sellers(int) to anon, authenticated;

select 'Đã cập nhật: đơn không gắn mã vào doanh thu + best seller' as ket_qua;
