/* =====================================================================
   BÉ NỐC POS — lớp dữ liệu và tiện ích dùng chung cho cả 3 trang
   (index.html: khách gọi món, bep.html: màn hình bếp, quanly.html: quản lý)

   Hai chế độ:
   - Có SUPABASE_URL + SUPABASE_ANON_KEY trong config.js → dùng Supabase thật.
   - Để trống → chế độ xem thử: dữ liệu lưu trong localStorage của trình duyệt.
   Cả hai chế độ có cùng các hàm trong BN.api, trả về dữ liệu cùng hình dạng.
   ===================================================================== */
(function () {
'use strict';

const CONFIG = Object.assign({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '', POLL_SECONDS: 15, LOGIN_DOMAIN: 'benoc.app', STORE_PREFIX: 'benoc.' }, window.BENOC_CONFIG || {});
const SP = CONFIG.STORE_PREFIX; // tiền tố localStorage, khác nhau giữa product và test
const DEMO = !(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
/* Tính năng đang thử: chỉ bật ở môi trường TEST và bản xem thử. Bật cho quán thật: đổi thành true. */
const ON_TEST = DEMO || window.BENOC_ENV === 'test';
const FEATURES = Object.assign({ print: true, vietqr: ON_TEST, report: ON_TEST }, CONFIG.FEATURES || {});
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

/* =====================================================================
   TIỆN ÍCH
   ===================================================================== */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const K = n => (n % 1000 === 0 ? n / 1000 : (n / 1000).toFixed(1).replace('.', ',')) + 'K';
const vnd = n => Math.round(Number(n) || 0).toLocaleString('vi-VN') + 'đ';
const wait = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');
const hhmm = d => { const x = new Date(d); return pad(x.getHours()) + ':' + pad(x.getMinutes()); };
const ddmm = d => { const x = new Date(d); return pad(x.getDate()) + '/' + pad(x.getMonth() + 1); };
const ddmmyyyy = d => { const x = new Date(d); return ddmm(x) + '/' + x.getFullYear(); };
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dur = m => { m = Math.max(0, Math.round(m || 0)); const h = Math.floor(m / 60), r = m % 60; return h ? h + ' giờ' + (r ? ' ' + r + ' phút' : '') : r + ' phút'; };
const ago = d => { const m = Math.floor((Date.now() - new Date(d)) / 60000); return m < 1 ? 'vừa xong' : m < 60 ? m + ' phút trước' : dur(m) + ' trước'; };
const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
const toLocalInput = d => { const x = new Date(d); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()) + 'T' + pad(x.getHours()) + ':' + pad(x.getMinutes()); };
const phoneToEmail = p => String(p).replace(/\D/g, '') + '@' + CONFIG.LOGIN_DOMAIN;
const DRINK_CATS = /trà|cà phê|matcha|nước|món nên thử|khoai môn tươi|sữa/i;
/* Đơn mang về: không có số thẻ, hiện ô "MANG VỀ" có hình túi thay cho số */
const ICON_BAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>';
const ICON_SCOOTER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8.5 17h7M15 17l-2-7h-3M13 10h3l2.5 7M4 12h5"/></svg>';
const isDelivery = o => !!o && (o.dine_type === 'giao_hang' || o.dine === 'giao_hang');
const isTakeaway = o => !!o && (o.dine_type === 'mang_ve' || o.dine === 'mang_ve' || isDelivery(o)); // đơn không có số thẻ
const isPickup = o => !!o && !!o.pickup && !isDelivery(o); // khách đến lấy (quán tạo đơn bằng nút Qua lấy)
/* Ăn tại quán đặt trước qua Facebook: chưa có số bàn, có giờ hẹn */
const isBooked = o => !!o && (o.dine_type || o.dine) === 'tai_quan' && (o.queue_number == null && o.queue == null);
const whenText = o => o.deliver_at ? hhmm(o.deliver_at) : '';
const qboxHtml = (o, extra) => isDelivery(o)
  ? '<div class="qbox qbox--mv qbox--giao' + (extra ? ' ' + extra : '') + '">' + ICON_SCOOTER + '<span>' + (o.deliver_at ? 'Giao ' + hhmm(o.deliver_at) : 'Giao hàng') + '</span></div>'
  : isTakeaway(o)
  ? '<div class="qbox qbox--mv' + (extra ? ' ' + extra : '') + '">' + ICON_BAG + '<span>' + (isPickup(o) ? 'Đến lấy' + (o.deliver_at ? ' ' + hhmm(o.deliver_at) : '') : 'Mang về') + '</span></div>'
  : isBooked(o)
  ? '<div class="qbox qbox--book' + (extra ? ' ' + extra : '') + '"><span>Đặt bàn</span><b class="num">' + (o.deliver_at ? hhmm(o.deliver_at) : '?') + '</b></div>'
  : '<div class="qbox' + (extra ? ' ' + extra : '') + '"><span>Bàn</span><b class="num">' + esc(o.queue_number != null ? o.queue_number : o.queue) + '</b></div>';
/* "số 12" hoặc "mang về của Lan" — dùng trong thông báo */
const orderLabel = o => isDelivery(o) ? 'giao hàng cho ' + (o.customer_name || o.name || '') : isBooked(o) ? 'đặt bàn của ' + (o.customer_name || o.name || '') : isTakeaway(o) ? (isPickup(o) ? 'đến lấy của ' : 'mang về của ') + (o.customer_name || o.name || '') : 'số ' + (o.queue_number != null ? o.queue_number : o.queue);

const store = {
  get(k, d) { try { const v = localStorage.getItem(SP + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(SP + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(SP + k); } catch (e) { /* bỏ qua */ } }
};

function fail(code, hint) { const e = new Error(code); e.code = code; e.hint = hint; throw e; }

const ERR = {
  MISSING_QUEUE_NUMBER: 'Bạn chưa nhập số thứ tự. Lấy thẻ số ở quầy bếp, rồi nhập số ghi trên thẻ.',
  MISSING_NAME: 'Bạn chưa nhập tên. Quán cần tên để gọi bạn khi có việc.',
  EMPTY_ORDER: 'Giỏ đang trống. Chọn ít nhất một món nhé.',
  ITEM_UNAVAILABLE: 'Có món vừa hết. Menu đã được cập nhật, bạn xem lại giỏ nhé.',
  MISSING_ADDRESS: 'Chưa nhập địa chỉ giao hàng.',
  ORDER_WOULD_BE_EMPTY: 'Đơn chỉ còn món này. Muốn bỏ hết thì huỷ đơn.',
  ITEM_NOT_FOUND: 'Món này không còn trong đơn. Tải lại màn hình.',
  ORDER_NOT_FOUND: 'Không tìm thấy đơn. Có thể đơn đã được thanh toán.',
  FORBIDDEN: 'Tài khoản này không có quyền làm việc này.',
  LOGIN_FAILED: 'Sai số điện thoại hoặc mật khẩu.',
  OWNER_EXISTS: 'Quán đã có tài khoản chủ. Hãy đăng nhập.',
  PHONE_TAKEN: 'Số điện thoại này đã có tài khoản.',
  CONFIRM_EMAIL_ON: 'Supabase đang bật xác nhận email. Vào Authentication > Providers > Email, tắt "Confirm email" rồi thử lại.',
  WEAK_PASSWORD: 'Mật khẩu cần ít nhất 6 ký tự.',
  ALREADY_CHECKED_IN: 'Bạn đang có ca chưa kết thúc.',
  NOT_CHECKED_IN: 'Bạn chưa vào ca.',
  NOT_EMPLOYEE: 'Tài khoản này chưa được gắn với nhân viên nào.',
  BAD_QTY: 'Số lượng phải lớn hơn 0.',
  BAD_TIME: 'Giờ ra phải sau giờ vào.',
  NOT_SIGNED_IN: 'Bạn chưa đăng nhập.',
  PROMO_ENDED: 'Ưu đãi này vừa hết giờ. Giỏ đã được cập nhật, bạn xem lại nhé.',
  PROMO_INVALID: 'Ưu đãi chưa chọn đủ món. Mở lại ưu đãi để chọn.',
  PROMO_OPTION: 'Món trong ưu đãi không chọn được tuỳ chọn có phí.',
  DELIVERY_LOCKED: 'Đơn giao hàng không đổi sang ăn tại quán / mang về ở đây.',
  BAD_KIND: 'Thao tác kho không hợp lệ.',
  BAD_DINE: 'Chọn ăn tại quán hoặc mang về.',
  PROMO_LOCKED: 'Món thuộc ưu đãi không đổi được số lượng. Muốn bớt thì bỏ cả phần ưu đãi rồi thêm lại.'
};
const errText = e => ERR[e && e.code] || (e && e.hint) || (e && e.code && !/^[A-Z_]+$/.test(e.code) ? e.code : '') || 'Không thực hiện được. Kiểm tra mạng rồi thử lại.';

/* Thu nhỏ ảnh trước khi tải lên: điện thoại chụp 3–5MB, thu còn ~50–120KB */
async function toJpeg(file, max, quality) {
  max = max || 800; quality = quality || 0.82;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Không đọc được ảnh')); i.src = url; });
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
  } finally { URL.revokeObjectURL(url); }
}
const blobToDataUrl = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

/* Cách tính lương khi kết thúc ca — giống hàm apply_rounding trong SQL */
/* Làm tròn tiền tới bội số gần nhất — giống hàm round_money trong SQL */
function roundMoney(n, step) { step = Math.max(1, Number(step) || 1); return Math.round(n / step) * step; }
function applyRounding(m, step, mode) {
  const x = m / step;
  return (mode === 'up' ? Math.ceil(x) : mode === 'down' ? Math.floor(x) : Math.round(x)) * step;
}

/* =====================================================================
   GIAO DIỆN DÙNG CHUNG: bảng trượt + thông báo nhanh
   ===================================================================== */
const ui = {
  _ready: false, _last: null,
  init() {
    if (this._ready) return; this._ready = true;
    const ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'bnOverlay'; ov.hidden = true;
    ov.innerHTML = '<div class="sheet" id="bnSheet" role="dialog" aria-modal="true" tabindex="-1"></div>';
    const t = document.createElement('div'); t.className = 'toast'; t.id = 'bnToast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
    document.body.appendChild(ov); document.body.appendChild(t);
    ov.addEventListener('click', e => { if (e.target === ov) ui.close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ov.hidden) ui.close(); });
  },
  /* Mỗi lần mở tạo bảng mới để không giữ lại trình xử lý sự kiện của lần trước */
  sheet(html, mount, opts) {
    this.init(); this._last = document.activeElement;
    const old = document.getElementById('bnSheet'); const sh = old.cloneNode(false);
    sh.className = 'sheet' + (opts && opts.wide ? ' sheet--wide' : '');
    old.replaceWith(sh); sh.innerHTML = html;
    document.getElementById('bnOverlay').hidden = false; document.body.classList.add('locked');
    sh.addEventListener('click', e => { if (e.target.closest('[data-close]')) ui.close(); });
    if (mount) mount(sh);
    sh.focus({ preventScroll: true });
    return sh;
  },
  close() {
    const ov = document.getElementById('bnOverlay'); if (!ov) return;
    ov.hidden = true; document.body.classList.remove('locked');
    if (this._last && this._last.focus) this._last.focus({ preventScroll: true });
  },
  isOpen() { const ov = document.getElementById('bnOverlay'); return ov && !ov.hidden; },
  toast(msg) {
    this.init(); const el = document.getElementById('bnToast'); el.textContent = msg; el.classList.add('on');
    clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove('on'), 2400);
  },
  head(title, sub) {
    return '<div class="sh-head"><div class="sh-title"><h3>' + title + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' +
      '<button class="x" type="button" data-close aria-label="Đóng"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
  }
};

/* =====================================================================
   SUPABASE
   ===================================================================== */
function supabaseApi() {
  let mod = null, client = null;
  async function cl() {
    if (!client) {
      mod = await import(SUPABASE_JS);
      client = mod.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    }
    return client;
  }
  async function rpc(fn, args) {
    const c = await cl(); const { data, error } = await c.rpc(fn, args || {});
    if (error) fail(error.message, error.hint || error.details);
    return data;
  }
  async function q(builder) {
    const { data, error } = await builder;
    if (error) fail(error.message, error.hint || error.details);
    return data;
  }
  let me = null;
  async function myEmployee() {
    if (me) return me;
    const s = await api.session(); if (!s || !s.employee) fail('NOT_EMPLOYEE');
    return s.employee;
  }
  async function uploadTo(bucket, path, blob) {
    const c = await cl();
    const { error } = await c.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) fail(error.message);
    return path;
  }

  const api = {
    /* ---------- Khách ---------- */
    getMenu: () => rpc('get_menu'),
    placeOrder: o => rpc('place_order', {
      p_queue_number: o.dine === 'mang_ve' ? null : o.queue, p_customer_name: o.name, p_items: o.items,
      p_customer_phone: o.phone || null, p_confirm_duplicate: !!o.confirm, p_note: o.note || null,
      p_dine_type: o.dine === 'mang_ve' || o.dine === 'giao_hang' ? o.dine : 'tai_quan',
      p_address: o.address || null, p_deliver_at: o.deliverAt || null
    }),
    /* Nghe tín hiệu "menu vừa đổi" (chủ gạt hết món, đổi giá…). Trả về hàm huỷ nghe. */
    async watchMenu(onChange) {
      const c = await cl();
      const ch = c.channel('menu').on('broadcast', { event: 'changed' }, () => onChange()).subscribe();
      return () => { try { c.removeChannel(ch); } catch (e) { /* bỏ qua */ } };
    },
    /* Có đang đăng nhập bằng tài khoản nhân viên / chủ không (trang tạo đơn giao hàng cần) */
    async staffSession() { try { const s = await api.session(); return s && s.employee ? s.employee : null; } catch (e) { return null; } },
    getMyOrder: token => rpc('get_my_order', { p_token: token }),
    /* Nghe tín hiệu "đơn vừa đổi" trên kênh riêng của đơn (cơ sở dữ liệu gửi khi bếp/pha chế bấm). Trả về hàm huỷ nghe. */
    async watchOrder(orderId, onChange) {
      const c = await cl();
      const ch = c.channel('don-' + orderId).on('broadcast', { event: 'changed' }, () => onChange()).subscribe();
      return () => { try { c.removeChannel(ch); } catch (e) { /* bỏ qua */ } };
    },
    callStaff: token => rpc('call_staff', { p_token: token }),
    /* Ưu đãi đang chạy. Cơ sở dữ liệu chưa chạy cập nhật 13 thì coi như không có ưu đãi. */
    async getPromotions() { try { return (await rpc('get_promotions')) || []; } catch (e) { return []; } },
    async paymentInfo() { try { return await rpc('get_payment_info'); } catch (e) { return null; } },

    /* ---------- Đăng nhập ---------- */
    async session() {
      const c = await cl();
      const { data } = await c.auth.getSession();
      const sess = data && data.session; if (!sess) { me = null; return null; }
      const emp = await q(c.from('employees').select('id, full_name, phone, role, hourly_rate, is_active').eq('auth_user_id', sess.user.id).maybeSingle());
      me = emp && emp.is_active ? emp : null;
      return { user: sess.user, employee: me };
    },
    async signIn(phone, password) {
      const c = await cl();
      const { error } = await c.auth.signInWithPassword({ email: phoneToEmail(phone), password });
      if (error) fail('LOGIN_FAILED');
      return api.session();
    },
    async signOut() { const c = await cl(); me = null; await c.auth.signOut(); },
    hasOwner: () => rpc('has_owner'),
    async setupOwner(fullName, phone, password) {
      if (String(password).length < 6) fail('WEAK_PASSWORD');
      const c = await cl();
      const { data, error } = await c.auth.signUp({ email: phoneToEmail(phone), password });
      if (error) fail(/registered/i.test(error.message) ? 'PHONE_TAKEN' : error.message);
      if (!data.session) fail('CONFIRM_EMAIL_ON');
      await rpc('claim_owner', { p_full_name: fullName, p_phone: phone });
      return api.session();
    },

    /* ---------- Bếp ---------- */
    async kitchenOrders() {
      const c = await cl();
      const rows = await q(c.from('orders').select('*, order_items(*), order_stations(*), staff_calls(*)').order('created_at'));
      return rows.map(o => Object.assign({}, o, {
        items: (o.order_items || []).sort((a, b) => a.id - b.id),
        stations: o.order_stations || [],
        calls: (o.staff_calls || []).filter(x => !x.resolved_at)
      }));
    },
    onKitchenChange(cb) {
      let ch = null, stopped = false;
      cl().then(c => {
        if (stopped) return;
        ch = c.channel('bep')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => cb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => cb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'order_stations' }, () => cb())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_calls' }, () => cb())
          .subscribe();
      });
      return () => { stopped = true; if (ch) cl().then(c => c.removeChannel(ch)); };
    },
    suggestWait: (id, station) => rpc('suggest_wait_minutes', { p_order_id: id, p_station: station || 'bep' }),
    acceptOrder: (id, minutes, station) => rpc('accept_order', { p_order_id: id, p_minutes: minutes, p_station: station || 'bep' }),
    extendWait: (id, minutes, station) => rpc('extend_wait', { p_order_id: id, p_extra_minutes: minutes, p_station: station || 'bep' }),
    markServed: (id, station) => rpc('mark_served', { p_order_id: id, p_station: station || 'bep' }),
    cancelOrder: id => rpc('cancel_order', { p_order_id: id }),
    completePayment: (id, method) => rpc('complete_payment', { p_order_id: id, p_method: method }),
    staffAddItems: (id, items) => rpc('staff_add_items', { p_order_id: id, p_items: items }),
    staffSetItemQty: (itemId, qty) => rpc('staff_set_item_qty', { p_item_id: itemId, p_qty: qty }),
    staffUpdateOrder: (id, dine, queue) => rpc('staff_update_order', { p_order_id: id, p_dine_type: dine, p_queue_number: dine === 'tai_quan' ? queue : null }),
    staffSetItemOptions: (itemId, choiceIds) => rpc('staff_set_item_options', { p_item_id: itemId, p_choice_ids: choiceIds }),
    async resolveCall(id) { const c = await cl(); await q(c.from('staff_calls').update({ resolved_at: new Date().toISOString() }).eq('id', id)); },

    /* ---------- Menu (quản lý) ---------- */
    async adminMenu() {
      const c = await cl();
      const [cats, items, groups, choices, links] = await Promise.all([
        q(c.from('menu_categories').select('*').order('sort_order').order('id')),
        q(c.from('menu_items').select('*').order('sort_order').order('name')),
        q(c.from('option_groups').select('*').order('sort_order').order('id')),
        q(c.from('option_choices').select('*').order('sort_order').order('id')),
        q(c.from('menu_item_option_groups').select('*'))
      ]);
      return assembleAdminMenu(cats, items, groups, choices, links);
    },
    async saveCategory(cat) {
      const c = await cl(); const row = { name: cat.name, color: cat.color, station: cat.station || 'bep', sort_order: cat.sort_order || 0 };
      if (cat.id) { await q(c.from('menu_categories').update(row).eq('id', cat.id)); return cat.id; }
      return (await q(c.from('menu_categories').insert(row).select('id').single())).id;
    },
    async deleteCategory(id) { const c = await cl(); await q(c.from('menu_categories').delete().eq('id', id)); },
    async saveItem(it, groupIds) {
      const c = await cl();
      const row = { name: it.name, category_id: it.category_id || null, price: it.price, description: it.description || null, tag: it.tag || null, prep_minutes: it.prep_minutes || 5, is_available: it.is_available !== false, image_path: it.image_path || null, sort_order: it.sort_order || 0 };
      let id = it.id;
      if (id) await q(c.from('menu_items').update(row).eq('id', id));
      else id = (await q(c.from('menu_items').insert(row).select('id').single())).id;
      await q(c.from('menu_item_option_groups').delete().eq('menu_item_id', id));
      if (groupIds && groupIds.length) await q(c.from('menu_item_option_groups').insert(groupIds.map((g, i) => ({ menu_item_id: id, group_id: g, sort_order: i + 1 }))));
      return id;
    },
    async deleteItem(id) { const c = await cl(); await q(c.from('menu_items').delete().eq('id', id)); },
    async setItemAvailable(id, on) { const c = await cl(); await q(c.from('menu_items').update({ is_available: on }).eq('id', id)); },
    async uploadMenuImage(file) {
      const c = await cl(); const blob = await toJpeg(file, 900, 0.82);
      const path = 'items/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
      await uploadTo('menu-images', path, blob);
      return c.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
    },
    async saveGroup(g) {
      const c = await cl(); const row = { name: g.name, title: g.title, kind: g.kind === 'do_uong' ? 'do_uong' : 'do_an', min_select: g.min_select, max_select: g.max_select, sort_order: g.sort_order || 0 };
      let id = g.id;
      if (id) await q(c.from('option_groups').update(row).eq('id', id));
      else id = (await q(c.from('option_groups').insert(row).select('id').single())).id;
      const keep = g.choices.filter(x => x.id).map(x => x.id);
      let del = c.from('option_choices').delete().eq('group_id', id);
      if (keep.length) del = del.not('id', 'in', '(' + keep.join(',') + ')');
      await q(del);
      for (let i = 0; i < g.choices.length; i++) {
        const ch = g.choices[i];
        const r = { group_id: id, name: ch.name, price_delta: ch.price_delta || 0, is_default: !!ch.is_default, is_available: ch.is_available !== false, sort_order: i + 1 };
        if (ch.id) await q(c.from('option_choices').update(r).eq('id', ch.id)); else await q(c.from('option_choices').insert(r));
      }
      return id;
    },
    async deleteGroup(id) { const c = await cl(); await q(c.from('option_groups').delete().eq('id', id)); },

    /* ---------- Ưu đãi (quản lý) ---------- */
    async adminPromotions() {
      const c = await cl();
      const [ps, its] = await Promise.all([
        q(c.from('promotions').select('*').order('sort_order').order('created_at', { ascending: false })),
        q(c.from('promotion_items').select('*').order('sort_order').order('id'))
      ]);
      return ps.map(p => Object.assign({}, p, { items: its.filter(i => i.promotion_id === p.id) }));
    },
    async savePromotion(p) {
      const c = await cl(); const row = promoRow(p);
      let id = p.id;
      if (id) await q(c.from('promotions').update(row).eq('id', id));
      else id = (await q(c.from('promotions').insert(row).select('id').single())).id;
      await q(c.from('promotion_items').delete().eq('promotion_id', id));
      if (p.items.length) await q(c.from('promotion_items').insert(p.items.map((i, k) => ({ promotion_id: id, part: i.part, menu_item_id: i.menu_item_id, qty: i.qty || 1, sort_order: k + 1 }))));
      return id;
    },
    async promoUsage() { try { return (await rpc('promo_usage')) || {}; } catch (e) { return {}; } },
    async setPromotionActive(id, on) { const c = await cl(); await q(c.from('promotions').update({ is_active: on }).eq('id', id)); },
    async deletePromotion(id) { const c = await cl(); await q(c.from('promotions').delete().eq('id', id)); },

    /* ---------- Kho hàng ---------- */
    async stockItems() { const c = await cl(); return await q(c.from('stock_items').select('*').order('sort_order').order('name')); },
    async saveStockItem(it) {
      const c = await cl(); const row = stockRow(it); if (!row.pack_id && !it.had_pack) delete row.pack_id; // chưa chạy cập nhật 17 vẫn lưu được
      if (it.id) { await q(c.from('stock_items').update(row).eq('id', it.id)); return it.id; }
      const id = (await q(c.from('stock_items').insert(row).select('id').single())).id;
      if (Number(it.qty) > 0) await api.stockMove(id, 'kiem', Number(it.qty), false, 'Tồn ban đầu');
      return id;
    },
    async deleteStockItem(id) { const c = await cl(); await q(c.from('stock_items').delete().eq('id', id)); },
    /* Quy cách nhập hàng (chưa chạy cập nhật 17 thì trả về rỗng) */
    async stockPacks() { try { const c = await cl(); return await q(c.from('stock_packs').select('*').order('sort_order').order('name')); } catch (e) { return null; } },
    async saveStockPack(pk) { const c = await cl(); const row = packRow(pk); if (pk.id) { await q(c.from('stock_packs').update(row).eq('id', pk.id)); return pk.id; } return (await q(c.from('stock_packs').insert(row).select('id').single())).id; },
    async deleteStockPack(id) { const c = await cl(); await q(c.from('stock_packs').delete().eq('id', id)); },
    stockMove: (itemId, kind, amount, inBuy, note, cost) => rpc('stock_move', { p_item: itemId, p_kind: kind, p_amount: amount, p_in_buy_unit: !!inBuy, p_note: note || null, p_cost: cost == null || cost === '' ? null : Number(cost) }),
    async stockMoves(f) {
      const c = await cl(); let b = c.from('stock_moves').select('*').order('created_at', { ascending: false }).limit((f && f.limit) || 100);
      if (f && f.itemId) b = b.eq('item_id', f.itemId);
      if (f && f.from) b = b.gte('created_at', new Date(f.from).toISOString());
      if (f && f.kind) b = b.eq('kind', f.kind);
      return await q(b);
    },
    /* Mã vạch kho (chưa chạy cập nhật 21 thì trả về null) */
    async stockBarcodes() { try { const c = await cl(); return await q(c.from('stock_barcodes').select('*').order('created_at')); } catch (e) { return null; } },
    async linkBarcode(code, itemId, unitKind, replace) {
      const c = await cl(); const e = await myEmployee().catch(() => null);
      const row = { code: String(code).trim(), item_id: itemId, unit_kind: unitKind === 'use' ? 'use' : 'buy', created_by: e ? e.full_name : null };
      await q(replace ? c.from('stock_barcodes').upsert(row) : c.from('stock_barcodes').insert(row));
    },
    async unlinkBarcode(code) { const c = await cl(); await q(c.from('stock_barcodes').delete().eq('code', code)); },

    /* ---------- Đơn online (cập nhật 22, 25 + Edge Function bot-don: đơn từ ảnh chụp gửi qua Zalo / Telegram). Chưa cài thì trả về null ---------- */
    async fbDrafts() {
      const c = await cl(); const since = new Date(Date.now() - 36 * 3600e3).toISOString();
      let drafts; try { drafts = await q(c.from('fb_drafts').select('*').gte('updated_at', since).neq('status', 'huy').order('updated_at', { ascending: false }).limit(200)); } catch (e) { return null; }
      const threads = await q(c.from('fb_threads').select('*').gte('last_at', since).order('last_at', { ascending: false }).limit(200));
      return { drafts, threads };
    },
    /* Nghe đơn online thay đổi (cập nhật 26: realtime). Trả về hàm huỷ nghe */
    onFbChange(cb) {
      let ch = null, stopped = false;
      cl().then(c => { if (stopped) return; ch = c.channel('don-online').on('postgres_changes', { event: '*', schema: 'public', table: 'fb_drafts' }, () => cb()).subscribe(); });
      return () => { stopped = true; if (ch) cl().then(c => c.removeChannel(ch)); };
    },
    async fbMessages(psid) { const c = await cl(); return (await q(c.from('fb_messages').select('*').eq('psid', psid).order('created_at', { ascending: false }).limit(60))).reverse(); },
    fbApprove: (id, f) => rpc('fb_approve', { p_draft: id, p_dine: f.dine, p_name: f.name, p_phone: f.phone || null, p_address: f.address || null, p_at: f.at, p_items: f.items, p_note: f.note || null }),
    async fbCancel(id) { const c = await cl(); await q(c.from('fb_drafts').update({ status: 'huy', updated_at: new Date().toISOString() }).eq('id', id)); },
    async fbThread(psid, patch) { const c = await cl(); await q(c.from('fb_threads').update(patch).eq('psid', psid)); },
    async fbBotSettings(patch) { const c = await cl(); await q(c.from('shop_settings').update(patch).eq('id', 1)); },
    /* Dữ liệu huấn luyện (cập nhật 24). Chưa cài thì trả về null */
    async fbTrainStats() {
      try {
        const c = await cl();
        const a = await c.from('fb_train').select('id', { count: 'exact', head: true }); if (a.error) return null;
        const g = await c.from('fb_train').select('edits').not('final', 'is', null).limit(5000);
        const gold = g.data || [];
        return { total: a.count || 0, gold: gold.length, fixed: gold.filter(r => r.edits && r.edits.length).length };
      } catch (e) { return null; }
    },
    async fbTrainExport() {
      const c = await cl(); const rows = [];
      for (let from = 0; ; from += 1000) { const r = await q(c.from('fb_train').select('*').order('id').range(from, from + 999)); rows.push(...r); if (r.length < 1000) break; }
      const hashes = [...new Set(rows.map(r => r.menu_hash).filter(Boolean))];
      const menus = hashes.length ? await q(c.from('fb_train_menu').select('*').in('hash', hashes)) : [];
      return { rows, menus };
    },
    async fbCount() {
      try {
        const c = await cl(); const since = new Date(Date.now() - 36 * 3600e3).toISOString();
        const a = await c.from('fb_drafts').select('id', { count: 'exact', head: true }).eq('status', 'cho_duyet').gte('updated_at', since);
        if (a.error) return null;
        const b = await c.from('fb_threads').select('psid', { count: 'exact', head: true }).eq('need_human', true).gte('last_at', since);
        return (a.count || 0) + (b.count || 0);
      } catch (e) { return null; }
    },
    /* Gọi bot: kiểm tra cài đặt, cài webhook, gửi tin xác nhận về Zalo / Telegram sau khi duyệt */
    async fbCall(body) {
      const c = await cl(); const { data, error } = await c.functions.invoke('bot-don', { body });
      if (error) { let msg = error.message || 'Lỗi gọi bot'; try { const j = await error.context.json(); msg = j.error || msg; } catch (e) { /* bỏ qua */ } if (/Failed to send|NOT_FOUND|404/i.test(msg)) msg = 'Chưa cài bot (Edge Function bot-don) trên Supabase.'; fail(msg); }
      return data;
    },
    /* Tài khoản Zalo / Telegram được dùng bot (cập nhật 25). Chưa cài thì trả về null */
    async botUsers() { try { const c = await cl(); const r = await c.from('bot_users').select('*').order('created_at'); return r.error ? null : r.data; } catch (e) { return null; } },
    async botUserDel(kenh, chatId) { const c = await cl(); await q(c.from('bot_users').delete().eq('kenh', kenh).eq('chat_id', chatId)); },
    botLinkCode: () => rpc('bot_link_code', {}),
    /* Link xem ảnh chụp của đơn (bucket riêng tư, link hết hạn sau 1 giờ) */
    async draftImages(paths) {
      if (!paths || !paths.length) return [];
      const c = await cl(); const { data, error } = await c.storage.from('don-anh').createSignedUrls(paths, 3600);
      if (error) return []; return (data || []).map(x => x.signedUrl).filter(Boolean);
    },

    /* ---------- Nhân viên & chấm công ---------- */
    async employees() { const c = await cl(); return await q(c.from('employees').select('*').order('is_active', { ascending: false }).order('full_name')); },
    async saveEmployee(e) {
      const c = await cl();
      const row = { full_name: e.full_name, phone: e.phone || null, role: e.role, hourly_rate: e.hourly_rate || 0, is_active: e.is_active !== false };
      if (e.id) { await q(c.from('employees').update(row).eq('id', e.id)); return e.id; }
      if (!e.phone || !e.password) fail('Cần số điện thoại và mật khẩu để nhân viên đăng nhập.');
      if (String(e.password).length < 6) fail('WEAK_PASSWORD');
      // Tạo tài khoản bằng một client riêng để chủ quán không bị đăng xuất
      if (!mod) await cl();
      const tmp = mod.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'benoc-tmp' } });
      const { data, error } = await tmp.auth.signUp({ email: phoneToEmail(e.phone), password: e.password });
      if (error) fail(/registered/i.test(error.message) ? 'PHONE_TAKEN' : error.message);
      if (!data.user || (data.user.identities && data.user.identities.length === 0)) fail('PHONE_TAKEN');
      row.auth_user_id = data.user.id;
      return (await q(c.from('employees').insert(row).select('id').single())).id;
    },
    async shifts(f) {
      const c = await cl();
      let b = c.from('shifts').select('*').order('check_in_at', { ascending: false });
      if (f && f.from) b = b.gte('check_in_at', new Date(f.from).toISOString());
      if (f && f.to) b = b.lt('check_in_at', new Date(f.to).toISOString());
      if (f && f.employeeId) b = b.eq('employee_id', f.employeeId);
      if (f && f.limit) b = b.limit(f.limit);
      return await q(b);
    },
    async photoUrl(path) {
      if (!path) return null; const c = await cl();
      const { data } = await c.storage.from('checkin-photos').createSignedUrl(path, 3600);
      return data && data.signedUrl;
    },
    updateShift: (id, inAt, outAt, note) => rpc('owner_update_shift', { p_id: id, p_in: new Date(inAt).toISOString(), p_out: outAt ? new Date(outAt).toISOString() : null, p_note: note || '' }),
    async markShiftsPaid(ids) { const c = await cl(); await q(c.from('shifts').update({ paid_out_at: new Date().toISOString() }).in('id', ids)); },
    async myOpenShift() { const c = await cl(); const e = await myEmployee(); return await q(c.from('shifts').select('*').eq('employee_id', e.id).is('check_out_at', null).maybeSingle()); },
    async myShifts(limit) { const e = await myEmployee(); return api.shifts({ employeeId: e.id, limit: limit || 20 }); },
    async checkIn(file) {
      const c = await cl(); const { data } = await c.auth.getUser();
      const path = data.user.id + '/' + Date.now() + '-vao.jpg';
      await uploadTo('checkin-photos', path, await toJpeg(file, 640, 0.75));
      return rpc('check_in', { p_photo: path });
    },
    async checkOut(file) {
      const c = await cl(); const { data } = await c.auth.getUser();
      const path = data.user.id + '/' + Date.now() + '-ra.jpg';
      await uploadTo('checkin-photos', path, await toJpeg(file, 640, 0.75));
      return rpc('check_out', { p_photo: path });
    },

    /* ---------- Doanh thu & cài đặt ---------- */
    async sales(f) {
      const c = await cl();
      return await q(c.from('sales').select('*').gte('paid_at', new Date(f.from).toISOString()).lt('paid_at', new Date(f.to).toISOString()).order('paid_at'));
    },
    /* Báo cáo tháng: tải đủ mọi dòng (Supabase trả tối đa 1.000 dòng mỗi lần nên tải từng trang) */
    async reportData(f) {
      const c = await cl(), A = new Date(f.from).toISOString(), B = new Date(f.to).toISOString();
      const all = async build => { let out = []; for (let i = 0; ; i += 1000) { const rows = await q(build().range(i, i + 999)); out = out.concat(rows); if (rows.length < 1000) return out; } };
      const opt = async fn => { try { return await fn(); } catch (e) { return null; } }; // bảng chưa có (chưa chạy SQL) thì bỏ qua
      const [sales, shifts, employees, stockItems, stockMoves, packs] = await Promise.all([
        all(() => c.from('sales').select('*').gte('paid_at', A).lt('paid_at', B).order('paid_at')),
        all(() => c.from('shifts').select('*').gte('check_in_at', A).lt('check_in_at', B).order('check_in_at')),
        q(c.from('employees').select('*').order('full_name')),
        opt(() => all(() => c.from('stock_items').select('*').order('sort_order').order('name'))),
        opt(() => all(() => c.from('stock_moves').select('*').gte('created_at', A).lt('created_at', B).order('created_at'))),
        opt(() => q(c.from('stock_packs').select('*')))
      ]);
      return { sales, shifts, employees, stockItems: stockItems || [], stockMoves: stockMoves || [], packs: packs || [] };
    },
    async settings() { const c = await cl(); return await q(c.from('shop_settings').select('*').eq('id', 1).single()); },
    async saveBank(b) { const c = await cl(); await q(c.from('shop_settings').update({ bank_bin: b.bin, bank_name: b.bank, bank_account: b.account, bank_holder: b.holder || '', bank_note: b.note || NOTE_DEFAULT, updated_at: new Date().toISOString() }).eq('id', 1)); },
    async saveSettings(s) {
      const c = await cl();
      await q(c.from('shop_settings').update({ shop_name: s.shop_name, round_minutes: s.round_minutes, round_mode: s.round_mode, pay_round: s.pay_round, kitchen_capacity: s.kitchen_capacity, bar_capacity: s.bar_capacity, updated_at: new Date().toISOString() }).eq('id', 1));
    }
  };
  return api;
}

