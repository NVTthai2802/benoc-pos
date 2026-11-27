// =====================================================================
// Bé Nốc POS — Bot sức khỏe + Monitoring + Chi phí (Cloudflare Worker)
//
// Cron "0 0 * * *"    (UTC) = 7:00 sáng VN: báo cáo sức khỏe qua Telegram (+ 1 lần đo)
// Cron mỗi 5 phút: đo REST/Auth/Storage/trang order, ghi vào monitor_samples,
//                     cảnh báo Telegram khi lỗi kéo dài ≥ 10 phút hoặc chậm ≥ 15 phút, báo khi hồi phục
//                  lượt đầu mỗi giờ: thu hạn mức Cloudflare / Supabase vào cloud_usage, cảnh báo chi phí AI / hạn mức
//
// Trang web:
//   /dashboard                       trang biểu đồ (nhập DASH_KEY)
//   /api/data?hours=24               số liệu cho trang (header x-key: DASH_KEY)
//   POST /api/probe                  đo ngay 1 lần (header x-key: DASH_KEY)
//   POST /api/cost                   thu số liệu chi phí / hạn mức ngay (header x-key: DASH_KEY)
//   /preview?key=RUN_KEY             xem báo cáo 7h (chỉ xem, không gửi)
//   /run?key=RUN_KEY                 gửi báo cáo 7h thật
//
// Biến: SUPABASE_URL, SITE_URL, SLOW_MS, DB_LIMIT_MB, STORAGE_LIMIT_MB, DASH_URL, CF_ACCOUNT_ID
// Secret: SUPABASE_SERVICE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, RUN_KEY, DASH_KEY,
//         CF_API_TOKEN (quyền Account Analytics: Read), SUPABASE_PAT (tuỳ chọn, để đo egress / lượt gọi function)
// KV: ALERT_KV (trạng thái cảnh báo, để không báo trùng khi Supabase sập)
//
// Mã nguồn: cloudflare/benoc-health-bot/src (worker.js + dashboard.html). Chạy `node build.mjs` để ra worker.js dán lên Cloudflare.
// =====================================================================

const TIMEOUT_MS = 10000;
const MB = 1024 * 1024;
const GB = 1024 * MB;
const ICON = { ok: "✅", warn: "⚠️", bad: "❌", info: "ℹ️" };
const DAILY_CRON = "0 0 * * *";
const BAD_STREAK = 2;    // 2 lần × 5 phút = lỗi kéo dài 10 phút mới báo
const WARN_STREAK = 3;   // chậm 15 phút mới báo
const REMIND_MS = 60 * 60 * 1000; // sự cố chưa hết: nhắc lại mỗi giờ

// Hạn mức gói miễn phí (kiểm 27/11/2026 trên trang giá Cloudflare / Supabase).
// Cloudflare tính theo ngày UTC (reset 7h sáng VN); Supabase tính theo tháng.
export const FREE = {
  "cloudflare:workers_requests": { limit: 100000, period: "day", name: "Workers: lượt gọi" },
  "cloudflare:kv_read":          { limit: 100000, period: "day", name: "KV: lượt đọc" },
  "cloudflare:kv_write":         { limit: 1000,   period: "day", name: "KV: lượt ghi" },
  "cloudflare:kv_delete":        { limit: 1000,   period: "day", name: "KV: lượt xoá" },
  "cloudflare:kv_list":          { limit: 1000,   period: "day", name: "KV: lượt liệt kê" },
  "supabase:egress_uncached_bytes": { limit: 5 * GB, period: "month", name: "Supabase: egress (không cache)", bytes: true },
  "supabase:egress_cached_bytes":   { limit: 5 * GB, period: "month", name: "Supabase: egress (qua cache)", bytes: true },
  "supabase:function_invocations":  { limit: 500000, period: "month", name: "Supabase: lượt gọi Edge Function" },
};

const DASHBOARD_HTML = __DASHBOARD_HTML__;

export default {
  async scheduled(event, env, ctx) {
    const hourly = new Date(event.scheduledTime || Date.now()).getUTCMinutes() < 5;
    if (event.cron === DAILY_CRON) ctx.waitUntil(Promise.all([runAndSend(env), probeAndAlert(env)]));
    else ctx.waitUntil(Promise.all([probeAndAlert(env), hourly ? collectCosts(env, true) : null]));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const keyOk = env.RUN_KEY && url.searchParams.get("key") === env.RUN_KEY;
    const dashOk = env.DASH_KEY && request.headers.get("x-key") === env.DASH_KEY;

    if (url.pathname === "/dashboard" || url.pathname === "/dashboard/") {
      return new Response(DASHBOARD_HTML, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache",
          "x-robots-tag": "noindex",
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
          "x-frame-options": "DENY",
          "content-security-policy":
            "default-src 'none'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
        },
      });
    }
    if (url.pathname === "/api/data") {
      if (!dashOk) return json({ error: "unauthorized" }, 401);
      return json(await dashboardData(env, Number(url.searchParams.get("hours") || 24)));
    }
    if (url.pathname === "/api/probe" && request.method === "POST") {
      if (!dashOk) return json({ error: "unauthorized" }, 401);
      return json(await probeAndAlert(env));
    }
    if (url.pathname === "/api/cost" && request.method === "POST") {
      if (!dashOk) return json({ error: "unauthorized" }, 401);
      return json(await collectCosts(env, true));
    }
    if (keyOk && url.pathname === "/preview") {
      return textResponse((await buildReport(env)).text);
    }
    if (keyOk && url.pathname === "/run") {
      return textResponse(await runAndSend(env));
    }
    return new Response("Bé Nốc health bot đang chạy.", { status: 200 });
  },
};

