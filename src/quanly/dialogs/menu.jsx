/* Hộp thoại Menu (React): sửa món, danh mục, nhóm tuỳ chọn. Bản cũ: editItemLegacy… trong quanly.html (?cu=1). */
import { useState } from 'react';
import { openSheet, closeSheet, SheetHead, Html } from '../../common/sheet.jsx';
import { InlineConfirm } from '../common';

/* Lưu kiểu "bấm là chạy, lỗi thì hiện dưới form" dùng chung */
export function useSave(q) {
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const run = async fn => { setMsg(''); setBusy(true); try { await fn(); } catch (e) { setMsg(q.errText(e)); setBusy(false); } };
  return { msg, setMsg, busy, run };
}
export const Msg = ({ msg, id }) => <p className="msg" id={id} hidden={!msg}>{msg}</p>;
/* Nút Xoá + ô xác nhận (giống confirmBox / wireConfirm của mã cũ) */
export function useDel(q, onYes) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const yes = async () => { setBusy(true); try { await onYes(); } catch (e) { q.ui.toast(q.errText(e)); setBusy(false); } };
  return { open, ask: () => setOpen(true), box: (text, ok) => <InlineConfirm open={open} text={text} okLabel={ok} busy={busy} onYes={yes} onNo={() => setOpen(false)} /> };
}