/* Ghép menu cho trang quản lý: món kèm danh sách nhóm tuỳ chọn, nhóm kèm lựa chọn */
function assembleAdminMenu(cats, items, groups, choices, links) {
  const gs = groups.map(g => Object.assign({}, g, { choices: choices.filter(c => c.group_id === g.id).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id) }));
  const its = items.map(it => Object.assign({}, it, {
    group_ids: links.filter(l => l.menu_item_id === it.id).sort((a, b) => a.sort_order - b.sort_order).map(l => l.group_id)
  }));
  gs.forEach(g => { g.used_by = links.filter(l => l.group_id === g.id).length; });
  return { categories: cats, items: its, groups: gs };
}

/* Menu cho khách — cùng hình dạng với hàm get_menu() trong SQL */
function buildPublicMenu(db) {
  const groupsById = new Map(db.option_groups.map(g => [g.id, g]));
  return db.menu_categories.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).map(c => ({
    id: c.id, name: c.name, color: c.color, station: c.station || 'bep',
    items: db.menu_items.filter(m => m.category_id === c.id && m.is_available)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'vi'))
      .map(m => ({
        id: m.id, name: m.name, description: m.description, price: m.price, image_path: m.image_path, tag: m.tag,
        option_groups: db.menu_item_option_groups.filter(l => l.menu_item_id === m.id)
          .map(l => ({ l, g: groupsById.get(l.group_id) })).filter(x => x.g)
          .sort((a, b) => a.l.sort_order - b.l.sort_order || a.g.sort_order - b.g.sort_order || a.g.id - b.g.id)
          .map(({ g }) => ({
            id: g.id, title: g.title, min: g.min_select, max: g.max_select,
            choices: db.option_choices.filter(ch => ch.group_id === g.id && ch.is_available)
              .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
              .map(ch => ({ id: ch.id, name: ch.name, price: ch.price_delta, default: ch.is_default }))
          }))
      }))
  })).filter(c => c.items.length > 0);
}

