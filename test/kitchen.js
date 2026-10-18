/* =====================================================================
   MÀN HÌNH BẾP / QUẦY PHA CHẾ — dùng chung một mã.
   Trang đặt window.BENOC_STATION = 'bep' | 'pha_che' trước khi nạp file này.
   - Mỗi nơi chỉ thấy và làm phần món của mình trong đơn.
   - Mỗi quầy thu tiền đơn của mình: đơn gọi từ menu Trà · Cà phê do quầy pha chế thu,
     đơn từ menu Ăn vặt do bếp thu. (Đơn lỡ có cả hai loại món thì bếp thu.)
   ===================================================================== */
(function () {
'use strict';
const { api, ui, esc, vnd, K, hhmm, ago, errText, DEMO, STATIONS, qboxHtml, orderLabel, isTakeaway, isDelivery, sizeOf, isSizeOpt, sizeGroup, sizeText, fold } = BN;
const $ = (s, r = document) => r.querySelector(s);
const STATION = window.BENOC_STATION === 'pha_che' ? 'pha_che' : 'bep';
const OTHER = STATION === 'bep' ? 'pha_che' : 'bep';
const IS_BEP = STATION === 'bep';
const SHORT = { bep: 'Bếp', pha_che: 'Pha chế' };
const COLS = [['cho_nhan', 'Chờ nhận'], ['dang_lam', 'Đang làm'], ['thanh_toan', 'Chờ thanh toán']];
const EMPTY = { cho_nhan: 'Chưa có đơn mới', dang_lam: 'Không có đơn đang làm', thanh_toan: 'Không có đơn chờ thanh toán' };
const state = { orders: [], panels: {}, col: null, sound: false, seen: null, seenCalls: null, session: null };
let audio = null, wakeLock = null;

const demoNote = $('#demoNote'); if (demoNote) demoNote.hidden = !DEMO;
BN.staff.requireLogin($('#app'), { title: IS_BEP ? 'Màn hình bếp' : 'Màn hình quầy pha chế', onReady: s => { state.session = s; start(); } });

/* ---------- Phần của từng nơi trong một đơn ---------- */
const part = (o, st) => (o.stations || []).find(x => x.station === st) || null;
const mine = o => part(o, STATION);
/* Quầy thu tiền của đơn: đơn chỉ có đồ uống → quầy pha chế; còn lại → bếp */
const payer = o => (o.stations || []).length && o.stations.every(x => x.station === 'pha_che') ? 'pha_che' : 'bep';
const isMinePay = o => payer(o) === STATION;
/* Đã thu tiền chưa: none = chưa thu, full = đã thu đủ, more = sửa đơn tăng tiền (thu thêm), refund = sửa đơn giảm tiền (trả lại) */
const paidState = o => o.paid_amount == null ? 'none' : o.paid_amount === o.total ? 'full' : o.paid_amount < o.total ? 'more' : 'refund';
const dueOf = o => o.total - (o.paid_amount || 0); // còn phải thu (âm = phải trả lại khách)
const canEdit = () => true; // bếp, pha chế và chủ quán đều sửa được đơn của nơi mình
/* Đơn nằm ở cột nào của màn hình này (null = không hiện) */
function colOf(o) {
  const m = mine(o);
  if (m && (m.status === 'cho_nhan' || m.status === 'dang_lam')) return m.status;
  if (isMinePay(o)) return 'thanh_toan';
  return null;
}

function start() {
  const role = state.session.employee.role;
  document.documentElement.style.setProperty('--ncol', COLS.length);
  $('#app').innerHTML =
    '<header class="topbar"><div class="topbar-in"><div class="brand"><b>' + SHORT[STATION] + '</b><span>Bé Nốc</span></div>' +
    '<span class="clock num" id="clock"></span>' +
    '<button class="btn btn-sm btn-line" type="button" id="soundBtn" aria-pressed="false">Bật chuông báo</button>' +
    (role === 'owner' ? '<a class="btn btn-sm" href="index.html?dat=giao' + (DEMO ? '&slot=' + encodeURIComponent(BN.SLOT) : '') + '">+ Đơn giao hàng</a>' : '') +
    (role === 'owner' ? '<a class="btn btn-sm btn-line" href="' + (IS_BEP ? 'phache.html' : 'bep.html') + '">' + (IS_BEP ? 'Pha chế' : 'Bếp') + '</a><a class="btn btn-sm btn-line" href="quanly.html">Quản lý</a>' : '') +
    BN.staff.whoChip(state.session) + '</div></header>' +
    '<div class="wrap" style="max-width:none"><div class="calls" id="calls"></div><div class="seg" id="seg"></div></div>' +
    '<main class="cols" id="cols">' + COLS.map(([k, t]) => '<section class="col cc-' + k + '" data-col="' + k + '"><h2 class="col-head"><span class="t">' + t + '</span><span class="n num" id="n-' + k + '">0</span></h2><div class="klist" id="list-' + k + '"></div></section>').join('') + '</main>';
  $('#soundBtn').onclick = toggleSound;
  $('#cols').addEventListener('click', onAction);
  $('#calls').addEventListener('click', onCall);
  $('#seg').addEventListener('click', e => { const b = e.target.closest('[data-seg]'); if (b) { state.col = b.dataset.seg; render(); } });
  tick(); setInterval(tick, 1000 * 20);
  refresh();
  api.onKitchenChange(() => refresh());
  setInterval(refresh, DEMO ? 4000 : 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refresh(); if (state.sound) lockScreen(); } });
}

