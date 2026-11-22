/* =====================================================================
   TRANG KHÁCH GỌI MÓN — bản React (Bước 3).
   Logic giữ nguyên bản cũ (customer-legacy.js): phiên quét mã, giỏ hàng, ưu đãi (combo, mua tặng,
   giảm giá, đơn từ xx tặng quà), gửi đơn, theo dõi trạng thái đơn, đơn giao hàng (?dat=giao).
   Thêm ?cu=1 vào địa chỉ để dùng lại bản cũ.
   ===================================================================== */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { openSheet, closeSheet, SheetHead, Html } from '../common/sheet.jsx';

const BN = window.BN;
const { api, ui, store, K, vnd, hhmm, errText, ERR, DEMO, CONFIG, DRINK_CATS, ICON_BAG, ICON_SCOOTER, qboxHtml, orderLabel, sizeGroup, promoPrices, promoWhen, saleOf, saleBadge } = BN;

let ver = 0; const subs = new Set();
const render = () => { ver++; subs.forEach(f => f()); };
const useVer = () => useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => ver);

/* Giá gốc (trước giảm giá) — combo / mua tặng tính theo giá gốc */
const orig = it => it.orig != null ? it.orig : it.price;
/* Giá size L của món có chọn size (null nếu món chỉ có 1 giá) */
const priceL = it => { const g = sizeGroup(it), L = g && g.choices.find(c => /^size l$/i.test(c.name)); return L ? it.price + L.price : null; };
/* Hình ly: M nhỏ, L to, chữ ở giữa */
function cupIcon(letter) {
  const big = letter === 'L', w = big ? 30 : 24, h = big ? 42 : 32, x0 = (60 - w) / 2, y0 = 56 - h;
  return '<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M' + (x0 - 3) + ' ' + y0 + 'h' + (w + 6) + '" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M' + x0 + ' ' + (y0 + 2) + 'L' + (x0 + 3) + ' 56h' + (w - 6) + 'L' + (x0 + w) + ' ' + (y0 + 2) + 'z" fill="var(--red-soft)" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M' + (x0 + w - 6) + ' ' + y0 + 'l6 -' + (big ? 12 : 9) + '" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
    '<text x="30" y="' + (y0 + h / 2 + 6) + '" text-anchor="middle" font-size="' + (big ? 17 : 14) + '" font-weight="800" fill="currentColor" font-family="system-ui,sans-serif">' + letter + '</text></svg>';
}
const ICON = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  bowl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1 1-1.5 1-2.5M12 7c0-1 1-1.5 1-2.5M16 7c0-1 1-1.5 1-2.5"/></svg>',
  cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8h12l-1.5 13h-9z"/><path d="M5 8h14M12 8l2-6"/><circle cx="10" cy="17" r=".8"/><circle cx="13.5" cy="15" r=".8"/></svg>'
};

const state = {
  menu: [], items: new Map(), itemCat: new Map(), promos: [], menuErr: false,
  info: Object.assign({ queue: '', name: '', phone: '', dine: '', dineAt: 0 }, store.get('info', {})),
  cart: [], cartNote: '',
  orders: store.get(DEMO ? 'demo.orders' : 'orders', []),
  orderData: {}, orderChanges: {}, editingInfo: false, view: 'menu', search: '',
  // Một menu chung cho mọi mã QR; ?dat=giao → chủ quán / nhân viên tạo đơn giao hàng
  kind: BN.PARAMS.get('dat') === 'giao' ? 'giao' : 'chung',
  staff: null, giao: { name: '', phone: '', address: '', time: '', paid: false, kind: BN.store.get('giaoKind', 'ship') === 'lay' ? 'lay' : 'ship' }
};
const GIAO = state.kind === 'giao';
/* ---------- Phiên gọi món (chống gọi món khi đã về nhà) ---------- */
const SESSION_MS = Math.max(1, Number(CONFIG.ORDER_SESSION_MINUTES) || 30) * 60e3;
let phien = GIAO ? null : store.get('phien', null);
if (!GIAO && !BN.PARAMS.has('tiep')) {
  /* Mã QR theo bàn: ?ban=5 → khách ngồi bàn 5, tự điền số bàn, ăn tại quán (vẫn đổi sang mang về được) */
  const ban = (n => n >= 1 && n <= 999 ? n : 0)(parseInt(BN.PARAMS.get('ban'), 10));
  phien = { at: Date.now(), ban: ban };
  store.set('phien', phien);
  try { const u = new URL(location.href); ['qr', 'ban', 'menu'].forEach(k => u.searchParams.delete(k)); u.searchParams.set('tiep', '1'); history.replaceState(null, '', u); } catch (e) { /* bỏ qua */ }
}
const phienLeft = () => {
  if (GIAO) return Infinity;
  const l = phien ? phien.at + SESSION_MS - Date.now() : 0;
  return l > SESSION_MS ? 0 : l; // đồng hồ máy bị chỉnh lùi: coi như hết phiên
};
const PHIEN_HET = 'Phiên gọi món đã hết (' + Math.round(SESSION_MS / 60e3) + ' phút kể từ lúc quét mã). Bạn quét lại mã QR ở bàn hoặc ở quầy để gửi đơn nhé, món trong giỏ vẫn được giữ.';
const mmss = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
/* Đồng hồ phiên: tự đổi mỗi giây (không vẽ lại cả trang) */
function useSecond() { const [, set] = useState(0); useEffect(() => { const t = setInterval(() => set(x => x + 1), 1000); const v = () => { if (!document.hidden) set(x => x + 1); }; document.addEventListener('visibilitychange', v); return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); }; }, []); }
const PhienLine = ({ left }) => left <= 0 ? <b>Phiên đã hết hạn</b> : <>Phiên hết hạn sau: <b className="num">{mmss(left)}</b></>;
function Phien() {
  useSecond();
  if (GIAO) return null;
  const left = phienLeft(), live = left > 0, warn = left <= 5 * 60e3;
  return live ? <div className={'phien' + (warn ? ' phien--warn' : '')} role="timer" aria-live="off"><span className="phien-line"><PhienLine left={left} /></span><span className="phien-sub">Hết giờ thì quét lại mã QR ở quán là gọi tiếp được.</span></div>
    : <div className="phien phien--het" role="status"><b>Quét lại mã QR để gọi món</b><span>{PHIEN_HET}</span></div>;
}
function CartPhien() { useSecond(); const left = phienLeft(); return <p className={'phien-cart' + (left <= 5 * 60e3 ? ' phien-cart--warn' : '')} id="cPhien"><PhienLine left={left} /></p>; }

const BAN = GIAO ? 0 : (phien && phien.ban) || 0;
if (GIAO) state.orders = []; // trang tạo đơn không theo dõi đơn như khách
const MENU = {
  bep: { hero: 'BÉ NỐC ĂN VẶT', tag: 'Ăn ngon · Giá xinh · Ship nhanh' },
  pha_che: { hero: 'BÉ NỐC TRÀ NGON', tag: 'Trà ngon · Vị thật · Giá yêu' },
  chung: { hero: 'BÉ NỐC', tag: 'Ăn vặt · Trà sữa · Cà phê · Giá yêu' },
  giao: { hero: 'ĐƠN GIAO HÀNG', tag: 'Tích món khách nhắn qua Facebook / điện thoại' }
};
state.cart = store.get('cart.' + state.kind, null);
state.cartNote = store.get('cartNote.' + state.kind, '');
// Gộp giỏ cũ của 2 menu (trước khi gộp menu) vào giỏ chung
if (state.cart == null) { state.cart = state.kind === 'chung' ? store.get('cart.bep', []).concat(store.get('cart.pha_che', [])) : []; if (state.kind === 'chung') { state.cartNote = [store.get('cartNote.bep', ''), store.get('cartNote.pha_che', '')].filter(Boolean).join(' · '); store.del('cart.bep'); store.del('cart.pha_che'); store.del('cartNote.bep'); store.del('cartNote.pha_che'); } }
const saveInfo = () => store.set('info', state.info);
const saveCart = () => { store.set('cart.' + state.kind, state.cart); store.set('cartNote.' + state.kind, state.cartNote); };
const saveOrders = () => { if (!GIAO) store.set(DEMO ? 'demo.orders' : 'orders', state.orders); };

function showView(v) {
  state.view = v; render(); window.scrollTo(0, 0);
  if (v === 'menu') requestAnimationFrame(() => { document.querySelectorAll('.tab').forEach((t, i) => t.setAttribute('aria-current', i === 0 ? 'true' : 'false')); const bar = document.querySelector('.tabs'); if (bar) bar.scrollLeft = 0; });
}

/* ---------- Ảnh món ---------- */
function Thumb({ it }) {
  const cat = state.itemCat.get(it.id);
  return <span className="thumb">{it.image_path ? <img src={it.image_path} alt="" loading="lazy" /> : <Html html={cat && DRINK_CATS.test(cat.name) ? ICON.cup : ICON.bowl} />}</span>;
}

