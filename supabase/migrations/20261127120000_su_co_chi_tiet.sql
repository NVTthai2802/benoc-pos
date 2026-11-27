-- Cập nhật 49: chi tiết sự cố trên trang monitoring
--  * Mỗi lần đo 5 phút ghi thêm kết nối DB chia theo dịch vụ (API, Realtime, Storage...) và trạng thái.
--  * Bảng monitor_incidents: mỗi sự cố một dòng — bắt đầu / kết thúc, mức nặng nhất, diễn biến từng lần đo,
--    bot đã làm gì, tự hồi phục hay bot can thiệp, sự kiện liên quan (migration chạy quanh lúc đó).
--  * monitor_autofix(): bot chỉ ngắt truy vấn treo > 5 phút và giao dịch bỏ dở > 5 phút của app (không đụng dịch vụ hệ thống).
-- Chỉ service_role gọi được (bot benoc-health-bot).

alter table public.monitor_samples add column if not exists conn_by jsonb;

-- Kết nối hiện tại chia nhóm
create or replace function private.monitor_conn_breakdown()
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  with a as (
    select case
             when backend_type <> 'client backend' then 'Hệ thống Postgres'
             when usename = 'authenticator' or usename in ('anon', 'authenticated', 'service_role') then 'API (PostgREST)'
             when usename = 'supabase_realtime_admin' or application_name ilike 'realtime%' then 'Realtime'
             when usename = 'supabase_storage_admin' then 'Storage'
             when usename = 'supabase_auth_admin' then 'Auth'
             when usename in ('pgbouncer', 'supavisor') or application_name ilike '%supavisor%' then 'Pooler'
             when application_name = 'mgmt-api' then 'Dashboard/MCP'
             when usename = 'supabase_admin' then 'Supabase nội bộ'
             else coalesce(nullif(application_name, ''), usename, 'khác')
           end g,
           coalesce(state, 'none') st
      from pg_stat_activity where pid <> pg_backend_pid()
  )
  select jsonb_build_object(
    'groups', (select coalesce(jsonb_object_agg(g, n), '{}'::jsonb) from (select g, count(*) n from a group by g) x),
    'states', (select coalesce(jsonb_object_agg(st, n), '{}'::jsonb) from (select st, count(*) n from a group by st) x));
$$;

create or replace function public.monitor_collect(p jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  r public.monitor_samples;
  vn_today timestamptz := date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
begin
  insert into public.monitor_samples (
    at, rest_ms, auth_ms, storage_ms, site_ms, rpc_ms,
    rest_ok, auth_ok, storage_ok, site_ok,
    conns, conns_max, db_bytes, cache_hit, locks, long_q,
    active_orders, stale_orders, xact_commit, deadlocks, colo, conn_by)
  values (
    now(),
    (p->>'rest_ms')::int, (p->>'auth_ms')::int, (p->>'storage_ms')::int, (p->>'site_ms')::int, (p->>'rpc_ms')::int,
    (p->>'rest_ok')::boolean, (p->>'auth_ok')::boolean, (p->>'storage_ok')::boolean, (p->>'site_ok')::boolean,
    (select count(*) from pg_stat_activity),
    current_setting('max_connections')::int,
    pg_database_size(current_database()),
    (select round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2)
       from pg_statio_user_tables),
    (select count(*) from pg_locks where not granted),
    (select count(*) from pg_stat_activity
      where state = 'active' and backend_type = 'client backend' and pid <> pg_backend_pid() and now() - query_start > interval '5 minutes'),
    (select count(*) from public.orders),
    (select count(*) from public.orders where created_at < vn_today),
    (select xact_commit from pg_stat_database where datname = current_database()),
    (select deadlocks from pg_stat_database where datname = current_database()),
    p->>'colo',
    private.monitor_conn_breakdown())
  on conflict (at) do nothing
  returning * into r;

  delete from public.monitor_samples where at < now() - interval '35 days';
  return to_jsonb(r);
end;
$$;

create table if not exists public.monitor_incidents (
  id          bigserial primary key,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  level       text not null default 'warn',      -- mức nặng nhất: warn | bad
  first_detail text,
  last_detail text,
  alerted     boolean not null default false,    -- đã báo Telegram chưa
  alerted_at  timestamptz,
  peak_conns  int,
  conns_max   int,
  peak_conn_by jsonb,                            -- kết nối chia nhóm lúc đông nhất
  recovery    text,                              -- tu_hoi_phuc | bot_can_thiep | null (đang diễn ra)
  actions     jsonb not null default '[]'::jsonb, -- bot đã làm gì
  timeline    jsonb not null default '[]'::jsonb, -- từng lần đo trong sự cố
  context     jsonb not null default '{}'::jsonb, -- sự kiện liên quan, log
  note        text                               -- phân tích nguyên nhân (ghi tay)
);
create index if not exists monitor_incidents_started on public.monitor_incidents (started_at desc);
alter table public.monitor_incidents enable row level security;
revoke all on public.monitor_incidents from anon, authenticated;