// =====================================================================
// Đo mỗi 5 phút + cảnh báo
// =====================================================================

async function probeAndAlert(env) {
  const sb = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const headers = authHeaders(env.SUPABASE_SERVICE_KEY || "");
  const slowMs = Number(env.SLOW_MS || 1500);

  const [rest, auth, storage, site] = await Promise.all([
    timedStable(`${sb}/rest/v1/shop_settings?select=id&limit=1`, { headers }, 2),
    timedStable(`${sb}/auth/v1/health`, { headers }, 2),
    timedStable(`${sb}/storage/v1/bucket`, { headers }, 2),
    env.SITE_URL ? timedStable(env.SITE_URL, {}, 1) : Promise.resolve(null),
  ]);

  const p = {
    rest_ms: rest.ms, rest_ok: rest.ok,
    auth_ms: auth.ms, auth_ok: auth.ok,
    storage_ms: storage.ms, storage_ok: storage.ok,
    site_ms: site ? site.ms : null, site_ok: site ? site.ok : null,
  };
  const collect = await timed(`${sb}/rest/v1/rpc/monitor_collect`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ p }),
  });
  const sample = collect.ok && collect.body && typeof collect.body === "object" ? collect.body : null;

  // ---- Mức độ ----
  const bad = [], warn = [];
  for (const [name, r, lim] of [["REST", rest, slowMs], ["Auth", auth, slowMs], ["Storage", storage, slowMs], ["Trang order", site, slowMs * 2]]) {
    if (!r) continue;
    if (!r.ok) bad.push(`${name} lỗi (${r.status ? "HTTP " + r.status : r.error || "không phản hồi"})`);
    else if (r.ms > lim) warn.push(`${name} chậm ${r.ms} ms`);
  }
  if (!collect.ok && rest.ok) warn.push(`Không ghi được số liệu monitoring (${collect.status || collect.error})`);
  if (sample) {
    const cPct = sample.conns_max ? (sample.conns / sample.conns_max) * 100 : 0;
    if (cPct >= 90) bad.push(`Kết nối DB ${sample.conns}/${sample.conns_max}`);
    else if (cPct >= 70) warn.push(`Kết nối DB ${sample.conns}/${sample.conns_max}`);
    if (sample.locks >= 5) bad.push(`${sample.locks} truy vấn chờ khoá`);
    else if (sample.locks > 0) warn.push(`${sample.locks} truy vấn chờ khoá`);
    if (sample.long_q > 0) warn.push(`${sample.long_q} truy vấn chạy quá 5 phút`);
  }
  const level = bad.length ? "bad" : warn.length ? "warn" : "ok";
  const detail = [...bad, ...warn].join("; ");

  // ---- Bot tự xử lý an toàn: ngắt truy vấn treo / giao dịch bỏ dở > 5 phút của app ----
  let fixed = null;
  if (sample && level !== "ok") {
    const cPct = sample.conns_max ? (sample.conns / sample.conns_max) * 100 : 0;
    if (sample.long_q > 0 || sample.locks > 0 || cPct >= 90) {
      const f = await rpcCall(env, "monitor_autofix", {});
      if (f.ok && Array.isArray(f.body) && f.body.length) fixed = f.body;
    }
  }

  const alert = await updateAlert(env, level, detail, sample, fixed);
  return { level, detail, p, saved: !!sample, alert, fixed };
}

async function rpcCall(env, fn, body) {
  const sb = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  return timed(`${sb}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...authHeaders(env.SUPABASE_SERVICE_KEY || ""), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Ghi sự cố vào bảng monitor_incidents (lỗi ghi không làm hỏng cảnh báo)
async function incident(env, p) {
  try {
    const r = await rpcCall(env, "monitor_incident", { p });
    return r.ok && r.body && typeof r.body === "object" ? r.body : null;
  } catch { return null; }
}

// "API (PostgREST) 30 · Realtime 8 · Storage 6"
function connText(cb) {
  const g = cb && cb.groups;
  if (!g) return "";
  return Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(" · ");
}

// Đường dẫn gọi nhiều nhất trong khoảng sự cố (chỉ khi có SUPABASE_PAT)
async function topRequests(env, fromMs, toMs) {
  const ref = supabaseRef(env);
  if (!env.SUPABASE_PAT || !ref) return null;
  const sql = `select log_attributes['request.method'] m,
      arrayStringConcat(arraySlice(splitByChar('/', splitByChar('?', log_attributes['request.path'])[1]), 1, 5), '/') path,
      count() n, any(substring(log_attributes['request.headers.user_agent'], 1, 50)) ua
    from logs where source = 'edge_logs' group by m, path order by n desc limit 8`;
  const u = new URL(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all`);
  u.searchParams.set("sql", sql);
  u.searchParams.set("iso_timestamp_start", new Date(fromMs - 5 * 60000).toISOString());
  u.searchParams.set("iso_timestamp_end", new Date(toMs).toISOString());
  const r = await timed(u.toString(), { headers: { Authorization: `Bearer ${env.SUPABASE_PAT}` } });
  if (!r.ok || !r.body || !Array.isArray(r.body.result)) return null;
  return r.body.result.map((x) => ({ path: `${x.path} (${x.m})`, n: Number(x.n), who: x.ua || "" }));
}

