-- =====================================================================
-- CẬP NHẬT 47: THEO DÕI CHI PHÍ CLOUD + TOKEN AI (trang /dashboard → mục "Chi phí & hạn mức")
--
--   ai_usage           mỗi lần gọi AI (bot-don, chup-chat) 1 dòng: model, token vào/ra/suy nghĩ, thời gian.
--                      KHÔNG có nội dung tin nhắn / ảnh. Giữ 400 ngày.
--   ai_prices          bảng giá từng model (USD / 1 triệu token), có ngày hiệu lực để đổi giá không làm sai số cũ.
--   cost_settings      tỷ giá, gói miễn phí / trả tiền, ngân sách tháng, ngưỡng cảnh báo, chi phí cố định.
--   cloud_usage        số liệu hạn mức Cloudflare / Supabase do bot benoc-health-bot thu mỗi giờ.
--   cloud_usage_put(p) bot ghi số liệu (upsert theo ngày).
--   monitor_cost(days) số liệu cho trang biểu đồ + cảnh báo.
--
-- Chỉ service_role (bot, Edge Function) đọc / ghi được. Chạy lại vẫn an toàn.
-- Giá model kiểm ngày 27/11/2026 trên trang giá của Google / Anthropic. Hãng đổi giá thì thêm dòng mới vào
-- ai_prices với valid_from = ngày đổi (xem HUONG-DAN-CHI-PHI.md), không sửa dòng cũ.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nhật ký gọi AI
-- ---------------------------------------------------------------------
create table if not exists public.ai_usage (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  source        text not null,                 -- bot-don | chup-chat | health-bot ...
  provider      text not null,                 -- gemini | claude
  model         text not null,
  ok            boolean not null default true,
  http_status   int,                           -- 0 = quá thời gian / mất mạng
  in_tokens     int not null default 0,        -- token đầu vào (gồm ảnh, gồm phần đọc từ cache)
  cached_tokens int not null default 0,        -- phần đầu vào đọc từ cache (giá rẻ hơn)
  out_tokens    int not null default 0,        -- token trả lời
  think_tokens  int not null default 0,        -- token "suy nghĩ" (Gemini tính giá như token ra)
  images        int not null default 0,
  ms            int
);
create index if not exists ai_usage_at_idx on public.ai_usage (at);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from public, anon, authenticated;
revoke all on sequence public.ai_usage_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Bảng giá (USD / 1 triệu token). cached_usd trống = tính như giá vào thường (an toàn, không báo thiếu).
-- ---------------------------------------------------------------------
create table if not exists public.ai_prices (
  model      text not null,
  valid_from date not null,
  in_usd     numeric not null,
  out_usd    numeric not null,                 -- gồm cả token suy nghĩ
  cached_usd numeric,
  note       text,
  primary key (model, valid_from)
);
alter table public.ai_prices enable row level security;
revoke all on public.ai_prices from public, anon, authenticated;

insert into public.ai_prices (model, valid_from, in_usd, out_usd, cached_usd, note) values
  ('gemini-3.5-flash',      '2026-05-01', 1.50, 9.00, 0.15,  'ai.google.dev/gemini-api/docs/pricing, gói trả tiền'),
  ('gemini-3.5-flash-lite', '2026-07-01', 0.30, 2.50, null,  'giá công bố khi ra mắt; giá cache chưa kiểm'),
  ('gemini-2.5-flash',      '2025-06-01', 0.30, 2.50, 0.03,  'ai.google.dev/gemini-api/docs/pricing'),
  ('gemini-3.8-flash',      '2026-09-01', 0.75, 3.75, 0.075, 'giá giới thiệu tới 31/12/2026'),
  ('gemini-3.8-flash',      '2027-01-01', 1.50, 7.50, 0.15,  'giá chuẩn từ 1/1/2027 theo Google'),
  ('claude-haiku-5-5',      '2026-10-01', 0.10, 0.50, 0.01,  'prompt ≤ 100K token; trên 100K giá ×5')
on conflict (model, valid_from) do nothing;

-- Chi phí 1 lần gọi (USD) theo giá hiệu lực tại thời điểm gọi. Model chưa có giá → null.
create or replace function public.ai_call_usd(p_model text, p_at timestamptz, p_in int, p_cached int, p_out int, p_think int)
returns numeric
language sql
stable
set search_path = pg_catalog, public
as $$
  select (greatest(coalesce(p_in, 0) - coalesce(p_cached, 0), 0) * pr.in_usd
          + coalesce(p_cached, 0) * coalesce(pr.cached_usd, pr.in_usd)
          + (coalesce(p_out, 0) + coalesce(p_think, 0)) * pr.out_usd) / 1000000.0
    from public.ai_prices pr
   where pr.model = p_model and pr.valid_from <= (p_at at time zone 'UTC')::date
   order by pr.valid_from desc
   limit 1
$$;