function tick() { const c = $('#clock'); if (c) c.textContent = hhmm(Date.now()); if (state.orders.length) render(); }

let busy = false;
async function refresh() {
  if (busy) return; busy = true;
  try {
    state.orders = await api.kitchenOrders();
    // Đơn "của mình" = đơn có món cho nơi này; đơn mới thì báo
    const ids = new Set(state.orders.filter(o => mine(o)).map(o => o.id)), calls = new Set();
    state.orders.forEach(o => o.calls.forEach(c => calls.add(c.id)));
    if (state.seen) {
      const newOrders = [...ids].filter(id => !state.seen.has(id)).length;
      const newCalls = [...calls].filter(c => !state.seenCalls.has(c)).length;
      if (newOrders || newCalls) alertNew(newOrders ? 'Có ' + newOrders + ' đơn mới' : 'Khách gọi nhân viên');
    }
    state.seen = ids; state.seenCalls = calls;
    const all = new Set(state.orders.map(o => o.id));
    Object.keys(state.panels).forEach(id => { if (!all.has(id)) delete state.panels[id]; });
    render();
  } catch (e) { ui.toast(errText(e)); }
  finally { busy = false; }
}

/* ---------- Vẽ màn hình ---------- */
function timerHtml(o, col) {
  const now = Date.now(), m = mine(o);
  if (col === 'cho_nhan') { const w = Math.floor((now - new Date(o.created_at)) / 60000); return '<div class="timer' + (w >= 3 ? ' warn' : '') + '">Đã chờ<b class="num">' + w + "'" + '</b></div>'; }
  if (col === 'dang_lam') {
    const left = Math.ceil((new Date(m.estimated_ready_at) - now) / 60000);
    return left >= 0 ? '<div class="timer">Còn<b class="num">' + left + "'" + '</b></div>' : '<div class="timer late">Trễ<b class="num">' + (-left) + "'" + '</b></div>';
  }
  const done = m && m.served_at ? m.served_at : null;
  return done ? '<div class="timer">Ra món<b class="num">' + hhmm(done) + '</b></div>' : '<div class="timer">Đặt lúc<b class="num">' + hhmm(o.created_at) + '</b></div>';
}
/* Món thêm sau khi nơi làm đã nhận đơn → nhãn MỚI để người làm không bỏ sót */
function isNew(o, i) { const p = part(o, i.station); return !!(p && p.accepted_at && i.added_at && new Date(i.added_at) > new Date(p.accepted_at)); }
const isTopping = x => /topping/i.test(x.group || '');
function itemsHtml(items, tagStation, o) {
  return '<ul class="kc-items">' + items.map(i => { const sz = sizeOf(i.options), rest = (i.options || []).filter(x => !isSizeOpt(x)); return '<li' + (o && isNew(o, i) ? ' class="new"' : '') + '><span class="q num">' + i.qty + '×</span><span><span class="nm">' + esc(i.item_name) + '</span>' +
    (sz ? '<span class="sz sz-' + sz + '">' + sizeText(sz) + '</span>' : '') +
    (o && isNew(o, i) ? '<span class="new-tag">MỚI</span>' : '') +
    (tagStation && i.station !== 'bep' ? '<span class="stn">' + SHORT[i.station] + '</span>' : '') +
    (rest.filter(x => !isTopping(x)).length ? '<span class="op">' + esc(rest.filter(x => !isTopping(x)).map(x => x.choice).join(' · ')) + '</span>' : '') +
    (rest.some(isTopping) ? '<span class="tp">' + rest.filter(isTopping).map(x => '<b>+ ' + esc(x.choice) + '</b>').join('') + '</span>' : '') +
    (i.note ? '<span class="in">' + esc(i.note) + '</span>' : '') + '</span></li>'; }).join('') + '</ul>';
}
function partStatus(p) {
  if (!p) return '';
  if (p.status === 'cho_nhan') return '<span class="st-pill st-cho_nhan">chờ nhận</span>';
  if (p.status === 'dang_lam') {
    const left = p.estimated_ready_at ? Math.ceil((new Date(p.estimated_ready_at) - Date.now()) / 60000) : null;
    return '<span class="st-pill st-dang_lam">đang làm' + (left != null ? (left >= 0 ? ', còn ' + left + "'" : ', trễ ' + (-left) + "'") : '') + '</span>';
  }
  return '<span class="st-pill st-da_ra_mon">đã xong</span>';
}
/* Nhắc phần của nơi kia trong cùng đơn */
function otherHtml(o) {
  const items = o.items.filter(i => i.station === OTHER), p = part(o, OTHER);
  if (!items.length || !p) return '';
  const n = items.reduce((s, i) => s + i.qty, 0);
  return '<p class="kc-other"><b>' + STATIONS[OTHER] + ':</b> ' + n + ' món (' + esc(items.map(i => i.item_name).join(', ')) + ') ' + partStatus(p) + '</p>';
}
function panelHtml(o) {
  const p = state.panels[o.id]; if (!p) return '';
  if (p.kind === 'accept') {
    return '<div class="panel"><p class="panel-title">Báo khách khoảng bao lâu xong?</p>' +
      '<div class="mins"><button class="btn btn-line btn-sm" type="button" data-act="min" data-d="-5" data-id="' + o.id + '" aria-label="Bớt 5 phút">−5</button>' +
      '<output class="num">' + (p.minutes == null ? '…' : p.minutes + "'") + '</output>' +
      '<button class="btn btn-line btn-sm" type="button" data-act="min" data-d="5" data-id="' + o.id + '" aria-label="Thêm 5 phút">+5</button>' +
      '<span class="small muted">Gợi ý theo số đơn ' + (IS_BEP ? 'bếp' : 'quầy') + ' đang làm và thời gian làm thực tế gần đây</span></div>' +
      '<div class="row"><button class="btn grow" type="button" data-act="accept-ok" data-id="' + o.id + '"' + (p.minutes == null ? ' disabled' : '') + '>Nhận đơn · ' + (p.minutes || '') + ' phút</button>' +
      '<button class="btn btn-line" type="button" data-act="close" data-id="' + o.id + '">Thôi</button></div></div>';
  }
  if (p.kind === 'pay') {
    const due = dueOf(o);
    if (due < 0) { // sửa đơn bớt món sau khi đã thu: trả lại khách
      return '<div class="panel"><p class="panel-title">Trả lại khách ' + vnd(-due) + '</p><p class="small muted" style="margin:0">Đã thu ' + vnd(o.paid_amount) + ', đơn sau khi sửa còn ' + vnd(o.total) + '.</p>' +
        '<div class="row"><button class="btn btn-ok grow" type="button" data-act="pay-ok" data-m="' + (o.paid_method || 'tien_mat') + '" data-id="' + o.id + '">Đã trả lại ' + vnd(-due) + '</button><button class="btn btn-line" type="button" data-act="close" data-id="' + o.id + '">Thôi</button></div></div>';
    }
    const given = Number(p.given || 0), change = given - due;
    const st = o.status !== 'da_ra_mon';
    return '<div class="panel"><p class="panel-title">' + (o.paid_amount != null ? 'Thu thêm ' : 'Thu ') + vnd(due) + '</p>' +
      (o.paid_amount != null ? '<p class="small muted" style="margin:0">Đã thu ' + vnd(o.paid_amount) + ', đơn sau khi sửa là ' + vnd(o.total) + '.</p>' : '') +
      (st && o.paid_amount == null ? '<p class="small muted" style="margin:0">Thu trước: đơn vẫn làm tiếp, ra món xong tự hoàn tất.</p>' : '') +
      '<div class="chips">' + [due, 50000, 100000, 200000, 500000].filter((v, i, a) => v >= due && a.indexOf(v) === i).map(v => '<button class="chipbtn" type="button" data-act="given" data-v="' + v + '" data-id="' + o.id + '" aria-pressed="' + (given === v) + '">' + (v === due ? 'Vừa đủ' : vnd(v)) + '</button>').join('') + '</div>' +
      (given ? '<div class="change"><span>Tiền thối</span><b class="num">' + (change >= 0 ? vnd(change) : 'Thiếu ' + vnd(-change)) + '</b></div>' : '') +
      '<div class="row"><button class="btn btn-ok grow" type="button" data-act="pay-ok" data-m="tien_mat" data-id="' + o.id + '">Tiền mặt</button>' +
      '<button class="btn grow" type="button" data-act="pay-ok" data-m="chuyen_khoan" data-id="' + o.id + '">Chuyển khoản</button>' +
      '<button class="btn btn-line" type="button" data-act="close" data-id="' + o.id + '">Thôi</button></div></div>';
  }
  if (p.kind === 'edit') {
    const items = editableItems(o);
    return '<div class="panel"><p class="panel-title">Sửa đơn ' + esc(orderLabel(o)) + '</p>' +
      '<ul class="ed-list">' + items.map(i => '<li><span class="ed-nm"><b>' + esc(i.item_name) + '</b>' + ((i.options || []).length ? '<small>' + esc(i.options.map(x => x.choice).join(' · ')) + '</small>' : '') + (i.note ? '<small class="in">' + esc(i.note) + '</small>' : '') + '</span>' +
        '<span class="ed-q"><button class="btn btn-line btn-sm" type="button" data-act="qty" data-item="' + i.id + '" data-q="' + (i.qty - 1) + '" data-id="' + o.id + '" aria-label="Bớt 1 ' + esc(i.item_name) + '">' + (i.qty > 1 ? '−' : '×') + '</button>' +
        '<output class="num">' + i.qty + '</output><button class="btn btn-line btn-sm" type="button" data-act="qty" data-item="' + i.id + '" data-q="' + (i.qty + 1) + '" data-id="' + o.id + '" aria-label="Thêm 1 ' + esc(i.item_name) + '"' + (i.qty >= 50 ? ' disabled' : '') + '>+</button></span></li>').join('') + '</ul>' +
      '<div class="row"><button class="btn grow" type="button" data-act="add-item" data-id="' + o.id + '">+ Thêm món</button><button class="btn btn-line" type="button" data-act="close" data-id="' + o.id + '">Xong</button></div></div>';
  }
  if (p.kind === 'cancel') {
    return '<div class="panel"><p class="panel-title">Huỷ đơn ' + orderLabel(o) + '? Cả đơn (đồ ăn và đồ uống) sẽ bị xoá, không tính doanh thu.</p>' +
      '<div class="row"><button class="btn btn-danger grow" type="button" data-act="cancel-ok" data-id="' + o.id + '">Huỷ đơn</button><button class="btn btn-line" type="button" data-act="close" data-id="' + o.id + '">Giữ lại</button></div></div>';
  }
  return '';
}
/* Món sửa được ở màn hình này: món của nơi này; chủ quán sửa được cả đơn */
const editableItems = o => state.session.employee.role === 'owner' ? o.items : o.items.filter(i => i.station === STATION);
function paidHtml(o) {
  if (!isMinePay(o)) return '';
  const ps = paidState(o);
  if (ps === 'full') return '<span class="paid paid-ok">Đã thu ' + vnd(o.paid_amount) + '</span>';
  if (ps === 'more') return '<span class="paid paid-warn">Đã thu ' + vnd(o.paid_amount) + ' · thu thêm ' + vnd(dueOf(o)) + '</span>';
  if (ps === 'refund') return '<span class="paid paid-warn">Đã thu ' + vnd(o.paid_amount) + ' · trả lại ' + vnd(-dueOf(o)) + '</span>';
  return '';
}
function actionsHtml(o, col) {
  if (state.panels[o.id]) return '';
  const id = o.id, ps = paidState(o);
  const cancel = isMinePay(o) ? '<button class="btn btn-line btn-sm" type="button" data-act="cancel" data-id="' + id + '">Huỷ</button>' : '';
  const edit = canEdit() ? '<button class="btn btn-line btn-sm" type="button" data-act="edit" data-id="' + id + '">Sửa đơn</button>' : '';
  // Thu tiền lúc nào cũng được (khách muốn trả trước); đã thu đủ thì thôi
  const payLabel = ps === 'more' ? 'Thu thêm' : ps === 'refund' ? 'Trả lại' : 'Thu tiền';
  const pay = isMinePay(o) && ps !== 'full' ? '<button class="btn' + (col === 'thanh_toan' ? '' : ' btn-line btn-sm') + '" type="button" data-act="pay" data-id="' + id + '">' + (col === 'thanh_toan' && ps === 'none' ? 'Thanh toán' : payLabel) + '</button>' : '';
  if (col === 'cho_nhan') return edit + pay + '<button class="btn" type="button" data-act="accept" data-id="' + id + '">Nhận đơn</button>' + cancel;
  if (col === 'dang_lam') return edit + pay + '<button class="btn btn-line btn-sm" type="button" data-act="extend" data-id="' + id + '">+5 phút</button><button class="btn btn-ok" type="button" data-act="served" data-id="' + id + '">Ra món</button>';
  return edit + (pay || '<span class="small muted">Chờ ' + STATIONS[OTHER].toLowerCase() + ' ra món</span>') + cancel;
}
function cardHtml(o, col) {
  // Cột làm món: chỉ món của nơi này. Cột thanh toán: cả đơn.
  const items = col === 'thanh_toan' ? o.items : o.items.filter(i => i.station === STATION);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const other = col === 'thanh_toan' ? (() => { const p = part(o, OTHER); return p && p.status !== 'da_ra_mon' ? '<p class="kc-other"><b>' + STATIONS[OTHER] + ':</b> ' + partStatus(p) + '</p>' : ''; })() : otherHtml(o);
  return '<article class="kc" data-order="' + o.id + '">' +
    '<div class="kc-top">' + qboxHtml(o) +
    '<div class="kc-who"><b>' + esc(o.customer_name) + '</b><span>' + (o.customer_phone ? '<a href="tel:' + esc(o.customer_phone) + '">' + esc(o.customer_phone) + '</a> · ' : '') + 'đặt lúc ' + hhmm(o.created_at) + ' · ' + count + ' món</span></div>' + timerHtml(o, col) + '</div>' +
    (isDelivery(o) ? '<p class="kc-addr"><b>Giao tới:</b> ' + esc(o.address || '') + (o.deliver_at ? '<span class="kc-when">Giao lúc ' + hhmm(o.deliver_at) + '</span>' : '') + '</p>' : '') +
    itemsHtml(items, col === 'thanh_toan' && !(o.stations || []).every(x => x.station === STATION), o) + other +
    '<button class="kc-detail" type="button" data-act="detail" data-id="' + o.id + '">Xem chi tiết đơn: size, topping, giá ›</button>' + (o.note ? '<p class="kc-note">Ghi chú: ' + esc(o.note) + '</p>' : '') +
    '<div class="kc-foot"><span class="kc-total num">' + (isMinePay(o) ? vnd(o.total) : '') + paidHtml(o) + '</span>' + actionsHtml(o, col) + '</div>' + panelHtml(o) + '</article>';
}
function grouped() {
  const by = {}; COLS.forEach(([k]) => { by[k] = []; });
  state.orders.forEach(o => { const c = colOf(o); if (c && by[c]) by[c].push(o); });
  return by;
}
function render() {
  const by = grouped();
  if (!state.col) state.col = by.cho_nhan.length || !by.dang_lam.length ? 'cho_nhan' : 'dang_lam';
  COLS.forEach(([k]) => {
    const list = $('#list-' + k); if (!list) return;
    $('#n-' + k).textContent = by[k].length;
    list.innerHTML = by[k].length ? by[k].map(o => cardHtml(o, k)).join('') : '<p class="col-empty">' + EMPTY[k] + '</p>';
    document.querySelector('.col[data-col="' + k + '"]').classList.toggle('on', state.col === k);
  });
  $('#seg').innerHTML = COLS.map(([k, t]) => '<button type="button" class="cc-' + k + '" data-seg="' + k + '" aria-pressed="' + (state.col === k) + '">' + t + '<span class="n num">' + by[k].length + '</span></button>').join('');
  const calls = []; state.orders.forEach(o => o.calls.forEach(c => calls.push({ c, o })));
  $('#calls').innerHTML = calls.map(({ c, o }) => '<div class="call" role="alert"><b class="num">' + (isTakeaway(o) ? 'Mang về' : o.queue_number) + '</b><span class="grow">' + esc(o.customer_name) + ' gọi nhân viên · ' + ago(c.created_at) + '</span><button class="btn btn-sm" type="button" data-call="' + c.id + '">Đã tới</button></div>').join('');
  document.title = (by.cho_nhan.length ? '(' + by.cho_nhan.length + ') ' : '') + SHORT[STATION] + ' Bé Nốc';
}