async function updateAlert(env, level, detail, sample = null, fixed = null) {
  const kv = env.ALERT_KV;
  const now = Date.now();
  let st = null;
  try { st = kv ? await kv.get("alert", "json") : null; } catch {}
  st = st || { status: "ok", streak: 0, since: now, alerted: false };

  if (level === "ok") {
    let inc = null;
    if (st.incId) {
      const top = st.alerted ? await topRequests(env, st.since, now) : null;
      if (top) await incident(env, { op: "context", id: st.incId, context: { requests: { top } } });
      inc = await incident(env, { op: "close", id: st.incId, alerted: !!st.alerted });
    }
    if (st.alerted) {
      const mins = Math.max(1, Math.round((now - st.since) / 60000));
      const botFixed = (inc && inc.recovery === "bot_can_thiep") || st.fixes > 0;
      const migs = (inc && inc.context && inc.context.migrations) || [];
      await sendTelegram(env, [
        `✅ POS BÉ NỐC ĐÃ HỒI PHỤC`,
        `Sự cố kéo dài khoảng ${mins} phút (từ ${fmtTime(st.since)}).`,
        st.detail ? `Lỗi trước đó: ${st.detail}` : "",
        botFixed ? `🛠 Bot đã can thiệp: ngắt ${st.fixes || "?"} truy vấn treo.` : `Cách hồi phục: tự hồi phục (bot không phải can thiệp).`,
        inc && inc.peak_conns ? `Kết nối đông nhất: ${inc.peak_conns}/${inc.conns_max}${connText(inc.peak_conn_by) ? " — " + connText(inc.peak_conn_by) : ""}` : "",
        migs.length ? `Có thể liên quan: migration ${migs.map((m) => m.name).join(", ")} chạy lúc ${migs.map((m) => fmtTime(m.at)).join(", ")}` : "",
        dashLink(env) ? dashLink(env) + "#su-co" : "",
      ].filter(Boolean).join("\n"));
    }
    if (st.status !== "ok" || st.alerted) {
      st = { status: "ok", streak: 0, since: now, alerted: false };
      await kvPut(kv, st);
    }
    return st;
  }

  const wasOk = st.status === "ok";
  const streak = st.status === level ? st.streak + 1 : 1;
  const need = level === "bad" ? BAD_STREAK : WARN_STREAK;
  const escalate = st.alerted && st.alertLevel === "warn" && level === "bad";
  const remind = st.alerted && now - (st.lastAlert || 0) > REMIND_MS;
  const next = {
    status: level, streak, detail,
    since: wasOk ? now : st.since,
    alerted: st.alerted, alertLevel: st.alertLevel, lastAlert: st.lastAlert,
    incId: wasOk ? null : st.incId, fixes: wasOk ? 0 : st.fixes || 0,
  };
  if (!next.incId) {
    const inc = await incident(env, { op: "open", level, detail });
    if (inc) next.incId = inc.id;
  }
  if (fixed && fixed.length && next.incId) {
    await incident(env, { op: "action", id: next.incId, action: { type: "ngat_truy_van_treo", n: fixed.length, items: fixed } });
    next.fixes += fixed.length;
  }

  if (streak >= need && (!st.alerted || escalate || remind)) {
    const mins = Math.max(1, Math.round((now - next.since) / 60000));
    await sendTelegram(env, [
      level === "bad" ? `🔴 POS BÉ NỐC ĐANG GẶP SỰ CỐ` : `🟡 POS BÉ NỐC ĐANG CHẬM`,
      `${remind && !escalate ? "Vẫn chưa hết — " : ""}khoảng ${mins} phút (từ ${fmtTime(next.since)}).`,
      `Chi tiết: ${detail}`,
      sample && connText(sample.conn_by) ? `Kết nối theo dịch vụ: ${connText(sample.conn_by)}` : "",
      next.fixes ? `🛠 Bot đã ngắt ${next.fixes} truy vấn treo.` : "",
      level === "bad" ? `Nếu kéo dài: chuẩn bị order giấy dự phòng, xem status.supabase.com.` : "",
      dashLink(env),
    ].filter(Boolean).join("\n"));
    next.alerted = true;
    next.alertLevel = level === "bad" || st.alertLevel === "bad" ? "bad" : "warn";
    next.lastAlert = now;
  }
  // lần mở sự cố đã ghi 1 dòng diễn biến; các lần sau ghi thêm
  if (next.incId && !wasOk) await incident(env, { op: "update", id: next.incId, level, detail, alerted: !!next.alerted });
  else if (next.incId && next.alerted) await incident(env, { op: "update", id: next.incId, level, detail, alerted: true });
  await kvPut(kv, next);
  return next;
}

