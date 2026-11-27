// TỆP SINH TỰ ĐỘNG từ src/ bằng `node build.mjs` — sửa ở src/ rồi build lại.
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

const DASHBOARD_HTML = "<!DOCTYPE html>\n<html lang=\"vi\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>Bé Nốc POS — Monitoring</title>\n<meta name=\"robots\" content=\"noindex\">\n<script src=\"https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js\"></script>\n<style>\n:root {\n  color-scheme: light;\n  --page: #f9f9f7; --surface-1: #fcfcfb; --border: rgba(11,11,11,0.10);\n  --text-primary: #0b0b0b; --text-secondary: #52514e; --muted: #898781;\n  --grid: #e1e0d9; --axis: #c3c2b7;\n  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100; --s5: #e87ba4; --s6: #008300; --s7: #6250d6; --s8: #e34948;\n  --good: #0ca30c; --warning: #fab219; --serious: #ec835a; --critical: #d03b3b; --good-text: #006300;\n}\n@media (prefers-color-scheme: dark) {\n  :root {\n    color-scheme: dark;\n    --page: #0d0d0d; --surface-1: #1a1a19; --border: rgba(255,255,255,0.10);\n    --text-primary: #f0efec; --text-secondary: #c3c2b7; --muted: #898781;\n    --grid: #2c2c2a; --axis: #383835;\n    --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181; --s6: #0ca30c; --s7: #9085e9; --s8: #e66767;\n    --good-text: #0ca30c;\n  }\n}\n* { box-sizing: border-box; }\nbody { margin: 0; background: var(--page); color: var(--text-primary);\n  font: 14px/1.45 system-ui, -apple-system, \"Segoe UI\", sans-serif; }\nheader { position: sticky; top: 0; z-index: 5; background: var(--page); border-bottom: 1px solid var(--border);\n  padding: 10px 16px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }\nheader h1 { font-size: 16px; margin: 0; font-weight: 650; }\n.grow { flex: 1; }\n.badge { display: inline-flex; gap: 6px; align-items: center; padding: 3px 10px; border-radius: 999px;\n  border: 1px solid var(--border); font-weight: 600; font-size: 13px; background: var(--surface-1); }\n.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }\n.seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }\n.seg button { border: 0; background: var(--surface-1); color: var(--text-secondary); padding: 6px 12px; font: inherit; cursor: pointer; }\n.seg button[aria-pressed=\"true\"] { background: var(--text-primary); color: var(--surface-1); font-weight: 600; }\n.small { color: var(--muted); font-size: 12px; }\nnav { display: flex; gap: 4px; padding: 8px 16px 0; overflow-x: auto; }\nnav a { text-decoration: none; color: var(--text-secondary); padding: 6px 12px; border-radius: 8px; white-space: nowrap; }\nnav a:hover { background: var(--surface-1); }\nmain { padding: 12px 16px 40px; max-width: 1400px; margin: 0 auto; }\nsection { margin-top: 18px; scroll-margin-top: 70px; }\nsection > h2 { font-size: 15px; margin: 0 0 10px; font-weight: 650; }\n.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 10px; }\n.tile { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }\n.tile .k { color: var(--text-secondary); font-size: 12px; }\n.tile .v { font-size: 20px; font-weight: 650; margin-top: 2px; font-variant-numeric: tabular-nums; }\n.tile .s { color: var(--muted); font-size: 12px; margin-top: 2px; }\n.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 440px), 1fr)); gap: 12px; }\n.card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; min-width: 0; }\n.card h3 { margin: 0; font-size: 13px; font-weight: 600; }\n.card .sub { color: var(--muted); font-size: 12px; margin: 2px 0 8px; }\n.card .cv { position: relative; height: 240px; }\n.card.wide { grid-column: 1 / -1; }\n.empty { display: flex; height: 100%; align-items: center; justify-content: center; color: var(--muted); text-align: center; padding: 0 20px; }\ntable { width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; }\nth, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--grid); }\nth { color: var(--text-secondary); font-weight: 600; }\ntd.r, th.r { text-align: right; }\n.st { display: inline-flex; align-items: center; gap: 5px; }\n.meter { position: relative; height: 8px; border-radius: 4px; background: var(--grid); min-width: 80px; overflow: hidden; }\n.meter > span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; }\n.tablewrap { overflow-x: auto; }\n#login { max-width: 360px; margin: 18vh auto; background: var(--surface-1); border: 1px solid var(--border); border-radius: 14px; padding: 22px; }\n#login input { width: 100%; padding: 10px; font: inherit; border: 1px solid var(--axis); border-radius: 8px; background: var(--page); color: var(--text-primary); margin: 10px 0; }\n#login button, .btn { padding: 9px 14px; border-radius: 8px; border: 0; background: var(--text-primary); color: var(--surface-1); font: inherit; font-weight: 600; cursor: pointer; }\n.btn.ghost { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); padding: 6px 10px; }\n.err { color: var(--critical); margin-top: 6px; }\ndetails summary { cursor: pointer; color: var(--text-secondary); font-size: 12px; margin-top: 6px; }\n</style>\n</head>\n<body>\n\n<div id=\"login\" hidden>\n  <h1 style=\"font-size:17px;margin:0\">Bé Nốc POS — Monitoring</h1>\n  <p class=\"small\">Nhập mã xem trang (DASH_KEY).</p>\n  <form id=\"loginForm\"><input id=\"keyInput\" type=\"password\" autocomplete=\"current-password\" placeholder=\"Mã xem trang\" required>\n  <button type=\"submit\">Vào xem</button></form>\n  <div id=\"loginErr\" class=\"err\"></div>\n</div>\n\n<div id=\"app\" hidden>\n<header>\n  <h1>Bé Nốc POS · Monitoring</h1>\n  <span id=\"statusBadge\" class=\"badge\"><span class=\"dot\"></span><span>Đang tải…</span></span>\n  <span class=\"grow\"></span>\n  <div class=\"seg\" role=\"group\" aria-label=\"Khoảng thời gian\">\n    <button data-h=\"24\" aria-pressed=\"true\">24 giờ</button><button data-h=\"168\">7 ngày</button><button data-h=\"720\">30 ngày</button>\n  </div>\n  <span id=\"updated\" class=\"small\"></span>\n  <button id=\"refreshBtn\" class=\"btn ghost\" title=\"Tải lại\">↻</button>\n  <button id=\"logoutBtn\" class=\"btn ghost\" title=\"Thoát\">Thoát</button>\n</header>\n<nav>\n  <a href=\"#tong-quan\">Tổng quan</a><a href=\"#he-thong\">Hệ thống</a><a href=\"#van-hanh\">Vận hành quán</a><a href=\"#thanh-toan\">Thanh toán</a><a href=\"#bot\">Bot & OCR</a><a href=\"#chi-phi\">Chi phí</a><a href=\"#su-co\">Sự cố</a>\n</nav>\n<main>\n  <section id=\"tong-quan\"><h2>Tổng quan</h2><div class=\"tiles\" id=\"tiles\"></div></section>\n\n  <section id=\"he-thong\"><h2>Hệ thống</h2>\n    <div class=\"tiles\" id=\"sysTiles\" style=\"margin-bottom:12px\"></div>\n    <div class=\"grid\">\n      <div class=\"card wide\"><h3>Thời gian phản hồi</h3><div class=\"sub\" id=\"latSub\">ms · trung bình mỗi khung · đường nét đứt là ngưỡng chậm</div><div class=\"cv\"><canvas id=\"cLatency\"></canvas></div></div>\n      <div class=\"card\"><h3>Uptime theo khung</h3><div class=\"sub\">% lượt kiểm tra mà cả 4 dịch vụ đều trả lời</div><div class=\"cv\"><canvas id=\"cUptime\"></canvas></div></div>\n      <div class=\"card\"><h3>Kết nối database</h3><div class=\"sub\">số kết nối đang mở · nét đứt là giới hạn</div><div class=\"cv\"><canvas id=\"cConns\"></canvas></div></div>\n      <div class=\"card\"><h3>Tải database</h3><div class=\"sub\">giao dịch được ghi (commit) mỗi phút</div><div class=\"cv\"><canvas id=\"cTpm\"></canvas></div></div>\n      <div class=\"card\"><h3>Đơn đang mở</h3><div class=\"sub\">số đơn trong bảng orders tại mỗi lần kiểm tra</div><div class=\"cv\"><canvas id=\"cActive\"></canvas></div></div>\n      <div class=\"card\"><h3>Dung lượng Storage theo bucket</h3><div class=\"sub\">MB · gói Free 1 024 MB</div><div class=\"cv\"><canvas id=\"cBuckets\"></canvas></div></div>\n      <div class=\"card\"><h3>Bảng lớn nhất</h3><div class=\"sub\">MB · gồm cả index</div><div class=\"cv\"><canvas id=\"cTables\"></canvas></div></div>\n      <div class=\"card\"><h3>Dung lượng database theo ngày</h3><div class=\"sub\">MB · gói Free 500 MB</div><div class=\"cv\"><canvas id=\"cDbGrowth\"></canvas></div></div>\n    </div>\n  </section>\n\n  <section id=\"van-hanh\"><h2>Vận hành quán</h2>\n    <div class=\"grid\">\n      <div class=\"card wide\"><h3>Hôm nay theo giờ</h3><div class=\"sub\">số hoá đơn đã thanh toán · đường là trung bình 30 ngày cùng giờ</div><div class=\"cv\"><canvas id=\"cToday\"></canvas></div></div>\n      <div class=\"card wide\"><h3>Doanh thu 30 ngày</h3><div class=\"sub\">nghìn đồng · theo hình thức thanh toán</div><div class=\"cv\"><canvas id=\"cRevenue\"></canvas></div></div>\n      <div class=\"card\"><h3>Số đơn theo hình thức</h3><div class=\"sub\">hoá đơn mỗi ngày</div><div class=\"cv\"><canvas id=\"cDine\"></canvas></div></div>\n      <div class=\"card\"><h3>Thời gian phục vụ</h3><div class=\"sub\">phút · trung bình mỗi ngày</div><div class=\"cv\"><canvas id=\"cWait\"></canvas></div></div>\n      <div class=\"card wide\"><h3>Món bán chạy 7 ngày</h3><div class=\"sub\">số phần</div><div class=\"cv\" style=\"height:300px\"><canvas id=\"cTop\"></canvas></div></div>\n    </div>\n  </section>\n\n  <section id=\"thanh-toan\"><h2>Thanh toán</h2>\n    <div class=\"tiles\" id=\"payTiles\" style=\"margin-bottom:12px\"></div>\n    <div class=\"grid\">\n      <div class=\"card wide\"><h3>Chuyển khoản nhận được</h3><div class=\"sub\">số giao dịch mỗi ngày theo kết quả khớp đơn (đọc từ Store Noti)</div><div class=\"cv\"><canvas id=\"cPay\"></canvas></div></div>\n    </div>\n  </section>\n\n  <section id=\"bot\"><h2>Bot & OCR</h2>\n    <div class=\"tiles\" id=\"botTiles\" style=\"margin-bottom:12px\"></div>\n    <div class=\"grid\">\n      <div class=\"card\"><h3>Đơn bot lên</h3><div class=\"sub\">số đơn mỗi ngày theo trạng thái</div><div class=\"cv\"><canvas id=\"cDrafts\"></canvas></div></div>\n      <div class=\"card\"><h3>Đơn bot theo kênh</h3><div class=\"sub\">30 ngày</div><div class=\"cv\"><canvas id=\"cChannel\"></canvas></div></div>\n      <div class=\"card\"><h3>Ảnh gửi bot</h3><div class=\"sub\">số ảnh mỗi ngày</div><div class=\"cv\"><canvas id=\"cPhotos\"></canvas></div></div>\n      <div class=\"card\"><h3>Ảnh chụp chat (OCR)</h3><div class=\"sub\">số ảnh mỗi ngày · ảnh lỗi</div><div class=\"cv\"><canvas id=\"cCaptures\"></canvas></div></div>\n    </div>\n  </section>\n\n  <section id=\"chi-phi\"><h2>Chi phí & hạn mức</h2>\n    <div class=\"small\" id=\"costNote\" style=\"margin:-4px 0 10px\"></div>\n    <div class=\"tiles\" id=\"costTiles\" style=\"margin-bottom:12px\"></div>\n    <div class=\"grid\">\n      <div class=\"card wide\"><h3>Chi phí AI mỗi ngày</h3><div class=\"sub\" id=\"costSub\">đồng · cột: số tiền thật phải trả · nét đứt: nếu tính theo giá trả tiền</div><div class=\"cv\"><canvas id=\"cAiCost\"></canvas></div></div>\n      <div class=\"card\"><h3>Token mỗi ngày</h3><div class=\"sub\">nghìn token · vào gồm ảnh, ra gồm phần \"suy nghĩ\"</div><div class=\"cv\"><canvas id=\"cTokens\"></canvas></div></div>\n      <div class=\"card\"><h3>Lượt gọi AI mỗi ngày</h3><div class=\"sub\">thành công / lỗi (lỗi không tính tiền)</div><div class=\"cv\"><canvas id=\"cAiCalls\"></canvas></div></div>\n      <div class=\"card\"><h3>Chi phí theo model</h3><div class=\"sub\">đồng · 30 ngày · theo giá trả tiền</div><div class=\"cv\"><canvas id=\"cByModel\"></canvas></div></div>\n      <div class=\"card\"><h3>Cloudflare Workers mỗi ngày</h3><div class=\"sub\">lượt gọi (ngày UTC) · gói Free 100 000 lượt / ngày</div><div class=\"cv\"><canvas id=\"cCfReq\"></canvas></div></div>\n      <div class=\"card\"><h3>Supabase egress mỗi ngày</h3><div class=\"sub\">MB · ước tính từ nhật ký · gói Free 5 GB / tháng cho mỗi loại</div><div class=\"cv\"><canvas id=\"cEgress\"></canvas></div></div>\n      <div class=\"card\"><h3>Lượt gọi Supabase mỗi ngày</h3><div class=\"sub\">theo dịch vụ · đọc từ nhật ký API</div><div class=\"cv\"><canvas id=\"cSbReq\"></canvas></div></div>\n      <div class=\"card wide\"><h3>Hạn mức gói miễn phí</h3><div class=\"sub\">Cloudflare tính theo ngày UTC (reset 7h sáng VN) · Supabase tính theo tháng</div><div class=\"tablewrap\" id=\"quotaTable\"></div></div>\n      <div class=\"card wide\"><h3>Chi tiết theo model</h3><div class=\"sub\">30 ngày</div><div class=\"tablewrap\" id=\"modelTable\"></div>\n        <details><summary>Bảng giá đang dùng (USD / 1 triệu token)</summary><div class=\"tablewrap\" id=\"priceTable\"></div></details></div>\n    </div>\n  </section>\n\n  <section id=\"su-co\"><h2>Sự cố & cảnh báo</h2>\n    <div class=\"card\"><div id=\"incidents\"></div></div>\n  </section>\n  <p class=\"small\" style=\"margin-top:20px\">Số liệu từ Supabase (project benoc-pos) do bot benoc-health-bot đo mỗi 5 phút; hạn mức Cloudflare / Supabase thu mỗi giờ. Trang tự tải lại mỗi phút.</p>\n</main>\n</div>\n\n<script>\n(() => {\n  const LS = \"benoc_dash_key\";\n  let key = localStorage.getItem(LS) || \"\";\n  let hours = 24, timer = null, data = null;\n  const charts = {};\n  const $ = (id) => document.getElementById(id);\n  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();\n  const S = () => [1,2,3,4,5,6,7,8].map((i) => css(\"--s\" + i));\n  const nf = new Intl.NumberFormat(\"vi-VN\");\n  const fmtN = (n) => n == null || isNaN(n) ? \"—\" : nf.format(Math.round(n));\n  const fmtVND = (n) => n == null ? \"—\" : nf.format(Math.round(n)) + \"đ\";\n  const fmtK = (n) => n == null ? \"—\" : nf.format(Math.round(n / 1000)) + \"k\";\n  const fmtMB = (b) => b == null ? \"—\" : (b / 1048576).toLocaleString(\"vi-VN\", { maximumFractionDigits: 1 }) + \" MB\";\n  const fmtBytes = (b) => b == null ? \"—\" : b >= 1073741824 ? (b / 1073741824).toLocaleString(\"vi-VN\", { maximumFractionDigits: 2 }) + \" GB\" : fmtMB(b);\n  const fmtTok = (n) => n == null ? \"—\" : n >= 1e6 ? (n / 1e6).toLocaleString(\"vi-VN\", { maximumFractionDigits: 2 }) + \" tr\" : n >= 1e3 ? (n / 1e3).toLocaleString(\"vi-VN\", { maximumFractionDigits: 1 }) + \" k\" : fmtN(n);\n  const fmtSmallVND = (n) => n == null ? \"—\" : n > 0 && n < 10 ? n.toLocaleString(\"vi-VN\", { maximumFractionDigits: 2 }) + \"đ\" : fmtVND(n);\n  const tz = { timeZone: \"Asia/Ho_Chi_Minh\" };\n  const fmtTime = (t) => t ? new Date(t).toLocaleString(\"vi-VN\", { ...tz, hour12: false, day: \"2-digit\", month: \"2-digit\", hour: \"2-digit\", minute: \"2-digit\" }) : \"—\";\n  const ago = (t) => { if (!t) return \"—\"; const m = Math.round((Date.now() - new Date(t)) / 60000);\n    return m < 1 ? \"vừa xong\" : m < 60 ? m + \" phút trước\" : m < 1440 ? Math.round(m / 60) + \" giờ trước\" : Math.round(m / 1440) + \" ngày trước\"; };\n  const dayLabel = (d) => { const [y, m, dd] = d.split(\"-\"); return dd + \"/\" + m; };\n  const fillDays = (rows, n = 30) => { // đủ 30 ngày, ngày không có số liệu = 0\n    const map = new Map(rows.map((r) => [r.d, r])); const out = [];\n    const now = new Date(new Date().toLocaleString(\"en-US\", tz));\n    for (let i = n - 1; i >= 0; i--) { const t = new Date(now); t.setDate(t.getDate() - i);\n      const d = t.getFullYear() + \"-\" + String(t.getMonth() + 1).padStart(2, \"0\") + \"-\" + String(t.getDate()).padStart(2, \"0\");\n      out.push(map.get(d) || { d }); }\n    return out; };\n  const STATUS = {\n    ok:   { c: \"--good\",     icon: \"●\", t: \"Ổn định\" },\n    warn: { c: \"--warning\",  icon: \"▲\", t: \"Chậm / cần xem\" },\n    bad:  { c: \"--critical\", icon: \"✕\", t: \"Sự cố\" },\n    unk:  { c: \"--muted\",    icon: \"?\", t: \"Chưa có số liệu\" },\n  };\n\n  // ---------- Chart.js mặc định ----------\n  function applyDefaults() {\n    Chart.defaults.font.family = 'system-ui, -apple-system, \"Segoe UI\", sans-serif';\n    Chart.defaults.font.size = 11;\n    Chart.defaults.color = css(\"--muted\");\n    Chart.defaults.borderColor = css(\"--grid\");\n    Chart.defaults.maintainAspectRatio = false;\n    Chart.defaults.animation = false;\n    Chart.defaults.plugins.legend.labels.boxWidth = 10;\n    Chart.defaults.plugins.legend.labels.boxHeight = 10;\n    Chart.defaults.plugins.legend.labels.useBorderRadius = true;\n    Chart.defaults.plugins.legend.labels.borderRadius = 3;\n    Chart.defaults.plugins.legend.labels.color = css(\"--text-secondary\");\n    Chart.defaults.plugins.legend.align = \"start\";\n    Object.assign(Chart.defaults.plugins.tooltip, { backgroundColor: css(\"--surface-1\"), titleColor: css(\"--text-primary\"),\n      bodyColor: css(\"--text-secondary\"), borderColor: css(\"--axis\"), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true });\n    Chart.defaults.elements.line.borderWidth = 2;\n    Chart.defaults.elements.line.tension = 0.25;\n    Chart.defaults.elements.point.radius = 0;\n    Chart.defaults.elements.point.hoverRadius = 5;\n    Chart.defaults.elements.point.hitRadius = 8;\n    Chart.defaults.elements.bar.borderRadius = 4;\n    Chart.defaults.elements.bar.borderSkipped = \"start\";\n  }\n\n  const axes = (opts = {}) => ({\n    x: { stacked: !!opts.stacked, grid: { display: false }, border: { color: css(\"--axis\") }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },\n    y: { stacked: !!opts.stacked, beginAtZero: opts.zero !== false, min: opts.min, max: opts.max, grid: { color: css(\"--grid\") }, border: { display: false },\n         ticks: { callback: opts.tick || ((v) => fmtN(v)), maxTicksLimit: 6 } },\n  });\n\n  function draw(id, cfg, emptyText) {\n    const el = $(id); const box = el.parentElement;\n    const has = cfg.data.datasets.some((d) => !d._ref && d.data.some((v) => v != null && v !== 0 && !(typeof v === \"object\" && v.y == null)));\n    box.querySelector(\".empty\")?.remove();\n    if (charts[id]) { charts[id].destroy(); delete charts[id]; }\n    if (!has) { el.hidden = true; const e = document.createElement(\"div\"); e.className = \"empty\"; e.textContent = emptyText || \"Chưa có số liệu\"; box.appendChild(e); return; }\n    el.hidden = false;\n    cfg.options = cfg.options || {};\n    cfg.options.interaction = cfg.options.interaction || { mode: \"index\", intersect: false };\n    cfg.options.plugins = cfg.options.plugins || {};\n    if (cfg.data.datasets.filter((d) => !d._ref).length < 2) cfg.options.plugins.legend = { display: false };\n    charts[id] = new Chart(el, cfg);\n  }\n  const line = (label, data, color, extra = {}) => ({ type: \"line\", label, data, borderColor: color, backgroundColor: color, spanGaps: true, ...extra });\n  const ref = (label, data) => ({ type: \"line\", label, data, borderColor: css(\"--muted\"), borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 0, _ref: true });\n  const bar = (label, data, color, extra = {}) => ({ type: \"bar\", label, data, backgroundColor: color, borderColor: css(\"--surface-1\"), borderWidth: { top: 0, left: 0, right: 0, bottom: 2 }, maxBarThickness: 28, ...extra });\n\n  // ---------- Tải số liệu ----------\n  async function load() {\n    try {\n      const r = await fetch(\"/api/data?hours=\" + hours, { headers: { \"x-key\": key }, cache: \"no-store\" });\n      if (r.status === 401) { logout(\"Mã không đúng.\"); return; }\n      if (!r.ok) throw new Error(\"HTTP \" + r.status + \" \" + (await r.text()).slice(0, 200));\n      data = await r.json();\n      render();\n      $(\"updated\").textContent = \"Cập nhật \" + new Date().toLocaleTimeString(\"vi-VN\", { ...tz, hour12: false });\n    } catch (e) {\n      $(\"updated\").textContent = \"Lỗi tải: \" + e.message;\n    }\n  }\n\n  function tile(k, v, s, status) {\n    const st = status ? STATUS[status] : null;\n    return `<div class=\"tile\"><div class=\"k\">${k}</div><div class=\"v\">${st ? `<span class=\"st\" style=\"color:var(${st.c})\">${st.icon}</span> ` : \"\"}${v}</div>${s ? `<div class=\"s\">${s}</div>` : \"\"}</div>`;\n  }\n  const lvl = (v, warn, bad, higherIsWorse = true) => v == null ? \"unk\" : higherIsWorse ? (v >= bad ? \"bad\" : v >= warn ? \"warn\" : \"ok\") : (v <= bad ? \"bad\" : v <= warn ? \"warn\" : \"ok\");\n\n  function render() {\n    const D = data.d, A = data.alert || {}, slow = data.slow_ms || 1500;\n    const sum = D.summary || {}, cur = D.current || {}, last = cur.last, ops = D.ops || {}, pay = D.pay || {}, bot = D.bot || {};\n    const dbPct = cur.db_bytes / (data.db_limit_mb * 1048576) * 100;\n    const stPct = cur.storage_bytes / (data.storage_limit_mb * 1048576) * 100;\n    const lastAge = last ? (Date.now() - new Date(last.at)) / 60000 : Infinity;\n    let status = A.status || (last ? \"ok\" : \"unk\");\n    if (lastAge > 15) status = last ? \"bad\" : \"unk\";\n    const st = STATUS[status];\n    $(\"statusBadge\").innerHTML = `<span class=\"dot\" style=\"background:var(${st.c})\"></span><span>${st.icon} ${st.t}${A.detail && status !== \"ok\" ? \" · \" + esc(A.detail) : \"\"}</span>`;\n    const label = hours === 24 ? \"24 giờ\" : hours === 168 ? \"7 ngày\" : \"30 ngày\";\n\n    // Tổng quan\n    $(\"tiles\").innerHTML = [\n      tile(\"Lần kiểm tra gần nhất\", last ? ago(last.at) : \"—\", last ? fmtTime(last.at) : \"Bot chưa ghi mẫu nào\", lastAge > 15 ? \"bad\" : \"ok\"),\n      tile(\"Uptime \" + label, sum.uptime_all != null ? sum.uptime_all.toLocaleString(\"vi-VN\") + \"%\" : \"—\", (sum.samples || 0) + \" lượt kiểm tra\", lvl(sum.uptime_all, 99.5, 98, false)),\n      tile(\"REST p50 / p95\", fmtN(sum.p50?.rest) + \" / \" + fmtN(sum.p95?.rest) + \" ms\", \"ngưỡng chậm \" + fmtN(slow) + \" ms\", lvl(sum.p95?.rest, slow, slow * 3)),\n      tile(\"Database\", dbPct.toFixed(1) + \"%\", fmtMB(cur.db_bytes) + \" / \" + data.db_limit_mb + \" MB\", lvl(dbPct, 70, 90)),\n      tile(\"Storage\", stPct.toFixed(1) + \"%\", fmtMB(cur.storage_bytes) + \" / \" + data.storage_limit_mb + \" MB\", lvl(stPct, 70, 90)),\n      tile(\"Doanh thu hôm nay\", fmtVND(ops.today?.revenue), fmtN(ops.today?.orders) + \" hoá đơn\"),\n      tile(\"Đơn đang mở\", fmtN(ops.active_now), ops.stale_now ? ops.stale_now + \" đơn từ hôm trước\" : \"không có đơn treo\", ops.stale_now ? \"warn\" : \"ok\"),\n      tile(\"CK chưa khớp, chưa xem\", fmtN(pay.unreviewed), \"giao dịch không mã đơn\", pay.unreviewed > 0 ? \"warn\" : \"ok\"),\n    ].join(\"\");\n\n    // Hệ thống\n    const sr = D.series || [];\n    const tl = sr.map((r) => { const t = new Date(r.t); return hours <= 24\n      ? t.toLocaleTimeString(\"vi-VN\", { ...tz, hour12: false, hour: \"2-digit\", minute: \"2-digit\" })\n      : t.toLocaleString(\"vi-VN\", { ...tz, hour12: false, day: \"2-digit\", month: \"2-digit\", hour: \"2-digit\" }) + \"h\"; });\n    $(\"latSub\").textContent = `ms · trung bình mỗi ${D.bucket_min >= 60 ? D.bucket_min / 60 + \" giờ\" : D.bucket_min + \" phút\"} · đường nét đứt là ngưỡng chậm (${fmtN(slow)} ms)`;\n    $(\"sysTiles\").innerHTML = [\n      [\"REST\", \"rest\"], [\"Auth\", \"auth\"], [\"Storage\", \"storage\"], [\"Trang order\", \"site\"],\n    ].map(([n, k]) => tile(n, fmtN(sum.p50?.[k]) + \" ms\", \"p95 \" + fmtN(sum.p95?.[k]) + \" ms · uptime \" + (sum.uptime?.[k] ?? \"—\") + \"%\",\n      lvl(sum.uptime?.[k], 99.5, 98, false) === \"ok\" ? lvl(sum.p95?.[k], k === \"site\" ? slow * 2 : slow, (k === \"site\" ? slow * 2 : slow) * 3) : lvl(sum.uptime?.[k], 99.5, 98, false))).join(\"\")\n      + tile(\"Kết nối DB\", last ? last.conns + \" / \" + last.conns_max : \"—\", \"đang mở\", last ? lvl(last.conns / last.conns_max * 100, 70, 90) : \"unk\")\n      + tile(\"Bộ nhớ đệm\", last?.cache_hit != null ? last.cache_hit + \"%\" : \"—\", \"tỉ lệ đọc từ cache\", last ? lvl(last.cache_hit, 95, 0, false) : \"unk\")\n      + tile(\"Khoá / truy vấn treo\", last ? (last.locks || 0) + \" / \" + (last.long_q || 0) : \"—\", \"chờ khoá / chạy > 5 phút\", last ? (last.locks >= 5 ? \"bad\" : (last.locks || last.long_q) ? \"warn\" : \"ok\") : \"unk\")\n      + tile(\"Deadlock \" + label, fmtN(sum.deadlocks || 0), \"\", sum.deadlocks ? \"warn\" : \"ok\");\n\n    const s = S();\n    draw(\"cLatency\", { data: { labels: tl, datasets: [\n      line(\"REST\", sr.map((r) => r.rest), s[0]), line(\"Auth\", sr.map((r) => r.auth), s[1]),\n      line(\"Storage\", sr.map((r) => r.storage), s[2]), line(\"Trang order\", sr.map((r) => r.site), s[3]),\n      ref(\"Ngưỡng chậm\", sr.map(() => slow)) ] },\n      options: { scales: axes({ tick: (v) => fmtN(v) + \" ms\" }) } }, \"Bot chưa ghi mẫu nào. Số liệu xuất hiện sau lần kiểm tra 5 phút đầu tiên.\");\n    draw(\"cUptime\", { data: { labels: tl, datasets: [ bar(\"Uptime\", sr.map((r) => r.up), s[0]) ] },\n      options: { scales: axes({ min: 0, max: 100, tick: (v) => v + \"%\" }) } });\n    draw(\"cConns\", { data: { labels: tl, datasets: [ line(\"Kết nối\", sr.map((r) => r.conns), s[0]), ref(\"Giới hạn\", sr.map((r) => r.conns_max)) ] },\n      options: { scales: axes() } });\n    draw(\"cTpm\", { data: { labels: tl, datasets: [ line(\"Commit / phút\", sr.map((r) => r.tpm), s[0]) ] }, options: { scales: axes() } });\n    draw(\"cActive\", { data: { labels: tl, datasets: [ line(\"Đơn đang mở\", sr.map((r) => r.active_orders), s[0], { stepped: true, tension: 0 }) ] }, options: { scales: axes() } });\n    const bk = cur.storage_by_bucket || [];\n    draw(\"cBuckets\", { data: { labels: bk.map((b) => b.bucket_id), datasets: [ bar(\"Dung lượng\", bk.map((b) => b.bytes / 1048576), s[0], { borderWidth: 0 }) ] },\n      options: { indexAxis: \"y\", scales: { x: { grid: { color: css(\"--grid\") }, ticks: { callback: (v) => fmtN(v) } }, y: { grid: { display: false } } },\n        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtMB(bk[c.dataIndex].bytes)} · ${bk[c.dataIndex].files} file` } } } } });\n    const tb = cur.top_tables || [];\n    draw(\"cTables\", { data: { labels: tb.map((t) => t.name), datasets: [ bar(\"Dung lượng\", tb.map((t) => t.bytes / 1048576), s[0], { borderWidth: 0 }) ] },\n      options: { indexAxis: \"y\", scales: { x: { grid: { color: css(\"--grid\") }, ticks: { callback: (v) => v.toFixed(1) } }, y: { grid: { display: false } } },\n        plugins: { tooltip: { callbacks: { label: (c) => ` ${fmtMB(tb[c.dataIndex].bytes)} · ${fmtN(tb[c.dataIndex].rows_)} dòng` } } } } });\n    const dg = cur.db_growth || [];\n    draw(\"cDbGrowth\", { data: { labels: dg.map((r) => dayLabel(r.d)), datasets: [ line(\"Database\", dg.map((r) => r.bytes / 1048576), s[0], { pointRadius: 3 }) ] },\n      options: { scales: axes({ zero: false, tick: (v) => v.toFixed(1) }) } }, \"Cần vài ngày số liệu để vẽ xu hướng.\");\n\n    // Vận hành\n    const hrs = Array.from({ length: 15 }, (_, i) => i + 7); // 7h–21h\n    const th = new Map((ops.today_hourly || []).map((r) => [r.h, r])), ph = new Map((ops.peak_hours || []).map((r) => [r.h, r]));\n    draw(\"cToday\", { data: { labels: hrs.map((h) => h + \"h\"), datasets: [\n      bar(\"Hôm nay\", hrs.map((h) => th.get(h)?.orders ?? 0), s[0]),\n      line(\"Trung bình 30 ngày\", hrs.map((h) => ph.get(h)?.avg_orders ?? 0), s[1], { borderDash: [], pointRadius: 2 }) ] },\n      options: { scales: axes(), plugins: { tooltip: { callbacks: { afterBody: (it) => { const r = th.get(hrs[it[0].dataIndex]); return r ? \"Doanh thu: \" + fmtVND(r.revenue) : \"\"; } } } } } });\n    const dd = fillDays(ops.daily || []), dl = dd.map((r) => dayLabel(r.d));\n    draw(\"cRevenue\", { data: { labels: dl, datasets: [\n      bar(\"Chuyển khoản\", dd.map((r) => r.transfer || 0), s[0]), bar(\"Tiền mặt\", dd.map((r) => r.cash || 0), s[1]) ] },\n      options: { scales: axes({ stacked: true, tick: fmtK }), plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtVND(c.raw)}`,\n        footer: (it) => \"Tổng: \" + fmtVND(dd[it[0].dataIndex].revenue || 0) + \" · \" + (dd[it[0].dataIndex].orders || 0) + \" hoá đơn\" } } } } });\n    draw(\"cDine\", { data: { labels: dl, datasets: [\n      bar(\"Tại quán\", dd.map((r) => r.tai_quan || 0), s[0]), bar(\"Mang về\", dd.map((r) => r.mang_ve || 0), s[1]), bar(\"Giao hàng\", dd.map((r) => r.giao_hang || 0), s[2]) ] },\n      options: { scales: axes({ stacked: true }) } });\n    const cap = (v) => v == null || v > 120 ? null : v; // bỏ số liệu lỗi (quên bấm xong món)\n    draw(\"cWait\", { data: { labels: dl, datasets: [\n      line(\"Khách chờ (đặt → ra món)\", dd.map((r) => cap(r.avg_wait)), s[0], { pointRadius: 2 }),\n      line(\"Bếp làm\", dd.map((r) => cap(r.bep_min)), s[1], { pointRadius: 2 }),\n      line(\"Pha chế làm\", dd.map((r) => cap(r.pha_che_min) || null), s[2], { pointRadius: 2 }) ] },\n      options: { scales: axes({ tick: (v) => v + \"′\" }), plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.raw} phút` } } } } });\n    const top = ops.top_items_7d || [];\n    draw(\"cTop\", { data: { labels: top.map((t) => t.name), datasets: [ bar(\"Số phần\", top.map((t) => t.qty), s[0], { borderWidth: 0 }) ] },\n      options: { indexAxis: \"y\", scales: { x: { grid: { color: css(\"--grid\") } }, y: { grid: { display: false } } },\n        plugins: { tooltip: { callbacks: { label: (c) => ` ${c.raw} phần · ${fmtVND(top[c.dataIndex].revenue)}` } } } } });\n\n    // Thanh toán\n    const m = pay.method_30d || {}, mt = (m.tien_mat || 0) + (m.chuyen_khoan || 0);\n    const pd = fillDays(pay.daily || []), dev = (pay.devices || [])[0];\n    const devAge = dev ? (Date.now() - new Date(dev.last_at)) / 3600000 : null;\n    $(\"payTiles\").innerHTML = [\n      tile(\"Chuyển khoản 30 ngày\", mt ? Math.round(m.chuyen_khoan / mt * 100) + \"%\" : \"—\", fmtVND(m.chuyen_khoan)),\n      tile(\"Tiền mặt 30 ngày\", mt ? Math.round(m.tien_mat / mt * 100) + \"%\" : \"—\", fmtVND(m.tien_mat)),\n      tile(\"CK không mã, chưa xem\", fmtN(pay.unreviewed), \"cần đối chiếu tay\", pay.unreviewed > 0 ? \"warn\" : \"ok\"),\n      tile(\"Máy đọc thông báo\", dev ? ago(dev.last_at) : \"—\", dev ? esc(dev.device) + \" · \" + dev.n + \" giao dịch\" : \"chưa có\", devAge == null ? \"unk\" : devAge > 24 ? \"warn\" : \"ok\"),\n    ].join(\"\");\n    draw(\"cPay\", { data: { labels: pd.map((r) => dayLabel(r.d)), datasets: [\n      bar(\"Đã khớp đơn\", pd.map((r) => r.da_khop || 0), s[0]), bar(\"Đơn đã thu trước\", pd.map((r) => r.don_da_thu || 0), s[1]), bar(\"Không mã đơn\", pd.map((r) => r.khong_ma || 0), s[2]) ] },\n      options: { scales: axes({ stacked: true }), plugins: { tooltip: { callbacks: { footer: (it) => { const r = pd[it[0].dataIndex];\n        return r.n ? `Tổng ${r.n} GD · ${fmtVND(r.amount)}` + (r.khong_ma_amount ? ` · không mã ${fmtVND(r.khong_ma_amount)}` : \"\") : \"\"; } } } } } });\n\n    // Bot\n    const cd = fillDays(bot.captures_daily || []), dr = fillDays(bot.drafts_daily || []), phd = fillDays(bot.photos_daily || []);\n    const capN = cd.reduce((a, r) => a + (r.n || 0), 0), capErr = cd.reduce((a, r) => a + (r.errors || 0), 0);\n    const capMs = cd.filter((r) => r.avg_ms).map((r) => r.avg_ms);\n    $(\"botTiles\").innerHTML = [\n      tile(\"Đơn bot 30 ngày\", fmtN(dr.reduce((a, r) => a + (r.n || 0), 0)), fmtN(dr.reduce((a, r) => a + (r.huy || 0), 0)) + \" đơn huỷ\"),\n      tile(\"Ảnh chờ xử lý\", fmtN(bot.pending_photos), \"ảnh bot chưa đọc xong\", bot.pending_photos > 0 ? \"warn\" : \"ok\"),\n      tile(\"OCR: thời gian đọc\", capMs.length ? (capMs.reduce((a, b) => a + b, 0) / capMs.length / 1000).toLocaleString(\"vi-VN\", { maximumFractionDigits: 1 }) + \" s\" : \"—\", \"trung bình mỗi ảnh\"),\n      tile(\"OCR: ảnh lỗi 30 ngày\", fmtN(capErr) + \" / \" + fmtN(capN), bot.last_error ? \"lỗi gần nhất \" + ago(bot.last_error.at) : \"\", capErr ? \"warn\" : \"ok\"),\n    ].join(\"\") + (bot.last_error ? `<details class=\"tile\" style=\"grid-column:1/-1\"><summary>Lỗi OCR gần nhất (${fmtTime(bot.last_error.at)})</summary><div class=\"small\" style=\"margin-top:6px;word-break:break-word\">${esc(bot.last_error.error)}</div></details>` : \"\");\n    draw(\"cDrafts\", { data: { labels: dr.map((r) => dayLabel(r.d)), datasets: [\n      bar(\"Đã duyệt\", dr.map((r) => r.da_duyet || 0), s[0]), bar(\"Huỷ\", dr.map((r) => r.huy || 0), s[1]), bar(\"Đang chờ\", dr.map((r) => r.cho || 0), s[2]) ] },\n      options: { scales: axes({ stacked: true }) } });\n    const ch = Object.entries(bot.drafts_by_channel || {}).sort((a, b) => b[1] - a[1]);\n    const chName = { ios: \"iPhone (chụp màn hình)\", zalo: \"Zalo\", telegram: \"Telegram\", fb: \"Facebook\", android: \"Android\" };\n    draw(\"cChannel\", { data: { labels: ch.map(([k]) => chName[k] || k), datasets: [ bar(\"Đơn\", ch.map(([, v]) => v), s[0], { borderWidth: 0 }) ] },\n      options: { indexAxis: \"y\", scales: { x: { grid: { color: css(\"--grid\") } }, y: { grid: { display: false } } } } });\n    draw(\"cPhotos\", { data: { labels: phd.map((r) => dayLabel(r.d)), datasets: [ bar(\"Ảnh\", phd.map((r) => r.n || 0), s[0]) ] }, options: { scales: axes() } });\n    draw(\"cCaptures\", { data: { labels: cd.map((r) => dayLabel(r.d)), datasets: [\n      bar(\"Đọc được\", cd.map((r) => (r.n || 0) - (r.errors || 0)), s[0]), bar(\"Lỗi\", cd.map((r) => r.errors || 0), s[1]) ] },\n      options: { scales: axes({ stacked: true }), plugins: { tooltip: { callbacks: { footer: (it) => { const r = cd[it[0].dataIndex]; return r.avg_ms ? \"Trung bình \" + (r.avg_ms / 1000).toFixed(1) + \" s/ảnh\" : \"\"; } } } } } });\n\n    renderCost(cur, s);\n\n    // Sự cố\n    const inc = D.incidents || [];\n    const why = (r) => { const p = [];\n      for (const [k, n] of [[\"rest\", \"REST\"], [\"auth\", \"Auth\"], [\"storage\", \"Storage\"], [\"site\", \"Trang order\"]]) {\n        if (r[k + \"_ok\"] === false) p.push(n + \" lỗi\"); else if (r[k + \"_ms\"] > (k === \"site\" ? slow * 2 : slow)) p.push(n + \" chậm \" + fmtN(r[k + \"_ms\"]) + \" ms\"); }\n      if (r.locks) p.push(r.locks + \" chờ khoá\"); if (r.long_q) p.push(r.long_q + \" truy vấn treo\"); return p.join(\", \"); };\n    const lvlOf = (r) => (r.rest_ok === false || r.auth_ok === false || r.storage_ok === false || r.site_ok === false || r.locks >= 5) ? \"bad\" : \"warn\";\n    $(\"incidents\").innerHTML = (A.status && A.status !== \"ok\"\n        ? `<p><b>Đang có cảnh báo</b> từ ${fmtTime(A.since)}: ${esc(A.detail || \"\")}${A.alerted ? \" · đã báo Telegram\" : \"\"}</p>` : \"\")\n      + (inc.length\n        ? `<table><thead><tr><th>Thời điểm</th><th>Mức</th><th>Chi tiết</th></tr></thead><tbody>${inc.map((r) => { const l = STATUS[lvlOf(r)];\n            return `<tr><td>${fmtTime(r.at)}</td><td><span class=\"st\" style=\"color:var(${l.c})\">${l.icon}</span> ${l.t}</td><td>${esc(why(r))}</td></tr>`; }).join(\"\")}</tbody></table>`\n        : `<p class=\"small\">Không có lần kiểm tra bất thường trong ${label}.</p>`);\n  }\n\n  // ---------- Chi phí & hạn mức ----------\n  function renderCost(cur, s) {\n    const C = data.cost, FREE = data.free || {}, src = data.cost_sources || {};\n    if (!C) {\n      $(\"costNote\").textContent = \"Chưa có số liệu chi phí\" + (data.cost_error ? \" (\" + data.cost_error + \")\" : \"\") + \". Chạy cập nhật 47 trên Supabase rồi tải lại.\";\n      $(\"costTiles\").innerHTML = \"\"; [\"quotaTable\", \"modelTable\", \"priceTable\"].forEach((id) => $(id).innerHTML = \"\");\n      [\"cAiCost\", \"cTokens\", \"cAiCalls\", \"cByModel\", \"cCfReq\", \"cEgress\", \"cSbReq\"].forEach((id) => draw(id, { data: { datasets: [] } }));\n      return;\n    }\n    const st = C.settings || {}, rate = Number(st.usd_vnd || 26100), ai = C.ai || {};\n    const vnd = (usd) => usd == null ? null : Number(usd) * rate;\n    const day = Math.max(1, C.day_of_month || 1), dim = C.days_in_month || 30;\n    const mtdReal = vnd(ai.mtd?.real_usd || 0), mtdList = vnd(ai.mtd?.list_usd || 0);\n    const projReal = mtdReal / day * dim, projList = mtdList / day * dim;\n    const budget = Number(st.budget_vnd_month || 0);\n    const fixed = (st.fixed_costs || []).reduce((a, f) => a + (Number(f.vnd_thang) || 0) + (Number(f.vnd_nam) || 0) / 12, 0);\n    const orders = ai.online_orders_mtd || 0;\n    const errs = ai.errors_today || {}, e429 = Number(errs[\"429\"] || 0);\n    const unpriced = (ai.by_model || []).filter((m) => m.unpriced).map((m) => m.model);\n    const notes = [];\n    notes.push(`Gemini: ${st.gemini_paid ? \"gói trả tiền\" : \"gói miễn phí (chi phí thật = 0, cột \\\"nếu trả tiền\\\" để biết khi bật thanh toán)\"} · Claude: ${st.claude_paid ? \"trả tiền\" : \"miễn phí\"} · tỷ giá ${fmtN(rate)}đ/USD.`);\n    if (!src.cloudflare) notes.push(\"Chưa cài CF_API_TOKEN / CF_ACCOUNT_ID nên chưa có số liệu Cloudflare.\");\n    if (!src.supabase_logs) notes.push(\"Chưa cài SUPABASE_PAT nên chưa có egress / lượt gọi Supabase.\");\n    if (unpriced.length) notes.push(\"Model chưa có giá: \" + unpriced.join(\", \") + \" (thêm vào bảng ai_prices).\");\n    $(\"costNote\").textContent = notes.join(\" \");\n    $(\"costSub\").textContent = `đồng · cột: số tiền thật phải trả · nét đứt: nếu tính theo giá trả tiền · tỷ giá ${fmtN(rate)}đ/USD`;\n\n    const month = C.cloud?.month || {};\n    const egU = month[\"supabase:egress_uncached_bytes\"], egC = month[\"supabase:egress_cached_bytes\"];\n    const egLim = FREE[\"supabase:egress_uncached_bytes\"]?.limit || 5368709120;\n    $(\"costTiles\").innerHTML = [\n      tile(\"AI hôm nay\", fmtSmallVND(vnd(ai.today?.real_usd || 0)), (ai.today?.calls || 0) + \" lượt · nếu trả tiền \" + fmtSmallVND(vnd(ai.today?.list_usd || 0))),\n      tile(\"AI tháng này\", fmtSmallVND(mtdReal), budget ? \"ngân sách \" + fmtVND(budget) + \" · \" + Math.round(mtdReal / budget * 100) + \"%\" : \"chưa đặt ngân sách\",\n        budget ? lvl(mtdReal / budget * 100, 70, 100) : null),\n      tile(\"Dự báo cả tháng\", fmtSmallVND(projReal), \"nếu trả tiền \" + fmtSmallVND(projList), budget ? lvl(projReal / budget * 100, 80, 100) : null),\n      tile(\"AI mỗi đơn online\", orders ? fmtSmallVND(mtdList / orders) : \"—\", orders + \" đơn bot tháng này · theo giá trả tiền\"),\n      tile(\"Token tháng này\", fmtTok(ai.mtd?.in || 0) + \" / \" + fmtTok((ai.mtd?.out || 0) + (ai.mtd?.think || 0)), \"vào / ra · cache \" + fmtTok(ai.mtd?.cached || 0)),\n      tile(\"Lỗi AI hôm nay\", fmtN(ai.today?.errors || 0), e429 ? e429 + \" lần bị từ chối vì hết hạn mức (429)\" : \"không bị chặn hạn mức\", e429 >= 5 ? \"bad\" : (ai.today?.errors ? \"warn\" : \"ok\")),\n      tile(\"Egress Supabase tháng\", egU != null ? fmtBytes(egU) : \"—\", egC != null ? \"qua cache \" + fmtBytes(egC) + \" · mỗi loại 5 GB\" : \"cần SUPABASE_PAT\",\n        egU != null ? lvl(Math.max(egU, egC || 0) / egLim * 100, 70, 90) : \"unk\"),\n      tile(\"Chi phí cố định\", fmtVND(fixed), (st.fixed_costs || []).length ? (st.fixed_costs || []).map((f) => esc(f.ten)).join(\", \") : \"chưa khai báo (tên miền…)\"),\n      tile(\"Tổng ước tính tháng\", fmtSmallVND(projReal + fixed), \"AI dự báo + cố định · cloud gói Free\"),\n    ].join(\"\");\n\n    // Chi phí AI mỗi ngày\n    const daily = ai.daily || [];\n    const byDay = (prov, f) => { const m = new Map(); for (const r of daily) if (!prov || r.provider === prov) m.set(r.d, (m.get(r.d) || 0) + Number(f(r) || 0)); return m; };\n    const days = fillDays([], C.days || 30).map((r) => r.d), dl = days.map(dayLabel);\n    const provs = [...new Set(daily.map((r) => r.provider))];\n    const pName = { gemini: \"Gemini\", claude: \"Claude\" };\n    const listAll = byDay(null, (r) => r.list_usd);\n    draw(\"cAiCost\", { data: { labels: dl, datasets: [\n      ...provs.map((p, i) => { const m = byDay(p, (r) => r.real_usd); return bar(pName[p] || p, days.map((d) => vnd(m.get(d) || 0)), s[i]); }),\n      line(\"Nếu trả tiền\", days.map((d) => vnd(listAll.get(d) || 0)), css(\"--muted\"), { borderDash: [5, 4], borderWidth: 1.5, pointRadius: 2 }) ] },\n      options: { scales: axes({ stacked: true, tick: (v) => fmtSmallVND(v) }), plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtSmallVND(c.raw)}`,\n        footer: (it) => { const d = days[it[0].dataIndex]; const n = byDay(null, (r) => r.calls).get(d) || 0; return n + \" lượt gọi\"; } } } } } },\n      \"Chưa có lượt gọi AI nào được ghi. Số liệu xuất hiện sau khi cập nhật bot-don / chup-chat và có đơn mới.\");\n    const tin = byDay(null, (r) => r.in_tok), tout = byDay(null, (r) => r.out_tok);\n    draw(\"cTokens\", { data: { labels: dl, datasets: [\n      bar(\"Vào\", days.map((d) => (tin.get(d) || 0) / 1000), s[0]), bar(\"Ra\", days.map((d) => (tout.get(d) || 0) / 1000), s[1]) ] },\n      options: { scales: axes({ stacked: true, tick: (v) => fmtN(v) + \"k\" }), plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtTok(c.raw * 1000)} token` } } } } });\n    const calls = byDay(null, (r) => r.calls), errsD = byDay(null, (r) => r.errors);\n    draw(\"cAiCalls\", { data: { labels: dl, datasets: [\n      bar(\"Thành công\", days.map((d) => (calls.get(d) || 0) - (errsD.get(d) || 0)), s[0]), bar(\"Lỗi\", days.map((d) => errsD.get(d) || 0), s[7]) ] },\n      options: { scales: axes({ stacked: true }) } });\n    const bm = (ai.by_model || []).filter((m) => m.list_usd != null);\n    draw(\"cByModel\", { data: { labels: bm.map((m) => m.model), datasets: [ bar(\"Chi phí\", bm.map((m) => vnd(m.list_usd)), s[0], { borderWidth: 0 }) ] },\n      options: { indexAxis: \"y\", scales: { x: { grid: { color: css(\"--grid\") }, ticks: { callback: (v) => fmtSmallVND(v) } }, y: { grid: { display: false } } },\n        plugins: { tooltip: { callbacks: { label: (c) => { const m = bm[c.dataIndex]; return ` ${fmtSmallVND(c.raw)} · ${m.calls} lượt · ${fmtSmallVND(vnd(m.usd_per_call))}/lượt`; } } } } } });\n\n    // Cloud theo ngày (ngày UTC)\n    const cl = C.cloud?.daily || [];\n    const cdays = fillDays([], C.days || 30).map((r) => r.d), cdl = cdays.map(dayLabel);\n    const metric = (svc, mt) => { const mp = new Map(cl.filter((r) => r.service === svc && r.metric === mt).map((r) => [r.d, Number(r.value)])); return cdays.map((d) => mp.has(d) ? mp.get(d) : null); };\n    draw(\"cCfReq\", { data: { labels: cdl, datasets: [\n      bar(\"Lượt gọi Workers\", metric(\"cloudflare\", \"workers_requests\"), s[0]), line(\"KV đọc\", metric(\"cloudflare\", \"kv_read\"), s[1], { pointRadius: 2 }),\n      line(\"KV ghi\", metric(\"cloudflare\", \"kv_write\"), s[2], { pointRadius: 2 }) ] }, options: { scales: axes() } },\n      src.cloudflare ? \"Chưa có số liệu. Bot thu mỗi giờ (hoặc bấm ↻ sau khi gọi POST /api/cost).\" : \"Cài CF_API_TOKEN và CF_ACCOUNT_ID để đo.\");\n    draw(\"cEgress\", { data: { labels: cdl, datasets: [\n      bar(\"Không cache\", metric(\"supabase\", \"egress_uncached_bytes\").map((v) => v == null ? null : v / 1048576), s[0]),\n      bar(\"Qua cache\", metric(\"supabase\", \"egress_cached_bytes\").map((v) => v == null ? null : v / 1048576), s[1]) ] },\n      options: { scales: axes({ stacked: true, tick: (v) => fmtN(v) }), plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtMB(c.raw * 1048576)}` } } } } },\n      src.supabase_logs ? \"Chưa có số liệu. Bot thu mỗi giờ.\" : \"Cài SUPABASE_PAT để đo egress.\");\n    draw(\"cSbReq\", { data: { labels: cdl, datasets: [\n      bar(\"REST\", metric(\"supabase\", \"req_rest\"), s[0]), bar(\"Storage\", metric(\"supabase\", \"req_storage\"), s[1]),\n      bar(\"Auth\", metric(\"supabase\", \"req_auth\"), s[2]), bar(\"Realtime\", metric(\"supabase\", \"req_realtime\"), s[3]),\n      line(\"Edge Function\", metric(\"supabase\", \"function_invocations\"), s[4], { pointRadius: 2 }) ] }, options: { scales: axes({ stacked: true }) } },\n      src.supabase_logs ? \"Chưa có số liệu. Bot thu mỗi giờ.\" : \"Cài SUPABASE_PAT để đo.\");\n\n    // Bảng hạn mức\n    const latest = C.cloud?.latest || [];\n    const sbNow = C.supabase_now || {};\n    const rows = [];\n    for (const [k, f] of Object.entries(FREE)) {\n      const [svc, mt] = k.split(\":\");\n      let used = null, when = \"\";\n      if (f.period === \"day\") { const r = latest.find((x) => x.service === svc && x.metric === mt); if (r) { used = Number(r.value); when = dayLabel(r.d) + \" (UTC)\"; } }\n      else if (month[k] != null) { used = Number(month[k]); when = \"tháng này\"; }\n      rows.push({ name: f.name, used, limit: f.limit, bytes: f.bytes, when });\n    }\n    rows.push({ name: \"Supabase: dung lượng database\", used: sbNow.db_bytes, limit: (data.db_limit_mb || 500) * 1048576, bytes: true, when: \"hiện tại\" });\n    rows.push({ name: \"Supabase: dung lượng Storage\", used: sbNow.storage_bytes, limit: (data.storage_limit_mb || 1024) * 1048576, bytes: true, when: \"hiện tại\" });\n    rows.push({ name: \"Supabase: người dùng hoạt động (MAU)\", used: sbNow.mau, limit: 50000, when: \"tháng này\" });\n    for (const m of ai.today_by_model || []) if (m.rpd_limit) rows.push({ name: \"Gemini miễn phí: \" + m.model, used: m.calls, limit: m.rpd_limit, when: \"hôm nay (giờ VN)\" });\n    const pct = Number(st.alert_quota_pct || 80);\n    $(\"quotaTable\").innerHTML = `<table><thead><tr><th>Hạn mức</th><th class=\"r\">Đã dùng</th><th class=\"r\">Giới hạn</th><th style=\"width:28%\">Mức dùng</th><th>Kỳ</th></tr></thead><tbody>${rows.map((r) => {\n      const p = r.used == null ? null : r.used / r.limit * 100, l = p == null ? \"unk\" : lvl(p, pct, 95);\n      const fmt = (v) => r.bytes ? fmtBytes(v) : fmtN(v);\n      return `<tr><td>${esc(r.name)}</td><td class=\"r\">${r.used == null ? \"—\" : fmt(r.used)}</td><td class=\"r\">${fmt(r.limit)}</td>\n        <td>${p == null ? '<span class=\"small\">chưa đo</span>' : `<div class=\"st\" style=\"width:100%\"><div class=\"meter\" style=\"flex:1\"><span style=\"width:${Math.min(100, Math.max(p, 0.5)).toFixed(1)}%;background:var(${STATUS[l].c})\"></span></div><span>${p < 1 ? p.toFixed(2) : p.toFixed(0)}%</span></div>`}</td>\n        <td class=\"small\">${esc(r.when)}</td></tr>`; }).join(\"\")}</tbody></table>\n      <p class=\"small\">Egress ước tính từ nhật ký API: chỉ cộng các phản hồi có ghi độ dài nên con số có thể thấp hơn thực tế. Số chính xác xem ở Supabase → Organization → Usage.</p>`;\n\n    // Bảng model\n    const bmAll = ai.by_model || [];\n    $(\"modelTable\").innerHTML = bmAll.length ? `<table><thead><tr><th>Model</th><th class=\"r\">Lượt</th><th class=\"r\">Lỗi</th><th class=\"r\">Token vào</th><th class=\"r\">Cache</th><th class=\"r\">Token ra</th><th class=\"r\">Suy nghĩ</th><th class=\"r\">TB thời gian</th><th class=\"r\">Mỗi lượt</th><th class=\"r\">Nếu trả tiền</th><th class=\"r\">Thật</th></tr></thead><tbody>${bmAll.map((m) =>\n      `<tr><td>${esc(m.model)}${m.unpriced ? ' <span class=\"small\">(chưa có giá)</span>' : \"\"}</td><td class=\"r\">${fmtN(m.calls)}</td><td class=\"r\">${fmtN(m.errors)}</td><td class=\"r\">${fmtTok(m.in_tok)}</td><td class=\"r\">${fmtTok(m.cached)}</td><td class=\"r\">${fmtTok(m.out_tok)}</td><td class=\"r\">${fmtTok(m.think)}</td>\n       <td class=\"r\">${m.avg_ms ? (m.avg_ms / 1000).toFixed(1) + \" s\" : \"—\"}</td><td class=\"r\">${fmtSmallVND(vnd(m.usd_per_call))}</td><td class=\"r\">${fmtSmallVND(vnd(m.list_usd))}</td><td class=\"r\">${fmtSmallVND(vnd(m.real_usd))}</td></tr>`).join(\"\")}</tbody></table>`\n      + ((ai.by_source || []).length ? `<p class=\"small\">Theo nguồn: ${(ai.by_source || []).map((x) => esc(x.source) + \" \" + fmtN(x.calls) + \" lượt (\" + fmtSmallVND(vnd(x.list_usd)) + \")\").join(\" · \")}</p>` : \"\")\n      : '<p class=\"small\">Chưa có lượt gọi AI nào trong 30 ngày.</p>';\n    $(\"priceTable\").innerHTML = `<table><thead><tr><th>Model</th><th>Từ ngày</th><th class=\"r\">Vào</th><th class=\"r\">Cache</th><th class=\"r\">Ra</th><th>Ghi chú</th></tr></thead><tbody>${(C.prices || []).map((p) =>\n      `<tr><td>${esc(p.model)}</td><td>${esc(p.valid_from)}</td><td class=\"r\">$${p.in_usd}</td><td class=\"r\">${p.cached_usd == null ? \"= vào\" : \"$\" + p.cached_usd}</td><td class=\"r\">$${p.out_usd}</td><td class=\"small\">${esc(p.note || \"\")}</td></tr>`).join(\"\")}</tbody></table>`;\n  }\n\n  function esc(s) { return String(s ?? \"\").replace(/[&<>\"']/g, (c) => ({ \"&\": \"&amp;\", \"<\": \"&lt;\", \">\": \"&gt;\", '\"': \"&quot;\", \"'\": \"&#39;\" }[c])); }\n\n  // ---------- Đăng nhập / điều khiển ----------\n  function start() { $(\"login\").hidden = true; $(\"app\").hidden = false; applyDefaults(); load(); clearInterval(timer); timer = setInterval(load, 60000); }\n  function logout(msg) { localStorage.removeItem(LS); key = \"\"; clearInterval(timer); $(\"app\").hidden = true; $(\"login\").hidden = false; $(\"loginErr\").textContent = msg || \"\"; }\n  $(\"loginForm\").addEventListener(\"submit\", (e) => { e.preventDefault(); key = $(\"keyInput\").value.trim(); localStorage.setItem(LS, key); start(); });\n  $(\"logoutBtn\").addEventListener(\"click\", () => logout());\n  $(\"refreshBtn\").addEventListener(\"click\", load);\n  document.querySelectorAll(\".seg button\").forEach((b) => b.addEventListener(\"click\", () => {\n    document.querySelectorAll(\".seg button\").forEach((x) => x.setAttribute(\"aria-pressed\", x === b));\n    hours = Number(b.dataset.h); load(); }));\n  matchMedia(\"(prefers-color-scheme: dark)\").addEventListener(\"change\", () => { applyDefaults(); if (data) render(); });\n  if (key) start(); else logout();\n})();\n</script>\n</body>\n</html>\n";

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

  const alert = await updateAlert(env, level, detail);
  return { level, detail, p, saved: !!sample, alert };
}

