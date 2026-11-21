/* Service worker Bé Nốc POS (Bước 4 — PWA). Bản build: __BUILD__
   - Trang HTML: lấy mạng trước (tối đa 4 giây), mất mạng thì dùng bản đã lưu.
   - /assets/* (JS có mã băm): lưu vĩnh viễn, có rồi thì không tải lại.
   - Ảnh, âm thanh, CSS, icon: dùng bản đã lưu ngay, tải bản mới ở nền.
   - Không đụng tới Supabase, /api/* và mọi địa chỉ khác (đơn, tiền luôn đi thẳng máy chủ). */
const BUILD = '__BUILD__';
const PAGES = 'benoc-pages-' + BUILD, STATIC = 'benoc-static-v1', ASSETS = 'benoc-assets-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(STATIC).then(c => c.addAll(['/sound/tinh-tinh.mp3', '/theme.css', '/staff.css', '/kitchen.css'])).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('benoc-pages-') && k !== PAGES) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/version.json' || url.pathname === '/sw.js' || url.pathname.endsWith('.apk')) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(PAGES);
      try {
        const res = await timeout(fetch(req), 4000);
        if (res.ok) cache.put(url.pathname, res.clone());
        return res;
      } catch (err) {
        return (await cache.match(url.pathname)) || (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.open(ASSETS).then(async c => (await c.match(req)) || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; })));
    return;
  }
  if (/^\/(img|sound|icons)\/|\.css$|\.webmanifest$/.test(url.pathname)) {
    e.respondWith(caches.open(STATIC).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