async function kvPut(kv, v, key = "alert") {
  if (!kv) return;
  try { await kv.put(key, JSON.stringify(v)); } catch (e) { console.error("KV lỗi", errMsg(e)); }
}

function dashLink(env) {
  return env.DASH_URL ? `📈 ${env.DASH_URL}` : "";
}

// =====================================================================
// Chi phí & hạn mức (mỗi giờ)
// =====================================================================

const utcDay = (t) => new Date(t).toISOString().slice(0, 10);

// Thu số liệu Cloudflare (GraphQL Analytics) và Supabase (Management API, nhật ký) cho 1 ngày UTC.
async function collectDay(env, day, endIso) {
  const rows = [], notes = [];
  const startIso = day + "T00:00:00Z";
  const put = (service, metric, value) => {
    const f = FREE[service + ":" + metric];
    rows.push({ d: day, service, metric, value: Math.round(Number(value) || 0), limit: f && f.period === "day" ? f.limit : null, period: "day" });
  };

  // ---- Cloudflare ----
  if (env.CF_API_TOKEN && env.CF_ACCOUNT_ID) {
    const query = `query($a: string!, $s: Time!, $e: Time!, $d: Date!) { viewer { accounts(filter: { accountTag: $a }) {
      w: workersInvocationsAdaptive(limit: 1000, filter: { datetime_geq: $s, datetime_leq: $e }) { sum { requests errors subrequests } dimensions { scriptName } }
      kv: kvOperationsAdaptiveGroups(limit: 100, filter: { date_geq: $d, date_leq: $d }) { sum { requests } dimensions { actionType } }
    } } }`;
    const r = await timed("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { a: env.CF_ACCOUNT_ID, s: startIso, e: endIso, d: day } }),
    });
    const acc = r.ok && r.body && r.body.data && r.body.data.viewer && r.body.data.viewer.accounts && r.body.data.viewer.accounts[0];
    if (acc) {
      const w = acc.w || [];
      put("cloudflare", "workers_requests", w.reduce((a, x) => a + (x.sum.requests || 0), 0));
      put("cloudflare", "workers_errors", w.reduce((a, x) => a + (x.sum.errors || 0), 0));
      put("cloudflare", "workers_subrequests", w.reduce((a, x) => a + (x.sum.subrequests || 0), 0));
      const kv = { read: 0, write: 0, delete: 0, list: 0 };
      for (const x of acc.kv || []) { const k = String(x.dimensions.actionType || "").toLowerCase(); if (k in kv) kv[k] += x.sum.requests || 0; }
      for (const [k, v] of Object.entries(kv)) put("cloudflare", "kv_" + k, v);
    } else {
      const why = r.body && r.body.errors ? JSON.stringify(r.body.errors).slice(0, 200) : r.status || r.error;
      notes.push(`Cloudflare GraphQL lỗi: ${why}`);
    }
  } else notes.push("Chưa có CF_API_TOKEN / CF_ACCOUNT_ID: chưa đo hạn mức Cloudflare");

  // ---- Supabase (cần Personal Access Token) ----
  const ref = supabaseRef(env);
  if (env.SUPABASE_PAT && ref) {
    const sql = `select
        countIf(source = 'edge_logs') as req_all,
        countIf(source = 'edge_logs' and startsWith(log_attributes['request.path'], '/rest/')) as req_rest,
        countIf(source = 'edge_logs' and startsWith(log_attributes['request.path'], '/auth/')) as req_auth,
        countIf(source = 'edge_logs' and startsWith(log_attributes['request.path'], '/storage/')) as req_storage,
        countIf(source = 'edge_logs' and startsWith(log_attributes['request.path'], '/realtime/')) as req_realtime,
        countIf(source = 'edge_logs' and log_attributes['response.headers.content_length'] != '') as req_with_len,
        sumIf(toInt64OrZero(log_attributes['response.headers.content_length']), source = 'edge_logs' and log_attributes['response.headers.cf_cache_status'] = 'HIT') as egress_cached,
        sumIf(toInt64OrZero(log_attributes['response.headers.content_length']), source = 'edge_logs' and log_attributes['response.headers.cf_cache_status'] != 'HIT') as egress_uncached,
        countIf(source = 'function_edge_logs') as fn
      from logs where source in ('edge_logs', 'function_edge_logs')`;
    const u = new URL(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all`);
    u.searchParams.set("sql", sql);
    u.searchParams.set("iso_timestamp_start", startIso);
    u.searchParams.set("iso_timestamp_end", endIso);
    let r = await timed(u.toString(), { headers: { Authorization: `Bearer ${env.SUPABASE_PAT}` } });
    if (r.status === 404) {   // tên đường dẫn mới của Management API
      u.pathname = u.pathname.replace(/logs\.all$/, "logs");
      r = await timed(u.toString(), { headers: { Authorization: `Bearer ${env.SUPABASE_PAT}` } });
    }
    const x = r.ok && r.body && Array.isArray(r.body.result) ? r.body.result[0] : null;
    if (x) {
      put("supabase", "egress_uncached_bytes", x.egress_uncached);
      put("supabase", "egress_cached_bytes", x.egress_cached);
      put("supabase", "function_invocations", x.fn);
      for (const k of ["req_all", "req_rest", "req_auth", "req_storage", "req_realtime", "req_with_len"]) put("supabase", k, x[k]);
    } else {
      notes.push(`Supabase logs lỗi: ${r.status || r.error} ${typeof r.body === "string" ? r.body.slice(0, 150) : JSON.stringify(r.body || {}).slice(0, 150)}`);
    }
  }
  return { rows, notes };
}

export async function collectCosts(env, alert = true) {
  const sb = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const headers = { ...authHeaders(env.SUPABASE_SERVICE_KEY || ""), "Content-Type": "application/json" };
  const now = new Date();
  const today = utcDay(now);
  const jobs = [collectDay(env, today, now.toISOString())];
  // Đầu ngày UTC (7h–9h sáng VN): chốt nốt số liệu cả ngày hôm qua
  if (now.getUTCHours() < 2) jobs.push(collectDay(env, utcDay(now.getTime() - 86400000), today + "T00:00:00Z"));
  const parts = await Promise.all(jobs);
  const rows = parts.flatMap((p) => p.rows), notes = parts.flatMap((p) => p.notes);
  let saved = null;
  if (rows.length) {
    const r = await timed(`${sb}/rest/v1/rpc/cloud_usage_put`, { method: "POST", headers, body: JSON.stringify({ p: rows }) });
    saved = r.ok ? r.body : `lỗi ${r.status || r.error}`;
    if (!r.ok) notes.push(`Không ghi được cloud_usage (${r.status || r.error}) — đã chạy cập nhật 47 chưa?`);
  }
  const sent = alert ? await costAlerts(env) : [];
  return { rows: rows.length, saved, notes, alerts: sent };
}

function supabaseRef(env) {
  try { return new URL(env.SUPABASE_URL).hostname.split(".")[0]; } catch { return ""; }
}

async function getCost(env, days = 30) {
  const sb = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const r = await timed(`${sb}/rest/v1/rpc/monitor_cost`, {
    method: "POST",
    headers: { ...authHeaders(env.SUPABASE_SERVICE_KEY || ""), "Content-Type": "application/json" },
    body: JSON.stringify({ p_days: days }),
  });
  return r.ok && r.body && typeof r.body === "object" ? { c: r.body } : { error: `monitor_cost lỗi (${r.status || r.error})` };
}

// Tóm tắt chi phí dùng chung cho cảnh báo và báo cáo 7h
export function costSummary(c) {
  const s = c.settings || {}, rate = Number(s.usd_vnd || 26100), ai = c.ai || {};
  const vnd = (usd) => Number(usd || 0) * rate;
  const mtdReal = vnd(ai.mtd && ai.mtd.real_usd), mtdList = vnd(ai.mtd && ai.mtd.list_usd);
  const day = Math.max(1, Number(c.day_of_month || 1)), dim = Number(c.days_in_month || 30);
  const fixed = (Array.isArray(s.fixed_costs) ? s.fixed_costs : []).reduce((a, f) =>
    a + (Number(f.vnd_thang) || 0) + (Number(f.vnd_nam) || 0) / 12, 0);
  const quotas = [];
  const latest = (c.cloud && c.cloud.latest) || [], month = (c.cloud && c.cloud.month) || {};
  for (const [key, f] of Object.entries(FREE)) {
    const [service, metric] = key.split(":");
    let used = null;
    if (f.period === "day") {
      const row = latest.find((x) => x.service === service && x.metric === metric);
      if (row) used = Number(row.value);
    } else if (month[key] != null) used = Number(month[key]);
    if (used != null) quotas.push({ key, name: f.name, used, limit: f.limit, period: f.period, bytes: !!f.bytes, pct: (used / f.limit) * 100 });
  }
  quotas.sort((a, b) => b.pct - a.pct);
  return {
    rate,
    todayReal: vnd(ai.today && ai.today.real_usd), todayList: vnd(ai.today && ai.today.list_usd),
    yReal: vnd(ai.yesterday && ai.yesterday.real_usd), yList: vnd(ai.yesterday && ai.yesterday.list_usd),
    yCalls: (ai.yesterday && ai.yesterday.calls) || 0,
    mtdReal, mtdList, projReal: (mtdReal / day) * dim, projList: (mtdList / day) * dim,
    budget: Number(s.budget_vnd_month || 0), fixed, quotas,
    unpriced: (ai.by_model || []).filter((m) => m.unpriced).map((m) => m.model),
  };
}

// Gửi Telegram khi vượt ngưỡng. Mỗi loại cảnh báo tối đa 1 lần / ngày (VN), lưu trong KV "cost_alerts".
async function costAlerts(env) {
  const g = await getCost(env, 30);
  if (!g.c) return [];
  const c = g.c, s = c.settings || {}, sum = costSummary(c), pct = Number(s.alert_quota_pct || 80);
  const found = [];
  if (sum.todayReal > Number(s.alert_ai_day_vnd || Infinity))
    found.push(["ai_day", `AI hôm nay đã tốn ${fmtVND(sum.todayReal)} (ngưỡng ${fmtVND(s.alert_ai_day_vnd)}).`]);
  if (sum.budget > 0 && sum.projReal > sum.budget)
    found.push(["ai_month", `Dự báo AI cả tháng ${fmtVND(sum.projReal)}, vượt ngân sách ${fmtVND(sum.budget)} (đã tốn ${fmtVND(sum.mtdReal)}).`]);
  const errs = (c.ai && c.ai.errors_today) || {};
  if (Number(errs["429"] || 0) >= 5)
    found.push(["ai_429", `AI bị từ chối vì quá hạn mức ${errs["429"]} lần hôm nay (HTTP 429). Gói miễn phí Gemini có thể đã hết lượt trong ngày.`]);
  for (const m of (c.ai && c.ai.today_by_model) || []) {
    if (m.rpd_limit && (m.calls / m.rpd_limit) * 100 >= pct)
      found.push(["rpd:" + m.model, `${m.model}: đã gọi ${m.calls}/${m.rpd_limit} lượt hôm nay (${Math.round((m.calls / m.rpd_limit) * 100)}% hạn mức miễn phí).`]);
  }
  for (const q of sum.quotas) {
    if (q.pct >= pct) found.push(["quota:" + q.key, `${q.name}: ${fmtQ(q.used, q.bytes)} / ${fmtQ(q.limit, q.bytes)} ${q.period === "day" ? "hôm nay" : "tháng này"} (${q.pct.toFixed(0)}%).`]);
  }
  if (!found.length) return [];

  const kv = env.ALERT_KV, today = vnDay(Date.now());
  let st = null;
  try { st = kv ? await kv.get("cost_alerts", "json") : null; } catch {}
  if (!st || st.d !== today) st = { d: today, sent: [] };
  const fresh = found.filter(([k]) => !st.sent.includes(k));
  if (!fresh.length) return [];
  const ok = await sendTelegram(env, [
    "💸 CHI PHÍ / HẠN MỨC CẦN XEM",
    ...fresh.map(([, t]) => "• " + t),
    "",
    s.gemini_paid ? "" : "Gemini đang tính là gói miễn phí (chi phí thật = 0); số \"nếu trả tiền\" xem trên trang.",
    dashLink(env) ? dashLink(env) + "#chi-phi" : "",
  ].filter(Boolean).join("\n"));
  if (ok) { st.sent.push(...fresh.map(([k]) => k)); await kvPut(kv, st, "cost_alerts"); }
  return fresh.map(([k]) => k);
}

function fmtQ(v, bytes) {
  if (!bytes) return Number(v).toLocaleString("vi-VN");
  return v >= GB ? (v / GB).toFixed(2) + " GB" : (v / MB).toFixed(1) + " MB";
}
function vnDay(t) { return new Date(Number(t) + 7 * 3600000).toISOString().slice(0, 10); }

// =====================================================================
// Số liệu cho trang dashboard
// =====================================================================

async function dashboardData(env, hours) {
  const sb = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const headers = authHeaders(env.SUPABASE_SERVICE_KEY || "");
  const days = 30;
  const [r, cost, incs] = await Promise.all([
    timed(`${sb}/rest/v1/rpc/monitor_dashboard`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ p_hours: Math.min(Math.max(hours || 24, 1), 840) }),
    }),
    getCost(env, days),
    rpcCall(env, "monitor_incidents_list", { p_days: 30 }),
  ]);
  let alert = null;
  try { alert = env.ALERT_KV ? await env.ALERT_KV.get("alert", "json") : null; } catch {}
  if (!r.ok) {
    return { error: `Không lấy được số liệu từ Supabase (${r.status || r.error})`, alert };
  }
  return {
    d: r.body,
    alert,
    cost: cost.c || null,
    incidents: incs.ok && Array.isArray(incs.body) ? incs.body : null,
    cost_error: cost.error || null,
    free: FREE,
    cost_sources: { cloudflare: !!(env.CF_API_TOKEN && env.CF_ACCOUNT_ID), supabase_logs: !!env.SUPABASE_PAT },
    slow_ms: Number(env.SLOW_MS || 1500),
    db_limit_mb: Number(env.DB_LIMIT_MB || 500),
    storage_limit_mb: Number(env.STORAGE_LIMIT_MB || 1024),
  };
}

// =====================================================================
// Báo cáo 7h sáng
// =====================================================================

async function runAndSend(env) {
  let text;
  try {
    text = (await buildReport(env)).text;
  } catch (e) {
    text = `❌ Bot báo cáo sức khỏe bị lỗi, không kiểm tra được hệ thống.\nChi tiết: ${errMsg(e)}`;
  }
  await sendTelegram(env, text);
  return text;
}

export async function buildReport(env) {
  const sb = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const headers = authHeaders(env.SUPABASE_SERVICE_KEY || "");
  const slowMs = Number(env.SLOW_MS || 1500);
  const dbLimit = Number(env.DB_LIMIT_MB || 500) * MB;
  const stLimit = Number(env.STORAGE_LIMIT_MB || 1024) * MB;

  // Gọi song song các nhóm kiểm tra; trong mỗi nhóm REST/Auth/Storage đo tuần tự (timedStable)
  const [rest, rpc, auth, storage, site, cost] = await Promise.all([
    timedStable(`${sb}/rest/v1/shop_settings?select=id&limit=1`, { headers }),
    timed(`${sb}/rest/v1/rpc/health_snapshot`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: "{}",
    }),
    timedStable(`${sb}/auth/v1/health`, { headers }),
    timedStable(`${sb}/storage/v1/bucket`, { headers }),
    env.SITE_URL ? timed(env.SITE_URL) : Promise.resolve(null),
    getCost(env, 30),
  ]);

  const services = [];
  const database = [];
  const business = [];
  const costs = [];
  const hints = [];

  // ---- 1. Dịch vụ ----
  services.push(apiItem("API dữ liệu (REST)", rest, slowMs));
  services.push(apiItem("Đăng nhập (Auth)", auth, slowMs));
  services.push(apiItem("Lưu trữ ảnh (Storage)", storage, slowMs));
  if (site) services.push(apiItem("Trang order của khách", site, slowMs * 2));

  if (!rest.ok && !auth.ok && !storage.ok) {
    hints.push(
      "Supabase không phản hồi: vào dashboard xem project có bị tạm dừng (Paused) không, và xem status.supabase.com có sự cố không."
    );
  }

  // ---- 2. Database ----
  const snap = rpc.ok && rpc.body && typeof rpc.body === "object" ? rpc.body : null;
  if (!snap) {
    database.push(item("bad", `Không lấy được số liệu database (${rpc.status || rpc.error || "?"})`));
    const code = rpc.body && rpc.body.code;
    if (rest.ok && (rpc.status === 404 || code === "PGRST202")) {
      hints.push("Chưa có hàm health_snapshot: chạy file health_snapshot.sql trong SQL Editor.");
    }
  } else {
    database.push(usageItem("Dung lượng database", snap.db_size_bytes, dbLimit));

    if (snap.storage_bytes != null) {
      database.push(usageItem("Dung lượng Storage (ảnh)", snap.storage_bytes, stLimit));
    } else if (snap.storage_error) {
      database.push(item("warn", `Không đo được Storage: ${snap.storage_error}`));
    }

    const cUsed = Number(snap.connections_used), cMax = Number(snap.connections_max);
    const cPct = cMax ? (cUsed / cMax) * 100 : 0;
    database.push(
      item(levelByPct(cPct), `Kết nối đang mở: ${cUsed}/${cMax} (${cPct.toFixed(0)}%)`)
    );

    if (snap.cache_hit_ratio != null) {
      const r = Number(snap.cache_hit_ratio);
      database.push(item(r < 95 ? "warn" : "ok", `Tỉ lệ đọc từ bộ nhớ đệm: ${r}%`));
    }

    const lq = Number(snap.long_queries || 0);
    database.push(
      item(lq > 0 ? "warn" : "ok", lq > 0 ? `${lq} truy vấn chạy quá 5 phút` : "Không có truy vấn treo")
    );

    const wl = Number(snap.waiting_locks || 0);
    database.push(
      item(wl >= 5 ? "bad" : wl > 0 ? "warn" : "ok",
        wl > 0 ? `${wl} truy vấn đang chờ khoá (lock)` : "Không có khoá bị kẹt")
    );

    // ---- 3. Dữ liệu quán ----
    if (snap.sales_yesterday != null) {
      business.push(item("info",
        `Hôm qua: ${snap.sales_yesterday} hoá đơn, doanh thu ${fmtVND(snap.revenue_yesterday)}`));
      if (snap.last_sale_at) business.push(item("info", `Thanh toán gần nhất: ${fmtTime(snap.last_sale_at)}`));
    } else if (snap.sales_error) {
      business.push(item("info", `Không đọc được bảng sales: ${snap.sales_error}`));
    }
    if (snap.stale_orders != null) {
      const stale = Number(snap.stale_orders);
      database.push(item(stale > 0 ? "warn" : "ok",
        stale > 0
          ? `${stale} đơn từ hôm trước chưa thanh toán/đóng — dọn trước khi mở quán`
          : "Không còn đơn treo từ hôm trước"));
    } else if (snap.orders_error) {
      business.push(item("info", `Không đọc được bảng orders: ${snap.orders_error}`));
    }
    if (Number(snap.fb_pending) > 0) {
      business.push(item("info", `${snap.fb_pending} đơn Facebook đang chờ duyệt`));
    }
    if (Array.isArray(snap.top_tables) && snap.top_tables.length) {
      const top = snap.top_tables
        .slice(0, 3)
        .map((t) => `${t.name} (${t.rows} dòng, ${fmtMB(t.bytes)})`)
        .join(", ");
      business.push(item("info", `Bảng lớn nhất: ${top}`));
    }
  }

  // ---- 4. Chi phí (chỉ để biết, không ảnh hưởng kết luận đón khách) ----
  if (cost.c) {
    const s = costSummary(cost.c), st = cost.c.settings || {};
    costs.push(item("info", `AI hôm qua: ${fmtVND(s.yReal)} (${s.yCalls} lượt gọi${st.gemini_paid ? "" : `; nếu trả tiền ${fmtVND(s.yList)}`})`));
    costs.push(item(s.budget && s.projReal > s.budget ? "warn" : "info",
      `AI tháng này: ${fmtVND(s.mtdReal)}, dự báo cả tháng ${fmtVND(s.projReal)}${s.budget ? ` / ngân sách ${fmtVND(s.budget)}` : ""}`));
    if (s.fixed) costs.push(item("info", `Chi phí cố định: ${fmtVND(s.fixed)} / tháng`));
    const top = s.quotas[0];
    if (top) costs.push(item(top.pct >= 80 ? "warn" : "info", `Hạn mức dùng nhiều nhất: ${top.name} ${top.pct.toFixed(0)}% ${top.period === "day" ? "(hôm nay)" : "(tháng này)"}`));
    if (s.unpriced.length) costs.push(item("warn", `Model chưa có giá trong ai_prices: ${s.unpriced.join(", ")}`));
  } else if (cost.error) {
    costs.push(item("info", `Chưa đọc được chi phí: ${cost.error} (chạy cập nhật 47?)`));
  }

  // ---- Kết luận ----
  const all = [...services, ...database];
  const bad = all.filter((i) => i.level === "bad").length;
  const warn = all.filter((i) => i.level === "warn").length;
  let verdict;
  if (bad) {
    verdict =
      "🔴 KHÔNG ỔN ĐỊNH — chưa nên đón khách bằng POS.\nChuẩn bị order giấy dự phòng và xử lý các mục ❌ ngay.";
  } else if (warn) {
    verdict = "🟡 ĐÓN KHÁCH ĐƯỢC — nhưng cần xử lý các mục ⚠️ trong hôm nay.";
  } else {
    verdict = "🟢 ỔN ĐỊNH — sẵn sàng đón khách.";
  }

  const lines = [
    `📊 SỨC KHỎE HỆ THỐNG POS BÉ NỐC`,
    `🕖 ${fmtTime(new Date())}`,
    ``,
    verdict,
    ``,
    `— Dịch vụ —`,
    ...services.map(fmtItem),
    ``,
    `— Database —`,
    ...database.map(fmtItem),
  ];
  if (business.length) lines.push(``, `— Dữ liệu quán —`, ...business.map(fmtItem));
  if (costs.length) lines.push(``, `— Chi phí —`, ...costs.map(fmtItem));
  if (hints.length) lines.push(``, `💡 Gợi ý:`, ...hints.map((h) => `• ${h}`));
  if (env.DASH_URL) lines.push(``, `📈 Biểu đồ: ${env.DASH_URL}`);

  return { text: lines.join("\n"), bad, warn };
}

// =====================================================================
// Hàm phụ
// =====================================================================

function authHeaders(key) {
  const h = { apikey: key };
  // Key cũ (JWT, bắt đầu bằng "eyJ") gửi kèm Authorization; key mới sb_secret_... chỉ cần apikey
  if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;
  return h;
}

async function timed(url, init = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const raw = await res.text();
    let body = raw;
    try { body = JSON.parse(raw); } catch {}
    return { ok: res.ok, status: res.status, ms: Date.now() - t0, body };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: errMsg(e) };
  }
}

// Gọi 1 lần làm ấm kết nối (không tính), rồi đo `runs` lần liên tiếp, trả về lần ở giữa.
// Lần nào lỗi thì trả về lỗi đó ngay để không che mất sự cố thật.
async function timedStable(url, init = {}, runs = 3) {
  await timed(url, init);
  const results = [];
  for (let i = 0; i < runs; i++) {
    const r = await timed(url, init);
    if (!r.ok) return r;
    results.push(r);
  }
  results.sort((a, b) => a.ms - b.ms);
  return results[Math.floor((results.length - 1) / 2)];
}

function apiItem(name, r, slowMs) {
  if (!r.ok) {
    const why = r.status ? `HTTP ${r.status}` : r.error || "không phản hồi";
    return item("bad", `${name}: lỗi (${why})`);
  }
  if (r.ms > slowMs) return item("warn", `${name}: chậm (${r.ms} ms)`);
  return item("ok", `${name}: OK (${r.ms} ms)`);
}

function usageItem(name, bytes, limit) {
  const pct = (Number(bytes) / limit) * 100;
  return item(levelByPct(pct), `${name}: ${fmtMB(bytes)} / ${fmtMB(limit)} (${pct.toFixed(0)}%)`);
}

function levelByPct(pct) {
  return pct >= 90 ? "bad" : pct >= 70 ? "warn" : "ok";
}

function item(level, text) { return { level, text }; }
function fmtItem(i) { return `${ICON[i.level]} ${i.text}`; }
function fmtMB(b) { return `${(Number(b) / MB).toFixed(1)} MB`; }
function fmtVND(n) { return `${Math.round(Number(n || 0)).toLocaleString("vi-VN")}đ`; }
function fmtTime(d) {
  return new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
}
function errMsg(e) { return String((e && e.message) || e); }
function textResponse(t) {
  return new Response(t, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function sendTelegram(env, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
    if (!r.ok) console.error("Telegram lỗi", r.status, await r.text());
    return r.ok;
  } catch (e) {
    console.error("Telegram lỗi", errMsg(e));
    return false;
  }
}