/* ---------- Vé số thứ tự ---------- */
const queueNum = () => BAN || parseInt(state.info.queue, 10);
if (BAN && (String(state.info.queue) !== String(BAN) || !state.info.dine)) { state.info.queue = String(BAN); state.info.dine = 'tai_quan'; state.info.dineAt = Date.now(); store.set('info', state.info); }
/* Ăn tại quán / mang về. Hỏi lại nếu lần chọn trước đã quá 4 giờ. */
const DINE_TTL = 4 * 3600e3;
const isLay = () => GIAO && state.giao.kind === 'lay';
function setGiaoKind(k) { state.giao.kind = k === 'lay' ? 'lay' : 'ship'; store.set('giaoKind', state.giao.kind); render(); }
const dineMode = () => GIAO ? (isLay() ? 'mang_ve' : 'giao_hang') : (state.info.dine && Date.now() - (state.info.dineAt || 0) < DINE_TTL) ? state.info.dine : '';
const isTake = () => dineMode() === 'mang_ve';
function setDine(d) { state.info.dine = d; state.info.dineAt = Date.now(); saveInfo(); render(); }
const infoReady = () => !!dineMode() && state.info.name.trim() !== '' && (isTake() || queueNum() > 0);
function DinePick({ onPick }) {
  return <><p className="dp-title">Bạn ăn tại quán hay mang về?</p><div className="dp-btns">
    <button className="dp-btn" type="button" data-dine="tai_quan" onClick={() => onPick('tai_quan')}><Html html={ICON.bowl} /><b>Ăn tại quán</b><span>{BAN ? 'Phục vụ tại bàn ' + BAN : 'Lấy thẻ số ở quầy'}</span></button>
    <button className="dp-btn" type="button" data-dine="mang_ve" onClick={() => onPick('mang_ve')}><Html html={ICON_BAG} /><b>Mang về</b><span>Không cần thẻ số</span></button></div></>;
}
/* Chưa chọn ăn tại quán / mang về thì hỏi trước, chọn xong mới làm tiếp */
function needDine(then) {
  if (dineMode()) { then(); return; }
  openSheet(<><SheetHead title="Trước khi chọn món" /><div className="sh-body"><DinePick onPick={d => { setDine(d); closeSheet(); then(); }} /></div></>);
}
function Chip() {
  const focus = () => {
    if (state.view !== 'menu') showView('menu');
    if (dineMode()) state.editingInfo = true;
    render();
    requestAnimationFrame(() => { const t = document.getElementById('ticket'); if (t) t.scrollIntoView({ block: 'center' }); const f = document.getElementById('inQueue') || document.getElementById('inName'); if (f) f.focus({ preventScroll: true }); });
  };
  if (GIAO) return <button className="chip" id="chip" type="button" onClick={focus}>{isLay() ? 'Qua lấy' : 'Đi ship'}</button>;
  if (!dineMode()) return <button className="chip chip--warn" id="chip" type="button" aria-label="Chưa chọn ăn tại quán hay mang về, bấm để chọn" onClick={focus}>Ăn ở đây hay mang về?</button>;
  if (isTake()) return <button className="chip" id="chip" type="button" aria-label="Đơn mang về, bấm để sửa" onClick={focus}>Mang về</button>;
  if (queueNum() > 0) return <button className="chip" id="chip" type="button" aria-label={'Số thứ tự ' + queueNum() + ', bấm để sửa'} onClick={focus}>{BAN ? 'Bàn' : 'Số'} <b className="num">{queueNum()}</b></button>;
  return <button className="chip chip--warn" id="chip" type="button" aria-label="Chưa nhập số thứ tự, bấm để nhập" onClick={focus}>Chưa có số</button>;
}
function Ticket() {
  const [msg, setMsg] = useState('');
  const qRef = useRef(null), nRef = useRef(null);
  if (GIAO) {
    return (
      <section className="ticket ticket--pick" id="ticket" aria-label="Tạo đơn giao hàng">
        {state.staff === false
          ? <><p className="dp-title">Cần đăng nhập trước</p><p style={{ margin: '0 0 10px', textAlign: 'center' }}>Trang này để chủ quán / nhân viên tạo đơn giao hàng. Đăng nhập ở trang Quản lý rồi quay lại.</p><a className="btn btn-block" href="quanly.html">Mở trang Quản lý để đăng nhập</a></>
          : <><p className="dp-title">Đơn giao hàng</p><div className="dp-btns">
            <button className="dp-btn" type="button" aria-pressed={isLay()} onClick={() => setGiaoKind('lay')}><Html html={ICON_BAG} /><b>Qua lấy</b><span>Khách tới quán lấy, không cần giờ</span></button>
            <button className="dp-btn" type="button" aria-pressed={!isLay()} onClick={() => setGiaoKind('ship')}><Html html={ICON_SCOOTER} /><b>Đơn đi ship</b><span>Cần địa chỉ và giờ giao</span></button></div>
            <p style={{ margin: '10px 0 0', textAlign: 'center' }} className="muted small">Tích các món khách nhắn (đồ ăn và đồ uống chung một đơn), rồi bấm <b>Xem giỏ</b> để nhập {isLay() ? 'tên khách' : 'tên, địa chỉ, giờ giao'}.{state.staff ? <><br />Đang đăng nhập: {state.staff.full_name} · <a href="quanly.html">về trang Quản lý</a></> : null}</p></>}
      </section>
    );
  }
  if (!dineMode()) return <section className="ticket ticket--pick" id="ticket" aria-label="Ăn tại quán hay mang về"><DinePick onPick={d => { setDine(d); state.editingInfo = !infoReady(); render(); }} /></section>;
  const switchLink = <button className="link" type="button" id="tkSwitch" onClick={() => { setDine(isTake() ? 'tai_quan' : 'mang_ve'); state.editingInfo = !infoReady(); setMsg(''); render(); }}>{isTake() ? 'Đổi sang ăn tại quán' : 'Đổi sang mang về'}</button>;
  const edit = () => { state.editingInfo = true; render(); requestAnimationFrame(() => (document.getElementById('inQueue') || document.getElementById('inName'))?.focus()); };
  const nameInput = ph => <label className="field" htmlFor="inName">Tên của bạn <input id="inName" ref={nRef} maxLength={40} autoComplete="given-name" placeholder={ph} defaultValue={state.info.name} onInput={e => { state.info.name = e.target.value; saveInfo(); }} /></label>;
  if (isTake()) {
    const head = <div className="tk-num tk-num--mv"><Html html={ICON_BAG} /><span className="tk-label">Mang về</span></div>;
    if (infoReady() && !state.editingInfo) {
      return <section className="ticket" id="ticket" aria-label="Đơn mang về">{head}<div className="tk-body"><span className="tk-name">{state.info.name}</span><span className="tk-hint">Món xong quán sẽ gọi tên bạn ra quầy nhận. Không cần lấy thẻ số.</span>
        <div className="tk-links"><button className="link" type="button" id="tkEdit" onClick={edit}>Sửa tên</button>{switchLink}</div></div></section>;
    }
    const save = () => { if (!state.info.name.trim()) { setMsg(ERR.MISSING_NAME); nRef.current?.focus(); return; } setMsg(''); state.editingInfo = false; render(); ui.toast('Đã lưu: mang về'); };
    return <section className="ticket" id="ticket" aria-label="Đơn mang về">{head}<div className="tk-body"><p className="tk-title">Đơn mang về: chỉ cần tên của bạn, không cần thẻ số.</p>
      {nameInput('Để quán gọi khi món xong')}
      <p className="msg" id="tkMsg" hidden={!msg}>{msg}</p>
      <div className="row"><button className="btn btn-sm" type="button" id="tkSave" onClick={save}>Lưu</button></div><div className="tk-links">{switchLink}</div></div></section>;
  }
  if (infoReady() && !state.editingInfo) {
    return <section className="ticket" id="ticket" aria-label="Số thứ tự của bạn"><div className="tk-num"><span className="tk-label">{BAN ? 'Bàn' : 'Số của bạn'}</span><b className="num">{queueNum()}</b></div>
      <div className="tk-body"><span className="tk-name">{state.info.name}</span><span className="tk-hint">{BAN ? 'Nhân viên sẽ mang món tới bàn ' + BAN + '.' : 'Nhân viên sẽ mang món tới chỗ có thẻ số này.'}</span>
        <div className="tk-links"><button className="link" type="button" id="tkEdit" onClick={edit}>{BAN ? 'Sửa tên' : 'Sửa số hoặc tên'}</button>{switchLink}</div></div></section>;
  }
  const save = () => {
    if (!(queueNum() > 0)) { setMsg(ERR.MISSING_QUEUE_NUMBER); qRef.current?.focus(); return; }
    if (!state.info.name.trim()) { setMsg(ERR.MISSING_NAME); nRef.current?.focus(); return; }
    setMsg(''); state.editingInfo = false; render(); ui.toast(BAN ? 'Đã lưu · bàn ' + BAN : 'Đã lưu số ' + queueNum());
  };
  return <section className="ticket" id="ticket" aria-label="Số thứ tự của bạn">
    {BAN ? <div className="tk-num"><span className="tk-label">Bàn</span><b className="num">{BAN}</b></div>
      : <div className="tk-num"><label className="tk-label" htmlFor="inQueue">Số trên thẻ</label><input id="inQueue" ref={qRef} className="num" inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="00" autoComplete="off" defaultValue={state.info.queue} onInput={e => { e.target.value = e.target.value.replace(/\D/g, ''); state.info.queue = e.target.value; saveInfo(); render(); }} /></div>}
    <div className="tk-body"><p className="tk-title">{BAN ? 'Bạn đang ngồi bàn ' + BAN + '. Nhập tên để quán gọi khi cần.' : 'Lấy thẻ số ở quầy bếp, nhập số trên thẻ và tên của bạn.'}</p>
      {nameInput('Để quán gọi khi cần')}
      <p className="msg" id="tkMsg" hidden={!msg}>{msg}</p>
      <div className="row"><button className="btn btn-sm" type="button" id="tkSave" onClick={save}>Lưu</button>{state.editingInfo ? null : <span className="tk-hint">Bạn có thể xem menu trước.</span>}</div><div className="tk-links">{switchLink}</div></div></section>;
}

