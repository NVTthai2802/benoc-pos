-- =====================================================================
-- CẬP NHẬT 41 — Sửa khớp chuyển khoản, tên người chuyển MoMo, gắn mã giao dịch vào hoá đơn
-- ---------------------------------------------------------------------
-- 1. private.sender_name(content): lấy đúng tên người chuyển kể cả khi chuyển qua MoMo /
--    trung gian thanh toán ("CONG TY CO PHAN DICH VU DI DONG TRUC TUYEN, 157...-039...-DUONG THANH NAM chuyen tien qua MoMo"
--    → "Duong Thanh Nam").
-- 2. private.bank_apply(p_txn):
--    - Khi có mã BNxxxxxx mà đơn vừa được nhân viên bấm thu tay xong (đã sang bảng sales):
--      tự nhận diện là 'don_da_thu' ("Đơn đã thu trước đó") và gắn bank_txn_id thay vì báo đỏ "Không thấy đơn".
--    - Khi có mã BNxxxxxx khớp với đơn đang mở nhưng trùng với 1 khoản "Đơn không gắn mã" vừa tạo
--      cùng số tiền trong vài phút (do thông báo gộp hoặc gửi lại): không tính trùng.
--    - Khi không có mã BNxxxxxx (khách quét QR loa): ghi vào sales (source = 'khong_ma') với tên người chuyển
--      đã lọc đúng (không bị hiện tên công ty MoMo) và trả về tên khách + sale_id để màn hình Bếp/Pha chế báo rõ
--      "Tiền vào QR loa (không mã đơn): 50.000đ · <tên khách>" giúp nhân viên không bấm nhầm vào đơn của khách khác.
-- 3. private.finalize_order(p_order, p_method):
--    - Giữ liên kết bank_txn_id trên bảng sales khi đơn đã khớp chuyển khoản tự động để phân biệt rõ
--      đơn nào do máy tự khớp QR hoá đơn, đơn nào do nhân viên bấm thu tay.
-- 4. Cập nhật lại tên người chuyển cho các hoá đơn 'khong_ma' cũ bị ghi tên công ty trung gian MoMo.
-- =====================================================================

-- 1. Tách tên người chuyển từ nội dung thông báo ngân hàng (Techcombank Store Noti / SePay)
create or replace function private.sender_name(p_content text) returns text
language plpgsql immutable as $$
declare
  t text := coalesce(p_content, '');
  m text[];
  v_raw text;
begin
  -- Trường hợp chuyển qua MoMo / ví điện tử: "...-0399276208-DUONG THANH NAM chuyen tien..."
  m := regexp_match(t, '[0-9]{6,}-[0-9]{8,12}-([A-Za-zÀ-ỹ ]{2,50}?)\s+(?:chuyen\s+tien|chuyển\s+tiền|thanh\s+toan|thanh\s+toán)', 'i');
  if m is not null then
    v_raw := btrim(m[1]);
  end if;

  -- Trường hợp "... , <TÊN> chuyen tien" mà cột trước là tên công ty trung gian
  if v_raw is null or v_raw = '' then
    m := regexp_match(t, ',\s*([A-Za-zÀ-ỹ ]{2,50}?)\s+(?:chuyen\s+tien|chuyển\s+tiền)', 'i');
    if m is not null and m[1] !~* '(CONG TY|CTCP|DICH VU|TRUC TUYEN|NGAN HANG)' then
      v_raw := btrim(m[1]);
    end if;
  end if;

  -- Trường hợp chuẩn Techcombank: "FT...,<TÊN NGƯỜI CHUYỂN>,<NỘI DUNG>"
  if v_raw is null or v_raw = '' then
    m := regexp_match(t, 'FT[0-9A-Z]+\s*,\s*([^,|]{2,60}?)\s*,', 'i');
    if m is not null and m[1] !~* '(CONG TY|CTCP|DICH VU DI DONG|TRUC TUYEN|NAPAS|MOMO|ZALOPAY|VNPAY)' then
      v_raw := btrim(m[1]);
    end if;
  end if;

  if v_raw is null or v_raw = '' then
    return null;
  end if;
  return initcap(lower(regexp_replace(v_raw, '\s+', ' ', 'g')));