/* =====================================================================
   ƯU ĐÃI — dùng chung cho trang khách, quản lý và bản xem thử.
   Giống các hàm promo_live / add_promo trong sql/cap-nhat-13-uu-dai-combo-mua-tang.sql
   ===================================================================== */
const hmMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const hm5 = t => (t ? String(t).slice(0, 5) : null);
/* Giờ Việt Nam (UTC+7) của thời điểm at — đọc bằng getUTC* */
const vnClock = at => new Date((at == null ? Date.now() : +new Date(at)) + 7 * 3600e3);
function promoLive(p, at) {
  at = at == null ? Date.now() : +new Date(at);
  if (p.is_active === false) return false;
  if (p.start_at && at < +new Date(p.start_at)) return false;
  if (p.end_at && at >= +new Date(p.end_at)) return false;
  const v = vnClock(at), dow = v.getUTCDay() || 7;
  if (p.days && p.days.length && p.days.indexOf(dow) < 0) return false;
  if (p.time_from && p.time_to && hm5(p.time_from) !== hm5(p.time_to)) {
    const m = v.getUTCHours() * 60 + v.getUTCMinutes(), a = hmMin(p.time_from), b = hmMin(p.time_to);
    if (a < b ? !(m >= a && m < b) : !(m >= a || m < b)) return false;
  }
  return true;
}
/* Giá từng phần (món) trong 1 phần ưu đãi. units = [{ part, base, extra }] theo thứ tự khách chọn.
   Combo: giá combo chia theo tỉ lệ giá gốc (làm tròn nghìn, phần lẻ cộng vào món đầu) + tuỳ chọn.
   Mua X tặng Y: món mua giá thường, món tặng 0đ + tuỳ chọn. Tuỳ chọn có phí theo cài đặt của ưu đãi. */
function promoPrices(p, units) {
  const ex = u => (u.part !== 'mua' && p.option_mode === 'mien_phi') ? 0 : (u.extra || 0);
  if (p.kind === 'combo') {
    const sum = units.reduce((s, u) => s + u.base, 0);
    const al = units.map(u => sum > 0 ? Math.floor(p.price * u.base / (sum * 1000) + 1e-9) * 1000 : 0);
    if (al.length) al[0] += (p.price || 0) - al.reduce((s, x) => s + x, 0);
    return units.map((u, i) => al[i] + ex(u));
  }
  return units.map(u => u.part === 'mua' ? u.base + (u.extra || 0) : ex(u));
}
/* Ưu đãi giảm giá: giá bán 1 món (giá món, chưa tính tuỳ chọn) — giống private.sale_price trong SQL.
   Đồng giá = giá cố định; giảm % làm tròn xuống nghìn; giảm tiền. Lấy giá thấp nhất, không cao hơn giá gốc. */
function saleCalc(p, base) {
  const v = Number(p.sale_value) || 0;
  return p.sale_mode === 'dong_gia' ? v : p.sale_mode === 'phan_tram' ? Math.floor(base * (100 - Math.min(v, 100)) / 100 / 1000 + 1e-9) * 1000 : Math.max(base - v, 0);
}
function saleOf(promos, itemId, base, hint, at) {
  let best = null;
  (promos || []).forEach(p => {
    if (p.kind !== 'giam_gia' || p.sale_value == null || !(p.items || []).some(i => i.part === 'giam' && i.menu_item_id === itemId)) return;
    if (at !== false && !(promoLive(p, at) || (p.id === hint && promoLive(p, (at == null ? Date.now() : +new Date(at)) - 600e3)))) return;
    const v = saleCalc(p, base);
    if (v < (best ? best.price : base)) best = { price: v, id: p.id, name: p.name };
  });
  return best;
}
/* Nhãn ngắn của ưu đãi giảm giá: "ĐỒNG GIÁ 20K", "GIẢM 10%", "GIẢM 5K" */
const saleBadge = p => p.sale_mode === 'dong_gia' ? 'ĐỒNG GIÁ ' + K(p.sale_value || 0) : p.sale_mode === 'phan_tram' ? 'GIẢM ' + (p.sale_value || 0) + '%' : 'GIẢM ' + K(p.sale_value || 0);
const DOW = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
/* Mô tả thời gian chạy, ví dụ "14:00–17:00 · T2–T6 · đến 31/10" */
function promoWhen(p, short) {
  const out = [];
  if (p.time_from && p.time_to && hm5(p.time_from) !== hm5(p.time_to)) out.push(hm5(p.time_from) + '–' + hm5(p.time_to));
  const d = (p.days || []).slice().sort((a, b) => a - b);
  if (d.length && d.length < 7) {
    const run = d.length > 2 && d[d.length - 1] - d[0] === d.length - 1;
    out.push(run ? DOW[d[0]] + '–' + DOW[d[d.length - 1]] : d.map(x => DOW[x]).join(', '));
  }
  if (!short && p.start_at && +new Date(p.start_at) > Date.now()) out.push('từ ' + ddmm(p.start_at) + ' ' + hhmm(p.start_at));
  if (p.end_at) out.push('đến ' + ddmm(p.end_at) + (hhmm(p.end_at) !== '00:00' ? ' ' + hhmm(p.end_at) : ''));
  return out.join(' · ');
}
/* Tên hiển thị: "Combo …" (không lặp nếu tên đã có chữ combo) */
const promoTitle = (kind, name) => (kind === 'combo' && !/^combo/i.test(String(name || '').trim()) ? 'Combo ' : '') + (name || '');
/* Dòng ghi vào bảng promotions */
function promoRow(p) {
  return {
    name: String(p.name || '').trim(), kind: ['mua_tang', 'giam_gia'].indexOf(p.kind) >= 0 ? p.kind : 'combo', description: p.description || null, image_path: p.image_path || null,
    price: p.kind === 'combo' ? Math.max(0, Number(p.price) || 0) : null, buy_qty: Math.max(1, Number(p.buy_qty) || 1), get_qty: Math.max(1, Number(p.get_qty) || 1),
    gift_same: !!p.gift_same, option_mode: ['cong_them', 'mien_phi', 'khong_phi'].indexOf(p.option_mode) >= 0 ? p.option_mode : 'cong_them',
    start_at: p.start_at || null, end_at: p.end_at || null, days: p.days && p.days.length && p.days.length < 7 ? p.days.slice().sort((a, b) => a - b) : null,
    time_from: p.time_from || null, time_to: p.time_to || null, is_active: p.is_active !== false, sort_order: Number(p.sort_order) || 0,
    gift_name: p.kind === 'mua_tang' && !p.gift_same && String(p.gift_name || '').trim() ? String(p.gift_name).trim().slice(0, 60) : null,
    gift_station: p.gift_station === 'bep' ? 'bep' : 'pha_che',
    limit_qty: Number(p.limit_qty) > 0 ? Math.round(Number(p.limit_qty)) : null, limit_per: p.limit_per === 'tong' ? 'tong' : 'ngay',
    ...(p.kind === 'giam_gia' ? { sale_mode: ['dong_gia', 'phan_tram', 'tru_tien'].indexOf(p.sale_mode) >= 0 ? p.sale_mode : 'dong_gia', sale_value: Math.max(0, Number(p.sale_value) || 0) } : {})
  };
}
/* Dòng ghi vào bảng stock_items (kho hàng) */
function stockRow(it) {
  return { name: String(it.name || '').trim(), grp: (it.grp || '').trim() || null, use_unit: (it.use_unit || 'gói').trim(), buy_unit: (it.buy_unit || it.use_unit || 'thùng').trim(),
    per_buy: Math.max(0.001, Number(it.per_buy) || 1), min_qty: Math.max(0, Number(it.min_qty) || 0), cost_per_buy: it.cost_per_buy === '' || it.cost_per_buy == null ? null : Math.max(0, Number(it.cost_per_buy) || 0),
    note: (it.note || '').trim() || null, is_active: it.is_active !== false, sort_order: Number(it.sort_order) || 0, pack_id: it.pack_id || null };
}
const packRow = p => ({ name: String(p.name || '').trim(), buy_unit: String(p.buy_unit || '').trim(), use_unit: String(p.use_unit || '').trim(), per_buy: Math.max(0.001, Number(p.per_buy) || 1), sort_order: Number(p.sort_order) || 0 });
/* Bản xem thử: số suất đã dùng / còn lại — giống private.promo_used / promo_left */
function demoPromoUsed(db, p) {
  const t0 = p.limit_per === 'tong' ? +new Date(p.start_at && p.start_at < p.created_at ? p.start_at : p.created_at || 0) : (() => { const v = vnClock(Date.now()); return Date.now() - (v.getUTCHours() * 3600 + v.getUTCMinutes() * 60 + v.getUTCSeconds()) * 1000 - v.getUTCMilliseconds(); })();
  const u = i => i.promo_kind === 'giam_gia' ? i.qty : (i.promo_units || 0);
  return db.order_items.filter(i => i.promo_id === p.id && +new Date(i.added_at || 0) >= t0).reduce((s, i) => s + u(i), 0)
    + (db.sales || []).filter(x => +new Date(x.ordered_at) >= t0).reduce((s, x) => s + (x.items || []).filter(i => i.promo_id === p.id).reduce((t, i) => t + u(i), 0), 0);
}
const demoPromoLeft = (db, p) => p.limit_qty ? Math.max(0, p.limit_qty - demoPromoUsed(db, p)) : null;
/* Ưu đãi đang chạy cho khách — cùng hình dạng với hàm get_promotions() trong SQL */
function buildPublicPromos(db) {
  const ok = id => db.menu_items.some(m => m.id === id && m.is_available);
  return (db.promotions || []).filter(p => promoLive(p) && (!p.limit_qty || demoPromoLeft(db, p) > 0)).map(p => {
    const all = db.promotion_items.filter(i => i.promotion_id === p.id).sort((a, b) => a.sort_order - b.sort_order);
    const good = p.kind === 'combo'
      ? p.price != null && all.some(i => i.part === 'combo') && all.filter(i => i.part === 'combo').every(i => ok(i.menu_item_id))
      : p.kind === 'giam_gia' ? p.sale_value != null && all.some(i => i.part === 'giam' && ok(i.menu_item_id))
      : all.some(i => i.part === 'mua' && ok(i.menu_item_id)) && (p.gift_same || !!p.gift_name || all.some(i => i.part === 'tang' && ok(i.menu_item_id)));
    if (!good) return null;
    return { id: p.id, name: p.name, kind: p.kind, description: p.description, image_path: p.image_path, price: p.price, buy_qty: p.buy_qty, get_qty: p.get_qty, gift_same: p.gift_same, option_mode: p.option_mode, start_at: p.start_at, end_at: p.end_at, days: p.days, time_from: hm5(p.time_from), time_to: hm5(p.time_to), sort_order: p.sort_order, sale_mode: p.sale_mode || 'dong_gia', sale_value: p.sale_value == null ? null : p.sale_value,
      gift_name: p.gift_name || null, limit_qty: p.limit_qty || null, limit_per: p.limit_per || 'ngay', left: demoPromoLeft(db, p),
      items: all.filter(i => ok(i.menu_item_id)).map(i => ({ part: i.part, menu_item_id: i.menu_item_id, qty: i.qty })) };
  }).filter(Boolean).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'vi'));
}

