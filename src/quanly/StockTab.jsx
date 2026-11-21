/* Tab "Kho" (React): hàng hoá + quy cách nhập hàng. Phiếu nhập / lấy dùng / kiểm kho, quét mã, ảnh hoá đơn vẫn dùng hộp thoại cũ. */
import { useEffect, useRef, useState } from 'react';
import { Html, useLoad, Loading, ErrMsg } from './common';

function Packs({ q, packs, items, subBar }) {
  const { BN, nf, state, editPack } = q;
  const [query, setQuery] = useState(state.packQuery);
  const words = BN.fold(query).split(/\s+/).filter(Boolean);
  const users = pk => items.filter(i => i.pack_id === pk.id);
  const shown = packs.filter(pk => { const t = BN.fold(pk.name + ' ' + pk.buy_unit + ' ' + pk.use_unit + ' ' + users(pk).map(i => i.name).join(' ')); return words.every(w => t.indexOf(w) >= 0); });
  return (
    <>
      <div className="ptitle"><h1>Kho hàng</h1></div>{subBar}
      <div className="toolbar"><input className="search" id="pkq" type="search" placeholder="Tìm quy cách hoặc tên hàng…" value={query} aria-label="Tìm quy cách" onChange={e => { state.packQuery = e.target.value; setQuery(e.target.value); }} />
        <button className="btn" type="button" id="addPack" onClick={() => editPack(null, 0)}>+ Thêm quy cách</button></div>
      <p className="muted small" style={{ margin: '-4px 0 12px' }}>Quy cách dùng chung cho nhiều mặt hàng, ví dụ “Thùng 24 gói”. Sửa quy cách thì mọi mặt hàng đang dùng nó đổi theo.</p>
      <section className="box cc-xanhla"><h2 className="box-title"><span>Quy cách nhập hàng</span></h2>
        {shown.length ? <ul className="list">{shown.map(pk => (
          <li key={pk.id}><button className="lrow" style={{ gridTemplateColumns: '1fr auto', border: 0, background: 'none', padding: 0, textAlign: 'left', color: 'inherit', width: '100%' }} type="button" onClick={() => editPack(pk, users(pk).length)}>
            <span className="lmain"><span className="lname">{pk.name}</span>
              <span className="lsub">{pk.buy_unit === pk.use_unit && Number(pk.per_buy) === 1 ? 'Nhập và dùng theo ' + pk.use_unit : '1 ' + pk.buy_unit + ' = ' + nf(pk.per_buy) + ' ' + pk.use_unit}{users(pk).length ? ' · ' + users(pk).map(i => i.name).join(', ') : ''}</span></span>
            <span className="small muted">{users(pk).length} mặt hàng</span></button></li>
        ))}</ul> : <p className="empty">{words.length ? 'Không có quy cách nào khớp.' : 'Chưa có quy cách nào.'}</p>}
      </section>
    </>
  );
}

