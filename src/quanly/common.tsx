/* Dùng chung cho các tab React của trang Quản lý (Bước 3) */
import { useEffect, useRef, useState, type ComponentType, type DependencyList, type ElementType } from 'react';
import { createRoot } from 'react-dom/client';
import type { QCtx } from './ctx';

/* Chèn đoạn HTML có sẵn (icon SVG, dòng chữ có <b>…) mà không thêm khung bao */
export function Html({ html, as: Tag = 'span' }: { html: string; as?: ElementType }) {
  return <Tag style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html || '' }} />;
}

/* "Đảo" mã cũ: vẽ HTML do hàm cũ tạo rồi gọi hàm gắn sự kiện cũ (ô tài khoản ngân hàng, biểu đồ…) */
export function Island({ html, wire, deps = [] }: { html: string; wire?: (el: HTMLDivElement) => void | (() => void); deps?: DependencyList }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && wire) return wire(ref.current) || undefined; }, deps);
  return <div ref={ref} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* Tải dữ liệu 1 lần khi mở tab (hoặc khi deps đổi) */
export function useLoad<T>(fn: () => T | Promise<T>, deps: DependencyList = []): { data: T | null; err: unknown } {
  const [st, setSt] = useState<{ data: T | null; err: unknown }>({ data: null, err: null });
  useEffect(() => {
    let live = true;
    Promise.resolve().then(fn).then(data => { if (live) setSt({ data, err: null }); }, err => { if (live) setSt({ data: null, err }); });
    return () => { live = false; };
  }, deps);
  return st;
}

export const Loading = () => <p className="loading">Đang tải…</p>;
export const ErrMsg = ({ q, err }: { q: QCtx; err: unknown }) => <p className="msg">{q.errText(err)}</p>;

/* Ô xác nhận ngay trong trang (giống confirmBox của mã cũ) */
export function InlineConfirm({ open, text, okLabel, onYes, onNo, busy }: { open: boolean; text: string; okLabel: string; onYes: () => void; onNo: () => void; busy?: boolean }) {
  if (!open) return null;
  return (
    <div className="inline-confirm"><span>{text}</span><div className="row">
      <button className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff' }} type="button" disabled={busy} onClick={onYes}>{okLabel}</button>
      <button className="btn btn-sm btn-line" type="button" onClick={onNo}>Thôi</button>
    </div></div>
  );
}

/* Gắn một tab vào khung #main; trả về hàm gỡ */
export function mountTab(Comp: ComponentType<{ q: QCtx }>, main: HTMLElement, q: QCtx) {
  main.innerHTML = '';
  const root = createRoot(main);
  root.render(<Comp q={q} />);
  return () => root.unmount();
}