end $$;

-- 2. Khi đóng đơn sang bảng sales: ghi luôn bank_txn_id nếu đơn đã được khớp chuyển khoản tự động
create or replace function private.finalize_order(p_order uuid, p_method text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  v_txn bigint;
begin
  select * into o from orders where id = p_order for update;
  if not found then return; end if;
  select id into v_txn from bank_txns where order_id = o.id order by id desc limit 1;
  insert into sales (id, queue_number, dine_type, total, payment_method, items,
                     ordered_at, accepted_at, served_at, paid_at, cook_minutes, station_minutes, cashier_id,
                     customer_name, customer_phone, address, bank_txn_id)
  select o.id, o.queue_number, o.dine_type, o.total, coalesce(p_method, o.paid_method, 'tien_mat'),
         coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'menu_item_id', i.menu_item_id, 'name', i.item_name,
                     'price', i.unit_price, 'qty', i.qty, 'options', i.options, 'station', i.station,
                     'promo_id', i.promo_id, 'promo_name', i.promo_name, 'promo_kind', i.promo_kind,
                     'promo_group', i.promo_group, 'promo_part', i.promo_part, 'promo_units', i.promo_units)) order by i.id)
                   from order_items i where i.order_id = o.id), '[]'::jsonb),
         o.created_at, o.accepted_at, o.served_at, coalesce(o.paid_at, now()),
         case when o.accepted_at is not null and o.served_at is not null
              then round(extract(epoch from (o.served_at - o.accepted_at)) / 60)::int end,
         (select jsonb_object_agg(s.station, round(extract(epoch from (s.served_at - s.accepted_at)) / 60)::int)
            from order_stations s
           where s.order_id = o.id and s.accepted_at is not null and s.served_at is not null),
         coalesce(o.paid_by, my_employee_id()),
         o.customer_name, o.customer_phone, o.address, v_txn;
  delete from orders where id = o.id;
end $$;
revoke all on all functions in schema private from public;