/* ---------- Menu ---------- */
const countInCart = id => state.cart.filter(l => l.itemId === id).reduce((s, l) => s + l.qty, 0);
function optionHint(it) { const seen = []; it.option_groups.forEach(g => { if (seen.indexOf(g.title) < 0) seen.push(g.title); }); return seen.join(' · '); }
/* Gợi ý tuỳ chọn dưới tên món: "Topping thêm" nổi bật */
function OptionHint({ it }) {
  const h = optionHint(it), m = h.match(/(Topping[^·]*)/i);
  if (!m) return h;
  return <>{h.slice(0, m.index)}<b className="tp-hint">+ {m[1].trim()}</b>{h.slice(m.index + m[1].length)}</>;
}
function AddBtn({ it }) {
  const n = countInCart(it.id);
  return <button className={'add' + (n ? ' add--on' : '')} type="button" data-add={it.id} aria-label={'Thêm ' + it.name + (n ? ', đang có ' + n + ' trong giỏ' : '')} onClick={() => quickAdd(it.id)}>{n ? <span className="num">{n}</span> : <Html html={ICON.plus} />}</button>;
}
/* Danh mục: đồ ăn trước, đồ uống sau (giữ thứ tự trong từng nhóm) */
function shownCats() {
  if (GIAO || state.kind === 'chung') {
    const st = c => (c.station || 'bep') === 'bep' ? 0 : 1;
    return state.menu.map((c, i) => [c, i]).sort((a, b) => st(a[0]) - st(b[0]) || a[1] - b[1]).map(x => x[0]);
  }
  const mineCats = state.menu.filter(c => (c.station || 'bep') === state.kind);
  return mineCats.length ? mineCats : state.menu;
}
const saleTag = it => { const p = state.promos.find(x => x.id === it.sale.id); return p ? (p.sale_mode === 'dong_gia' ? 'Đồng giá' : p.sale_mode === 'phan_tram' ? '-' + p.sale_value + '%' : 'Giảm') : 'Giảm'; };
function MenuList() {
  const cats = shownCats(), words = BN.fold(state.search).split(/\s+/).filter(Boolean);
  const ok = (it, c) => words.every(w => BN.fold(it.name + ' ' + (it.description || '') + ' ' + c.name).indexOf(w) >= 0);
  // Tab đang xem đổi theo danh mục đang ở giữa màn hình
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const ob = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      document.querySelectorAll('.tab').forEach(t => {
        const on = t.dataset.go === en.target.dataset.cat;
        t.setAttribute('aria-current', on ? 'true' : 'false');
        if (on) { const bar = document.querySelector('.tabs'); bar.scrollLeft = t.offsetLeft - bar.clientWidth / 2 + t.offsetWidth / 2; }
      });
    }), { rootMargin: '-70px 0px -65% 0px' });
    document.querySelectorAll('.cat').forEach(s => ob.observe(s));
    return () => ob.disconnect();
  }, [state.menu]);
  if (!state.menu.length) return <div id="menuList">{state.menuErr ? <p className="msg">Không tải được menu. Kiểm tra mạng rồi tải lại trang.</p> : <p className="loading">Đang tải menu…</p>}</div>;
  return (
    <div id="menuList">{cats.map(c => {
      const anyShown = c.items.some(it => ok(it, c));
      return (
        <section key={c.id} className={'cat cc-' + (c.color || 'vang')} id={'cat-' + c.id} data-cat={c.id} hidden={!anyShown}>
          <h2 className="cat-title"><span>{c.name}</span></h2><ul className="items">{c.items.map(it => (
            <li key={it.id} className="item" data-item={it.id} hidden={!ok(it, c)}>
              <button className="thumb-btn" type="button" aria-label={'Xem ' + it.name} onClick={() => openItem(it.id)}><Thumb it={it} /></button>
              <button className="item-main" type="button" onClick={() => openItem(it.id)}>
                <span className="item-name">{it.name}{it.best && <> <span className="tag tag-best">🔥 Best seller</span></>}{it.tag && !(it.best && /^best\s*seller$/i.test(it.tag)) && <> <span className="tag">{it.tag}</span></>}</span>
                {it.description && <span className="item-desc">{it.description}</span>}
                {optionHint(it) && <span className="item-opts"><OptionHint it={it} /></span>}</button>
              <div className="item-side">{it.sale && <span className="item-sale">{saleTag(it)}</span>}{priceL(it) ? <span className="item-price item-price--ml num"><span><small>M</small> {K(it.price)}</span><span><small>L</small> {K(priceL(it))}</span></span> : <span className="item-price num">{it.sale && <><s>{K(it.orig)}</s> </>}{K(it.price)}</span>}<AddBtn it={it} /></div></li>
          ))}</ul></section>
      );
    })}</div>
  );
}
function Tabs() {
  const cats = shownCats(), words = BN.fold(state.search).split(/\s+/).filter(Boolean);
  const shown = c => c.items.some(it => words.every(w => BN.fold(it.name + ' ' + (it.description || '') + ' ' + c.name).indexOf(w) >= 0));
  const go = id => { const sec = document.getElementById('cat-' + id); if (sec) sec.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  return <div className="tabs-in" id="tabsIn">{cats.map((c, i) => <button key={c.id} className={'tab cc-' + (c.color || 'vang')} type="button" data-go={c.id} aria-current={i === 0 ? 'true' : undefined} hidden={!shown(c)} onClick={() => go(c.id)}>{c.name}</button>)}</div>;
}
function SearchEmpty() {
  const words = BN.fold(state.search).split(/\s+/).filter(Boolean);
  const any = shownCats().some(c => c.items.some(it => words.every(w => BN.fold(it.name + ' ' + (it.description || '') + ' ' + c.name).indexOf(w) >= 0)));
  const hide = !(words.length && !any);
  return <p className="empty" id="mEmpty" hidden={hide}>{hide ? '' : 'Không thấy món nào khớp “' + state.search.trim() + '” trong menu này.'}</p>;
}

/* ---------- Thêm vào giỏ ---------- */
const lineKey = l => l.promo ? 'P|' + l.promo + '|' + JSON.stringify(l.units.map(u => [u.part, u.itemId, u.choices.map(c => c.id).sort((a, b) => a - b), u.note || '']))
  : l.itemId + '|' + l.choices.map(c => c.id).sort((a, b) => a - b).join(',') + '|' + (l.note || '');
const extraOf = choices => choices.reduce((s, c) => s + c.price, 0);
/* Giá 1 phần ưu đãi (tính giống máy chủ) */
const promoUnitPrices = l => promoPrices(l.p, l.units.map(u => ({ part: u.part, base: u.base, extra: extraOf(u.choices) })));
const unitPrice = l => l.promo ? promoUnitPrices(l).reduce((s, x) => s + x, 0) : l.base + extraOf(l.choices);
/* Thay 1 dòng trong giỏ bằng bản đã sửa; nếu trùng hệt dòng khác thì gộp số lượng */
function replaceLine(index, line) {
  state.cart.splice(index, 1);
  const ex = state.cart.find(l => lineKey(l) === lineKey(line));
  if (ex) ex.qty = Math.min(50, ex.qty + line.qty); else state.cart.splice(Math.min(index, state.cart.length), 0, line);
  saveCart(); render();
}
function editLine(i) {
  const l = state.cart[i]; if (!l) return;
  if (l.promo ? !state.promos.some(p => p.id === l.promo) : !state.items.has(l.itemId)) { ui.toast('Món này vừa hết, không sửa được'); return; }
  closeSheet(); setTimeout(() => l.promo ? openPromo(l.promo, { index: i, line: l }) : openItem(l.itemId, { index: i, line: l }), 0);
}
function addLine(line) {
  const ex = state.cart.find(l => lineKey(l) === lineKey(line));
  if (ex) ex.qty = Math.min(50, ex.qty + line.qty); else state.cart.push(line);
  saveCart(); render();
}
/* ---------- Hình minh hoạ lượng đường / lượng đá (SVG) ---------- */
const LV = (() => {
  const INK = '#3B2A24', RED = '#E2325C';
  const cube = (x, y, s) => { const h = s;
    const t = [x, y - s / 2, x + s, y, x, y + s / 2, x - s, y], l = [x - s, y, x, y + s / 2, x, y + s / 2 + h, x - s, y + h], r = [x + s, y, x, y + s / 2, x, y + s / 2 + h, x + s, y + h];
    const pg = (pts, f) => '<polygon points="' + pts.join(' ') + '" fill="' + f + '" stroke="' + INK + '" stroke-width="1.6" stroke-linejoin="round"/>';
    return pg(l, '#F2E4CF') + pg(r, '#E4CFB1') + pg(t, '#FFFFFF') + '<circle cx="' + (x - s / 3) + '" cy="' + (y - 1) + '" r="1.1" fill="#D9C3A2"/><circle cx="' + (x + s / 3) + '" cy="' + (y + 1) + '" r="1.1" fill="#D9C3A2"/>'; };
  const saucer = '<ellipse cx="32" cy="55" rx="25" ry="5" fill="#F3E3C8" stroke="' + INK + '" stroke-width="1.6"/>';
  const glass = inner => '<defs><clipPath id="CLIP"><polygon points="14,12 50,12 46,57 18,57"/></clipPath></defs>' +
    '<rect x="12" y="25" width="40" height="34" fill="#F2C98E" clip-path="url(#CLIP)"/>' + inner +
    '<polygon points="14,12 50,12 46,57 18,57" fill="none" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M17 25 Q32 22 47 25" fill="none" stroke="#D99A4E" stroke-width="1.6"/><path d="M20 18 L20 50" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>';
  const ice = (x, y, a) => '<rect x="' + (x - 6) + '" y="' + (y - 6) + '" width="12" height="12" rx="3" transform="rotate(' + a + ' ' + x + ' ' + y + ')" fill="#DDF1FB" stroke="#5FA8D3" stroke-width="1.6"/>' +
    '<path d="M' + (x - 3) + ' ' + (y - 2) + ' l3 -2" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" transform="rotate(' + a + ' ' + x + ' ' + y + ')"/>';
  const no = '<circle cx="32" cy="34" r="22" fill="none" stroke="' + RED + '" stroke-width="3.5"/><path d="M16.5 49.5 L47.5 18.5" stroke="' + RED + '" stroke-width="3.5" stroke-linecap="round"/>';
  const svg = (inner, id) => '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">' + inner.replace(/CLIP/g, 'clip-' + id) + '</svg>';
  return {
    duong0: svg(saucer + cube(32, 36, 11) + no, 'd0'),
    duong1: svg(saucer + cube(32, 36, 11), 'd1'),
    duong2: svg(saucer + cube(21, 41, 9) + cube(43, 41, 9) + cube(32, 27, 9), 'd2'),
    da0: svg(glass('<circle cx="28" cy="44" r="1.6" fill="#FFF6E6"/><circle cx="37" cy="36" r="1.2" fill="#FFF6E6"/><circle cx="33" cy="50" r="1" fill="#FFF6E6"/>'), 'a0'),
    da1: svg(glass(ice(33, 30, 12)), 'a1'),
    da2: svg(glass(ice(25, 29, -10) + ice(38, 30, 14) + ice(31, 42, 4) + ice(40, 47, -18)), 'a2')
  };
})();
function levelIcon(name) {
  const n = String(name || '').toLowerCase();
  const kind = /đường/.test(n) ? 'duong' : /(^|\s)đá(\s|$)/.test(n) ? 'da' : null;
  if (!kind) return null;
  return LV[kind + (/không/.test(n) ? 0 : /\bít\b|^ít|\sít/.test(n) ? 1 : 2)];
}
function quickAdd(id, back) {
  if (GIAO && state.staff === false) { ui.toast('Cần đăng nhập ở trang Quản lý trước'); return; }
  if (!dineMode()) { needDine(() => quickAdd(id)); return; }
  const it = state.items.get(id); if (!it) return;
  const choices = []; let ok = true;
  it.option_groups.forEach(g => {
    const defs = g.choices.filter(c => c.default); if (defs.length < g.min) ok = false;
    defs.forEach(c => choices.push({ id: c.id, name: c.name, price: c.price, group: g.title }));
  });
  if (!ok) { if (back) closeSheet(); setTimeout(() => openItem(id, null, back), 0); return; }
  addLine({ itemId: it.id, name: it.name, base: it.price, sale: it.sale ? it.sale.id : null, choices, qty: 1, note: '' });
  ui.toast('Đã thêm ' + it.name + (choices.length ? ' (' + choices.map(c => c.name).join(', ') + ')' : ''));
}
/* edit = { index, line }: sửa món đã có trong giỏ. back: mở lại bảng trước sau khi thêm món */
function ItemSheet({ it, edit, back }) {
  const cat = state.itemCat.get(it.id);
  const [sel, setSel] = useState(() => { const had = edit ? new Set(edit.line.choices.map(c => c.id)) : null; return new Map(it.option_groups.map(g => [g.id, new Set(g.choices.filter(c => had ? had.has(c.id) : c.default).map(c => c.id))])); });
  const [qty, setQty] = useState(edit ? edit.line.qty : 1);
  const [note, setNote] = useState(edit ? edit.line.note || '' : '');
  const [bad, setBad] = useState(null);
  const refs = useRef({});
  const total = () => { let x = 0; it.option_groups.forEach(g => g.choices.forEach(c => { if (sel.get(g.id).has(c.id)) x += c.price; })); return (it.price + x) * qty; };
  const pick = (g, c, checked, single) => {
    let set = new Set(sel.get(g.id));
    if (single && checked) set = new Set([c.id]);
    else if (checked) set.add(c.id); else set.delete(c.id);
    if (set.size > g.max) { ui.toast('Chọn tối đa ' + g.max + ' mục'); return; }
    setSel(new Map(sel).set(g.id, set)); if (bad === g.id) setBad(null);
  };
  const add = () => {
    const b = it.option_groups.find(g => sel.get(g.id).size < g.min);
    if (b) { setBad(b.id); refs.current[b.id]?.scrollIntoView({ block: 'center' }); return; }
    const choices = []; it.option_groups.forEach(g => g.choices.forEach(c => { if (sel.get(g.id).has(c.id)) choices.push({ id: c.id, name: c.name, price: c.price, group: g.title }); }));
    const line = { itemId: it.id, name: it.name, base: it.price, sale: it.sale ? it.sale.id : null, choices, qty, note: note.trim() };
    if (edit) { replaceLine(edit.index, line); closeSheet(); ui.toast('Đã sửa ' + it.name); setTimeout(openCart, 0); return; }
    addLine(line);
    closeSheet(); ui.toast('Đã thêm ' + qty + ' ' + it.name);
    if (back) setTimeout(back, 0);
  };
  const group = g => {
    const single = g.max === 1, type = (g.min === 1 && g.max === 1) ? 'radio' : 'checkbox';
    const rule = g.min > 0 ? <span className="og-rule og-rule--req">Bắt buộc</span> : (g.max > 1 ? <span className="og-rule">Chọn tối đa {g.max}</span> : <span className="og-rule">Không bắt buộc</span>);
    const input = c => <input type={type} name={'g' + g.id} value={c.id} checked={sel.get(g.id).has(c.id)} data-single={single ? '1' : undefined} onChange={e => pick(g, c, e.target.checked, single)} />;
    const err = <span className="og-err" hidden={bad !== g.id}>{bad === g.id ? 'Vui lòng chọn: ' + g.title.toLowerCase() : ''}</span>;
    const cls = ex => 'og' + ex + (bad === g.id ? ' og--bad' : '');
    const tiles = g.choices.length > 1 && g.choices.length <= 4 && g.choices.every(c => levelIcon(c.name));
    if (sizeGroup({ option_groups: [g] })) return <fieldset key={g.id} className={cls(' og--tiles og--size')} data-g={g.id} ref={el => { refs.current[g.id] = el; }}><legend>Chọn size</legend><div className="tiles tiles--2">
      {g.choices.map(c => { const L = /l$/i.test(c.name.trim()); return <label key={c.id} className="choice choice--tile">{input(c)}<span className="lv-ico"><Html html={cupIcon(L ? 'L' : 'M')} /></span><span className="choice-name">{c.name}{L ? ' · ly lớn' : ' · ly nhỏ'}</span><span className="choice-price num">{K(it.price + c.price)}{c.price ? ' (+' + K(c.price) + ')' : ''}</span></label>; })}
    </div>{err}</fieldset>;
    const tp = /topping/i.test(g.title);
    return <fieldset key={g.id} className={cls((tiles ? ' og--tiles' : '') + (tp ? ' og--topping' : ''))} data-g={g.id} ref={el => { refs.current[g.id] = el; }}><legend>{tp && <span className="tp-star" aria-hidden="true">★</span>}{g.title} {rule}</legend>{tp && <p className="tp-sub">Thêm topping cho ngon hơn</p>}
      {tiles ? <div className="tiles">{g.choices.map(c => <label key={c.id} className="choice choice--tile">{input(c)}<span className="lv-ico"><Html html={levelIcon(c.name)} /></span><span className="choice-name">{c.name}</span>{c.price ? <span className="choice-price num">+{K(c.price)}</span> : null}</label>)}</div>
        : g.choices.map(c => <label key={c.id} className="choice">{input(c)}<span className="choice-name">{c.name}</span><span className="choice-price num">{c.price ? '+' + K(c.price) : ''}</span></label>)}
      {err}</fieldset>;
  };
  const sub = <>{priceL(it) ? <span className="num">Size M {vnd(it.price)} · Size L {vnd(priceL(it))}</span> : <span className="num">{it.sale && <><s>{vnd(it.orig)}</s> </>}{vnd(it.price)}</span>}{it.sale && <> · <b className="sale-txt">{it.sale.name}</b></>}{it.description ? ' · ' + it.description : ''}</>;
  return (
    <><SheetHead title={it.name} sub={sub} />
      <div className={'sh-body' + (cat ? ' cc-' + cat.color : '')}>
        {it.image_path && <div className="sh-img"><img src={it.image_path} alt={it.name} /></div>}
        {it.option_groups.map(g => group(g))}
        <label className="field" htmlFor="itNote">Ghi chú cho món này <textarea id="itNote" maxLength={120} value={note} onChange={e => setNote(e.target.value)} /></label></div>
      <div className="sh-foot"><div className="stepper" role="group" aria-label="Số lượng"><button type="button" data-q="-1" aria-label="Bớt 1" disabled={qty <= 1} onClick={() => setQty(Math.max(1, qty - 1))}>−</button><output id="itQty" className="num">{qty}</output><button type="button" data-q="1" aria-label="Thêm 1" disabled={qty >= 50} onClick={() => setQty(Math.min(50, qty + 1))}>+</button></div>
        <button className="btn grow" type="button" id="itAdd" onClick={add}>{edit ? 'Lưu thay đổi · ' : 'Thêm vào giỏ · '}<span className="num">{vnd(total())}</span></button></div></>
  );
}
function openItem(id, edit, back) {
  if (!dineMode()) { needDine(() => openItem(id, edit, back)); return; }
  const it = state.items.get(id); if (!it) return;
  openSheet(<ItemSheet key={Date.now()} it={it} edit={edit} back={back} />);
}

/* ---------- Ưu đãi: dải nổi bật đầu menu + bảng chọn món ---------- */
const GIFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-3.5-5-1.2C7 8 9.5 8 12 8zM12 8c1.5-3 5-3.5 5-1.2C17 8 14.5 8 12 8z"/></svg>';
const promoItems = (p, part) => (p.items || []).filter(i => i.part === part && state.items.has(i.menu_item_id));
/* Ưu đãi hiện ở menu nào: menu có ít nhất 1 món của ưu đãi */
function promoUsable(p) {
  const its = p.items || [], has = i => state.items.has(i.menu_item_id);
  const ok = p.kind === 'combo' ? its.some(i => i.part === 'combo') && its.filter(i => i.part === 'combo').every(has)
    : p.kind === 'giam_gia' ? promoItems(p, 'giam').some(i => { const it = state.items.get(i.menu_item_id); return it.sale && it.sale.id === p.id; })
    : p.kind === 'don_tang' ? (p.min_total > 0 || p.need_qty > 0) && (!p.need_qty || promoItems(p, 'mua').length > 0) && (!!p.gift_name || promoItems(p, 'tang').length > 0)
    : promoItems(p, 'mua').length > 0 && (p.gift_same || !!p.gift_name || promoItems(p, 'tang').length > 0);
  if (!ok) return false;
  if (p.kind === 'don_tang') return !dineMode() || !p.dine_types || !p.dine_types.length || p.dine_types.indexOf(dineMode()) >= 0;
  if (GIAO || !state.menu.some(c => (c.station || 'bep') === state.kind)) return true;
  return its.some(i => { const c = state.itemCat.get(i.menu_item_id); return c && (c.station || 'bep') === state.kind; });
}
const promoNormal = p => promoItems(p, 'combo').reduce((s, i) => s + orig(state.items.get(i.menu_item_id)) * i.qty, 0);
const promoBadge = p => p.kind === 'combo' ? 'COMBO' : p.kind === 'giam_gia' ? saleBadge(p) : p.kind === 'don_tang' ? (p.min_total ? 'ĐƠN TỪ ' + K(p.min_total) : 'MUA ' + p.need_qty + ' TẶNG QUÀ') : 'MUA ' + p.buy_qty + ' TẶNG ' + p.get_qty;
const donGift = p => p.gift_name || ((promoItems(p, 'tang')[0] && state.items.get(promoItems(p, 'tang')[0].menu_item_id).name) || 'quà');
const namesOf = list => { const n = list.map(i => state.items.get(i.menu_item_id).name); return n.length > 3 ? n.slice(0, 3).join(', ') + '…' : n.join(', '); };
const reqName = p => { const its = promoItems(p, 'mua'), cats = [...new Set(its.map(i => { const c = state.itemCat.get(i.menu_item_id); return c ? c.name : ''; }).filter(Boolean))]; return cats.length && cats.length <= 3 && its.length > 2 ? cats.join(', ') : namesOf(its); };
const DINE_NAME = { tai_quan: 'ăn tại quán', mang_ve: 'mang về / qua lấy', giao_hang: 'giao hàng' };
const donWhere = p => p.dine_types && p.dine_types.length ? p.dine_types.map(d => DINE_NAME[d]).join(', ') : '';
const cartNeed = p => state.cart.reduce((t, l) => t + (l.promo ? l.units.filter(u => promoItems(p, 'mua').some(i => i.menu_item_id === u.itemId)).length * l.qty : promoItems(p, 'mua').some(i => i.menu_item_id === l.itemId) ? l.qty : 0), 0);
const donApplies = p => !p.dine_types || !p.dine_types.length || p.dine_types.indexOf(dineMode()) >= 0;
const donMet = p => (!p.min_total || cartTotal() >= p.min_total) && (!p.need_qty || cartNeed(p) >= p.need_qty);
const donPromos = () => state.promos.filter(p => p.kind === 'don_tang' && promoUsable(p) && donApplies(p)).sort((a, b) => (a.min_total || 0) - (b.min_total || 0));
const giftOut = p => p.kind === 'mua_tang' && !p.gift_same && p.gift_name ? p.gift_name : null;
const leftText = (p, unit) => p.left != null ? 'Còn ' + p.left + ' ' + (unit || 'suất') + (p.limit_per === 'tong' ? '' : ' hôm nay') : '';
function promoDesc(p) {
  if (p.description) return p.description;
  if (p.kind === 'combo') return promoItems(p, 'combo').map(i => i.qty + ' ' + state.items.get(i.menu_item_id).name).join(' + ');
  if (p.kind === 'don_tang') return (p.need_qty ? 'Mua ' + p.need_qty + ' ' + reqName(p) : 'Đơn') + (p.min_total ? ' từ ' + K(p.min_total) : '') + ' được tặng ' + (p.get_qty > 1 ? p.get_qty + ' ' : '') + donGift(p) + (donWhere(p) ? ' · ' + donWhere(p) : '');
  if (p.kind === 'giam_gia') { const n = promoItems(p, 'giam').length; return n + ' món: ' + namesOf(promoItems(p, 'giam')); }
  return 'Mua ' + p.buy_qty + ': ' + namesOf(promoItems(p, 'mua')) + ' · Tặng ' + p.get_qty + (p.gift_same ? ' món giống hệt' : ': ' + (giftOut(p) ? p.gift_name : namesOf(promoItems(p, 'tang'))));
}
function Promos() {
  const list = state.promos.filter(promoUsable);
  const hidden = !(list.length && state.view === 'menu');
  if (hidden) return <section className="wrap promos" id="promos" hidden aria-label="Ưu đãi đang có"></section>;
  const open = p => { if (p.kind === 'giam_gia') openSale(p); else openPromo(p.id); };
  return (
    <section className="wrap promos" id="promos" aria-label="Ưu đãi đang có"><h2 className="pr-head"><Html html={GIFT} />Ưu đãi đang có{list.length > 1 && <small>Vuốt ngang xem thêm ›</small>}</h2><div className="pr-list">{list.map(p => {
      const normal = p.kind === 'combo' ? promoNormal(p) : 0, when = promoWhen(p, true);
      if (p.kind === 'don_tang') return <div key={p.id} className="pr-card"><span className="pr-badge pr-badge--gift">{promoBadge(p)}</span><span className="pr-name">{p.name}</span><span className="pr-desc">{promoDesc(p)}</span>
        <span className="pr-foot"><span className="pr-price"><b>Tặng {p.get_qty > 1 ? p.get_qty + ' ' : ''}{donGift(p)}</b></span>{when && <span className="pr-when">{when}</span>}{p.left != null && <span className="pr-left">{leftText(p, 'suất')}</span>}<span className="pr-auto">Tự thêm khi đủ mức</span></span></div>;
      return <button key={p.id} className="pr-card" type="button" data-promo={p.id} onClick={() => open(p)}>
        <span className={'pr-badge' + (p.kind === 'combo' ? '' : p.kind === 'giam_gia' ? ' pr-badge--sale' : ' pr-badge--gift')}>{promoBadge(p)}</span>
        <span className="pr-name">{p.name}</span><span className="pr-desc">{promoDesc(p)}</span>
        <span className="pr-foot"><span className="pr-price">{p.kind === 'combo' ? <><b className="num">{K(p.price)}</b>{normal > p.price && <s className="num">{K(normal)}</s>}</> : p.kind === 'giam_gia' ? <b>{p.sale_mode === 'dong_gia' ? 'Chỉ ' + K(p.sale_value) : p.sale_mode === 'phan_tram' ? 'Giảm ' + p.sale_value + '%' : 'Bớt ' + K(p.sale_value)}</b> : <b>Tặng {p.get_qty}</b>}</span>
          {when && <span className="pr-when">{when}</span>}{p.left != null && <span className="pr-left">{leftText(p, p.kind === 'giam_gia' ? 'ly' : 'suất')}</span>}<span className="pr-go">Chọn ngay ›</span></span></button>;
    })}</div></section>
  );
}
/* Ưu đãi giảm giá: danh sách món đang giảm, bấm món là mở món như bình thường */
function SaleSheet({ p }) {
  useVer();
  const its = promoItems(p, 'giam').map(i => state.items.get(i.menu_item_id)).filter(it => it.sale && it.sale.id === p.id);
  const when = promoWhen(p, false);
  const n = its.reduce((t, it) => t + countInCart(it.id), 0);
  const reopen = () => openSale(p);
  const sub = (p.description || (p.left != null ? 'Giá đã giảm' : 'Chọn bao nhiêu món cũng được, giá đã giảm')) + (p.left != null ? ' · ' + leftText(p, 'ly') : '') + (when ? ' · ' + when : '');
  return (
    <><SheetHead title={<><span className="pp pp--sale">{saleBadge(p)}</span> {p.name}</>} sub={sub} />
      <div className="sh-body"><ul className="sale-list" id="saleList">{its.map(it => { const c = countInCart(it.id); return (
        <li key={it.id}><div className={'sale-it' + (c ? ' sale-it--on' : '')}><button type="button" className="sale-main" onClick={() => { closeSheet(); setTimeout(() => openItem(it.id, null, reopen), 0); }}><span className="grow">{it.name}{c ? <> <span className="sale-n num">{c} trong giỏ</span></> : null}</span><s className="num">{K(it.orig)}</s><b className="num">{K(it.price)}</b></button>
          <button type="button" className="btn btn-line btn-sm" onClick={() => { closeSheet(); setTimeout(() => openItem(it.id, null, reopen), 0); }}>Tuỳ chọn</button><button type="button" className="sale-add" aria-label={'Thêm 1 ' + it.name} onClick={() => quickAdd(it.id, reopen)}>+</button></div></li>); })}</ul>
        <p className="small muted">Bấm <b>+</b> để thêm nhanh (đường, đá mặc định), bấm <b>Tuỳ chọn</b> để chọn size, topping, đường, đá. Topping, size L cộng thêm như bình thường.</p></div>
      <div className="sh-foot"><button className="btn btn-block" type="button" id="saleDone" onClick={() => { closeSheet(); if (n) setTimeout(openCart, 0); }}>{n ? 'Xong · xem giỏ (' + n + ' món đồng giá)' : 'Xong'}</button></div></>
  );
}
function openSale(p) {
  if (!dineMode()) { needDine(() => openSale(p)); return; }
  openSheet(<SaleSheet p={p} />);
}
/* Combo / mua X tặng Y: mỗi "phần" là 1 món, chọn món (nếu được chọn), tuỳ chọn, ghi chú */
function PromoSheet({ p, edit }) {
  const free = part => part !== 'mua';
  const defaults = it => new Map(it.option_groups.map(g => [g.id, new Set(g.choices.filter(c => c.default && !(c.price > 0 && p.option_mode === 'khong_phi')).map(c => c.id))]));
  const [units, setUnits] = useState(() => {
    const us = [];
    if (p.kind === 'combo') promoItems(p, 'combo').forEach(i => { for (let k = 0; k < i.qty; k++) us.push({ part: 'combo', pick: [i.menu_item_id], itemId: i.menu_item_id }); });
    else {
      const buy = promoItems(p, 'mua').map(i => i.menu_item_id);
      for (let k = 0; k < p.buy_qty; k++) us.push({ part: 'mua', pick: buy, itemId: buy[0] });
      const gift = promoItems(p, 'tang').map(i => i.menu_item_id);
      if (!giftOut(p)) for (let k = 0; k < p.get_qty; k++) us.push({ part: 'tang', pick: gift, itemId: p.gift_same ? buy[0] : gift[0] });
    }
    us.forEach(u => { u.sel = defaults(state.items.get(u.itemId)); u.note = ''; });
    syncGifts(us);
    if (edit) {
      us.forEach((u, i) => { const eu = edit.line.units[i]; if (!eu || u.part !== eu.part || u.pick.indexOf(eu.itemId) < 0 || !state.items.has(eu.itemId)) return; u.itemId = eu.itemId; const ids = new Set(eu.choices.map(c => c.id)); u.sel = new Map(state.items.get(eu.itemId).option_groups.map(g => [g.id, new Set(g.choices.filter(c => ids.has(c.id)).map(c => c.id))])); u.note = eu.note || ''; });
      syncGifts(us);
    }
    return us;
  });
  // Tặng đúng món khách mua: món tặng chọn trong các món đã chọn ở phần mua
  function syncGifts(us) { if (!p.gift_same) return; const can = [...new Set(us.filter(u => u.part === 'mua').map(u => u.itemId))]; us.filter(u => u.part === 'tang').forEach((u, k) => { u.pick = can; const want = can[Math.min(k, can.length - 1)]; if (can.indexOf(u.itemId) < 0 || (can.length === 1 && u.itemId !== want)) { u.itemId = want; u.sel = defaults(state.items.get(want)); } }); }
  const [qty, setQty] = useState(edit ? edit.line.qty : 1);
  const [msg, setMsg] = useState(''), [bad, setBad] = useState(null);
  const update = f => { const us = units.map(u => Object.assign({}, u, { sel: new Map([...u.sel].map(([k, v]) => [k, new Set(v)])) })); f(us); setUnits(us); };
  const choicesOf = u => { const it = state.items.get(u.itemId), out = []; it.option_groups.forEach(g => g.choices.forEach(c => { if (u.sel.get(g.id).has(c.id)) out.push({ id: c.id, name: c.name, price: c.price, group: g.title }); })); return out; };
  const asUnits = () => units.map(u => ({ part: u.part, base: orig(state.items.get(u.itemId)), extra: extraOf(choicesOf(u)) }));
  const total = promoPrices(p, asUnits()).reduce((s, x) => s + x, 0) * qty;
  const normal = asUnits().reduce((s, u) => s + u.base + u.extra, 0) * qty;
  const label = u => {
    const same = units.filter(x => x.part === u.part), n = same.indexOf(u) + 1;
    if (u.part === 'combo') { const k = units.filter(x => x.itemId === u.itemId); return k.length > 1 ? 'Phần ' + (k.indexOf(u) + 1) + '/' + k.length : ''; }
    return (u.part === 'mua' ? 'Món mua' : 'Món tặng') + (same.length > 1 ? ' ' + n + '/' + same.length : '');
  };
  const maxQty = Math.min(20, p.left != null ? p.left : 20);
  const when = promoWhen(p, false);
  const add = () => {
    setMsg(''); setBad(null);
    for (let i = 0; i < units.length; i++) {
      const u = units[i], b = state.items.get(u.itemId).option_groups.find(g => u.sel.get(g.id).size < g.min);
      if (b) { setBad(i + ':' + b.id); setMsg('Chọn "' + b.title.toLowerCase() + '" cho ' + state.items.get(u.itemId).name); setTimeout(() => document.querySelector('.pu-og.bad')?.scrollIntoView({ block: 'center' }), 0); return; }
    }
    (edit ? l => { replaceLine(edit.index, l); setTimeout(openCart, 0); } : addLine)({ promo: p.id, p: { kind: p.kind, price: p.price, option_mode: p.option_mode, gift_name: giftOut(p), get_qty: p.get_qty }, name: p.name, qty,
      units: units.map(u => ({ part: u.part, itemId: u.itemId, name: state.items.get(u.itemId).name, base: orig(state.items.get(u.itemId)), choices: choicesOf(u), note: u.note.trim() })) });
    closeSheet(); ui.toast(edit ? 'Đã sửa ' + p.name : 'Đã thêm ' + (qty > 1 ? qty + ' phần ' : '') + p.name);
  };
  return (
    <><SheetHead title={<><span className={'pp' + (p.kind === 'combo' ? '' : ' pp--tang')}>{promoBadge(p)}</span> {p.name}</>} sub={promoDesc(p) + (when ? ' · ' + when : '')} />
      <div className="sh-body">
        {p.kind !== 'combo' && <p className="pr-rule">Chọn {p.buy_qty} món mua, được tặng {giftOut(p) ? p.get_qty + ' ' + p.gift_name : p.get_qty + ' món' + (p.gift_same ? ' giống món bạn mua' : '')}.{p.option_mode === 'khong_phi' ? ' Món tặng không kèm tuỳ chọn có phí.' : p.option_mode === 'mien_phi' ? ' Tuỳ chọn của món tặng được miễn phí.' : ''}</p>}
        {p.kind === 'combo' && p.option_mode !== 'cong_them' && <p className="pr-rule">{p.option_mode === 'mien_phi' ? 'Topping, upsize trong combo được miễn phí.' : 'Combo không kèm topping, upsize có phí.'}</p>}
        {p.left != null && <p className="pr-rule">{leftText(p)}.</p>}
        <div id="puList" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{units.map((u, i) => {
          const it = state.items.get(u.itemId);
          return (
            <section key={i} className={'pu' + (u.part === 'tang' ? ' pu--tang' : '')} data-unit={i}>
              <div className="pu-head">{u.part === 'tang' ? <span className="pu-tag pu-tag--tang">TẶNG</span> : u.part === 'mua' ? <span className="pu-tag">MUA</span> : null}
                {u.pick.length > 1 ? <b>{label(u)}</b> : <><b>{it.name}</b>{label(u) ? <> <span className="small muted">{label(u)}</span></> : null}</>}
                <span className="num">{u.part === 'tang' ? <><s>{K(orig(it))}</s> 0đ</> : K(orig(it))}</span></div>
              {u.pick.length > 1 && <select aria-label="Chọn món" value={u.itemId} onChange={e => update(us => { const x = us[i]; x.itemId = e.target.value; x.sel = defaults(state.items.get(x.itemId)); if (x.part === 'mua') syncGifts(us); })}>{u.pick.map(mid => { const m = state.items.get(mid); return <option key={mid} value={mid}>{m.name} · {K(orig(m))}</option>; })}</select>}
              {it.option_groups.map(g => {
                const chs = g.choices.filter(c => !(free(u.part) && p.option_mode === 'khong_phi' && c.price > 0)); if (!chs.length) return null;
                const type = g.max === 1 ? 'radio' : 'checkbox', tp = /topping/i.test(g.title);
                const toggle = (c, checked) => update(us => { const s = us[i].sel.get(g.id); if (type === 'radio') s.clear(); if (checked) s.add(c.id); else s.delete(c.id); if (s.size > g.max) { s.delete(c.id); ui.toast('Chọn tối đa ' + g.max + ' mục'); } });
                return <fieldset key={g.id} className={'pu-og' + (bad === i + ':' + g.id ? ' bad' : '')} data-u={i} data-g={g.id}><legend>{g.title}{g.min > 0 && <> <span className="req">*</span></>}</legend>
                  {chs.map(c => <label key={c.id} className={'pu-ch' + (tp ? ' pu-ch--tp' : '')}><input type={type} name={'u' + i + 'g' + g.id} value={c.id} checked={u.sel.get(g.id).has(c.id)} onChange={e => toggle(c, e.target.checked)} />{c.name}
                    {c.price ? <> <small className="num">{free(u.part) && p.option_mode === 'mien_phi' ? 'miễn phí' : '+' + K(c.price)}</small></> : null}</label>)}</fieldset>;
              })}
              <input type="text" maxLength={120} placeholder="Ghi chú cho món này (không bắt buộc)" value={u.note} onChange={e => update(us => { us[i].note = e.target.value; })} /></section>
          );
        })}
          {giftOut(p) && <section className="pu pu--tang"><div className="pu-head"><span className="pu-tag pu-tag--tang">TẶNG</span><b>{p.gift_name}</b> <span className="small muted">× {p.get_qty * qty}</span><span className="num">0đ</span></div></section>}</div>
        {msg && <p className="msg" id="puMsg">{msg}</p>}</div>
      <div className="sh-foot"><div className="stepper" role="group" aria-label="Số phần ưu đãi"><button type="button" aria-label="Bớt 1" disabled={qty <= 1} onClick={() => setQty(Math.max(1, qty - 1))}>−</button><output id="puQty" className="num">{qty}</output><button type="button" aria-label="Thêm 1" disabled={qty >= maxQty} onClick={() => setQty(Math.min(maxQty, qty + 1))}>+</button></div>
        <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><button className="btn btn-block" type="button" id="puAdd" onClick={add}>{edit ? 'Lưu thay đổi · ' : 'Thêm ưu đãi · '}<span className="num">{vnd(total)}</span></button><p className="pr-save" id="puSave">{normal > total ? 'Giá thường ' + vnd(normal) + ' · tiết kiệm ' + vnd(normal - total) : ''}</p></div></div></>
  );
}
function openPromo(id, edit) {
  if (GIAO && state.staff === false) { ui.toast('Cần đăng nhập ở trang Quản lý trước'); return; }
  if (!dineMode()) { needDine(() => openPromo(id, edit)); return; }
  const p = state.promos.find(x => x.id === id); if (!p || !promoUsable(p)) { ui.toast('Ưu đãi này vừa hết'); return; }
  openSheet(<PromoSheet key={Date.now()} p={p} edit={edit} />);
}

/* ---------- Giỏ hàng ---------- */
const cartCount = () => state.cart.reduce((s, l) => s + l.qty * (l.promo ? l.units.length : 1), 0);
const cartTotal = () => state.cart.reduce((s, l) => s + unitPrice(l) * l.qty, 0);
function CartBar() {
  const n = cartCount();
  return <div className="cartbar" id="cartBar" hidden={!(n > 0 && state.view === 'menu')}><button className="btn" id="cartBtn" type="button" onClick={openCart}><span>Xem giỏ · <span className="num">{n}</span> món</span><b className="num">{vnd(cartTotal())}</b></button></div>;
}
const lineSub = l => l.choices.map(c => c.name + (c.price ? ' +' + K(c.price) : '')).concat(l.note ? ['Ghi chú: ' + l.note] : []).join(' · ');
const PartTag = ({ part }) => part === 'mua' ? <><span className="pp pp--mua">MUA</span> </> : part === 'tang' ? <><span className="pp pp--tang">TẶNG</span> </> : null;
function PromoSub({ l }) {
  const rows = l.units.map((u, k) => <span key={k}><PartTag part={u.part} />{u.name}{u.choices.length || u.note ? ' (' + u.choices.map(c => c.name).concat(u.note ? [u.note] : []).join(', ') + ')' : ''}</span>);
  if (l.p && l.p.gift_name) rows.push(<span key="g"><PartTag part="tang" />{l.p.gift_name} × {l.p.get_qty || 1}</span>);
  return rows.map((r, k) => [k ? <br key={'b' + k} /> : null, r]);
}
/* Gửi lên máy chủ: món thường và phần ưu đãi */
const orderPayload = () => state.cart.map(l => l.promo
  ? { promo_id: l.promo, qty: l.qty, parts: l.units.map(u => ({ part: u.part, menu_item_id: u.itemId, choice_ids: u.choices.map(c => c.id), note: u.note || null })) }
  : Object.assign({ menu_item_id: l.itemId, qty: l.qty, note: l.note || null, choice_ids: l.choices.map(c => c.id) }, l.sale ? { sale_id: l.sale } : {}));
function Lines() {
  if (!state.cart.length) return <p className="empty">Giỏ đang trống.</p>;
  const step = (i, d) => { const l = state.cart[i]; l.qty += d; if (l.qty <= 0) state.cart.splice(i, 1); saveCart(); render(); };
  const n = donPromos().find(p => !donMet(p));
  return <>
    <ul className="lines">{state.cart.map((l, i) => (
      <li key={i + lineKey(l)} className={'line' + (l.promo ? ' line--promo' : '')}><span className="line-name">{l.promo ? <span className="line-promo"><span className="pp">{l.p.kind === 'combo' ? 'COMBO' : 'ƯU ĐÃI'}</span>{l.name}</span> : l.name}</span><span className="line-price num">{vnd(unitPrice(l) * l.qty)}</span>
        <span className="line-sub">{l.promo ? <PromoSub l={l} /> : lineSub(l)}</span>
        <div className="line-act"><button className="line-edit" type="button" aria-label={'Sửa ' + l.name + ': topping, tuỳ chọn'} onClick={() => editLine(i)}>Sửa</button><div className="stepper stepper--sm" role="group" aria-label={'Số lượng ' + l.name}><button type="button" aria-label="Bớt 1" onClick={() => step(i, -1)}>−</button><output className="num">{l.qty}</output><button type="button" aria-label="Thêm 1" disabled={l.qty >= 50} onClick={() => step(i, 1)}>+</button></div></div></li>
    ))}
      {donPromos().filter(donMet).map(p => <li key={p.id} className="line line--promo"><span className="line-name"><span className="line-promo"><span className="pp pp--tang">TẶNG</span>{donGift(p)}{p.get_qty > 1 ? ' × ' + p.get_qty : ''}</span></span><span className="line-price num">0đ</span><span className="line-sub">{p.name} · quán tự thêm vào đơn</span></li>)}</ul>
    {n && <p className="gift-hint">{n.need_qty && cartNeed(n) < n.need_qty ? <>Mua thêm <b className="num">{n.need_qty - cartNeed(n)}</b> món {reqName(n)}</> : <>Mua thêm <b className="num">{vnd(n.min_total - cartTotal())}</b></>} để được tặng <b>{donGift(n)}</b> 🎁</p>}
  </>;
}
/* Số điện thoại Việt Nam: 10 số bắt đầu bằng 0 (chấp nhận +84, dấu cách, chấm, gạch) */
const phoneOk = v => /^0\d{9}$/.test(String(v || '').replace(/[\s.\-()]/g, '').replace(/^\+?84/, '0'));
function CartSheet() {
  useVer();
  const [msg, setMsg] = useState(phienLeft() <= 0 ? PHIEN_HET : ''), [bad, setBad] = useState(''), [dup, setDup] = useState(null), [busy, setBusy] = useState(false);
  const qRef = useRef(null), nRef = useRef(null), pRef = useRef(null), msgRef = useRef(null);
  const show = (m, field, ref) => { setMsg(m); setBad(field || ''); setTimeout(() => { if (ref && ref.current) ref.current.focus(); msgRef.current?.scrollIntoView({ block: 'nearest' }); }, 0); };
  const send = async confirm => {
    setMsg(''); setDup(null); setBad('');
    if (phienLeft() <= 0) { show(PHIEN_HET); return; }
    if (!dineMode()) { show('Bạn ăn tại quán hay mang về? Chọn một ô ở trên nhé.', 'dine'); return; }
    if (!isTake() && !(queueNum() > 0)) { show(ERR.MISSING_QUEUE_NUMBER, 'queue', qRef); return; }
    if (!state.info.name.trim()) { show(ERR.MISSING_NAME, 'name', nRef); return; }
    if (!phoneOk(state.info.phone)) { show(state.info.phone.trim() ? 'Số điện thoại chưa đúng. Nhập 10 số, ví dụ 09xx xxx xxx.' : 'Bạn chưa nhập số điện thoại. Quán cần số để liên hệ khi có việc.', 'phone', pRef); return; }
    const mine = !isTake() && state.orders.some(o => !o.paid && o.dine !== 'mang_ve' && o.queue === queueNum());
    setBusy(true);
    try {
      const res = await api.placeOrder({
        queue: isTake() ? null : queueNum(), dine: dineMode(), name: state.info.name.trim(), phone: state.info.phone.trim(), note: state.cartNote.trim(), confirm: confirm || mine || !!BAN, // cùng bàn nhiều người gọi riêng là bình thường
        items: orderPayload()
      });
      state.orders.unshift({ token: res.access_token, id: res.order_id, queue: isTake() ? null : queueNum(), dine: dineMode(), name: state.info.name.trim(), paid: false }); saveOrders();
      state.cart = []; state.cartNote = ''; saveCart();
      state.editingInfo = false;
      closeSheet(); showView('status'); startPolling();
      // Khách tự đặt: mời thanh toán chuyển khoản ngay bằng QR của đơn (có mã BN… để máy tự nhận tiền)
      if (BN.FEATURES.vietqr && res.order_id && res.total > 0) payNowSheet({ id: res.order_id, token: res.access_token }, { dine_type: dineMode(), queue_number: isTake() ? null : queueNum(), customer_name: state.info.name.trim(), total: res.total });
      else ui.toast('Đã gửi đơn cho quán');
    } catch (e) {
      setBusy(false);
      if (e.code === 'DUPLICATE_QUEUE') { setDup(e.hint || 'Số này đang có đơn chưa thanh toán'); return; }
      show(errText(e));
      if (/^(ITEM_UNAVAILABLE|OPTION_INVALID|PROMO_)/.test(e.code || '')) {
        const gone = await loadMenu();
        if (gone && gone.length) setMsg('Món vừa hết, đã bỏ khỏi giỏ: ' + gone.join(', ') + '. Kiểm tra lại giỏ rồi gửi.');
      }
    }
  };
  return (
    <><SheetHead title="Giỏ của bạn" sub="Kiểm tra món rồi gửi cho quán." />
      <div className="sh-body"><div id="cLines"><Lines /></div>
        <div className="sum"><span>Tổng cộng</span><b className="num" id="cTotal">{vnd(cartTotal())}</b></div>
        <div className="who">
          <div className={'dine-seg wide' + (bad === 'dine' ? ' invalid' : '')} role="radiogroup" aria-label="Ăn tại quán hay mang về" id="fDine">
            <label><input type="radio" name="cDine" value="tai_quan" checked={dineMode() === 'tai_quan'} onChange={() => { setDine('tai_quan'); setMsg(''); setDup(null); setBad(''); }} /><Html html={ICON.bowl} />Ăn tại quán</label>
            <label><input type="radio" name="cDine" value="mang_ve" checked={isTake()} onChange={() => { setDine('mang_ve'); setMsg(''); setDup(null); setBad(''); }} /><Html html={ICON_BAG} />Mang về</label></div>
          <label className={'field' + (bad === 'queue' ? ' invalid' : '')} id="fQueue" htmlFor="cQueue" hidden={isTake()}>{BAN ? 'Bàn' : 'Số trên thẻ'} <span className="req">*</span><input id="cQueue" ref={qRef} className="num" inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="00" defaultValue={BAN || state.info.queue} readOnly={!!BAN}
            onInput={e => { e.target.value = e.target.value.replace(/\D/g, ''); state.info.queue = e.target.value; saveInfo(); setBad(''); setDup(null); render(); }} /></label>
          <label className={'field' + (bad === 'name' ? ' invalid' : '')} id="fName" htmlFor="cName">Tên của bạn <span className="req">*</span><input id="cName" ref={nRef} maxLength={40} autoComplete="given-name" placeholder="Để quán gọi khi cần" defaultValue={state.info.name} onInput={e => { state.info.name = e.target.value; saveInfo(); if (bad === 'name') setBad(''); render(); }} /></label>
          <label className={'field wide' + (bad === 'phone' ? ' invalid' : '')} id="fPhone" htmlFor="cPhone">Số điện thoại <span className="req">*</span><input id="cPhone" ref={pRef} type="tel" inputMode="tel" maxLength={15} autoComplete="tel" placeholder="Để quán liên hệ khi có sự cố" defaultValue={state.info.phone} onInput={e => { state.info.phone = e.target.value; saveInfo(); if (bad === 'phone') setBad(''); }} /></label>
          <label className="field wide" htmlFor="cNote">Ghi chú cho quán (không bắt buộc)<textarea id="cNote" maxLength={300} defaultValue={state.cartNote} onInput={e => { state.cartNote = e.target.value; saveCart(); }} /></label>
          <p className="msg wide" id="cMsg" ref={msgRef} hidden={!msg}>{msg}</p>
          <div className="dup wide" id="cDup" hidden={!dup}>{dup && <><p><b>{dup}.</b> Nếu bạn ngồi cùng hoặc gọi thêm món, bấm “Vẫn gửi”. Nếu nhập nhầm, hãy sửa lại số.</p>
            <div className="row"><button className="btn btn-sm" type="button" id="dupYes" onClick={() => send(true)}>Vẫn gửi</button><button className="btn btn-sm btn-line" type="button" id="dupNo" onClick={() => { setDup(null); qRef.current?.focus(); qRef.current?.select(); }}>Sửa số</button></div></>}</div></div></div>
      <div className="sh-foot"><CartPhien /><button className="btn btn-block" type="button" id="cSend" disabled={busy || !state.cart.length} onClick={() => send(false)}>{busy ? 'Đang gửi…' : 'Gửi đơn cho quán'}</button></div></>
  );
}
function openCart() { openSheet(GIAO ? <GiaoCartSheet /> : <CartSheet />); }
/* ---------- Đơn giao hàng (chủ quán / nhân viên tạo) ---------- */
const pad2 = n => String(n).padStart(2, '0');
function defaultDeliverTime() { const d = new Date(Date.now() + 30 * 60e3); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function deliverIso(hhmm) {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm || '')) return null;
  const [h, m] = hhmm.split(':').map(Number), d = new Date(); d.setHours(h, m, 0, 0);
  if (d < Date.now() - 3 * 3600e3) d.setDate(d.getDate() + 1); // giờ đã qua lâu: hiểu là ngày mai
  return d.toISOString();
}
function GiaoCartSheet() {
  useVer();
  const g = state.giao; if (!g.time) g.time = defaultDeliverTime();
  const [msg, setMsg] = useState(''), [bad, setBad] = useState(''), [busy, setBusy] = useState(false);
  const nRef = useRef(null), aRef = useRef(null);
  const lay = isLay();
  const send = async () => {
    setMsg(''); setBad('');
    if (!g.name.trim()) { setBad('name'); setMsg('Nhập tên khách.'); nRef.current?.focus(); return; }
    if (!lay && !g.address.trim()) { setBad('addr'); setMsg(ERR.MISSING_ADDRESS); aRef.current?.focus(); return; }
    setBusy(true);
    try {
      const res = await api.placeOrder({ queue: null, dine: lay ? 'mang_ve' : 'giao_hang', name: g.name.trim(), phone: g.phone.trim(), address: lay ? null : g.address.trim(), deliverAt: lay ? null : deliverIso(g.time), note: state.cartNote.trim(), items: orderPayload() });
      let paidMsg = '';
      if (g.paid) { try { await api.completePayment(res.order_id, 'chuyen_khoan'); paidMsg = ', đã ghi nhận chuyển khoản'; } catch (e) { paidMsg = '. Chưa ghi nhận được tiền, thu ở màn hình bếp'; } }
      const who = g.name.trim();
      state.cart = []; state.cartNote = ''; saveCart();
      state.giao = { name: '', phone: '', address: '', time: '', paid: false, kind: state.giao.kind };
      closeSheet(); render(); ui.toast((lay ? 'Đã tạo đơn qua lấy cho ' : 'Đã tạo đơn đi ship cho ') + who + ' · ' + vnd(res.total) + paidMsg);
    } catch (e) {
      setBusy(false); setMsg(errText(e));
      if (/^(ITEM_UNAVAILABLE|OPTION_INVALID|PROMO_)/.test(e.code || '')) loadMenu();
    }
  };
  return (
    <><SheetHead title="Đơn giao hàng" sub="Kiểm tra món, nhập thông tin khách rồi gửi cho bếp và quầy pha chế." />
      <div className="sh-body"><div className="seg2" role="group" aria-label="Loại đơn"><button type="button" aria-pressed={lay} onClick={() => { setGiaoKind('lay'); setMsg(''); }}>Qua lấy</button><button type="button" aria-pressed={!lay} onClick={() => { setGiaoKind('ship'); setMsg(''); }}>Đơn đi ship</button></div>
        <div id="cLines"><Lines /></div>
        <div className="sum"><span>Tổng cộng</span><b className="num" id="cTotal">{vnd(cartTotal())}</b></div>
        <div className="who">
          <label className={'field' + (bad === 'name' ? ' invalid' : '')} id="fName" htmlFor="gName">Tên khách <span className="req">*</span><input id="gName" ref={nRef} maxLength={40} defaultValue={g.name} onInput={e => { g.name = e.target.value; if (bad === 'name') setBad(''); }} /></label>
          <label className="field" htmlFor="gPhone">Số điện thoại<input id="gPhone" inputMode="tel" maxLength={15} defaultValue={g.phone} onInput={e => { g.phone = e.target.value; }} /></label>
          <label className={'field wide' + (bad === 'addr' ? ' invalid' : '')} id="fAddr" htmlFor="gAddr" hidden={lay}>Địa chỉ giao <span className="req">*</span><textarea id="gAddr" ref={aRef} maxLength={300} rows={2} defaultValue={g.address} onInput={e => { g.address = e.target.value; if (bad === 'addr') setBad(''); }} /></label>
          <label className="field" id="fTime" htmlFor="gTime" hidden={lay}>Giờ giao<input id="gTime" type="time" defaultValue={g.time} onInput={e => { g.time = e.target.value; }} /></label>
          <label className="field" style={{ justifyContent: 'flex-end' }}><span className="row" style={{ gap: 8, alignItems: 'center' }}><input type="checkbox" id="gPaid" defaultChecked={g.paid} onChange={e => { g.paid = e.target.checked; }} style={{ width: 20, height: 20, accentColor: 'var(--red)' }} /> Khách đã chuyển khoản</span></label>
          <label className="field wide" htmlFor="cNote">Ghi chú<textarea id="cNote" maxLength={300} defaultValue={state.cartNote} onInput={e => { state.cartNote = e.target.value; saveCart(); }} /></label>
          <p className="msg wide" id="cMsg" hidden={!msg}>{msg}</p></div></div>
      <div className="sh-foot"><button className="btn btn-block" type="button" id="cSend" disabled={busy || !state.cart.length} onClick={send}>{busy ? 'Đang tạo…' : lay ? 'Tạo đơn qua lấy' : 'Tạo đơn đi ship'}</button></div></>
  );
}

