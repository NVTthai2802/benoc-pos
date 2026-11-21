/* =====================================================================
   MÀN HÌNH BẾP / QUẦY PHA CHẾ — bản React (Bước 3).
   Logic giữ nguyên bản cũ (kitchen.js): tải đơn, realtime, tự in, chuông, tiền QR loa.
   Phần vẽ (thẻ đơn, bảng nhận / thu tiền / sửa đơn, các hộp thoại) viết bằng React.
   Thêm ?cu=1 vào địa chỉ để dùng lại bản cũ.
   ===================================================================== */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { openSheet, closeSheet, SheetHead, Html } from '../common/sheet.jsx';

const BN = window.BN;
const { api, ui, vnd, K, hhmm, ago, errText, DEMO, STATIONS, qboxHtml, orderLabel, isTakeaway, isDelivery, sizeOf, isSizeOpt, sizeGroup, sizeText, fold } = BN;
const STATION = window.BENOC_STATION === 'pha_che' ? 'pha_che' : 'bep';
const OTHER = STATION === 'bep' ? 'pha_che' : 'bep';
const IS_BEP = STATION === 'bep';
const SHORT = { bep: 'Bếp', pha_che: 'Pha chế' };
const COLS = [['cho_nhan', 'Chờ nhận'], ['dang_lam', 'Đang làm'], ['thanh_toan', 'Chờ thanh toán']];
const EMPTY = { cho_nhan: 'Chưa có đơn mới', dang_lam: 'Không có đơn đang làm', thanh_toan: 'Không có đơn chờ thanh toán' };
const state = { payQ: '', orders: [], panels: {}, prq: [], self: new Set(), col: null, sound: false, seen: null, seenCalls: null, session: null };
let audio = null, wakeLock = null, voice = null;

/* ---------- Kho trạng thái cho React: mã cũ gọi render() → React vẽ lại ---------- */
let ver = 0; const subs = new Set();
const render = () => { ver++; subs.forEach(f => f()); };
const useVer = () => useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => ver);


/* ---------- Phần của từng nơi trong một đơn ---------- */
const part = (o, st) => (o.stations || []).find(x => x.station === st) || null;
const mine = o => part(o, STATION);
/* Quầy thu tiền của đơn: đơn chỉ có đồ uống → quầy pha chế; còn lại → bếp */
const payer = o => (o.stations || []).length && o.stations.every(x => x.station === 'pha_che') ? 'pha_che' : 'bep';
/* Nơi nào có món trong đơn cũng thu tiền / huỷ / thanh toán được */
const isMinePay = o => payer(o) === STATION || (o.stations || []).some(x => x.station === STATION);
/* none = chưa thu, full = đã thu đủ, more = sửa đơn tăng tiền (thu thêm), refund = sửa đơn giảm tiền (trả lại) */
const paidState = o => o.paid_amount == null ? 'none' : o.paid_amount === o.total ? 'full' : o.paid_amount < o.total ? 'more' : 'refund';
const dueOf = o => o.total - (o.paid_amount || 0);
function colOf(o) {
  const m = mine(o);
  if (m && (m.status === 'cho_nhan' || m.status === 'dang_lam')) return m.status;
  if (isMinePay(o)) return 'thanh_toan';
  return null;
}

function start() {
  if (BN.FEATURES.vietqr) BN.loadBank().then(() => { qrCache.clear(); render(); });
  document.documentElement.style.setProperty('--ncol', COLS.length);
  const app = document.getElementById('app'); app.innerHTML = '';
  createRoot(app).render(<App />);
  if (BN.FEATURES.vietqr) { loadBank(); setInterval(loadBank, 60000); }
  if (BN.FEATURES.print) {
    BNPrint.ble.on(() => render());
    bleSlots().forEach(k => BNPrint.ble.restore(k).then(ok => { if (ok) ui.toast('Đã nối ' + BNPrint.ble.label(k) + ' ' + BNPrint.ble.name(k)); render(); }));
  }
  setInterval(render, 1000 * 20); // đồng hồ, số phút chờ
  refresh();
  let rtT = null;
  api.onKitchenChange(() => { clearTimeout(rtT); rtT = setTimeout(refresh, 200); });
  if (api.onBankTxn && BN.FEATURES.vietqr) api.onBankTxn(t => {
    if (!t || t.status === 'mau' || t.status === 'chua_khop') return;
    const seen = state.bankSeen || (state.bankSeen = new Set()); if (seen.has(t.id + ':' + t.status)) return; seen.add(t.id + ':' + t.status);
    const amt = Number(t.amount).toLocaleString('vi-VN') + 'đ';
    if (t.status === 'khong_ma' || !t.order_id) { loadBank(); return; }
    const o = state.orders.find(x => x.id === t.order_id); if (o && !isMinePay(o)) return;
    const who = o ? (o.queue_number != null ? 'Bàn ' + o.queue_number : o.customer_name || 'đơn') : (t.pay_code || 'đơn');
    ui.toast(t.status === 'thieu_tien' ? 'Nhận ' + amt + ' từ ' + who + ' · ' + (t.note || 'còn thiếu') : t.status === 'don_da_thu' ? who + ' chuyển khoản ' + amt + ' (đơn đã thu trước)' : 'Đã nhận chuyển khoản ' + amt + ' · ' + who);
    if (state.sound) try { beep(); } catch (e) { /* bỏ qua */ }
    refresh();
  });
  setInterval(() => { if (DEMO || !BN.RT.ok || Date.now() - lastRefresh > 28000) refresh(); }, DEMO ? 4000 : 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refresh(); if (state.sound) lockScreen(); } });
}

/* ---------- 🔔 Tiền QR loa (không có mã đơn) ---------- */
const bank = { list: [], open: false };
const FU = s => fold(String(s || '')).toUpperCase();
const placeOf = o => o.queue_number != null ? 'Bàn ' + o.queue_number : o.dine_type === 'giao_hang' ? 'Ship · ' + (o.customer_name || '') : (o.customer_name || 'Mang về');
const senderOf = t => { const m = String(t.content || '').match(/FT[0-9A-Z]+\s*,\s*([^,|]{2,60}?)\s*,/i); return m && !/CONG TY|MOMO|ZALOPAY|VNPAY|NAPAS/i.test(m[1]) ? m[1].trim() : ''; };
function hints(t, o) {
  const c = FU(t.content), h = [], name = FU(o.customer_name).trim(), phone = String(o.customer_phone || '').replace(/\D/g, '');
  if (name.length >= 3) { const sn = FU(senderOf(t)); const ws = name.split(/\s+/).filter(w => w.length >= 2); if (sn && ws.length && ws.every(w => sn.includes(w))) h.push('Tên khớp'); else if (ws.length && ws.every(w => c.includes(w))) h.push('Có tên trong nội dung'); }
  if (phone.length >= 9 && c.replace(/\D/g, '').includes(phone.slice(-9))) h.push('SĐT khớp');
  if (o.queue_number != null && new RegExp('\\b(BAN|SO|B)\\s*0?' + o.queue_number + '\\b').test(c)) h.push('Số bàn khớp');
  return h;
}
function candidates(t) {
  return state.orders.filter(o => dueOf(o) > 0 && dueOf(o) === t.amount)
    .map(o => ({ o, h: hints(t, o) })).sort((a, b) => b.h.length - a.h.length || new Date(b.o.created_at) - new Date(a.o.created_at));
}
const pendingOf = l => l.filter(t => t.status === 'khong_ma' && t.sale_id && !t.reviewed_at);
async function loadBank() {
  try { bank.list = await api.bankTxnsToday() || []; } catch (e) { bank.list = []; }
  render();
}