/* ---------- Thao tác ---------- */
/* follow: cột mà đơn chuyển sang. Trên điện thoại (chỉ thấy 1 cột), nếu cột đang xem
   hết đơn thì tự chuyển theo để người làm không bị "mất" đơn vừa bấm. */
async function run(btn, fn, okMsg, follow) {
  if (btn) btn.disabled = true;
  try { await fn(); if (okMsg) ui.toast(okMsg); } catch (e) { ui.toast(errText(e)); follow = null; }
  await refresh();
  if (follow && !grouped()[state.col].length) { state.col = follow; render(); }
}
async function onAction(e) {
  const b = e.target.closest('[data-act]');
  if (!b) { // bấm vào phần món / tên khách của thẻ đơn cũng mở chi tiết
    const zone = !e.target.closest('a, input, .panel') && e.target.closest('.kc-items, .kc-other, .kc-who, .kc-top .qbox');
    const card = zone && zone.closest('.kc'), od = card && state.orders.find(x => x.id === card.dataset.order);
    if (od) openDetail(od);
    return;
  }
  const id = b.dataset.id, o = state.orders.find(x => x.id === id); if (!o) return;
  switch (b.dataset.act) {
    case 'accept':
      state.panels[id] = { kind: 'accept', minutes: null }; render();
      try { state.panels[id].minutes = await api.suggestWait(id, STATION); } catch (err) { state.panels[id].minutes = IS_BEP ? 15 : 5; }
      render(); break;
    case 'min': { const p = state.panels[id]; p.minutes = Math.max(5, Math.min(90, (p.minutes || 15) + Number(b.dataset.d))); render(); break; }
    case 'accept-ok': { const m = state.panels[id].minutes; delete state.panels[id]; run(b, () => api.acceptOrder(id, m, STATION), 'Đã nhận đơn ' + orderLabel(o) + ' · ' + m + ' phút', 'dang_lam'); break; }
    case 'extend': run(b, () => api.extendWait(id, 5, STATION), 'Đã báo khách thêm 5 phút'); break;
    case 'served': run(b, () => api.markServed(id, STATION), 'Đơn ' + orderLabel(o) + ' đã ra món', isMinePay(o) ? 'thanh_toan' : null); break;
    case 'pay': state.panels[id] = { kind: 'pay', given: 0 }; render(); break;
    case 'given': state.panels[id].given = Number(b.dataset.v); render(); break;
    case 'pay-ok': {
      delete state.panels[id]; const due = dueOf(o);
      const msg = due < 0 ? 'Đã trả lại khách ' + vnd(-due) : 'Đã thu ' + vnd(due) + (b.dataset.m === 'tien_mat' ? ' tiền mặt' : ' chuyển khoản') + (o.status !== 'da_ra_mon' ? ' · đơn vẫn làm tiếp' : '');
      run(b, () => api.completePayment(id, b.dataset.m), msg, 'cho_nhan'); break;
    }
    case 'edit': state.panels[id] = { kind: 'edit' }; render(); break;
    case 'detail': openDetail(o); break;
    case 'qty': {
      const q = Number(b.dataset.q), it = o.items.find(x => String(x.id) === b.dataset.item);
      run(b, () => api.staffSetItemQty(Number(b.dataset.item), q), q <= 0 && it ? 'Đã bỏ ' + it.item_name : null); break;
    }
    case 'add-item': openPicker(o); break;
    case 'cancel': state.panels[id] = { kind: 'cancel' }; render(); break;
    case 'cancel-ok': delete state.panels[id]; run(b, () => api.cancelOrder(id), 'Đã huỷ đơn ' + orderLabel(o)); break;
    case 'close': delete state.panels[id]; render(); break;
  }
}
/* ---------- Chi tiết đơn: mọi món của cả bếp và pha chế, tuỳ chọn, giá ---------- */
const DINE = { tai_quan: 'Ăn tại quán', mang_ve: 'Mang về', giao_hang: 'Giao hàng' };
function detailItem(i) {
  const opts = i.options || [], base = i.unit_price - opts.reduce((t, x) => t + (x.price || 0), 0), sz = sizeOf(opts);
  return '<li class="dt-it"><div class="dt-row"><b><span class="num">' + i.qty + '×</span> ' + esc(i.item_name) + (sz ? ' <span class="sz sz-' + sz + '">' + sizeText(sz) + '</span>' : '') + '</b><b class="num">' + vnd(i.unit_price * i.qty) + '</b></div>' +
    (opts.length ? '<div class="dt-row dt-sub"><span>' + (sz === 'M' || sz === 'L' ? 'Giá size M' : 'Giá món') + '</span><span class="num">' + vnd(base) + '</span></div>' : '') +
    opts.filter(x => !(sz === 'M' && isSizeOpt(x))).map(x => '<div class="dt-row dt-sub' + (isTopping(x) ? ' dt-tp' : '') + '"><span>' + (isSizeOpt(x) ? (sz === 'UP' ? '<b>Upsize</b>' : 'Lên <b>size ' + sz + '</b>') : esc(x.group) + ': <b>' + esc(x.choice) + '</b>') + '</span><span class="num">' + (x.price ? '+' + vnd(x.price) : '0đ') + '</span></div>').join('') +
    (i.qty > 1 ? '<div class="dt-row dt-sub"><span>Mỗi phần</span><span class="num">' + vnd(i.unit_price) + ' × ' + i.qty + '</span></div>' : '') +
    (i.note ? '<p class="dt-note">Ghi chú món: ' + esc(i.note) + '</p>' : '') + '</li>';
}
function openDetail(o) {
  const groups = ['bep', 'pha_che'].map(st => ({ st, items: o.items.filter(i => i.station === st), p: part(o, st) })).filter(g => g.items.length);
  const sub = [DINE[o.dine_type] || '', o.customer_phone ? '<a href="tel:' + esc(o.customer_phone) + '">' + esc(o.customer_phone) + '</a>' : '', 'đặt lúc ' + hhmm(o.created_at)].filter(Boolean).join(' · ');
  const ps = paidState(o);
  ui.sheet(ui.head('Đơn ' + esc(orderLabel(o)), sub) + '<div class="sh-body dt">' +
    (isDelivery(o) ? '<p class="kc-addr"><b>Giao tới:</b> ' + esc(o.address || '') + (o.deliver_at ? '<span class="kc-when">Giao lúc ' + hhmm(o.deliver_at) + '</span>' : '') + '</p>' : '') +
    groups.map(g => '<section class="dt-grp' + (g.st === STATION ? ' mine' : '') + '"><h3>' + STATIONS[g.st] + (g.st === STATION ? ' (nơi này)' : '') + ' ' + partStatus(g.p) + '</h3><ul>' + g.items.map(detailItem).join('') + '</ul></section>').join('') +
    (o.note ? '<p class="kc-note">Ghi chú đơn: ' + esc(o.note) + '</p>' : '') +
    '<div class="dt-row dt-total"><span>Tổng đơn</span><b class="num">' + vnd(o.total) + '</b></div>' +
    (ps === 'none' ? '<p class="small muted">Chưa thu tiền.</p>' : '<p class="paid ' + (ps === 'full' ? 'paid-ok' : 'paid-warn') + '">Đã thu ' + vnd(o.paid_amount) + (o.paid_method ? (o.paid_method === 'tien_mat' ? ' tiền mặt' : ' chuyển khoản') : '') + (ps === 'more' ? ' · còn thu thêm ' + vnd(dueOf(o)) : ps === 'refund' ? ' · trả lại ' + vnd(-dueOf(o)) : '') + '</p>') +
    '</div><div class="sh-foot"><button class="btn btn-line btn-block" type="button" data-close>Đóng</button></div>');
}
/* ---------- Thêm món vào đơn: chọn món, tuỳ chọn, số lượng ---------- */
function priceLabel(it) { const g = sizeGroup(it), L = g && g.choices.find(c => /^size l$/i.test(c.name)); return L ? 'M ' + K(it.price) + ' · L ' + K(it.price + L.price) : K(it.price); }
let menuCache = null;
async function getMenu() { if (!menuCache) { menuCache = await api.getMenu(); setTimeout(() => { menuCache = null; }, 60e3); } return menuCache; }
async function openPicker(o) {
  let menu; try { menu = await getMenu(); } catch (e) { ui.toast(errText(e)); return; }
  const owner = state.session.employee.role === 'owner';
  const cats = menu.filter(c => owner || (c.station || 'bep') === STATION);
  const listView = () => ui.head('Thêm món vào đơn', esc(orderLabel(o))) + '<div class="sh-body">' +
    '<input class="search" id="pkQ" type="search" placeholder="Tìm món…" aria-label="Tìm món">' +
    '<div id="pkList">' + cats.map(c => '<section class="pk-cat"><h3>' + esc(c.name) + '</h3>' + c.items.map(it => '<button class="pk-item" type="button" data-pick="' + esc(it.id) + '" data-n="' + esc(fold(it.name)) + '"><span>' + esc(it.name) + '</span><b class="num">' + priceLabel(it) + '</b></button>').join('') + '</section>').join('') + '</div></div>';
  ui.sheet(listView(), sh => {
    const q = $('#pkQ', sh);
    q.oninput = () => { const v = fold(q.value); sh.querySelectorAll('.pk-item').forEach(x => { x.hidden = !!v && x.dataset.n.indexOf(v) < 0; }); sh.querySelectorAll('.pk-cat').forEach(c => { c.hidden = ![...c.querySelectorAll('.pk-item')].some(x => !x.hidden); }); };
    sh.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; const it = cats.flatMap(c => c.items).find(x => x.id === b.dataset.pick); if (it) pickOptions(o, it); });
  });
}
function pickOptions(o, it) {
  const sel = new Map(it.option_groups.map(g => [g.id, new Set(g.choices.filter(c => c.default).map(c => c.id))]));
  let qty = 1;
  const price = () => (it.price + it.option_groups.reduce((s, g) => s + g.choices.filter(c => sel.get(g.id).has(c.id)).reduce((t, c) => t + c.price, 0), 0)) * qty;
  ui.sheet(ui.head(esc(it.name), 'Thêm vào đơn ' + esc(orderLabel(o))) + '<div class="sh-body">' +
    it.option_groups.map(g => '<fieldset class="pk-og"><legend>' + esc(g.title) + (g.min > 0 ? ' <span class="small" style="color:var(--red)">bắt buộc</span>' : '') + '</legend>' +
      g.choices.map(c => '<label class="pk-ch"><input type="' + (g.max === 1 ? 'radio' : 'checkbox') + '" name="g' + g.id + '" value="' + c.id + '"' + (sel.get(g.id).has(c.id) ? ' checked' : '') + '><span>' + esc(c.name) + '</span>' + (c.price ? '<span class="small muted">+' + K(c.price) + '</span>' : '') + '</label>').join('') + '</fieldset>').join('') +
    '<label class="field" for="pkNote">Ghi chú món<input id="pkNote" maxlength="120"></label>' +
    '<div class="row" style="justify-content:space-between;align-items:center"><div class="mins"><button class="btn btn-line btn-sm" type="button" id="pkMinus" aria-label="Bớt 1">−</button><output class="num" id="pkQty">1</output><button class="btn btn-line btn-sm" type="button" id="pkPlus" aria-label="Thêm 1">+</button></div><b class="num" id="pkPrice">' + vnd(price()) + '</b></div>' +
    '<p class="msg" id="pkMsg" hidden></p></div><div class="sh-foot"><button class="btn btn-block" type="button" id="pkAdd">Thêm vào đơn</button></div>', sh => {
    const paint = () => { $('#pkQty', sh).textContent = qty; $('#pkPrice', sh).textContent = vnd(price()); };
    sh.addEventListener('change', e => {
      const inp = e.target.closest('input[name^="g"]'); if (!inp) return;
      const g = it.option_groups.find(x => 'g' + x.id === inp.name), set = sel.get(g.id), cid = Number(inp.value);
      if (g.max === 1) { set.clear(); if (inp.checked) set.add(cid); }
      else if (inp.checked) { if (set.size >= g.max) { inp.checked = false; ui.toast('Chọn tối đa ' + g.max); return; } set.add(cid); } else set.delete(cid);
      paint();
    });
    $('#pkMinus', sh).onclick = () => { qty = Math.max(1, qty - 1); paint(); };
    $('#pkPlus', sh).onclick = () => { qty = Math.min(50, qty + 1); paint(); };
    $('#pkAdd', sh).onclick = async () => {
      const bad = it.option_groups.find(g => sel.get(g.id).size < g.min);
      if (bad) { const m = $('#pkMsg', sh); m.textContent = 'Chọn "' + bad.title + '"'; m.hidden = false; return; }
      const btn = $('#pkAdd', sh); btn.disabled = true;
      try {
        await api.staffAddItems(o.id, [{ menu_item_id: it.id, qty, note: $('#pkNote', sh).value.trim() || null, choice_ids: [...sel.values()].flatMap(x => [...x]) }]);
        ui.close(); ui.toast('Đã thêm ' + qty + '× ' + it.name + ' vào đơn ' + orderLabel(o)); state.panels[o.id] = { kind: 'edit' }; refresh();
      } catch (err) { const m = $('#pkMsg', sh); m.textContent = errText(err); m.hidden = false; btn.disabled = false; }
    };
  });
}
function onCall(e) { const b = e.target.closest('[data-call]'); if (b) run(b, () => api.resolveCall(Number(b.dataset.call))); }

/* ---------- Chuông báo ---------- */
function toggleSound() {
  state.sound = !state.sound;
  const b = $('#soundBtn'); b.setAttribute('aria-pressed', state.sound); b.textContent = state.sound ? 'Chuông báo: Bật' : 'Bật chuông báo';
  b.className = 'btn btn-sm ' + (state.sound ? 'btn-ok' : 'btn-line');
  if (state.sound) { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); beep(); } catch (e) { /* không có âm thanh */ } lockScreen(); }
}
function beep() {
  if (!audio) return;
  // Bếp và quầy pha chế kêu hai giai điệu khác nhau để không nhầm khi đứng gần
  const notes = IS_BEP ? [784, 1046] : [1046, 1318];
  [0, 0.22].forEach((t, i) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = notes[i]; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, audio.currentTime + t); g.gain.exponentialRampToValueAtTime(0.4, audio.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.2);
    o.connect(g).connect(audio.destination); o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.22);
  });
}
function alertNew(msg) {
  ui.toast(msg);
  if (state.sound) { beep(); setTimeout(beep, 700); }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}
async function lockScreen() { try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* máy không hỗ trợ giữ màn hình sáng */ } }
})();