-- Bot ghi sự cố: p = {op: open|update|close|action|context, id, level, detail, alerted, action, context, recovery}
create or replace function public.monitor_incident(p jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  op  text := p->>'op';
  iid bigint := nullif(p->>'id', '')::bigint;
  s   public.monitor_samples;
  r   public.monitor_incidents;
  lv  text := coalesce(p->>'level', 'warn');
begin
  select * into s from public.monitor_samples order by at desc limit 1;

  if op = 'open' then
    insert into public.monitor_incidents (level, first_detail, last_detail, peak_conns, conns_max, peak_conn_by, timeline)
    values (lv, p->>'detail', p->>'detail', s.conns, s.conns_max, s.conn_by,
            jsonb_build_array(jsonb_build_object('at', now(), 'level', lv, 'detail', p->>'detail',
              'conns', s.conns, 'rest_ms', s.rest_ms, 'storage_ms', s.storage_ms, 'conn_by', s.conn_by)))
    returning * into r;
    delete from public.monitor_incidents where started_at < now() - interval '120 days';
    return to_jsonb(r);
  end if;

  if iid is null then return null; end if;

  if op = 'update' then
    update public.monitor_incidents i set
      level = case when lv = 'bad' then 'bad' else i.level end,
      last_detail = p->>'detail',
      peak_conn_by = case when coalesce(s.conns, 0) > coalesce(i.peak_conns, 0) then s.conn_by else i.peak_conn_by end,
      peak_conns = greatest(coalesce(i.peak_conns, 0), coalesce(s.conns, 0)),
      alerted = i.alerted or coalesce((p->>'alerted')::boolean, false),
      alerted_at = case when not i.alerted and coalesce((p->>'alerted')::boolean, false) then now() else i.alerted_at end,
      timeline = case when jsonb_array_length(i.timeline) >= 300 then i.timeline else
        i.timeline || jsonb_build_array(jsonb_build_object('at', now(), 'level', lv, 'detail', p->>'detail',
          'conns', s.conns, 'rest_ms', s.rest_ms, 'storage_ms', s.storage_ms, 'conn_by', s.conn_by)) end
    where id = iid returning * into r;
  elsif op = 'action' then
    update public.monitor_incidents set actions = actions || jsonb_build_array(p->'action' || jsonb_build_object('at', now()))
     where id = iid returning * into r;
  elsif op = 'context' then
    update public.monitor_incidents set context = context || coalesce(p->'context', '{}'::jsonb)
     where id = iid returning * into r;
  elsif op = 'close' then
    update public.monitor_incidents i set
      ended_at = now(),
      alerted = i.alerted or coalesce((p->>'alerted')::boolean, false),
      recovery = coalesce(p->>'recovery', case when jsonb_array_length(i.actions) > 0 then 'bot_can_thiep' else 'tu_hoi_phuc' end),
      timeline = i.timeline || jsonb_build_array(jsonb_build_object('at', now(), 'level', 'ok', 'detail', 'Bình thường lại',
          'conns', s.conns, 'rest_ms', s.rest_ms, 'storage_ms', s.storage_ms, 'conn_by', s.conn_by)),
      context = i.context || jsonb_build_object('migrations', (
        select coalesce(jsonb_agg(jsonb_build_object('version', m.version, 'name', m.name,
                 'at', to_timestamp(m.version, 'YYYYMMDDHH24MISS')::timestamp at time zone 'UTC') order by m.version), '[]'::jsonb)
          from supabase_migrations.schema_migrations m
         where m.version ~ '^\d{14}$'
           and to_timestamp(m.version, 'YYYYMMDDHH24MISS')::timestamp at time zone 'UTC'
               between i.started_at - interval '30 minutes' and now()))
    where id = iid and ended_at is null returning * into r;
  end if;
  return to_jsonb(r);
end;
$$;

-- Bot tự xử lý an toàn: chỉ ngắt kết nối của app (anon/authenticated/authenticator/service_role)
-- đang chạy 1 truy vấn > 5 phút, hoặc mở giao dịch rồi bỏ dở > 5 phút (giữ khoá làm nghẽn người khác).
create or replace function public.monitor_autofix()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare out jsonb := '[]'::jsonb; x record;
begin
  for x in
    select pid, usename, state, application_name, round(extract(epoch from now() - coalesce(query_start, xact_start)))::int secs,
           left(regexp_replace(query, '\s+', ' ', 'g'), 160) q
      from pg_stat_activity
     where backend_type = 'client backend' and pid <> pg_backend_pid()
       and usename in ('anon', 'authenticated', 'authenticator', 'service_role')
       and ((state = 'active' and now() - query_start > interval '5 minutes')
         or (state like 'idle in transaction%' and now() - state_change > interval '5 minutes'))
     limit 20
  loop
    if pg_terminate_backend(x.pid) then
      out := out || jsonb_build_array(jsonb_build_object('pid', x.pid, 'user', x.usename, 'state', x.state,
               'app', x.application_name, 'secs', x.secs, 'query', x.q));
    end if;
  end loop;
  return out;
end;
$$;

-- Danh sách sự cố cho trang dashboard (kèm diễn biến kết nối quanh sự cố)
create or replace function public.monitor_incidents_list(p_days int default 30)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(x order by x.started_at desc), '[]'::jsonb) from (
    select i.*,
      round(extract(epoch from coalesce(i.ended_at, now()) - i.started_at) / 60)::int minutes,
      (select coalesce(jsonb_agg(jsonb_build_object('at', s.at, 'conns', s.conns, 'conns_max', s.conns_max,
                'rest_ms', s.rest_ms, 'storage_ms', s.storage_ms, 'conn_by', s.conn_by) order by s.at), '[]'::jsonb)
         from public.monitor_samples s
        where s.at between i.started_at - interval '20 minutes' and coalesce(i.ended_at, now()) + interval '10 minutes') around
      from public.monitor_incidents i
     where i.started_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 120))
     order by i.started_at desc limit 50) x;
$$;

revoke all on function private.monitor_conn_breakdown() from public, anon, authenticated;
revoke all on function public.monitor_incident(jsonb) from public, anon, authenticated;
revoke all on function public.monitor_autofix() from public, anon, authenticated;
revoke all on function public.monitor_incidents_list(int) from public, anon, authenticated;
grant execute on function public.monitor_incident(jsonb), public.monitor_autofix(), public.monitor_incidents_list(int) to service_role;
