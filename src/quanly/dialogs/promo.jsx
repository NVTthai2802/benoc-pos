/* Hộp thoại Ưu đãi (React): combo, mua X tặng Y, giảm giá / đồng giá, đơn từ … tặng quà.
   Bản cũ: editPromoLegacy trong quanly.html (?cu=1). */
import { useState } from 'react';
import { openSheet, closeSheet, SheetHead } from '../../common/sheet.jsx';
import { useSave, useDel, Msg } from './menu.jsx';

const SALE_LBL = { dong_gia: 'Giá bán đồng giá (VNĐ)', phan_tram: 'Giảm bao nhiêu %', tru_tien: 'Bớt bao nhiêu tiền mỗi món (VNĐ)' };
const OPT_MODE = { cong_them: 'Cộng thêm tiền như bình thường', mien_phi: 'Miễn phí (0đ)', khong_phi: 'Không cho chọn tuỳ chọn có phí' };
const DINE = [['tai_quan', 'Ăn tại quán'], ['mang_ve', 'Mang về / qua lấy'], ['giao_hang', 'Giao hàng (ship)']];

/* Danh sách chọn món có ô tìm riêng (không dấu cũng tìm được); món đã chọn đứng đầu */
function Picker({ q, m, part, pick, setPick, sale }) {
  const { BN, vnd } = q;
  const [s, setS] = useState('');
  const catName = it => (m.categories.find(c => c.id === it.category_id) || {}).name || '';
  const isOn = id => part === 'combo' ? pick.has(id) : pick.has(id);
  const words = BN.fold(s).split(/\s+/).filter(Boolean);
  const its = m.items.filter(it => isOn(it.id) || words.every(w => BN.fold(it.name + ' ' + catName(it)).indexOf(w) >= 0)).sort((a, b) => isOn(b.id) - isOn(a.id));
  const toggle = (id, on) => {
    if (part === 'combo') { const n = new Map(pick); if (on) n.set(id, 1); else n.delete(id); setPick(n); return; }
    const n = part === 'tang1' && on ? new Set() : new Set(pick); if (on) n.add(id); else n.delete(id); setPick(n);
  };
  const step = (e, id, d) => { e.preventDefault(); const n = new Map(pick); n.set(id, Math.max(1, Math.min(20, (pick.get(id) || 1) + d))); setPick(n); };
  return (
    <div className="pk-box"><input className="search" type="search" data-pq={part} placeholder="Tìm món để thêm…" value={s} aria-label="Tìm món" onChange={e => setS(e.target.value)} />
      <p className="small muted" style={{ margin: '4px 0' }}>{pick.size ? 'Đã chọn ' + pick.size + ' món' : 'Chưa chọn món nào'}</p><div className="pk-list">
        {its.length ? <>{its.slice(0, 60).map(it => (
          <label key={it.id} className={'check pk-it' + (isOn(it.id) ? ' on' : '')}><input type="checkbox" data-pp={part} value={it.id} checked={isOn(it.id)} onChange={e => toggle(it.id, e.target.checked)} />
            <span><b>{it.name}</b><small>{catName(it)} · {vnd(it.price)}{part === 'giam' && isOn(it.id) && sale ? ' → ' + vnd(Math.min(it.price, BN.saleCalc(sale, it.price))) : ''}{it.is_available ? '' : ' · đang hết'}</small></span>
            {part === 'combo' && isOn(it.id) && <span className="pk-q"><button type="button" className="btn btn-line btn-sm" data-cq={it.id} data-d="-1" aria-label="Bớt" onClick={e => step(e, it.id, -1)}>−</button><b className="num">{pick.get(it.id)}</b><button type="button" className="btn btn-line btn-sm" data-cq={it.id} data-d="1" aria-label="Thêm" onClick={e => step(e, it.id, 1)}>+</button></span>}</label>))}
          {its.length > 60 && <p className="small muted">Gõ tên để tìm thêm…</p>}</> : <p className="small muted">Không có món nào khớp.</p>}</div></div>
  );
}
const Seg = ({ items, val, onPick, data, cols }) => (
  <div className="seg2" role="group" style={{ gridTemplateColumns: 'repeat(' + cols + ',1fr)' }} aria-label={data.label}>
    {items.map(([k, t]) => <button key={k} type="button" {...{ ['data-' + data.attr]: k }} aria-pressed={val === k} onClick={() => onPick(k)}>{t}</button>)}</div>
);

