/* Tab "Cài đặt" (React). Ô tài khoản ngân hàng và ô tự xác nhận chuyển khoản vẫn dùng mã cũ (Island). */
import { useEffect, useRef, useState } from 'react';
import { Html, Island, useLoad, Loading, ErrMsg, InlineConfirm } from './common.jsx';

const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

function Qr({ q, text, size }) {
  const ref = useRef(null);
  useEffect(() => {
    let live = true;
    q.loadScript(QR_LIB).then(() => { if (live && ref.current) { ref.current.innerHTML = ''; new window.QRCode(ref.current, { text, width: size, height: size, colorDark: '#3B2A24', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M }); } }).catch(() => { /* cần mạng */ });
    return () => { live = false; };
  }, [text]);
  return <div className="qr" ref={ref}></div>;
}

export default function SettingsTab({ q }) {
  const { api, ui, BN, esc, isExact, MODE, PAY_STEPS, payLine, applyRounding, errText, DEMO, qrTables, openFbSettings, bankBoxHtml, sepayBoxHtml, wireBankBox, wireSepayBox } = q;
  const { data: cfg, err } = useLoad(() => api.settings());
  const [f, setF] = useState(null);
  const [n, setN] = useState(qrTables());
  const [qrOk, setQrOk] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  useEffect(() => {
    if (cfg) setF({ name: cfg.shop_name, roundOn: !isExact(cfg), step: isExact(cfg) ? 15 : cfg.round_minutes, mode: cfg.round_mode, pay: Number(cfg.pay_round || 1000), cap: cfg.kitchen_capacity, bar: cfg.bar_capacity || 2 });
  }, [cfg]);
  useEffect(() => { q.loadScript(QR_LIB).then(() => setQrOk(true), () => setQrOk(false)); }, []);

  if (err) return <ErrMsg q={q} err={err} />;
  if (!cfg || !f) return <Loading />;
  const orderUrl = new URL('./', location.href).href.split('#')[0].split('?')[0]; // ví dụ https://benoc-pos.pages.dev/ (mã QR ngắn hơn)
  const set = (k, v) => setF(o => Object.assign({}, o, { [k]: v }));
  const rule = { round_minutes: f.roundOn ? Number(f.step) : 1, round_mode: f.mode, pay_round: Number(f.pay) };
  const shift = m => { const pm = applyRounding(m, rule.round_minutes, rule.round_mode); return Object.assign({ actual_minutes: m, paid_minutes: pm, hourly_rate: 25000, pay_amount: BN.roundMoney(pm * 25000 / 60, rule.pay_round) }, rule); };
  const tables = Math.max(1, Math.min(60, Number(n) || 12));
  const changeN = v => { setN(v); try { localStorage.setItem('benoc.qrTables', String(Math.max(1, Math.min(60, Number(v) || 12)))); } catch (e) { /* bỏ qua */ } };
  const save = async () => {
    setSaving(true);
    try { await api.saveSettings({ shop_name: f.name.trim() || 'Bé Nốc', round_minutes: rule.round_minutes, round_mode: f.mode, pay_round: rule.pay_round, kitchen_capacity: Math.max(1, Number(f.cap) || 1), bar_capacity: Math.max(1, Number(f.bar) || 1) }); ui.toast('Đã lưu cài đặt'); }
    catch (e) { ui.toast(errText(e)); }
    setSaving(false);
  };

  return (
    <>
      <div className="ptitle"><h1>Cài đặt</h1></div>
      <section className="box cc-nau"><h2 className="box-title"><span>Quán</span></h2><div className="sh-body" style={{ padding: 0 }}>
        <label className="field" htmlFor="sName">Tên quán<input id="sName" maxLength={40} value={f.name} onChange={e => set('name', e.target.value)} /></label>
        <h3 className="box-title" style={{ margin: '6px 0 0' }}>Tính lương</h3>
        <p className="small muted" style={{ margin: 0 }}>Mặc định tính đúng từng phút làm việc. Chỉ bật làm tròn giờ công nếu quán muốn.</p>
        <label className="switch"><input type="checkbox" id="sRoundOn" checked={f.roundOn} onChange={e => set('roundOn', e.target.checked)} /><span className="track"></span>Làm tròn giờ công</label>
        <div className="grid2" id="sRoundOpts" hidden={!f.roundOn}>
          <label className="field" htmlFor="sStep">Làm tròn theo<select id="sStep" value={f.step} onChange={e => set('step', Number(e.target.value))}>{[5, 10, 15, 30, 60].map(v => <option key={v} value={v}>{v} phút</option>)}</select></label>
          <label className="field" htmlFor="sMode">Cách làm tròn<select id="sMode" value={f.mode} onChange={e => set('mode', e.target.value)}>{Object.keys(MODE).map(k => <option key={k} value={k}>{MODE[k].replace(/^./, c => c.toUpperCase())}</option>)}</select></label></div>
        <label className="field" htmlFor="sPay">Tiền lương mỗi ca bị lẻ<select id="sPay" value={f.pay} onChange={e => set('pay', Number(e.target.value))}>{PAY_STEPS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
        <p className="msg msg-ok" id="sEx">Ví dụ với lương 25.000đ/giờ:<br />• <Html html={payLine(shift(232))} /><br />• <Html html={payLine(shift(248))} /></p>
        <div className="grid2"><label className="field" htmlFor="sCap">Số đơn bếp làm cùng lúc<input id="sCap" type="number" min="1" max="10" value={f.cap} onChange={e => set('cap', e.target.value)} /></label>
          <label className="field" htmlFor="sBar">Số đơn quầy pha chế làm cùng lúc<input id="sBar" type="number" min="1" max="10" value={f.bar} onChange={e => set('bar', e.target.value)} /></label></div>
        <p className="small muted" style={{ margin: 0 }}>Hai số này dùng để ước tính thời gian chờ báo cho khách.</p>
        <p className="small muted" style={{ margin: 0 }}>Cách tính lương mới áp dụng cho các ca kết thúc từ lúc lưu. Ca cũ giữ nguyên cách tính lúc đó.</p>
        <div className="row"><button className="btn" type="button" id="sSave" disabled={saving} onClick={save}>Lưu cài đặt</button></div></div></section>
      <section className="box cc-xanhduong"><h2 className="box-title"><span>Bot lên đơn (Zalo · iPhone)</span></h2>
        <p style={{ margin: '0 0 10px' }}>Chụp màn hình đoạn chat đặt món với khách, gửi cho bot Zalo của quán (hoặc gõ lưng iPhone bằng Phím tắt) → đơn vào thẳng bếp / pha chế với nhãn <b>ĐƠN ONLINE</b>.</p>
        <div className="row"><button className="btn btn-line" type="button" id="sBot" onClick={() => openFbSettings(cfg)}>Cài đặt bot</button></div></section>
      {BN.FEATURES.vietqr && <Island html={bankBoxHtml(cfg) + sepayBoxHtml()} wire={el => { wireBankBox(el, cfg); wireSepayBox(el); }} />}
      <section className="box cc-vang"><h2 className="box-title"><span>Mã QR chung (khách tự điền số)</span></h2>
        <p style={{ margin: '0 0 10px' }}>Một mã dùng cho mọi chỗ ngồi. Khách quét, tự nhập số thẻ ở bàn (hoặc chọn mang về) rồi gọi cả đồ ăn và đồ uống. Mã này vẫn dùng được song song với mã theo bàn.</p>
        <p className="small muted" style={{ margin: '0 0 10px' }}>Mỗi lần quét, khách có {BN.CONFIG.ORDER_SESSION_MINUTES || 30} phút để gửi đơn; hết giờ phải quét lại (chống gọi món khi đã về nhà). Mã đã in vẫn dùng được, không cần in lại.</p>
        <figure className="qr-cell" style={{ margin: 0 }}><Qr q={q} text={orderUrl} size={180} /><figcaption>Mã chung</figcaption></figure></section>
      <section className="box cc-vang"><h2 className="box-title"><span>Mã QR gọi món theo bàn</span></h2>
        <p style={{ margin: '0 0 10px' }}>Mỗi bàn một mã. Khách quét là tự điền số bàn, gọi cả đồ ăn và đồ uống; món ăn về bếp, đồ uống về quầy pha chế, nhân viên mang tới đúng bàn. Mã QR cũ (thẻ số) vẫn dùng được.</p>
        <div className="row" style={{ alignItems: 'flex-end' }}><label className="field" htmlFor="qN" style={{ maxWidth: 160 }}>Số bàn<input id="qN" className="num" type="number" min="1" max="60" value={n} onChange={e => changeN(e.target.value)} /></label>
          <a className="btn btn-sm btn-line" href="index.html?ban=1" target="_blank">Thử mã bàn 1</a></div>
        <div className="qr-grid" id="qrGrid">{qrOk
          ? Array.from({ length: tables }, (_, i) => <figure className="qr-cell" key={i}><Qr q={q} text={orderUrl + '?ban=' + (i + 1)} size={150} /><figcaption>Bàn {i + 1}</figcaption></figure>)
          : <p className="msg">Không tạo được mã QR (cần mạng).</p>}</div>
        {DEMO && <p className="small muted" style={{ margin: 0 }}>Bản xem thử: khi đưa trang lên mạng, mã sẽ tự trỏ tới địa chỉ thật.</p>}</section>
      {DEMO && <section className="box"><h2 className="box-title">Dữ liệu xem thử</h2><p className="muted" style={{ marginTop: 0 }}>Đưa mọi thứ về như lúc đầu: menu, đơn, ca làm.</p>
        <button className="btn btn-danger" type="button" onClick={() => setResetOpen(true)}>Xoá dữ liệu xem thử</button>
        <InlineConfirm open={resetOpen} text="Xoá toàn bộ thay đổi trong bản xem thử?" okLabel="Xoá và tải lại" onYes={() => { api.demoReset(); location.reload(); }} onNo={() => setResetOpen(false)} /></section>}
    </>
  );
}