-- ---------------------------------------------------------------------
-- 3. Cài đặt chi phí (1 dòng). Sửa bằng SQL Editor, ví dụ:
--    update cost_settings set gemini_paid = true, budget_vnd_month = 200000 where id = 1;
-- ---------------------------------------------------------------------
create table if not exists public.cost_settings (
  id               int primary key default 1 check (id = 1),
  usd_vnd          numeric not null default 26100,   -- tỷ giá quy đổi (Vietcombank bán ra ~ 26 090 ngày 15/10/2026)
  gemini_paid      boolean not null default false,   -- false = khoá Gemini đang ở gói miễn phí: chi phí thật = 0
  claude_paid      boolean not null default true,    -- Claude API luôn tính tiền theo lượng dùng
  budget_vnd_month numeric not null default 100000,  -- ngân sách AI mỗi tháng (đồng)
  alert_ai_day_vnd numeric not null default 10000,   -- 1 ngày tốn quá số này thì báo Telegram
  alert_quota_pct  numeric not null default 80,      -- hạn mức gói miễn phí dùng quá % này thì báo
  gemini_rpd       jsonb not null default '{}',      -- hạn mức lượt/ngày gói miễn phí: {"gemini-3.5-flash-lite": 1000}
  fixed_costs      jsonb not null default '[]',      -- chi phí cố định: [{"ten":"Tên miền","vnd_thang":25000}]
  updated_at       timestamptz not null default now()
);
insert into public.cost_settings (id) values (1) on conflict (id) do nothing;
alter table public.cost_settings enable row level security;
revoke all on public.cost_settings from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Hạn mức cloud: 1 dòng / ngày / chỉ số. Ngày của Cloudflare là ngày UTC (hạn mức reset 00:00 UTC = 7h sáng VN).
-- ---------------------------------------------------------------------
create table if not exists public.cloud_usage (
  d           date not null,
  service     text not null,          -- cloudflare | supabase
  metric      text not null,          -- workers_requests | kv_read | egress_uncached_bytes | ...
  value       numeric not null,
  limit_value numeric,                -- hạn mức gói miễn phí cho cùng kỳ (period)
  period      text not null default 'day' check (period in ('day', 'month')),
  updated_at  timestamptz not null default now(),
  primary key (d, service, metric)
);
alter table public.cloud_usage enable row level security;
revoke all on public.cloud_usage from public, anon, authenticated;

