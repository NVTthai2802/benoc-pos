/* Hộp thoại Nhân viên (React): trả lương, thêm / sửa nhân viên (kèm tính lại lương ca cũ), sửa ca.
   Bản cũ: …Legacy trong quanly.html (?cu=1). */
import { useEffect, useRef, useState } from 'react';
import { openSheet, closeSheet, SheetHead, Html } from '../../common/sheet.jsx';
import { Msg } from './menu.jsx';

function PayoutSheet({ q, x, monthLabel }) {
  const { api, ui, vnd, errText, rerender } = q;
  const ok = async () => { try { await api.markShiftsPaid(x.unpaidIds); closeSheet(); ui.toast('Đã ghi nhận trả lương'); rerender(); } catch (err) { ui.toast(errText(err)); } };
  return <>
    <SheetHead title={'Trả lương cho ' + x.name} sub={monthLabel ? 'Lương ' + monthLabel : ''} />
    <div className="sh-body"><p>Đánh dấu <b>{x.unpaidIds.length} ca</b> chưa trả{monthLabel ? ' của ' + monthLabel : ''} là đã trả, tổng <b className="num">{vnd(x.unpaid)}</b>.</p><p className="small muted">Ca đang làm dở không được tính. Bạn trả tiền cho nhân viên trước rồi bấm xác nhận.</p></div>
    <div className="sh-foot"><button className="btn btn-line" type="button" data-close>Thôi</button><button className="btn grow" type="button" id="poOk" onClick={ok}>Xác nhận đã trả {vnd(x.unpaid)}</button></div>
  </>;
}
export const payout = (q, x, monthLabel) => openSheet(<PayoutSheet key={Date.now()} q={q} x={x} monthLabel={monthLabel} />);

