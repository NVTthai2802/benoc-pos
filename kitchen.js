/* =====================================================================
   MÀN HÌNH BẾP / QUẦY PHA CHẾ — dùng chung một mã.
   Trang đặt window.BENOC_STATION = 'bep' | 'pha_che' trước khi nạp file này.
   - Mỗi nơi chỉ thấy và làm phần món của mình trong đơn.
   - Mỗi quầy thu tiền đơn của mình: đơn gọi từ menu Trà · Cà phê do quầy pha chế thu,
     đơn từ menu Ăn vặt do bếp thu. (Đơn lỡ có cả hai loại món thì bếp thu.)
   ===================================================================== */
(function () {
'use strict';
const { api, ui, esc, vnd, hhmm, ago, errText, DEMO, STATIONS , qboxHtml, orderLabel, isTakeaway } = BN;
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
function itemsHtml(items, tagStation) {
  return '<ul class="kc-items">' + items.map(i => '<li><span class="q num">' + i.qty + '×</span><span><span class="nm">' + esc(i.item_name) + '</span>' +
    (tagStation && i.station !== 'bep' ? '<span class="stn">' + SHORT[i.station] + '</span>' : '') +
    ((i.options || []).length ? '<span class="op">' + esc(i.options.map(x => x.choice).join(' · ')) + '</span>' : '') +
    (i.note ? '<span class="in">' + esc(i.note) + '</span>' : '') + '</span></li>').join('') + '</ul>';
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
    const given = Number(p.given || 0), change = given - o.total;
    const op = part(o, OTHER), pending = op && op.status !== 'da_ra_mon';
    return '<div class="panel"><p class="panel-title">Thu ' + vnd(o.total) + '</p>' +
      (pending ? '<p class="msg" style="margin:0">Phần ' + STATIONS[OTHER].toLowerCase() + ' của đơn này chưa xong.</p>' : '') +
      '<div class="chips">' + [o.total, 50000, 100000, 200000, 500000].filter((v, i, a) => v >= o.total && a.indexOf(v) === i).map(v => '<button class="chipbtn" type="button" data-act="given" data-v="' + v + '" data-id="' + o.id + '" aria-pressed="' + (given === v) + '">' + (v === o.total ? 'Vừa đủ' : vnd(v)) + '</button>').join('') + '</div>' +
      (given ? '<div class="change"><span>Tiền thối</span><b class="num">' + (change >= 0 ? vnd(change) : 'Thiếu ' + vnd(-change)) + '</b></div>' : '') +
      '<div class="row"><button class="btn btn-ok grow" type="button" data-act="pay-ok" data-m="tien_mat" data-id="' + o.id + '">Tiền mặt</button>' +
      '<button class="btn grow" type="button" data-act="pay-ok" data-m="chuyen_khoan" data-id="' + o.id + '">Chuyển khoản</button>' +
      '<button class="btn btn-line" type="button" data-act="close" data-id="' + o.id + '">Thôi</button></div></div>';
  }
  if (p.kind === 'cancel') {
    return '<div class="panel"><p class="panel-title">Huỷ đơn ' + orderLabel(o) + '? Cả đơn (đồ ăn và đồ uống) sẽ bị xoá, không tính doanh thu.</p>' +
      '<div class="row"><button class="btn btn-danger grow" type="button" data-act="cancel-ok" data-id="' + o.id + '">Huỷ đơn</button><button class="btn btn-line" type="button" data-act="close" data-id="' + o.id + '">Giữ lại</button></div></div>';
  }
  return '';
}
function actionsHtml(o, col) {
  if (state.panels[o.id]) return '';
  const id = o.id, cancel = isMinePay(o) ? '<button class="btn btn-line btn-sm" type="button" data-act="cancel" data-id="' + id + '">Huỷ</button>' : '';
  if (col === 'cho_nhan') return '<button class="btn" type="button" data-act="accept" data-id="' + id + '">Nhận đơn</button>' + cancel;
  if (col === 'dang_lam') return '<button class="btn btn-line btn-sm" type="button" data-act="extend" data-id="' + id + '">+5 phút</button><button class="btn btn-ok" type="button" data-act="served" data-id="' + id + '">Ra món</button>';
  return '<button class="btn" type="button" data-act="pay" data-id="' + id + '">Thanh toán</button>' + cancel;
}
function cardHtml(o, col) {
  // Cột làm món: chỉ món của nơi này. Cột thanh toán: cả đơn.
  const items = col === 'thanh_toan' ? o.items : o.items.filter(i => i.station === STATION);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const other = col === 'thanh_toan' ? (() => { const p = part(o, OTHER); return p && p.status !== 'da_ra_mon' ? '<p class="kc-other"><b>' + STATIONS[OTHER] + ':</b> ' + partStatus(p) + '</p>' : ''; })() : otherHtml(o);
  return '<article class="kc" data-order="' + o.id + '">' +
    '<div class="kc-top">' + qboxHtml(o) +
    '<div class="kc-who"><b>' + esc(o.customer_name) + '</b><span>' + (o.customer_phone ? esc(o.customer_phone) + ' · ' : '') + 'đặt lúc ' + hhmm(o.created_at) + ' · ' + count + ' món</span></div>' + timerHtml(o, col) + '</div>' +
    itemsHtml(items, col === 'thanh_toan' && !(o.stations || []).every(x => x.station === STATION)) + other + (o.note ? '<p class="kc-note">Ghi chú: ' + esc(o.note) + '</p>' : '') +
    '<div class="kc-foot"><span class="kc-total num">' + (isMinePay(o) ? vnd(o.total) : '') + '</span>' + actionsHtml(o, col) + '</div>' + panelHtml(o) + '</article>';
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
  const b = e.target.closest('[data-act]'); if (!b) return;
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
    case 'pay-ok': { delete state.panels[id]; run(b, () => api.completePayment(id, b.dataset.m), 'Đã thu ' + vnd(o.total) + (b.dataset.m === 'tien_mat' ? ' tiền mặt' : ' chuyển khoản'), 'cho_nhan'); break; }
    case 'cancel': state.panels[id] = { kind: 'cancel' }; render(); break;
    case 'cancel-ok': delete state.panels[id]; run(b, () => api.cancelOrder(id), 'Đã huỷ đơn ' + orderLabel(o)); break;
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
