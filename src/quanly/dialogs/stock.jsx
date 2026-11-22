/* Hộp thoại Kho (React): quy cách, nhập / lấy dùng / hỏng / kiểm kho, ảnh hoá đơn, chi tiết hàng,
   thêm / sửa hàng, quét mã vạch. Bản cũ: …Legacy trong quanly.html (?cu=1). */
import { useEffect, useRef, useState } from 'react';
import { openSheet, closeSheet, SheetHead, Html } from '../../common/sheet.jsx';
import { useSave, useDel, Msg } from './menu.jsx';

const later = f => { closeSheet(); setTimeout(f, 50); };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Quy cách ---------- */
function PackSheet({ q, pk0, used }) {
  const { api, ui, nf, rerender } = q;
  const isNew = !pk0, pk = pk0 ? Object.assign({}, pk0) : { name: '', buy_unit: 'thùng', use_unit: 'gói', per_buy: 24, sort_order: 99 };
  const [f, setF] = useState({ buy: pk.buy_unit, per: String(pk.per_buy), use: pk.use_unit, name: pk.name });
  const set = (k, v) => setF(x => Object.assign({}, x, { [k]: v }));
  const { msg, setMsg, busy, run } = useSave(q);
  const del = useDel(q, async () => { await api.deleteStockPack(pk.id); closeSheet(); ui.toast('Đã xoá quy cách'); rerender(); });
  const autoName = () => { const b = f.buy.trim(), u = f.use.trim(), n = Number(f.per); return b === u && n === 1 ? cap(b) : cap(b) + ' ' + nf(n) + ' ' + u; };
  const save = () => {
    const out = Object.assign({}, pk, { buy_unit: f.buy.trim(), use_unit: f.use.trim(), per_buy: Number(f.per) });
    out.name = f.name.trim() || autoName();
    if (!out.buy_unit || !out.use_unit) return setMsg('Nhập đủ đơn vị nhập và đơn vị dùng.');
    if (!(out.per_buy > 0)) return setMsg('Quy đổi phải lớn hơn 0.');
    run(async () => {
      try { await api.saveStockPack(out); } catch (err) { if (/duplicate|unique/i.test(err.message || '')) throw new Error('Đã có quy cách tên này.'); throw err; }
      closeSheet(); ui.toast(isNew ? 'Đã thêm quy cách' : 'Đã lưu quy cách'); rerender();
    });
  };
  return <>
    <SheetHead title={isNew ? 'Thêm quy cách' : 'Sửa quy cách'} sub={isNew ? 'Ví dụ: Thùng 24 gói, Thùng 4 can, Can' : used + ' mặt hàng đang dùng'} />
    <div className="sh-body">
      <div className="sk-conv"><span>1</span><input id="pqBuy" maxLength={15} value={f.buy} aria-label="Đơn vị nhập" onChange={e => set('buy', e.target.value)} /><span>=</span><input id="pqPer" className="num" type="number" inputMode="decimal" min="0.001" step="any" value={f.per} aria-label="Quy đổi" onChange={e => set('per', e.target.value)} /><input id="pqUse" maxLength={15} value={f.use} aria-label="Đơn vị dùng" onChange={e => set('use', e.target.value)} /></div>
      <p className="small muted" style={{ margin: '-4px 0 0' }}>Ô đầu là đơn vị lúc <b>nhập</b>, ô cuối là đơn vị lúc <b>dùng</b>. Nhập và dùng cùng một loại thì để 1 can = 1 can.</p>
      <label className="field" htmlFor="pqName">Tên quy cách<input id="pqName" maxLength={40} value={f.name} placeholder={'Để trống: ' + autoName()} onChange={e => set('name', e.target.value)} /></label>
      {!isNew && used ? <p className="small muted" style={{ margin: 0 }}>Lưu thì {used} mặt hàng đang dùng quy cách này đổi theo. Số tồn giữ nguyên theo đơn vị dùng.</p> : null}
      <Msg msg={msg} id="pqMsg" />{isNew ? null : del.box('Xoá quy cách “' + pk.name + '”? ' + (used ? used + ' mặt hàng vẫn giữ đơn vị hiện tại, chỉ bỏ liên kết.' : ''), 'Xoá')}</div>
    <div className="sh-foot">{isNew ? null : <button className="btn btn-danger" type="button" id="pqDel" onClick={del.ask}>Xoá</button>}<button className="btn grow" type="button" id="pqSave" disabled={busy} onClick={save}>{isNew ? 'Thêm quy cách' : 'Lưu'}</button></div>
  </>;
}
export const editPack = (q, pk, used) => openSheet(<PackSheet key={Date.now()} q={q} pk0={pk} used={used} />);

/* ---------- Ảnh hoá đơn ---------- */
const RECEIPT_KEEP = 3 * 3600e3;
const currentReceipt = state => state.lastReceipt && Date.now() - state.lastReceipt.at < RECEIPT_KEEP ? state.lastReceipt.r : null;
const receiptName = (q, r) => (r.supplier || 'Hoá đơn') + (r.invoice_no ? ' · ' + r.invoice_no : '') + ' · ' + q.hhmm(r.created_at) + ' ' + q.ddmm(r.created_at);
const PhotoBtns = ({ id, onFile }) => <div className="rc-btns"><label className="btn btn-sm filebtn">📷 Chụp hoá đơn<input type="file" accept="image/*" capture="environment" data-rcf={id} onChange={e => e.target.files && e.target.files[0] && onFile(e.target.files[0])} /></label>
  <label className="btn btn-sm btn-line filebtn">Tải ảnh lên<input type="file" accept="image/*" data-rcf={id} onChange={e => e.target.files && e.target.files[0] && onFile(e.target.files[0])} /></label></div>;