/* ---------- Trạng thái đơn ---------- */
const activeOrders = () => state.orders.filter(o => !o.paid && !o.cancelled);
const PART = { bep: 'Bếp', pha_che: 'Quầy pha chế' };
function partText(p) {
  if (p.status === 'cho_nhan') return 'Chờ nhận';
  if (p.status === 'da_ra_mon') return 'Đã xong';
  const left = p.estimated_ready_at ? Math.ceil((new Date(p.estimated_ready_at) - Date.now()) / 60000) : null;
  return left != null && left > 0 ? 'Đang làm · còn ' + left + "'" : 'Sắp xong';
}
function statusText(d) {
  const who = (d.stations || []).length === 1 && d.stations[0].station === 'pha_che' ? 'Quầy pha chế' : (d.stations || []).length > 1 ? 'Quán' : 'Bếp';
  if (d.status === 'cho_nhan') return { title: 'Đang chờ ' + (who === 'Quán' ? 'quán' : who.toLowerCase()) + ' nhận đơn', sub: d.orders_ahead > 0 ? <p className="eta"><b className="num">{d.orders_ahead}</b>đơn trước bạn</p> : <p>Đơn sẽ được nhận trong giây lát.</p> };
  if (d.status === 'dang_lam') {
    const left = d.estimated_ready_at ? Math.ceil((new Date(d.estimated_ready_at) - Date.now()) / 60000) : null;
    if (left !== null && left > 0) return { title: who + ' đang làm món', sub: <><p className="eta">Còn khoảng <b className="num">{left}</b>phút</p><p>Dự kiến xong lúc <span className="num">{hhmm(d.estimated_ready_at)}</span></p></> };
    return { title: 'Sắp xong rồi', sub: <p>Món đang được hoàn thiện, bạn đợi thêm chút nhé.</p> };
  }
  if (d.dine_type === 'mang_ve') return { title: 'Món đã xong', sub: <p>Mời bạn ra quầy nhận món mang về.</p> };
  return { title: 'Món đã ra', sub: <p>Nhân viên đang mang tới chỗ có thẻ số {d.queue_number}.</p> };
}
const dismiss = o => { state.orders = state.orders.filter(x => x.token !== o.token); saveOrders(); if (!state.orders.length) showView('menu'); else render(); };
/* Chuyển khoản bằng VietQR: đúng số tiền còn phải trả, nội dung giống màn hình quầy */
const qrOpen = new Set(), qrImgs = new Map();
const custQrNote = (o, d) => BN.qrNoteFor({ dine_type: d.dine_type, queue_number: d.queue_number, customer_name: d.customer_name, id: o.id });
function PayQr({ o, d }) {
  if (!BN.FEATURES.vietqr) return null;
  const due = d.total - (d.paid_amount || 0); if (!(due > 0) || !o.id) return null;
  const key = due + '|' + custQrNote(o, d) + '|' + BN.BANK.bin + BN.BANK.account, img = qrImgs.get(key), open = qrOpen.has(o.token);
  if (open && !qrImgs.has(key)) { qrImgs.set(key, null); BN.qrDataUrl(BN.vietQR(due, custQrNote(o, d)), 360).then(u => { qrImgs.set(key, u); render(); }).catch(() => qrImgs.delete(key)); }
  return (
    <details className="oc-qr" data-qr={o.token} open={open} onToggle={e => { if (e.currentTarget.open) { if (!qrOpen.has(o.token)) { qrOpen.add(o.token); render(); } } else qrOpen.delete(o.token); }}><summary>Chuyển khoản bằng mã QR · <span className="num">{vnd(due)}</span></summary>
      <div className="oc-qr-box">{img ? <img src={img} alt={'Mã VietQR chuyển khoản ' + vnd(due)} /> : <p className="loading">Đang tạo mã…</p>}
        <p><b>{BN.BANK.bank}</b> · <b className="num">{BN.BANK.account}</b></p><p className="small muted">Mở app ngân hàng, quét mã: số tiền và nội dung tự điền. Chuyển xong báo nhân viên để xác nhận nhé.</p></div></details>
  );
}
function CallBtn({ o, d }) {
  const [busy, setBusy] = useState(false);
  const call = async () => { setBusy(true); try { await api.callStaff(o.token); ui.toast('Đã gọi nhân viên'); } catch (err) { ui.toast(errText(err)); } poll(); };
  useEffect(() => { setBusy(false); }, [d.has_open_call]);
  return <button className="btn btn-soft btn-block" type="button" disabled={d.has_open_call || busy} onClick={call}>{busy && !d.has_open_call ? 'Đang gọi…' : d.has_open_call ? 'Đã gọi, nhân viên đang tới' : 'Gọi nhân viên'}</button>;
}
function OrderCard({ o }) {
  if (o.cancelled) return <article className="oc oc--huy"><Html html={qboxHtml(o)} /><div><h2>Đơn đã bị huỷ</h2><p>Quán đã huỷ đơn này{o.cancelAt ? ' lúc ' + hhmm(o.cancelAt) : ''}.{o.paidBefore > 0 ? ' Bạn đã trả trước ' + vnd(o.paidBefore) + ', báo nhân viên để được hoàn tiền nhé.' : ' Cần gì bạn gọi nhân viên hoặc đặt lại nhé.'}</p><button className="link" type="button" onClick={() => dismiss(o)}>Ẩn đơn này</button></div></article>;
  if (o.paid) return <article className="oc oc--paid"><Html html={qboxHtml(o)} /><div><h2>Đã thanh toán</h2><p>Cảm ơn bạn, hẹn gặp lại ở Bé Nốc!</p><button className="link" type="button" onClick={() => dismiss(o)}>Ẩn đơn này</button></div></article>;
  const d = state.orderData[o.token];
  if (!d) return <article className="oc"><p className="loading">Đang tải trạng thái đơn {orderLabel(o)}…</p></article>;
  const step = { cho_nhan: 0, dang_lam: 1, da_ra_mon: 2 }[d.status], t = statusText(d), items = d.items || [];
  const count = items.reduce((s, i) => s + i.qty, 0);
  const cs = (state.orderChanges[o.token] || []).filter(c => c.kind === 'sua' && c.staff !== false);
  const ps = d.stations || [];
  return (
    <article className={'oc oc--' + d.status}>
      <div className="oc-top"><Html html={qboxHtml(d)} /><div className="oc-state" aria-live="polite"><h2>{t.title}</h2>{t.sub}</div></div>
      <ol className="steps">{['Chờ nhận', 'Đang làm', 'Ra món'].map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'now' : undefined}>{s}</li>)}</ol>
      {ps.length >= 2 && <ul className="parts">{ps.map(p => { const n = items.filter(i => (i.station || 'bep') === p.station).reduce((s, i) => s + i.qty, 0); return <li key={p.station}><span><b>{PART[p.station]}</b> · {n} món</span><span className={'pst pst-' + p.status}>{partText(p)}</span></li>; })}</ul>}
      {d.paid_amount != null && <p className="oc-paid">{d.paid_amount >= d.total ? 'Đã thanh toán trước ' + vnd(d.paid_amount) : 'Đã trả ' + vnd(d.paid_amount) + ' · còn ' + vnd(d.total - d.paid_amount) + ' do thêm món'}</p>}
      <details className="oc-items"><summary>{count} món · <span className="num">{vnd(d.total)}</span> · {d.customer_name}</summary><ul>
        {items.map((i, k) => [i.promo_group && (k === 0 || items[k - 1].promo_group !== i.promo_group) ? <li key={'p' + k} className="oc-pr">{(i.promo_kind === 'combo' ? '' : 'Ưu đãi · ') + BN.promoTitle(i.promo_kind, i.promo_name)}</li> : null,
          <li key={k}><span><PartTag part={i.promo_part} />{i.qty} × {i.name}</span><span className="num">{vnd(i.price * i.qty)}</span>
            {(i.options && i.options.length) || i.note ? <span className="line-sub">{(i.options || []).map(x => x.choice).concat(i.note ? ['Ghi chú: ' + i.note] : []).join(' · ')}</span> : null}</li>])}
      </ul></details>
      {cs.length > 0 && <div className="oc-chg"><h3>Quán đã sửa đơn</h3><ul>{cs.slice().reverse().map((c, k) => <li key={k} className={Date.now() - new Date(c.at) < 15 * 60000 ? 'new' : undefined}><span>{(c.lines || []).map((x, n) => [n ? <br key={'b' + n} /> : null, x])}</span><small>Lúc {hhmm(c.at)}</small></li>)}</ul></div>}
      {d.note && <p className="oc-note"><b>Ghi chú:</b> {d.note}</p>}<PayQr o={o} d={d} />
      <CallBtn o={o} d={d} /></article>
  );
}
/* Ngay sau khi gửi đơn: mời chuyển khoản bằng QR của đơn. Bỏ qua được (trả tiền mặt / trả sau tại quầy). */
function PayNowSheet({ o, d }) {
  const note = custQrNote(o, d);
  const [url, setUrl] = useState(null), [err, setErr] = useState(false);
  useEffect(() => { BN.qrDataUrl(BN.vietQR(d.total, note), 360).then(setUrl, () => setErr(true)); }, []);
  const save = async () => {
    if (!url) return;
    try {
      const blob = await (await fetch(url)).blob(), file = new File([blob], 'benoc-thanh-toan.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Mã thanh toán Bé Nốc' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = url; a.download = 'benoc-thanh-toan.png'; document.body.appendChild(a); a.click(); a.remove(); ui.toast('Đã lưu ảnh mã');
  };
  const copy = async () => { try { await navigator.clipboard.writeText(BN.qrInfo(note)); ui.toast('Đã chép nội dung chuyển khoản'); } catch (e) { ui.toast(BN.qrInfo(note)); } };
  return (
    <><SheetHead title="Đã gửi đơn · Thanh toán" /><div className="sh-body pay-now">
      <p className="pn-amt">Tổng đơn <b className="num">{vnd(d.total)}</b></p>
      <div className="pn-qr">{url ? <img src={url} alt={'Mã VietQR chuyển khoản ' + vnd(d.total)} /> : err ? <p className="small muted">Chưa tạo được mã. Mở mục Chuyển khoản bằng mã QR trong đơn.</p> : <p className="loading">Đang tạo mã…</p>}</div>
      <p className="small">Mở app ngân hàng → <b>Quét mã</b>. Số tiền và nội dung tự điền, quán tự nhận được tiền. <b>Đừng quét mã dán ở quầy</b> vì mã đó không gắn với đơn của bạn.</p>
      <p className="small muted">Đang dùng chính điện thoại này? Bấm <b>Lưu ảnh mã</b>, rồi trong app ngân hàng chọn quét mã từ ảnh.</p>
      <div className="row pn-act"><button className="btn btn-sm btn-line" type="button" id="pnSave" onClick={save}>Lưu ảnh mã</button><button className="btn btn-sm btn-line" type="button" id="pnCopy" onClick={copy}>Chép nội dung CK</button></div>
      <p className="small muted pn-info">{BN.BANK.bank}{BN.BANK.holder ? ' · ' + BN.BANK.holder : ''} · Nội dung: <b className="num">{BN.qrInfo(note)}</b></p>
      <button className="btn btn-block" type="button" data-close>Đã chuyển khoản xong</button>
      <button className="btn btn-block btn-line" type="button" data-close>Để sau · trả tiền mặt tại quầy</button>
      <p className="small muted" style={{ textAlign: 'center', margin: '6px 0 0' }}>Mã này luôn có lại ở mục <b>Chuyển khoản bằng mã QR</b> trong đơn của bạn.</p></div></>
  );
}
const payNowSheet = (o, d) => openSheet(<PayNowSheet o={o} d={d} />);
function Status() {
  return (
    <div className="wrap" id="statusIn"><div className="st-head"><h1>Đơn của bạn</h1><button className="btn btn-sm" type="button" id="stMore" onClick={() => showView('menu')}>Gọi thêm món</button></div>
      {state.orders.length ? state.orders.map(o => <OrderCard key={o.token} o={o} />) : <p className="empty">Bạn chưa có đơn nào.</p>}
      <p className="st-foot">Trang tự cập nhật. Tắt màn hình rồi mở lại vẫn thấy đơn.</p></div>
  );
}
function Banner() {
  const act = activeOrders();
  if (!act.length || state.view !== 'menu') return <div id="banner"></div>;
  const d = state.orderData[act[0].token];
  const label = !d ? 'Đơn ' + orderLabel(act[0]) : (d.dine_type === 'mang_ve' ? 'Mang về' : 'Số ' + d.queue_number) + ' · ' + ({ cho_nhan: 'Chờ bếp nhận', dang_lam: 'Bếp đang làm', da_ra_mon: 'Món đã ra' }[d.status]);
  return <div id="banner"><button className="banner" type="button" id="toStatus" onClick={() => showView('status')}><span>{label}{act.length > 1 ? ' (+' + (act.length - 1) + ' đơn)' : ''}</span><span>Xem đơn →</span></button></div>;
}
let pollTimer = null, polling = false;
/* Nghe tín hiệu của từng đơn đang mở: bếp/pha chế bấm là khách thấy ngay */
const watchers = new Map();
let pollSoon = null, pollAgain = false;
const pollNow = () => { clearTimeout(pollSoon); pollSoon = setTimeout(poll, 250); };
function syncWatchers() {
  const act = new Set(activeOrders().filter(o => o.id).map(o => o.id));
  act.forEach(id => { if (!watchers.has(id)) { watchers.set(id, null); api.watchOrder(id, pollNow).then(stop => { if (watchers.has(id)) watchers.set(id, stop); else stop(); }).catch(() => watchers.delete(id)); } });
  [...watchers.keys()].forEach(id => { if (!act.has(id)) { const stop = watchers.get(id); watchers.delete(id); if (stop) stop(); } });
}
let lastPoll = 0;
async function poll() {
  if (polling) { pollAgain = true; return; } polling = true; pollAgain = false; lastPoll = Date.now();
  try {
    await Promise.all(activeOrders().map(async o => {
      try {
        const [d, cs] = await Promise.all([api.getMyOrder(o.token), api.getOrderChanges(o.token).catch(() => null)]);
        if (Array.isArray(cs)) {
          state.orderChanges[o.token] = cs;
          const fresh = cs.filter(c => c.kind === 'sua' && c.staff !== false && c.id > (o.seenChg || 0));
          if (fresh.length && o.seenChg != null && d) ui.toast('Quán vừa sửa đơn ' + orderLabel(d) + ': ' + fresh[fresh.length - 1].lines.join(', '));
          o.seenChg = cs.reduce((m, c) => Math.max(m, c.id), o.seenChg || 0);
        }
        if (d === null) {
          const huy = Array.isArray(cs) && cs.find(c => c.kind === 'huy');
          const prev = state.orderData[o.token];
          if (huy) { o.cancelled = true; o.cancelAt = huy.at; o.paidBefore = prev && prev.paid_amount || 0; } else o.paid = true; // không có dấu huỷ = đơn đã thu xong
          delete state.orderData[o.token];
        } else state.orderData[o.token] = d;
      } catch (e) { /* mạng chập chờn: giữ trạng thái cũ */ }
    }));
    saveOrders();
  } finally { polling = false; }
  render(); syncWatchers();
  if (!activeOrders().length) clearInterval(pollTimer);
  if (pollAgain) pollNow();
}
const pollTick = () => { if (DEMO || !BN.RT.ok || Date.now() - lastPoll > 44e3) poll(); }; // kênh realtime đang nối: 45 giây mới hỏi lại 1 lần
function startPolling() { syncWatchers(); clearInterval(pollTimer); poll(); pollTimer = setInterval(pollTick, (DEMO ? 2 : CONFIG.POLL_SECONDS) * 1000); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && activeOrders().length) startPolling(); });
setInterval(() => { if (state.view === 'status') render(); }, 30000);