/* =====================================================================
   CHẾ ĐỘ XEM THỬ — cơ sở dữ liệu giả lập trong localStorage
   Mô phỏng đúng các quy tắc của các hàm SQL để giao diện cư xử giống bản thật.
   ===================================================================== */
const DEMO_KEY = 'demo.db.v11'; // v10: size / upsize theo cập nhật 12 (đổi khoá để bản xem thử tạo lại dữ liệu mẫu)
/* Mỗi "vai" khi test trên một máy có phiên đăng nhập riêng (bếp, chủ quán, nhân viên) */
const PARAMS = new URLSearchParams(location.search);
// Nhận cả /bep.html lẫn /bep (Cloudflare Pages tự bỏ đuôi .html)
const PAGE = /\/bep(\.html)?$/.test(location.pathname) ? 'bep' : /\/phache(\.html)?$/.test(location.pathname) ? 'phache' : /\/quanly(\.html)?$/.test(location.pathname) ? 'quanly' : 'khach';
const SLOT = (PARAMS.get('slot') || PAGE).replace(/[^a-z0-9_-]/gi, '');
const SESSION_KEY = 'demo.session.' + SLOT;

function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* Nơi làm một món: theo danh mục của món (mặc định bếp) */
function stationOf(db, menuItemId) {
  const m = db.menu_items.find(x => x.id === menuItemId); const c = m && db.menu_categories.find(x => x.id === m.category_id);
  return (c && c.station) || 'bep';
}
/* Bản xem thử: kiểm tra tuỳ chọn của 1 món — giống private.item_options trong SQL */
function demoOptions(db, m, choiceIds) {
  const ids = new Set(choiceIds || []);
  const links = db.menu_item_option_groups.filter(l => l.menu_item_id === m.id).map(l => l.group_id);
  for (const cid of ids) {
    const ch = db.option_choices.find(c => c.id === cid);
    if (!ch || !ch.is_available || links.indexOf(ch.group_id) < 0) fail('OPTION_INVALID', m.name);
  }
  for (const gid of links) {
    const g = db.option_groups.find(x => x.id === gid);
    const n = db.option_choices.filter(c => c.group_id === gid && ids.has(c.id)).length;
    if (n < g.min_select || n > g.max_select) fail('OPTION_REQUIRED', m.name + ': kiểm tra lại mục "' + g.title + '"');
  }
  const picked = db.option_choices.filter(c => ids.has(c.id)).sort((a, b) => {
    const ga = db.option_groups.find(g => g.id === a.group_id), gb = db.option_groups.find(g => g.id === b.group_id);
    return (ga.sort_order - gb.sort_order) || (a.sort_order - b.sort_order) || (a.id - b.id);
  });
  return { extra: picked.reduce((s, c) => s + c.price_delta, 0), opts: picked.map(c => ({ group: db.option_groups.find(g => g.id === c.group_id).title, choice: c.name, price: c.price_delta })) };
}
/* Bản xem thử: 1 phần ưu đãi thành các dòng món — giống private.add_promo trong SQL */
function demoPromoLines(db, orderId, pkg) {
  const p = (db.promotions || []).find(x => x.id === pkg.promo_id);
  if (!p || !(promoLive(p) || promoLive(p, Date.now() - 600e3))) fail('PROMO_ENDED', p ? p.name : '');
  const k = Math.max(1, Math.min(20, pkg.qty || 1)), parts = pkg.parts || [];
  if (p.limit_qty) { const left = demoPromoLeft(db, p); if (left < k) fail('PROMO_SOLD_OUT', left > 0 ? p.name + ' chỉ còn ' + left + ' suất. Bớt số phần rồi gửi lại.' : p.name + ' vừa hết suất. Bỏ ưu đãi khỏi giỏ rồi gửi lại.'); }
  const gift = p.kind === 'mua_tang' && !p.gift_same && p.gift_name ? p.gift_name : null;
  if (!parts.length || parts.length > 40) fail('PROMO_INVALID', p.name);
  const pis = db.promotion_items.filter(x => x.promotion_id === p.id);
  const units = parts.map((u, i) => {
    if (p.kind === 'combo' ? u.part !== 'combo' : (u.part !== 'mua' && u.part !== 'tang') || (gift && u.part === 'tang')) fail('PROMO_INVALID', p.name);
    const m = db.menu_items.find(x => x.id === u.menu_item_id && x.is_available); if (!m) fail('ITEM_UNAVAILABLE');
    if (!(p.kind === 'mua_tang' && u.part === 'tang' && p.gift_same) && !pis.some(x => x.part === u.part && x.menu_item_id === m.id)) fail('PROMO_INVALID', m.name + ' không thuộc ưu đãi ' + p.name);
    let { extra, opts } = demoOptions(db, m, u.choice_ids);
    if (u.part !== 'mua') {
      if (p.option_mode === 'khong_phi' && opts.some(x => x.price > 0)) fail('PROMO_OPTION', m.name + ' trong ưu đãi không chọn được tuỳ chọn có phí');
      if (p.option_mode === 'mien_phi') { extra = 0; opts = opts.map(x => Object.assign({}, x, { price: 0 })); }
    }
    return { i, part: u.part, m, base: m.price, extra, opts, ckey: (u.choice_ids || []).slice().sort((a, b) => a - b).join(','), note: u.note ? String(u.note).trim() || null : null };
  });
  if (p.kind === 'combo') {
    const want = pis.filter(x => x.part === 'combo');
    if (want.some(w => units.filter(u => u.m.id === w.menu_item_id).length !== w.qty) || units.length !== want.reduce((s, w) => s + w.qty, 0)) fail('PROMO_INVALID', 'Combo ' + p.name + ' chưa đủ món');
  } else {
    if (units.filter(u => u.part === 'mua').length !== p.buy_qty || units.filter(u => u.part === 'tang').length !== (gift ? 0 : p.get_qty)) fail('PROMO_INVALID', p.name + ': chọn đúng ' + p.buy_qty + ' món mua và ' + p.get_qty + ' món tặng');
    if (p.gift_same && units.some(g => g.part === 'tang' && !units.some(b => b.part === 'mua' && b.m.id === g.m.id))) fail('PROMO_INVALID', p.name + ': món tặng phải là món bạn mua');
  }
  const prices = promoPrices(p, units), group = uuid(), by = new Map();
  units.forEach((u, i) => {
    const key = [u.part, u.m.id, u.ckey, u.note || '', prices[i]].join('|');
    const ex = by.get(key); if (ex) { ex.qty += k; return; }
    by.set(key, { added_at: new Date().toISOString(), id: 0, order_id: orderId, menu_item_id: u.m.id, item_name: u.m.name, unit_price: prices[i], options: u.opts, qty: k, note: u.note, station: stationOf(db, u.m.id), promo_id: p.id, promo_name: p.name, promo_kind: p.kind, promo_group: group, promo_part: u.part });
  });
  const out = [...by.values()];
  if (out[0]) out[0].promo_units = k;
  if (gift) out.push({ added_at: new Date().toISOString(), id: 0, order_id: orderId, menu_item_id: null, item_name: gift, unit_price: 0, options: [], qty: p.get_qty * k, note: null, station: p.gift_station || 'pha_che', promo_id: p.id, promo_name: p.name, promo_kind: p.kind, promo_group: group, promo_part: 'tang' });
  return out.map(l => { if (l.qty > 50) fail('PROMO_INVALID', 'Mỗi lần đặt tối đa 50 phần một món'); l.id = db.seq.order_items++; return l; });
}
/* Bản xem thử: kiểm tra và dựng các dòng món — giống private.add_items trong SQL */
function demoLines(db, orderId, items) {
  if (!items || !items.length) fail('EMPTY_ORDER');
  const lines = [];
  for (const li of items) {
    if (li.promo_id) { demoPromoLines(db, orderId, li).forEach(l => lines.push(l)); continue; }
    const m = db.menu_items.find(x => x.id === li.menu_item_id && x.is_available); if (!m) fail('ITEM_UNAVAILABLE');
    const { extra, opts } = demoOptions(db, m, li.choice_ids);
    const qty = Math.max(1, Math.min(50, li.qty || 1));
    const usedNow = p => demoPromoUsed(db, p) + lines.filter(l => l.promo_id === p.id).reduce((s, l) => s + l.qty, 0);
    const promos = (db.promotions || []).filter(p => {
      if (!p.limit_qty || p.kind !== 'giam_gia') return true;
      const left = Math.max(0, p.limit_qty - usedNow(p));
      if (left >= qty) return true;
      if (p.id === li.sale_id && db.promotion_items.some(i => i.promotion_id === p.id && i.menu_item_id === m.id)) fail('PROMO_SOLD_OUT', left > 0 ? p.name + ' chỉ còn ' + left + ' suất. Bớt số lượng ' + m.name + ' rồi gửi lại.' : p.name + ' vừa hết suất. Giỏ đã về giá gốc, bạn xem lại rồi gửi.');
      return false;
    }).map(p => Object.assign({}, p, { items: db.promotion_items.filter(i => i.promotion_id === p.id) }));
    const sale = saleOf(promos, m.id, m.price, li.sale_id || null);
    lines.push(Object.assign({ added_at: new Date().toISOString(), id: db.seq.order_items++, order_id: orderId, menu_item_id: m.id, item_name: m.name, unit_price: (sale ? sale.price : m.price) + extra, options: opts, qty, note: li.note ? String(li.note).trim() : null, station: stationOf(db, m.id) },
      sale ? { promo_id: sale.id, promo_name: sale.name, promo_kind: 'giam_gia', promo_part: 'giam' } : {}));
  }
  return { lines, total: lines.reduce((s, l) => s + l.unit_price * l.qty, 0) };
}
/* Bản xem thử: chép đơn sang doanh thu rồi xoá — giống private.finalize_order */
function demoFinalize(db, id, method, cashierId) {
  const o = db.orders.find(x => x.id === id); if (!o) return;
  const items = db.order_items.filter(i => i.order_id === id).map(i => Object.assign({ menu_item_id: i.menu_item_id, name: i.item_name, price: i.unit_price, qty: i.qty, options: i.options, station: i.station }, i.promo_group || i.promo_id ? { promo_id: i.promo_id, promo_name: i.promo_name, promo_kind: i.promo_kind, promo_group: i.promo_group, promo_part: i.promo_part, promo_units: i.promo_units || undefined } : {}));
  const station_minutes = {}; db.order_stations.filter(x => x.order_id === id && x.accepted_at && x.served_at).forEach(x => { station_minutes[x.station] = Math.round((new Date(x.served_at) - new Date(x.accepted_at)) / 60000); });
  db.sales.push({ id: o.id, queue_number: o.queue_number, dine_type: o.dine_type || 'tai_quan', total: o.total, payment_method: method || o.paid_method || 'tien_mat', items, ordered_at: o.created_at, accepted_at: o.accepted_at, served_at: o.served_at, paid_at: o.paid_at || new Date().toISOString(), cook_minutes: o.accepted_at && o.served_at ? Math.round((new Date(o.served_at) - new Date(o.accepted_at)) / 60000) : null, station_minutes, cashier_id: o.paid_by || cashierId || null, customer_name: o.customer_name || null, customer_phone: o.customer_phone || null, address: o.address || null });
  db.orders = db.orders.filter(x => x.id !== id); db.order_items = db.order_items.filter(i => i.order_id !== id); db.order_stations = db.order_stations.filter(x => x.order_id !== id); db.staff_calls = db.staff_calls.filter(c => c.order_id !== id);
}
const demoTotal = (db, id) => db.order_items.filter(i => i.order_id === id).reduce((s, i) => s + i.unit_price * i.qty, 0);
/* Trạng thái chung của đơn tính từ các nơi — giống hàm refresh_order_status trong SQL */
function refreshOrder(db, id) {
  const o = db.orders.find(x => x.id === id); const ss = db.order_stations.filter(x => x.order_id === id); if (!o || !ss.length) return;
  const all = ss.every(x => x.status === 'da_ra_mon'), any = ss.some(x => x.status !== 'cho_nhan');
  o.status = all ? 'da_ra_mon' : any ? 'dang_lam' : 'cho_nhan';
  const acc = ss.map(x => x.accepted_at).filter(Boolean).sort(); o.accepted_at = acc[0] || null;
  const open = ss.filter(x => x.status !== 'da_ra_mon').map(x => x.estimated_ready_at).filter(Boolean).sort();
  const etas = ss.map(x => x.estimated_ready_at).filter(Boolean).sort();
  o.estimated_ready_at = open.length ? open[open.length - 1] : (etas.length ? etas[etas.length - 1] : null);
  o.served_at = all ? ss.map(x => x.served_at).filter(Boolean).sort().pop() || null : null;
  // Đã thu đủ trước và mọi nơi đã ra món: đơn xong
  if (all && o.paid_amount != null && o.paid_amount === o.total) demoFinalize(db, id, null, null);
}

/* Giống sql/cap-nhat-9-size-m-l.sql: nhóm "Upsize" của đồ uống thành chọn Size M (chọn sẵn) / Size L */
/* Giống sql/cap-nhat-12-sap-xep-size-upsize.sql: nước uống Size XL +5k; trà sữa, trà hoa quả, sốt khoai môn,
   món nên thử, cà phê, matcha · cacao · khoai môn Upsize +10k (size nhỏ nhất là L); món cốm Upsize +15k */