export default function StockTab({ q }) {
  const { api, BN, state, isOwner, addDays, vnd, ddmm, hhmm, nf, twoUnits, stockText, isLow, KIND, ICON_SCAN, ICON_BILL, receiptBanner, loadReceiptThumbs,
    openStockMove, openStockItem, editStockItem, scanForMove, newReceiptSheet, openReceipt, rerender } = q;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const { data, err } = useLoad(() => Promise.all([api.stockItems(), api.stockMoves({ limit: 400, from: addDays(monthStart, -1) }), api.stockPacks(), api.stockBarcodes(),
    isOwner() ? api.stockMoves({ kind: 'nhap', from: monthStart, limit: 5000 }).catch(() => null) : null, api.stockReceipts({ limit: 12 })]));
  const [sub, setSub] = useState(state.stockSub);
  const [query, setQuery] = useState(state.stockQuery);
  const root = useRef(null);
  useEffect(() => { if (data && root.current) loadReceiptThumbs(root.current); }, [data, sub]);

  if (err) return <ErrMsg q={q} err={err} />;
  if (!data) return <Loading />;
  const [items, moves, packs, codes, buys, receipts] = data;
  state.receipts = receipts; // null: chưa chạy cập nhật 35 (chưa có ảnh hoá đơn)
  state.stockData = items; state.stockPacks = packs; // packs = null: chưa chạy cập nhật 17
  state.barcodes = codes; // codes = null: chưa chạy cập nhật 21 (chưa có mã vạch)
  const pickSub = k => { state.stockSub = k; setSub(k); };
  const subBar = isOwner() && packs ? <div className="chips">{[['hang', 'Hàng hoá'], ['quycach', 'Quy cách nhập hàng']].map(([k, t]) => <button key={k} className="chipbtn" type="button" aria-pressed={sub === k} onClick={() => pickSub(k)}>{t}</button>)}</div> : null;
  if (isOwner() && packs && sub === 'quycach') return <div ref={root} style={{ display: 'contents' }}><Packs q={q} packs={packs} items={items} subBar={subBar} /></div>;

  const byId = new Map(items.map(i => [i.id, i]));
  const words = BN.fold(query).split(/\s+/).filter(Boolean);
  const codesOf = it => (codes || []).filter(b => b.item_id === it.id).map(b => b.code).join(' ');
  const shown = items.filter(i => words.every(w => BN.fold(i.name + ' ' + (i.grp || '') + ' ' + codesOf(i)).indexOf(w) >= 0));
  const low = shown.filter(isLow);
  // Tiền nhập tháng: lấy riêng các lần nhập trong tháng (danh sách lịch sử chỉ có 400 dòng gần nhất)
  const spent = (buys || moves.filter(m => m.kind === 'nhap' && new Date(m.created_at) >= monthStart)).reduce((t, m) => t + (m.cost || 0), 0);
  const groups = [...new Set(shown.map(i => i.grp || 'Chưa xếp nhóm'))];
  const pack = it => it.pack_id && state.stockPacks && state.stockPacks.find(x => x.id === it.pack_id);
  const row = it => (
    <li key={it.id}><div className={'lrow sk-row' + (isLow(it) ? ' sk-low' : '')}>
      <button className="lmain" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', color: 'inherit' }} type="button" onClick={() => openStockItem(it)}>
        <span className="lname">{it.name}{isLow(it) && <> <span className="pill pill-red">Sắp hết</span></>}{it.is_active === false && <> <span className="pill pill-mute">Ngừng dùng</span></>}</span>
        <span className="lsub"><b className="sk-qty num">{stockText(it)}</b>{twoUnits(it) ? ' · 1 ' + it.buy_unit + ' = ' + nf(it.per_buy) + ' ' + it.use_unit : ''}{pack(it) && <> · <span className="pill pill-mute">{pack(it).name}</span></>}{Number(it.min_qty) ? ' · báo khi còn ≤ ' + nf(it.min_qty) + ' ' + it.use_unit : ''}</span></button>
      <span className="sk-acts"><button className="btn btn-sm" type="button" onClick={() => openStockMove(it, 'nhap')}>Nhập</button><button className="btn btn-sm btn-line" type="button" onClick={() => openStockMove(it, 'dung')}>Lấy dùng</button></span></div></li>
  );
  // Biểu ngữ "đang nhập theo hoá đơn" là HTML cũ, nút "Xong hoá đơn" có id rcDrop
  const onBanner = e => { if (e.target.closest('#rcDrop')) { state.lastReceipt = null; rerender(); } };

  return (
    <div ref={root} style={{ display: 'contents' }}>
      <div className="ptitle"><h1>Kho hàng</h1>{isOwner() && spent ? <span className="pill pill-ok">Tiền nhập tháng này: <b className="num">{vnd(spent)}</b></span> : null}</div>{subBar}
      <div className="toolbar"><input className="search" id="kq" type="search" placeholder="Tìm hàng hoá…" value={query} aria-label="Tìm hàng hoá" onChange={e => { state.stockQuery = e.target.value; setQuery(e.target.value); }} />
        {codes && <button className="btn btn-line sc-btn" type="button" id="scanStock" onClick={scanForMove}><Html html={ICON_SCAN} />Quét mã</button>}
        {receipts && <button className="btn btn-line sc-btn" type="button" id="newReceipt" onClick={newReceiptSheet}><Html html={ICON_BILL} />Ảnh hoá đơn</button>}
        {isOwner() && <button className="btn" type="button" id="addStock" onClick={() => editStockItem(null)}>+ Thêm hàng</button>}</div>
      {receipts && <div onClick={onBanner} style={{ display: 'contents' }}><Html html={receiptBanner()} /></div>}
      {low.length > 0 && <section className="box cc-hong"><h2 className="box-title"><span>Sắp hết · cần nhập thêm</span></h2><ul className="list">{low.map(row)}</ul></section>}
      {shown.length ? groups.map(g => <section key={g} className="box cc-xanhla"><h2 className="box-title"><span>{g}</span></h2><ul className="list">{shown.filter(i => (i.grp || 'Chưa xếp nhóm') === g).map(row)}</ul></section>)
        : <section className="box cc-xanhla"><p className="empty">{words.length ? 'Không có hàng nào khớp.' : 'Chưa có hàng hoá nào.' + (isOwner() ? ' Bấm “+ Thêm hàng”.' : ' Nhờ chủ quán thêm hàng.')}</p></section>}
      {receipts && receipts.length ? <section className="box cc-vang"><h2 className="box-title"><span>Ảnh hoá đơn nhập gần đây</span></h2><div className="rc-grid">{receipts.map(r => (
        <button key={r.id} type="button" className="rc-card" onClick={() => openReceipt(Number(r.id))}><span className="rc-img" data-rcimg={r.photo_path}></span>
          <span className="rc-cap"><b>{r.supplier || r.invoice_no || 'Hoá đơn'}</b><span className="small muted num">{ddmm(r.created_at)} {hhmm(r.created_at)}{r.invoice_no && r.supplier ? ' · ' + r.invoice_no : ''}</span></span></button>
      ))}</div></section> : null}
      <section className="box cc-nau"><h2 className="box-title"><span>Lịch sử kho gần đây</span></h2>
        {moves.length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Lúc</th><th>Hàng</th><th>Việc</th><th className="r">Số lượng</th><th className="r">Tồn sau</th><th>Người</th></tr></thead><tbody>
          {moves.slice(0, 30).map(m => { const it = byId.get(m.item_id) || { use_unit: '', buy_unit: '', per_buy: 1, name: '(đã xoá)' }; return (
            <tr key={m.id}><td className="num">{ddmm(m.created_at)} {hhmm(m.created_at)}</td><td>{it.name}</td>
              <td><span className={'pill ' + KIND[m.kind][1]}>{KIND[m.kind][0]}</span>{m.receipt_id && <><br /><button className="link small" type="button" onClick={() => openReceipt(Number(m.receipt_id))}><Html html={ICON_BILL} />Xem hoá đơn</button></>}{m.note && <><br /><span className="small muted">{m.note}</span></>}</td>
              <td className="r num">{m.kind === 'kiem' ? <>đếm {nf(m.amount)} {m.unit}<br /><span className="small muted">{(m.delta >= 0 ? '+' : '') + nf(m.delta)} {it.use_unit}</span></> : (m.delta >= 0 ? '+' : '−') + nf(m.amount) + ' ' + m.unit}{isOwner() && m.cost ? <><br /><span className="small muted">{vnd(m.cost)}</span></> : null}</td>
              <td className="r num">{stockText(it, m.qty_after)}</td><td>{m.employee_name || ''}</td></tr>); })}
        </tbody></table></div> : <p className="empty">Chưa có lần nhập / lấy hàng nào.</p>}</section>
    </div>
  );
}