function RcThumb({ q, path }) {
  const [u, setU] = useState(null);
  useEffect(() => { let live = true; q.api.receiptUrls([path]).then(x => { if (live) setU(x[path] || null); }, () => {}); return () => { live = false; }; }, [path]);
  return <span className="rc-img" data-rcimg={path}>{u ? <img src={u} alt="" loading="lazy" /> : null}</span>;
}
/* Ô chọn ảnh hoá đơn trong phiếu Nhập hàng */
function ReceiptPicker({ q, onPick, busyRef }) {
  const { api, ui, state, errText } = q;
  const [cur, setCur] = useState(() => currentReceipt(state));
  const [busy, setBusy] = useState(false);
  const recent = (state.receipts || []).filter(r => Date.now() - new Date(r.created_at) < 3 * 86400e3);
  const pickCur = r => { setCur(r); onPick(r ? r.id : null); };
  const upload = async file => {
    busyRef.current = true; setBusy(true);
    try { const r = await api.addStockReceipt(file); state.lastReceipt = { r, at: Date.now() }; state.receipts = [r].concat(state.receipts || []); pickCur(r); ui.toast('Đã lưu ảnh hoá đơn'); }
    catch (err) { ui.toast('Chưa tải được ảnh: ' + errText(err)); }
    busyRef.current = false; setBusy(false);
  };
  return <div id="smRc">{busy ? <p className="small muted" style={{ margin: '6px 0' }}>Đang tải ảnh hoá đơn…</p>
    : cur ? <div className="rc-att"><RcThumb q={q} path={cur.photo_path} /><span className="rc-cap"><b>{receiptName(q, cur)}</b><span className="small muted">Đã gắn vào lần nhập này</span></span><button className="btn btn-sm btn-line" type="button" data-rcx onClick={() => pickCur(null)}>Bỏ ảnh</button></div>
      : <><PhotoBtns id="m" onFile={upload} />{recent.length ? <select className="rc-sel" data-rcs aria-label="Chọn hoá đơn đã chụp" value="" onChange={e => { const r = recent.find(x => x.id === Number(e.target.value)) || null; if (r) state.lastReceipt = { r, at: Date.now() }; pickCur(r); }}><option value="">…hoặc chọn hoá đơn đã chụp</option>{recent.map(r => <option key={r.id} value={r.id}>{receiptName(q, r)}</option>)}</select> : null}</>}</div>;
}
function NewReceiptSheet({ q }) {
  const { api, ui, state, rerender } = q;
  const [file, setFile] = useState(null), [url, setUrl] = useState(null), [sup, setSup] = useState(''), [no, setNo] = useState('');
  const { msg, setMsg, busy, run } = useSave(q);
  const save = () => {
    if (!file) return setMsg('Chụp hoặc chọn ảnh hoá đơn trước.');
    run(async () => { const r = await api.addStockReceipt(file, { supplier: sup.trim(), invoice_no: no.trim() }); state.lastReceipt = { r, at: Date.now() }; closeSheet(); ui.toast('Đã lưu ảnh. Giờ bấm Nhập ở từng mặt hàng'); rerender(); });
  };
  return <>
    <SheetHead title="Ảnh hoá đơn nhập" sub="Chụp 1 lần cho cả hoá đơn, rồi bấm Nhập ở từng mặt hàng" />
    <div className="sh-body">
      <div id="nrPh">{file ? <div className="rc-att"><span className="rc-img"><img src={url} alt="" /></span><span className="rc-cap"><b>{file.name || 'Ảnh hoá đơn'}</b><span className="small muted">Chưa lưu</span></span><button className="btn btn-sm btn-line" type="button" data-rcx onClick={() => setFile(null)}>Chụp lại</button></div>
        : <PhotoBtns id="n" onFile={f => { setFile(f); setUrl(URL.createObjectURL(f)); }} />}</div>
      <div className="grid2"><label className="field" htmlFor="nrSup">Nhà cung cấp<input id="nrSup" maxLength={80} list="nrSups" placeholder="Ví dụ: Cương Hằng" value={sup} onChange={e => setSup(e.target.value)} /><datalist id="nrSups">{[...new Set((state.receipts || []).map(r => r.supplier).filter(Boolean))].map(x => <option key={x} value={x} />)}</datalist></label>
        <label className="field" htmlFor="nrNo">Số hoá đơn<input id="nrNo" maxLength={40} placeholder="Không bắt buộc" value={no} onChange={e => setNo(e.target.value)} /></label></div>
      <Msg msg={msg} id="nrMsg" /></div>
    <div className="sh-foot"><button className="btn btn-block" type="button" id="nrSave" disabled={busy} onClick={save}>{busy ? 'Đang tải ảnh…' : 'Lưu ảnh hoá đơn'}</button></div>
  </>;
}
export const newReceiptSheet = q => openSheet(<NewReceiptSheet key={Date.now()} q={q} />);
export async function openReceipt(q, id) {
  const { api, ui, state, nf, vnd, ddmm, hhmm, isOwner, rerender } = q;
  let r = (state.receipts || []).find(x => x.id === id);
  if (!r) { const got = await api.stockReceipts({ ids: [id] }); r = got && got[0]; }
  if (!r) { ui.toast('Không thấy hoá đơn này'); return; }
  const [urls, moves] = await Promise.all([api.receiptUrls([r.photo_path]).catch(() => ({})), api.stockMoves({ receiptId: id, limit: 200 }).catch(() => [])]);
  const url = urls[r.photo_path], byId = new Map((state.stockData || []).map(i => [i.id, i]));
  const total = moves.reduce((t, m) => t + (m.cost || 0), 0);
  function Sheet() {
    const del = useDel(q, async () => { await api.deleteStockReceipt(r); if (state.lastReceipt && state.lastReceipt.r.id === r.id) state.lastReceipt = null; closeSheet(); ui.toast('Đã xoá ảnh hoá đơn'); rerender(); });
    return <>
      <SheetHead title={r.supplier || 'Hoá đơn nhập'} sub={(r.invoice_no ? 'Số ' + r.invoice_no + ' · ' : '') + ddmm(r.created_at) + ' ' + hhmm(r.created_at) + (r.employee_name ? ' · ' + r.employee_name : '')} />
      <div className="sh-body">
        {url ? <><a className="rc-big" href={url} target="_blank" rel="noopener"><img src={url} alt="Ảnh hoá đơn" /></a><p className="small muted" style={{ margin: 0 }}>Bấm vào ảnh để mở to, phóng xem chữ.</p></> : <p className="empty">Không tải được ảnh.</p>}
        <h3 className="og-head" style={{ marginTop: 8 }}>Đã nhập theo hoá đơn này</h3>
        {moves.length ? <><ul className="sk-hist">{moves.map((m, k) => <li key={k}><b>{(byId.get(m.item_id) || { name: '(đã xoá)' }).name}</b><span className="num">+{nf(m.amount)} {m.unit}</span>{isOwner() && m.cost ? <span className="small muted num">{vnd(m.cost)}</span> : null}</li>)}</ul>
          {isOwner() && total ? <p className="small">Tổng tiền nhập: <b className="num">{vnd(total)}</b></p> : null}</> : <p className="small muted">Chưa có mặt hàng nào gắn vào hoá đơn này.</p>}
        {isOwner() ? del.box('Xoá ảnh hoá đơn này? Các lần nhập vẫn giữ, chỉ bỏ liên kết ảnh.', 'Xoá') : null}</div>
      <div className="sh-foot">{isOwner() ? <button className="btn btn-danger" type="button" id="rcDel" onClick={del.ask}>Xoá ảnh</button> : null}<button className="btn grow" type="button" id="rcUse" onClick={() => { state.lastReceipt = { r, at: Date.now() }; closeSheet(); ui.toast('Bấm Nhập ở từng mặt hàng, ảnh này tự gắn vào'); rerender(); }}>Nhập tiếp theo hoá đơn này</button></div>
    </>;
  }
  openSheet(<Sheet key={Date.now()} />);
}