function demoSizeMigrate(S) {
  const isSz = g => /^(size|upsize)/i.test(g.title) || /^(size|upsize)/i.test(g.name);
  const old = new Set((S.option_groups || []).filter(isSz).map(g => g.id));
  S.option_groups = (S.option_groups || []).filter(g => !old.has(g.id));
  S.option_choices = (S.option_choices || []).filter(c => !old.has(c.group_id));
  S.menu_item_option_groups = (S.menu_item_option_groups || []).filter(l => !old.has(l.group_id));
  let gid = Math.max(0, ...S.option_groups.map(g => g.id)) + 1, cid = Math.max(0, ...S.option_choices.map(c => c.id)) + 1;
  const mk = (name, title, min, ch) => { const id = gid++; S.option_groups.push({ id, name, title, kind: 'do_uong', min_select: min, max_select: 1, sort_order: 1 }); ch.forEach(([n, p, d], k) => S.option_choices.push({ id: cid++, group_id: id, name: n, price_delta: p, is_default: d, is_available: true, sort_order: k + 1 })); return id; };
  const UP10 = mk('Upsize (+10k)', 'Upsize', 0, [['Upsize', 10000, false]]);
  const UP15 = mk('Upsize (+15k)', 'Upsize', 0, [['Upsize', 15000, false]]);
  const XL = mk('Size XL (+5k)', 'Size', 0, [['Size XL', 5000, false]]);
  const catOf = new Map((S.menu_categories || []).map(c => [c.id, c.name]));
  (S.menu_items || []).forEach(m => {
    const n = catOf.get(m.category_id) || '';
    const g = /^nước uống/i.test(n) ? XL : /cốm/i.test(n) ? UP15 : /^(trà sữa|trà hoa quả|sốt khoai môn|món nên thử|cà phê)|matcha|cacao/i.test(n) ? UP10 : null;
    if (g) S.menu_item_option_groups.push({ menu_item_id: m.id, group_id: g, sort_order: 0 });
  });
  return S;
}
const DEMO_NAMES = ['Lan', 'Minh', 'Hà', 'Tuấn', 'Vy', 'Nam', 'Thảo', 'Huy', 'Linh', 'Quân', 'Trang', 'Đức'];
function demoSeed() {
  const S = demoSizeMigrate(JSON.parse(JSON.stringify(window.BENOC_SEED || {})));
  const now = Date.now(), R = rng(2802);
  const db = {
    shop_settings: { id: 1, shop_name: 'Bé Nốc', round_minutes: 1, round_mode: 'nearest', pay_round: 1000, kitchen_capacity: 2, bar_capacity: 2 },
    menu_categories: S.menu_categories || [], menu_items: S.menu_items || [], option_groups: S.option_groups || [],
    option_choices: S.option_choices || [], menu_item_option_groups: S.menu_item_option_groups || [],
    employees: [
      { id: 'e-chu', full_name: 'Chị Nốc', phone: '0900000001', role: 'owner', hourly_rate: 0, is_active: true },
      { id: 'e-lan', full_name: 'Lan', phone: '0900000002', role: 'staff', hourly_rate: 25000, is_active: true },
      { id: 'e-minh', full_name: 'Minh', phone: '0900000003', role: 'staff', hourly_rate: 22000, is_active: true },
      { id: 'e-bep', full_name: 'Máy bếp', phone: '0900000009', role: 'kitchen', hourly_rate: 0, is_active: true },
      { id: 'e-bar', full_name: 'Máy pha chế', phone: '0900000008', role: 'bar', hourly_rate: 0, is_active: true }
    ],
    shifts: [], orders: [], order_items: [], order_stations: [], staff_calls: [], sales: [],
    seq: { option_groups: 100, option_choices: 100, menu_categories: 100, order_items: 1, staff_calls: 1 }
  };
  // Ca làm mẫu 10 ngày qua
  for (let d = 10; d >= 1; d--) {
    ['e-lan', 'e-minh'].forEach((eid, j) => {
      if (R() < 0.25) return;
      const emp = db.employees.find(e => e.id === eid);
      const start = startOfDay(now - d * 864e5).getTime() + (j ? 17 : 10.5) * 3600e3 + Math.round(R() * 20) * 60e3;
      const mins = 180 + Math.round(R() * 120);
      const pm = mins;
      db.shifts.push({ id: uuid(), employee_id: eid, employee_name: emp.full_name, check_in_at: new Date(start).toISOString(), check_in_photo: '', check_out_at: new Date(start + mins * 60e3).toISOString(), check_out_photo: '', hourly_rate: emp.hourly_rate, round_minutes: 1, round_mode: 'nearest', pay_round: 1000, actual_minutes: mins, paid_minutes: pm, pay_amount: roundMoney(pm * emp.hourly_rate / 60, 1000), note: null, paid_out_at: d > 7 ? new Date(now - 7 * 864e5).toISOString() : null });
    });
  }
  // Doanh thu mẫu 30 ngày qua
  const sellable = db.menu_items.filter(m => m.is_available);
  for (let d = 30; d >= 1; d--) {
    const day = startOfDay(now - d * 864e5).getTime(), dow = new Date(day).getDay();
    const n = 22 + Math.round(R() * 18) + (dow === 0 || dow === 6 ? 12 : 0);
    for (let i = 0; i < n; i++) {
      const hour = R() < 0.55 ? 11 + R() * 2.5 : 16.5 + R() * 4.5;
      const paid = day + hour * 3600e3;
      const items = []; let total = 0; const lines = 1 + Math.floor(R() * 3);
      for (let l = 0; l < lines; l++) {
        const m = sellable[Math.floor(Math.pow(R(), 1.6) * sellable.length)]; const qty = R() < 0.8 ? 1 : 2;
        items.push({ menu_item_id: m.id, name: m.name, price: m.price, qty, options: [] }); total += m.price * qty;
      }
      const cook = 5 + Math.round(R() * 12), bar = 3 + Math.round(R() * 5);
      const sts = new Set(items.map(i => stationOf(db, i.menu_item_id)));
      const station_minutes = {}; if (sts.has('bep')) station_minutes.bep = cook; if (sts.has('pha_che')) station_minutes.pha_che = bar;
      db.sales.push({ station_minutes, id: uuid(), queue_number: 1 + Math.floor(R() * 40), total, payment_method: R() < 0.6 ? 'chuyen_khoan' : 'tien_mat', items, ordered_at: new Date(paid - (cook + 18) * 60e3).toISOString(), accepted_at: new Date(paid - (cook + 15) * 60e3).toISOString(), served_at: new Date(paid - 15 * 60e3).toISOString(), paid_at: new Date(paid).toISOString(), cook_minutes: cook, cashier_id: 'e-lan', customer_name: DEMO_NAMES[(d * 7 + i) % DEMO_NAMES.length] });
    }
  }
  // Vài đơn đang mở để bếp và quầy pha chế có việc ngay
  const pick = n => db.menu_items.find(m => m.name === n);
  const mk = (queue, name, minsAgo, lines, note, cooking) => {
    const id = uuid(); let total = 0; const created = now - minsAgo * 60e3;
    lines.forEach(([nm, qty, opts, inote]) => {
      const m = pick(nm); const extra = (opts || []).reduce((s, o) => s + o.price, 0); total += (m.price + extra) * qty;
      db.order_items.push({ id: db.seq.order_items++, order_id: id, menu_item_id: m.id, item_name: m.name, unit_price: m.price + extra, options: opts || [], qty, note: inote || null, station: stationOf(db, m.id) });
    });
    db.orders.push({ id, access_token: uuid(), queue_number: queue, dine_type: queue ? 'tai_quan' : 'mang_ve', customer_name: name, customer_phone: null, note: note || null, status: 'cho_nhan', total, created_at: new Date(created).toISOString(), accepted_at: null, estimated_ready_at: null, served_at: null });
    [...new Set(db.order_items.filter(i => i.order_id === id).map(i => i.station))].forEach(st => {
      const on = (cooking || []).indexOf(st) >= 0;
      db.order_stations.push({ order_id: id, station: st, status: on ? 'dang_lam' : 'cho_nhan', accepted_at: on ? new Date(created + 60e3).toISOString() : null, estimated_ready_at: on ? new Date(created + 13 * 60e3).toISOString() : null, served_at: null });
    });
    refreshOrder(db, id);
  };
  mk(7, 'Minh', 6, [['Cơm heo chua ngọt', 1, [{ group: 'Topping thêm', choice: 'Trứng ốp la', price: 5000 }], 'ít cay'], ['Hồng trà sữa trân châu', 1]], null, ['bep']);
  mk(15, 'Thảo', 1, [['Kimbap chiên', 1], ['Tokbokki', 1], ['Trà đào', 2, [{ group: 'Size', choice: 'Size L', price: 5000 }]]], 'Mang ra cùng lúc giúp mình');
  mk(22, 'Vy', 2, [['Trà sữa trân châu đường đen', 1, null, 'ít đá'], ['Matcha latte', 1, [{ group: 'Đường', choice: 'Ít đường', price: 0 }]]]);
  mk(null, 'Hà', 3, [['Cơm gà viên', 1], ['Trà quất', 1, [{ group: 'Đá', choice: 'Ít đá', price: 0 }]]]); // đơn mang về (không có số thẻ)
  demoPromoSeed(db); demoStockSeed(db); demoPackSeed(db);
  return db;
}

