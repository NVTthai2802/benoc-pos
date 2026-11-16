/* Nhận tin báo tiền vào từ SePay (webhook) → chuyển cho Supabase hàm sepay_ingest.
   SePay gửi header "Authorization: Apikey <KHOÁ>"; khoá được kiểm tra bên trong Supabase
   (bảng private.sepay_config), nên ở đây không cần cài biến bí mật nào trên Cloudflare.
   Khoá anon dưới đây là khoá công khai (giống config.js), chỉ gọi được hàm đã cấp quyền. */
export const ENVS = {
  product: { url: 'https://hixdacnaxfuxuccbajzn.supabase.co', anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpeGRhY25heGZ1eHVjY2JhanpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTk1NzIsImV4cCI6MjEwNzc3NTU3Mn0.svOXrzV2rNaN1qqNKkbvXeWPHtirXrm7orOKB3WiR0Q' },
  test: { url: 'https://bsnpcinocphuruahpzwr.supabase.co', anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzbnBjaW5vY3BodXJ1YWhwendyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMjExMDIsImV4cCI6MjEwNzc5NzEwMn0.2h23kG6JMU5Y3xSYjwU4jlIcA5ig6PM7ivpoXXrCR78' }
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function handle(request, env) {
  const E = ENVS[env];
  if (request.method === 'GET') return json({ ok: true, env, note: 'SePay webhook Bé Nốc — dùng POST' });
  if (request.method !== 'POST') return json({ success: false }, 405);
  const auth = request.headers.get('authorization') || '';
  const key = auth.replace(/^apikey\s+/i, '').trim();
  if (!key) return json({ success: false, error: 'Thiếu khoá API' }, 401);
  let payload;
  try {
    const type = request.headers.get('content-type') || '';
    if (type.includes('json')) payload = await request.json();
    else payload = Object.fromEntries(await request.formData());
  } catch (e) { return json({ success: false, error: 'Dữ liệu không đọc được' }, 400); }
  // Không chuyển số dư tài khoản sang Supabase
  delete payload.accumulated;
  const r = await fetch(E.url + '/rest/v1/rpc/sepay_ingest', {
    method: 'POST',
    headers: { apikey: E.anon, authorization: 'Bearer ' + E.anon, 'content-type': 'application/json' },
    body: JSON.stringify({ p_key: key, p: payload })
  });
  const text = await r.text();
  if (!r.ok) {
    if (/BAD_KEY/.test(text)) return json({ success: false, error: 'Sai khoá API' }, 401);
    return json({ success: false, error: 'Supabase lỗi ' + r.status }, 500); // SePay sẽ gửi lại
  }
  let res = {}; try { res = JSON.parse(text); } catch (e) { /* bỏ qua */ }
  return json({ success: true, result: res });
}