/* ---------- Nhập / lấy dùng / hỏng / kiểm kho ---------- */
const TITLE = { nhap: 'Nhập hàng', dung: 'Lấy dùng', hong: 'Báo hỏng / mất', kiem: 'Kiểm kho' };
function MoveSheet({ q, it, kind, opt }) {
  const { api, ui, state, nf, vnd, twoUnits, stockText, rerender } = q;
  const two = twoUnits(it);
  const [inBuy, setInBuy] = useState(two && (opt && opt.inBuy != null ? !!opt.inBuy : kind === 'nhap'));
  const [amount, setAmount] = useState(kind === 'kiem' ? '' : '1'), [whole, setWhole] = useState(''), [rest, setRest] = useState('');
  const [cost, setCost] = useState(''), [note, setNote] = useState('');
  const [rcId, setRcId] = useState(() => { const c = currentReceipt(state); return c ? c.id : null; });
  const rcBusy = useRef(false);
  const { msg, setMsg, busy, run } = useSave(q);
  const useAmt = () => kind === 'kiem' && two ? (Number(whole) || 0) * Number(it.per_buy) + (Number(rest) || 0) : (Number(amount) || 0) * (inBuy ? Number(it.per_buy) : 1);
  const a = kind === 'nhap' ? Number(it.qty) + useAmt() : kind === 'kiem' ? useAmt() : Number(it.qty) - useAmt();
  const costDef = it.cost_per_buy ? Math.round(useAmt() / Number(it.per_buy) * it.cost_per_buy) : '';
  const save = () => {
    const amt = kind === 'kiem' && two ? useAmt() : Number(amount);
    if (!(amt >= 0) || (kind !== 'kiem' && !(amt > 0)) || (kind === 'kiem' && (two ? whole === '' && rest === '' : amount === ''))) return setMsg(kind === 'kiem' ? 'Nhập số đếm được.' : 'Nhập số lượng lớn hơn 0.');
    if (rcBusy.current) return setMsg('Đang tải ảnh hoá đơn, đợi chút rồi bấm lại.');
    const c = kind === 'nhap' ? (cost !== '' ? Number(cost) : (costDef || null)) : null;
    run(async () => { const r = await api.stockMove(it.id, kind, amt, kind === 'kiem' ? false : inBuy, note, c, kind === 'nhap' && state.receipts ? rcId : null); closeSheet(); ui.toast(TITLE[kind] + ' xong · ' + it.name + ' còn ' + stockText(it, r.qty)); rerender(); });
  };
  const diff = a - Number(it.qty);
  return <>
    <SheetHead title={TITLE[kind] + ' · ' + it.name} sub={'Đang còn ' + stockText(it)} />
    <div className="sh-body">
      <div id="smU">{two && kind !== 'kiem' ? <div className="seg2" role="group" aria-label="Đơn vị">{[[true, it.buy_unit + ' (= ' + nf(it.per_buy) + ' ' + it.use_unit + ')'], [false, it.use_unit]].map(([v, t]) => <button key={String(v)} type="button" data-u={String(v)} aria-pressed={inBuy === v} onClick={() => setInBuy(v)}>{t}</button>)}</div> : null}</div>
      <div id="smQ">{kind === 'kiem'
        ? (two ? <><p className="small muted" style={{ margin: 0 }}>Đếm thực tế trong kho:</p><div className="grid2"><label className="field" htmlFor="smW">Số {it.buy_unit} nguyên<input id="smW" className="num" type="number" inputMode="decimal" min="0" value={whole} onChange={e => setWhole(e.target.value)} /></label><label className="field" htmlFor="smR">Số {it.use_unit} lẻ<input id="smR" className="num" type="number" inputMode="decimal" min="0" value={rest} onChange={e => setRest(e.target.value)} /></label></div></>
          : <label className="field" htmlFor="smA">Đếm thực tế còn bao nhiêu {it.use_unit}<input id="smA" className="num" type="number" inputMode="decimal" min="0" value={amount} onChange={e => setAmount(e.target.value)} /></label>)
        : <label className="field" htmlFor="smA">Số lượng ({inBuy ? it.buy_unit : it.use_unit})<div className="sk-step"><button className="btn btn-line" type="button" data-st="-1" aria-label="Bớt 1" onClick={() => setAmount(String(Math.max(0, (Number(amount) || 0) - 1)))}>−</button><input id="smA" className="num" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} /><button className="btn btn-line" type="button" data-st="1" aria-label="Thêm 1" onClick={() => setAmount(String(Math.max(0, (Number(amount) || 0) + 1)))}>+</button></div></label>}</div>
      <p className="sk-after" id="smAfter">{kind === 'kiem' ? <>Chênh lệch: <b>{(diff >= 0 ? '+' : '') + nf(diff) + ' ' + it.use_unit}</b> · </> : null}Sau khi ghi còn: <b className="num">{stockText(it, a)}</b>{a < 0 ? <> <span className="pill pill-red">âm, kiểm tra lại</span></> : null}</p>
      {kind === 'nhap' && state.receipts ? <div className="field">Ảnh hoá đơn (không bắt buộc)<ReceiptPicker q={q} onPick={setRcId} busyRef={rcBusy} /></div> : null}
      {kind === 'nhap' ? <label className="field" htmlFor="smC">Tiền nhập (VNĐ, không bắt buộc)<input id="smC" className="num" type="number" inputMode="numeric" min="0" step="1000" placeholder={costDef ? 'Gợi ý ' + vnd(costDef) : ''} value={cost} onChange={e => setCost(e.target.value)} /></label> : null}
      <label className="field" htmlFor="smN">Ghi chú<input id="smN" maxLength={200} placeholder={kind === 'nhap' ? 'Ví dụ: nhà cung cấp, hạn dùng' : kind === 'hong' ? 'Ví dụ: hết hạn, đổ vỡ' : 'Không bắt buộc'} value={note} onChange={e => setNote(e.target.value)} /></label>
      <Msg msg={msg} id="smMsg" /></div>
    <div className="sh-foot"><button className="btn btn-block" type="button" id="smSave" disabled={busy} onClick={save}>{TITLE[kind]}</button></div>
  </>;
}
export const openStockMove = (q, it, kind, opt) => openSheet(<MoveSheet key={Date.now()} q={q} it={it} kind={kind} opt={opt} />);