/* ---------- Toàn trang ---------- */
function App() {
  useVer();
  const v = state.view, m = MENU[state.kind];
  const onSearch = e => { state.search = e.target.value; render(); const l = document.getElementById('menuList'); if (l && l.getBoundingClientRect().top < 0) window.scrollTo({ top: l.offsetTop - 120 }); };
  return (
    <>
      <header className="wrap hero">
        <div className="hero-text"><span className="hero-menu">MENU</span><h1 className="hero-name">{m.hero}</h1><p className="hero-tag" id="heroTag">{m.tag}</p><a className="other-menu" id="otherTop" hidden></a></div>
        <Chip /></header>
      <Promos />
      <div className="menubar" id="tabs" hidden={v !== 'menu'}>
        <div className="msearch"><input id="mSearch" type="search" placeholder="Tìm món…" aria-label="Tìm món trong menu" autoComplete="off" enterKeyHint="search" value={state.search} onChange={onSearch} /></div>
        <nav className="tabs" aria-label="Danh mục món"><Tabs /></nav></div>
      <main id="menuView" hidden={v !== 'menu'}><div className="wrap">
        <Ticket /><div id="phien"><Phien /></div><Banner />
        <MenuList /><SearchEmpty />
        <a className="other-menu-end" id="otherEnd" hidden></a>
        <p className="menu-end">Cảm ơn bạn nhiều · Bé Nốc luôn bên bạn</p></div></main>
      <main id="statusView" hidden={v !== 'status'}>{v === 'status' && <Status />}</main>
      <CartBar />
    </>
  );
}