function BellCard({ t }) {
  const cs = candidates(t), who = senderOf(t);
  const [all, setAll] = useState(false);
  const os = state.orders.filter(o => dueOf(o) > 0).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return (
    <li className="bn-it"><div className="bn-top"><b className="num">{vnd(t.amount)}</b> <span className="muted">{hhmm(t.txn_at || t.created_at)}{who ? ' · ' + who : ''}</span></div>
      <p className="small muted bn-ct">{String(t.content || '').replace(/^.*?\|\s*/, '').slice(0, 140)}</p>
      {cs.length ? <><p className="small" style={{ margin: '4px 0' }}>Có thể là tiền của:</p><div className="bn-cands">{cs.slice(0, 4).map(({ o, h }) => <LinkBtn key={o.id} t={t} o={o} cls={'btn btn-sm' + (h.length ? '' : ' btn-line')} label={<>Gán vào {placeOf(o)}{h.length ? <> <span className="bn-h">· {h.join(', ')}</span></> : null}</>} />)}</div></>
        : <p className="small muted" style={{ margin: '4px 0' }}>Không có đơn chưa thu nào {vnd(t.amount)}: nhiều khả năng khách gọi mồm.</p>}
      <div className="bn-row"><button className="btn btn-sm btn-line" type="button" onClick={() => setAll(x => !x)}>Chọn đơn khác…</button><DismissBtn t={t} label={cs.length ? 'Không phải (khách gọi mồm)' : 'Đã xem'} /></div>
      {all && <div className="bn-all bn-cands">{os.length ? os.map(o => <LinkBtn key={o.id} t={t} o={o} cls="btn btn-sm btn-line" label={placeOf(o) + ' · ' + vnd(dueOf(o))} />) : <p className="small muted">Không có đơn nào đang chờ thu.</p>}</div>}
    </li>
  );
}
function LinkBtn({ t, o, cls, label }) {
  const [busy, setBusy] = useState(false), [sure, setSure] = useState(false);
  const go = async () => {
    if (t.amount !== dueOf(o) && !sure) { setSure(true); return; }
    setBusy(true);
    try { await api.linkBankTxn(Number(t.id), o.id); ui.toast('Đã gán vào ' + placeOf(o) + ' · Đã thu chuyển khoản'); } catch (err) { ui.toast(errText(err)); setBusy(false); }
    await refresh(); loadBank();
  };
  return <button className={cls} type="button" disabled={busy} onClick={go}>{sure ? 'Bấm lần nữa: ' + vnd(t.amount) + ' ≠ ' + vnd(dueOf(o)) + ' còn thu' : label}</button>;
}
function DismissBtn({ t, label }) {
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await api.dismissBankTxn(Number(t.id)); } catch (err) { ui.toast(errText(err)); setBusy(false); } await refresh(); loadBank(); };
  return <button className="btn btn-sm btn-line" type="button" disabled={busy} onClick={go}>{label}</button>;
}
function BellSheet() {
  useVer();
  useEffect(() => { bank.open = true; loadBank(); return () => { bank.open = false; }; }, []);
  const pend = pendingOf(bank.list), done = bank.list.filter(t => !pend.includes(t)).slice(0, 15);
  const withC = pend.filter(t => candidates(t).length), noC = pend.filter(t => !candidates(t).length);
  return (
    <><SheetHead title="Tiền vào qua QR loa" /><div className="sh-body bell-sh">
      <p className="small muted" style={{ margin: '0 0 8px' }}>Khách chuyển khoản mà không có mã đơn (quét QR dán trên loa). Nếu là tiền của một đơn đang chờ thu, bấm <b>Gán vào…</b>: đơn chuyển sang Đã thu, doanh thu không bị tính 2 lần. Máy không tự gán.</p>
      {withC.length ? <><h3 className="bn-h3">Cần xem ({withC.length})</h3><ul className="bn-list">{withC.map(t => <BellCard key={t.id} t={t} />)}</ul></> : <p className="empty" style={{ margin: '8px 0' }}>Không có khoản nào cần xem.</p>}
      {noC.length ? <><h3 className="bn-h3">Không có đơn cùng số tiền ({noC.length})</h3><ul className="bn-list">{noC.map(t => <BellCard key={t.id} t={t} />)}</ul></> : null}
      {done.length ? <><h3 className="bn-h3">Đã xử lý hôm nay</h3><ul className="bn-list bn-old">{done.map(t => (
        <li key={t.id} className="bn-done"><span className="num">{hhmm(t.txn_at || t.created_at)}</span> <b className="num">{vnd(t.amount)}</b> <span className="muted">· {t.status === 'khong_ma' ? 'Đơn không gắn mã (khách gọi mồm)' : t.note || (t.status === 'da_khop' ? 'Đã tự khớp đơn' : t.status)}</span></li>))}</ul></> : null}
    </div></>
  );
}

let busy = false, again = false, lastRefresh = 0;
async function refresh() {
  if (busy) { again = true; return; } // đang tải dở: hẹn tải lại ngay sau, không bỏ sót đơn mới
  busy = true; again = false; lastRefresh = Date.now();
  try {
    state.orders = await api.kitchenOrders();
    const ids = new Set(state.orders.filter(o => mine(o)).map(o => o.id)), calls = new Set();
    state.orders.forEach(o => o.calls.forEach(c => calls.add(c.id)));
    if (state.seen) {
      const newOrders = [...ids].filter(id => !state.seen.has(id)).length;
      const newCalls = [...calls].filter(c => !state.seenCalls.has(c)).length;
      if (newOrders || newCalls) alertNew(newOrders ? 'Có ' + newOrders + ' đơn mới' : 'Khách gọi nhân viên', !!newOrders);
    }
    state.seen = ids; state.seenCalls = calls;
    const all = new Set(state.orders.map(o => o.id));
    Object.keys(state.panels).forEach(id => { if (!all.has(id)) delete state.panels[id]; });
    state.prq = state.prq.filter(x => all.has(x.id));
    autoPrint();
    render();
  } catch (e) { ui.toast(errText(e)); }
  finally { busy = false; if (again) refresh(); }
}