/* Ưu đãi mẫu của bản xem thử */
function demoPromoSeed(db) {
  db.promotions = []; db.promotion_items = []; db.seq.promotion_items = db.seq.promotion_items || 1;
  const byName = n => db.menu_items.find(m => m.name === n && m.is_available);
  const cat = re => db.menu_items.filter(m => { const c = db.menu_categories.find(x => x.id === m.category_id); return m.is_available && c && re.test(c.name); });
  const add = (p, items) => { const id = uuid(); db.promotions.push(Object.assign({ id, created_at: new Date().toISOString() }, promoRow(p))); items.filter(i => i.m).forEach((i, k) => db.promotion_items.push({ id: db.seq.promotion_items++, promotion_id: id, part: i.part, menu_item_id: i.m.id, qty: i.qty || 1, sort_order: k + 1 })); };
  const com = byName('Cơm heo chua ngọt'), kim = byName('Kimbap chiên'), ts = cat(/^trà sữa/i);
  if (com && ts[0]) add({ name: 'Combo no nê', kind: 'combo', description: '2 cơm heo chua ngọt + 1 trà sữa', price: 85000, option_mode: 'cong_them', sort_order: 1 }, [{ part: 'combo', m: com, qty: 2 }, { part: 'combo', m: ts[0], qty: 1 }]);
  if (ts.length) add({ name: 'Mua 1 tặng 1 trà sữa', kind: 'mua_tang', description: 'Mua 1 ly trà sữa bất kỳ, tặng 1 ly giống hệt', buy_qty: 1, get_qty: 1, gift_same: true, option_mode: 'khong_phi', sort_order: 2 }, ts.map(m => ({ part: 'mua', m })));
  if (kim && cat(/^nước uống/i)[0]) add({ name: 'Mua 2 kimbap tặng 1 nước', kind: 'mua_tang', description: 'Giờ vàng buổi chiều', buy_qty: 2, get_qty: 1, option_mode: 'cong_them', time_from: '14:00', time_to: '17:00', sort_order: 3 }, [{ part: 'mua', m: kim }].concat(cat(/^nước uống/i).slice(0, 3).map(m => ({ part: 'tang', m }))));
  return db;
}
/* Kho mẫu của bản xem thử */
function demoPackSeed(db) {
  db.stock_packs = [['Thùng 24 gói', 'thùng', 'gói', 24], ['Thùng 4 can', 'thùng', 'can', 4], ['Can (nhập, dùng theo can)', 'can', 'can', 1], ['Bao 25 kg', 'bao', 'kg', 25], ['Thùng 48 hộp', 'thùng', 'hộp', 48], ['Thùng 20 cây', 'thùng', 'cây', 20]].map(([name, b, u, n], k) => ({ id: k + 1, name, buy_unit: b, use_unit: u, per_buy: n, sort_order: k + 1 }));
  db.seq.stock_packs = 7;
  (db.stock_items || []).forEach(it => { const pk = db.stock_packs.find(p => p.buy_unit === it.buy_unit && p.use_unit === it.use_unit && Number(p.per_buy) === Number(it.per_buy)); it.pack_id = pk ? pk.id : null; });
  return db;
}
function demoStockSeed(db) {
  db.stock_items = []; db.stock_moves = []; db.seq.stock_moves = 1;
  [['Mì Hàn Quốc', 'Đồ khô', 'gói', 'thùng', 24, 30, 10, 312000], ['Đường pha chế', 'Nguyên liệu pha chế', 'can', 'can', 1, 3, 2, 95000], ['Dầu ăn', 'Gia vị', 'can', 'thùng', 4, 2, 1, 420000],
   ['Trân châu đen', 'Nguyên liệu pha chế', 'gói', 'thùng', 20, 8, 5, 560000], ['Sữa đặc', 'Nguyên liệu pha chế', 'hộp', 'thùng', 48, 60, 12, 1150000], ['Ly nhựa 700ml', 'Bao bì', 'cây', 'thùng', 20, 4, 5, 380000]]
    .forEach(([name, grp, use, buy, per, qty, min, cost], k) => db.stock_items.push({ id: uuid(), name, grp, use_unit: use, buy_unit: buy, per_buy: per, qty, min_qty: min, cost_per_buy: cost, note: null, is_active: true, sort_order: k, created_at: new Date().toISOString() }));
  // Mã vạch mẫu: gõ 8934563000016 (gói mì) hoặc 8934563000023 (thùng mì) vào ô Quét mã để thử
  const mi = db.stock_items[0];
  db.stock_barcodes = [{ code: '8934563000016', item_id: mi.id, unit_kind: 'use', created_by: 'Mẫu', created_at: new Date().toISOString() }, { code: '8934563000023', item_id: mi.id, unit_kind: 'buy', created_by: 'Mẫu', created_at: new Date().toISOString() }];
  return db;
}
/* Đơn online mẫu của bản xem thử (đơn bot đọc từ ảnh chụp gửi qua Zalo) */
function demoFbSeed(db) {
  const now = Date.now(), at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() < now + 30 * 60e3) d.setTime(now + 60 * 60e3); return d.toISOString(); };
  const mi = n => db.menu_items.find(m => m.name === n && m.is_available) || db.menu_items.find(m => m.is_available);
  const defs = m => db.menu_item_option_groups.filter(l => l.menu_item_id === m.id).map(l => db.option_groups.find(g => g.id === l.group_id)).filter(g => g && g.min_select > 0)
    .map(g => db.option_choices.find(c => c.group_id === g.id && c.is_default) || db.option_choices.find(c => c.group_id === g.id)).filter(Boolean);
  const line = (n, qty, extra) => { const m = mi(n); const cs = defs(m); const ex = extra ? db.option_choices.filter(c => extra.indexOf(c.name) >= 0 && db.menu_item_option_groups.some(l => l.menu_item_id === m.id && l.group_id === c.group_id)) : [];
    const all = cs.filter(c => !ex.some(x => x.group_id === c.group_id)).concat(ex);
    return { menu_item_id: m.id, name: m.name, qty, choice_ids: all.map(c => c.id), choices: ex.map(c => c.name), note: null, price: m.price + all.reduce((t, c) => t + (c.price_delta || 0), 0), drink: DRINK_CATS.test((db.menu_categories.find(c => c.id === m.category_id) || {}).name || '') }; };
  const t = (min) => new Date(now - min * 60e3).toISOString();
  db.fb_threads = []; db.fb_messages = [];
  db.bot_users = [{ kenh: 'zalo', chat_id: 'demo-zalo', name: 'Chủ quán (mẫu)', created_at: t(60 * 24) }];
  const i1 = [line('Cơm gà viên', 2, ['Trứng ốp la']), line('Hồng trà sữa trân châu', 2, ['Ít đá'])];
  const i2 = [line('Kimbap chiên', 1), line('Hồng trà sữa trân châu', 1)];
  const sum = a => a.reduce((s, i) => s + i.price * i.qty, 0);
  db.fb_drafts = [
    { id: uuid(), psid: null, kenh: 'zalo', chat_id: 'demo-zalo', nguoi_gui: 'Chủ quán (mẫu)', anh: [], status: 'cho_duyet', dine_type: 'giao_hang', at: at(18, 30), customer_name: 'Nguyễn Thu Hà', customer_phone: '0912345678', address: '12 ngõ 5 Nguyễn Trãi, Thanh Xuân', note: null, items: i1, unknown: [], missing: [], total_est: sum(i1), asked: [], changed_after: false, created_at: t(10), updated_at: t(3),
      convo: [{ s: 'khach', t: 'shop ơi cho mình 2 cơm gà viên thêm trứng, 2 ts trân châu ít đá' }, { s: 'quan', t: 'Dạ mình qua lấy hay ship ạ?' }, { s: 'khach', t: 'ship 6r tối nha, 12 ngõ 5 nguyễn trãi thanh xuân, sdt 0912345678' }, { s: 'quan', t: 'Dạ vâng ạ' }] },
    { id: uuid(), psid: null, kenh: 'zalo', chat_id: 'demo-zalo', nguoi_gui: 'Chủ quán (mẫu)', anh: [], status: 'cho_duyet', dine_type: 'mang_ve', at: null, customer_name: 'Trần Minh Đức', customer_phone: null, address: null, note: null, items: i2, unknown: [], missing: ['at'], total_est: sum(i2), asked: [], changed_after: false, created_at: t(9), updated_at: t(6),
      convo: [{ s: 'khach', t: '1 kimbap chiên 1 ts nhé, mình qua lấy' }, { s: 'quan', t: 'Dạ mấy giờ mình qua ạ?' }] }
  ];
  if (db.shop_settings.fb_open == null) Object.assign(db.shop_settings, { fb_open: '07:00', fb_close: '22:00' });
  return db;
}
function demoApi() {
  let cache = null;
  const load = () => {
    if (cache) return cache;
    cache = store.get(DEMO_KEY, null);
    if (!cache || !cache.menu_items) { cache = demoSeed(); store.set(DEMO_KEY, cache); }
    if (!cache.promotions) { demoPromoSeed(cache); store.set(DEMO_KEY, cache); } // dữ liệu xem thử cũ: thêm ưu đãi mẫu
    if (!cache.stock_items) { demoStockSeed(cache); store.set(DEMO_KEY, cache); } // thêm kho mẫu
    if (!cache.stock_packs) { demoPackSeed(cache); store.set(DEMO_KEY, cache); } // thêm quy cách mẫu
    if (!cache.stock_barcodes) { cache.stock_barcodes = []; store.set(DEMO_KEY, cache); }
    return cache;
  };
  const save = () => {
    if (!store.set(DEMO_KEY, cache)) ui.toast('Bộ nhớ trình duyệt đầy. Bớt ảnh hoặc xoá dữ liệu xem thử trong Cài đặt.');
    window.dispatchEvent(new Event('benoc-db'));
  };
  window.addEventListener('storage', e => { if (e.key === SP + DEMO_KEY) { cache = null; window.dispatchEvent(new Event('benoc-db')); } });
  const tx = fn => { const db = load(); const r = fn(db); save(); return r; };
  const me = () => { const id = store.get(SESSION_KEY, null); const e = id && load().employees.find(x => x.id === id && x.is_active); return e || null; };
  const need = role => { const e = me(); if (!e || (role && e.role !== role)) fail('FORBIDDEN'); return e; };
  const iso = () => new Date().toISOString();
  const ordersAhead = (db, o) => {
    const sts = new Set(db.order_stations.filter(x => x.order_id === o.id).map(x => x.station));
    return new Set(db.order_stations.filter(x => sts.has(x.station) && (x.status === 'cho_nhan' || x.status === 'dang_lam')).map(x => x.order_id)
      .filter(id => { const y = db.orders.find(z => z.id === id); return y && y.created_at < o.created_at; })).size;
  };

  const api = {
    /* ---------- Khách ---------- */
    async getMenu() { await wait(120); return buildPublicMenu(load()); },
    async getPromotions() { await wait(60); return buildPublicPromos(load()); },
    async paymentInfo() { const st = load().shop_settings; return st.bank_account ? { bin: st.bank_bin, bank: st.bank_name, account: st.bank_account, holder: st.bank_holder || '', note: st.bank_note || NOTE_DEFAULT } : null; },
    async placeOrder({ queue, name, phone, items, confirm, note, dine, address, deliverAt }) {
      await wait(350);
      if (dine === 'giao_hang') { need(); if (!String(address || '').trim()) fail('MISSING_ADDRESS'); }
      const takeaway = dine === 'mang_ve' || dine === 'giao_hang'; if (takeaway) queue = null;
      if (!takeaway && !(queue > 0)) fail('MISSING_QUEUE_NUMBER');
      if (!String(name || '').trim()) fail('MISSING_NAME');
      if (!items || !items.length) fail('EMPTY_ORDER');
      return tx(db => {
        const dup = !takeaway && db.orders.find(o => o.queue_number === queue);
        if (dup && !confirm) fail('DUPLICATE_QUEUE', 'Số ' + queue + ' đang có đơn của ' + dup.customer_name + ' chưa thanh toán');
        const id = uuid(); const { lines, total } = demoLines(db, id, items);
        const o = { id, access_token: uuid(), queue_number: queue, pickup: dine === 'mang_ve' && !!me(), dine_type: dine === 'giao_hang' ? 'giao_hang' : takeaway ? 'mang_ve' : 'tai_quan', address: dine === 'giao_hang' ? String(address).trim() : null, deliver_at: dine === 'giao_hang' ? (deliverAt || null) : null, paid_amount: null, paid_method: null, customer_name: String(name).trim(), customer_phone: phone ? String(phone).trim() : null, note: note ? String(note).trim().slice(0, 300) : null, status: 'cho_nhan', total, created_at: iso(), accepted_at: null, estimated_ready_at: null, served_at: null };
        db.orders.push(o); lines.forEach(l => db.order_items.push(l));
        [...new Set(lines.map(l => l.station))].forEach(st => db.order_stations.push({ order_id: id, station: st, status: 'cho_nhan', accepted_at: null, estimated_ready_at: null, served_at: null }));
        return { order_id: o.id, access_token: o.access_token, total };
      });
    },
    async watchOrder() { return () => {}; }, // bản xem thử tự hỏi lại 2 giây/lần
    async watchMenu(onChange) { const h = () => onChange(); window.addEventListener('benoc-db', h); return () => window.removeEventListener('benoc-db', h); },
    async staffSession() { return me(); },
    async getMyOrder(token) {
      const db = load(); const o = db.orders.find(x => x.access_token === token); if (!o) return null;
      return {
        queue_number: o.queue_number, dine_type: o.dine_type || 'tai_quan', address: o.address || null, deliver_at: o.deliver_at || null, paid_amount: o.paid_amount == null ? null : o.paid_amount, customer_name: o.customer_name, status: o.status, total: o.total, note: o.note,
        created_at: o.created_at, estimated_ready_at: o.estimated_ready_at, orders_ahead: ordersAhead(db, o),
        has_open_call: db.staff_calls.some(c => c.order_id === o.id && !c.resolved_at),
        stations: db.order_stations.filter(x => x.order_id === o.id).map(x => ({ station: x.station, status: x.status, estimated_ready_at: x.estimated_ready_at })).sort((a, b) => a.station < b.station ? -1 : 1),
        items: db.order_items.filter(i => i.order_id === o.id).map(i => ({ name: i.item_name, qty: i.qty, note: i.note, price: i.unit_price, options: i.options, station: i.station, promo_name: i.promo_name || null, promo_kind: i.promo_kind || null, promo_group: i.promo_group || null, promo_part: i.promo_part || null }))
      };
    },
    async callStaff(token) {
      tx(db => {
        const o = db.orders.find(x => x.access_token === token); if (!o) fail('ORDER_NOT_FOUND');
        if (db.staff_calls.some(c => c.order_id === o.id && !c.resolved_at)) return;
        db.staff_calls.push({ id: db.seq.staff_calls++, order_id: o.id, queue_number: o.queue_number, message: null, created_at: iso(), resolved_at: null });
      });
    },

    /* ---------- Đăng nhập (xem thử: chọn nhanh tài khoản) ---------- */
    async session() { const e = me(); return e ? { user: { id: e.id }, employee: e } : null; },
    async demoLogin(employeeId) { if (!load().employees.some(e => e.id === employeeId && e.is_active)) return null; store.set(SESSION_KEY, employeeId); return api.session(); },
    async signIn(phone) { const e = load().employees.find(x => x.phone === String(phone).replace(/\D/g, '') && x.is_active); if (!e) fail('LOGIN_FAILED'); return api.demoLogin(e.id); },
    async signOut() { store.del(SESSION_KEY); },
    async hasOwner() { return true; },
    async setupOwner() { fail('OWNER_EXISTS'); },

    /* ---------- Bếp ---------- */
    async kitchenOrders() {
      need(); const db = load();
      return db.orders.slice().sort((a, b) => a.created_at < b.created_at ? -1 : 1).map(o => Object.assign({}, o, {
        items: db.order_items.filter(i => i.order_id === o.id),
        stations: db.order_stations.filter(x => x.order_id === o.id),
        calls: db.staff_calls.filter(c => c.order_id === o.id && !c.resolved_at)
      }));
    },
    onKitchenChange(cb) { const h = () => cb(); window.addEventListener('benoc-db', h); return () => window.removeEventListener('benoc-db', h); },
    async suggestWait(id, station) {
      station = station || 'bep'; const db = load();
      const own = Math.max.apply(null, [0].concat(db.order_items.filter(i => i.order_id === id && i.station === station).map(i => { const m = db.menu_items.find(x => x.id === i.menu_item_id); return m ? m.prep_minutes : 0; }))) || 10;
      const ahead = db.order_stations.filter(x => x.station === station && x.status === 'dang_lam').length;
      const recent = db.sales.filter(s => s.station_minutes && s.station_minutes[station] != null && new Date(s.paid_at) > Date.now() - 14 * 864e5);
      const avg = recent.length ? recent.reduce((s, x) => s + x.station_minutes[station], 0) / recent.length : own;
      const cap = station === 'pha_che' ? (db.shop_settings.bar_capacity || 2) : db.shop_settings.kitchen_capacity;
      return Math.ceil((own + Math.floor(ahead / Math.max(1, cap)) * avg) / 5) * 5;
    },
    async acceptOrder(id, minutes, station) { need(); tx(db => { const x = db.order_stations.find(r => r.order_id === id && r.station === (station || 'bep') && r.status === 'cho_nhan'); if (x) { x.status = 'dang_lam'; x.accepted_at = iso(); x.estimated_ready_at = new Date(Date.now() + Math.max(1, minutes) * 60e3).toISOString(); } refreshOrder(db, id); }); },
    async extendWait(id, minutes, station) { need(); tx(db => { const x = db.order_stations.find(r => r.order_id === id && r.station === (station || 'bep') && r.status === 'dang_lam'); if (x) x.estimated_ready_at = new Date(Math.max(Date.now(), new Date(x.estimated_ready_at || 0).getTime()) + minutes * 60e3).toISOString(); refreshOrder(db, id); }); },
    async markServed(id, station) { need(); tx(db => { const x = db.order_stations.find(r => r.order_id === id && r.station === (station || 'bep') && r.status === 'dang_lam'); if (x) { x.status = 'da_ra_mon'; x.served_at = iso(); } refreshOrder(db, id); }); },
    async cancelOrder(id) { need(); tx(db => { db.orders = db.orders.filter(o => o.id !== id); db.order_items = db.order_items.filter(i => i.order_id !== id); db.order_stations = db.order_stations.filter(x => x.order_id !== id); db.staff_calls = db.staff_calls.filter(c => c.order_id !== id); }); },
    async completePayment(id, method) {
      const e = need();
      tx(db => {
        const o = db.orders.find(x => x.id === id); if (!o) fail('ORDER_NOT_FOUND');
        Object.assign(o, { paid_amount: o.total, paid_method: method, paid_at: iso(), paid_by: e.id });
        if (o.status === 'da_ra_mon') demoFinalize(db, id, method, e.id); // đã ra món: thu xong là đóng đơn; chưa ra món: ghi đã thu trước
      });
    },
    async staffAddItems(id, items) {
      need();
      return tx(db => {
        const o = db.orders.find(x => x.id === id); if (!o) fail('ORDER_NOT_FOUND');
        const { lines } = demoLines(db, id, items); lines.forEach(l => db.order_items.push(l));
        [...new Set(lines.map(l => l.station))].forEach(st => {
          const x = db.order_stations.find(r => r.order_id === id && r.station === st);
          if (!x) db.order_stations.push({ order_id: id, station: st, status: 'cho_nhan', accepted_at: null, estimated_ready_at: null, served_at: null });
          else if (x.status === 'da_ra_mon') Object.assign(x, { status: 'cho_nhan', accepted_at: null, estimated_ready_at: null, served_at: null });
        });
        o.total = demoTotal(db, id); refreshOrder(db, id); return o.total;
      });
    },
    async staffSetItemQty(itemId, qty) {
      need();
      return tx(db => {
        const it = db.order_items.find(i => i.id === itemId); if (!it) fail('ITEM_NOT_FOUND');
        const id = it.order_id, grp = it.promo_group || null;
        if (grp && qty > 0) fail('PROMO_LOCKED');
        if (!(qty > 0)) {
          const gone = i => i.id === itemId || (grp && i.order_id === id && i.promo_group === grp);
          if (!db.order_items.some(i => i.order_id === id && !gone(i))) fail('ORDER_WOULD_BE_EMPTY', 'Đơn chỉ còn món này. Muốn bỏ hết thì huỷ đơn.');
          db.order_items = db.order_items.filter(i => !gone(i));
          db.order_stations = db.order_stations.filter(x => x.order_id !== id || db.order_items.some(i => i.order_id === id && i.station === x.station));
        } else it.qty = Math.min(50, qty);
        const o = db.orders.find(x => x.id === id); o.total = demoTotal(db, id); refreshOrder(db, id);
        return db.orders.some(x => x.id === id) ? o.total : null;
      });
    },
    async staffUpdateOrder(id, dine, queue) {
      need();
      return tx(db => {
        const o = db.orders.find(x => x.id === id); if (!o) fail('ORDER_NOT_FOUND');
        if (o.dine_type === 'giao_hang') fail('DELIVERY_LOCKED');
        if (dine !== 'tai_quan' && dine !== 'mang_ve') fail('BAD_DINE');
        if (dine === 'tai_quan' && !(queue > 0)) fail('MISSING_QUEUE_NUMBER');
        o.dine_type = dine; o.queue_number = dine === 'tai_quan' ? queue : null; if (dine !== 'mang_ve') o.pickup = false;
        const dup = dine === 'tai_quan' && db.orders.find(x => x.id !== id && x.queue_number === queue);
        return { duplicate_with: dup ? dup.customer_name : null };
      });
    },
    async staffSetItemOptions(itemId, choiceIds) {
      need();
      return tx(db => {
        const it = db.order_items.find(i => i.id === itemId); if (!it) fail('ITEM_NOT_FOUND');
        const m = db.menu_items.find(x => x.id === it.menu_item_id); if (!m) fail('ITEM_UNAVAILABLE', it.item_name);
        let { extra, opts } = demoOptions(db, m, choiceIds || []);
        const base = it.unit_price - (it.options || []).reduce((s, x) => s + (x.price || 0), 0);
        const p = it.promo_group && it.promo_part !== 'mua' && (db.promotions || []).find(x => x.id === it.promo_id);
        if (p && p.option_mode === 'khong_phi' && opts.some(x => x.price > 0)) fail('PROMO_OPTION', it.item_name + ' trong ưu đãi không chọn được tuỳ chọn có phí');
        if (p && p.option_mode === 'mien_phi') { extra = 0; opts = opts.map(x => Object.assign({}, x, { price: 0 })); }
        Object.assign(it, { options: opts, unit_price: base + extra, edited_at: iso() });
        const st = db.order_stations.find(x => x.order_id === it.order_id && x.station === it.station);
        if (st && st.status === 'da_ra_mon') Object.assign(st, { status: 'cho_nhan', accepted_at: null, estimated_ready_at: null, served_at: null });
        const o = db.orders.find(x => x.id === it.order_id); o.total = demoTotal(db, o.id); refreshOrder(db, o.id);
        return o.total;
      });
    },
    async resolveCall(id) { need(); tx(db => { const c = db.staff_calls.find(x => x.id === id); if (c) c.resolved_at = iso(); }); },

    /* ---------- Menu (quản lý) ---------- */
    async adminMenu() { const db = load(); return assembleAdminMenu(db.menu_categories.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id), db.menu_items.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'vi')), db.option_groups.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id), db.option_choices, db.menu_item_option_groups); },
    async saveCategory(cat) {
      need('owner');
      return tx(db => {
        if (cat.id) { Object.assign(db.menu_categories.find(c => c.id === cat.id), { name: cat.name, color: cat.color, station: cat.station || 'bep', sort_order: cat.sort_order || 0 }); return cat.id; }
        const id = db.seq.menu_categories++; db.menu_categories.push({ id, name: cat.name, color: cat.color, station: cat.station || 'bep', sort_order: cat.sort_order || 99 }); return id;
      });
    },
    async deleteCategory(id) { need('owner'); tx(db => { db.menu_categories = db.menu_categories.filter(c => c.id !== id); db.menu_items.forEach(m => { if (m.category_id === id) m.category_id = null; }); }); },
    async saveItem(it, groupIds) {
      need('owner');
      return tx(db => {
        const row = { name: it.name, category_id: it.category_id || null, price: it.price, description: it.description || null, tag: it.tag || null, prep_minutes: it.prep_minutes || 5, is_available: it.is_available !== false, image_path: it.image_path || null, sort_order: it.sort_order || 0 };
        let id = it.id;
        if (id) Object.assign(db.menu_items.find(m => m.id === id), row); else { id = uuid(); db.menu_items.push(Object.assign({ id }, row)); }
        db.menu_item_option_groups = db.menu_item_option_groups.filter(l => l.menu_item_id !== id);
        (groupIds || []).forEach((g, i) => db.menu_item_option_groups.push({ menu_item_id: id, group_id: g, sort_order: i + 1 }));
        return id;
      });
    },
    async deleteItem(id) { need('owner'); tx(db => { db.menu_items = db.menu_items.filter(m => m.id !== id); db.menu_item_option_groups = db.menu_item_option_groups.filter(l => l.menu_item_id !== id); }); },
    async setItemAvailable(id, on) { need('owner'); tx(db => { db.menu_items.find(m => m.id === id).is_available = on; }); },
    async uploadMenuImage(file) { need('owner'); return blobToDataUrl(await toJpeg(file, 480, 0.78)); },
    async saveGroup(g) {
      need('owner');
      return tx(db => {
        const row = { name: g.name, title: g.title, kind: g.kind === 'do_uong' ? 'do_uong' : 'do_an', min_select: g.min_select, max_select: g.max_select, sort_order: g.sort_order || 0 };
        let id = g.id;
        if (id) Object.assign(db.option_groups.find(x => x.id === id), row); else { id = db.seq.option_groups++; db.option_groups.push(Object.assign({ id }, row)); }
        const keep = g.choices.filter(c => c.id).map(c => c.id);
        db.option_choices = db.option_choices.filter(c => c.group_id !== id || keep.indexOf(c.id) >= 0);
        g.choices.forEach((ch, i) => {
          const r = { group_id: id, name: ch.name, price_delta: ch.price_delta || 0, is_default: !!ch.is_default, is_available: ch.is_available !== false, sort_order: i + 1 };
          if (ch.id) Object.assign(db.option_choices.find(c => c.id === ch.id), r); else db.option_choices.push(Object.assign({ id: db.seq.option_choices++ }, r));
        });
        return id;
      });
    },
    async deleteGroup(id) { need('owner'); tx(db => { db.option_groups = db.option_groups.filter(g => g.id !== id); db.option_choices = db.option_choices.filter(c => c.group_id !== id); db.menu_item_option_groups = db.menu_item_option_groups.filter(l => l.group_id !== id); }); },

    /* ---------- Ưu đãi (quản lý) ---------- */
    async adminPromotions() { const db = load(); return (db.promotions || []).slice().sort((a, b) => a.sort_order - b.sort_order || (a.created_at < b.created_at ? 1 : -1)).map(p => Object.assign({}, p, { items: db.promotion_items.filter(i => i.promotion_id === p.id).sort((a, b) => a.sort_order - b.sort_order) })); },
    async savePromotion(p) {
      need('owner');
      return tx(db => {
        const row = promoRow(p); let id = p.id;
        if (id) Object.assign(db.promotions.find(x => x.id === id), row); else { id = uuid(); db.promotions.push(Object.assign({ id, created_at: iso() }, row)); }
        db.promotion_items = db.promotion_items.filter(i => i.promotion_id !== id);
        p.items.forEach((i, k) => db.promotion_items.push({ id: db.seq.promotion_items++, promotion_id: id, part: i.part, menu_item_id: i.menu_item_id, qty: i.qty || 1, sort_order: k + 1 }));
        return id;
      });
    },
    async promoUsage() { const db = load(); const o = {}; (db.promotions || []).filter(p => p.limit_qty).forEach(p => { o[p.id] = demoPromoUsed(db, p); }); return o; },
    async setPromotionActive(id, on) { need('owner'); tx(db => { db.promotions.find(p => p.id === id).is_active = on; }); },
    async deletePromotion(id) { need('owner'); tx(db => { db.promotions = db.promotions.filter(p => p.id !== id); db.promotion_items = db.promotion_items.filter(i => i.promotion_id !== id); db.order_items.forEach(i => { if (i.promo_id === id) i.promo_id = null; }); }); },

    /* ---------- Kho hàng ---------- */
    async stockItems() { need(); return load().stock_items.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'vi')).map(x => Object.assign({}, x)); },
    async saveStockItem(it) {
      need('owner');
      const id = tx(db => { const row = stockRow(it); if (it.id) { Object.assign(db.stock_items.find(x => x.id === it.id), row); return it.id; } const nid = uuid(); db.stock_items.push(Object.assign({ id: nid, qty: 0, created_at: iso() }, row)); return nid; });
      if (!it.id && Number(it.qty) > 0) await api.stockMove(id, 'kiem', Number(it.qty), false, 'Tồn ban đầu');
      return id;
    },
    async stockPacks() { need(); return load().stock_packs.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'vi')).map(x => Object.assign({}, x)); },
    async saveStockPack(pk) {
      need('owner');
      return tx(db => {
        const row = packRow(pk);
        if (db.stock_packs.some(x => x.name === row.name && x.id !== pk.id)) fail('Đã có quy cách tên này.');
        if (pk.id) { Object.assign(db.stock_packs.find(x => x.id === pk.id), row); db.stock_items.forEach(it => { if (it.pack_id === pk.id) Object.assign(it, { buy_unit: row.buy_unit, use_unit: row.use_unit, per_buy: row.per_buy }); }); return pk.id; }
        const id = db.seq.stock_packs++; db.stock_packs.push(Object.assign({ id }, row)); return id;
      });
    },
    async deleteStockPack(id) { need('owner'); tx(db => { db.stock_packs = db.stock_packs.filter(x => x.id !== id); db.stock_items.forEach(it => { if (it.pack_id === id) it.pack_id = null; }); }); },
    async deleteStockItem(id) { need('owner'); tx(db => { db.stock_items = db.stock_items.filter(x => x.id !== id); db.stock_moves = db.stock_moves.filter(m => m.item_id !== id); db.stock_barcodes = (db.stock_barcodes || []).filter(b => b.item_id !== id); }); },
    async stockMove(itemId, kind, amount, inBuy, note, cost) {
      const e = need();
      return tx(db => {
        if (['nhap', 'dung', 'hong', 'kiem'].indexOf(kind) < 0) fail('BAD_KIND');
        amount = Number(amount); if (!(amount >= 0) || (kind !== 'kiem' && amount === 0)) fail('BAD_QTY');
        const it = db.stock_items.find(x => x.id === itemId); if (!it) fail('ITEM_NOT_FOUND');
        const use = amount * (inBuy ? it.per_buy : 1), delta = kind === 'nhap' ? use : kind === 'kiem' ? use - it.qty : -use;
        it.qty = Math.round((it.qty + delta) * 1000) / 1000;
        db.stock_moves.push({ id: db.seq.stock_moves++, item_id: it.id, kind, delta, qty_after: it.qty, amount, unit: inBuy ? it.buy_unit : it.use_unit, cost: kind === 'nhap' && cost !== '' && cost != null ? Number(cost) : null, note: note ? String(note).trim().slice(0, 200) || null : null, employee_id: e.id, employee_name: e.full_name, created_at: iso() });
        return { qty: it.qty, delta };
      });
    },
    async stockBarcodes() { need(); return (load().stock_barcodes || []).map(x => Object.assign({}, x)); },
    async linkBarcode(code, itemId, unitKind, replace) {
      const e = need();
      tx(db => {
        db.stock_barcodes = db.stock_barcodes || []; code = String(code).trim();
        if (!/^[0-9A-Za-z.\-]{3,64}$/.test(code)) fail('Mã vạch không hợp lệ.');
        const ex = db.stock_barcodes.find(x => x.code === code);
        if (ex && !replace) fail('duplicate key value violates unique constraint "stock_barcodes_pkey"');
        if (ex && e.role !== 'owner') fail('FORBIDDEN');
        db.stock_barcodes = db.stock_barcodes.filter(x => x.code !== code);
        db.stock_barcodes.push({ code, item_id: itemId, unit_kind: unitKind === 'use' ? 'use' : 'buy', created_by: e.full_name, created_at: iso() });
      });
    },
    async unlinkBarcode(code) { need('owner'); tx(db => { db.stock_barcodes = (db.stock_barcodes || []).filter(x => x.code !== code); }); },

    /* ---------- Đơn online (bản xem thử: dữ liệu mẫu, không nối Zalo thật) ---------- */
    async fbDrafts() { need('owner'); const db = load(); if (!db.fb_drafts || !db.bot_users) { demoFbSeed(db); save(); } return { drafts: db.fb_drafts.filter(d => d.status !== 'huy').map(d => JSON.parse(JSON.stringify(d))), threads: db.fb_threads.map(t => Object.assign({}, t)) }; },
    onFbChange(cb) { const h = () => cb(); window.addEventListener('benoc-db', h); return () => window.removeEventListener('benoc-db', h); },
    async fbMessages(psid) { need('owner'); return (load().fb_messages || []).filter(m => m.psid === psid).map(m => Object.assign({}, m)); },
    async fbApprove(id, f) {
      const e = need('owner');
      const d = load().fb_drafts.find(x => x.id === id); if (!d) fail('DRAFT_NOT_FOUND'); if (d.status === 'da_duyet') fail('DRAFT_DONE', 'Đơn này đã duyệt rồi');
      if (!f.at) fail('MISSING_TIME', 'Nhập giờ hẹn');
      const r = await api.placeOrder({ name: f.name, phone: f.phone, items: f.items, note: f.note, dine: f.dine === 'giao_hang' ? 'giao_hang' : 'mang_ve', address: f.address, deliverAt: f.at });
      tx(db => {
        const o = db.orders.find(x => x.id === r.order_id); Object.assign(o, { deliver_at: f.at, source: 'fb' });
        if (f.dine === 'tai_quan') Object.assign(o, { dine_type: 'tai_quan', pickup: false, queue_number: null });
        Object.assign(db.fb_drafts.find(x => x.id === id), { status: 'da_duyet', order_id: o.id, approved_by: e.full_name, approved_at: iso(), dine_type: f.dine, at: f.at, customer_name: f.name, customer_phone: f.phone || null, address: f.address || null, note: f.note || null, total_est: r.total, changed_after: false, updated_at: iso() });
      });
      return { order_id: r.order_id, total: r.total };
    },
    async fbCancel(id) { need('owner'); tx(db => { db.fb_drafts.find(x => x.id === id).status = 'huy'; }); },
    async fbThread(psid, patch) { need('owner'); tx(db => { Object.assign(db.fb_threads.find(x => x.psid === psid), patch); }); },
    async fbBotSettings(patch) { need('owner'); tx(db => { Object.assign(db.shop_settings, patch); }); },
    async fbTrainStats() { need('owner'); return { total: 0, gold: 0, fixed: 0, demo: true }; },
    async fbTrainExport() { need('owner'); return { rows: [], menus: [] }; },
    async fbCount() { const db = load(); if (!db.fb_drafts) return 0; return db.fb_drafts.filter(d => d.status === 'cho_duyet').length + db.fb_threads.filter(t => t.need_human).length; },
    async fbCall(body) { need('owner'); await wait(300); return { ok: true, demo: true }; },
    async botUsers() { need('owner'); const db = load(); if (!db.bot_users) { demoFbSeed(db); save(); } return db.bot_users.map(x => Object.assign({}, x)); },
    async botUserDel(kenh, chatId) { need('owner'); tx(db => { db.bot_users = (db.bot_users || []).filter(x => !(x.kenh === kenh && x.chat_id === chatId)); }); },
    async botLinkCode() { need('owner'); return { code: String(Math.floor(100000 + Math.random() * 900000)), until: new Date(Date.now() + 600e3).toISOString(), demo: true }; },
    async draftImages() { return []; },
    async stockMoves(f) { need(); return load().stock_moves.filter(m => (!f || !f.itemId || m.item_id === f.itemId) && (!f || !f.kind || m.kind === f.kind) && (!f || !f.from || new Date(m.created_at) >= new Date(f.from))).sort((a, b) => a.created_at < b.created_at ? 1 : -1).slice(0, (f && f.limit) || 100); },

    /* ---------- Nhân viên & chấm công ---------- */
    async employees() { return load().employees.slice().sort((a, b) => (b.is_active - a.is_active) || a.full_name.localeCompare(b.full_name, 'vi')); },
    async saveEmployee(e) {
      need('owner');
      return tx(db => {
        const row = { full_name: e.full_name, phone: e.phone ? String(e.phone).replace(/\D/g, '') : null, role: e.role, hourly_rate: Number(e.hourly_rate) || 0, is_active: e.is_active !== false };
        if (row.phone && db.employees.some(x => x.phone === row.phone && x.id !== e.id)) fail('PHONE_TAKEN');
        if (e.id) { Object.assign(db.employees.find(x => x.id === e.id), row); return e.id; }
        const id = uuid(); db.employees.push(Object.assign({ id }, row)); return id;
      });
    },
    async shifts(f) {
      f = f || {};
      return load().shifts.filter(s => (!f.from || new Date(s.check_in_at) >= new Date(f.from)) && (!f.to || new Date(s.check_in_at) < new Date(f.to)) && (!f.employeeId || s.employee_id === f.employeeId))
        .sort((a, b) => a.check_in_at < b.check_in_at ? 1 : -1).slice(0, f.limit || 1e9);
    },
    async photoUrl(path) { return path || null; },
    async updateShift(id, inAt, outAt, note) {
      need('owner');
      return tx(db => {
        const s = db.shifts.find(x => x.id === id); if (!s) fail('NOT_FOUND');
        const a = new Date(inAt), b = outAt ? new Date(outAt) : null;
        if (b && b <= a) fail('BAD_TIME');
        s.check_in_at = a.toISOString(); s.note = note ? String(note).trim() : null;
        if (!b) { Object.assign(s, { check_out_at: null, actual_minutes: null, paid_minutes: null, pay_amount: null }); return s; }
        const cfg = db.shop_settings; const m = Math.floor((b - a) / 60000);
        s.round_minutes = s.round_minutes || cfg.round_minutes; s.round_mode = s.round_mode || cfg.round_mode; s.pay_round = s.pay_round || cfg.pay_round || 1000;
        const pm = applyRounding(m, s.round_minutes, s.round_mode);
        Object.assign(s, { check_out_at: b.toISOString(), actual_minutes: m, paid_minutes: pm, pay_amount: roundMoney(pm * s.hourly_rate / 60, s.pay_round) });
        return s;
      });
    },
    async markShiftsPaid(ids) { need('owner'); tx(db => db.shifts.forEach(s => { if (ids.indexOf(s.id) >= 0) s.paid_out_at = iso(); })); },
    async myOpenShift() { const e = need(); const s = load().shifts.find(x => x.employee_id === e.id && !x.check_out_at); return s || null; },
    async myShifts(limit) { const e = need(); return api.shifts({ employeeId: e.id, limit: limit || 20 }); },
    async checkIn(file) {
      const e = need(); const photo = await blobToDataUrl(await toJpeg(file, 360, 0.7));
      return tx(db => {
        if (db.shifts.some(s => s.employee_id === e.id && !s.check_out_at)) fail('ALREADY_CHECKED_IN');
        const s = { id: uuid(), employee_id: e.id, employee_name: e.full_name, check_in_at: iso(), check_in_photo: photo, check_out_at: null, check_out_photo: null, hourly_rate: e.hourly_rate, round_minutes: null, round_mode: null, actual_minutes: null, paid_minutes: null, pay_amount: null, note: null, paid_out_at: null };
        db.shifts.push(s); return s.id;
      });
    },
    async checkOut(file) {
      const e = need(); const photo = await blobToDataUrl(await toJpeg(file, 360, 0.7));
      return tx(db => {
        const s = db.shifts.find(x => x.employee_id === e.id && !x.check_out_at); if (!s) fail('NOT_CHECKED_IN');
        const cfg = db.shop_settings; const m = Math.floor((Date.now() - new Date(s.check_in_at)) / 60000); const pm = applyRounding(m, cfg.round_minutes, cfg.round_mode);
        Object.assign(s, { check_out_at: iso(), check_out_photo: photo, round_minutes: cfg.round_minutes, round_mode: cfg.round_mode, pay_round: cfg.pay_round || 1000, actual_minutes: m, paid_minutes: pm, pay_amount: roundMoney(pm * s.hourly_rate / 60, cfg.pay_round || 1000) });
        return Object.assign({}, s);
      });
    },

    /* ---------- Doanh thu & cài đặt ---------- */
    async reportData(f) {
      need('owner'); const db = load(), a = new Date(f.from), b = new Date(f.to), inR = t => { const x = new Date(t); return x >= a && x < b; };
      return { sales: db.sales.filter(s => inR(s.paid_at)).sort((x, y) => x.paid_at < y.paid_at ? -1 : 1), shifts: db.shifts.filter(s => inR(s.check_in_at)), employees: db.employees.slice(),
        stockItems: (db.stock_items || []).slice(), stockMoves: (db.stock_moves || []).filter(m => inR(m.created_at)), packs: (db.stock_packs || []).slice() };
    },
    async sales(f) { const a = new Date(f.from), b = new Date(f.to); return load().sales.filter(s => { const t = new Date(s.paid_at); return t >= a && t < b; }).sort((x, y) => x.paid_at < y.paid_at ? -1 : 1); },
    async settings() { return Object.assign({}, load().shop_settings); },
    async saveBank(b) { need('owner'); tx(db => Object.assign(db.shop_settings, { bank_bin: b.bin, bank_name: b.bank, bank_account: b.account, bank_holder: b.holder || '', bank_note: b.note || NOTE_DEFAULT })); },
    async saveSettings(s) { need('owner'); tx(db => Object.assign(db.shop_settings, { shop_name: s.shop_name, round_minutes: Number(s.round_minutes), round_mode: s.round_mode, pay_round: Number(s.pay_round) || 1000, kitchen_capacity: Number(s.kitchen_capacity), bar_capacity: Number(s.bar_capacity) || 2 })); },
    demoReset() {
      try { Object.keys(localStorage).filter(k => k.indexOf(SP) === 0).forEach(k => localStorage.removeItem(k)); } catch (e) { /* bỏ qua */ }
      cache = null;
    },
    demoSummary() {
      const db = load();
      const wait = st => db.order_stations.filter(x => x.station === st && x.status === 'cho_nhan').length;
      return { bep: wait('bep'), pha_che: wait('pha_che'), calls: db.staff_calls.filter(c => !c.resolved_at).length };
    }
  };
  return api;
}

