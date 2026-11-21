/* Tab "Menu" (React): Món · Danh mục · Tuỳ chọn. Hộp thoại sửa món / danh mục / nhóm tuỳ chọn vẫn dùng mã cũ. */
import { useState } from 'react';
import { Html, useLoad, Loading, ErrMsg } from './common.jsx';

function Avail({ q, it }) {
  const { api, ui, errText } = q;
  const [on, setOn] = useState(!!it.is_available);
  const change = async e => {
    const v = e.target.checked; setOn(v);
    try { await api.setItemAvailable(it.id, v); it.is_available = v; ui.toast(v ? 'Đã mở bán lại' : 'Đã báo hết món, khách sẽ không thấy món này'); }
    catch (err) { setOn(!v); ui.toast(errText(err)); }
  };
  return <label className="switch"><input type="checkbox" checked={on} onChange={change} /><span className="track"></span><span className="sw-l">{on ? 'Đang bán' : 'Hết món'}</span></label>;
}

export default function MenuTab({ q }) {
  const { api, BN, state, vnd, thumb, choiceText, gKind, OKIND, editItem, editCat, editGroup, ui, errText, rerender } = q;
  const { data: m, err } = useLoad(() => api.adminMenu());
  const [sub, setSub] = useState(state.menuSub);
  const [cat, setCat] = useState(state.menuCat);
  const [mq, setMq] = useState(state.menuQuery);
  const [gq, setGq] = useState(state.groupQuery);
  if (err) return <ErrMsg q={q} err={err} />;
  if (!m) return <Loading />;
  state.menuData = m;
  const pickSub = k => { state.menuSub = k; setSub(k); };
  const pickCat = v => { state.menuCat = v; setCat(v); };
  const move = async (c, d) => {
    const list = m.categories.slice(), i = list.findIndex(x => x.id === c.id), j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    try { for (let k = 0; k < list.length; k++) if (list[k].sort_order !== k + 1) await api.saveCategory(Object.assign({}, list[k], { sort_order: k + 1 })); rerender(); } catch (e) { ui.toast(errText(e)); }
  };

  let body;
  if (sub === 'mon') {
    // Tìm món: không phân biệt dấu, khớp tên / mô tả; chỉ trong danh mục đang chọn
    const words = BN.fold(mq).split(/\s+/).filter(Boolean);
    const hit = i => words.every(w => BN.fold(i.name + ' ' + (i.description || '') + ' ' + (i.tag || '')).indexOf(w) >= 0);
    const inCat = c => cat === 'all' || String(cat) === String(c.id);
    const cats = m.categories.concat(m.items.some(i => !i.category_id) ? [{ id: null, name: 'Chưa xếp danh mục', color: 'nau' }] : []);
    const sections = cats.filter(inCat).map(c => {
      const its = m.items.filter(i => i.category_id === c.id && hit(i));
      if (!its.length) return null;
      return <section key={String(c.id)} className={'box cc-' + c.color}><h2 className="box-title"><span>{c.name}</span></h2><ul className="list">{its.map(it => (
        <li key={it.id}><div className="lrow">
          <button className="thumb-btn" style={{ border: 0, background: 'none', padding: 0 }} type="button" aria-label={'Sửa ' + it.name} onClick={() => editItem(it)}><Html html={thumb(it, m.categories)} /></button>
          <button className="lmain" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', color: 'inherit' }} type="button" onClick={() => editItem(it)}>
            <span className="lname">{it.name}{it.tag && <> <span className="tag">{it.tag}</span></>}</span>
            <span className="lsub num">{vnd(it.price)}{it.group_ids.length ? ' · ' + it.group_ids.map(g => (m.groups.find(x => x.id === g) || {}).name).filter(Boolean).join(', ') : ''}</span></button>
          <Avail q={q} it={it} /></div></li>
      ))}</ul></section>;
    }).filter(Boolean);
    const other = words.length ? m.items.filter(hit).length : 0;
    body = <>
      <div className="toolbar"><input className="search" id="mq" type="search" placeholder="Tìm món…" value={mq} aria-label="Tìm món" onChange={e => { state.menuQuery = e.target.value; setMq(e.target.value); }} />
        <button className="btn" type="button" id="addItem" onClick={() => editItem(null)}>+ Thêm món</button></div>
      <div className="chips"><button className="chipbtn" type="button" aria-pressed={cat === 'all'} onClick={() => pickCat('all')}>Tất cả</button>
        {m.categories.map(c => <button key={c.id} className="chipbtn" type="button" aria-pressed={String(cat) === String(c.id)} onClick={() => pickCat(Number(c.id))}>{c.name}</button>)}</div>
      {sections.length ? sections : <>
        <p className="empty">Không có món nào khớp{cat !== 'all' ? ' trong danh mục này' : ''}.</p>
        {cat !== 'all' && other ? <p style={{ textAlign: 'center' }}><button className="btn btn-line btn-sm" type="button" onClick={() => pickCat('all')}>Có {other} món khớp ở danh mục khác · Xem tất cả</button></p> : null}
      </>}
    </>;
  } else if (sub === 'danhmuc') {
    body = <>
      <div className="toolbar"><span className="muted small" style={{ flex: 1 }}>Thứ tự ở đây là thứ tự khách thấy trên menu.</span><button className="btn" type="button" id="addCat" onClick={() => editCat(null)}>+ Thêm danh mục</button></div>
      <section className="box"><ul className="list">{m.categories.map((c, i) => (
        <li key={c.id} className={'cc-' + c.color}><div className="lrow"><span className="dot"></span>
          <button className="lmain" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', color: 'inherit' }} type="button" onClick={() => editCat(c)}>
            <span className="lname">{c.name}</span><span className="lsub">{m.items.filter(x => x.category_id === c.id).length} món · {(c.station || 'bep') === 'pha_che' ? 'Quầy pha chế' : 'Bếp nóng'}</span></button>
          <span className="row"><button className="btn btn-sm btn-line" type="button" aria-label="Lên" disabled={i === 0} onClick={() => move(c, -1)}>↑</button>
            <button className="btn btn-sm btn-line" type="button" aria-label="Xuống" disabled={i === m.categories.length - 1} onClick={() => move(c, 1)}>↓</button></span></div></li>
      ))}</ul></section>
    </>;
  } else {
    // Tìm nhóm tuỳ chọn theo tên nhóm, tên khách thấy, lựa chọn, hoặc tên món đang dùng nhóm đó
    const gw = BN.fold(gq).split(/\s+/).filter(Boolean);
    const gHit = g => { const t = BN.fold(g.name + ' ' + g.title + ' ' + choiceText(g) + ' ' + m.items.filter(i => i.group_ids.indexOf(g.id) >= 0).map(i => i.name).join(' ')); return gw.every(w => t.indexOf(w) >= 0); };
    body = <>
      <div className="toolbar"><input className="search" id="gq" type="search" placeholder="Tìm tuỳ chọn hoặc tên món…" value={gq} aria-label="Tìm nhóm tuỳ chọn" onChange={e => { state.groupQuery = e.target.value; setGq(e.target.value); }} />
        <button className="btn" type="button" id="addGroup" onClick={() => editGroup(null)}>+ Thêm nhóm</button></div>
      <p className="muted small" style={{ margin: '-4px 0 12px' }}>Nhóm tuỳ chọn dùng chung cho nhiều món, ví dụ size, topping, chọn kem.</p>
      {[['do_uong', 'cc-xanhduong'], ['do_an', 'cc-cam']].map(([k, cc]) => {
        const gs = m.groups.filter(g => gKind(g) === k && gHit(g));
        return <section key={k} className={'box ' + cc}><h2 className="box-title"><span>Tuỳ chọn {OKIND[k].toLowerCase()}</span></h2>
          {gs.length ? <ul className="list">{gs.map(g => (
            <li key={g.id}><button className="lrow" style={{ gridTemplateColumns: '1fr auto' }} type="button" onClick={() => editGroup(g)}>
              <span className="lmain"><span className="lname">{g.name} <span className="muted small">· khách thấy “{g.title}”</span></span><span className="lsub">{choiceText(g)}</span></span>
              <span className="lside"><span className={'pill ' + (g.min_select ? 'pill-red' : 'pill-mute')}>{g.min_select ? 'Bắt buộc' : g.max_select > 1 ? 'Chọn nhiều' : 'Không bắt buộc'}</span><span className="small muted">{g.used_by} món dùng</span></span></button></li>
          ))}</ul> : <p className="empty">{gw.length ? 'Không có nhóm nào khớp.' : 'Chưa có nhóm nào.'}</p>}</section>;
      })}
    </>;
  }

  return (
    <>
      <div className="ptitle"><h1>Menu</h1><div className="chips">{[['mon', 'Món'], ['danhmuc', 'Danh mục'], ['tuychon', 'Tuỳ chọn']].map(([k, t]) => <button key={k} className="chipbtn" type="button" aria-pressed={sub === k} onClick={() => pickSub(k)}>{t}</button>)}</div></div>
      {body}
    </>
  );
}
