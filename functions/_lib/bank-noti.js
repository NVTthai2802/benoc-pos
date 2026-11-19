/* Nhận thông báo tiền vào từ app Android Bé Nốc POS (đọc thông báo app ngân hàng, vd Techcombank Share Noti)
   → bỏ số dư → chuyển cho Supabase hàm bank_noti_ingest (cập nhật 37). Khoá kiểm tra bên trong Supabase. */
import { ENVS } from './sepay.js';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// Xoá mọi đoạn số dư trước khi gửi đi (không lưu số dư tài khoản của quán)
export const stripBalance = s => String(s || '').replace(/(số\s*dư|so\s*du|\bSD\b)\s*[:：]?\s*[-+]?\d[\d.,]*\s*(vnđ|vnd|đ|₫|d(?![a-z]))?/gi, '[số dư]').slice(0, 500);

export async function handleNoti(request, env) {
  const E = ENVS[env];
  if (request.method === 'GET') return json({ ok: true, env, note: 'Bé Nốc: nhận thông báo chuyển khoản — dùng POST' });
  if (request.method !== 'POST') return json({ ok: false }, 405);
  const key = (request.headers.get('x-key') || '').trim();
  if (!key) return json({ ok: false, error: 'Thiếu khoá' }, 401);
  let p;
  try { p = await request.json(); } catch (e) { return json({ ok: false, error: 'Dữ liệu không đọc được' }, 400); }
  const body = {
    title: stripBalance(p.title), text: stripBalance(p.text), pkg: String(p.pkg || '').slice(0, 120),
    key: String(p.key || '').slice(0, 200), posted_at: String(p.posted_at || ''), device: String(p.device || '').slice(0, 40), test: !!p.test, ping: !!p.ping
  };
  const r = await fetch(E.url + '/rest/v1/rpc/bank_noti_ingest', {
    method: 'POST',
    headers: { apikey: E.anon, authorization: 'Bearer ' + E.anon, 'content-type': 'application/json' },
    body: JSON.stringify({ p_key: key, p: body })
  });
  const text = await r.text();
  if (!r.ok) {
    if (/BAD_KEY/.test(text)) return json({ ok: false, error: 'Sai khoá' }, 401);
    if (/PGRST202|bank_noti_ingest/.test(text)) return json({ ok: false, error: 'Chưa chạy cập nhật SQL 37' }, 503);
    return json({ ok: false, error: 'Supabase lỗi ' + r.status }, 502);
  }
  let res = {}; try { res = JSON.parse(text); } catch (e) { /* bỏ qua */ }
  return json(res);
}
