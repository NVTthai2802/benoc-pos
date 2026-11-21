/* Hộp thoại (bảng trượt) bằng React, dùng chung khung #bnSheet của core.js (ui.sheet):
   giữ nguyên giao diện, nút ✕, bấm nền / Esc để đóng như hộp thoại cũ. */
import { createRoot } from 'react-dom/client';

/* Mở hộp thoại: node là phần tử React. Trả về khung sheet (DOM). */
export function openSheet(node, opts) {
  const ui = window.BN.ui;
  let root = null;
  const sh = ui.sheet('', s => { root = createRoot(s); root.render(node); }, opts);
  // Hộp thoại mới thay khung cũ (ui.sheet tạo khung mới) → gỡ React của khung cũ
  const parent = sh.parentNode;
  const mo = new MutationObserver(() => { if (!sh.isConnected) { mo.disconnect(); setTimeout(() => root && root.unmount(), 0); } });
  if (parent) mo.observe(parent, { childList: true });
  return sh;
}
export const closeSheet = () => window.BN.ui.close();

/* Đầu hộp thoại, giống ui.head(title, sub) */
export function SheetHead({ title, sub }) {
  return (
    <div className="sh-head"><div className="sh-title"><h3>{title}</h3>{sub ? <p>{sub}</p> : null}</div>
      <button className="x" type="button" data-close aria-label="Đóng"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button></div>
  );
}

/* Chèn HTML có sẵn (icon, nhãn do mã cũ tạo) mà không thêm khung */
export const Html = ({ html }) => <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html || '' }} />;