const api = DEMO ? demoApi() : supabaseApi();

/* =====================================================================
   VIETQR ĐỘNG — mã chuyển khoản theo chuẩn NAPAS (EMVCo), có sẵn số tiền và nội dung.
   Đổi tài khoản: thêm BANK: { bin, bank, account, holder } vào config.js
   ===================================================================== */
const BANK = Object.assign({ bin: '970422', bank: 'MB Bank', account: '0393247469', holder: '', note: 'BENOC {ban} {ten}' }, CONFIG.BANK || {});
const NOTE_DEFAULT = 'BENOC {ban} {ten}';
/* Nội dung chuyển khoản của 1 đơn theo mẫu chủ quán đặt: {ban} = SO 15 / MV / GIAO, {ten} = tên khách ({ma} cũ vẫn đọc được) */
function qrNoteFor(o, tpl) {
  const dine = o.dine_type || 'tai_quan', ban = dine === 'giao_hang' ? 'GIAO' : dine === 'mang_ve' ? 'MV' : o.queue_number != null ? 'SO ' + o.queue_number : 'DAT BAN';
  const t = String(tpl || BANK.note || NOTE_DEFAULT);
  return qrInfo(t.replace(/\{ban\}/gi, ban).replace(/\{ten\}/gi, o.customer_name || '').replace(/\{ma\}/gi, String(o.id || '').replace(/-/g, '').slice(0, 4)));
}
/* Ngân hàng hỗ trợ VietQR: [mã BIN, tên ngắn, tên đầy đủ] (theo api.vietqr.io) */
const BANKS = [['970422', 'MB Bank', 'Quân đội'], ['970436', 'Vietcombank', 'Ngoại thương'], ['970415', 'VietinBank', 'Công thương'], ['970418', 'BIDV', 'Đầu tư và Phát triển'], ['970405', 'Agribank', 'Nông nghiệp'],
  ['970407', 'Techcombank', 'Kỹ thương'], ['970416', 'ACB', 'Á Châu'], ['970432', 'VPBank', 'Việt Nam Thịnh Vượng'], ['970423', 'TPBank', 'Tiên Phong'], ['970403', 'Sacombank', 'Sài Gòn Thương Tín'],
  ['970437', 'HDBank', 'Phát triển TP.HCM'], ['970441', 'VIB', 'Quốc tế'], ['970443', 'SHB', 'Sài Gòn - Hà Nội'], ['970431', 'Eximbank', 'Xuất Nhập khẩu'], ['970426', 'MSB', 'Hàng Hải'],
  ['970448', 'OCB', 'Phương Đông'], ['970440', 'SeABank', 'Đông Nam Á'], ['970449', 'LPBank', 'Lộc Phát'], ['970428', 'Nam A Bank', 'Nam Á'], ['970425', 'ABBANK', 'An Bình'],
  ['970427', 'VietABank', 'Việt Á'], ['970409', 'Bac A Bank', 'Bắc Á'], ['970412', 'PVcomBank', 'Đại Chúng'], ['970452', 'KienlongBank', 'Kiên Long'], ['970454', 'BVBank', 'Bản Việt'],
  ['970429', 'SCB', 'Sài Gòn'], ['970419', 'NCB', 'Quốc Dân'], ['970430', 'PGBank', 'Thịnh vượng và Phát triển'], ['970433', 'VietBank', 'Việt Nam Thương Tín'], ['970438', 'BaoVietBank', 'Bảo Việt'],
  ['970400', 'SaigonBank', 'Sài Gòn Công Thương'], ['970414', 'MBV', 'Việt Nam Hiện Đại'], ['970406', 'Vikki', 'Ngân hàng số Vikki'], ['970444', 'CBBank', 'Vietcombank Neo'], ['970408', 'GPBank', 'Dầu Khí Toàn Cầu'],
  ['970424', 'Shinhan Bank', 'Shinhan Việt Nam'], ['970457', 'Woori', 'Woori Việt Nam'], ['970410', 'Standard Chartered', 'Standard Chartered'], ['458761', 'HSBC', 'HSBC Việt Nam'], ['422589', 'CIMB', 'CIMB Việt Nam'],
  ['970439', 'Public Bank', 'Public Việt Nam'], ['970442', 'Hong Leong', 'Hong Leong Việt Nam'], ['970434', 'Indovina', 'Indovina'], ['970421', 'VRB', 'Việt - Nga'], ['970446', 'Co-opBank', 'Hợp tác xã'],
  ['546034', 'CAKE', 'Ngân hàng số CAKE (VPBank)'], ['546035', 'Ubank', 'Ngân hàng số Ubank (VPBank)'], ['963388', 'Timo', 'Ngân hàng số Timo'], ['963326', 'TNEX', 'TNEX (MSB)'], ['971133', 'PVcomBank Pay', 'Ngân hàng số PVcomBank']];