/* ---------- Vẽ thẻ đơn ---------- */
function Timer({ o, col }) {
  const now = Date.now(), m = mine(o);
  if (col === 'cho_nhan') { const w = Math.floor((now - new Date(o.created_at)) / 60000); return <div className={'timer' + (w >= 3 ? ' warn' : '')}>Đã chờ<b className="num">{w}'</b></div>; }
  if (col === 'dang_lam') {
    const left = Math.ceil((new Date(m.estimated_ready_at) - now) / 60000);
    return left >= 0 ? <div className="timer">Còn<b className="num">{left}'</b></div> : <div className="timer late">Trễ<b className="num">{-left}'</b></div>;
  }
  const done = m && m.served_at ? m.served_at : null;
  return done ? <div className="timer">Ra món<b className="num">{hhmm(done)}</b></div> : <div className="timer">Đặt lúc<b className="num">{hhmm(o.created_at)}</b></div>;
}
function isEdited(o, i) { const p = part(o, i.station); return !!(p && p.accepted_at && i.edited_at && new Date(i.edited_at) > new Date(p.accepted_at)); }
function isNew(o, i) { const p = part(o, i.station); return !!(p && p.accepted_at && i.added_at && new Date(i.added_at) > new Date(p.accepted_at)); }
const isTopping = x => /topping/i.test(x.group || '');
const PmTag = ({ part: p }) => p === 'mua' ? <span className="pm pm-mua">MUA</span> : p === 'tang' ? <span className="pm pm-tang">TẶNG</span> : null;
/* Dòng tiêu đề trước các món cùng 1 phần ưu đãi */
const PromoHead = ({ items, k, extra }) => { const i = items[k]; if (!i.promo_group || (k > 0 && items[k - 1].promo_group === i.promo_group)) return null; return <li className={'kc-pr' + (extra ? ' ' + extra : '')}>{i.promo_kind === 'combo' ? <span className="pm pm-combo">COMBO</span> : <span className="pm pm-uu">ƯU ĐÃI</span>}<b>{i.promo_name || ''}</b></li>; };
function promoSort(items) {
  const first = new Map(); items.forEach((i, k) => { const g = i.promo_group || ('#' + k); if (!first.has(g)) first.set(g, k); });
  return items.map((i, k) => ({ i, k, g: first.get(i.promo_group || ('#' + k)) })).sort((a, b) => a.g - b.g || a.k - b.k).map(x => x.i);
}
function Items({ items, tagStation, o }) {
  items = promoSort(items);
  return (
    <ul className="kc-items">{items.map((i, k) => {
      const sz = sizeOf(i.options), rest = (i.options || []).filter(x => !isSizeOpt(x)), plain = rest.filter(x => !isTopping(x));
      return [<PromoHead key={'h' + k} items={items} k={k} />,
        <li key={i.id ?? k} className={[o && (isNew(o, i) || isEdited(o, i)) ? 'new' : '', i.promo_group ? 'in-pr' : '', i.promo_part === 'tang' ? 'is-gift' : ''].filter(Boolean).join(' ') || undefined}>
          <span className="q num">{i.qty}×</span><span><PmTag part={i.promo_part} /><span className="nm">{i.item_name}</span>
            {sz && <span className={'sz sz-' + sz}>{sizeText(sz)}</span>}
            {o && isNew(o, i) ? <span className="new-tag">MỚI</span> : o && isEdited(o, i) ? <span className="new-tag">ĐÃ SỬA</span> : null}
            {tagStation && i.station !== 'bep' && <span className="stn">{SHORT[i.station]}</span>}
            {plain.length > 0 && <span className="op">{plain.map(x => x.choice).join(' · ')}</span>}
            {rest.some(isTopping) && <span className="tp">{rest.filter(isTopping).map((x, n) => <b key={n}>+ {x.choice}</b>)}</span>}
            {i.note && <span className="in">{i.note}</span>}</span></li>];
    })}</ul>
  );
}
function PartStatus({ p }) {
  if (!p) return null;
  if (p.status === 'cho_nhan') return <span className="st-pill st-cho_nhan">chờ nhận</span>;
  if (p.status === 'dang_lam') {
    const left = p.estimated_ready_at ? Math.ceil((new Date(p.estimated_ready_at) - Date.now()) / 60000) : null;
    return <span className="st-pill st-dang_lam">đang làm{left != null ? (left >= 0 ? ', còn ' + left + "'" : ', trễ ' + (-left) + "'") : ''}</span>;
  }
  return <span className="st-pill st-da_ra_mon">đã xong</span>;
}
/* Nhắc phần của nơi kia trong cùng đơn */
function Other({ o }) {
  const items = o.items.filter(i => i.station === OTHER), p = part(o, OTHER);
  if (!items.length || !p) return null;
  const n = items.reduce((s, i) => s + i.qty, 0);
  return <p className="kc-other"><b>{STATIONS[OTHER]}:</b> {n} món ({items.map(i => i.item_name + (i.promo_part === 'tang' ? ' (tặng)' : '')).join(', ')}) <PartStatus p={p} /></p>;
}
/* ---------- VietQR: mã chuyển khoản đúng số tiền của đơn ---------- */
const qrNote = o => BN.qrNoteFor(o);
const qrCache = new Map();
function qrImg(o, due) {
  const key = due + '|' + qrNote(o) + '|' + BN.BANK.bin + BN.BANK.account + BN.BANK.note;
  if (qrCache.has(key)) return qrCache.get(key);
  qrCache.set(key, null);
  BN.qrDataUrl(BN.vietQR(due, qrNote(o)), 360).then(u => { qrCache.set(key, u); render(); }).catch(() => { qrCache.delete(key); ui.toast('Không tạo được mã QR, kiểm tra mạng'); });
  return null;
}
function QrPanel({ o, due }) {
  const img = qrImg(o, due), B = BN.BANK;
  return (
    <div className="vqr"><button className="vqr-img" type="button" aria-label="Mở to mã QR" onClick={() => openQrBig(o)}>{img ? <img src={img} alt={'Mã VietQR chuyển khoản ' + vnd(due)} /> : <span className="small muted">Đang tạo mã…</span>}</button>
      <div className="vqr-info"><b className="num">{vnd(due)}</b><span>{B.bank} · <span className="num">{B.account}</span>{B.holder ? <><br />{B.holder}</> : null}</span><span className="small muted">Nội dung: {BN.qrInfo(qrNote(o))}</span>
        <span className="small muted">Khách quét bằng app ngân hàng, số tiền tự điền. Thấy tiền về rồi bấm <b>Đã nhận chuyển khoản</b>.</span><button className="link small" type="button" onClick={() => openQrBig(o)}>Mở to cho khách quét ›</button></div></div>
  );
}
function QrBigSheet({ o }) {
  useVer();
  const due = dueOf(o), img = qrImg(o, due), B = BN.BANK;
  return (
    <><SheetHead title={'Chuyển khoản ' + vnd(due)} sub={'Đơn ' + orderLabel(o)} /><div className="sh-body vqr-big">{img ? <img src={img} alt="Mã VietQR" /> : <p className="loading">Đang tạo mã…</p>}
      <p><b>{B.bank}</b> · <b className="num">{B.account}</b>{B.holder ? <><br />{B.holder}</> : null}</p><p className="small muted">Nội dung: {BN.qrInfo(qrNote(o))}</p></div>
      <div className="sh-foot"><button className="btn btn-line btn-block" type="button" data-close>Đóng</button></div></>
  );
}
const openQrBig = o => openSheet(<QrBigSheet o={o} />);

/* Món sửa được ở màn hình này: món của nơi này; chủ quán sửa được cả đơn */
const editableItems = o => state.session.employee.role === 'owner' ? o.items : o.items.filter(i => i.station === STATION);

/* Ô số bàn trong bảng sửa đơn: gõ xong (Enter hoặc bấm ra ngoài) là lưu */
function QueueInput({ o, p }) {
  const ref = useRef(null);
  useEffect(() => { if (p.focusQ && ref.current) { ref.current.focus(); p.focusQ = false; } });
  const commit = e => {
    const n = parseInt(e.target.value, 10);
    if (!(n > 0)) { if (o.dine_type === 'tai_quan') { e.target.value = o.queue_number || ''; ui.toast('Số bàn phải lớn hơn 0'); } return; }
    if (o.dine_type === 'tai_quan' && n === o.queue_number) return;
    saveDine(o, 'tai_quan', n, null);
  };
  const q = p.queue != null ? p.queue : (o.queue_number || '');
  return <input ref={ref} className="num" inputMode="numeric" pattern="[0-9]*" maxLength={3} enterKeyHint="done" defaultValue={q} aria-label="Số bàn"
    onInput={e => { e.target.value = e.target.value.replace(/\D/g, ''); p.queue = e.target.value; }}
    onFocus={e => { ref.start = e.target.value; }}
    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
    onBlur={e => { if (e.target.value !== ref.start) commit(e); }} />;
}

function Panel({ o }) {
  const p = state.panels[o.id]; if (!p) return null;
  const close = () => { delete state.panels[o.id]; render(); };
  const Close = ({ label = 'Thôi' }) => <button className="btn btn-line" type="button" onClick={close}>{label}</button>;
  if (p.kind === 'accept') {
    return (
      <div className="panel"><p className="panel-title">Báo khách khoảng bao lâu xong?</p>
        <div className="mins"><button className="btn btn-line btn-sm" type="button" aria-label="Bớt 5 phút" onClick={() => { p.minutes = Math.max(5, Math.min(90, (p.minutes || 15) - 5)); render(); }}>−5</button>
          <output className="num">{p.minutes == null ? '…' : p.minutes + "'"}</output>
          <button className="btn btn-line btn-sm" type="button" aria-label="Thêm 5 phút" onClick={() => { p.minutes = Math.max(5, Math.min(90, (p.minutes || 15) + 5)); render(); }}>+5</button>
          <span className="small muted">Gợi ý theo số đơn {IS_BEP ? 'bếp' : 'quầy'} đang làm và thời gian làm thực tế gần đây</span></div>
        <div className="row"><button className="btn grow" type="button" disabled={p.minutes == null} onClick={e => acceptOk(o, e.currentTarget)}>Nhận đơn · {p.minutes || ''} phút</button><Close /></div></div>
    );
  }
  if (p.kind === 'pay') {
    const due = dueOf(o);
    if (due < 0) {
      return (
        <div className="panel"><p className="panel-title">Trả lại khách {vnd(-due)}</p><p className="small muted" style={{ margin: 0 }}>Đã thu {vnd(o.paid_amount)}, đơn sau khi sửa còn {vnd(o.total)}.</p>
          <div className="row"><button className="btn btn-ok grow" type="button" data-act="pay-ok" data-m={o.paid_method || 'tien_mat'} onClick={e => payOk(o, o.paid_method || 'tien_mat', e.currentTarget)}>Đã trả lại {vnd(-due)}</button><Close /></div></div>
      );
    }
    const given = Number(p.given || 0), change = given - due;
    const st = o.status !== 'da_ra_mon';
    return (
      <div className="panel"><p className="panel-title">{o.paid_amount != null ? 'Thu thêm ' : 'Thu '}{vnd(due)}</p>
        {o.paid_amount != null && <p className="small muted" style={{ margin: 0 }}>Đã thu {vnd(o.paid_amount)}, đơn sau khi sửa là {vnd(o.total)}.</p>}
        {st && o.paid_amount == null && <p className="small muted" style={{ margin: 0 }}>Thu trước: đơn vẫn làm tiếp, ra món xong tự hoàn tất.</p>}
        {!p.qr && <><div className="chips">{[due, 50000, 100000, 200000, 500000].filter((v, i, a) => v >= due && a.indexOf(v) === i).map(v => <button key={v} className="chipbtn" type="button" aria-pressed={given === v} onClick={() => { p.given = v; render(); }}>{v === due ? 'Vừa đủ' : vnd(v)}</button>)}</div>
          {given ? <div className="change"><span>Tiền thối</span><b className="num">{change >= 0 ? vnd(change) : 'Thiếu ' + vnd(-change)}</b></div> : null}</>}
        {p.qr && <QrPanel o={o} due={due} />}
        <div className="row"><button className="btn btn-ok grow" type="button" data-act="pay-ok" data-m="tien_mat" onClick={e => payOk(o, 'tien_mat', e.currentTarget)}>Tiền mặt</button>
          {p.qr ? <button className="btn grow" type="button" data-act="pay-ok" data-m="chuyen_khoan" onClick={e => payOk(o, 'chuyen_khoan', e.currentTarget)}>Đã nhận chuyển khoản</button>
            : BN.FEATURES.vietqr ? <button className="btn grow" type="button" onClick={() => { p.qr = true; render(); }}>QR chuyển khoản</button>
            : <button className="btn grow" type="button" data-act="pay-ok" data-m="chuyen_khoan" onClick={e => payOk(o, 'chuyen_khoan', e.currentTarget)}>Chuyển khoản</button>}
          <Close /></div></div>
    );
  }
  if (p.kind === 'edit') {
    const items = promoSort(editableItems(o));
    const OptBtn = ({ i }) => i.menu_item_id ? <button className="btn btn-line btn-sm" type="button" aria-label={'Đổi topping, tuỳ chọn ' + i.item_name} onClick={() => openOptEdit(o, i)}>Tuỳ chọn</button> : null;
    const Nm = ({ i }) => <span className="ed-nm"><b>{i.promo_part === 'tang' && <span className="pm pm-tang">TẶNG</span>}{i.item_name}</b>{(i.options || []).length ? <small>{i.options.map(x => x.choice).join(' · ')}</small> : null}{i.note && <small className="in">{i.note}</small>}</span>;
    const setQty = (i, q, btn) => run(btn, () => api.staffSetItemQty(Number(i.id), q), q <= 0 ? (i.promo_group ? 'Đã bỏ phần ưu đãi ' + (i.promo_name || '') : 'Đã bỏ ' + i.item_name) : null);
    const dine = p.dine || o.dine_type;
    const pickDine = (v, btn) => {
      if (v === 'mang_ve') { if (o.dine_type !== 'mang_ve') saveDine(o, 'mang_ve', null, btn); else { p.dine = 'mang_ve'; render(); } return; }
      p.dine = 'tai_quan';
      if (o.dine_type === 'tai_quan') { render(); return; }
      if (o.queue_number > 0) { saveDine(o, 'tai_quan', o.queue_number, btn); return; }
      p.queue = ''; p.focusQ = true; render();
    };
    return (
      <div className="panel"><p className="panel-title">Sửa đơn {orderLabel(o)}</p>
        {!isDelivery(o) && <div className="ed-dine"><div className="seg2" role="group" aria-label="Ăn tại quán hay mang về">
          {[['tai_quan', 'Ăn tại quán'], ['mang_ve', 'Mang về']].map(([k, t]) => <button key={k} type="button" aria-pressed={dine === k} onClick={e => pickDine(k, e.currentTarget)}>{t}</button>)}</div>
          {dine === 'tai_quan' && <><label className="ed-ql">Số bàn<QueueInput key={o.dine_type + ':' + o.queue_number} o={o} p={p} /></label>
            {o.dine_type !== 'tai_quan' && <span className="small muted ed-hint">Nhập số bàn, xong là tự lưu</span>}</>}</div>}
        <ul className="ed-list">{items.map((i, k) => {
          if (i.promo_group) {
            const head = k > 0 && items[k - 1].promo_group === i.promo_group ? null : <li key={'h' + i.id} className="ed-pr"><span className="ed-nm"><b>{(i.promo_kind === 'combo' ? '' : 'Ưu đãi ') + BN.promoTitle(i.promo_kind, i.promo_name)}</b></span>
              <button className="btn btn-line btn-sm" type="button" onClick={e => setQty(i, 0, e.currentTarget)}>Bỏ cả phần</button></li>;
            return [head, <li key={i.id} className="ed-sub"><Nm i={i} /><span className="ed-q"><span className="num small">{i.qty}×</span><OptBtn i={i} /></span></li>];
          }
          return <li key={i.id}><Nm i={i} /><span className="ed-q"><OptBtn i={i} /><button className="btn btn-line btn-sm" type="button" aria-label={'Bớt 1 ' + i.item_name} onClick={e => setQty(i, i.qty - 1, e.currentTarget)}>{i.qty > 1 ? '−' : '×'}</button>
            <output className="num">{i.qty}</output><button className="btn btn-line btn-sm" type="button" aria-label={'Thêm 1 ' + i.item_name} disabled={i.qty >= 50} onClick={e => setQty(i, i.qty + 1, e.currentTarget)}>+</button></span></li>;
        })}</ul>
        <p className="small muted" style={{ margin: 0 }}>Bấm <b>Tuỳ chọn</b> để thêm/bớt topping, đổi đường, đá, size của món đã có. <b>+ Thêm món</b> là để khách gọi món mới.</p>
        <div className="row"><button className="btn grow" type="button" onClick={() => openPicker(o)}>+ Thêm món</button><Close label="Xong" /></div></div>
    );
  }
  if (p.kind === 'cancel') {
    return (
      <div className="panel"><p className="panel-title">Huỷ đơn {orderLabel(o)}? Cả đơn (đồ ăn và đồ uống) sẽ bị xoá, không tính doanh thu.</p>
        <div className="row"><button className="btn btn-danger grow" type="button" onClick={e => { delete state.panels[o.id]; run(e.currentTarget, () => api.cancelOrder(o.id), 'Đã huỷ đơn ' + orderLabel(o)); }}>Huỷ đơn</button><Close label="Giữ lại" /></div></div>
    );
  }
  return null;
}
function Paid({ o }) {
  if (!isMinePay(o)) return null;
  const ps = paidState(o);
  if (ps === 'full') return <span className="paid paid-ok">Đã thu {vnd(o.paid_amount)}</span>;
  if (ps === 'more') return <span className="paid paid-warn">Đã thu {vnd(o.paid_amount)} · thu thêm {vnd(dueOf(o))}</span>;
  if (ps === 'refund') return <span className="paid paid-warn">Đã thu {vnd(o.paid_amount)} · trả lại {vnd(-dueOf(o))}</span>;
  return null;
}
function Actions({ o, col }) {
  if (state.panels[o.id]) return null;
  const id = o.id, ps = paidState(o);
  const setPanel = v => { state.panels[id] = v; render(); };
  const cancel = isMinePay(o) ? <button className="btn btn-line btn-sm" type="button" onClick={() => setPanel({ kind: 'cancel' })}>Huỷ</button> : null;
  const edit = <button className="btn btn-line btn-sm" type="button" onClick={() => setPanel({ kind: 'edit' })}>Sửa đơn</button>;
  const payLabel = ps === 'more' ? 'Thu thêm' : ps === 'refund' ? 'Trả lại' : 'Thu tiền';
  const pay = isMinePay(o) && ps !== 'full' ? <button className={'btn' + (col === 'thanh_toan' ? '' : ' btn-line btn-sm')} type="button" onClick={() => setPanel({ kind: 'pay', given: 0 })}>{col === 'thanh_toan' && ps === 'none' ? 'Thanh toán' : payLabel}</button> : null;
  const mixed = o.items.some(i => i.station === 'bep') && o.items.some(i => i.station === 'pha_che');
  const canPrint = BN.FEATURES.print && window.BNPrint;
  if (col === 'cho_nhan') return <>{edit}{pay}<button className="btn" type="button" onClick={e => accept(o, false, e.currentTarget)}>Nhận đơn</button>{mixed && canPrint ? <button className="btn" type="button" onClick={e => accept(o, true, e.currentTarget)}>Nhận + in tổng đơn</button> : null}{cancel}</>;
  const reprint = canPrint && o.items.some(i => i.station === STATION) ? <><button className="btn btn-line btn-sm" type="button" onClick={() => reprintOrder(o)}>In lại {BNPrint.label() || 'phiếu'}</button>
    {mixed ? <button className="btn btn-line btn-sm" type="button" onClick={() => printAll(o)}>In tổng đơn</button> : null}</> : null;
  if (col === 'dang_lam') return <>{edit}{pay}{reprint}<button className="btn btn-line btn-sm" type="button" onClick={e => run(e.currentTarget, () => api.extendWait(id, 5, STATION), 'Đã báo khách thêm 5 phút')}>+5 phút</button>
    <button className="btn btn-ok" type="button" onClick={e => run(e.currentTarget, () => api.markServed(id, STATION), 'Đơn ' + orderLabel(o) + ' đã ra món', isMinePay(o) ? 'thanh_toan' : null)}>Ra món</button></>;
  return <>{edit}{pay || <span className="small muted">Chờ {STATIONS[OTHER].toLowerCase()} ra món</span>}{reprint}{cancel}</>;
}
function Card({ o, col }) {
  const items = col === 'thanh_toan' ? o.items : o.items.filter(i => i.station === STATION);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const op = part(o, OTHER);
  // Bấm vào phần món / tên khách của thẻ đơn cũng mở chi tiết
  const onZone = e => { if (!e.target.closest('a, input, .panel, button') && e.target.closest('.kc-items, .kc-other, .kc-who, .kc-top .qbox')) openDetail(o); };
  return (
    <article className="kc" data-order={o.id} onClick={onZone}>
      <div className="kc-top"><Html html={qboxHtml(o)} />
        <div className="kc-who"><b>{o.customer_name}</b><span>{o.customer_phone ? <><a href={'tel:' + o.customer_phone}>{o.customer_phone}</a> · </> : null}đặt lúc {hhmm(o.created_at)} · {count} món</span></div><Timer o={o} col={col} /></div>
      <When o={o} />{o.source === 'fb' && <p className="kc-src">Đơn online</p>}
      <Items items={items} tagStation={col === 'thanh_toan' && !(o.stations || []).every(x => x.station === STATION)} o={o} />
      {col === 'thanh_toan' ? (op && op.status !== 'da_ra_mon' ? <p className="kc-other"><b>{STATIONS[OTHER]}:</b> <PartStatus p={op} /></p> : null) : <Other o={o} />}
      <button className="kc-detail" type="button" onClick={() => openDetail(o)}>Xem chi tiết đơn: size, topping, giá ›</button>{o.note && <p className="kc-note">Ghi chú: {o.note}</p>}
      <div className="kc-foot"><span className="kc-total num">{isMinePay(o) ? vnd(o.total) : ''}<Paid o={o} /></span><Actions o={o} col={col} /></div>
      <Panel o={o} />
    </article>
  );
}
/* Giao tới / giờ hẹn */
function When({ o }) {
  if (isDelivery(o)) return <p className="kc-addr"><b>Giao tới:</b> {o.address || ''}{o.deliver_at ? <span className="kc-when">Giao lúc {hhmm(o.deliver_at)}</span> : null}</p>;
  if (o.deliver_at) return <p className="kc-addr"><b>{o.dine_type === 'tai_quan' ? 'Khách đến ăn lúc' : 'Khách qua lấy lúc'}</b> <span className="kc-when">{hhmm(o.deliver_at)}</span>{o.dine_type === 'tai_quan' && o.queue_number == null ? <> <span className="small">· khách đến thì bấm Sửa đơn điền số bàn</span></> : null}</p>;
  return null;
}
function grouped() {
  const by = {}; COLS.forEach(([k]) => { by[k] = []; });
  state.orders.forEach(o => { const c = colOf(o); if (c && by[c]) by[c].push(o); });
  return by;
}
async function saveDine(o, dine, q, btn) {
  const p = state.panels[o.id];
  await run(btn, async () => {
    const r = await api.staffUpdateOrder(o.id, dine, q);
    if (p) { delete p.dine; delete p.queue; }
    ui.toast((dine === 'tai_quan' ? 'Đã lưu: ăn tại quán, bàn số ' + q : 'Đã lưu: mang về') + (r && r.duplicate_with ? ' · lưu ý: số ' + q + ' cũng đang có đơn của ' + r.duplicate_with : ''));
  });
}
/* Tìm đơn trong cột Chờ thanh toán: số bàn, SĐT, tổng tiền, tên, địa chỉ, món */
const payMatch = (o, words) => {
  const phone = String(o.customer_phone || '').replace(/\D/g, '');
  const hay = fold([o.customer_name, o.address, isDelivery(o) ? 'ship giao hang' : isTakeaway(o) ? 'mang ve' : '', (o.items || []).map(i => i.name).join(' ')].join(' '));
  return words.every(w => {
    const d = w.replace(/[.,]/g, '');
    if (/^\d+$/.test(d)) return (o.queue_number != null && Number(o.queue_number) === Number(d)) || (d.length >= 3 && phone.includes(d)) || Number(o.total) === Number(d);
    return hay.includes(w);
  });
};

/* ---------- Toàn màn hình ---------- */
function App() {
  useVer();
  const role = state.session.employee.role;
  const by = grouped();
  if (!state.col) state.col = by.cho_nhan.length || !by.dang_lam.length ? 'cho_nhan' : 'dang_lam';
  const calls = []; state.orders.forEach(o => o.calls.forEach(c => calls.push({ c, o })));
  useEffect(() => { document.title = (by.cho_nhan.length ? '(' + by.cho_nhan.length + ') ' : '') + SHORT[STATION] + ' Bé Nốc'; });
  // Mở Quản lý / Đơn giao hàng đè lên trên, không rời trang → máy in Bluetooth vẫn nối, vẫn tự in
  const onTop = e => {
    const a = e.target.closest('a[href]'); if (!a || a.target || e.ctrlKey || e.metaKey) return;
    if (/(^|\/)(bep|phache)(\.html)?($|[?#])/.test(a.getAttribute('href'))) return;
    e.preventDefault(); openOverlay(a.getAttribute('href'));
  };
  const pendBell = BN.FEATURES.vietqr ? pendingOf(bank.list).filter(t => candidates(t).length).length : 0;
  const plabel = BN.FEATURES.print ? BNPrint.label() : '';
  return (
    <>
      <header className="topbar" onClick={onTop}><div className="topbar-in"><div className="brand"><b>{SHORT[STATION]}</b><span>Bé Nốc</span></div>
        <span className="clock num" id="clock">{hhmm(Date.now())}</span>
        <button className={'btn btn-sm ' + (state.sound ? 'btn-ok' : 'btn-line')} type="button" id="soundBtn" aria-pressed={state.sound} onClick={toggleSound}>{state.sound ? 'Chuông báo: Bật' : 'Bật chuông báo'}</button>
        {BN.FEATURES.vietqr && <button className={'btn btn-sm btn-line bell' + (pendBell ? ' bell-on' : '')} type="button" id="bellBtn" title="Tiền chuyển khoản qua QR loa" onClick={() => openSheet(<BellSheet />)}>🔔<span className="bell-n num" id="bellN" hidden={!pendBell}>{pendBell || ''}</span></button>}
        {BN.FEATURES.print && <button className={'btn btn-sm ' + (plabel ? 'btn-ok' : 'btn-line')} type="button" id="printBtn" onClick={() => BNPrint.openSettings(() => render())}>{plabel ? 'Máy in: ' + plabel : 'Cài máy in'}</button>}
        {role === 'owner' && <a className="btn btn-sm" href={'index.html?dat=giao' + (DEMO ? '&slot=' + encodeURIComponent(BN.SLOT) : '')}>+ Đơn giao hàng</a>}
        {role === 'owner' && <><a className="btn btn-sm btn-line" href={IS_BEP ? 'phache.html' : 'bep.html'}>{IS_BEP ? 'Pha chế' : 'Bếp'}</a><a className="btn btn-sm btn-line" href="quanly.html">Quản lý</a></>}
        <Html html={BN.staff.whoChip(state.session)} /></div></header>
      <div className="wrap" style={{ maxWidth: 'none' }}>
        <div className="prq" id="prq">{BN.FEATURES.print && window.BNPrint ? <PrintQueue /> : null}</div>
        <div className="calls" id="calls">{calls.map(({ c, o }) => <div key={c.id} className="call" role="alert"><b className="num">{isTakeaway(o) ? 'Mang về' : o.queue_number}</b><span className="grow">{o.customer_name} gọi nhân viên · {ago(c.created_at)}</span>
          <button className="btn btn-sm" type="button" onClick={e => run(e.currentTarget, () => api.resolveCall(Number(c.id)))}>Đã tới</button></div>)}</div>
        <div className="seg" id="seg">{COLS.map(([k, t]) => <button key={k} type="button" className={'cc-' + k} aria-pressed={state.col === k} onClick={() => { state.col = k; render(); }}>{t}<span className="n num">{by[k].length}</span></button>)}</div></div>
      <main className="cols" id="cols">{COLS.map(([k, t]) => {
        const words = k === 'thanh_toan' ? fold(state.payQ).split(/\s+/).filter(Boolean) : [], shown = words.length ? by[k].filter(o => payMatch(o, words)) : by[k];
        return (
          <section key={k} className={'col cc-' + k + (state.col === k ? ' on' : '')} data-col={k}><h2 className="col-head"><span className="t">{t}</span><span className="n num" id={'n-' + k}>{words.length ? shown.length + '/' + by[k].length : by[k].length}</span></h2>
            {k === 'thanh_toan' && <input className="search kc-search" id="payQ" type="search" placeholder="Tìm số bàn, tên, SĐT, món, số tiền…" value={state.payQ} aria-label="Tìm đơn chờ thanh toán" onChange={e => { state.payQ = e.target.value; render(); }} />}
            <div className="klist" id={'list-' + k}>{shown.length ? shown.map(o => <Card key={o.id} o={o} col={k} />) : <p className="col-empty">{by[k].length ? 'Không có đơn nào khớp “' + state.payQ.trim() + '”' : EMPTY[k]}</p>}</div></section>
        );
      })}</main>
    </>
  );
}

/* ---------- Thao tác ---------- */
/* follow: cột mà đơn chuyển sang. Trên điện thoại (chỉ thấy 1 cột), cột đang xem hết đơn thì tự chuyển theo */
async function run(btn, fn, okMsg, follow) {
  if (btn) btn.disabled = true;
  try { await fn(); if (okMsg) ui.toast(okMsg); } catch (e) { ui.toast(errText(e)); follow = null; }
  await refresh();
  if (btn) btn.disabled = false; // React giữ lại nút nếu thẻ đơn còn trên màn hình
  if (follow && !grouped()[state.col].length) { state.col = follow; render(); }
}
/* Bấm là nhận luôn. Thời gian dự kiến lấy theo gợi ý để màn hình vẫn đếm giờ và khách vẫn thấy khoảng bao lâu xong. */
function accept(o, full, btn) {
  const id = o.id; delete state.panels[id];
  state.self.add(id); // máy này tự in, không in lại khi tải đơn về
  run(btn, async () => {
    let m = IS_BEP ? 15 : 5;
    try { m = await Promise.race([api.suggestWait(id, STATION), new Promise(r => setTimeout(() => r(m), 1500))]) || m; } catch (err) { /* dùng mặc định */ }
    try { await api.acceptOrder(id, m, STATION); } catch (err) { state.self.delete(id); throw err; }
    printFor(o, { minutes: m }, full);
  }, 'Đã nhận đơn ' + orderLabel(o) + (BN.FEATURES.print && BNPrint.label() ? ' · đang in ' + (full ? 'phiếu tổng đơn' + (BNPrint.get().tmode !== 'off' ? ' + tem' : '') : BNPrint.label()) : ''), 'dang_lam');
}
function acceptOk(o, btn) {
  const id = o.id, m = state.panels[id].minutes; delete state.panels[id];
  state.self.add(id);
  run(btn, async () => { try { await api.acceptOrder(id, m, STATION); } catch (err) { state.self.delete(id); throw err; } printFor(o, { minutes: m }); }, 'Đã nhận đơn ' + orderLabel(o) + ' · ' + m + ' phút' + (BN.FEATURES.print && BNPrint.label() ? ' · đang in ' + BNPrint.label() : ''), 'dang_lam');
}
function payOk(o, method, btn) {
  delete state.panels[o.id]; const due = dueOf(o);
  const msg = due < 0 ? 'Đã trả lại khách ' + vnd(-due) : 'Đã thu ' + vnd(due) + (method === 'tien_mat' ? ' tiền mặt' : ' chuyển khoản') + (o.status !== 'da_ra_mon' ? ' · đơn vẫn làm tiếp' : '');
  run(btn, () => api.completePayment(o.id, method), msg, 'cho_nhan');
}
function reprintOrder(o) {
  if (!BNPrint.jobs(BNPrint.get()).length) { ui.toast('Máy này chưa cài máy in: chọn máy in rồi bấm Lưu'); BNPrint.openSettings(() => render()); return; }
  if (!printFor(o, { reprint: true })) ui.toast('Chưa in được: kiểm tra máy in'); else ui.toast('Đang in lại ' + BNPrint.label() + ' · ' + orderLabel(o));
}
function printAll(o) {
  const set = BNPrint.get();
  if (set.mode === 'off') { ui.toast('Máy này chưa cài máy in phiếu: chọn cách in phiếu rồi bấm Lưu'); BNPrint.openSettings(() => render()); return; }
  if (set.mode === 'ble' && !BNPrint.ble.has('phieu')) { ui.toast(BNPrint.ble.label('phieu') + ' chưa kết nối: bấm "Kết nối" rồi bấm in'); return; }
  if (!BNPrint.printTicket(o, myItems(o, true), { station: STATION, full: true, reprint: true }, set, ['phieu'])) ui.toast('Chưa in được: kiểm tra máy in');
  else ui.toast('Đang in tổng đơn · ' + orderLabel(o));
}

/* ---------- Chi tiết đơn: mọi món của cả bếp và pha chế, tuỳ chọn, giá ---------- */
const DINE = { tai_quan: 'Ăn tại quán', mang_ve: 'Mang về', giao_hang: 'Giao hàng' };
function DetailItem({ i }) {
  const opts = i.options || [], base = i.unit_price - opts.reduce((t, x) => t + (x.price || 0), 0), sz = sizeOf(opts);
  const baseLabel = i.promo_part === 'tang' ? 'Món tặng' : i.promo_part === 'combo' ? 'Giá trong combo' : (sz === 'M' || sz === 'L' ? 'Giá size M' : 'Giá món');
  return (
    <li className={'dt-it' + (i.promo_group ? ' dt-in-pr' : '') + (i.promo_part === 'tang' ? ' dt-gift' : '')}><div className="dt-row"><b><PmTag part={i.promo_part} /><span className="num">{i.qty}×</span> {i.item_name}{sz ? <> <span className={'sz sz-' + sz}>{sizeText(sz)}</span></> : null}</b><b className="num">{vnd(i.unit_price * i.qty)}</b></div>
      {opts.length || i.promo_group ? <div className="dt-row dt-sub"><span>{baseLabel}</span><span className="num">{vnd(base)}</span></div> : null}
      {opts.filter(x => !(sz === 'M' && isSizeOpt(x))).map((x, n) => <div key={n} className={'dt-row dt-sub' + (isTopping(x) ? ' dt-tp' : '')}><span>{isSizeOpt(x) ? (sz === 'UP' ? <b>Upsize</b> : <>Lên <b>size {sz}</b></>) : <>{x.group}: <b>{x.choice}</b></>}</span><span className="num">{x.price ? '+' + vnd(x.price) : '0đ'}</span></div>)}
      {i.qty > 1 ? <div className="dt-row dt-sub"><span>Mỗi phần</span><span className="num">{vnd(i.unit_price)} × {i.qty}</span></div> : null}
      {i.note && <p className="dt-note">Ghi chú món: {i.note}</p>}</li>
  );
}
function PromoSummary({ o }) {
  const gs = new Map(); o.items.forEach(i => { if (!i.promo_group) return; const g = gs.get(i.promo_group) || { name: i.promo_name, kind: i.promo_kind, sum: 0, gift: 0 }; g.sum += i.unit_price * i.qty; if (i.promo_part === 'tang') g.gift += i.qty; gs.set(i.promo_group, g); });
  if (!gs.size) return null;
  return <section className="dt-grp"><h3>Ưu đãi trong đơn</h3><ul>{[...gs.values()].map((g, n) => <li key={n} className="dt-row dt-sub"><span>{g.kind === 'combo' ? '' : 'Ưu đãi '}<b>{BN.promoTitle(g.kind, g.name)}</b>{g.gift ? ' · tặng ' + g.gift + ' món' : ''}</span><span className="num">{vnd(g.sum)}</span></li>)}</ul></section>;
}
function DetailSheet({ o }) {
  const groups = ['bep', 'pha_che'].map(st => ({ st, items: o.items.filter(i => i.station === st), p: part(o, st) })).filter(g => g.items.length);
  const ps = paidState(o);
  const sub = <>{[DINE[o.dine_type] || '', o.customer_phone ? <a key="t" href={'tel:' + o.customer_phone}>{o.customer_phone}</a> : '', 'đặt lúc ' + hhmm(o.created_at)].filter(Boolean).map((x, n) => <span key={n}>{n ? ' · ' : ''}{x}</span>)}</>;
  return (
    <><SheetHead title={'Đơn ' + orderLabel(o)} sub={sub} /><div className="sh-body dt">
      <When o={o} />{o.source === 'fb' && <p className="kc-src">Đơn online</p>}
      {groups.map(g => { const its = promoSort(g.items); return <section key={g.st} className={'dt-grp' + (g.st === STATION ? ' mine' : '')}><h3>{STATIONS[g.st]}{g.st === STATION ? ' (nơi này)' : ''} <PartStatus p={g.p} /></h3><ul>{its.map((i, k) => [<PromoHead key={'h' + k} items={its} k={k} extra="dt-pr" />, <DetailItem key={i.id ?? k} i={i} />])}</ul></section>; })}
      <PromoSummary o={o} />
      {o.note && <p className="kc-note">Ghi chú đơn: {o.note}</p>}
      <div className="dt-row dt-total"><span>Tổng đơn</span><b className="num">{vnd(o.total)}</b></div>
      {ps === 'none' ? <p className="small muted">Chưa thu tiền.</p> : <p className={'paid ' + (ps === 'full' ? 'paid-ok' : 'paid-warn')}>Đã thu {vnd(o.paid_amount)}{o.paid_method ? (o.paid_method === 'tien_mat' ? ' tiền mặt' : ' chuyển khoản') : ''}{ps === 'more' ? ' · còn thu thêm ' + vnd(dueOf(o)) : ps === 'refund' ? ' · trả lại ' + vnd(-dueOf(o)) : ''}</p>}
    </div><div className="sh-foot"><button className="btn btn-line btn-block" type="button" data-close>Đóng</button></div></>
  );
}
const openDetail = o => openSheet(<DetailSheet o={o} />);

/* ---------- Chọn tuỳ chọn (dùng cho đổi tuỳ chọn món đã có và thêm món mới) ---------- */
function OptionGroups({ it, sel, onChange, clearable }) {
  return it.option_groups.map(g => (
    <fieldset key={g.id} className={'pk-og' + (clearable && /topping/i.test(g.title) ? ' pk-og--tp' : '')}><legend>{g.title}{g.min > 0 ? <> <span className="small" style={{ color: 'var(--red)' }}>bắt buộc</span></> : clearable && g.max > 1 ? <> <span className="small muted">chọn tối đa {g.max}</span></> : null}</legend>
      {g.choices.map(c => <label key={c.id} className="pk-ch"><input type={g.max === 1 ? 'radio' : 'checkbox'} name={'g' + g.id} value={c.id} checked={sel.get(g.id).has(c.id)} onChange={e => onChange(g, c.id, e.target.checked)} /><span>{c.name}</span>{c.price ? <span className="small muted">+{K(c.price)}</span> : null}</label>)}
      {clearable && g.min === 0 && g.max === 1 ? <button className="link small" type="button" style={{ alignSelf: 'flex-start' }} onClick={() => onChange(g, null, false, true)}>Bỏ chọn</button> : null}</fieldset>
  ));
}
function useSel(it, init) {
  const [sel, setSel] = useState(() => new Map(it.option_groups.map(g => [g.id, new Set(init(g))])));
  const change = (g, cid, checked, clear) => {
    const set = new Set(sel.get(g.id));
    if (clear) set.clear();
    else if (g.max === 1) { set.clear(); if (checked) set.add(cid); }
    else if (checked) { if (set.size >= g.max) { ui.toast('Chọn tối đa ' + g.max); return; } set.add(cid); } else set.delete(cid);
    setSel(new Map(sel).set(g.id, set));
  };
  const extra = () => it.option_groups.reduce((s, g) => s + g.choices.filter(c => sel.get(g.id).has(c.id)).reduce((t, c) => t + c.price, 0), 0);
  return [sel, change, extra];
}
function OptEditSheet({ o, line, it }) {
  const had = line.options || [];
  // Đơn lưu tên lựa chọn → tìm lại lựa chọn trong menu theo tên nhóm + tên lựa chọn
  const [sel, change, extra] = useSel(it, g => g.choices.filter(c => had.some(x => x.group === g.title && x.choice === c.name)).map(c => c.id));
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const baseNow = line.unit_price - had.reduce((t, x) => t + (x.price || 0), 0), promo = !!line.promo_group && line.promo_part !== 'mua';
  const priceText = promo ? 'Món trong ưu đãi: tiền tuỳ chọn tính theo cài đặt của ưu đãi' : 'Mỗi phần ' + vnd(baseNow + extra()) + (line.qty > 1 ? ' × ' + line.qty + ' = ' + vnd((baseNow + extra()) * line.qty) : '');
  const save = async () => {
    const bad = it.option_groups.find(g => sel.get(g.id).size < g.min);
    if (bad) { setMsg('Chọn "' + bad.title + '"'); return; }
    setBusy(true);
    try { await api.staffSetItemOptions(line.id, [...sel.values()].flatMap(x => [...x])); closeSheet(); ui.toast('Đã đổi tuỳ chọn ' + line.item_name); refresh(); }
    catch (err) { setMsg(errText(err)); setBusy(false); }
  };
  return (
    <><SheetHead title={'Đổi tuỳ chọn · ' + line.item_name} sub={'Đơn ' + orderLabel(o) + ' · ' + line.qty + ' phần'} /><div className="sh-body">
      <OptionGroups it={it} sel={sel} onChange={change} clearable />
      {msg && <p className="msg">{msg}</p>}</div>
      <div className="sh-foot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}><span className="small muted">{priceText}</span><button className="btn btn-block" type="button" disabled={busy} onClick={save}>Lưu tuỳ chọn</button></div></>
  );
}
let menuCache = null;
async function getMenu() { if (!menuCache) { menuCache = await api.getMenu(); setTimeout(() => { menuCache = null; }, 60e3); } return menuCache; }
async function openOptEdit(o, line) {
  let menu; try { menu = await getMenu(); } catch (e) { ui.toast(errText(e)); return; }
  const it = menu.flatMap(c => c.items).find(x => x.id === line.menu_item_id);
  if (!it) { ui.toast(line.item_name + ' đang hết món, không đổi tuỳ chọn được'); return; }
  if (!it.option_groups.length) { ui.toast(line.item_name + ' không có tuỳ chọn để đổi'); return; }
  openSheet(<OptEditSheet o={o} line={line} it={it} />);
}
/* ---------- Thêm món vào đơn: chọn món, tuỳ chọn, số lượng ---------- */
function priceLabel(it) { const g = sizeGroup(it), L = g && g.choices.find(c => /^size l$/i.test(c.name)); return L ? 'M ' + K(it.price) + ' · L ' + K(it.price + L.price) : K(it.price); }
function PickerSheet({ o, cats }) {
  const [q, setQ] = useState('');
  const v = fold(q);
  return (
    <><SheetHead title="Thêm món vào đơn" sub={orderLabel(o)} /><div className="sh-body">
      <input className="search" id="pkQ" type="search" placeholder="Tìm món…" aria-label="Tìm món" value={q} onChange={e => setQ(e.target.value)} />
      <div id="pkList">{cats.map(c => { const its = c.items.filter(it => !v || fold(it.name).indexOf(v) >= 0); return (
        <section key={c.id} className="pk-cat" hidden={!its.length}><h3>{c.name}</h3>{its.map(it => <button key={it.id} className="pk-item" type="button" onClick={() => openSheet(<PickOptionsSheet o={o} it={it} />)}><span>{it.name}</span><b className="num">{priceLabel(it)}</b></button>)}</section>); })}</div></div></>
  );
}
async function openPicker(o) {
  let menu; try { menu = await getMenu(); } catch (e) { ui.toast(errText(e)); return; }
  const owner = state.session.employee.role === 'owner';
  openSheet(<PickerSheet o={o} cats={menu.filter(c => owner || (c.station || 'bep') === STATION)} />);
}
function PickOptionsSheet({ o, it }) {
  const [sel, change, extra] = useSel(it, g => g.choices.filter(c => c.default).map(c => c.id));
  const [qty, setQty] = useState(1), [note, setNote] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const add = async () => {
    const bad = it.option_groups.find(g => sel.get(g.id).size < g.min);
    if (bad) { setMsg('Chọn "' + bad.title + '"'); return; }
    setBusy(true);
    try {
      await api.staffAddItems(o.id, [{ menu_item_id: it.id, qty, note: note.trim() || null, choice_ids: [...sel.values()].flatMap(x => [...x]) }]);
      closeSheet(); ui.toast('Đã thêm ' + qty + '× ' + it.name + ' vào đơn ' + orderLabel(o)); state.panels[o.id] = { kind: 'edit' }; refresh();
    } catch (err) { setMsg(errText(err)); setBusy(false); }
  };
  return (
    <><SheetHead title={it.name} sub={'Thêm vào đơn ' + orderLabel(o)} /><div className="sh-body">
      <OptionGroups it={it} sel={sel} onChange={change} />
      <label className="field" htmlFor="pkNote">Ghi chú món<input id="pkNote" maxLength={120} value={note} onChange={e => setNote(e.target.value)} /></label>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><div className="mins"><button className="btn btn-line btn-sm" type="button" aria-label="Bớt 1" onClick={() => setQty(Math.max(1, qty - 1))}>−</button><output className="num">{qty}</output><button className="btn btn-line btn-sm" type="button" aria-label="Thêm 1" onClick={() => setQty(Math.min(50, qty + 1))}>+</button></div><b className="num">{vnd((it.price + extra()) * qty)}</b></div>
      {msg && <p className="msg">{msg}</p>}</div><div className="sh-foot"><button className="btn btn-block" type="button" disabled={busy} onClick={add}>Thêm vào đơn</button></div></>
  );
}

/* ---------- In phiếu (print.js) ---------- */
/* full = phiếu in toàn bộ đơn (cả món nơi kia); tem vẫn chỉ in ly của nơi này */
function printFor(o, extra, full) {
  if (!BN.FEATURES.print || !window.BNPrint) return false;
  const out = myItems(o), set = BNPrint.get();
  markPrinted(o);
  let only = BNPrint.jobs(set);
  // Máy Bluetooth chưa nối (vừa mở lại trang): in việc khác trước, việc này chờ nối xong bấm in
  const wait = bleSlots(set).filter(k => only.includes(k) && !BNPrint.ble.has(k));
  if (wait.length) {
    only = only.filter(k => !wait.includes(k));
    if (!state.prq.some(x => x.id === o.id)) state.prq.push({ id: o.id, jobs: wait });
    ui.toast(wait.map(k => BNPrint.ble.label(k)).join(', ') + ' chưa kết nối: bấm "Kết nối" rồi bấm in');
  }
  const ex = Object.assign({ station: STATION }, extra);
  let n;
  if (full) {
    n = (only.includes('phieu') ? BNPrint.printTicket(o, myItems(o, true), Object.assign({}, ex, { full: true }), set, ['phieu']) : 0)
      + (only.includes('tem') ? BNPrint.printTicket(o, out, ex, set, ['tem']) : 0);
  } else n = BNPrint.printTicket(o, out, ex, set, only);
  return n || (only.length === 0 && state.prq.some(x => x.id === o.id));
}
/* Gộp các dòng giống hệt nhau (combo chia giá thành nhiều dòng) để phiếu gọn */
function myItems(o, all) {
  const out = [], by = new Map();
  promoSort(o.items.filter(i => all || i.station === STATION)).forEach(i => {
    const key = [i.promo_group || '', i.promo_part || '', i.item_name, JSON.stringify((i.options || []).map(x => x.choice)), i.note || ''].join('|');
    const ex = by.get(key); if (ex) { ex.qty += i.qty; ex.amount += (i.unit_price || 0) * i.qty; return; }
    const c = Object.assign({}, i, { amount: (i.unit_price || 0) * i.qty }); by.set(key, c); out.push(c);
  });
  return out;
}
/* Mỗi máy nhớ đơn nào đã in (theo lần nhận đơn) để không in trùng */
const PKEY = 'printed.' + STATION;
function markPrinted(o) {
  const m = mine(o); if (!m || !m.accepted_at) return;
  const p = BN.store.get(PKEY, {}), now = Date.now();
  Object.keys(p).forEach(k => { if (now - new Date(p[k]).getTime() > 86400000) delete p[k]; });
  p[o.id] = m.accepted_at; BN.store.set(PKEY, p);
}
const wasPrinted = o => { const m = mine(o); return !!(m && BN.store.get(PKEY, {})[o.id] === m.accepted_at); };
/* Máy khác của nơi này vừa bấm Nhận đơn → máy này tự in phần việc của mình (phiếu hoặc tem) */
let autoBusy = false;
async function autoPrint() {
  if (!BN.FEATURES.print || !window.BNPrint || autoBusy) return;
  const set = BNPrint.get(); if (!BNPrint.jobs(set).length) return;
  const now = Date.now();
  const todo = state.orders.filter(o => { const m = mine(o); if (m && m.accepted_at && state.self.has(o.id)) { state.self.delete(o.id); markPrinted(o); return false; } return m && m.status === 'dang_lam' && m.accepted_at && now - new Date(m.accepted_at) < 180000 && !wasPrinted(o) && !state.prq.some(x => x.id === o.id); })
    .sort((a, b) => new Date(mine(a).accepted_at) - new Date(mine(b).accepted_at));
  if (!todo.length) return;
  autoBusy = true;
  try {
    for (const o of todo) {
      // Đợi trang hiện lại (vừa mở RawBT in đơn trước) rồi mới in đơn sau
      for (let n = 0; document.hidden && n < 40; n++) await new Promise(r => setTimeout(r, 250));
      markPrinted(o);
      const left = await BNPrint.tryAuto(o, myItems(o), { station: STATION, minutes: null });
      if (left.length) { state.prq.push({ id: o.id, jobs: left }); alertNew('Bấm in ' + left.map(k => k === 'tem' ? 'tem' : 'phiếu').join(' + ') + ' đơn ' + orderLabel(o), false); }
    }
  } finally { autoBusy = false; render(); }
}
const bleSlots = set => { set = set || BNPrint.get(); return [set.mode === 'ble' && 'phieu', set.tmode === 'ble' && 'tem'].filter(Boolean); };
function BleBtn({ k }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const n = await BNPrint.ble.connect(k); ui.toast('Đã nối ' + BNPrint.ble.label(k) + ' ' + (n || '')); } catch (err) { const m = BNPrint.errMsg(err); if (!/cancel/i.test(m)) ui.toast('Không nối được: ' + m); }
    setBusy(false); render();
  };
  return <button className="btn btn-sm" type="button" disabled={busy} onClick={go}>{busy ? 'Đang nối…' : 'Kết nối ' + (k === 'tem' ? 'máy tem' : 'máy phiếu')}</button>;
}
/* Thanh nhắc: máy Bluetooth chưa nối, đơn vừa nhận mà máy này chưa in */
function PrintQueue() {
  const set = BNPrint.get();
  const printQ = x => { const o = state.orders.find(y => y.id === x.id); state.prq = state.prq.filter(y => y.id !== x.id); if (o) { markPrinted(o); BNPrint.printTicket(o, myItems(o), { station: STATION }, null, x.jobs); } render(); };
  return <>
    {bleSlots(set).filter(k => !BNPrint.ble.ok(k)).map(k => <div key={k} className="prq-in" role="alert"><span className="grow">{k === 'tem' ? 'Máy in tem' : 'Máy in phiếu'} {BNPrint.ble.name(k)} chưa kết nối. Bấm để nối (tắt app riêng của máy in trước).</span><BleBtn k={k} /></div>)}
    {state.prq.length ? <div className="prq-in" role="alert"><span className="grow">Đơn vừa được nhận, máy này chưa in:</span>{state.prq.map(x => {
      const o = state.orders.find(y => y.id === x.id); if (!o) return null;
      const n = myItems(o).reduce((t, i) => t + i.qty, 0);
      return <button key={x.id} className="btn btn-sm" type="button" onClick={() => printQ(x)}>In {x.jobs.map(k => k === 'tem' ? n + ' tem' : 'phiếu').join(' + ')} · {isTakeaway(o) ? o.customer_name || 'mang về' : 'số ' + o.queue_number}</button>;
    })}<button className="btn btn-sm btn-line" type="button" onClick={() => { state.prq = []; render(); }}>Bỏ qua</button></div> : null}
  </>;
}

/* ---------- Trang khác mở đè lên (giữ màn hình này chạy nền) ---------- */
function openOverlay(href) {
  closeOverlay();
  const ov = document.createElement('div'); ov.className = 'ovl'; ov.id = 'ovl';
  ov.innerHTML = '<div class="ovl-bar"><button class="btn btn-sm" type="button" id="ovlBack">← ' + SHORT[STATION] + '</button><span class="small">Màn hình ' + SHORT[STATION].toLowerCase() + ' vẫn chạy, máy in vẫn nối</span></div><iframe class="ovl-f" title="Trang khác"></iframe>';
  document.body.appendChild(ov); document.documentElement.classList.add('ovl-on');
  ov.querySelector('iframe').src = href;
  ov.querySelector('#ovlBack').onclick = closeOverlay;
}
function closeOverlay() {
  const ov = document.getElementById('ovl'); if (!ov) return;
  ov.remove(); document.documentElement.classList.remove('ovl-on'); refresh();
}
window.BN_OVERLAY = { close: closeOverlay, page: location.pathname.replace(/\.html$/, '') };
/* ---------- Chuông báo ---------- */
function toggleSound() {
  state.sound = !state.sound;
  if (state.sound) { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); beep(); loadVoice(); } catch (e) { /* không có âm thanh */ } lockScreen(); }
  render();
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
async function loadVoice() {
  if (voice || !audio) return;
  try {
    const r = await fetch('sound/tinh-tinh.mp3');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = await r.arrayBuffer();
    voice = await new Promise((ok, no) => audio.decodeAudioData(buf, ok, no));
  } catch (e) { voice = null; }
}
function playVoice() {
  if (!audio || !voice) return false;
  const src = audio.createBufferSource(); src.buffer = voice; src.connect(audio.destination);
  src.start(audio.currentTime);
  return true;
}
function alertNew(msg, withVoice) {
  ui.toast(msg);
  if (state.sound) { if (withVoice && playVoice()) { /* tiếng tinh tinh */ } else { beep(); setTimeout(beep, 700); } }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}
async function lockScreen() { try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* máy không hỗ trợ */ } }

/* ---------- Bắt đầu: đăng nhập rồi vẽ màn hình ---------- */
{ const dn = document.getElementById('demoNote'); if (dn) dn.hidden = !DEMO; }
BN.staff.requireLogin(document.getElementById('app'), { title: IS_BEP ? 'Màn hình bếp' : 'Màn hình quầy pha chế', onReady: s => { state.session = s; start(); } });