-- 3. Khớp 1 giao dịch ngân hàng với đơn (dùng chung cho thông báo Android và SePay)
create or replace function private.bank_apply(p_txn bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t bank_txns;
  o orders;
  s sales;
  v_n int;
  v_due int;
  v_status text;
  v_note text;
  v_sale uuid;
  v_name text;
begin
  select * into t from bank_txns where id = p_txn for update;
  if not found then
    return jsonb_build_object('matched', false, 'reason', 'not_found');
  end if;
  if t.amount <= 0 then
    update bank_txns set note = coalesce(note, 'Không đọc được số tiền') where id = t.id;
    return jsonb_build_object('matched', false, 'reason', 'no_amount');
  end if;

  if t.pay_code is not null then
    select count(*) into v_n from orders where private.pay_code(id) = t.pay_code and created_at > now() - interval '3 days';
    if v_n = 1 then
      select * into o from orders where private.pay_code(id) = t.pay_code and created_at > now() - interval '3 days' for update;
    elsif v_n = 0 then
      -- Kiểm tra xem đơn này có vừa được nhân viên bấm thu tay xong (đã chuyển sang bảng sales) không
      select * into s from sales
       where source = 'pos' and private.pay_code(id) = t.pay_code and paid_at > now() - interval '3 days'
       order by paid_at desc limit 1;
      if found then
        update sales set bank_txn_id = coalesce(bank_txn_id, t.id) where id = s.id;
        update bank_txns
           set order_id = s.id,
               status = 'don_da_thu',
               note = 'Đơn ' || coalesce(case when s.queue_number is not null then 'Bàn ' || s.queue_number else s.customer_name end, t.pay_code) || ' đã được bấm thu trước đó'
         where id = t.id;
        return jsonb_build_object(
          'matched', true,
          'status', 'don_da_thu',
          'where', case when s.queue_number is not null then 'Bàn ' || s.queue_number else coalesce(s.customer_name, 'đơn') end
        );
      end if;
      update bank_txns set note = 'Không thấy đơn ' || t.pay_code where id = t.id;
      return jsonb_build_object('matched', false, 'reason', 'code');
    else
      update bank_txns set note = 'Nhiều đơn trùng mã ' || t.pay_code where id = t.id;
      return jsonb_build_object('matched', false, 'reason', 'code');
    end if;
  else
    -- Không có mã BN…: khách quét QR dán trên loa / chuyển tay (thường là khách gọi mồm, không có đơn).
    -- KHÔNG đoán theo số tiền (tránh gán nhầm sang đơn khác cùng giá).
    -- Tự tạo 1 hoá đơn "không gắn mã" để tính vào doanh thu (tab Đơn không gắn mã trong Hoá đơn).
    v_sale := gen_random_uuid();
    v_name := coalesce(private.sender_name(t.content), 'Khách quét QR');
    insert into sales (id, queue_number, dine_type, total, payment_method, items, ordered_at, paid_at, customer_name, source, bank_txn_id)
    values (v_sale, null, 'tai_quan', t.amount, 'chuyen_khoan', '[]'::jsonb, coalesce(t.txn_at, now()), coalesce(t.txn_at, now()),
            v_name, 'khong_ma', t.id);
    update bank_txns
       set status = 'khong_ma',
           sale_id = v_sale,
           note = 'Không có mã đơn (quét QR loa) → đã ghi Đơn không gắn mã'
     where id = t.id;
    return jsonb_build_object('matched', false, 'reason', 'no_code', 'sale', true, 'sender', v_name);
  end if;

  v_due := o.total - coalesce(o.paid_amount, 0);
  if v_due <= 0 then
    v_status := 'don_da_thu';
    v_note := 'Đơn đã thu đủ trước đó, kiểm tra trả lại khách';
  elsif t.amount >= v_due then
    update orders set paid_amount = total, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = null where id = o.id;
    -- Cập nhật bank_txns trước khi finalize_order để finalize_order lấy được bank_txn_id
    v_status := 'da_khop';
    v_note := case when t.amount > v_due then 'Khách chuyển dư ' || (t.amount - v_due) || 'đ' end;
    update bank_txns set order_id = o.id, status = v_status, note = v_note where id = t.id;
    if o.status = 'da_ra_mon' then
      perform private.finalize_order(o.id, 'chuyen_khoan');
    end if;
    return jsonb_build_object('matched', true, 'status', v_status,
      'where', case when o.queue_number is not null then 'Bàn ' || o.queue_number else coalesce(o.customer_name, 'đơn') end);
  else
    update orders set paid_amount = coalesce(paid_amount, 0) + t.amount, paid_method = 'chuyen_khoan', paid_at = now(), paid_by = null where id = o.id;
    v_status := 'thieu_tien';
    v_note := 'Còn thiếu ' || (v_due - t.amount) || 'đ';
  end if;

  update bank_txns set order_id = o.id, status = v_status, note = v_note where id = t.id;
  return jsonb_build_object('matched', true, 'status', v_status,
    'where', case when o.queue_number is not null then 'Bàn ' || o.queue_number else coalesce(o.customer_name, 'đơn') end);
end $$;

-- 4. Bổ sung cho bank_noti_ingest: đọc mã BN linh hoạt hơn (kể cả khi ngân hàng xoá khoảng trắng hoặc nối liền)
--    và chống trùng giao dịch theo mã tham chiếu FT... của Techcombank (tránh ghi 2 lần khi đọc lại activeNotifications)
create or replace function bank_noti_ingest(p_key text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  v_text text;
  v_up text;
  v_amount int;
  v_code text;
  v_ft text;
  v_hash text;
  v_txn bigint;
  v_at timestamptz;
  v_res jsonb;
  v_test boolean;
begin
  select api_key into v_key from private.sepay_config where id = 1;
  if p_key is null or v_key is null or p_key <> v_key then raise exception 'BAD_KEY'; end if;
  if coalesce((p ->> 'ping')::boolean, false) then return jsonb_build_object('ok', true, 'ping', true); end if;

  v_text := left(btrim(coalesce(p ->> 'title', '') || ' | ' || coalesce(p ->> 'text', ''), ' |'), 500);
  -- Phòng hờ: bỏ mọi đoạn số dư nếu còn sót
  v_text := regexp_replace(v_text, '(số dư|so du|sd)\s*[:：]?\s*[-+]?[0-9][0-9.,]*\s*(vnđ|vnd|đ|₫|d(?![a-z]))?', '[số dư]', 'gi');
  if v_text = '' then return jsonb_build_object('ok', true, 'skip', 'empty'); end if;
  v_up := upper(v_text);
  -- Tiền ra thì bỏ qua (chỉ bỏ qua khi đầu thông báo hoặc sau dấu | là dấu trừ số tiền, tránh nhầm dấu gạch ngang trong mã MoMo 157683-0399...)
  if v_up ~ '(^|\|\s*)-\s*[0-9]' and v_up !~ '\+\s*[0-9]' then
    return jsonb_build_object('ok', true, 'skip', 'out');
  end if;

  v_amount := coalesce(private.money_in(v_text), 0);
  v_code := (regexp_match(v_up, 'BN\s*([0-9A-F]{6})'))[1];
  if v_code is not null then v_code := 'BN' || v_code; end if;
  v_ft := (regexp_match(v_up, '\m(FT[0-9A-Z]{8,20})\M'))[1];
  v_test := coalesce((p ->> 'test')::boolean, false);
  begin v_at := to_timestamp((p ->> 'posted_at')::bigint / 1000.0); exception when others then v_at := now(); end;

  -- Nếu có mã giao dịch FT... và không phải ghi thử thì dùng FT... làm khoá chống trùng (an toàn khi quét lại thanh thông báo)
  v_hash := case
    when not v_test and v_ft is not null then md5('ft|' || v_ft || '|' || v_amount::text)
    else md5(coalesce(p ->> 'key', '') || '|' || coalesce(p ->> 'posted_at', '') || '|' || v_text)
  end;

  insert into bank_txns (src, src_hash, device, amount, content, ref, txn_at, pay_code, status, note)
  values ('noti', v_hash,
          left(p ->> 'device', 40), v_amount, v_text, v_ft, coalesce(v_at, now()), v_code,
          case when v_test then 'mau' else 'chua_khop' end,
          case when v_test then 'Ghi thử từ ' || coalesce(p ->> 'pkg', '?') end)
  on conflict (src_hash) do nothing
  returning id into v_txn;
  if v_txn is null then return jsonb_build_object('ok', true, 'skip', 'duplicate'); end if;
  if v_test then
    return jsonb_build_object('ok', true, 'test', true, 'amount', v_amount, 'code', v_code);
  end if;

  v_res := private.bank_apply(v_txn);
  return jsonb_build_object('ok', true, 'amount', v_amount, 'code', v_code) || v_res;
end $$;
revoke all on function bank_noti_ingest(text, jsonb) from public;
grant execute on function bank_noti_ingest(text, jsonb) to anon, authenticated;

-- 5. Sửa lại tên khách cho các hoá đơn 'khong_ma' đã lưu trước đây bị dính tên công ty MoMo
update sales s
   set customer_name = coalesce(private.sender_name(t.content), s.customer_name)
  from bank_txns t
 where s.source = 'khong_ma'
   and s.bank_txn_id = t.id
   and private.sender_name(t.content) is not null;

-- Gắn lại bank_txn_id cho các hoá đơn POS đã khớp trước đây
update sales s
   set bank_txn_id = t.id
  from bank_txns t
 where s.source = 'pos'
   and s.bank_txn_id is null
   and t.order_id = s.id;

select 'Đã cập nhật SQL 41: sửa khớp chuyển khoản, tên người chuyển MoMo, chống trùng FT và gắn mã giao dịch vào hoá đơn' as ket_qua;