function ItemSheet({ q, it0 }) {
  const { api, ui, state, thumb, choiceText, gKind, OKIND, isDrinkCat, rerender } = q;
  const m = state.menuData, isNew = !it0;
  const it = it0 || { name: '', category_id: (state.menuCat !== 'all' && state.menuCat) || (m.categories[0] && m.categories[0].id), price: 0, description: '', tag: '', prep_minutes: 5, is_available: true, image_path: null, group_ids: [] };
  const [f, setF] = useState({ name: it.name, cat: it.category_id, price: String(it.price), desc: it.description || '', tag: it.tag || '', prep: String(it.prep_minutes), avail: !!it.is_available });
  const set = (k, v) => setF(x => Object.assign({}, x, { [k]: v }));
  const [image, setImage] = useState(it.image_path);
  const [imgMsg, setImgMsg] = useState('Ảnh vuông hoặc ngang trông đẹp nhất.');
  const [checked, setChecked] = useState(it.group_ids.slice());
  const [order, setOrder] = useState(it.group_ids.slice()); // thứ tự xếp: nhóm đã tích lúc mở / lúc đổi danh mục lên trước
  const { msg, setMsg, busy, run } = useSave(q);
  const del = useDel(q, async () => { await api.deleteItem(it.id); closeSheet(); ui.toast('Đã xoá món'); rerender(); });
  const pickImg = async e => {
    const file = e.target.files[0]; if (!file) return; setImgMsg('Đang tải ảnh…');
    try { const p = await api.uploadMenuImage(file); setImage(p); setImgMsg('Đã tải ảnh. Bấm Lưu để áp dụng.'); } catch (err) { setImgMsg(q.errText(err)); }
  };
  const catObj = m.categories.find(c => c.id === Number(f.cat));
  const mine = isDrinkCat(catObj) ? 'do_uong' : 'do_an', other = mine === 'do_uong' ? 'do_an' : 'do_uong';
  const sorted = order.map(id => m.groups.find(g => g.id === id)).filter(Boolean).concat(m.groups.filter(g => order.indexOf(g.id) < 0));
  const toggle = (id, on) => setChecked(c => on ? c.concat([id]) : c.filter(x => x !== id));
  const rows = k => sorted.filter(g => gKind(g) === k).map(g => <label key={g.id} className="check"><input type="checkbox" name="grp" value={g.id} checked={checked.indexOf(g.id) >= 0} onChange={e => toggle(g.id, e.target.checked)} /><span><b>{g.name}</b><small>{choiceText(g)}</small></span></label>);
  const nOther = sorted.filter(g => gKind(g) === other).length, otherOn = sorted.some(g => gKind(g) === other && checked.indexOf(g.id) >= 0);
  const save = () => {
    const name = f.name.trim(), price = Number(f.price);
    if (!name) { setMsg('Nhập tên món.'); return; }
    if (!(price >= 0)) { setMsg('Giá không hợp lệ.'); return; }
    // giữ thứ tự tích như bản cũ (theo thứ tự hiện trên màn hình)
    const groups = sorted.filter(g => checked.indexOf(g.id) >= 0).map(g => g.id);
    run(async () => {
      await api.saveItem(Object.assign({}, it, { name, price, category_id: Number(f.cat) || null, description: f.desc.trim(), tag: f.tag.trim(), prep_minutes: Number(f.prep) || 5, is_available: f.avail, image_path: image }), groups);
      closeSheet(); ui.toast(isNew ? 'Đã thêm món' : 'Đã lưu'); rerender();
    });
  };
  return <>
    <SheetHead title={isNew ? 'Thêm món' : 'Sửa món'} sub={isNew ? '' : it.name} />
    <form className="sh-body" id="itForm" noValidate onSubmit={e => e.preventDefault()}>
      <div className="imgpick"><span id="imgBox"><Html html={thumb(Object.assign({}, it, { image_path: image }), m.categories)} /></span><div className="row">
        <label className="btn btn-sm btn-soft filebtn">Chọn ảnh<input type="file" accept="image/*" id="itImg" onChange={pickImg} /></label><button className="btn btn-sm btn-line" type="button" id="imgDel" hidden={!image} onClick={() => setImage(null)}>Bỏ ảnh</button>
        <span className="small muted" id="imgMsg">{imgMsg}</span></div></div>
      <label className="field" htmlFor="fName">Tên món <span className="req">*</span><input id="fName" maxLength={80} value={f.name} required onChange={e => set('name', e.target.value)} /></label>
      <div className="grid2"><label className="field" htmlFor="fCat">Danh mục<select id="fCat" value={f.cat || ''} onChange={e => { set('cat', Number(e.target.value)); setOrder(sorted.filter(g => checked.indexOf(g.id) >= 0).map(g => g.id)); }}>{m.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field" htmlFor="fPrice">Giá (VNĐ) <span className="req">*</span><input id="fPrice" className="num" type="number" inputMode="numeric" min="0" step="1000" value={f.price} onChange={e => set('price', e.target.value)} /></label></div>
      <label className="field" htmlFor="fDesc">Mô tả ngắn<input id="fDesc" maxLength={120} value={f.desc} placeholder="Ví dụ: Topping hạt nổ + trân châu" onChange={e => set('desc', e.target.value)} /></label>
      <div className="grid2"><label className="field" htmlFor="fTag">Nhãn nổi bật<input id="fTag" maxLength={20} list="tagList" value={f.tag} placeholder="Để trống nếu không có" onChange={e => set('tag', e.target.value)} /><datalist id="tagList"><option value="Đặc biệt" /><option value="Mới" /></datalist><span className="small muted">“Best seller” tự gắn cho món bán chạy nhất 7 ngày của mỗi mục (bằng nhau thì gắn hết)</span></label>
        <label className="field" htmlFor="fPrep">Thời gian làm (phút)<input id="fPrep" className="num" type="number" min="1" max="60" value={f.prep} onChange={e => set('prep', e.target.value)} /></label></div>
      <fieldset className="checks" style={{ border: 0, padding: 0, margin: 0 }}><legend className="field" style={{ marginBottom: 6 }}>Tuỳ chọn cho món này</legend><div className="checks" id="grpBox">
        <div className="og-head">Tuỳ chọn {OKIND[mine].toLowerCase()} <span className="pill pill-mute">hợp với món này</span></div>
        {rows(mine).length ? rows(mine) : <p className="small muted" style={{ margin: 0 }}>Chưa có nhóm tuỳ chọn {OKIND[mine].toLowerCase()}. Thêm ở Menu → Tuỳ chọn.</p>}
        {nOther ? <details className="og-more" open={otherOn || undefined} key={mine}><summary>Tuỳ chọn {OKIND[other].toLowerCase()} ({nOther})</summary><div className="checks">{rows(other)}</div></details> : null}</div></fieldset>
      <label className="switch"><input type="checkbox" id="fAvail" checked={f.avail} onChange={e => set('avail', e.target.checked)} /><span className="track"></span>Đang bán</label>
      <Msg msg={msg} id="fMsg" />{isNew ? null : del.box('Xoá hẳn món “' + it.name + '” khỏi menu? Hoá đơn cũ vẫn giữ tên món.', 'Xoá món')}</form>
    <div className="sh-foot">{isNew ? null : <button className="btn btn-danger" type="button" id="itDel" onClick={del.ask}>Xoá</button>}<button className="btn grow" type="button" id="itSave" disabled={busy} onClick={save}>{isNew ? 'Thêm món' : 'Lưu'}</button></div>
  </>;
}
export const editItem = (q, it) => openSheet(<ItemSheet key={Date.now()} q={q} it0={it} />);

function CatSheet({ q, c0 }) {
  const { api, ui, state, COLORS, rerender } = q;
  const isNew = !c0, c = c0 || { name: '', color: 'vang', station: 'bep', sort_order: 99 };
  const [name, setName] = useState(c.name), [station, setStation] = useState(c.station || 'bep'), [color, setColor] = useState(c.color);
  const { msg, setMsg, run } = useSave(q);
  const del = useDel(q, async () => { await api.deleteCategory(c.id); closeSheet(); ui.toast('Đã xoá danh mục'); rerender(); });
  const save = () => {
    if (!name.trim()) { setMsg('Nhập tên danh mục.'); return; }
    run(async () => { await api.saveCategory(Object.assign({}, c, { name: name.trim(), station, color: color || 'vang', sort_order: isNew ? state.menuData.categories.length + 1 : c.sort_order })); closeSheet(); ui.toast('Đã lưu'); rerender(); });
  };
  return <>
    <SheetHead title={isNew ? 'Thêm danh mục' : 'Sửa danh mục'} />
    <div className="sh-body">
      <label className="field" htmlFor="cName">Tên danh mục<input id="cName" maxLength={40} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="field" htmlFor="cStation">Thuộc menu nào<select id="cStation" value={station} onChange={e => setStation(e.target.value)}><option value="bep">Bếp nóng (menu Ăn vặt, đơn về màn hình bếp)</option><option value="pha_che">Quầy pha chế (menu Trà · Cà phê, đơn về màn hình pha chế)</option></select></label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="field" style={{ marginBottom: 8 }}>Màu khung (giống ô trên menu)</legend><div className="swatches">
        {COLORS.map(([k, t]) => <label key={k} className={'cc-' + k} title={t}><input type="radio" name="col" value={k} checked={color === k} aria-label={t} onChange={() => setColor(k)} /><span></span></label>)}</div></fieldset>
      <Msg msg={msg} id="cMsg" />{isNew ? null : del.box('Xoá danh mục “' + c.name + '”? Các món trong đó sẽ ẩn khỏi menu khách cho tới khi bạn xếp lại danh mục.', 'Xoá danh mục')}</div>
    <div className="sh-foot">{isNew ? null : <button className="btn btn-danger" type="button" id="cDel" onClick={del.ask}>Xoá</button>}<button className="btn grow" type="button" id="cSave" onClick={save}>Lưu</button></div>
  </>;
}
export const editCat = (q, c) => openSheet(<CatSheet key={Date.now()} q={q} c0={c} />);

const X = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
function GroupSheet({ q, g0 }) {
  const { api, ui, gKind, OKIND, rerender } = q;
  const isNew = !g0, g = g0 ? JSON.parse(JSON.stringify(g0)) : { name: '', title: '', kind: 'do_uong', min_select: 0, max_select: 1, choices: [{ name: '', price_delta: 0 }], used_by: 0 };
  const [f, setF] = useState({ name: g.name, title: g.title, kind: gKind(g), how: g.min_select >= 1 && g.max_select === 1 ? 'one' : g.max_select === 1 ? 'opt' : 'many', max: String(Math.max(2, g.max_select)) });
  const set = (k, v) => setF(x => Object.assign({}, x, { [k]: v }));
  const [chs, setChs] = useState(() => g.choices.map((c, i) => Object.assign({ _k: i }, c, { price_delta: c.price_delta || 0, is_default: !!c.is_default, is_available: c.is_available !== false })));
  const [focusLast, setFocusLast] = useState(false);
  const { msg, setMsg, run } = useSave(q);
  const del = useDel(q, async () => { await api.deleteGroup(g.id); closeSheet(); ui.toast('Đã xoá nhóm'); rerender(); });
  const setCh = (i, k, v) => setChs(a => a.map((c, j) => j === i ? Object.assign({}, c, { [k]: v }) : c));
  const save = () => {
    const choices = chs.map(c => { const o = Object.assign({}, c, { name: String(c.name || '').trim(), price_delta: Number(c.price_delta) || 0 }); delete o._k; return o; }).filter(c => c.name);
    const name = f.name.trim(), title = f.title.trim();
    if (!name || !title) { setMsg('Nhập đủ hai tên của nhóm.'); return; }
    if (!choices.length) { setMsg('Thêm ít nhất một lựa chọn.'); return; }
    const min = f.how === 'one' ? 1 : 0, max = f.how === 'many' ? Math.max(2, Number(f.max) || 2) : 1;
    if (f.how !== 'many' && choices.filter(c => c.is_default).length > 1) { setMsg('Nhóm chọn 1 chỉ được có một lựa chọn mặc định.'); return; }
    run(async () => { await api.saveGroup(Object.assign({}, g, { name, title, kind: f.kind, min_select: min, max_select: max, choices })); closeSheet(); ui.toast('Đã lưu nhóm tuỳ chọn'); rerender(); });
  };
  return <>
    <SheetHead title={isNew ? 'Thêm nhóm tuỳ chọn' : 'Sửa nhóm tuỳ chọn'} sub={isNew ? '' : g.used_by + ' món đang dùng nhóm này'} />
    <div className="sh-body">
      <div className="grid2"><label className="field" htmlFor="gName">Tên để bạn quản lý<input id="gName" maxLength={40} value={f.name} placeholder="Ví dụ: Upsize (+5k)" onChange={e => set('name', e.target.value)} /></label>
        <label className="field" htmlFor="gTitle">Tên khách thấy<input id="gTitle" maxLength={30} value={f.title} placeholder="Ví dụ: Upsize" onChange={e => set('title', e.target.value)} /></label></div>
      <label className="field" htmlFor="gFor">Dùng cho<select id="gFor" value={f.kind} onChange={e => set('kind', e.target.value)}>{Object.keys(OKIND).map(k => <option key={k} value={k}>{OKIND[k] + (k === 'do_uong' ? ' (size, chọn kem…)' : ' (topping, thêm mì…)')}</option>)}</select></label>
      <div className="grid2"><label className="field" htmlFor="gKind">Cách chọn<select id="gKind" value={f.how} onChange={e => set('how', e.target.value)}><option value="one">Bắt buộc chọn 1</option><option value="opt">Chọn 1, không bắt buộc</option><option value="many">Chọn nhiều</option></select></label>
        <label className="field" htmlFor="gMax" hidden={f.how !== 'many'}>Chọn tối đa<input id="gMax" type="number" min="2" max="20" value={f.max} onChange={e => set('max', e.target.value)} /></label></div>
      <div className="field">Các lựa chọn</div><div className="checks" id="chList">{chs.map((c, i) => (
        <div key={c._k} className="chrow" data-ch={i}><input type="text" placeholder="Tên lựa chọn" value={c.name} data-f="name" aria-label="Tên lựa chọn" autoFocus={focusLast && i === chs.length - 1} onChange={e => setCh(i, 'name', e.target.value)} /><input type="number" step="1000" min="0" placeholder="+ giá" value={c.price_delta} data-f="price" aria-label="Giá cộng thêm" onChange={e => setCh(i, 'price_delta', e.target.value)} />
          <label><input type="checkbox" data-f="def" checked={c.is_default} onChange={e => setCh(i, 'is_default', e.target.checked)} />Mặc định</label><label><input type="checkbox" data-f="avail" checked={c.is_available} onChange={e => setCh(i, 'is_available', e.target.checked)} />Còn</label>
          <button className="x" type="button" data-rm={i} aria-label="Bỏ lựa chọn này" onClick={() => setChs(a => a.filter((_, j) => j !== i))}>{X}</button></div>))}</div>
      <button className="btn btn-sm btn-line" type="button" id="chAdd" onClick={() => { setFocusLast(true); setChs(a => a.concat([{ _k: Date.now(), name: '', price_delta: 0, is_default: false, is_available: true }])); }}>+ Thêm lựa chọn</button>
      <Msg msg={msg} id="gMsg" />{isNew ? null : del.box('Xoá nhóm “' + g.name + '”? ' + g.used_by + ' món sẽ không còn tuỳ chọn này.', 'Xoá nhóm')}</div>
    <div className="sh-foot">{isNew ? null : <button className="btn btn-danger" type="button" id="gDel" onClick={del.ask}>Xoá</button>}<button className="btn grow" type="button" id="gSave" onClick={save}>Lưu</button></div>
  </>;
}
export const editGroup = (q, g) => openSheet(<GroupSheet key={Date.now()} q={q} g0={g} />, { wide: true });