async function updateAlert(env, level, detail) {
  const kv = env.ALERT_KV;
  const now = Date.now();
  let st = null;
  try { st = kv ? await kv.get("alert", "json") : null; } catch {}
  st = st || { status: "ok", streak: 0, since: now, alerted: false };

  if (level === "ok") {
    if (st.alerted) {
      const mins = Math.max(1, Math.round((now - st.since) / 60000));
      await sendTelegram(env, [
        `✅ POS BÉ NỐC ĐÃ HỒI PHỤC`,
        `Sự cố kéo dài khoảng ${mins} phút (từ ${fmtTime(st.since)}).`,
        st.detail ? `Lỗi trước đó: ${st.detail}` : "",
        dashLink(env),
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
  };

  if (streak >= need && (!st.alerted || escalate || remind)) {
    const mins = Math.max(1, Math.round((now - next.since) / 60000));
    await sendTelegram(env, [
      level === "bad" ? `🔴 POS BÉ NỐC ĐANG GẶP SỰ CỐ` : `🟡 POS BÉ NỐC ĐANG CHẬM`,
      `${remind && !escalate ? "Vẫn chưa hết — " : ""}khoảng ${mins} phút (từ ${fmtTime(next.since)}).`,
      `Chi tiết: ${detail}`,
      level === "bad" ? `Nếu kéo dài: chuẩn bị order giấy dự phòng, xem status.supabase.com.` : "",
      dashLink(env),
    ].filter(Boolean).join("\n"));
    next.alerted = true;
    next.alertLevel = level === "bad" || st.alertLevel === "bad" ? "bad" : "warn";
    next.lastAlert = now;
  }
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
  const [r, cost] = await Promise.all([
    timed(`${sb}/rest/v1/rpc/monitor_dashboard`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ p_hours: Math.min(Math.max(hours || 24, 1), 840) }),
    }),
    getCost(env, days),
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