/* Lấy tài khoản nhận tiền chủ quán đã cài (chưa chạy cập nhật 18 thì giữ mặc định) */
async function loadBank() { try { const r = await api.paymentInfo(); if (r && r.account && r.bin) Object.assign(BANK, r, CONFIG.BANK || {}); } catch (e) { /* giữ mặc định */ } return BANK; }
const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
function crc16(str) { // CRC-16/CCITT-FALSE
  let c = 0xFFFF;
  for (let i = 0; i < str.length; i++) { c ^= str.charCodeAt(i) << 8; for (let k = 0; k < 8; k++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; }
  return c.toString(16).toUpperCase().padStart(4, '0');
}
/* Nội dung chuyển khoản: chữ không dấu, viết hoa, tối đa 25 ký tự */
const qrInfo = s => fold(s).toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 25);
function vietQR(amount, info) {
  const acc = tlv('00', 'A000000727') + tlv('01', tlv('00', BANK.bin) + tlv('01', BANK.account)) + tlv('02', 'QRIBFTTA');
  const amt = Math.round(Number(amount) || 0), note = qrInfo(info || '');
  const body = tlv('00', '01') + tlv('01', amt > 0 ? '12' : '11') + tlv('38', acc) + tlv('53', '704') + (amt > 0 ? tlv('54', String(amt)) : '') + tlv('58', 'VN') + (note ? tlv('62', tlv('08', note)) : '') + '6304';
  return body + crc16(body);
}
/* Vẽ mã QR thành ảnh (data URL). Tải thư viện qrcodejs lần đầu. */
const loadScript = src => new Promise((res, rej) => {
  const ex = document.querySelector('script[data-src="' + src + '"]');
  if (ex) { if (ex.dataset.ok) res(); else { ex.addEventListener('load', res); ex.addEventListener('error', rej); } return; }
  const sc = document.createElement('script'); sc.src = src; sc.dataset.src = src;
  sc.onload = () => { sc.dataset.ok = '1'; res(); }; sc.onerror = () => rej(new Error('Không tải được thư viện, kiểm tra mạng')); document.head.appendChild(sc);
});
async function qrDataUrl(text, size) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
  const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(box);
  try {
    new window.QRCode(box, { text, width: size || 320, height: size || 320, colorDark: '#000000', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
    const cv = box.querySelector('canvas'); return cv ? cv.toDataURL('image/png') : (box.querySelector('img') || {}).src;
  } finally { box.remove(); }
}

/* Size đồ uống: nhóm có 2 lựa chọn "Size M" và "Size L" */
const SIZE_RE = /^size\s*(xl|m|l)$/i;
const sizeGroup = it => (it.option_groups || []).find(g => g.choices.length >= 2 && g.choices.some(c => /^size m$/i.test(c.name)) && g.choices.some(c => /^size l$/i.test(c.name))) || null;
/* Size của 1 dòng món đã đặt ('M' | 'L' | null). Đơn cũ ghi "Upsize" thì là L */
/* Size của 1 dòng món đã đặt: 'M' | 'L' | 'XL' | 'UP' (upsize) | null */
const sizeOf = opts => { for (const o of opts || []) { const m = SIZE_RE.exec(o.choice || ''); if (m) return m[1].toUpperCase(); if (/^upsize/i.test(o.choice || '')) return 'UP'; } return null; };
const sizeText = sz => sz === 'UP' ? 'UPSIZE' : sz ? 'SIZE ' + sz : '';
/* Tìm kiếm không phân biệt dấu: "tra sua" khớp "Trà sữa" */
const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
const isSizeOpt = o => SIZE_RE.test(o.choice || '') || /^upsize/i.test(o.choice || '');

window.BN = {
  sizeGroup, sizeOf, isSizeOpt, sizeText, fold, promoLive, promoPrices, promoWhen, promoTitle, saleOf, saleCalc, saleBadge, DOW, BANK, BANKS, loadBank, qrNoteFor, NOTE_DEFAULT, vietQR, qrInfo, qrDataUrl, loadScript,
  CONFIG, DEMO, FEATURES, PARAMS, PAGE, SLOT, api, STATIONS: { bep: 'Bếp', pha_che: 'Quầy pha chế' }, ui, store, ERR, errText, fail,
  ICON_BAG, ICON_SCOOTER, isTakeaway, isDelivery, isPickup, isBooked, qboxHtml, orderLabel,
  esc, K, vnd, wait, hhmm, ddmm, ddmmyyyy, startOfDay, addDays, dur, ago, uuid, toLocalInput, toJpeg, applyRounding, roundMoney, DRINK_CATS
};

/* =====================================================================
   THANH "CHẾ ĐỘ TEST" — chỉ có ở bản xem thử.
   Cho phép thử cả 4 vai trên một điện thoại: chuyển trang trong cùng tab,
   dữ liệu dùng chung (localStorage), mỗi vai giữ phiên đăng nhập riêng.
   ===================================================================== */
const ROLES = [
  { key: 'khach', label: 'Khách', href: 'index.html' },
  { key: 'bep', label: 'Bếp', href: 'bep.html?slot=bep&as=e-bep' },
  { key: 'phache', label: 'Pha chế', href: 'phache.html?slot=bar&as=e-bar' },
  { key: 'chu', label: 'Chủ quán', href: 'quanly.html?slot=chu&as=e-chu' },
  { key: 'nv', label: 'Nhân viên', href: 'quanly.html?slot=nv&as=e-lan' }
];
const currentRole = () => PAGE === 'khach' ? 'khach' : PAGE === 'bep' ? 'bep' : PAGE === 'phache' ? 'phache' : (SLOT === 'nv' ? 'nv' : 'chu');

function testGuide() {
  ui.sheet(ui.head('Cách test trên một điện thoại', 'Bấm các nút trên thanh đen để đổi vai. Dữ liệu chỉ lưu trong trình duyệt này.') +
    '<div class="sh-body"><ol class="tg-steps">' +
    '<li><b>Khách:</b> trang khách đang mở menu <b>Ăn vặt</b> (mã QR bếp). Nhập số thẻ (ví dụ 12) và tên, chọn Cơm heo chua ngọt thêm trứng, viết ghi chú rồi gửi đơn.</li>' +
    '<li><b>Khách:</b> bấm "Gọi thêm món", kéo xuống cuối menu bấm <b>Xem menu Trà · Cà phê</b> (giống quét mã QR quầy pha chế). Chọn Bạc xỉu size L rồi gửi. Số thẻ và tên đã điền sẵn.</li>' +
    '<li><b>Bếp:</b> chỉ thấy đơn cơm. <b>Pha chế:</b> chỉ thấy đơn Bạc xỉu. Mỗi nơi bấm Nhận đơn, chỉnh số phút.</li>' +
    '<li><b>Khách:</b> thấy hai đơn, mỗi đơn đếm ngược riêng. Bấm Gọi nhân viên.</li>' +
    '<li>Mỗi nơi bấm Ra món, rồi ở tab <b>Chờ thanh toán</b> của chính nơi đó bấm Thanh toán: bếp thu đơn cơm, quầy pha chế thu đơn Bạc xỉu.</li>' +
    '<li><b>Khách:</b> đơn chuyển sang Đã thanh toán.</li>' +
    '<li><b>Chủ quán:</b> Doanh thu, chọn Hôm nay để thấy đơn vừa thu. Vào Menu, gạt một món sang Hết món hoặc đổi ảnh món, rồi sang vai Khách kiểm tra.</li>' +
    '<li><b>Nhân viên:</b> Chấm công, chụp ảnh vào ca, lát sau chụp ảnh ra ca để xem lương được tính.</li>' +
    '</ol><p class="small muted" style="margin:0">Trên một máy sẽ không nghe chuông báo đơn mới vì lúc đó bạn đang ở trang khác. Khi dùng thật, màn hình bếp chạy riêng trên máy bếp nên sẽ kêu.</p>' +
    '<div class="inline-test-reset"><button class="btn btn-danger btn-sm" type="button" id="tgReset">Xoá dữ liệu test, làm lại từ đầu</button>' +
    '<div class="msg" id="tgConfirm" hidden><p style="margin:0 0 8px">Xoá mọi đơn, ca làm và thay đổi menu đã thử?</p><div class="row"><button class="btn btn-sm btn-danger" type="button" id="tgYes">Xoá</button><button class="btn btn-sm btn-line" type="button" id="tgNo">Thôi</button></div></div></div></div>',
    sh => {
      sh.querySelector('#tgReset').onclick = () => { sh.querySelector('#tgConfirm').hidden = false; };
      sh.querySelector('#tgNo').onclick = () => { sh.querySelector('#tgConfirm').hidden = true; };
      sh.querySelector('#tgYes').onclick = () => { api.demoReset(); location.href = 'index.html'; };
    });
}

function mountTestBar() {
  const old = document.getElementById('demoNote'); if (old) old.remove();
  const bar = document.createElement('div'); bar.className = 'testbar'; bar.id = 'testBar';
  const cur = currentRole();
  bar.innerHTML = '<div class="testbar-in"><div class="tb-top"><span>Chế độ test · dữ liệu mẫu</span><button type="button" class="tb-help" id="tbHelp">Cách test</button></div>' +
    '<nav class="tb-roles" aria-label="Đổi vai để test">' + ROLES.map(r => '<a href="' + r.href + '" data-role="' + r.key + '"' + (r.key === cur ? ' aria-current="page"' : '') + '>' + r.label + '<span class="tb-badge" hidden></span></a>').join('') + '</nav></div>';
  document.body.insertBefore(bar, document.body.firstChild);
  bar.querySelector('#tbHelp').onclick = testGuide;
  const paint = () => {
    let s; try { s = api.demoSummary(); } catch (e) { return; }
    const set = (role, n, title) => { const b = bar.querySelector('[data-role="' + role + '"] .tb-badge'); b.hidden = !n; b.textContent = n; b.title = title; };
    set('bep', s.bep + s.calls, s.bep + ' đơn chờ bếp nhận, ' + s.calls + ' lượt gọi nhân viên');
    set('phache', s.pha_che, s.pha_che + ' đơn chờ quầy pha chế nhận');
  };
  paint(); window.addEventListener('benoc-db', paint); setInterval(paint, 3000);
}
if (DEMO) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountTestBar); else mountTestBar();
}

/* Môi trường TEST nối Supabase riêng: dải báo trên cùng để không nhầm với quán thật */
function mountEnvBanner() {
  const b = document.createElement('div'); b.className = 'envbar'; b.id = 'envBar';
  b.innerHTML = '<b>MÔI TRƯỜNG TEST</b><span>Dữ liệu thử, không phải quán thật</span>';
  document.body.insertBefore(b, document.body.firstChild);
}
if (window.BENOC_ENV === 'test' && !DEMO) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountEnvBanner); else mountEnvBanner();
}
/* Trang đang mở đè trong màn hình bếp / pha chế: bấm link về đúng màn hình đó thì đóng lớp đè (không mở lồng) */
(function () {
  let host = null;
  try { if (window.parent !== window && window.parent.BN_OVERLAY) host = window.parent.BN_OVERLAY; } catch (e) { /* khác nguồn */ }
  if (!host) return;
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a || a.target) return;
    let u; try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin === location.origin && u.pathname.replace(/\.html$/, '') === host.page) { e.preventDefault(); host.close(); }
  }, true);
})();
})();