const isoDay = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
/* Tính trước: những ca nào sẽ đổi khi áp lương mới từ 1 ngày (chỉ ca chưa trả; ca đã trả giữ nguyên) */
function useRepricer(q, e) {
  const cache = useRef({ key: '', list: null });
  const load = async from => {
    if (!from) return [];
    const [y, m, d] = from.split('-').map(Number);
    if (cache.current.key !== from) { cache.current = { key: from, list: await q.api.shifts({ employeeId: e.id, from: new Date(y, m - 1, d) }) }; }
    return cache.current.list;
  };
  const payAt = (s, rate) => s.paid_minutes == null ? null : Math.round(s.paid_minutes * rate / 60 / Math.max(1, s.pay_round || 1000)) * Math.max(1, s.pay_round || 1000);
  return async (from, rate) => {
    const list = await load(from), todo = list.filter(s => !s.paid_out_at && s.hourly_rate !== rate), paid = list.filter(s => s.paid_out_at && s.hourly_rate !== rate);
    const done = todo.filter(s => s.check_out_at), old = done.reduce((t, s) => t + (s.pay_amount || 0), 0), neu = done.reduce((t, s) => t + (payAt(s, rate) || 0), 0);
    const pDiff = paid.filter(s => s.check_out_at).reduce((t, s) => t + (payAt(s, rate) || 0) - (s.pay_amount || 0), 0);
    return { ids: todo.map(s => s.id), done: done.length, open: todo.length - done.length, old, neu, paid: paid.length, pDiff, total: list.length };
  };
}
function RepricePreview({ q, plan, from, rate }) {
  const { vnd, errText } = q;
  const [st, setSt] = useState(null);
  useEffect(() => { let live = true; setSt(null); plan(from, rate).then(p => live && setSt({ p }), err => live && setSt({ err })); return () => { live = false; }; }, [from, rate]);
  if (!st) return <div id="ePrev" className="small"><span className="muted">Đang tính…</span></div>;
  if (st.err) return <div id="ePrev" className="small"><p className="msg">{errText(st.err)}</p></div>;
  const p = st.p, d = p.neu - p.old;
  return <div id="ePrev" className="small">{!p.ids.length && !p.paid ? <p className="msg" style={{ margin: '6px 0 0' }}>Từ ngày này không có ca nào khác mức {vnd(rate)}/giờ. Không cần tính lại.</p> : <>
    <div className="msg msg-ok" style={{ margin: '6px 0 0' }}>{p.done ? <><b>{p.done} ca chưa trả</b> sẽ tính lại: {vnd(p.old)} → <b>{vnd(p.neu)}</b> ({(d >= 0 ? '+' : '−') + vnd(Math.abs(d))})</> : 'Không có ca chưa trả nào cần tính lại.'}
      {p.open ? <><br />{p.open} ca đang làm sẽ tính theo mức mới khi ra ca.</> : null}</div>
    {p.paid ? <p className="msg" style={{ margin: '6px 0 0', background: '#FFF3C4', color: '#7A5A00' }}>{p.paid} ca <b>đã đánh dấu trả</b> giữ nguyên. Nếu tính theo mức mới thì {p.pDiff >= 0 ? 'còn thiếu nhân viên' : 'đã trả dư'} <b>{vnd(Math.abs(p.pDiff))}</b>. Phần này bạn tự trả bù bên ngoài.</p> : null}</>}</div>;
}
function EmployeeSheet({ q, e0 }) {
  const { api, ui, DEMO, errText, rerender } = q;
  const isNew = !e0, e = e0 || { full_name: '', phone: '', role: 'staff', hourly_rate: 25000, is_active: true };
  const today = new Date();
  const [f, setF] = useState({ name: e.full_name, phone: e.phone || '', role: e.role, rate: String(e.hourly_rate || 0), pass: '', active: !!e.is_active, re: false, from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)) });
  const set = (k, v) => setF(x => Object.assign({}, x, { [k]: v }));
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const plan = useRepricer(q, e);
  const save = async () => {
    setMsg('');
    const name = f.name.trim(); if (!name) { setMsg('Nhập họ tên.'); return; }
    setBusy(true);
    const rate = Number(f.rate) || 0, re = !isNew && f.re;
    let changed = 0;
    try { if (re) { const pv = await plan(f.from, rate); changed = await api.setShiftRate(pv.ids, rate); } }
    catch (err) { setMsg(errText(err)); setBusy(false); return; }
    try {
      if (re) ui.toast('Đã tính lại ' + changed + ' ca theo lương mới');
      await api.saveEmployee(Object.assign({}, e, { full_name: name, phone: f.phone.replace(/\D/g, ''), role: f.role, hourly_rate: rate, is_active: isNew ? true : f.active, password: isNew && !DEMO ? f.pass : undefined }));
      closeSheet(); ui.toast('Đã lưu'); rerender();
    } catch (err) { setMsg(errText(err)); setBusy(false); }
  };
  return <>
    <SheetHead title={isNew ? 'Thêm nhân viên' : 'Sửa nhân viên'} />
    <div className="sh-body">
      <label className="field" htmlFor="eName">Họ tên <span className="req">*</span><input id="eName" maxLength={60} value={f.name} onChange={x => set('name', x.target.value)} /></label>
      <div className="grid2"><label className="field" htmlFor="ePhone">Số điện thoại (để đăng nhập)<input id="ePhone" inputMode="tel" value={f.phone} disabled={!isNew && !DEMO} onChange={x => set('phone', x.target.value)} /></label>
        <label className="field" htmlFor="eRole">Vai trò<select id="eRole" value={f.role} onChange={x => set('role', x.target.value)}><option value="staff">Nhân viên</option><option value="kitchen">Máy bếp (tài khoản dùng chung ở bếp)</option><option value="bar">Máy pha chế (tài khoản dùng chung ở quầy pha chế)</option><option value="owner">Chủ quán</option></select></label></div>
      <label className="field" htmlFor="eRate">Lương mỗi giờ (VNĐ)<input id="eRate" className="num" type="number" min="0" step="1000" value={f.rate} onChange={x => set('rate', x.target.value)} /></label>
      {isNew && !DEMO ? <><label className="field" htmlFor="ePass">Mật khẩu đăng nhập (ít nhất 6 ký tự)<input id="ePass" type="text" autoComplete="new-password" value={f.pass} onChange={x => set('pass', x.target.value)} /></label><p className="small muted" style={{ margin: 0 }}>Đưa số điện thoại và mật khẩu này cho nhân viên. Đổi mật khẩu sau này làm trong Supabase (Authentication &gt; Users).</p></> : null}
      {isNew ? null : <label className="switch"><input type="checkbox" id="eActive" checked={f.active} onChange={x => set('active', x.target.checked)} /><span className="track"></span>Đang làm việc (tắt khi nhân viên nghỉ hẳn)</label>}
      {isNew ? null : <div className="reprice"><label className="switch"><input type="checkbox" id="eRe" checked={f.re} onChange={x => set('re', x.target.checked)} /><span className="track"></span>Tính lại các ca cũ theo mức lương này</label>
        <p className="small muted" style={{ margin: '4px 0 0' }} id="eReOff" hidden={f.re}>Tắt: lương mới chỉ áp dụng cho ca từ nay về sau, ca cũ giữ nguyên. Bật khi bạn quên đổi lương vài buổi.</p>
        <div id="eReBox" hidden={!f.re}><label className="field" htmlFor="eFrom" style={{ marginTop: 8 }}>Tính lại các ca từ ngày<input id="eFrom" type="date" value={f.from} max={isoDay(today)} onChange={x => set('from', x.target.value)} /></label>
          {f.re ? <RepricePreview q={q} plan={plan} from={f.from} rate={Number(f.rate) || 0} /> : <div id="ePrev" className="small"></div>}</div></div>}
      <Msg msg={msg} id="eMsg" /></div>
    <div className="sh-foot"><button className="btn grow" type="button" id="eSave" disabled={busy} onClick={save}>{isNew ? 'Thêm nhân viên' : f.re ? 'Lưu và tính lại lương' : 'Lưu'}</button></div>
  </>;
}
export const editEmployee = (q, e) => openSheet(<EmployeeSheet key={Date.now()} q={q} e0={e} />);

