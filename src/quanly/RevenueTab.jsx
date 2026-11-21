/* Tab "Doanh thu" (React): thống kê, biểu đồ, món bán chạy, ưu đãi đã bán, hoá đơn trong ngày.
   Biểu đồ SVG vẫn do hàm cũ vẽ (barChart / wireChart). Tự cập nhật khi có đơn thu xong / tiền QR loa về. */
import { useEffect, useRef, useState } from 'react';
import { Html, Island, Loading, ErrMsg, InlineConfirm } from './common.jsx';

function InvoiceBox({ q }) {
  const { api, BN, state, ui, startOfDay, addDays, ddmm, hhmm, vnd, ymd, invMatch, invoiceItems, isOwner, errText, PAY, PAY_COLOR } = q;
  const [dayStr, setDayStr] = useState(state.invDay);
  const [tab, setTab] = useState(state.invTab);
  const [query, setQuery] = useState(state.invQ);
  const [all, setAll] = useState(null);
  const [err, setErr] = useState(null);
  const [tick, setTick] = useState(0);
  const [pick, setPick] = useState(null); // khoản "không gắn mã" đang hỏi bỏ
  const [busy, setBusy] = useState(false);
  const day = dayStr ? new Date(dayStr + 'T00:00:00') : startOfDay(new Date()), isToday = ymd(day) === ymd(new Date());

  useEffect(() => {
    let live = true; setAll(null); setErr(null);
    api.sales({ from: day, to: addDays(day, 1) }).then(list => { if (live) setAll(list.slice().sort((a, b) => a.paid_at < b.paid_at ? 1 : -1)); }, e => { if (live) setErr(e); });
    return () => { live = false; };
  }, [dayStr, tick]);
  useEffect(() => { // hôm nay: tiền QR loa về / khớp đơn thì tải lại
    if (!isToday || !api.onBankTxn) return;
    const off = api.onBankTxn(t => { if (t && (t.status === 'khong_ma' || t.status === 'da_khop')) setTick(x => x + 1); });
    return () => { try { off && off(); } catch (e) { /* bỏ qua */ } };
  }, [isToday]);

  const goDay = d => { let v = d === 0 ? null : ymd(addDays(day, d)); if (v === ymd(new Date())) v = null; state.invDay = v; setDayStr(v); };
  const pickDate = v => { const x = v && v !== ymd(new Date()) ? v : null; state.invDay = x; setDayStr(x); };
  const km = tab === 'khong_ma';
  const kmN = all ? all.filter(x => x.source === 'khong_ma').length : 0;

  let content;
  if (err) content = <p className="msg">{errText(err)}</p>;
  else if (!all) content = <Loading />;
  else {
    const pool = all.filter(x => (x.source === 'khong_ma') === km);
    const words = BN.fold(query).split(/\s+/).filter(Boolean), list = words.length ? pool.filter(x => invMatch(x, words)) : pool;
    const sumOf = l => l.reduce((t, x) => t + x.total, 0);
    if (km) {
      content = <>
        <p className="small muted" style={{ margin: '6px 0 8px' }}>{words.length ? 'Tìm thấy ' + list.length + '/' + pool.length : list.length} khoản · <b className="num">{vnd(sumOf(list))}</b> · đã tính vào doanh thu (chuyển khoản)</p>
        <p className="small muted" style={{ margin: '0 0 8px' }}>Khách chuyển qua QR cửa hàng nhưng không có mã đơn (thường là khách gọi mồm, quét QR dán trên loa). Nếu một khoản thực ra là tiền của đơn đã bấm thu tay, bấm <b>Bỏ</b> để không bị tính 2 lần.</p>
        {!list.length ? <p className="empty">Không có khoản nào trong ngày này.</p> : <>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Lúc</th><th>Người chuyển</th><th className="r">Số tiền</th><th></th></tr></thead><tbody>
            {list.map(x => <tr key={x.id}><td className="num">{hhmm(x.paid_at)}</td><td className="who"><b>{x.customer_name || 'Khách quét QR'}</b></td><td className="r num">{vnd(x.total)}</td>
              <td className="r">{isOwner() && <button className="btn btn-sm btn-line" type="button" onClick={() => setPick(x.id)}>Bỏ</button>}</td></tr>)}</tbody></table></div>
          <InlineConfirm open={!!pick} busy={busy} text="Bỏ khoản này khỏi doanh thu? Chỉ làm khi khoản đó đã được tính ở một đơn khác (đã bấm thu tay)." okLabel="Bỏ khỏi doanh thu"
            onNo={() => setPick(null)} onYes={async () => { setBusy(true); try { await api.unlinkSale(pick); ui.toast('Đã bỏ khỏi doanh thu'); setPick(null); setTick(x => x + 1); } catch (e) { ui.toast(errText(e)); } setBusy(false); }} />
        </>}
      </>;
    } else if (!pool.length) content = <p className="empty">Không có hoá đơn nào trong ngày này.</p>;
    else if (!list.length) content = <p className="empty">Không có hoá đơn nào khớp “{query.trim()}” trong ngày {ddmm(day)}. Thử đổi ngày hoặc gõ ngắn hơn.</p>;
    else content = <>
      <p className="small muted" style={{ margin: '6px 0 8px' }}>{words.length ? 'Tìm thấy ' + list.length + '/' + pool.length : list.length} hoá đơn · <b className="num">{vnd(sumOf(list))}</b> · tiền mặt {vnd(sumOf(list.filter(x => x.payment_method === 'tien_mat')))} · chuyển khoản {vnd(sumOf(list.filter(x => x.payment_method === 'chuyen_khoan')))}</p>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Lúc</th><th>Số</th><th>Khách</th><th>Món</th><th className="r">Tổng</th><th>Trả bằng</th></tr></thead><tbody>
        {list.map(x => <tr key={x.id}><td className="num">{hhmm(x.paid_at)}</td>
          <td className="num">{x.dine_type === 'giao_hang' ? <span className="pill pill-mute">Đi ship</span> : x.dine_type === 'mang_ve' ? <span className="pill pill-mute">Mang về</span> : x.queue_number}</td>
          <td className="who">{x.customer_name ? <><b>{x.customer_name}</b>{x.customer_phone && <><br /><span className="small muted">{x.customer_phone}</span></>}{x.address && <><br /><span className="small muted">{x.address}</span></>}</> : <span className="muted">—</span>}</td>
          <td><Html html={invoiceItems(x.items || [])} /></td><td className="r num">{vnd(x.total)}</td>
          <td><span className="pill" style={{ background: PAY_COLOR[x.payment_method] + '1F', color: 'var(--ink)' }}>{PAY[x.payment_method]}</span></td></tr>)}
      </tbody></table></div>
    </>;
  }

  return (
    <section className="box cc-nau" id="invBox">
      <div className="ptitle" style={{ gap: 8 }}><h2 className="box-title" style={{ margin: 0 }}><span>Hoá đơn {isToday ? 'hôm nay' : 'ngày ' + ddmm(day)}</span></h2>
        <div className="row inv-nav"><button className="btn btn-sm btn-line" type="button" aria-label="Ngày trước" onClick={() => goDay(-1)}>‹</button>
          <input type="date" id="invDay" value={ymd(day)} max={ymd(new Date())} aria-label="Chọn ngày" onChange={e => pickDate(e.target.value)} />
          <button className="btn btn-sm btn-line" type="button" aria-label="Ngày sau" disabled={isToday} onClick={() => goDay(1)}>›</button>
          {!isToday && <button className="btn btn-sm btn-line" type="button" onClick={() => goDay(0)}>Hôm nay</button>}</div></div>
      <div className="chips" style={{ margin: '8px 0 0' }} role="tablist">
        <button className="chipbtn" type="button" aria-pressed={!km} onClick={() => { state.invTab = 'pos'; setTab('pos'); }}>Hoá đơn</button>
        <button className="chipbtn" type="button" aria-pressed={km} onClick={() => { state.invTab = 'khong_ma'; setTab('khong_ma'); }}>Đơn không gắn mã <span id="invKmN" className="muted">{kmN ? '(' + kmN + ')' : ''}</span></button></div>
      <div className="toolbar" style={{ margin: '8px 0 0' }}><input className="search" id="invQ" type="search" placeholder="Tìm theo số, tên khách, SĐT, món, số tiền…" value={query} aria-label="Tìm hoá đơn" onChange={e => { state.invQ = e.target.value; setQuery(e.target.value); }} /></div>
      <div id="invBody">{content}</div>
    </section>
  );
}

