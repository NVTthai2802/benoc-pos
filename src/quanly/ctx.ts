/* Những gì trang Quản lý (mã cũ) đưa cho các tab React: xem reactCtx() trong quanly.html.
   Phần lớn còn là mã JS cũ nên để kiểu `any`; thu hẹp dần khi chuyển các hộp thoại sang React. */
import type { Database } from '../types/database';

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Employee = Tables<'employees'>;
export type Shift = Tables<'shifts'>;
export type MenuItem = Tables<'menu_items'>;

export interface QCtx {
  api: any;
  ui: { toast(t: string): void; sheet: (...a: any[]) => void; close(): void; head(...a: any[]): string };
  BN: any;
  state: Record<string, any>;
  errText(e: unknown): string;
  vnd(n: number): string;
  hhmm(d: string | number | Date): string;
  ddmm(d: string | number | Date): string;
  dur(mins: number): string;
  rerender(): void;
  isOwner(): boolean;
  [k: string]: any;
}