/* ---------- Khởi động ---------- */
let lastMenuAt = 0, menuReloadT = null;
/* Menu lần trước lưu trong máy: mở trang là hiện ngay, rồi thay bằng menu mới từ máy chủ */
const MENU_CACHE = (CONFIG.STORE_PREFIX || 'benoc.') + 'menuCache';
function applyMenu(menu, best, promos) {
  state.menu = menu || [];
  state.items = new Map(); state.itemCat = new Map();
  state.menu.forEach(c => c.items.forEach(it => { state.items.set(it.id, it); state.itemCat.set(it.id, c); }));
  // Best seller tự động: món bán chạy nhất 7 ngày của mỗi quầy
  if (best && best.length) { const ids = new Set(best.map(b => b.menu_item_id)); state.items.forEach(it => { if (ids.has(it.id)) it.best = true; else if (/^best\s*seller$/i.test(it.tag || '')) it.tag = null; }); }
  state.promos = promos || [];
  // Ưu đãi giảm giá / đồng giá: giá món hiện theo giá đã giảm (máy chủ cũng tính đúng như vậy)
  state.items.forEach(it => { it.orig = it.price; const sl = saleOf(state.promos, it.id, it.price); if (sl) { it.price = sl.price; it.sale = sl; } });
}
function paintCachedMenu() {
  if (DEMO) return;
  try {
    const c = JSON.parse(localStorage.getItem(MENU_CACHE) || 'null');
    if (!c || !Array.isArray(c.menu) || !c.menu.length || Date.now() - c.at > 864e5) return;
    applyMenu(c.menu, c.best, c.promos); render();
  } catch (e) { /* bộ nhớ đệm hỏng */ }
}
/* Tải menu. Món hết / tuỳ chọn hết đang nằm trong giỏ thì bỏ ra và báo tên. Trả về danh sách tên món bị bỏ. */
async function loadMenu() {
  try {
    const [menu, best, promos] = await Promise.all([api.getMenu(), api.bestSellers().catch(() => []), api.getPromotions().catch(() => [])]);
    lastMenuAt = Date.now();
    try { localStorage.setItem(MENU_CACHE, JSON.stringify({ at: lastMenuAt, menu: menu || [], best: best || [], promos: promos || [] })); } catch (e) { /* hết chỗ */ }
    applyMenu(menu, best, promos);
    state.cart.forEach(l => { if (l.promo) return; const it = state.items.get(l.itemId); if (it) { l.base = it.price; l.sale = it.sale ? it.sale.id : null; } });
    const choiceOk = (itemId, choices) => { const it = state.items.get(itemId); if (!it) return false; const ids = new Set(); it.option_groups.forEach(g => g.choices.forEach(c => ids.add(c.id))); return choices.every(c => ids.has(c.id)); };
    const ok = l => l.promo ? state.promos.some(p => p.id === l.promo) && l.units.every(u => choiceOk(u.itemId, u.choices)) : choiceOk(l.itemId, l.choices);
    const gone = state.cart.filter(l => !ok(l)).map(l => l.name);
    state.cart.filter(l => ok(l) && !l.promo).forEach(l => { const it = state.items.get(l.itemId); it.option_groups.forEach(g => {
      if (g.min > 0 && !l.choices.some(c => g.choices.some(x => x.id === c.id))) g.choices.filter(c => c.default).forEach(c => { l.choices.push({ id: c.id, name: c.name, price: c.price, group: g.title }); });
    }); });
    saveCart();
    if (gone.length) { state.cart = state.cart.filter(ok); saveCart(); ui.toast('Vừa hết, đã bỏ khỏi giỏ: ' + [...new Set(gone)].join(', ')); }
    render();
    return gone;
  } catch (e) { if (!state.menu.length) { state.menuErr = true; render(); } return []; }
}
api.watchMenu(() => { clearTimeout(menuReloadT); menuReloadT = setTimeout(loadMenu, 500 + Math.random() * 2000); }).catch(() => { /* vẫn còn tải lại khi mở lại màn hình */ });
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastMenuAt > 60e3) loadMenu(); });
{ const dn = document.getElementById('demoNote'); if (dn) dn.hidden = !DEMO; }
ui.init();
const root = document.getElementById('custRoot'); root.innerHTML = '';
createRoot(root).render(<App />);
if (GIAO) api.staffSession().then(e => { state.staff = e || false; render(); });
const wantMenu = BN.PARAMS.get('xem') === 'menu';
if (wantMenu) { try { const u = new URL(location.href); u.searchParams.delete('xem'); history.replaceState(null, '', u); } catch (e) { /* bỏ qua */ } }
if (BN.FEATURES.vietqr) BN.loadBank().then(render);
paintCachedMenu();
loadMenu().then(() => { if (activeOrders().length) { showView(wantMenu ? 'menu' : 'status'); startPolling(); } else showView('menu'); });