/* ---------- Chi tiết 1 mặt hàng ---------- */
export async function openStockItem(q, it) {
  const { api, ui, state, nf, vnd, ddmm, hhmm, twoUnits, stockText, isLow, KIND, ICON_SCAN, ICON_BILL, codeUnitText, isOwner, errText } = q;
  let moves = []; try { moves = await api.stockMoves({ itemId: it.id, limit: 60 }); } catch (e) { /* bỏ qua */ }
  function Sheet() {
    const [codes, setCodes] = useState(() => state.barcodes ? state.barcodes.filter(b => b.item_id === it.id) : null);
    const unlink = async (e, code) => { const b = e.currentTarget; b.disabled = true; try { await api.unlinkBarcode(code); state.barcodes = state.barcodes.filter(x => x.code !== code); setCodes(c => c.filter(x => x.code !== code)); ui.toast('Đã gỡ mã'); } catch (err) { ui.toast(errText(err)); b.disabled = false; } };
    return <>
      <SheetHead title={it.name} sub={(it.grp || 'Chưa xếp nhóm') + (twoUnits(it) ? ' · 1 ' + it.buy_unit + ' = ' + nf(it.per_buy) + ' ' + it.use_unit : ' · tính theo ' + it.use_unit)} />
      <div className="sh-body">
        <div className="sk-big"><span>Đang còn</span><b className="num">{stockText(it)}</b>{isLow(it) ? <span className="pill pill-red">Sắp hết</span> : null}</div>
        <div className="sk-acts sk-acts--wide">{[['nhap', 'Nhập hàng', 'btn'], ['dung', 'Lấy dùng', 'btn btn-line'], ['kiem', 'Kiểm kho', 'btn btn-line'], ['hong', 'Hỏng / mất', 'btn btn-line']].map(([k, t, c]) => <button key={k} className={c} type="button" data-k={k} onClick={() => later(() => openStockMove(q, it, k))}>{t}</button>)}</div>
        {it.note ? <p className="small muted">{it.note}</p> : null}
        {codes ? <><h3 className="og-head" style={{ marginTop: 8 }}>Mã vạch</h3><div className="sc-codes">{codes.map(b => <span key={b.code} className="sc-code"><span className="num">{b.code}</span><span className="small muted">{codeUnitText(it, b.unit_kind)}</span>{isOwner() ? <button className="x" type="button" data-unlink={b.code} aria-label={'Gỡ mã ' + b.code} onClick={e => unlink(e, b.code)}>×</button> : null}</span>)}
          <button className="btn btn-sm btn-line sc-btn" type="button" id="skCode" onClick={() => later(() => scanToLink(q, it))}><Html html={ICON_SCAN} />Gắn mã vạch</button></div></> : null}
        <h3 className="og-head" style={{ marginTop: 8 }}>Lịch sử</h3>
        {moves.length ? <ul className="sk-hist">{moves.map((m, k) => <li key={k}><span className={'pill ' + KIND[m.kind][1]}>{KIND[m.kind][0]}</span><span className="num">{m.kind === 'kiem' ? 'đếm ' + nf(m.amount) + ' ' + m.unit + ' (' + (m.delta >= 0 ? '+' : '') + nf(m.delta) + ')' : (m.delta >= 0 ? '+' : '−') + nf(m.amount) + ' ' + m.unit}</span>
          <span className="small muted">{ddmm(m.created_at) + ' ' + hhmm(m.created_at) + ' · ' + (m.employee_name || '') + (isOwner() && m.cost ? ' · ' + vnd(m.cost) : '') + (m.note ? ' · ' + m.note : '')}</span>
          {m.receipt_id ? <button className="link small" type="button" data-rcv={m.receipt_id} onClick={() => later(() => openReceipt(q, Number(m.receipt_id)))}><Html html={ICON_BILL} />Hoá đơn</button> : null}</li>)}</ul> : <p className="small muted">Chưa có.</p>}</div>
      {isOwner() ? <div className="sh-foot"><button className="btn btn-line btn-block" type="button" id="skEdit" onClick={() => later(() => editStockItem(q, it))}>Sửa mặt hàng</button></div> : null}
    </>;
  }
  openSheet(<Sheet key={Date.now()} />);
}

