/* Tab "Chấm công" (React). Nhân viên chỉ thấy giờ làm, chủ quán thấy cả tiền lương. */
import { useEffect, useState } from 'react';
import { Html, useLoad, Loading, ErrMsg } from './common';

export default function ClockTab({ q }) {
  const { api, hhmm, dur, ddmm, vnd, isExact, ruleText, payLine, isOwner, state, errText, ui, rerender } = q;
  const { data, err } = useLoad(() => Promise.all([api.myOpenShift(), api.myShifts(30), api.settings()]));
  const [shot, setShot] = useState(null); // { file, url } ảnh vừa chụp
  const [msg, setMsg] = useState('');      // lỗi khi chụp / gửi
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);  // ca vừa ra
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  if (err) return <ErrMsg q={q} err={err} />;
  if (!data) return <Loading />;
  const [open, mine, cfg] = data;
  const money = isOwner(); // nhân viên chỉ xem giờ làm, không hiện tiền lương
  const workMins = s => s.actual_minutes != null ? s.actual_minutes : 0;

  if (done) {
    return (
      <>
        <div className="ptitle"><h1>Chấm công</h1></div>
        <section className="box cc-xanhla clock-card">
          <span className="state">Đã ra ca. Cảm ơn bạn!</span>
          <span>Ca hôm nay: <b className="num">{hhmm(done.check_in_at)} – {hhmm(done.check_out_at)}</b>.</span>
          {money
            ? <><span><Html html={payLine(done)} /></span><span>Lương ca này: <b className="num" style={{ color: 'var(--red)', fontSize: 22 }}>{vnd(done.pay_amount)}</b></span></>
            : <span>Giờ làm ca này: <b className="num" style={{ color: 'var(--red)', fontSize: 22 }}>{dur(workMins(done))}</b></span>}
          <button className="btn btn-line" type="button" onClick={rerender}>Xong</button>
        </section>
      </>
    );
  }

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const month = mine.filter(s => new Date(s.check_in_at) >= monthStart && s.check_out_at);
  const mins = Math.floor(open ? (Date.now() - new Date(open.check_in_at)) / 60000 : 0);

  const onFile = e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    setMsg('');
    // Ảnh phải vừa chụp: ảnh lấy từ thư viện thường có thời điểm cũ
    if (f.lastModified && Date.now() - f.lastModified > 3 * 60e3) { setShot(null); setMsg('stale'); return; }
    setShot({ file: f, url: URL.createObjectURL(f) });
  };
  const confirm = async () => {
    setBusy(true); setMsg('');
    try {
      if (open) setDone(await api.checkOut(shot.file));
      else { await api.checkIn(shot.file); ui.toast('Đã vào ca lúc ' + hhmm(Date.now())); rerender(); }
    } catch (e) { setMsg(errText(e)); setBusy(false); }
  };
  const label = open ? 'Xác nhận ra ca' : 'Xác nhận vào ca';

  return (
    <>
      <div className="ptitle"><h1>Chấm công</h1></div>
      <section className="box cc-cam clock-card" id="clockCard">
        {open
          ? <><span className="state">Bạn đang trong ca</span><span>Vào lúc <b className="num">{hhmm(open.check_in_at)}</b> · đã làm <b className="num">{dur(mins)}</b></span>
            <label className="btn filebtn" htmlFor="shot">Chụp ảnh ra ca<input type="file" accept="image/*" capture="user" id="shot" onChange={onFile} /></label></>
          : <><span className="state">Bạn chưa vào ca</span><span className="muted">Chụp một ảnh mặt bạn tại quán để bắt đầu ca. Giờ được lấy theo máy chủ, không theo điện thoại.</span>
            <label className="btn filebtn" htmlFor="shot">Chụp ảnh vào ca<input type="file" accept="image/*" capture="user" id="shot" onChange={onFile} /></label></>}
        {money && <span className="small muted">Cách tính lương: {ruleText(cfg)} · {vnd(state.session.employee.hourly_rate || 0)}/giờ</span>}
        <div id="shotArea">
          {msg === 'stale' && <p className="msg">Ảnh này không phải vừa chụp. Hãy bấm nút và chụp ảnh mới bằng camera.</p>}
          {shot && <>
            <div className="row"><img className="photo-prev" src={shot.url} alt="Ảnh vừa chụp" />
              <div className="row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <button className="btn" type="button" disabled={busy} onClick={confirm}>{busy ? 'Đang gửi…' : label}</button>
                <span className="small muted">Chưa đẹp? Bấm nút chụp ở trên để chụp lại.</span></div></div>
            {msg && msg !== 'stale' && <p className="msg">{msg}</p>}
          </>}
        </div>
      </section>
      {money
        ? <div className="stats" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
            <div className="stat"><span>Ca tháng này</span><b className="num">{month.length}</b></div>
            <div className="stat"><span>Giờ làm tháng này</span><b className="num">{dur(month.reduce((s, x) => s + (x.paid_minutes || 0), 0))}</b></div>
            <div className="stat"><span>Lương tháng này</span><b className="num">{vnd(month.reduce((s, x) => s + (x.pay_amount || 0), 0))}</b></div></div>
        : <div className="stats" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            <div className="stat"><span>Ca tháng này</span><b className="num">{month.length}</b></div>
            <div className="stat"><span>Tổng giờ làm tháng này</span><b className="num">{dur(month.reduce((s, x) => s + workMins(x), 0))}</b></div></div>}
      <section className="box cc-vang"><h2 className="box-title"><span>Ca gần đây</span></h2>
        {mine.length ? <ul className="list">{mine.map(s => (
          <li key={s.id}><div className="lrow" style={{ gridTemplateColumns: '1fr auto' }}>
            <span className="lmain"><span className="lname num">{ddmm(s.check_in_at)} · {hhmm(s.check_in_at)} – {s.check_out_at ? hhmm(s.check_out_at) : 'đang làm'}</span>
              <span className="lsub">{s.check_out_at && money ? (isExact(s) ? 'Làm ' + dur(s.actual_minutes) : 'Thực tế ' + dur(s.actual_minutes) + ', tính ' + dur(s.paid_minutes)) : ''}{s.note ? ' · ' + s.note : ''}</span></span>
            <span className="lside">{money
              ? <><b className="num">{s.check_out_at ? vnd(s.pay_amount) : ''}</b>{s.paid_out_at ? <span className="pill pill-ok">Đã nhận</span> : s.check_out_at ? <span className="pill pill-mute">Chưa nhận</span> : null}</>
              : <b className="num">{s.check_out_at ? dur(workMins(s)) : ''}</b>}</span>
          </div></li>
        ))}</ul> : <p className="empty">Chưa có ca nào.</p>}
      </section>
    </>
  );
}