export async function editShift(q, s) {
  const { api, ui, ddmmyyyy, hhmm, toLocalInput, payLine, ruleText, isOwner, errText, rerender } = q;
  const urls = await Promise.all([s.check_in_photo, s.check_out_photo].map(p => p ? api.photoUrl(p).catch(() => null) : null));
  function Sheet() {
    const [f, setF] = useState({ a: toLocalInput(s.check_in_at), b: s.check_out_at ? toLocalInput(s.check_out_at) : '', rate: String(s.hourly_rate || 0), note: s.note || '' });
    const set = (k, v) => setF(x => Object.assign({}, x, { [k]: v }));
    const [msg, setMsg] = useState('');
    const save = async () => {
      setMsg('');
      if (!f.a) { setMsg('Nhập giờ vào.'); return; }
      const rate = Number(f.rate);
      if (!s.paid_out_at && !(rate >= 0)) { setMsg(errText({ code: 'BAD_RATE' })); return; }
      try {
        await api.updateShift(s.id, new Date(f.a), f.b ? new Date(f.b) : null, f.note);
        if (!s.paid_out_at && rate !== s.hourly_rate) await api.setShiftRate([s.id], rate);
        closeSheet(); ui.toast('Đã lưu, lương đã tính lại'); rerender();
      } catch (err) { setMsg(errText(err)); }
    };
    return <>
      <SheetHead title={'Ca của ' + s.employee_name} sub={ddmmyyyy(s.check_in_at)} />
      <div className="sh-body">
        <div className="pbig">{['Ảnh vào ca', 'Ảnh ra ca'].map((t, i) => <figure key={t}>{urls[i] ? <img src={urls[i]} alt={t} /> : <div className="ph">Không có ảnh</div>}<figcaption>{t} · {i ? (s.check_out_at ? hhmm(s.check_out_at) : 'chưa ra ca') : hhmm(s.check_in_at)}</figcaption></figure>)}</div>
        {s.check_out_at ? <p className="msg msg-ok"><Html html={payLine(s)} /><br /><span className="small">Quy tắc của ca này: <Html html={ruleText(s)} /></span></p> : null}
        {isOwner() ? <><h3 className="box-title" style={{ margin: 0 }}>Sửa giờ (khi nhân viên quên chấm)</h3><div className="grid2"><label className="field" htmlFor="sIn">Giờ vào<input id="sIn" type="datetime-local" value={f.a} onChange={x => set('a', x.target.value)} /></label><label className="field" htmlFor="sOut">Giờ ra<input id="sOut" type="datetime-local" value={f.b} onChange={x => set('b', x.target.value)} /></label></div>
          <label className="field" htmlFor="sRate">Lương mỗi giờ của ca này (VNĐ)<input id="sRate" className="num" type="number" min="0" step="1000" value={f.rate} disabled={!!s.paid_out_at} onChange={x => set('rate', x.target.value)} /></label>
          <p className="small muted" style={{ margin: '-4px 0 0' }}>{s.paid_out_at ? 'Ca đã đánh dấu trả nên không đổi lương được. Thiếu thì trả bù bên ngoài.' : 'Sửa khi quên đổi lương cho ca này. Chỉ đổi ca này, không đổi lương của nhân viên.'}</p>
          <label className="field" htmlFor="sNote">Ghi chú<input id="sNote" maxLength={200} value={f.note} onChange={x => set('note', x.target.value)} /></label><Msg msg={msg} id="sMsg" /></> : null}</div>
      {isOwner() ? <div className="sh-foot"><button className="btn grow" type="button" id="sSave" onClick={save}>Lưu và tính lại lương</button></div> : null}
    </>;
  }
  openSheet(<Sheet key={Date.now()} />, { wide: true });
}
