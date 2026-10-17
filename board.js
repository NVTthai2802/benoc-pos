/* =====================================================================
   MÀN HÌNH LÀM MÓN — dùng chung cho bếp (bep.html) và quầy pha chế (phache.html)
   Mỗi trang đặt window.BOARD = { station: 'bep' | 'pha_che' } trước khi nạp file này.

   - Mỗi đơn có 1 số thẻ, nhưng món được chia về trạm theo danh mục menu.
   - Mỗi màn hình chỉ thấy món của trạm mình, tự nhận đơn / báo thời gian / ra món riêng.
   - Màn bếp còn là nơi thu tiền: đơn sang "Chờ thanh toán" khi CẢ HAI trạm đã ra món.
   ===================================================================== */
(function () {
'use strict';
const { api, ui, esc, vnd, hhmm, ago, errText, DEMO, STATION } = BN;
const $ = (s, r = document) => r.querySelector(s);

const CFG = {
  bep: {
    station: 'bep', brand: 'Bếp', docTitle: 'Bếp Bé Nốc', loginTitle: 'Màn hình bếp', cashier: true,
    other: { href: 'phache.html', label: 'Màn hình pha chế' },
    cols: [['cho_nhan', 'Chờ nhận'], ['dang_lam', 'Đang làm'], ['da_ra_mon', 'Chờ thanh toán']],
    empty: { cho_nhan: 'Chưa có đơn mới', dang_lam: 'Không có đơn đang làm', da_ra_mon: 'Không có đơn chờ thanh toán' },
    askTime: 'Báo khách khoảng bao lâu xong?'
  },
  pha_che: {
    station: 'pha_che', brand: 'Pha chế', docTitle: 'Quầy pha chế Bé Nốc', loginTitle: 'Màn hình quầy pha chế', cashier: false,
    other: { href: 'bep.html', label: 'Màn hình bếp' },
    cols: [['cho_nhan', 'Chờ nhận'], ['dang_lam', 'Đang pha'], ['da_ra_mon', 'Đã xong']],
    empty: { cho_nhan: 'Chưa có đồ uống mới', dang_lam: 'Không có đồ uống đang làm', da_ra_mon: 'Chưa có đồ uống nào xong' },
    askTime: 'Báo khách khoảng bao lâu xong đồ uống?'
  }
};
const C = CFG[(window.BOARD || {}).station] || CFG.bep;
const COLS = C.cols;
const state = { orders: [], panels: {}, col: null, sound: false, seen: null, seenCalls: null, session: null };
let audio = null, wakeLock = null;

document.title = C.docTitle;
$('#demoNote').hidden = !DEMO;
BN.staff.requireLogin($('#app'), { title: C.loginTitle, onReady: s => { state.session = s; start(); } });

/* ---------- Dữ liệu của trạm này ---------- */
const stationRow = (o, st) => (o.stations || []).find(x => x.station === st) || null;
const mine = o => stationRow(o, C.station);
const itemStation = i => i.station || 'bep';
const myItems = o => o.items.filter(i => itemStation(i) === C.station);
const others = o => (o.stations || []).filter(x => x.station !== C.station);
const isMulti = o => (o.stations || []).length > 1;

/* Đơn nằm ở cột nào của màn hình này (null = màn hình này chưa cần thấy đơn).
   Màn bếp (có thu tiền): đơn xong hết ở cả hai trạm vào cột Chờ thanh toán, kể cả đơn chỉ có đồ uống pha chế. */
function colOf(o) {
  const m = mine(o);
  if (C.cashier && o.status === 'da_ra_mon') return 'da_ra_mon';
  return m ? m.status : null;
}
const canPay = o => C.cashier && o.status === 'da_ra_mon';
/* Màn pha chế không thu tiền; chỉ huỷ được đơn của riêng mình, tránh huỷ nhầm cả phần bếp */
const canCancel = o => C.cashier || !isMulti(o);

function start() {
  $('#app').innerHTML =
    '<header class="topbar"><div class="topbar-in"><div class="brand"><b>' + esc(C.brand) + '</b><span>Bé Nốc</span></div>' +
    '<span class="clock num" id="clock"></span>' +
    '<button class="btn btn-sm btn-line" type="button" id="soundBtn" aria-pressed="false">Bật chuông báo</button>' +
    (state.session.employee.role === 'owner' ? '<a class="btn btn-sm btn-line" href="' + C.other.href + '">' + esc(C.other.label) + '</a><a class="btn btn-sm btn-line" href="quanly.html">Quản lý</a>' : '') +
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
    // Chuông chỉ báo đơn có món của trạm này; lượt gọi nhân viên thì cả hai màn hình đều thấy
    const ids = new Set(state.orders.filter(mine).map(o => o.id)), calls = new Set(); state.orders.forEach(o => o.calls.forEach(c => calls.add(c.id)));
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
/* Phần trạng thái dùng cho đồng hồ trên thẻ: của trạm này, hoặc (đơn không có món của trạm này) của cả đơn */
const clockOf = o => mine(o) || { status: o.status, estimated_ready_at: o.estimated_ready_at, served_at: o.served_at };
function timerHtml(o) {
  const now = Date.now(), t = clockOf(o);
  if (t.status === 'cho_nhan') { const m = Math.floor((now - new Date(o.created_at)) / 60000); return '<div class="timer' + (m >= 3 ? ' warn' : '') + '">Đã chờ<b class="num">' + m + "'" + '</b></div>'; }
  if (t.status === 'dang_lam') {
    const left = Math.ceil((new Date(t.estimated_ready_at) - now) / 60000);
    return left >= 0 ? '<div class="timer">Còn<b class="num">' + left + "'" + '</b></div>' : '<div class="timer late">Trễ<b class="num">' + (-left) + "'" + '</b></div>';
  }
  return '<div class="timer">Ra món<b class="num">' + hhmm(t.served_at) + '</b></div>';
}
function stateText(t) {
  if (t.status === 'cho_nhan') return 'chờ nhận';
  if (t.status === 'da_ra_mon') return 'đã ra món';
  const left = Math.ceil((new Date(t.estimated_ready_at) - Date.now()) / 60000);
  return left >= 0 ? 'đang làm · còn ' + left + "'" : 'đang làm · trễ ' + (-left) + "'";
}
/* Dòng báo trạm còn lại của đơn đang làm gì ("Quầy pha chế: đang làm · còn 4'") */
function otherHtml(o) {
  const list = others(o); if (!list.length) return '';
  return '<p class="kc-other">' + list.map(t => '<span class="st st-' + t.status + '"><b>' + esc(STATION[t.station]) + '</b> ' + stateText(t) + '</span>').join('') + '</p>';
}
function itemsHtml(o, all) {
  const list = all ? o.items : myItems(o);
  const tagged = all && isMulti(o);
  return '<ul class="kc-items">' + list.map(i => '<li><span class="q num">' + i.qty + '×</span><span><span class="nm">' + esc(i.item_name) + '</span>' +
    (tagged ? ' <span class="stag">' + esc(STATION[itemStation(i)]) + '</span>' : '') +
    ((i.options || []).length ? '<span class="op">' + esc(i.options.map(x => x.choice).join(' · ')) + '</span>' : '') +
    (i.note ? '<span class="in">' + esc(i.note) + '</span>' : '') + '</span></li>').join('') + '</ul>';
}
function panelHtml(o) {
  const p = state.panels[o.id]; if (!p) return '';
  if (p.kind === 'accept') {
    return '<div class="panel"><p class="panel-title">' + esc(C.askTime) + '</p>' +
      '<div class="mins"><button class="btn btn-line btn-sm" type="button" data-act="min" data-d="-5" data-id="' + o.id + '" aria-label="Bớt 5 phút">−5</button>' +
      '<output class="num">' + (p.minutes == null ? '…' : p.minutes + "'") + '</output>' +
      '<button class="btn btn-line btn-sm" type="button" data-act="min" data-d="5" data-id="' + o.id + '" aria-label="Thêm 5 phút">+5</button>' +
      '<span class="small muted">Gợi ý theo số đơn đang làm và thời gian làm thực tế gần đây</span></div>' +
      '<div class="row"><button class="btn grow" type="button" data-act="accept-ok" data-id="' + o.id + '"' + (p.minutes == null ? ' disabled' : '') + '>Nhận đơn · ' + (p.minutes || '') + ' phút</button>' +
      '<button class="btn btn-line" type="button" data-act="close" data-id="' + o.id + '">Thôi</button></div></div>';
  }
  if (p.kind === 'pay') {
    const given = Number(p.given || 0), change = given - o.total;
    return '<div class="panel"><p class="panel-title">Thu ' + vnd(o.total) + '</p>' +
      '<div class="chips">' + [o.total, 50000, 100000, 200000, 500000].filter((v, i, a) => v >= o.total && a.indexOf(v) === i).map(v => '<button class="chipbtn" type="button" data-act="given" data-v="' + v + '" data-id="' + o.id + '" aria-pressed="' + (given === v) + '">' + (v === o.total ? 'Vừa đủ' : vnd(v)) + '</button>').join('') + '</div>' +
      (given ? '<div class="change"><span>Tiền thối</span><b class="num">' + (change >= 0 ? vnd(change) : 'Thiếu ' + vnd(-change)) + '</b></div>' : '') +
      '<div class="row"><button class="btn btn-ok grow" type="button" data-act="pay-ok" data-m="tien_mat" data-id="' + o.id + '">Tiền mặt</button>' +
      '<button class="btn grow" type="button" data-act="pay-ok" data-m="chuyen_khoan" data-id="' + o.id + '">Chuyển khoản</button>' +
      '<button class="btn btn-line" type="button" data-act="close" data-id="' + o.id + '">Thôi</button></div></div>';
  }
  if (p.kind === 'cancel') {
    return '<div class="panel"><p class="panel-title">Huỷ đơn số ' + o.queue_number + '? Đơn sẽ bị xoá, không tính doanh thu.</p>' +
      '<div class="row"><button class="btn btn-danger grow" type="button" data-act="cancel-ok" data-id="' + o.id + '">Huỷ đơn</button><button class="btn btn-line" type="button" data-act="close" data-id="' + o.id + '">Giữ lại</button></div></div>';
  }
  return '';
}
function actionsHtml(o, col) {
  if (state.panels[o.id]) return '';
  const id = o.id, cancel = canCancel(o) ? '<button class="btn btn-line btn-sm" type="button" data-act="cancel" data-id="' + id + '">Huỷ</button>' : '';
  if (col === 'cho_nhan') return '<button class="btn" type="button" data-act="accept" data-id="' + id + '">Nhận đơn</button>' + cancel;
  if (col === 'dang_lam') return '<button class="btn btn-line btn-sm" type="button" data-act="extend" data-id="' + id + '">+5 phút</button><button class="btn btn-ok" type="button" data-act="served" data-id="' + id + '">Ra món</button>';
  if (canPay(o)) return '<button class="btn" type="button" data-act="pay" data-id="' + id + '">Thanh toán</button>' + cancel;
  if (C.cashier) return '<span class="small muted kc-hint">Chờ ' + esc(others(o).filter(t => t.status !== 'da_ra_mon').map(t => STATION[t.station]).join(', ').toLowerCase()) + ' ra món</span>';
  return '';
}
function cardHtml(o, col) {
  const showAll = C.cashier && col === 'da_ra_mon' && canPay(o);
  const list = showAll ? o.items : myItems(o), count = list.reduce((s, i) => s + i.qty, 0);
  return '<article class="kc" data-order="' + o.id + '">' +
    '<div class="kc-top"><div class="qbox"><span>Số</span><b class="num">' + o.queue_number + '</b></div>' +
    '<div class="kc-who"><b>' + esc(o.customer_name) + '</b><span>' + (o.customer_phone ? esc(o.customer_phone) + ' · ' : '') + 'đặt lúc ' + hhmm(o.created_at) + ' · ' + count + ' món</span></div>' + timerHtml(o) + '</div>' +
    itemsHtml(o, showAll) + otherHtml(o) + (o.note ? '<p class="kc-note">Ghi chú: ' + esc(o.note) + '</p>' : '') +
    '<div class="kc-foot">' + (C.cashier ? '<span class="kc-total num">' + vnd(o.total) + '</span>' : '<span class="kc-total"></span>') + actionsHtml(o, col) + '</div>' + panelHtml(o) + '</article>';
}
function render() {
  const by = { cho_nhan: [], dang_lam: [], da_ra_mon: [] };
  state.orders.forEach(o => { const c = colOf(o); if (c && by[c]) by[c].push(o); });
  if (!state.col) state.col = by.cho_nhan.length || !by.dang_lam.length ? 'cho_nhan' : 'dang_lam';
  COLS.forEach(([k]) => {
    const list = $('#list-' + k); if (!list) return;
    $('#n-' + k).textContent = by[k].length;
    list.innerHTML = by[k].length ? by[k].map(o => cardHtml(o, k)).join('') : '<p class="col-empty">' + C.empty[k] + '</p>';
    document.querySelector('.col[data-col="' + k + '"]').classList.toggle('on', state.col === k);
  });
  $('#seg').innerHTML = COLS.map(([k, t]) => '<button type="button" class="cc-' + k + '" data-seg="' + k + '" aria-pressed="' + (state.col === k) + '">' + t + '<span class="n num">' + by[k].length + '</span></button>').join('');
  const calls = []; state.orders.forEach(o => o.calls.forEach(c => calls.push({ c, o })));
  $('#calls').innerHTML = calls.map(({ c, o }) => '<div class="call" role="alert"><b class="num">' + o.queue_number + '</b><span class="grow">' + esc(o.customer_name) + ' gọi nhân viên · ' + ago(c.created_at) + '</span><button class="btn btn-sm" type="button" data-call="' + c.id + '">Đã tới</button></div>').join('');
  document.title = (by.cho_nhan.length ? '(' + by.cho_nhan.length + ') ' : '') + C.docTitle;
}

/* ---------- Thao tác ---------- */
/* follow: cột mà đơn chuyển sang. Trên điện thoại (chỉ thấy 1 cột), nếu cột đang xem
   hết đơn thì tự chuyển theo để người làm không bị "mất" đơn vừa bấm. */
async function run(btn, fn, okMsg, follow) {
  if (btn) btn.disabled = true;
  try { await fn(); if (okMsg) ui.toast(okMsg); } catch (e) { ui.toast(errText(e)); follow = null; }
  await refresh();
  if (follow && !state.orders.some(o => colOf(o) === state.col)) { state.col = follow; render(); }
}
async function onAction(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.dataset.id, o = state.orders.find(x => x.id === id); if (!o) return;
  switch (b.dataset.act) {
    case 'accept':
      state.panels[id] = { kind: 'accept', minutes: null }; render();
      try { state.panels[id].minutes = await api.suggestWait(id, C.station); } catch (err) { state.panels[id].minutes = 15; }
      render(); break;
    case 'min': { const p = state.panels[id]; p.minutes = Math.max(5, Math.min(90, (p.minutes || 15) + Number(b.dataset.d))); render(); break; }
    case 'accept-ok': { const m = state.panels[id].minutes; delete state.panels[id]; run(b, () => api.acceptOrder(id, m, C.station), 'Đã nhận đơn số ' + o.queue_number + ' · ' + m + ' phút', 'dang_lam'); break; }
    case 'extend': run(b, () => api.extendWait(id, 5, C.station), 'Đã báo khách thêm 5 phút'); break;
    case 'served': run(b, () => api.markServed(id, C.station), 'Số ' + o.queue_number + ' đã ra món', 'da_ra_mon'); break;
    case 'pay': state.panels[id] = { kind: 'pay', given: 0 }; render(); break;
    case 'given': state.panels[id].given = Number(b.dataset.v); render(); break;
    case 'pay-ok': { delete state.panels[id]; run(b, () => api.completePayment(id, b.dataset.m), 'Đã thu ' + vnd(o.total) + (b.dataset.m === 'tien_mat' ? ' tiền mặt' : ' chuyển khoản'), 'cho_nhan'); break; }
    case 'cancel': state.panels[id] = { kind: 'cancel' }; render(); break;
    case 'cancel-ok': delete state.panels[id]; run(b, () => api.cancelOrder(id), 'Đã huỷ đơn số ' + o.queue_number); break;
    case 'close': delete state.panels[id]; render(); break;
  }
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
  /* Bếp: hai nốt lên (như trước). Pha chế: hai nốt khác để hai quầy đứng gần nhau vẫn phân biệt được tiếng chuông */
  const notes = C.station === 'pha_che' ? [1318, 988] : [784, 1046];
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
