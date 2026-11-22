/* Hộp thoại khác (React): xuất báo cáo Excel, cài đặt bot lên đơn. Bản cũ: …Legacy trong quanly.html (?cu=1). */
import { useEffect, useRef, useState } from 'react';
import { openSheet, closeSheet, SheetHead } from '../../common/sheet.jsx';
import { Msg } from './menu.jsx';

const ym = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
function ExportSheet({ q }) {
  const { ui, errText } = q;
  const now = new Date();
  const [pick, setPick] = useState(ym(now)), [busy, setBusy] = useState(false), [label, setLabel] = useState('Tạo file Excel'), [msg, setMsg] = useState('');
  const go = async () => {
    setBusy(true); setMsg('');
    try {
      const [y, mo] = pick.split('-').map(Number);
      const r = await window.BNReport.build(new Date(y, mo - 1, 1), t => setLabel(t));
      window.BNReport.download(r.blob, r.name); setLabel('Đã tạo ' + r.name); ui.toast('Đã tải file báo cáo (' + r.count + ' hoá đơn)');
    } catch (err) { setMsg('Không tạo được file: ' + errText(err)); setLabel('Tạo file Excel'); }
    setBusy(false);
  };
  return <>
    <SheetHead title="Xuất báo cáo Excel" sub="Báo cáo 1 tháng để tổng hợp cuối tháng" />
    <div className="sh-body">
      <div className="chips">{[[ym(now), 'Tháng này'], [ym(new Date(now.getFullYear(), now.getMonth() - 1, 1)), 'Tháng trước']].map(([v, t]) => <button key={v} className="chipbtn" type="button" data-ym={v} aria-pressed={v === pick} onClick={() => setPick(v)}>{t} ({v.slice(5)}/{v.slice(0, 4)})</button>)}</div>
      <label className="field" htmlFor="xlsMonth">Hoặc chọn tháng<input id="xlsMonth" type="month" value={pick} max={ym(now)} onChange={e => { if (e.target.value) setPick(e.target.value); }} /></label>
      <p className="small muted" style={{ margin: 0 }}>File gồm: Tổng quan (so với tháng trước) · Biểu đồ · Theo ngày · Theo tuần · Theo giờ · Món bán chạy · Ưu đãi · Hoá đơn · Kho hàng · Nhập xuất kho · Nhân viên &amp; lương (tháng này / tháng trước) · Ca làm · Ca làm tháng trước. Mở được bằng Excel, Google Trang tính, WPS trên điện thoại.</p>
      <Msg msg={msg} id="xlsMsg" /></div>
    <div className="sh-foot"><button className="btn btn-block" type="button" id="xlsGo" disabled={busy} onClick={go}>{label}</button></div>
  </>;
}
export const openExport = q => openSheet(<ExportSheet key={Date.now()} q={q} />);

