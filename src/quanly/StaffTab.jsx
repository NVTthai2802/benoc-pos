/* Bước 3 — tab "Nhân viên" của trang Quản lý, viết lại bằng React.
   Giữ nguyên giao diện (class CSS cũ) và cách tính lương của bản cũ.
   Các hộp thoại (sửa nhân viên, xem ca, trả lương) vẫn dùng mã cũ, truyền vào qua `actions`;
   lưu xong, mã cũ gọi vẽ lại cả tab như trước. */
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

const RANGES = [['week', 'Tuần này'], ['month', 'Tháng này'], ['prev', 'Tháng trước'], ['30d', '30 ngày']];

function MonthBox({ k, title, sub, P, cc, withPrev, prevPay, diff, h, onPayout }) {
  const { vnd, dur } = h;
  return (
    <section className={'box ' + cc}>
      <h2 className="box-title"><span>{title}</span> <small className="muted" style={{ font: '400 13px/1.3 var(--f-body, inherit)' }}>{sub}</small></h2>
      <div className="paygrid">
        <div className="stat pay-total">
          <span>Tổng lương · {P.tot.n} ca · {dur(P.tot.mins)}</span><b className="num">{vnd(P.tot.pay)}</b>
          {withPrev && <small>{diff}</small>}
        </div>
        <div className="stat"><span>Đã trả</span><b className="num" style={{ color: 'var(--ok)' }}>{vnd(P.tot.out)}</b></div>
        <div className="stat">
          <span>Còn phải trả</span><b className="num" style={P.tot.unpaid ? { color: 'var(--red)' } : undefined}>{vnd(P.tot.unpaid)}</b>
          {!(P.tot.unpaid || !P.tot.n) && <small>đã trả đủ</small>}
        </div>
      </div>
      {P.list.length ? (
        <div className="tbl-wrap"><table className="tbl paytbl">
          <thead><tr><th>Nhân viên</th><th className="r">Lương</th><th className="r">Còn nợ</th><th></th></tr></thead>
          <tbody>
            {P.list.map(x => (
              <tr key={x.id}>
                <td><b>{x.name}</b><br /><span className="small muted num">{x.n} ca · {dur(x.mins)}</span>{x.open ? <><br /><span className="pill pill-warn">Đang làm</span></> : null}</td>
                <td className="r num"><b>{vnd(x.pay)}</b>{withPrev && <><br /><span className="small muted">T.trước {prevPay.has(x.id) ? vnd(prevPay.get(x.id)) : '0đ'}</span></>}</td>
                <td className="r num" style={x.unpaid ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{vnd(x.unpaid)}</td>
                <td className="r">{x.unpaidIds.length ? <button className="btn btn-sm btn-soft" type="button" onClick={() => onPayout(k, x)}>Trả</button> : x.n ? <span className="pill pill-ok">Đủ</span> : null}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th>Tổng</th><th className="r num">{vnd(P.tot.pay)}</th><th className="r num">{vnd(P.tot.unpaid)}</th><th></th></tr></tfoot>
        </table></div>
      ) : <p className="empty">Chưa có ca nào trong tháng này.</p>}
    </section>
  );
}

/* Ảnh vào / ra ca: đường dẫn xem ảnh có hạn nên tải lúc vẽ */
function Photos({ s, api, onOpen }) {
  const [urls, setUrls] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.all([s.check_in_photo, s.check_out_photo].map(p => p ? api.photoUrl(p).catch(() => null) : null)).then(u => { if (live) setUrls(u); });
    return () => { live = false; };
  }, [s.id]);
  const list = urls || [s.check_in_photo ? 'wait' : null, s.check_out_photo ? 'wait' : null];
  return (
    <span className="photos">
      {list.map((u, j) => u && u !== 'wait'
        ? <button key={j} type="button" aria-label={'Xem ảnh ' + (j ? 'ra' : 'vào') + ' ca'} onClick={onOpen}><img src={u} alt="" /></button>
        : <span key={j} className="ph" title={u ? undefined : 'Không có ảnh'}></span>)}
    </span>
  );
}

function StaffTab({ api, h, ui, ui_state, actions }) {
  const { vnd, dur, ddmm, hhmm, isExact, staffRangeOf, payBy, mmyyyy, startOfDay, addDays, ROLE, errText } = h;
  const [range, setRange] = useState(ui_state.staffRange);
  const [emp, setEmp] = useState(ui_state.shiftEmp || '');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const today = startOfDay(new Date());
  const m0 = new Date(today.getFullYear(), today.getMonth(), 1), m1 = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const r = staffRangeOf(range);

  useEffect(() => {
    let live = true;
    const from = r.from < m1 ? r.from : m1;
    Promise.all([api.employees(), api.shifts({ from, to: addDays(today, 1) })])
      .then(([emps, all]) => { if (live) setData({ emps, all }); })
      .catch(e => { if (live) setErr(errText(e)); });
    return () => { live = false; };
  }, [range]);

  const calc = useMemo(() => {
    if (!data) return null;
    const { all } = data;
    const inRange = (s, a, b) => { const t = new Date(s.check_in_at); return t >= a && t < b; };
    const cur = payBy(all.filter(s => inRange(s, m0, addDays(today, 1)))), prev = payBy(all.filter(s => inRange(s, m1, m0)));
    const shifts = all.filter(s => inRange(s, r.from, r.to));
    const prevPay = new Map(prev.list.map(x => [x.id, x.pay]));
    // So sánh công bằng: tháng này (tới hôm nay) với cùng số ngày đầu tháng trước
    const sameDay = new Date(m1.getFullYear(), m1.getMonth(), Math.min(today.getDate(), new Date(m0 - 1).getDate()) + 1);
    const prevSame = payBy(all.filter(s => inRange(s, m1, sameDay))).tot.pay;
    return { cur, prev, shifts, prevPay, sameDay, prevSame };
  }, [data, range]);

  if (err) return <p className="msg">{err}</p>;
  if (!calc) return <p className="loading">Đang tải…</p>;
  const { emps, all } = data;
  const { cur, prev, shifts, prevPay, sameDay, prevSame } = calc;
  const shown = emp ? shifts.filter(s => s.employee_id === emp) : shifts;

  const diff = (() => {
    const a = cur.tot.pay, b = prevSame;
    if (!b) return a ? 'Cùng kỳ tháng trước: 0đ' : '';
    const d = a - b, p = Math.round(d / b * 100);
    return <>Cùng kỳ tháng trước (01–{String(sameDay.getDate() - 1).padStart(2, '0')}/{String(m1.getMonth() + 1).padStart(2, '0')}): {vnd(b)} <b style={{ color: d >= 0 ? 'var(--ok)' : 'var(--red)' }}>{(d >= 0 ? '▲ +' : '▼ ') + p}%</b></>;
  })();
  const onPayout = (k, x) => actions.payout(x, k === 'prev' ? 'tháng ' + mmyyyy(m1) : 'tháng ' + mmyyyy(m0));
  const pickRange = k => { ui_state.staffRange = k; setRange(k); };
  const pickEmp = v => { ui_state.shiftEmp = v; setEmp(v); };

  return (
    <>
      <div className="ptitle"><h1>Nhân viên</h1></div>
      <MonthBox k="cur" title={'Lương tháng này · ' + mmyyyy(m0)} sub="từ 01 tới hôm nay" P={cur} cc="cc-xanhduong" withPrev prevPay={prevPay} diff={diff} h={h} onPayout={onPayout} />
      <MonthBox k="prev" title={'Lương tháng trước · ' + mmyyyy(m1)} sub="đã chốt cả tháng" P={prev} cc="cc-tim" withPrev={false} prevPay={prevPay} h={h} onPayout={onPayout} />
      <p className="small muted" style={{ margin: '-4px 2px 14px' }}>Ca thuộc tháng theo ngày vào ca. Ca đang làm dở chưa có tiền, tính khi ra ca. Nút <b>Trả</b> chỉ đánh dấu các ca chưa trả của đúng tháng đó.</p>

      <section className="box cc-vang">
        <div className="ptitle"><h2 className="box-title" style={{ margin: 0 }}><span>Danh sách nhân viên</span></h2>
          <button className="btn btn-sm" type="button" onClick={() => actions.editEmployee(null)}>+ Thêm nhân viên</button></div>
        <ul className="list">
          {emps.map(e => (
            <li key={e.id}><button className="lrow" style={{ gridTemplateColumns: '1fr auto' }} type="button" onClick={() => actions.editEmployee(e)}>
              <span className="lmain"><span className="lname">{e.full_name}{!e.is_active && <> <span className="pill pill-mute">Đã nghỉ</span></>}</span>
                <span className="lsub num">{ROLE[e.role]}{e.phone ? ' · ' + e.phone : ''}</span></span>
              <span className="lside num">{e.hourly_rate ? vnd(e.hourly_rate) + '/giờ' : ''}</span>
            </button></li>
          ))}
        </ul>
      </section>

      <section className="box cc-cam">
        <div className="ptitle"><h2 className="box-title" style={{ margin: 0 }}><span>Các ca làm · {r.label.toLowerCase()}</span></h2>
          <div className="chips">{RANGES.map(([k, t]) => <button key={k} className="chipbtn" type="button" aria-pressed={range === k} onClick={() => pickRange(k)}>{t}</button>)}</div></div>
        <label className="field" htmlFor="shEmp" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>Xem
          <select id="shEmp" style={{ width: 'auto' }} value={emp} onChange={e => pickEmp(e.target.value)}>
            <option value="">Tất cả</option>
            {emps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select></label>
        {shown.length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Ngày</th><th>Nhân viên</th><th>Vào – ra</th><th>Ảnh</th><th className="r">Thời gian làm</th><th className="r">Tiền</th><th></th></tr></thead>
            <tbody>{shown.map(s => {
              const open = () => actions.editShift(all.find(x => x.id === s.id));
              return (
                <tr key={s.id}>
                  <td className="num">{ddmm(s.check_in_at)}</td><td>{s.employee_name}</td>
                  <td className="num">{hhmm(s.check_in_at)} – {s.check_out_at ? hhmm(s.check_out_at) : <span className="pill pill-warn">Đang làm</span>}{s.note && <><br /><span className="small muted">{s.note}</span></>}</td>
                  <td><Photos s={s} api={api} onOpen={open} /></td>
                  <td className="r num">{s.check_out_at ? (isExact(s) ? dur(s.actual_minutes) : <>{dur(s.actual_minutes)} → <b>{dur(s.paid_minutes)}</b></>) : ''}</td>
                  <td className="r num">{s.check_out_at ? vnd(s.pay_amount) : ''}{s.paid_out_at && <><br /><span className="pill pill-ok">Đã trả</span></>}</td>
                  <td className="r"><button className="btn btn-sm btn-line" type="button" onClick={open}>Xem</button></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <p className="empty">Chưa có ca nào.</p>}
      </section>
    </>
  );
}

/* Gắn tab vào khung #main của trang Quản lý; trả về hàm gỡ (gọi khi chuyển tab) */
export function mountStaffTab(main, props) {
  main.innerHTML = '';
  const root = createRoot(main);
  root.render(<StaffTab {...props} />);
  return () => root.unmount();
}
