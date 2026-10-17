/* =====================================================================
   BÉ NỐC POS — lớp dữ liệu và tiện ích dùng chung cho cả 3 trang
   (index.html: khách gọi món, bep.html: màn hình bếp, phache.html: quầy pha chế, quanly.html: quản lý)

   Hai chế độ:
   - Có SUPABASE_URL + SUPABASE_ANON_KEY trong config.js → dùng Supabase thật.
   - Để trống → chế độ xem thử: dữ liệu lưu trong localStorage của trình duyệt.
   Cả hai chế độ có cùng các hàm trong BN.api, trả về dữ liệu cùng hình dạng.
   ===================================================================== */
(function () {
'use strict';

const CONFIG = Object.assign({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '', POLL_SECONDS: 15, LOGIN_DOMAIN: 'benoc.app' }, window.BENOC_CONFIG || {});
const DEMO = !(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
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
/* Trạm làm món: mỗi danh mục menu thuộc một trạm. 'bep' = bếp nóng, 'pha_che' = quầy pha chế */
const STATION = { bep: 'Bếp', pha_che: 'Quầy pha chế' };
const DRINK_CATS = /trà|cà phê|matcha|nước|món nên thử|khoai môn tươi|sữa/i;

const store = {
  get(k, d) { try { const v = localStorage.getItem('benoc.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('benoc.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem('benoc.' + k); } catch (e) { /* bỏ qua */ } }
};

function fail(code, hint) { const e = new Error(code); e.code = code; e.hint = hint; throw e; }

const ERR = {
  MISSING_QUEUE_NUMBER: 'Bạn chưa nhập số thứ tự. Lấy thẻ số ở quầy bếp, rồi nhập số ghi trên thẻ.',
  MISSING_NAME: 'Bạn chưa nhập tên. Quán cần tên để gọi bạn khi có việc.',
  EMPTY_ORDER: 'Giỏ đang trống. Chọn ít nhất một món nhé.',
  ITEM_UNAVAILABLE: 'Có món vừa hết. Menu đã được cập nhật, bạn xem lại giỏ nhé.',
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
  EMPTY_RECEIPT: 'Phiếu nhập chưa có hàng nào.',
  BAD_QTY: 'Số lượng phải lớn hơn 0.',
  BAD_TIME: 'Giờ ra phải sau giờ vào.',
  NOT_SIGNED_IN: 'Bạn chưa đăng nhập.',
  DB_OUTDATED: 'Cơ sở dữ liệu chưa được cập nhật cho bản mới. Chủ quán mở Supabase > SQL Editor, chạy file sql/cap-nhat-2-quay-pha-che.sql một lần rồi tải lại trang.'
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
  /* Lỗi do cơ sở dữ liệu chưa chạy sql/cap-nhat-2-quay-pha-che.sql (thiếu bảng/cột/hàm về trạm) → báo rõ cách sửa */
  function dbFail(error) {
    const m = error.message || '';
    if (/station|bar_capacity|staff_role/i.test(m) && /schema cache|does not exist|could not find|invalid input value/i.test(m)) fail('DB_OUTDATED');
    fail(m, error.hint || error.details);
  }
  async function rpc(fn, args) {
    const c = await cl(); const { data, error } = await c.rpc(fn, args || {});
    if (error) dbFail(error);
    return data;
  }
  async function q(builder) {
    const { data, error } = await builder;
    if (error) dbFail(error);
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
      p_queue_number: o.queue, p_customer_name: o.name, p_items: o.items,
      p_customer_phone: o.phone || null, p_confirm_duplicate: !!o.confirm, p_note: o.note || null
    }),
    getMyOrder: token => rpc('get_my_order', { p_token: token }),
    callStaff: token => rpc('call_staff', { p_token: token }),

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
        stations: (o.order_stations || []).sort((a, b) => a.station < b.station ? -1 : 1),
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
    /* Các thao tác dưới đây nhận thêm `station` ('bep' hoặc 'pha_che'): mỗi trạm nhận đơn / báo giờ / ra món riêng */
    suggestWait: (id, station) => rpc('suggest_wait_minutes', { p_order_id: id, p_station: station || 'bep' }),
    acceptOrder: (id, minutes, station) => rpc('accept_order', { p_order_id: id, p_minutes: minutes, p_station: station || 'bep' }),
    extendWait: (id, minutes, station) => rpc('extend_wait', { p_order_id: id, p_extra_minutes: minutes, p_station: station || 'bep' }),
    markServed: (id, station) => rpc('mark_served', { p_order_id: id, p_station: station || 'bep' }),
    cancelOrder: id => rpc('cancel_order', { p_order_id: id }),
    completePayment: (id, method) => rpc('complete_payment', { p_order_id: id, p_method: method }),
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
      const c = await cl(); const row = { name: cat.name, color: cat.color, sort_order: cat.sort_order || 0, station: cat.station === 'pha_che' ? 'pha_che' : 'bep' };
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
      const c = await cl(); const row = { name: g.name, title: g.title, min_select: g.min_select, max_select: g.max_select, sort_order: g.sort_order || 0 };
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

    /* ---------- Kho ---------- */
    async inventory() {
      const c = await cl();
      const [cats, products] = await Promise.all([
        q(c.from('product_categories').select('*').order('sort_order').order('id')),
        q(c.from('products').select('*').order('name'))
      ]);
      return { categories: cats, products };
    },
    async saveProductCategory(pc) {
      const c = await cl();
      if (pc.id) { await q(c.from('product_categories').update({ name: pc.name }).eq('id', pc.id)); return pc.id; }
      return (await q(c.from('product_categories').insert({ name: pc.name, sort_order: 99 }).select('id').single())).id;
    },
    async saveProduct(p) {
      const c = await cl();
      const row = { name: p.name, category_id: p.category_id, barcode: p.barcode || null, unit: p.unit || 'cái', min_qty: p.min_qty || 0, is_active: p.is_active !== false };
      if (p.id) return await q(c.from('products').update(row).eq('id', p.id).select('*').single());
      return await q(c.from('products').insert(row).select('*').single());
    },
    async findProductByBarcode(code) { const c = await cl(); return await q(c.from('products').select('*').eq('barcode', code).maybeSingle()); },
    createReceipt: r => rpc('create_receipt', { p_supplier: r.supplier || '', p_note: r.note || '', p_lines: r.lines }),
    async addMovement(m) {
      const c = await cl(); const e = await myEmployee();
      await q(c.from('stock_movements').insert({ product_id: m.product_id, reason: m.reason, qty_change: m.qty_change, note: m.note || null, created_by: e.id }));
    },
    async movements(productId, limit) {
      const c = await cl();
      let b = c.from('stock_movements').select('*, products(name, unit), employees(full_name), stock_receipts(supplier)').order('created_at', { ascending: false }).limit(limit || 30);
      if (productId) b = b.eq('product_id', productId);
      return (await q(b)).map(m => Object.assign({}, m, { product_name: m.products && m.products.name, unit: m.products && m.products.unit, by_name: m.employees && m.employees.full_name, supplier: m.stock_receipts && m.stock_receipts.supplier }));
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
    async settings() { const c = await cl(); return await q(c.from('shop_settings').select('*').eq('id', 1).single()); },
    async saveSettings(s) {
      const c = await cl();
      await q(c.from('shop_settings').update({ shop_name: s.shop_name, round_minutes: s.round_minutes, round_mode: s.round_mode, pay_round: s.pay_round, kitchen_capacity: s.kitchen_capacity, bar_capacity: s.bar_capacity || 2, updated_at: new Date().toISOString() }).eq('id', 1));
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
    id: c.id, name: c.name, color: c.color,
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
   CHẾ ĐỘ XEM THỬ — cơ sở dữ liệu giả lập trong localStorage
   Mô phỏng đúng các quy tắc của các hàm SQL để giao diện cư xử giống bản thật.
   ===================================================================== */
const DEMO_KEY = 'demo.db.v3'; // v3: tách trạm bếp / pha chế (đổi khoá để bản xem thử tạo lại dữ liệu mẫu)
/* Mỗi "vai" khi test trên một máy có phiên đăng nhập riêng (bếp, chủ quán, nhân viên) */
const PARAMS = new URLSearchParams(location.search);
const PAGE = /bep\.html$/.test(location.pathname) ? 'bep' : /phache\.html$/.test(location.pathname) ? 'phache' : /quanly\.html$/.test(location.pathname) ? 'quanly' : 'khach';
const SLOT = (PARAMS.get('slot') || PAGE).replace(/[^a-z0-9_-]/gi, '');
const SESSION_KEY = 'demo.session.' + SLOT;

function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* Tính lại trạng thái chung của đơn từ trạng thái từng trạm — giống hàm refresh_order_status trong SQL */
function refreshOrder(db, id) {
  const rows = db.order_stations.filter(s => s.order_id === id), o = db.orders.find(x => x.id === id);
  if (!o || !rows.length) return;
  const wait = rows.filter(s => s.status === 'cho_nhan').length, done = rows.filter(s => s.status === 'da_ra_mon').length;
  const max = list => list.length ? list.reduce((a, b) => a > b ? a : b) : null;
  const min = list => list.length ? list.reduce((a, b) => a < b ? a : b) : null;
  const pick = key => rows.map(s => s[key]).filter(Boolean);
  o.status = done === rows.length ? 'da_ra_mon' : wait === rows.length ? 'cho_nhan' : 'dang_lam';
  o.accepted_at = min(pick('accepted_at'));
  o.estimated_ready_at = max(rows.filter(s => s.status === 'dang_lam').map(s => s.estimated_ready_at).filter(Boolean)) || max(pick('estimated_ready_at'));
  o.served_at = done === rows.length ? max(pick('served_at')) : null;
}

function demoSeed() {
  const S = JSON.parse(JSON.stringify(window.BENOC_SEED || {}));
  const now = Date.now(), R = rng(2802);
  const db = {
    shop_settings: { id: 1, shop_name: 'Bé Nốc', round_minutes: 1, round_mode: 'nearest', pay_round: 1000, kitchen_capacity: 2, bar_capacity: 2 },
    menu_categories: (S.menu_categories || []).map(c => Object.assign({ station: 'bep' }, c)), menu_items: S.menu_items || [], option_groups: S.option_groups || [],
    option_choices: S.option_choices || [], menu_item_option_groups: S.menu_item_option_groups || [],
    product_categories: S.product_categories || [],
    employees: [
      { id: 'e-chu', full_name: 'Chị Nốc', phone: '0900000001', role: 'owner', hourly_rate: 0, is_active: true },
      { id: 'e-lan', full_name: 'Lan', phone: '0900000002', role: 'staff', hourly_rate: 25000, is_active: true },
      { id: 'e-minh', full_name: 'Minh', phone: '0900000003', role: 'staff', hourly_rate: 22000, is_active: true },
      { id: 'e-bep', full_name: 'Máy bếp', phone: '0900000009', role: 'kitchen', hourly_rate: 0, is_active: true },
      { id: 'e-bar', full_name: 'Máy pha chế', phone: '0900000010', role: 'bar', hourly_rate: 0, is_active: true }
    ],
    products: [], stock_receipts: [], stock_movements: [], shifts: [], orders: [], order_items: [], order_stations: [], staff_calls: [], sales: [],
    seq: { option_groups: 100, option_choices: 100, menu_categories: 100, product_categories: 100, order_items: 1, staff_calls: 1, stock_movements: 1 }
  };
  // Hàng hoá mẫu (mã vạch mẫu, không phải mã thật)
  const P = [
    [1, 'Cốc nhựa 500ml', null, 'cây 50 cái', 3, 8], [1, 'Ống hút to', null, 'gói 100 cái', 2, 5], [1, 'Hộp giấy đựng cơm', null, 'cây 50 cái', 2, 3],
    [2, 'Xúc xích Đức', '8930000000019', 'gói', 5, 14], [2, 'Cá viên', '8930000000026', 'gói 500g', 4, 6], [2, 'Nem chua rán', '8930000000033', 'hộp', 5, 3],
    [2, 'Gà viên', '8930000000040', 'gói 500g', 4, 9], [3, 'Tương ớt', '8930000000057', 'chai', 3, 7], [3, 'Dầu ăn', '8930000000064', 'can 5L', 1, 2],
    [3, 'Mayonnaise', '8930000000071', 'chai', 2, 1], [3, 'Tương cà', '8930000000088', 'chai', 2, 4]
  ];
  P.forEach((p, i) => {
    const id = 'p-' + (i + 1);
    db.products.push({ id, category_id: p[0], name: p[1], barcode: p[2], unit: p[3], min_qty: p[4], stock_qty: p[5], is_active: true, created_at: new Date(now - 20 * 864e5).toISOString() });
    db.stock_movements.push({ id: db.seq.stock_movements++, product_id: id, receipt_id: 'r-1', reason: 'nhap', qty_change: p[5], unit_cost: 20000 + Math.round(R() * 60) * 1000, note: null, created_by: 'e-chu', created_at: new Date(now - 3 * 864e5).toISOString() });
  });
  db.stock_receipts.push({ id: 'r-1', received_at: new Date(now - 3 * 864e5).toISOString(), supplier: 'Đại lý mẫu', note: null, created_by: 'e-chu' });
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
      const cook = 5 + Math.round(R() * 12);
      db.sales.push({ id: uuid(), queue_number: 1 + Math.floor(R() * 40), total, payment_method: R() < 0.6 ? 'chuyen_khoan' : 'tien_mat', items, ordered_at: new Date(paid - (cook + 18) * 60e3).toISOString(), accepted_at: new Date(paid - (cook + 15) * 60e3).toISOString(), served_at: new Date(paid - 15 * 60e3).toISOString(), paid_at: new Date(paid).toISOString(), cook_minutes: cook, cashier_id: 'e-lan' });
    }
  }
  // Hai đơn đang mở để màn hình bếp và quầy pha chế có việc ngay
  const pick = n => db.menu_items.find(m => m.name === n);
  const mk = (queue, name, stationStatus, minsAgo, lines, note) => {
    const id = uuid(); let total = 0; const used = new Set();
    lines.forEach(([nm, qty, opts, inote]) => {
      const m = pick(nm); const extra = (opts || []).reduce((s, o) => s + o.price, 0); total += (m.price + extra) * qty;
      const cat = db.menu_categories.find(c => c.id === m.category_id), st = (cat && cat.station) || 'bep'; used.add(st);
      db.order_items.push({ id: db.seq.order_items++, order_id: id, menu_item_id: m.id, item_name: m.name, unit_price: m.price + extra, options: opts || [], qty, note: inote || null, station: st });
    });
    const created = now - minsAgo * 60e3;
    db.orders.push({ id, access_token: uuid(), queue_number: queue, customer_name: name, customer_phone: null, note: note || null, status: 'cho_nhan', total, created_at: new Date(created).toISOString(), accepted_at: null, estimated_ready_at: null, served_at: null });
    used.forEach(st => {
      const status = stationStatus[st] || 'cho_nhan';
      db.order_stations.push({ order_id: id, station: st, status, accepted_at: status !== 'cho_nhan' ? new Date(created + 60e3).toISOString() : null, estimated_ready_at: status !== 'cho_nhan' ? new Date(created + 13 * 60e3).toISOString() : null, served_at: null });
    });
    refreshOrder(db, id);
  };
  mk(7, 'Minh', { bep: 'dang_lam', pha_che: 'dang_lam' }, 6, [['Cơm heo chua ngọt', 1, [{ group: 'Topping thêm', choice: 'Trứng ốp la', price: 5000 }], 'ít cay'], ['Hồng trà sữa trân châu', 1]]);
  mk(15, 'Thảo', {}, 1, [['Kimbap chiên', 1], ['Tokbokki', 1], ['Trà sữa thạch dừa', 1], ['Trà đào', 2, [{ group: 'Size', choice: 'Size to', price: 5000 }]]], 'Mang ra cùng lúc giúp mình');
  return db;
}

function demoApi() {
  let cache = null;
  const load = () => {
    if (cache) return cache;
    cache = store.get(DEMO_KEY, null);
    if (!cache || !cache.menu_items) { cache = demoSeed(); store.set(DEMO_KEY, cache); }
    return cache;
  };
  const save = () => {
    if (!store.set(DEMO_KEY, cache)) ui.toast('Bộ nhớ trình duyệt đầy. Bớt ảnh hoặc xoá dữ liệu xem thử trong Cài đặt.');
    window.dispatchEvent(new Event('benoc-db'));
  };
  window.addEventListener('storage', e => { if (e.key === 'benoc.' + DEMO_KEY) { cache = null; window.dispatchEvent(new Event('benoc-db')); } });
  const tx = fn => { const db = load(); const r = fn(db); save(); return r; };
  const me = () => { const id = store.get(SESSION_KEY, null); const e = id && load().employees.find(x => x.id === id && x.is_active); return e || null; };
  const need = role => { const e = me(); if (!e || (role && e.role !== role)) fail('FORBIDDEN'); return e; };
  const iso = () => new Date().toISOString();
  const move = (db, m) => { db.stock_movements.push(Object.assign({ id: db.seq.stock_movements++, created_at: iso() }, m)); const p = db.products.find(x => x.id === m.product_id); if (p) p.stock_qty = Math.round((Number(p.stock_qty) + Number(m.qty_change)) * 100) / 100; };
  const ordersAhead = (db, o) => db.orders.filter(x => (x.status === 'cho_nhan' || x.status === 'dang_lam') && x.created_at < o.created_at).length;

  const api = {
    /* ---------- Khách ---------- */
    async getMenu() { await wait(120); return buildPublicMenu(load()); },
    async placeOrder({ queue, name, phone, items, confirm, note }) {
      await wait(350);
      if (!(queue > 0)) fail('MISSING_QUEUE_NUMBER');
      if (!String(name || '').trim()) fail('MISSING_NAME');
      if (!items || !items.length) fail('EMPTY_ORDER');
      return tx(db => {
        const dup = db.orders.find(o => o.queue_number === queue);
        if (dup && !confirm) fail('DUPLICATE_QUEUE', 'Số ' + queue + ' đang có đơn của ' + dup.customer_name + ' chưa thanh toán');
        const id = uuid(), lines = []; let total = 0;
        for (const li of items) {
          const m = db.menu_items.find(x => x.id === li.menu_item_id && x.is_available); if (!m) fail('ITEM_UNAVAILABLE');
          const ids = new Set(li.choice_ids || []);
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
          const picked = db.option_choices.filter(c => ids.has(c.id));
          const opts = picked.map(c => ({ group: db.option_groups.find(g => g.id === c.group_id).title, choice: c.name, price: c.price_delta }));
          const unit = m.price + picked.reduce((s, c) => s + c.price_delta, 0);
          const qty = Math.max(1, Math.min(50, li.qty || 1));
          const cat = db.menu_categories.find(c => c.id === m.category_id);
          lines.push({ id: db.seq.order_items++, order_id: id, menu_item_id: m.id, item_name: m.name, unit_price: unit, options: opts, qty, note: li.note ? String(li.note).trim() : null, station: (cat && cat.station) || 'bep' });
          total += unit * qty;
        }
        const o = { id, access_token: uuid(), queue_number: queue, customer_name: String(name).trim(), customer_phone: phone ? String(phone).trim() : null, note: note ? String(note).trim().slice(0, 300) : null, status: 'cho_nhan', total, created_at: iso(), accepted_at: null, estimated_ready_at: null, served_at: null };
        db.orders.push(o); lines.forEach(l => db.order_items.push(l));
        [...new Set(lines.map(l => l.station))].forEach(st => db.order_stations.push({ order_id: id, station: st, status: 'cho_nhan', accepted_at: null, estimated_ready_at: null, served_at: null }));
        return { order_id: o.id, access_token: o.access_token, total };
      });
    },
    async getMyOrder(token) {
      const db = load(); const o = db.orders.find(x => x.access_token === token); if (!o) return null;
      return {
        queue_number: o.queue_number, customer_name: o.customer_name, status: o.status, total: o.total, note: o.note,
        created_at: o.created_at, estimated_ready_at: o.estimated_ready_at, orders_ahead: ordersAhead(db, o),
        has_open_call: db.staff_calls.some(c => c.order_id === o.id && !c.resolved_at),
        stations: db.order_stations.filter(t => t.order_id === o.id).sort((a, b) => a.station < b.station ? -1 : 1).map(t => ({ station: t.station, status: t.status, estimated_ready_at: t.estimated_ready_at })),
        items: db.order_items.filter(i => i.order_id === o.id).map(i => ({ name: i.item_name, qty: i.qty, note: i.note, price: i.unit_price, options: i.options, station: i.station || 'bep' }))
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
        stations: db.order_stations.filter(t => t.order_id === o.id).sort((a, b) => a.station < b.station ? -1 : 1),
        calls: db.staff_calls.filter(c => c.order_id === o.id && !c.resolved_at)
      }));
    },
    onKitchenChange(cb) { const h = () => cb(); window.addEventListener('benoc-db', h); return () => window.removeEventListener('benoc-db', h); },
    async suggestWait(id, station) {
      station = station || 'bep'; const db = load();
      const own = Math.max.apply(null, [0].concat(db.order_items.filter(i => i.order_id === id && (i.station || 'bep') === station).map(i => { const m = db.menu_items.find(x => x.id === i.menu_item_id); return m ? m.prep_minutes : 0; }))) || 10;
      const ahead = db.order_stations.filter(t => t.station === station && t.status === 'dang_lam').length;
      const cap = Math.max(1, (station === 'pha_che' ? db.shop_settings.bar_capacity : db.shop_settings.kitchen_capacity) || 1);
      const since = Date.now() - 14 * 864e5;
      let recent = db.sales.filter(x => x.station_cook && x.station_cook[station] != null && new Date(x.paid_at) > since).map(x => x.station_cook[station]);
      // hoá đơn cũ (chưa chia trạm) chỉ có tổng thời gian, coi như của bếp
      if (!recent.length && station === 'bep') recent = db.sales.filter(x => !x.station_cook && x.cook_minutes != null && new Date(x.paid_at) > since).map(x => x.cook_minutes);
      const avg = recent.length ? recent.reduce((t, v) => t + v, 0) / recent.length : own;
      return Math.ceil((own + Math.floor(ahead / cap) * avg) / 5) * 5;
    },
    async acceptOrder(id, minutes, station) { need(); tx(db => { const t = db.order_stations.find(x => x.order_id === id && x.station === (station || 'bep') && x.status === 'cho_nhan'); if (t) { t.status = 'dang_lam'; t.accepted_at = iso(); t.estimated_ready_at = new Date(Date.now() + Math.max(1, minutes) * 60e3).toISOString(); } refreshOrder(db, id); }); },
    async extendWait(id, minutes, station) { need(); tx(db => { const t = db.order_stations.find(x => x.order_id === id && x.station === (station || 'bep') && x.status === 'dang_lam'); if (t) t.estimated_ready_at = new Date(Math.max(Date.now(), new Date(t.estimated_ready_at || 0).getTime()) + minutes * 60e3).toISOString(); refreshOrder(db, id); }); },
    async markServed(id, station) { need(); tx(db => { const t = db.order_stations.find(x => x.order_id === id && x.station === (station || 'bep') && x.status === 'dang_lam'); if (t) { t.status = 'da_ra_mon'; t.served_at = iso(); } refreshOrder(db, id); }); },
    async cancelOrder(id) { need(); tx(db => { db.orders = db.orders.filter(o => o.id !== id); db.order_items = db.order_items.filter(i => i.order_id !== id); db.order_stations = db.order_stations.filter(t => t.order_id !== id); db.staff_calls = db.staff_calls.filter(c => c.order_id !== id); }); },
    async completePayment(id, method) {
      const e = need();
      tx(db => {
        const o = db.orders.find(x => x.id === id); if (!o) fail('ORDER_NOT_FOUND');
        const items = db.order_items.filter(i => i.order_id === id).map(i => ({ menu_item_id: i.menu_item_id, name: i.item_name, price: i.unit_price, qty: i.qty, options: i.options, station: i.station || 'bep' }));
        const cook = {}; db.order_stations.filter(t => t.order_id === id && t.accepted_at && t.served_at).forEach(t => { cook[t.station] = Math.round((new Date(t.served_at) - new Date(t.accepted_at)) / 60000); });
        db.sales.push({ id: o.id, queue_number: o.queue_number, total: o.total, payment_method: method, items, ordered_at: o.created_at, accepted_at: o.accepted_at, served_at: o.served_at, paid_at: iso(), cook_minutes: o.accepted_at && o.served_at ? Math.round((new Date(o.served_at) - new Date(o.accepted_at)) / 60000) : null, station_cook: Object.keys(cook).length ? cook : null, cashier_id: e.id });
        db.orders = db.orders.filter(x => x.id !== id); db.order_items = db.order_items.filter(i => i.order_id !== id); db.order_stations = db.order_stations.filter(t => t.order_id !== id); db.staff_calls = db.staff_calls.filter(c => c.order_id !== id);
      });
    },
    async resolveCall(id) { need(); tx(db => { const c = db.staff_calls.find(x => x.id === id); if (c) c.resolved_at = iso(); }); },

    /* ---------- Menu (quản lý) ---------- */
    async adminMenu() { const db = load(); return assembleAdminMenu(db.menu_categories.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id), db.menu_items.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'vi')), db.option_groups.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id), db.option_choices, db.menu_item_option_groups); },
    async saveCategory(cat) {
      need('owner');
      return tx(db => {
        const station = cat.station === 'pha_che' ? 'pha_che' : 'bep';
        if (cat.id) { Object.assign(db.menu_categories.find(c => c.id === cat.id), { name: cat.name, color: cat.color, sort_order: cat.sort_order || 0, station }); return cat.id; }
        const id = db.seq.menu_categories++; db.menu_categories.push({ id, name: cat.name, color: cat.color, sort_order: cat.sort_order || 99, station }); return id;
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
        const row = { name: g.name, title: g.title, min_select: g.min_select, max_select: g.max_select, sort_order: g.sort_order || 0 };
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

    /* ---------- Kho ---------- */
    async inventory() { const db = load(); return { categories: db.product_categories, products: db.products.slice().sort((a, b) => a.name.localeCompare(b.name, 'vi')) }; },
    async saveProductCategory(pc) { need('owner'); return tx(db => { if (pc.id) { db.product_categories.find(c => c.id === pc.id).name = pc.name; return pc.id; } const id = db.seq.product_categories++; db.product_categories.push({ id, name: pc.name, sort_order: 99 }); return id; }); },
    async saveProduct(p) {
      const e = need();
      if (p.id && e.role !== 'owner') fail('FORBIDDEN');
      return tx(db => {
        if (p.barcode && db.products.some(x => x.barcode === p.barcode && x.id !== p.id)) fail('Mã vạch này đã gắn với sản phẩm khác.');
        const row = { name: p.name, category_id: p.category_id, barcode: p.barcode || null, unit: p.unit || 'cái', min_qty: Number(p.min_qty) || 0, is_active: p.is_active !== false };
        if (p.id) { const x = db.products.find(y => y.id === p.id); Object.assign(x, row); return Object.assign({}, x); }
        const x = Object.assign({ id: uuid(), stock_qty: 0, created_at: iso() }, row); db.products.push(x); return Object.assign({}, x);
      });
    },
    async findProductByBarcode(code) { const p = load().products.find(x => x.barcode === code); return p ? Object.assign({}, p) : null; },
    async createReceipt(r) {
      const e = need();
      if (!r.lines || !r.lines.length) fail('EMPTY_RECEIPT');
      return tx(db => {
        const id = uuid(); db.stock_receipts.push({ id, received_at: iso(), supplier: r.supplier || null, note: r.note || null, created_by: e.id });
        r.lines.forEach(l => { if (!(Number(l.qty) > 0)) fail('BAD_QTY'); move(db, { product_id: l.product_id, receipt_id: id, reason: 'nhap', qty_change: Number(l.qty), unit_cost: l.unit_cost ? Number(l.unit_cost) : null, note: null, created_by: e.id }); });
        return id;
      });
    },
    async addMovement(m) { const e = need(); tx(db => move(db, { product_id: m.product_id, receipt_id: null, reason: m.reason, qty_change: Number(m.qty_change), unit_cost: null, note: m.note || null, created_by: e.id })); },
    async movements(productId, limit) {
      const db = load();
      return db.stock_movements.filter(m => !productId || m.product_id === productId).sort((a, b) => a.created_at < b.created_at ? 1 : -1).slice(0, limit || 30).map(m => {
        const p = db.products.find(x => x.id === m.product_id) || {}; const e = db.employees.find(x => x.id === m.created_by) || {}; const r = db.stock_receipts.find(x => x.id === m.receipt_id) || {};
        return Object.assign({}, m, { product_name: p.name, unit: p.unit, by_name: e.full_name, supplier: r.supplier });
      });
    },

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
    async sales(f) { const a = new Date(f.from), b = new Date(f.to); return load().sales.filter(s => { const t = new Date(s.paid_at); return t >= a && t < b; }).sort((x, y) => x.paid_at < y.paid_at ? -1 : 1); },
    async settings() { return Object.assign({}, load().shop_settings); },
    async saveSettings(s) { need('owner'); tx(db => Object.assign(db.shop_settings, { shop_name: s.shop_name, round_minutes: Number(s.round_minutes), round_mode: s.round_mode, pay_round: Number(s.pay_round) || 1000, kitchen_capacity: Number(s.kitchen_capacity), bar_capacity: Number(s.bar_capacity) || 2 })); },
    demoReset() {
      try { Object.keys(localStorage).filter(k => k.indexOf('benoc.') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) { /* bỏ qua */ }
      cache = null;
    },
    demoSummary() {
      const db = load();
      const by = st => ({ pending: db.order_stations.filter(t => t.station === st && t.status === 'cho_nhan').length, cooking: db.order_stations.filter(t => t.station === st && t.status === 'dang_lam').length });
      return { pending: db.orders.filter(o => o.status === 'cho_nhan').length, cooking: db.orders.filter(o => o.status === 'dang_lam').length, ready: db.orders.filter(o => o.status === 'da_ra_mon').length, calls: db.staff_calls.filter(c => !c.resolved_at).length, bep: by('bep'), pha_che: by('pha_che') };
    }
  };
  return api;
}

const api = DEMO ? demoApi() : supabaseApi();

window.BN = {
  CONFIG, DEMO, PARAMS, PAGE, SLOT, STATION, api, ui, store, ERR, errText, fail,
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
  { key: 'phache', label: 'Pha chế', href: 'phache.html?slot=phache&as=e-bar' },
  { key: 'chu', label: 'Chủ quán', href: 'quanly.html?slot=chu&as=e-chu' },
  { key: 'nv', label: 'Nhân viên', href: 'quanly.html?slot=nv&as=e-lan' }
];
const currentRole = () => PAGE === 'khach' ? 'khach' : PAGE === 'bep' ? 'bep' : PAGE === 'phache' ? 'phache' : (SLOT === 'nv' ? 'nv' : 'chu');

function testGuide() {
  ui.sheet(ui.head('Cách test trên một điện thoại', 'Bấm các nút trên thanh đen để đổi vai. Dữ liệu chỉ lưu trong trình duyệt này.') +
    '<div class="sh-body"><ol class="tg-steps">' +
    '<li><b>Khách:</b> nhập số thẻ (ví dụ 12) và tên. Chọn vài món, thử món có size (Bạc xỉu) và món có topping (Cơm heo chua ngọt). Viết ghi chú cuối giỏ rồi gửi đơn.</li>' +
    '<li><b>Bếp:</b> đơn mới nằm ở tab Chờ nhận, chỉ gồm món bếp (cơm, mì, kimbap, đồ ăn vặt, nước uống thường). Bấm Nhận đơn, chỉnh số phút, bấm xác nhận. Đơn chuyển sang tab Đang làm.</li>' +
    '<li><b>Pha chế:</b> phần trà sữa, trà hoa quả, cà phê... của cùng đơn nằm ở màn Pha chế. Quầy pha chế nhận đơn, báo thời gian và ra món riêng. Khách thấy tiến độ của từng phần.</li>' +
    '<li><b>Khách:</b> thấy đếm ngược thời gian chờ. Bấm Gọi nhân viên.</li>' +
    '<li><b>Bếp:</b> thấy dải đỏ "gọi nhân viên", bấm Đã tới. Ở tab Đang làm bấm Ra món. Khi cả bếp và pha chế đã ra món, đơn sang tab Chờ thanh toán ở màn bếp: bấm Thanh toán và chọn tiền khách đưa để xem tiền thối.</li>' +
    '<li><b>Khách:</b> đơn chuyển sang Đã thanh toán.</li>' +
    '<li><b>Chủ quán:</b> Doanh thu, chọn Hôm nay để thấy đơn vừa thu. Vào Menu, gạt một món sang Hết món hoặc đổi ảnh món, rồi sang vai Khách kiểm tra.</li>' +
    '<li><b>Nhân viên:</b> Chấm công, chụp ảnh vào ca, lát sau chụp ảnh ra ca để xem lương được tính. Kho hàng, Nhập hàng, chụp mã vạch của một chai nước hay gói bánh bất kỳ để thử tạo hàng mới.</li>' +
    '</ol><p class="small muted" style="margin:0">Trên một máy sẽ không nghe chuông báo đơn mới vì lúc đó bạn đang ở trang khác. Khi dùng thật, màn hình bếp chạy riêng trên máy bếp nên sẽ kêu.</p>' +
    '<div class="inline-test-reset"><button class="btn btn-danger btn-sm" type="button" id="tgReset">Xoá dữ liệu test, làm lại từ đầu</button>' +
    '<div class="msg" id="tgConfirm" hidden><p style="margin:0 0 8px">Xoá mọi đơn, ca làm, thay đổi menu và kho đã thử?</p><div class="row"><button class="btn btn-sm btn-danger" type="button" id="tgYes">Xoá</button><button class="btn btn-sm btn-line" type="button" id="tgNo">Thôi</button></div></div></div></div>',
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
    set('bep', s.bep.pending + s.calls, s.bep.pending + ' đơn bếp chờ nhận, ' + s.calls + ' lượt gọi nhân viên');
    set('phache', s.pha_che.pending, s.pha_che.pending + ' đơn pha chế chờ nhận');
  };
  paint(); window.addEventListener('benoc-db', paint); setInterval(paint, 3000);
}
if (DEMO) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountTestBar); else mountTestBar();
}
})();
