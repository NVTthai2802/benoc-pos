/* Bước 4 — PWA: cài lên màn hình chính, chạy được khi mạng chập chờn, báo khi có bản mới.
   Không tự tải lại trang (màn bếp đang nối máy in Bluetooth): chỉ hiện nút để người dùng bấm. */
/* global __BUILD__ */
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
const DEV = import.meta.env && import.meta.env.DEV;

function showUpdate(onClick) {
  if (document.getElementById('bnUpdate')) return;
  const b = document.createElement('button');
  b.id = 'bnUpdate'; b.type = 'button';
  b.textContent = 'Có bản mới · bấm để tải lại';
  b.style.cssText = 'position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:99999;' +
    'background:#3B2A24;color:#FFF8EC;border:0;border-radius:999px;padding:12px 18px;font:600 15px/1.2 "Be Vietnam Pro",system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)';
  b.onclick = onClick;
  const mount = () => document.body.appendChild(b);
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
}

let reloading = false;
function reloadNow(reg) {
  if (reg && reg.waiting) {
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    reg.waiting.postMessage('SKIP_WAITING');
    setTimeout(() => location.reload(), 1500);
  } else location.reload();
}

/* So mã bản build của trang đang mở với bản trên máy chủ: khác nhau là đã có bản mới */
async function checkVersion(reg) {
  try {
    const r = await fetch('/version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const { v } = await r.json();
    if (v && v !== BUILD) { if (reg) reg.update().catch(() => {}); showUpdate(() => reloadNow(reg)); }
  } catch (e) { /* mất mạng: thử lại lần sau */ }
}

if (!DEV && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', async () => {
    let reg = null;
    try { reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' }); } catch (e) { /* trình duyệt không cho: trang vẫn chạy bình thường */ }
    checkVersion(reg);
    setInterval(() => checkVersion(reg), 5 * 60e3);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(reg); });
  });
}
