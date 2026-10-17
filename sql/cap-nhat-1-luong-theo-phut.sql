-- =====================================================================
-- CẬP NHẬT 1 (17/10/2026): tính lương đúng từng phút, làm tròn tiền lương.
-- Chạy MỘT LẦN trên cơ sở dữ liệu đã cài trước ngày này (Supabase > SQL Editor).
-- Cài mới từ đầu thì không cần: schema.sql đã có sẵn thay đổi này.
-- =====================================================================
alter table shop_settings alter column round_minutes set default 1;
alter table shop_settings add column if not exists pay_round int not null default 1000
  check (pay_round in (1, 100, 500, 1000));
-- Bỏ làm tròn giờ đang bật sẵn: từ nay tính đúng từng phút, chủ quán tự bật lại nếu muốn
update shop_settings set round_minutes = 1, round_mode = 'nearest' where id = 1;
alter table shifts add column if not exists pay_round int;

create or replace function round_money(p_amount numeric, p_step int) returns int
language sql immutable as $$
  select (round(p_amount / greatest(coalesce(p_step, 1), 1)) * greatest(coalesce(p_step, 1), 1))::int
$$;

create or replace function check_out(p_photo text) returns shifts
language plpgsql security definer set search_path = public as $$
declare
  s   shifts;
  cfg shop_settings;
  m   int;
  pm  int;
begin
  select * into cfg from shop_settings where id = 1;
  select sh.* into s
    from shifts sh join employees e on e.id = sh.employee_id
   where e.auth_user_id = auth.uid() and sh.check_out_at is null
   for update of sh;
  if not found then raise exception 'NOT_CHECKED_IN'; end if;

  m  := floor(extract(epoch from (now() - s.check_in_at)) / 60);
  pm := apply_rounding(m, cfg.round_minutes, cfg.round_mode);

  update shifts
     set check_out_at    = now(),
         check_out_photo = p_photo,
         round_minutes   = cfg.round_minutes,
         round_mode      = cfg.round_mode,
         pay_round       = cfg.pay_round,
         paid_minutes    = pm,
         pay_amount      = round_money(pm * s.hourly_rate / 60.0, cfg.pay_round)
   where id = s.id
  returning * into s;
  return s;
end $$;

create or replace function owner_update_shift(p_id uuid, p_in timestamptz, p_out timestamptz, p_note text)
returns shifts
language plpgsql security definer set search_path = public as $$
declare
  s   shifts;
  cfg shop_settings;
  m   int;
  pm  int;
begin
  if my_role() is distinct from 'owner' then raise exception 'FORBIDDEN'; end if;
  if p_out is not null and p_out <= p_in then raise exception 'BAD_TIME'; end if;
  select * into cfg from shop_settings where id = 1;
  select * into s from shifts where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_out is null then
    update shifts set check_in_at = p_in, check_out_at = null, paid_minutes = null, pay_amount = null,
                      note = nullif(trim(p_note), '')
     where id = p_id returning * into s;
    return s;
  end if;
  m  := floor(extract(epoch from (p_out - p_in)) / 60);
  pm := apply_rounding(m, coalesce(s.round_minutes, cfg.round_minutes), coalesce(s.round_mode, cfg.round_mode));
  update shifts
     set check_in_at   = p_in,
         check_out_at  = p_out,
         round_minutes = coalesce(s.round_minutes, cfg.round_minutes),
         round_mode    = coalesce(s.round_mode, cfg.round_mode),
         pay_round     = coalesce(s.pay_round, cfg.pay_round),
         paid_minutes  = pm,
         pay_amount    = round_money(pm * s.hourly_rate / 60.0, coalesce(s.pay_round, cfg.pay_round)),
         note          = nullif(trim(p_note), '')
   where id = p_id
  returning * into s;
  return s;
end $$;

grant execute on function round_money(numeric, int) to authenticated;