/* ---------- Thêm / sửa mặt hàng (chủ quán) ---------- */
function ItemSheet({ q, it0, opt }) {
  const { api, ui, state, STOCK_PRESETS, twoUnits, rerender, errText } = q;
  const PRESETS = state.stockPacks ? state.stockPacks : STOCK_PRESETS.map(p => ({ id: null, name: p[0], buy_unit: p[1], use_unit: p[2], per_buy: p[3] }));
  const isNew = !it0, it = it0 ? Object.assign({}, it0, { had_pack: !!it0.pack_id }) : Object.assign({ name: opt.name || '', grp: '', qty: '', min_qty: '', cost_per_buy: '', note: '', is_active: true }, PRESETS[0] ? { buy_unit: PRESETS[0].buy_unit, use_unit: PRESETS[0].use_unit, per_buy: PRESETS[0].per_buy, pack_id: PRESETS[0].id } : { buy_unit: 'thùng', use_unit: 'gói', per_buy: 24, pack_id: null });
  const grps = [...new Set(['Đồ khô', 'Nguyên liệu pha chế', 'Gia vị', 'Rau củ · tươi sống', 'Bao bì'].concat((state.stockData || []).map(x => x.grp).filter(Boolean)))];
  const s = v => v == null ? '' : String(v);
  const [f, setF] = useState({ name: it.name, grp: it.grp || '', buy: it.buy_unit, per: s(it.per_buy), use: it.use_unit, qty: s(it.qty), min: s(it.min_qty), cost: s(it.cost_per_buy), note: it.note || '', on: it.is_active !== false });
  const [packId, setPackId] = useState(it.pack_id || null), [codeUnit, setCodeUnit] = useState('buy');
  const { msg, setMsg, busy, run } = useSave(q);
  const del = useDel(q, async () => { await api.deleteStockItem(it.id); closeSheet(); ui.toast('Đã xoá mặt hàng'); rerender(); });
  const buyRef = useRef(null);
  // Tự sửa đơn vị → thành quy cách "Tự đặt" (không còn gắn quy cách chung)
  const setUnit = (k, v) => { const n = Object.assign({}, f, { [k]: v }); setF(n); const pk = PRESETS.find(p => p.id === packId); if (pk && (n.buy.trim() !== pk.buy_unit || n.use.trim() !== pk.use_unit || Number(n.per) !== Number(pk.per_buy))) setPackId(null); };
  const set = (k, v) => setF(x => Object.assign({}, x, { [k]: v }));
  const uu = f.use || 'đơn vị dùng', bu = f.buy || 'đơn vị nhập';
  const save = () => {
    const out = Object.assign({}, it, { name: f.name.trim(), grp: f.grp.trim(), buy_unit: f.buy.trim(), use_unit: f.use.trim(), per_buy: Number(f.per), min_qty: f.min, cost_per_buy: f.cost, note: f.note.trim(), is_active: isNew ? true : f.on, qty: isNew ? f.qty : it.qty, pack_id: packId });
    if (!out.name) return setMsg('Nhập tên hàng.');
    if (!out.buy_unit || !out.use_unit) return setMsg('Nhập đủ đơn vị nhập và đơn vị dùng.');
    if (!(out.per_buy > 0)) return setMsg('Quy đổi phải lớn hơn 0, ví dụ 1 thùng = 24 gói.');
    run(async () => {
      const id = await api.saveStockItem(out);
      if (opt.barcode) { try { await api.linkBarcode(opt.barcode, id, twoUnits(out) ? codeUnit : 'buy', true); } catch (err) { ui.toast('Đã thêm hàng nhưng chưa nhớ được mã: ' + errText(err)); } }
      closeSheet(); ui.toast(isNew ? 'Đã thêm ' + out.name + (opt.barcode ? ' · đã nhớ mã vạch' : '') : 'Đã lưu'); rerender();
    });
  };
  return <>
    <SheetHead title={isNew ? 'Thêm hàng hoá' : 'Sửa hàng hoá'} sub={isNew ? 'Hàng nhập theo thùng, dùng theo gói… tự đặt quy đổi' : it.name} />
    <div className="sh-body">
      {opt.barcode ? <div className="sc-new"><span>Mã vạch <b className="num">{opt.barcode}</b> in trên:</span><div className="seg2" id="siCodeU" role="group" aria-label="Mã in trên"><button type="button" data-cu="buy" aria-pressed={codeUnit === 'buy'} onClick={() => setCodeUnit('buy')}>1 <span data-bu>{bu}</span></button><button type="button" data-cu="use" aria-pressed={codeUnit === 'use'} onClick={() => setCodeUnit('use')}>1 <span data-uu>{uu}</span></button></div></div> : null}
      <label className="field" htmlFor="siName">Tên hàng <span className="req">*</span><input id="siName" maxLength={60} value={f.name} placeholder="Ví dụ: Mì Hàn Quốc, Đường pha chế" onChange={e => set('name', e.target.value)} /></label>
      <label className="field" htmlFor="siGrp">Nhóm<input id="siGrp" maxLength={40} list="siGrps" value={f.grp} placeholder="Ví dụ: Đồ khô" onChange={e => set('grp', e.target.value)} /><datalist id="siGrps">{grps.map(g => <option key={g} value={g} />)}</datalist></label>
      <div className="field pk-h">Quy cách nhập hàng{state.stockPacks ? <> <button className="link small" type="button" id="siPacks" onClick={() => { closeSheet(); state.stockSub = 'quycach'; rerender(); }}>Quản lý quy cách ›</button></> : null}</div>
      <div className="chips" id="siPre">{PRESETS.map((p, k) => <button key={k} className="chipbtn" type="button" data-pre={k} aria-pressed={p.id != null && p.id === packId} onClick={() => { setF(x => Object.assign({}, x, { buy: p.buy_unit, use: p.use_unit, per: String(p.per_buy) })); setPackId(p.id); }}>{p.name}</button>)}
        <button className="chipbtn" type="button" data-pre="-1" aria-pressed={!packId} onClick={() => { setPackId(null); buyRef.current?.focus(); }}>Tự đặt</button></div>
      <div className="sk-conv"><span>1</span><input id="siBuy" ref={buyRef} maxLength={15} value={f.buy} aria-label="Đơn vị nhập" onChange={e => setUnit('buy', e.target.value)} /><span>=</span><input id="siPer" className="num" type="number" inputMode="decimal" min="0.001" step="any" value={f.per} aria-label="Quy đổi" onChange={e => setUnit('per', e.target.value)} /><input id="siUse" maxLength={15} value={f.use} aria-label="Đơn vị dùng" onChange={e => setUnit('use', e.target.value)} /></div>
      <p className="small muted" style={{ margin: '-4px 0 0' }}>Ô đầu là đơn vị lúc <b>nhập</b> (thùng, can, bao), ô cuối là đơn vị lúc <b>dùng</b> (gói, can, kg). Nhập và dùng cùng một loại thì để 1 can = 1 can.</p>
      <div className="grid2">{isNew ? <label className="field" htmlFor="siQty"><span>Tồn hiện có (<span data-uu>{uu}</span>)</span><input id="siQty" className="num" type="number" inputMode="decimal" min="0" step="any" value={f.qty} placeholder="0" onChange={e => set('qty', e.target.value)} /></label> : null}
        <label className="field" htmlFor="siMin"><span>Báo sắp hết khi còn ≤ (<span data-uu>{uu}</span>)</span><input id="siMin" className="num" type="number" inputMode="decimal" min="0" step="any" value={f.min} placeholder="0" onChange={e => set('min', e.target.value)} /></label>
        <label className="field" htmlFor="siCost"><span>Giá nhập 1 <span data-bu>{bu}</span> (VNĐ)</span><input id="siCost" className="num" type="number" inputMode="numeric" min="0" step="1000" value={f.cost} onChange={e => set('cost', e.target.value)} /></label></div>
      <label className="field" htmlFor="siNote">Ghi chú<input id="siNote" maxLength={200} value={f.note} placeholder="Ví dụ: nhà cung cấp, số điện thoại" onChange={e => set('note', e.target.value)} /></label>
      {isNew ? null : <label className="switch"><input type="checkbox" id="siOn" checked={f.on} onChange={e => set('on', e.target.checked)} /><span className="track"></span>Đang dùng (tắt để ẩn khỏi báo sắp hết)</label>}
      <Msg msg={msg} id="siMsg" />{isNew ? null : del.box('Xoá hẳn “' + it.name + '” và toàn bộ lịch sử nhập / dùng của nó?', 'Xoá')}</div>
    <div className="sh-foot">{isNew ? null : <button className="btn btn-danger" type="button" id="siDel" onClick={del.ask}>Xoá</button>}<button className="btn grow" type="button" id="siSave" disabled={busy} onClick={save}>{isNew ? 'Thêm hàng' : 'Lưu'}</button></div>
  </>;
}
export const editStockItem = (q, it, opt) => openSheet(<ItemSheet key={Date.now()} q={q} it0={it} opt={opt || {}} />, { wide: true });