export default function RevenueTab({ q }) {
  const { api, BN, state, vnd, ddmm, addDays, startOfDay, rangeOf, barChart, wireChart, short, isDrinkCat, PAY, PAY_COLOR, promoStatsBox, openExport, errText } = q;
  const [range, setRange] = useState(state.range);
  const [res, setRes] = useState({ data: null, err: null });
  const [tick, setTick] = useState(0);
  const dirty = useRef(false);

  useEffect(() => {
    let live = true;
    const r = rangeOf(range);
    (async () => {
      const sales = await api.sales(r);
      // Món bán chạy tách món ăn / đồ uống theo danh mục của món (món đã xoá: theo nơi làm ghi trên hoá đơn)
      let catOf = new Map();
      try { const m = state.menuData || await api.adminMenu(); const cs = new Map(m.categories.map(c => [c.id, c])); m.items.forEach(it => catOf.set(it.id, cs.get(it.category_id))); } catch (e) { /* không tải được menu */ }
      return { r, sales, catOf };
    })().then(data => { if (live) setRes({ data, err: null }); }, err => { if (live) setRes({ data: null, err }); });
    return () => { live = false; };
  }, [range, tick]);

  // Tự cập nhật: đơn thu xong / tiền QR loa về (đợi 1,2 giây gộp tín hiệu; đang gõ / đang mở lớp đè / ẩn trang thì để lúc quay lại)
  useEffect(() => {
    if (!api.onSalesChange) return;
    let t = null;
    const busyNow = () => document.hidden || (document.getElementById('bnOverlay') && !document.getElementById('bnOverlay').hidden) || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.getElementById('main').contains(document.activeElement));
    const off = api.onSalesChange(() => { clearTimeout(t); t = setTimeout(() => { if (busyNow()) dirty.current = true; else setTick(x => x + 1); }, 1200); });
    const vis = () => { if (!document.hidden && dirty.current) { dirty.current = false; setTick(x => x + 1); } };
    document.addEventListener('visibilitychange', vis);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', vis); try { off && off(); } catch (e) { /* bỏ qua */ } };
  }, []);

  if (res.err) return <ErrMsg q={q} err={res.err} />;
  if (!res.data) return <Loading />;
  const { r, sales, catOf } = res.data;
  const total = sales.reduce((s, x) => s + x.total, 0), count = sales.length;
  const avgOf = st => { const v = sales.map(x => x.station_minutes && x.station_minutes[st]).filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const avgBep = avgOf('bep'), avgBar = avgOf('pha_che');
  // Quầy thu tiền: đơn chỉ có đồ uống do quầy pha chế thu, còn lại bếp thu
  const payer = x => x.source === 'khong_ma' ? 'khong_ma' : (x.items || []).length && (x.items || []).every(i => i.station === 'pha_che') ? 'pha_che' : 'bep';
  const byCounter = { bep: { n: 0, tien_mat: 0, chuyen_khoan: 0 }, pha_che: { n: 0, tien_mat: 0, chuyen_khoan: 0 }, khong_ma: { n: 0, tien_mat: 0, chuyen_khoan: 0 } };
  sales.forEach(x => { const c = byCounter[payer(x)]; c.n++; c[x.payment_method] = (c[x.payment_method] || 0) + x.total; });
  let buckets;
  if (range === 'today') {
    let h0 = 8, h1 = 22; sales.forEach(x => { const h = new Date(x.paid_at).getHours(); h0 = Math.min(h0, h); h1 = Math.max(h1, h); });
    buckets = []; for (let h = h0; h <= h1; h++) buckets.push({ label: h + 'h', label2: h + ':00–' + (h + 1) + ':00', value: 0, count: 0 });
    sales.forEach(x => { const b = buckets[new Date(x.paid_at).getHours() - h0]; b.value += x.total; b.count++; });
  } else {
    buckets = []; for (let d = new Date(r.from); d < r.to; d = addDays(d, 1)) buckets.push({ key: d.toDateString(), label: ddmm(d), label2: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()] + ' ' + ddmm(d), value: 0, count: 0 });
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    sales.forEach(x => { const i = idx.get(startOfDay(x.paid_at).toDateString()); if (i != null) { buckets[i].value += x.total; buckets[i].count++; } });
  }
  buckets.forEach(b => { b.tip = (b.label2 || b.label) + ': ' + vnd(b.value) + ', ' + b.count + ' đơn'; });
  const byPay = { tien_mat: 0, chuyen_khoan: 0 }; sales.forEach(x => { byPay[x.payment_method] = (byPay[x.payment_method] || 0) + x.total; });
  const kindOf = i => { const c = catOf.get(i.menu_item_id); return c ? (isDrinkCat(c) ? 'pha_che' : 'bep') : (i.station === 'pha_che' ? 'pha_che' : 'bep'); };
  const items = { bep: new Map(), pha_che: new Map() };
  sales.forEach(x => (x.items || []).forEach(i => { const bag = items[kindOf(i)]; const m = bag.get(i.name) || { name: i.name, qty: 0, rev: 0 }; m.qty += i.qty; m.rev += i.price * i.qty; bag.set(i.name, m); }));
  const topBox = (st, title, cc) => {
    const top = [...items[st].values()].sort((a, b) => b.qty - a.qty || b.rev - a.rev).slice(0, 10), max = top.length ? top[0].qty : 1;
    const sum = [...items[st].values()].reduce((a, t) => ({ q: a.q + t.qty, r: a.r + t.rev }), { q: 0, r: 0 });
    return <section className={'box ' + cc}><h2 className="box-title"><span>{title}</span></h2>
      {top.length ? <><p className="small muted" style={{ margin: '0 0 8px' }}>Tổng {sum.q} phần · {vnd(sum.r)}</p><div className="hbars">{top.map((t, k) => (
        <div className="hbar" key={t.name}><span className="nm">{k + 1}. {t.name}</span><span className="track"><span className="fill" style={{ width: (t.qty / max * 100) + '%', display: 'block' }}></span></span><span className="num small"><b>{t.qty}</b> phần · {short(t.rev)}</span></div>
      ))}</div></> : <p className="empty">Chưa có món nào bán ra.</p>}</section>;
  };
  const pickRange = k => { state.range = k; setRange(k); };
  const chartKey = range + ':' + buckets.map(b => b.value).join(',');

  return (
    <>
      <div className="ptitle"><h1>Doanh thu</h1>{BN.FEATURES.report && <button className="btn btn-sm" type="button" id="xlsBtn" onClick={openExport}>Xuất Excel tháng</button>}
        <div className="chips">{[['today', 'Hôm nay'], ['7d', '7 ngày'], ['30d', '30 ngày'], ['month', 'Tháng này']].map(([k, t]) => <button key={k} className="chipbtn" type="button" aria-pressed={range === k} onClick={() => pickRange(k)}>{t}</button>)}</div></div>
      <div className="stats">
        <div className="stat"><span>Doanh thu</span><b className="num">{vnd(total)}</b><small>{r.label}</small></div>
        <div className="stat"><span>Số đơn</span><b className="num">{count}</b><small>đã thanh toán</small></div>
        <div className="stat"><span>Trung bình / đơn</span><b className="num">{count ? vnd(total / count) : '–'}</b></div>
        <div className="stat"><span>Thời gian làm TB</span><b className="num">{(avgBep != null ? avgBep + "'" : '–') + ' · ' + (avgBar != null ? avgBar + "'" : '–')}</b><small>bếp · pha chế, từ lúc nhận tới ra món</small></div></div>
      <section className="box cc-xanhla"><h2 className="box-title"><span>Tiền theo quầy</span></h2><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Quầy thu</th><th className="r">Số đơn</th><th className="r">Tiền mặt</th><th className="r">Chuyển khoản</th><th className="r">Tổng</th></tr></thead><tbody>
        {[['bep', 'Bếp nóng'], ['pha_che', 'Quầy pha chế'], ['khong_ma', 'Đơn không gắn mã (QR loa)']].filter(([k]) => k !== 'khong_ma' || byCounter.khong_ma.n).map(([k, t]) => { const c = byCounter[k]; return (
          <tr key={k}><td><b>{t}</b></td><td className="r num">{c.n}</td><td className="r num">{vnd(c.tien_mat)}</td><td className="r num">{vnd(c.chuyen_khoan)}</td><td className="r num"><b>{vnd(c.tien_mat + c.chuyen_khoan)}</b></td></tr>); })}
      </tbody></table></div><p className="small muted" style={{ margin: '8px 0 0' }}>Dùng cột Tiền mặt để đối chiếu tiền trong két của từng quầy cuối ca.</p></section>
      <section className="box cc-hong"><h2 className="box-title"><span>{range === 'today' ? 'Theo giờ' : 'Theo ngày'}</span></h2>
        <div className="chart" id="chart"><Island key={chartKey} html={barChart(buckets)} wire={el => wireChart(el, buckets)} deps={[chartKey]} /></div></section>
      <section className="box cc-xanhduong"><h2 className="box-title"><span>Cách thanh toán</span></h2>
        {total ? <><div className="split">{['tien_mat', 'chuyen_khoan'].filter(k => byPay[k]).map(k => <span key={k} style={{ width: (byPay[k] / total * 100) + '%', background: PAY_COLOR[k] }} title={PAY[k]}></span>)}</div>
          <div className="legend">{['tien_mat', 'chuyen_khoan'].map(k => <span key={k}><i style={{ background: PAY_COLOR[k] }}></i>{PAY[k]}: <b className="num">{vnd(byPay[k])}</b> ({Math.round(byPay[k] / total * 100)}%)</span>)}</div></>
          : <p className="empty">Chưa có đơn.</p>}</section>
      <div className="two">{topBox('bep', 'Món ăn bán chạy', 'cc-vang')}{topBox('pha_che', 'Trà sữa · đồ uống bán chạy', 'cc-hong')}</div>
      <Html html={promoStatsBox(sales)} />
      <InvoiceBox q={q} />
    </>
  );
}
