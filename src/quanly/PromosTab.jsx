/* Tab "Ưu đãi" (React). Hộp thoại tạo / sửa ưu đãi vẫn dùng mã cũ (editPromo). */
import { useState } from 'react';
import { useLoad, Loading, ErrMsg } from './common.jsx';

export default function PromosTab({ q }) {
  const { api, BN, state, K, promoWhen, promoState, editPromo, ui, errText, rerender } = q;
  // luôn lấy menu mới: món vừa gạt hết làm ưu đãi bị ẩn
  const { data, err } = useLoad(() => Promise.all([api.adminPromotions(), api.adminMenu(), api.promoUsage()]));
  const [query, setQuery] = useState(state.promoQuery);
  if (err) return <ErrMsg q={q} err={err} />;
  if (!data) return <Loading />;
  const [list, m, used] = data;
  state.menuData = m; state.promoData = list;
  const limitTxt = p => p.limit_qty ? (used[p.id] || 0) + '/' + p.limit_qty + ' ' + (p.kind === 'giam_gia' ? 'ly' : p.kind === 'don_tang' ? 'đơn' : 'suất') + (p.limit_per === 'tong' ? ' cả đợt' : ' hôm nay') : '';
  const nameOf = id => (m.items.find(i => i.id === id) || {}).name || '(món đã xoá)';
  const itemsText = p => p.kind === 'combo'
    ? p.items.filter(i => i.part === 'combo').map(i => i.qty + ' ' + nameOf(i.menu_item_id)).join(' + ')
    : p.kind === 'giam_gia' ? p.items.filter(i => i.part === 'giam').map(i => nameOf(i.menu_item_id)).join(', ')
    : p.kind === 'don_tang' ? (p.need_qty ? 'Mua ≥' + p.need_qty + ' món' : 'Đơn') + (p.min_total ? ' từ ' + K(p.min_total) : '') + (p.dine_types && p.dine_types.length ? ' · ' + p.dine_types.map(d => ({ tai_quan: 'Tại quán', mang_ve: 'Mang về', giao_hang: 'Giao hàng' })[d]).join(', ') : '') + ' · Tặng ' + (p.get_qty > 1 ? p.get_qty + ' ' : '') + (p.gift_name ? p.gift_name + ' (ngoài menu)' : p.items.filter(i => i.part === 'tang').map(i => nameOf(i.menu_item_id)).join(', '))
    : 'Mua ' + p.buy_qty + ': ' + p.items.filter(i => i.part === 'mua').map(i => nameOf(i.menu_item_id)).join(', ') + ' · Tặng ' + p.get_qty + ': ' + (p.gift_same ? 'đúng món khách mua' : p.gift_name ? p.gift_name + ' (ngoài menu)' : p.items.filter(i => i.part === 'tang').map(i => nameOf(i.menu_item_id)).join(', '));
  const words = BN.fold(query).split(/\s+/).filter(Boolean);
  const shown = list.filter(p => { const t = BN.fold(p.name + ' ' + (p.description || '') + ' ' + itemsText(p)); return words.every(w => t.indexOf(w) >= 0); });
  const toggle = async (p, on, el) => {
    try { await api.setPromotionActive(p.id, on); ui.toast(on ? 'Đã bật ưu đãi' : 'Đã tắt, khách không còn thấy ưu đãi này'); rerender(); }
    catch (e) { el.checked = !on; ui.toast(errText(e)); }
  };
  const badge = p => p.kind === 'combo' ? 'Combo ' + K(p.price || 0) : p.kind === 'giam_gia' ? BN.saleBadge(p) : p.kind === 'don_tang' ? (p.min_total ? 'Đơn từ ' + K(p.min_total) : 'Mua ' + p.need_qty + ' tặng quà') : 'Mua ' + p.buy_qty + ' tặng ' + p.get_qty;

  return (
    <>
      <div className="ptitle"><h1>Ưu đãi</h1></div>
      <div className="toolbar"><input className="search" id="pq" type="search" placeholder="Tìm ưu đãi hoặc tên món…" value={query} aria-label="Tìm ưu đãi" onChange={e => { state.promoQuery = e.target.value; setQuery(e.target.value); }} />
        <button className="btn" type="button" id="addPromo" onClick={() => editPromo(null)}>+ Tạo ưu đãi</button></div>
      <p className="muted small" style={{ margin: '-4px 0 12px' }}>Ưu đãi đang hiện sẽ nằm ở đầu menu của khách. Combo có món ăn hiện ở menu Ăn vặt, có đồ uống hiện ở menu Trà · Cà phê.</p>
      <section className="box cc-tim"><h2 className="box-title"><span>Các ưu đãi</span></h2>
        {shown.length ? <ul className="list">{shown.map(p => {
          const out = p.limit_qty && (used[p.id] || 0) >= p.limit_qty && p.is_active;
          const [st, cls] = out ? ['Đang ẩn vì hết suất' + (p.limit_per === 'tong' ? '' : ', mai mở lại'), 'pill-red'] : promoState(p), when = promoWhen(p, false);
          return (
            <li key={p.id}><div className="lrow">
              <button className="lmain" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', color: 'inherit' }} type="button" onClick={() => editPromo(p)}>
                <span className="lname">{p.name} <span className={'pill ' + (p.kind === 'combo' ? 'pill-red' : p.kind === 'giam_gia' ? 'pill-ok' : 'pill-gift')}>{badge(p)}</span></span>
                <span className="lsub">{itemsText(p)}</span>
                <span className="lsub"><span className={'pill ' + cls}>{st}</span> {when || 'Mọi lúc'}{p.limit_qty ? <> · <span className={'pill ' + ((used[p.id] || 0) >= p.limit_qty ? 'pill-red' : 'pill-mute')}>Đã dùng {limitTxt(p)}</span></> : null}</span></button>
              <label className="switch"><input type="checkbox" defaultChecked={p.is_active} onChange={e => toggle(p, e.target.checked, e.target)} /><span className="track"></span><span className="sw-l">{p.is_active ? 'Bật' : 'Tắt'}</span></label>
            </div></li>
          );
        })}</ul> : <p className="empty">{words.length ? 'Không có ưu đãi nào khớp.' : 'Chưa có ưu đãi nào. Bấm “+ Tạo ưu đãi”.'}</p>}
      </section>
    </>
  );
}