create or replace function public.cloud_usage_put(p jsonb)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare n int;
begin
  insert into public.cloud_usage (d, service, metric, value, limit_value, period, updated_at)
  select (x->>'d')::date, x->>'service', x->>'metric', (x->>'value')::numeric,
         nullif(x->>'limit', '')::numeric, coalesce(x->>'period', 'day'), now()
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x
   where x->>'d' is not null and x->>'metric' is not null and x->>'value' is not null
  on conflict (d, service, metric) do update
    set value = excluded.value, limit_value = excluded.limit_value, period = excluded.period, updated_at = now();
  get diagnostics n = row_count;
  delete from public.cloud_usage where d < current_date - 400;
  delete from public.ai_usage where at < now() - interval '400 days';
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Số liệu cho trang biểu đồ
-- ---------------------------------------------------------------------
create or replace function public.monitor_cost(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  tz      text := 'Asia/Ho_Chi_Minh';
  n       int := least(greatest(coalesce(p_days, 30), 7), 90);
  today   date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  m0      date := date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))::date;   -- đầu tháng (giờ VN)
  pm0     date := (date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh')) - interval '1 month')::date;
  dim     int := extract(day from (date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh')) + interval '1 month - 1 day'))::int;
  since   timestamptz;
  s       public.cost_settings;
  out     jsonb;
begin
  select * into s from public.cost_settings where id = 1;
  if s.id is null then s := row(1, 26100, false, true, 100000, 10000, 80, '{}'::jsonb, '[]'::jsonb, now())::public.cost_settings; end if;
  since := (least(today - n + 1, pm0)::timestamp) at time zone tz;

  with u as (
    select a.*, (a.at at time zone tz)::date d,
           public.ai_call_usd(a.model, a.at, a.in_tokens, a.cached_tokens, a.out_tokens, a.think_tokens) list_usd,
           case when (a.provider = 'gemini' and not s.gemini_paid) or (a.provider = 'claude' and not s.claude_paid) then false else true end paid
      from public.ai_usage a
     where a.at >= since
  ), uc as (
    select *, case when paid then list_usd else 0 end real_usd from u
  ), agg as (   -- tổng theo khoảng
    select k, jsonb_build_object(
             'calls', count(*), 'errors', count(*) filter (where not ok),
             'in', coalesce(sum(in_tokens), 0), 'cached', coalesce(sum(cached_tokens), 0),
             'out', coalesce(sum(out_tokens), 0), 'think', coalesce(sum(think_tokens), 0),
             'images', coalesce(sum(images), 0),
             'list_usd', round(coalesce(sum(list_usd), 0), 6), 'real_usd', round(coalesce(sum(real_usd), 0), 6),
             'unpriced_calls', count(*) filter (where ok and list_usd is null)) v
      from (select 'today' k, * from uc where d = today
            union all select 'yesterday', * from uc where d = today - 1
            union all select 'mtd', * from uc where d >= m0
            union all select 'last_month', * from uc where d >= pm0 and d < m0
            union all select 'range', * from uc where d > today - n) x
     group by k
  )
  select jsonb_build_object(
    'generated_at', now(), 'days', n, 'today', today, 'month_start', m0, 'days_in_month', dim,
    'day_of_month', extract(day from today)::int,
    'settings', to_jsonb(s) - 'id',
    'prices', (select coalesce(jsonb_agg(to_jsonb(p) order by p.model, p.valid_from), '[]'::jsonb) from public.ai_prices p),
    'ai', jsonb_build_object(
      'today',      coalesce((select v from agg where k = 'today'), '{}'::jsonb),
      'yesterday',  coalesce((select v from agg where k = 'yesterday'), '{}'::jsonb),
      'mtd',        coalesce((select v from agg where k = 'mtd'), '{}'::jsonb),
      'last_month', coalesce((select v from agg where k = 'last_month'), '{}'::jsonb),
      'range',      coalesce((select v from agg where k = 'range'), '{}'::jsonb),
      'daily', (select coalesce(jsonb_agg(x order by x.d, x.provider), '[]'::jsonb) from (
          select d, provider, count(*) calls, count(*) filter (where not ok) errors,
                 sum(in_tokens) in_tok, sum(out_tokens + think_tokens) out_tok,
                 round(coalesce(sum(list_usd), 0), 6) list_usd, round(coalesce(sum(real_usd), 0), 6) real_usd
            from uc where d > today - n group by d, provider) x),
      'by_model', (select coalesce(jsonb_agg(x order by x.list_usd desc nulls last), '[]'::jsonb) from (
          select model, provider, count(*) calls, count(*) filter (where not ok) errors,
                 sum(in_tokens) in_tok, sum(cached_tokens) cached, sum(out_tokens) out_tok, sum(think_tokens) think,
                 round(avg(ms) filter (where ok)) avg_ms,
                 round(sum(list_usd), 6) list_usd, round(sum(real_usd), 6) real_usd,
                 bool_or(ok and list_usd is null) unpriced,
                 round(sum(list_usd) / nullif(count(*) filter (where ok), 0), 7) usd_per_call
            from uc where d > today - n group by model, provider) x),
      'by_source', (select coalesce(jsonb_agg(x order by x.calls desc), '[]'::jsonb) from (
          select source, count(*) calls, sum(images) images,
                 round(coalesce(sum(list_usd), 0), 6) list_usd, round(coalesce(sum(real_usd), 0), 6) real_usd
            from uc where d > today - n group by source) x),
      'today_by_model', (select coalesce(jsonb_agg(x order by x.calls desc), '[]'::jsonb) from (
          select model, provider, count(*) calls, count(*) filter (where not ok) errors,
                 count(*) filter (where http_status = 429) rate_limited,
                 nullif(s.gemini_rpd->>model, '')::int rpd_limit
            from uc where d = today group by model, provider) x),
      'errors_today', (select coalesce(jsonb_object_agg(coalesce(http_status, 0)::text, c), '{}'::jsonb) from (
          select http_status, count(*) c from uc where d = today and not ok group by 1) x),
      'online_orders_mtd', (select count(*) from public.fb_drafts where created_at >= (m0::timestamp at time zone tz) and status <> 'huy'),
      'captures_mtd', (select count(*) from public.chat_captures where created_at >= (m0::timestamp at time zone tz))
    ),
    'cloud', jsonb_build_object(
      'latest', (select coalesce(jsonb_agg(to_jsonb(x) order by x.service, x.metric), '[]'::jsonb) from (
          select distinct on (service, metric) d, service, metric, value, limit_value lim, period, updated_at
            from public.cloud_usage where d >= current_date - 3 order by service, metric, d desc) x),
      'daily', (select coalesce(jsonb_agg(to_jsonb(x) order by x.d), '[]'::jsonb) from (
          select d, service, metric, value, limit_value lim from public.cloud_usage
           where d > current_date - n and period = 'day') x),
      'month', (select coalesce(jsonb_object_agg(service || ':' || metric, v), '{}'::jsonb) from (
          select service, metric, sum(value) v from public.cloud_usage
           where d >= date_trunc('month', current_date)::date and period = 'day' group by 1, 2) x)
    ),
    'supabase_now', jsonb_build_object(
      'db_bytes', pg_database_size(current_database()),
      'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
      'mau', (select count(*) from auth.users where last_sign_in_at >= (m0::timestamp at time zone tz)))
  ) into out;

  return out;
end;
$$;

revoke all on function public.ai_call_usd(text, timestamptz, int, int, int, int) from public, anon, authenticated;
revoke all on function public.cloud_usage_put(jsonb) from public, anon, authenticated;
revoke all on function public.monitor_cost(int) from public, anon, authenticated;
grant execute on function public.ai_call_usd(text, timestamptz, int, int, int, int) to service_role;
grant execute on function public.cloud_usage_put(jsonb) to service_role;
grant execute on function public.monitor_cost(int) to service_role;
grant select, insert on public.ai_usage to service_role;
grant usage on sequence public.ai_usage_id_seq to service_role;
grant select on public.ai_prices, public.cost_settings, public.cloud_usage to service_role;