function PromoSheet({ q, p0 }) {
  const { api, ui, state, vnd, DOW, toLocalInput, rerender } = q;
  const m = state.menuData, isNew = !p0;
  const p = p0 ? JSON.parse(JSON.stringify(p0)) : { name: '', kind: 'combo', description: '', price: null, buy_qty: 1, get_qty: 1, gift_same: false, option_mode: 'cong_them', start_at: null, end_at: null, days: null, time_from: null, time_to: null, is_active: true, sort_order: 0, sale_mode: 'dong_gia', sale_value: null, min_total: null, items: [] };
  const init = () => {
    const pk = { combo: new Map(), mua: new Set(), tang: new Set(), giam: new Set(), tang1: new Set(), mua1: new Set() };
    p.items.forEach(i => { if (i.part === 'combo') pk.combo.set(i.menu_item_id, i.qty); else pk[p.kind === 'don_tang' ? (i.part === 'tang' ? 'tang1' : 'mua1') : i.part].add(i.menu_item_id); });
    return pk;
  };
  const [pick, setPickAll] = useState(init);
  const setPick = part => v => setPickAll(x => Object.assign({}, x, { [part]: v }));
  const localIn = x => x ? toLocalInput(x) : '';
  const allOn = arr => k => !(arr && arr.length) || arr.indexOf(k) >= 0;
  const [v, setV] = useState({
    kind: p.kind, name: p.name, desc: p.description || '', price: p.price != null ? String(p.price) : '', buy: String(p.buy_qty), get: String(p.get_qty),
    gk: p.gift_same ? 'same' : (!p.gift_same && !!p.gift_name) ? 'out' : 'menu', out: !p.gift_same && !!p.gift_name, giftName: p.gift_name || '', giftSt: p.gift_station === 'bep' ? 'bep' : 'pha_che',
    sm: p.sale_mode || 'dong_gia', sale: p.sale_value != null ? String(p.sale_value) : '',
    min: p.min_total ? String(p.min_total) : '', getD: String(p.get_qty || 1), need: p.need_qty ? String(p.need_qty) : '', dine: DINE.map(([k]) => k).filter(allOn(p.dine_types)),
    mode: p.option_mode, lim: p.limit_qty ? String(p.limit_qty) : '', limPer: p.limit_per === 'tong' ? 'tong' : 'ngay',
    from: localIn(p.start_at), to: localIn(p.end_at), t1: p.time_from ? String(p.time_from).slice(0, 5) : '', t2: p.time_to ? String(p.time_to).slice(0, 5) : '',
    days: [1, 2, 3, 4, 5, 6, 7].filter(allOn(p.days)), on: !!p.is_active
  });
  const set = (k, x) => setV(o => Object.assign({}, o, { [k]: x }));
  const flip = (k, x) => setV(o => Object.assign({}, o, { [k]: o[k].indexOf(x) >= 0 ? o[k].filter(y => y !== x) : o[k].concat([x]) }));
  const { msg, setMsg, busy, run } = useSave(q);
  const del = useDel(q, async () => { await api.deletePromotion(p.id); closeSheet(); ui.toast('Đã xoá ưu đãi'); rerender(); });
  const comboNormal = [...pick.combo].reduce((s, [id, n]) => s + ((m.items.find(i => i.id === id) || {}).price || 0) * n, 0);
  const say = t => { setMsg(t); setTimeout(() => document.getElementById('prMsg')?.scrollIntoView({ block: 'nearest' }), 0); };
  const save = () => {
    const name = v.name.trim(); if (!name) return say('Nhập tên ưu đãi.');
    const out = Object.assign({}, p, { kind: v.kind, name, description: v.desc.trim(), option_mode: v.mode, is_active: v.on, sale_mode: v.sm });
    delete out._out;
    if (v.kind === 'combo') {
      if (!pick.combo.size) return say('Chọn ít nhất 1 món cho combo.');
      if (v.price === '' || !(Number(v.price) >= 0)) return say('Nhập giá combo.');
      out.price = Number(v.price); out.items = [...pick.combo].map(([id, n]) => ({ part: 'combo', menu_item_id: id, qty: n }));
    } else if (v.kind === 'don_tang') {
      const mn = v.min, nd = v.need;
      if (mn !== '' && !(Number(mn) >= 1)) return say('Mức đơn tối thiểu không hợp lệ.');
      if (nd !== '' && !(Number(nd) >= 1)) return say('Số món phải mua không hợp lệ.');
      if (mn === '' && nd === '') return say('Nhập mức đơn tối thiểu hoặc số món phải mua (hoặc cả hai).');
      if (nd !== '' && !pick.mua1.size) return say('Chọn các món được tính là món phải mua (hoặc thêm cả nhóm món).');
      const dts = DINE.map(([k]) => k).filter(k => v.dine.indexOf(k) >= 0); if (!dts.length) return say('Chọn ít nhất 1 loại đơn được áp dụng.');
      out.min_total = mn === '' ? null : Math.round(Number(mn)); out.need_qty = nd === '' ? null : Math.round(Number(nd)); out.dine_types = dts.length === 3 ? null : dts; out.get_qty = Math.max(1, Math.min(20, Number(v.getD) || 1)); out.option_mode = 'mien_phi';
      out.gift_same = false; out.gift_name = v.out ? v.giftName.trim() : null; out.gift_station = v.giftSt; out.price = null;
      if (v.out && !out.gift_name) return say('Nhập tên quà tặng ngoài menu.');
      if (!v.out && !pick.tang1.size) return say('Chọn món được tặng (hoặc chọn “Quà ngoài menu”).');
      out.items = (nd === '' ? [] : [...pick.mua1].map(id => ({ part: 'mua', menu_item_id: id }))).concat(v.out ? [] : [...pick.tang1].map(id => ({ part: 'tang', menu_item_id: id })));
    } else if (v.kind === 'giam_gia') {
      if (v.sale === '' || !(Number(v.sale) >= 0)) return say('Nhập ' + SALE_LBL[v.sm].toLowerCase() + '.');
      if (v.sm === 'phan_tram' && !(Number(v.sale) > 0 && Number(v.sale) <= 100)) return say('Giảm % phải từ 1 đến 100.');
      if (!pick.giam.size) return say('Chọn ít nhất 1 món được giảm.');
      out.sale_value = Math.round(Number(v.sale)); out.price = null;
      out.items = [...pick.giam].map(id => ({ part: 'giam', menu_item_id: id }));
    } else {
      out.buy_qty = Math.max(1, Math.min(20, Number(v.buy) || 1)); out.get_qty = Math.max(1, Math.min(20, Number(v.get) || 1));
      out.gift_same = v.gk === 'same'; out.gift_name = v.gk === 'out' ? v.giftName.trim() : null; out.gift_station = v.giftSt;
      if (!pick.mua.size) return say('Chọn món được tính là món mua.');
      if (v.gk === 'out' && !out.gift_name) return say('Nhập tên quà tặng ngoài menu.');
      if (v.gk === 'menu' && !pick.tang.size) return say('Chọn món được tặng (hoặc chọn “Đúng món khách mua” / “Quà ngoài menu”).');
      out.items = [...pick.mua].map(id => ({ part: 'mua', menu_item_id: id })).concat(v.gk === 'menu' ? [...pick.tang].map(id => ({ part: 'tang', menu_item_id: id })) : []);
    }
    const lim = v.lim.trim();
    if (lim !== '' && !(Number(lim) >= 1)) return say('Giới hạn số suất phải từ 1 trở lên, hoặc để trống.');
    out.limit_qty = lim === '' ? null : Math.round(Number(lim)); out.limit_per = v.limPer;
    out.start_at = v.from ? new Date(v.from).toISOString() : null; out.end_at = v.to ? new Date(v.to).toISOString() : null;
    if (out.start_at && out.end_at && out.end_at <= out.start_at) return say('Ngày kết thúc phải sau ngày bắt đầu.');
    if (!!v.t1 !== !!v.t2) return say('Nhập đủ giờ bắt đầu và giờ kết thúc của khung giờ, hoặc để trống cả hai.');
    out.time_from = v.t1 || null; out.time_to = v.t2 || null;
    const days = [1, 2, 3, 4, 5, 6, 7].filter(d => v.days.indexOf(d) >= 0);
    if (!days.length) return say('Chọn ít nhất 1 thứ trong tuần.');
    out.days = days.length === 7 ? null : days;
    run(async () => { await api.savePromotion(out); closeSheet(); ui.toast(isNew ? 'Đã tạo ưu đãi' : 'Đã lưu ưu đãi'); rerender(); });
  };
  const k = v.kind, P = part => <Picker q={q} m={m} part={part} pick={pick[part]} setPick={setPick(part)} sale={part === 'giam' && v.sale !== '' ? { sale_mode: v.sm, sale_value: Number(v.sale) } : null} />;
  const giftSt = id => <label className="field" htmlFor={id}>Nơi đưa quà<select id={id} value={v.giftSt} onChange={e => set('giftSt', e.target.value)}><option value="pha_che">Quầy pha chế</option><option value="bep">Bếp</option></select></label>;
  const giftName = id => <label className="field" htmlFor={id}>Tên quà (khách thấy, in trên phiếu) <span className="req">*</span><input id={id} maxLength={60} value={v.giftName} placeholder="Ví dụ: Sữa đậu 500ml" onChange={e => set('giftName', e.target.value)} /></label>;
  return <>
    <SheetHead title={isNew ? 'Tạo ưu đãi' : 'Sửa ưu đãi'} sub={isNew ? 'Combo, mua X tặng Y, giảm giá, đơn từ xx tặng quà' : p.name} />
    <div className="sh-body" id="prForm">
      <Seg cols={2} data={{ attr: 'pk', label: 'Loại ưu đãi' }} val={k} onPick={x => set('kind', x)} items={[['combo', 'Combo giá ưu đãi'], ['mua_tang', 'Mua X tặng Y'], ['giam_gia', 'Giảm giá / đồng giá'], ['don_tang', 'Đơn từ … tặng quà']]} />
      <label className="field" htmlFor="prName">Tên ưu đãi (khách thấy) <span className="req">*</span><input id="prName" maxLength={60} value={v.name} placeholder="Ví dụ: Combo no nê, Mua 1 tặng 1, Đồng giá 20K" onChange={e => set('name', e.target.value)} /></label>
      <label className="field" htmlFor="prDesc">Mô tả ngắn<input id="prDesc" maxLength={120} value={v.desc} placeholder="Để trống thì tự ghi danh sách món" onChange={e => set('desc', e.target.value)} /></label>
      <div data-for="combo" hidden={k !== 'combo'}><div className="field pk-h">Món trong combo <span className="req">*</span></div><div id="pkCombo">{P('combo')}</div>
        <div className="grid2" style={{ marginTop: 10 }}><label className="field" htmlFor="prPrice">Giá combo (VNĐ) <span className="req">*</span><input id="prPrice" className="num" type="number" inputMode="numeric" min="0" step="1000" value={v.price} onChange={e => set('price', e.target.value)} /></label><div className="field">Giá gốc các món<b className="num" id="prNormal" style={{ fontSize: 18, paddingTop: 8 }}>{vnd(comboNormal)}</b></div></div></div>
      <div data-for="mua_tang" hidden={k !== 'mua_tang'}>
        <div className="grid2"><label className="field" htmlFor="prBuy">Mua (X món)<input id="prBuy" className="num" type="number" min="1" max="20" value={v.buy} onChange={e => set('buy', e.target.value)} /></label><label className="field" htmlFor="prGet">Tặng (Y món)<input id="prGet" className="num" type="number" min="1" max="20" value={v.get} onChange={e => set('get', e.target.value)} /></label></div>
        <div className="field pk-h" style={{ marginTop: 10 }}>Món được tính là món mua <span className="req">*</span></div><div id="pkMua">{P('mua')}</div>
        <div className="field" style={{ marginTop: 10 }}>Tặng gì</div><Seg cols={3} data={{ attr: 'gk', label: 'Tặng gì' }} val={v.gk} onPick={x => set('gk', x)} items={[['menu', 'Món trong menu'], ['same', 'Đúng món khách mua'], ['out', 'Quà ngoài menu']]} />
        <div id="outBox" hidden={v.gk !== 'out'}><div className="grid2" style={{ marginTop: 8 }}>{giftName('prGiftName')}{giftSt('prGiftSt')}</div>
          <p className="small muted" style={{ margin: '4px 0 0' }}>Quà hiện trên đơn của nơi được chọn, giá 0đ, nhãn TẶNG.</p></div>
        <div id="tangBox" hidden={v.gk !== 'menu'}><div className="field pk-h" style={{ marginTop: 10 }}>Món được tặng <span className="req">*</span></div><div id="pkTang">{P('tang')}</div></div></div>
      <div data-for="giam_gia" hidden={k !== 'giam_gia'}>
        <div className="field">Cách giảm</div><Seg cols={3} data={{ attr: 'sm', label: 'Cách giảm' }} val={v.sm} onPick={x => set('sm', x)} items={[['dong_gia', 'Đồng giá'], ['phan_tram', 'Giảm %'], ['tru_tien', 'Giảm tiền']]} />
        <label className="field" htmlFor="prSale" style={{ marginTop: 8 }}><span id="prSaleLbl">{SALE_LBL[v.sm]}</span> <span className="req">*</span><input id="prSale" className="num" type="number" inputMode="numeric" min="0" value={v.sale} onChange={e => set('sale', e.target.value)} /></label>
        <div className="field pk-h" style={{ marginTop: 10 }}>Các món được giảm <span className="req">*</span></div><div id="pkGiam">{P('giam')}</div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>Giảm trên giá món; topping, upsize, size L vẫn cộng thêm như thường. Giảm % làm tròn xuống nghìn. Khách gọi món như bình thường là được giá giảm.</p></div>
      <div data-for="don_tang" hidden={k !== 'don_tang'}>
        <div className="grid2"><label className="field" htmlFor="prMin">Đơn từ (VNĐ)<input id="prMin" className="num" type="number" inputMode="numeric" min="1000" step="1000" value={v.min} placeholder="Ví dụ 30000" onChange={e => set('min', e.target.value)} /></label>
          <label className="field" htmlFor="prGetD">Số phần quà<input id="prGetD" className="num" type="number" min="1" max="20" value={v.getD} onChange={e => set('getD', e.target.value)} /></label></div>
        <div className="field pk-h" style={{ marginTop: 10 }}>Phải mua món nào? (tuỳ chọn)</div>
        <div className="grid2"><label className="field" htmlFor="prNeed">Mua ít nhất (số món)<input id="prNeed" className="num" type="number" min="1" max="20" value={v.need} placeholder="Để trống = không bắt buộc" onChange={e => set('need', e.target.value)} /></label>
          <label className="field" htmlFor="prCatD">Thêm cả nhóm món<select id="prCatD" value="" onChange={e => { const cid = e.target.value; if (!cid) return; const n = new Set(pick.mua1); m.items.filter(it => String(it.category_id) === String(cid)).forEach(it => n.add(it.id)); setPick('mua1')(n); }}><option value="">Chọn nhóm…</option>{m.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
        <div id="pkMuaD">{P('mua1')}</div>
        <div className="field" style={{ marginTop: 10 }}>Áp dụng cho loại đơn</div><div className="chips" id="prDine">{DINE.map(([d, t]) => <button key={d} className="chipbtn" type="button" data-dt={d} aria-pressed={v.dine.indexOf(d) >= 0} onClick={() => flip('dine', d)}>{t}</button>)}</div>
        <p className="small muted" style={{ margin: '4px 0 0' }}>Bỏ chọn loại đơn không áp dụng (ví dụ chỉ để Mang về). Ví dụ: Mang về, mua ít nhất 1 trà sữa / trà hoa quả, đơn từ 30.000đ → tặng 1 nước chanh.</p>
        <div className="field" style={{ marginTop: 10 }}>Tặng gì</div><Seg cols={2} data={{ attr: 'gd', label: 'Tặng gì' }} val={v.out ? 'out' : 'menu'} onPick={x => set('out', x === 'out')} items={[['menu', 'Món trong menu'], ['out', 'Quà ngoài menu']]} />
        <div id="outBoxD" hidden={!v.out}><div className="grid2" style={{ marginTop: 8 }}>{giftName('prGiftNameD')}{giftSt('prGiftStD')}</div></div>
        <div id="tangBoxD" hidden={v.out}><div className="field pk-h" style={{ marginTop: 10 }}>Món được tặng (chọn 1 món) <span className="req">*</span></div><div id="pkTang1">{P('tang1')}</div></div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>Tính theo tổng tiền các món khách gọi trong đơn (không tính phí ship). Đủ mức thì quà tự thêm vào đơn, giá 0đ, nhãn TẶNG. Khách gọi thêm làm đủ mức cũng được tặng; bỏ món làm tụt dưới mức thì quà tự bỏ. Mỗi đơn nhận quà 1 lần. Giới hạn: 1 suất = 1 đơn nhận quà.</p></div>
      <label className="field" id="prModeBox" htmlFor="prMode" style={{ marginTop: 6 }} hidden={k === 'giam_gia' || k === 'don_tang'}><span id="prModeLbl">{k === 'combo' ? 'Topping, upsize có phí trong combo' : 'Topping, upsize có phí của món tặng'}</span><select id="prMode" value={v.mode} onChange={e => set('mode', e.target.value)}>{Object.keys(OPT_MODE).map(x => <option key={x} value={x}>{OPT_MODE[x]}</option>)}</select></label>
      <fieldset style={{ border: 0, padding: 0, margin: '8px 0 0' }}><legend className="field" style={{ marginBottom: 6 }}>Giới hạn số suất</legend>
        <div className="grid2"><label className="field" htmlFor="prLim">Tối đa (để trống = không giới hạn)<input id="prLim" className="num" type="number" inputMode="numeric" min="1" value={v.lim} placeholder="Ví dụ 15" onChange={e => set('lim', e.target.value)} /></label>
          <label className="field" htmlFor="prLimPer">Tính theo<select id="prLimPer" value={v.limPer} onChange={e => set('limPer', e.target.value)}><option value="ngay">Mỗi ngày (0h mở lại)</option><option value="tong">Cả đợt ưu đãi</option></select></label></div>
        <p className="small muted" style={{ margin: '4px 0 0' }}>Combo / mua tặng: 1 suất = 1 phần khách chọn. Giảm giá / đồng giá: 1 suất = 1 món (1 ly). Đơn từ … tặng quà: 1 suất = 1 đơn nhận quà. Hết suất thì ưu đãi tự ẩn, món đồng giá về giá gốc; huỷ đơn thì suất được trả lại.</p></fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: '8px 0 0' }}><legend className="field" style={{ marginBottom: 6 }}>Thời gian hiển thị cho khách</legend>
        <div className="grid2"><label className="field" htmlFor="prFrom">Từ ngày<input id="prFrom" type="datetime-local" value={v.from} onChange={e => set('from', e.target.value)} /></label><label className="field" htmlFor="prTo">Đến ngày<input id="prTo" type="datetime-local" value={v.to} onChange={e => set('to', e.target.value)} /></label></div>
        <div className="grid2" style={{ marginTop: 8 }}><label className="field" htmlFor="prT1">Khung giờ mỗi ngày: từ<input id="prT1" type="time" value={v.t1} onChange={e => set('t1', e.target.value)} /></label><label className="field" htmlFor="prT2">đến<input id="prT2" type="time" value={v.t2} onChange={e => set('t2', e.target.value)} /></label></div>
        <div className="field" style={{ marginTop: 8 }}>Các thứ trong tuần</div><div className="chips" id="prDays">{[1, 2, 3, 4, 5, 6, 7].map(d => <button key={d} className="chipbtn" type="button" data-day={d} aria-pressed={v.days.indexOf(d) >= 0} onClick={() => flip('days', d)}>{DOW[d]}</button>)}</div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>Để trống ngày là chạy luôn, không hết hạn. Để trống khung giờ là cả ngày.</p></fieldset>
      <label className="switch" style={{ marginTop: 10 }}><input type="checkbox" id="prOn" checked={v.on} onChange={e => set('on', e.target.checked)} /><span className="track"></span>Bật ưu đãi</label>
      <Msg msg={msg} id="prMsg" />{isNew ? null : del.box('Xoá hẳn ưu đãi “' + p.name + '”? Hoá đơn cũ vẫn giữ tên ưu đãi.', 'Xoá ưu đãi')}</div>
    <div className="sh-foot">{isNew ? null : <button className="btn btn-danger" type="button" id="prDel" onClick={del.ask}>Xoá</button>}<button className="btn grow" type="button" id="prSave" disabled={busy} onClick={save}>{isNew ? 'Tạo ưu đãi' : 'Lưu'}</button></div>
  </>;
}
export const editPromo = (q, p) => openSheet(<PromoSheet key={Date.now()} q={q} p0={p} />, { wide: true });
