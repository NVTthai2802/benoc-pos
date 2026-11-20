-- =====================================================================
-- CẬP NHẬT 42 — Sửa chặn trùng giao dịch theo mã FT… (lỗi của cập nhật 41)
-- ---------------------------------------------------------------------
-- Cập nhật 41 dùng '\b' để tìm mã FT…, nhưng trong PostgreSQL '\b' KHÔNG phải ranh giới từ
-- nên mã FT không bao giờ đọc được → cùng 1 giao dịch gửi 2 lần (app quét lại thông báo,
-- hoặc 2 máy cùng đọc) vẫn tạo 2 dòng / 2 hoá đơn không gắn mã. Bản này dùng '\m…\M'.
-- Chỉ thay hàm bank_noti_ingest. Chạy lại nhiều lần vẫn an toàn. Cần đã chạy 41.
-- =====================================================================

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

-- Kiểm tra: giao dịch bị ghi trùng (cùng mã FT) trong 3 ngày gần đây — nếu có, xoá tay hoá đơn thừa ở tab Đơn không gắn mã (nút Bỏ)
select (regexp_match(upper(content), '\m(FT[0-9A-Z]{8,20})\M'))[1] as ma_ft, amount, count(*) as so_lan
  from bank_txns where created_at > now() - interval '3 days'
 group by 1, 2 having count(*) > 1 and (regexp_match(upper(content), '\m(FT[0-9A-Z]{8,20})\M'))[1] is not null;