const KENH_TEXT = { zalo: 'Zalo', tele: 'Telegram', fb: 'Fanpage', ios: 'Phím tắt iPhone / App Android' };
/* Dòng kết quả kiểm tra có biểu tượng + chữ đậm: dựng sẵn thành phần tử, không chèn HTML lạ */
function BotSheet({ q, st }) {
  const { api, ui, state, ddmm, errText, rerender } = q;
  const botLink = useRef({ zalo: null, tele: null });
  const [users, setUsers] = useState(null);
  const [code, setCode] = useState(null), [codeBusy, setCodeBusy] = useState(false);
  const [train, setTrain] = useState(null), [trainOn, setTrainOn] = useState(st.fb_train_on !== false);
  const [open, setOpen] = useState(st.fb_open || '07:00'), [close, setClose] = useState(st.fb_close || '22:00');
  const [res, setRes] = useState(''), [msg, setMsg] = useState('');
  const [busy, setBusy] = useState({});
  const live = useRef(true);
  const loadUsers = async () => { const us = await api.botUsers().catch(() => null); if (live.current) setUsers(us || []); };
  useEffect(() => {
    loadUsers();
    api.fbTrainStats().then(x => { if (x && !x.demo && live.current) setTrain(x); }).catch(() => null);
    api.fbCall({ action: 'status' }).then(x => { for (const k of ['zalo', 'tele']) { const c = (x && x.kenh || {})[k]; if (c && c.token && !c.error) { if (k === 'zalo') botLink.current.zalo = c.name; else botLink.current.tele = c.username; } } }).catch(() => null);
    return () => { live.current = false; clearInterval(state.linkTimer); };
  }, []);
  const lock = (k, f) => async () => { setBusy(b => Object.assign({}, b, { [k]: true })); try { await f(); } finally { if (live.current) setBusy(b => Object.assign({}, b, { [k]: false })); } };
  const unlink = (u) => lock('u' + u.kenh + u.chat_id, async () => { try { await api.botUserDel(u.kenh, u.chat_id); ui.toast('Đã gỡ, tài khoản này không dùng bot được nữa'); loadUsers(); } catch (err) { ui.toast(errText(err)); } })();
  const getCode = lock('code', async () => {
    setCodeBusy(true);
    try {
      const r = await api.botLinkCode(); setCode({ r });
      clearInterval(state.linkTimer); const until = Date.now() + 600e3;
      state.linkTimer = setInterval(() => { if (!live.current || Date.now() > until) return clearInterval(state.linkTimer); loadUsers(); }, 4000);
    } catch (err) { setCode({ err: errText(err) }); }
    setCodeBusy(false);
  });
  const exportTrain = lock('exp', async () => {
    setRes('Đang tạo file…');
    try {
      const { rows, menus } = await api.fbTrainExport();
      if (!rows.length) { setRes('Chưa có mẫu nào để tải.'); return; }
      const lines = menus.map(m => JSON.stringify({ type: 'menu', hash: m.hash, menu: m.menu })).concat(rows.map(x => JSON.stringify(Object.assign({ type: 'turn' }, x))));
      window.BNReport.download(new Blob([lines.join('\n') + '\n'], { type: 'application/x-ndjson' }), 'benoc-huan-luyen-' + new Date().toISOString().slice(0, 10) + '.jsonl');
      setRes('✅ Đã tải ' + rows.length + ' mẫu. File chứa đoạn chat của khách (đã ẩn tên, SĐT nhưng còn địa chỉ), đừng đăng công khai.');
    } catch (err) { setRes('❌ ' + errText(err)); }
  });
  const test = lock('test', async () => {
    setRes('Đang kiểm tra…');
    try {
      const x = await api.fbCall({ action: 'status' });
      if (x.demo) { setRes('Bản xem thử: không nối Zalo thật.'); return; }
      const line = k => { const c = (x.kenh || {})[k] || {}; if (!c.token) return null; if (c.error) return <>{'❌ ' + KENH_TEXT[k] + ': token sai (' + c.error.slice(0, 120) + ')'}</>; if (k === 'zalo') botLink.current.zalo = c.name; else botLink.current.tele = c.username;
        return <>{(c.webhook ? '✅ ' : '⚠️ ') + KENH_TEXT[k] + ' '}<b>{c.name || c.username || ''}</b>{c.webhook ? ' · webhook đã cài' : ' · chưa cài webhook, bấm "Cài webhook"'}</>; };
      const ls = [line('zalo'), line('tele')].filter(Boolean);
      const all = (ls.length ? ls : ['❌ Chưa có ZALO_BOT_TOKEN (hoặc TELEGRAM_BOT_TOKEN) trong Supabase Secrets']).concat([x.has_ai_key ? '✅ AI: ' + x.ai : '❌ Chưa có khoá AI', x.phim_tat ? '✅ Phím tắt iPhone: đã có CAPTURE_KEY' : 'ℹ️ Phím tắt iPhone: chưa cài CAPTURE_KEY (không bắt buộc)']);
      setRes(all.map((l, i) => <span key={i}>{i ? <br /> : null}{l}</span>));
    } catch (err) { setRes('❌ ' + errText(err)); }
  });
  const hook = lock('hook', async () => {
    setRes('Đang cài…');
    try {
      const x = await api.fbCall({ action: 'setup' });
      setRes(x.demo ? 'Bản xem thử: không nối Zalo thật.' : Object.keys(x.res || {}).map((k, i) => <span key={k}>{i ? <br /> : null}{(x.res[k] === 'ok' ? '✅ Đã cài webhook ' : '❌ ' + KENH_TEXT[k] + ': ') + (x.res[k] === 'ok' ? KENH_TEXT[k] : x.res[k])}</span>));
    } catch (err) { setRes('❌ ' + errText(err)); }
  });
  const save = async () => {
    const o = open || '07:00', c = close || '22:00';
    if (o >= c) { setMsg('Giờ mở phải trước giờ đóng.'); return; }
    try { const patch = { fb_open: o, fb_close: c }; if (train) patch.fb_train_on = trainOn; await api.fbBotSettings(patch); closeSheet(); ui.toast('Đã lưu cài đặt bot'); rerender(); }
    catch (err) { setMsg(errText(err)); }
  };
  const bl = botLink.current;
  return <>
    <SheetHead title="Cài đặt bot lên đơn" sub="Bot đọc ảnh chụp đoạn chat theo menu đang bán" />
    <div className="sh-body">
      <h3 className="og-head">Tài khoản được dùng bot</h3><ul className="list" id="fsUsers">{users === null ? <li className="small muted">Đang tải…</li> : users.length ? users.map(u => (
        <li key={u.kenh + u.chat_id}><div className="lrow" style={{ gridTemplateColumns: '1fr auto', alignItems: 'center' }}><span className="lmain"><span className="lname">{u.name || 'Không tên'}</span><span className="lsub">{KENH_TEXT[u.kenh]} · kết nối {ddmm(new Date(u.created_at))}</span></span>
          <button className="btn btn-line btn-sm" type="button" data-unlink={u.kenh + '|' + u.chat_id} disabled={!!busy['u' + u.kenh + u.chat_id]} onClick={() => unlink(u)}>Gỡ</button></div></li>)) : <li className="small muted">Chưa có tài khoản nào. Bấm "Lấy mã kết nối".</li>}</ul>
      <div className="row"><button className="btn btn-sm" type="button" id="fsCode" disabled={codeBusy} onClick={getCode}>Lấy mã kết nối</button></div>
      <div id="fsCodeBox" hidden={!code}>{code && (code.err ? '❌ ' + code.err : <><p className="fb-code num">{code.r.code}</p><p className="small">Mở bot <b>{bl.zalo || 'Zalo của quán'}</b> trên Zalo, nhắn đúng 6 số này trong <b>10 phút</b>. Bot trả lời "Đã kết nối" là xong.
        {bl.tele ? <> Dùng Telegram: <a href={'https://t.me/' + encodeURIComponent(bl.tele) + '?start=' + code.r.code} target="_blank" rel="noopener">bấm vào đây</a>.</> : null}</p><p className="small muted">Mỗi mã dùng 1 lần cho 1 tài khoản. Kết nối xong, tên tài khoản tự hiện ở danh sách trên.</p></>)}</div>
      <h3 className="og-head">Giờ nhận đơn</h3>
      <div className="grid2"><label className="field" htmlFor="fsOpen">Từ<input id="fsOpen" type="time" value={open} onChange={e => setOpen(e.target.value)} /></label><label className="field" htmlFor="fsClose">đến<input id="fsClose" type="time" value={close} onChange={e => setClose(e.target.value)} /></label></div>
      <p className="small muted" style={{ margin: '-4px 0 0' }}>Giờ hẹn ngoài khung này, bot báo để bạn kiểm tra lại.</p>
      <div id="fsTrainBox" hidden={!train}><h3 className="og-head">Dữ liệu huấn luyện</h3><label className="check"><input type="checkbox" id="fsTrain" checked={!!train && trainOn} onChange={e => setTrainOn(e.target.checked)} /> Lưu đoạn chat bot chép từ ảnh (đã ẩn tên, SĐT; giữ địa chỉ) để huấn luyện mô hình riêng của quán</label>
        <p className="small muted" id="fsTrainInfo" style={{ margin: 0 }}>{train ? train.total + ' mẫu · ' + train.gold + ' mẫu có đáp án bạn đã duyệt' + (train.gold ? ' (bot đọc đúng ' + Math.round(100 * (train.gold - train.fixed) / train.gold) + '%)' : '') + '.' : ''}</p>
        <div className="row"><button className="btn btn-line btn-sm" type="button" id="fsExport" disabled={!!busy.exp} onClick={exportTrain}>Tải dữ liệu huấn luyện (.jsonl)</button></div></div>
      <h3 className="og-head">Kiểm tra</h3><div className="row"><button className="btn btn-line btn-sm" type="button" id="fsTest" disabled={!!busy.test} onClick={test}>Kiểm tra bot</button><button className="btn btn-line btn-sm" type="button" id="fsHook" disabled={!!busy.hook} onClick={hook}>Cài webhook</button></div><p className="small" id="fsRes">{res}</p>
      <Msg msg={msg} id="fsMsg" /></div>
    <div className="sh-foot"><button className="btn btn-block" type="button" id="fsSave" onClick={save}>Lưu</button></div>
  </>;
}
export const openFbSettings = (q, st) => openSheet(<BotSheet key={Date.now()} q={q} st={st} />);