/* ---------- Quét mã vạch ---------- */
/* Khung quét chung. onCode(code) trả true để đóng, false để quét tiếp. Bộ đọc mã (BarcodeDetector / ZXing) dùng chung với bản cũ. */
function ScanSheet({ q, o }) {
  const { ui, state, errText, scan } = q;
  const [hint, setHint] = useState('Đang mở camera…'), [msg, setMsg] = useState(''), [code, setCode] = useState('');
  const [mode, setMode] = useState(state.scanMode);
  const vRef = useRef(null), ctl = useRef({ stopped: false, stream: null, zx: null, busy: false });
  const stop = () => { const c = ctl.current; c.stopped = true; try { if (c.zx) c.zx.stop(); } catch (e) { /* bỏ qua */ } if (c.stream) c.stream.getTracks().forEach(t => t.stop()); c.stream = null; };
  const found = async raw => {
    const c = ctl.current, v = scan.cleanCode(raw); if (c.busy || c.stopped) return;
    if (!scan.okCode(v)) { setMsg('Mã “' + v + '” không đọc được, thử lại.'); return; }
    c.busy = true; if (navigator.vibrate) navigator.vibrate(60); setHint('Đã đọc: ' + v);
    try { const done = await o.onCode(v); if (done !== false) { stop(); return; } } catch (err) { setMsg(errText(err)); }
    c.busy = false;
  };
  useEffect(() => {
    const video = vRef.current, c = ctl.current;
    const gone = () => c.stopped || !document.body.contains(video) || !ui.isOpen();
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setHint('Máy không mở được camera ở đây. Dùng “Chụp ảnh mã vạch” hoặc gõ số.'); return; }
      try {
        const det = await scan.getDetector();
        const cons = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
        if (det) {
          c.stream = await navigator.mediaDevices.getUserMedia(cons); if (gone()) return stop();
          video.srcObject = c.stream; await video.play().catch(() => {}); setHint('Đưa mã vạch vào khung');
          const tick = async () => {
            if (gone()) return stop();
            if (!c.busy && video.readyState >= 2) { try { const r = await det.detect(video); if (r.length) await found(r[0].rawValue); } catch (e) { /* khung hình lỗi */ } }
            setTimeout(tick, 180);
          };
          tick();
        } else {
          const ZX = await scan.loadZXing(); if (gone()) return;
          c.zx = await new ZX.BrowserMultiFormatReader().decodeFromConstraints(cons, video, r => { if (gone()) return stop(); if (r) found(r.getText()); });
          setHint('Đưa mã vạch vào khung');
          const watch = () => { if (gone()) return stop(); setTimeout(watch, 500); }; watch();
        }
      } catch (err) {
        stop(); c.stopped = false;
        setHint(/NotAllowed|Permission/i.test(err && (err.name + err.message)) ? 'Chưa cho phép camera. Bật quyền camera cho trang này, hoặc chụp ảnh / gõ số.' : 'Không mở được camera. Dùng “Chụp ảnh mã vạch” hoặc gõ số.');
      }
    })();
    return stop;
  }, []);
  const fromFile = async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    setMsg(''); setHint('Đang đọc ảnh…');
    try {
      const det = await scan.getDetector(); let v = '';
      if (det) { const r = await det.detect(await createImageBitmap(f)); v = r[0] && r[0].rawValue; }
      else { const ZX = await scan.loadZXing(); const url = URL.createObjectURL(f); try { v = (await new ZX.BrowserMultiFormatReader().decodeFromImageUrl(url)).getText(); } catch (err) { v = ''; } URL.revokeObjectURL(url); }
      if (v) found(v); else { setMsg('Không thấy mã vạch trong ảnh. Chụp gần hơn, đủ sáng, mã nằm ngang.'); setHint('Đưa mã vạch vào khung'); }
    } catch (err) { setMsg(errText(err)); }
  };
  return <>
    <SheetHead title={o.title} sub={o.sub} />
    <div className="sh-body">
      {o.modes ? <div className="seg2 sc-modes" role="group" aria-label="Quét để làm gì">{[['nhap', 'Nhập hàng'], ['dung', 'Lấy dùng'], ['kiem', 'Kiểm kho']].map(([k, t]) => <button key={k} type="button" data-scm={k} aria-pressed={mode === k} onClick={() => { state.scanMode = k; setMode(k); }}>{t}</button>)}</div> : null}
      <div className="sc-cam"><video id="scV" ref={vRef} playsInline muted autoPlay></video><span className="sc-frame" aria-hidden="true"></span><p className="sc-hint" id="scHint">{hint}</p></div>
      <div className="sc-alt"><label className="btn btn-line" htmlFor="scFile">Chụp ảnh mã vạch</label><input id="scFile" type="file" accept="image/*" capture="environment" hidden onChange={fromFile} /></div>
      <label className="field" htmlFor="scCode">Hoặc gõ số in dưới mã vạch<div className="sk-step"><input id="scCode" className="num" inputMode="numeric" autoComplete="off" maxLength={64} placeholder="893…" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); found(code); } }} /><button className="btn" type="button" id="scGo" onClick={() => found(code)}>Tìm</button></div></label>
      <Msg msg={msg} id="scMsg" /></div>
  </>;
}
const openScanner = (q, o) => openSheet(<ScanSheet key={Date.now()} q={q} o={o} />);
/* Quét để nhập / lấy dùng / kiểm kho. Mã lạ → gắn vào hàng (máy nhớ cho lần sau). */
export function scanForMove(q) {
  const { api, state } = q;
  state.scanMode = state.scanMode || 'nhap';
  openScanner(q, { title: 'Quét mã vạch', sub: 'Quét mã trên thùng hoặc gói', modes: true, onCode: async code => {
    const codes = await api.stockBarcodes(); state.barcodes = codes || [];
    const link = state.barcodes.find(b => b.code === code);
    const it = link && state.stockData.find(x => x.id === link.item_id);
    if (it) later(() => openStockMove(q, it, state.scanMode, { inBuy: link.unit_kind === 'buy' }));
    else later(() => openUnknownCode(q, code, state.scanMode));
  } });
}
/* Mã chưa gắn hàng nào: chọn hàng có sẵn hoặc thêm hàng mới */
function UnknownSheet({ q, code, kind, fixedItem }) {
  const { api, ui, state, BN, nf, twoUnits, isOwner, errText, scan, rerender } = q;
  const items = (state.stockData || []).filter(x => x.is_active !== false);
  const [pick, setPick] = useState(fixedItem || null), [unit, setUnit] = useState('buy'), [query, setQuery] = useState('');
  const [guess, setGuess] = useState(null);
  const { msg, setMsg, busy, run } = useSave(q);
  const qRef = useRef(''); qRef.current = query;
  const pRef = useRef(pick); pRef.current = pick;
  useEffect(() => {
    if (fixedItem) return;
    scan.lookupProductName(code).then(n => {
      setGuess(n);
      if (n && !qRef.current && !pRef.current) { const w = BN.fold(n).split(/\s+/).filter(x => x.length > 2); const hit = items.find(i => w.some(x => BN.fold(i.name).indexOf(x) >= 0)); if (hit) setPick(hit); }
    });
  }, []);
  const words = BN.fold(query).split(/\s+/).filter(Boolean), shown = items.filter(i => words.every(x => BN.fold(i.name + ' ' + (i.grp || '')).indexOf(x) >= 0)).slice(0, 40);
  const save = () => {
    if (!pick) return; const k = twoUnits(pick) ? unit : 'buy';
    run(async () => {
      try { await api.linkBarcode(code, pick.id, k, false); }
      catch (err) {
        if (!/duplicate|unique|pkey/i.test(err.message || '')) throw err;
        const other = await api.stockBarcodes().then(c => (c || []).find(b => b.code === code)).catch(() => null);
        const oi = other && (state.stockData || []).find(x => x.id === other.item_id);
        if (!isOwner()) throw new Error('Mã này đã gắn cho “' + (oi ? oi.name : 'hàng khác') + '”. Nhờ chủ quán đổi nếu sai.');
        await api.linkBarcode(code, pick.id, k, true);
      }
      state.barcodes = await api.stockBarcodes() || [];
      closeSheet(); ui.toast('Đã nhớ mã · lần sau quét là ra ' + pick.name);
      if (kind) setTimeout(() => openStockMove(q, pick, kind, { inBuy: k === 'buy' }), 50); else rerender();
    });
  };
  return <>
    <SheetHead title={fixedItem ? 'Gắn mã cho ' + fixedItem.name : 'Mã mới, chưa gắn hàng'} sub={<span className="num">{code}</span>} />
    <div className="sh-body">
      <p className="small muted" id="ucGuess" style={{ margin: 0 }}>{fixedItem ? '' : guess === null ? 'Đang tra tên sản phẩm…' : guess ? 'Tra trên mạng: ' + guess : ''}</p>
      {fixedItem ? null : <><p className="small" style={{ margin: '4px 0 0' }}>Mã này là của hàng nào? Chọn một lần, lần sau quét là ra ngay.</p><input className="search" id="ucQ" type="search" placeholder="Tìm hàng hoá…" aria-label="Tìm hàng hoá" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="chips" id="ucList">{shown.length ? shown.map(i => <button key={i.id} className="chipbtn" type="button" data-pi={i.id} aria-pressed={!!pick && pick.id === i.id} onClick={() => { setPick(i); setUnit('buy'); }}>{i.name}</button>) : <p className="small muted" style={{ margin: 0 }}>Không có hàng nào khớp.</p>}</div></>}
      <div id="ucUnit">{pick && twoUnits(pick) ? <><p className="small" style={{ margin: '8px 0 4px' }}>Mã này in trên:</p><div className="seg2" role="group" aria-label="Mã in trên"><button type="button" data-u="buy" aria-pressed={unit === 'buy'} onClick={() => setUnit('buy')}>1 {pick.buy_unit} ({nf(pick.per_buy)} {pick.use_unit})</button><button type="button" data-u="use" aria-pressed={unit === 'use'} onClick={() => setUnit('use')}>1 {pick.use_unit}</button></div></> : null}</div>
      <Msg msg={msg} id="ucMsg" /></div>
    <div className="sh-foot">{isOwner() && !fixedItem ? <button className="btn btn-line" type="button" id="ucNew" onClick={() => later(() => editStockItem(q, null, { barcode: code, name: guess || '' }))}>+ Hàng mới</button> : null}<button className="btn grow" type="button" id="ucSave" disabled={!pick || busy} onClick={save}>{kind ? 'Nhớ mã và tiếp tục' : 'Nhớ mã'}</button></div>
  </>;
}
export const openUnknownCode = (q, code, kind, fixedItem) => openSheet(<UnknownSheet key={Date.now()} q={q} code={code} kind={kind} fixedItem={fixedItem} />);
/* Gắn thêm mã cho một mặt hàng (từ trang chi tiết hàng) */
export function scanToLink(q, it) {
  openScanner(q, { title: 'Gắn mã vạch', sub: it.name, onCode: async code => {
    const codes = await q.api.stockBarcodes() || []; const ex = codes.find(b => b.code === code);
    if (ex && ex.item_id === it.id) { closeSheet(); q.ui.toast('Mã này đã gắn cho ' + it.name); return; }
    later(() => openUnknownCode(q, code, null, it));
  } });
}
