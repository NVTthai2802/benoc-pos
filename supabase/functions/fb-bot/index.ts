// =====================================================================
// BÉ NỐC — BOT NHẬN ĐƠN FANPAGE (Supabase Edge Function "fb-bot")
//
//  Facebook  ──tin nhắn──▶  fb-bot  ──AI tách đơn──▶  fb_drafts (đơn nháp)
//                              │                          │
//                              └──trả lời / hỏi lại khách  └─▶ chủ quán duyệt (tab Facebook) → đơn thật → bếp
//
//  Bot hỏi khách đủ các ý: ăn gì, uống gì, qua lấy / ăn tại quán / đi ship,
//  giờ hẹn (cả 3 loại), địa chỉ + SĐT (nếu ship). Thiếu ý nào hỏi lại ý đó.
//
//  Biến môi trường (Supabase → Edge Functions → Secrets):
//    FB_VERIFY_TOKEN    chuỗi tự đặt, dán giống hệt vào ô "Verify token" trên Meta
//    FB_APP_SECRET      App secret của app Meta (để kiểm tra tin đúng là từ Facebook)
//    FB_PAGE_TOKEN      Page access token của Fanpage Bé Nốc
//    AI_PROVIDER        gemini | claude (để trống: có GEMINI_API_KEY thì dùng gemini, không thì claude)
//    ANTHROPIC_API_KEY  khi dùng claude        (CLAUDE_MODEL, mặc định claude-haiku-5-5)
//    GEMINI_API_KEY     khi dùng gemini        (GEMINI_MODEL, để trống: tự thử gemini-3.8-flash → 3.5-flash-lite → 2.5-flash)
//    BOT_PAUSE_MINUTES  chủ quán tự nhắn trong hộp thư thì bot im bao lâu (mặc định 30)
//    FB_GRAPH_VERSION   mặc định v25.0
//  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: Supabase tự cấp sẵn.
//
//  Khi tạo function: TẮT "Verify JWT" (Facebook không gửi JWT). Hàm tự kiểm tra
//  chữ ký Facebook, còn các lệnh từ trang Quản lý thì kiểm tra tài khoản chủ quán.
// =====================================================================
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const env = (k: string, d = '') => (globalThis as any).Deno?.env.get(k) ?? d;
const GV = () => env('FB_GRAPH_VERSION', 'v25.0');
const BOT_TAG = 'benoc-bot';   // gắn vào tin bot gửi, để tách với tin chủ quán tự nhắn
const APP_TAG = 'benoc-app';   // tin chủ quán gửi từ trang Quản lý
const DEBOUNCE_MS = 3500;      // khách hay nhắn nhiều tin liền nhau: đợi chút rồi đọc một lượt
const THREAD_HOURS = 12;       // đơn nháp quá 12 tiếng không nhắn coi như bỏ

// ---------------------------------------------------------------------
// Giờ Việt Nam (UTC+7, không đổi giờ mùa hè)
// ---------------------------------------------------------------------
const VN = 7 * 3600e3;
const p2 = (n: number) => String(n).padStart(2, '0');
export function vnDate(d: Date) { const x = new Date(d.getTime() + VN); return x.getUTCFullYear() + '-' + p2(x.getUTCMonth() + 1) + '-' + p2(x.getUTCDate()); }
export function vnTime(d: Date) { const x = new Date(d.getTime() + VN); return p2(x.getUTCHours()) + ':' + p2(x.getUTCMinutes()); }
export function vnToUtc(date: string, time: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || ''), t = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!m || !t || +t[1] > 23 || +t[2] > 59) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]) - VN);
}
const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const vnWeekday = (d: Date) => WEEKDAY[new Date(d.getTime() + VN).getUTCDay()];
const vnd = (n: number) => Math.round(n || 0).toLocaleString('vi-VN') + 'đ';

// ---------------------------------------------------------------------
// Menu: lấy từ hàm get_menu() (chỉ món đang bán), đánh số cho AI dễ chọn
// ---------------------------------------------------------------------
export type Choice = { id: number; name: string; price: number; default: boolean };
export type Group = { id: number; title: string; min: number; max: number; choices: Choice[] };
export type Item = { n: number; id: string; name: string; price: number; cat: string; drink: boolean; groups: Group[] };
export type Menu = { items: Item[]; groups: Map<number, Group> };

const DRINK_RE = /trà|cà phê|cafe|matcha|nước|món nên thử|khoai môn tươi|sữa|cacao|sinh tố|soda|đá xay/i;
export function buildMenu(raw: any[]): Menu {
  const items: Item[] = []; const groups = new Map<number, Group>();
  for (const c of raw || []) {
    for (const it of c.items || []) {
      const gs: Group[] = (it.option_groups || []).map((g: any) => {
        const grp: Group = { id: g.id, title: g.title, min: g.min ?? 0, max: g.max ?? 1, choices: (g.choices || []).map((x: any) => ({ id: x.id, name: x.name, price: x.price || 0, default: !!x.default })) };
        groups.set(grp.id, grp); return grp;
      });
      items.push({ n: items.length + 1, id: it.id, name: it.name, price: it.price, cat: c.name, drink: c.station === 'pha_che' || DRINK_RE.test(c.name), groups: gs });
    }
  }
  return { items, groups };
}
const k = (n: number) => (n % 1000 === 0 ? n / 1000 : (n / 1000).toFixed(1)) + 'k';
export function menuText(menu: Menu) {
  const gl = [...menu.groups.values()].map(g => 'G' + g.id + ' ' + g.title + ' (chọn ' + (g.min === g.max ? g.min : g.min + '-' + g.max) + '): ' +
    g.choices.map(c => '#' + c.id + ' ' + c.name + (c.price ? ' +' + k(c.price) : '') + (c.default ? ' (mặc định)' : '')).join(', '));
  let cat = '';
  const il = menu.items.map(it => (it.cat !== cat ? '[' + (cat = it.cat) + ']\n' : '') + it.n + '. ' + it.name + ' — ' + k(it.price) + (it.groups.length ? ' — nhóm ' + it.groups.map(g => 'G' + g.id).join(',') : ''));
  return 'MÓN ĐANG BÁN:\n' + il.join('\n') + '\n\nNHÓM TUỲ CHỌN:\n' + gl.join('\n');
}

// ---------------------------------------------------------------------
// Đơn nháp
// ---------------------------------------------------------------------
export type DItem = { menu_item_id: string; name: string; qty: number; choice_ids: number[]; choices: string[]; note: string | null; price: number; drink: boolean };
export type Draft = {
  id?: string; psid: string; status: string; dine_type: string | null; at: string | null; customer_name: string | null; customer_phone: string | null;
  address: string | null; note: string | null; items: DItem[]; unknown: string[]; missing: string[]; total_est: number; asked: string[]; changed_after?: boolean;
};
export type AiOut = {
  intent?: string; items?: { m: number; qty?: number; choices?: number[]; note?: string }[]; unknown?: string[];
  dine_type?: string | null; date?: string | null; time?: string | null; address?: string | null; phone?: string | null; name?: string | null; note?: string | null; answer?: string | null;
  _model?: string;   // máy chủ gắn thêm: model nào đã đọc (không phải AI trả)
};

/* Kiểm lại kết quả AI theo menu thật: món phải có, lựa chọn phải thuộc nhóm của món, đủ số lượng tối thiểu */
export function applyAi(d: Draft, ai: AiOut, menu: Menu, now: Date, firstName: string | null) {
  const items: DItem[] = [];
  for (const x of ai.items || []) {
    const it = menu.items.find(i => i.n === Number(x.m)); if (!it) continue;
    const qty = Math.min(50, Math.max(1, Math.round(Number(x.qty) || 1)));
    const want = new Set((x.choices || []).map(Number));
    const ids: number[] = [], names: string[] = []; let extra = 0;
    for (const g of it.groups) {
      let pick = g.choices.filter(c => want.has(c.id)).slice(0, Math.max(1, g.max));
      if (!pick.length && g.min > 0) pick = g.choices.filter(c => c.default).slice(0, g.max || 1);
      if (!pick.length && g.min > 0 && g.choices[0]) pick = [g.choices[0]];
      for (const c of pick) { ids.push(c.id); extra += c.price; if (!c.default || want.has(c.id)) names.push(c.name); }
    }
    items.push({ menu_item_id: it.id, name: it.name, qty, choice_ids: ids, choices: [...new Set(names)], note: (x.note || '').trim().slice(0, 120) || null, price: it.price + extra, drink: it.drink });
  }
  d.items = items;
  d.unknown = (ai.unknown || []).map(s => String(s).trim()).filter(Boolean).slice(0, 5);
  d.dine_type = ['mang_ve', 'tai_quan', 'giao_hang'].includes(String(ai.dine_type)) ? String(ai.dine_type) : null;
  // Giờ hẹn
  let at: Date | null = null;
  if (ai.time === 'now') { at = new Date(Math.ceil((now.getTime() + 15 * 60e3) / 300e3) * 300e3); }
  else if (ai.time) at = vnToUtc(ai.date && /^\d{4}-\d{2}-\d{2}$/.test(ai.date) ? ai.date : vnDate(now), String(ai.time));
  d.at = at ? at.toISOString() : null;
  const phone = String(ai.phone || '').replace(/[^\d+]/g, '').replace(/^\+?84/, '0');
  d.customer_phone = /^0\d{9}$/.test(phone) ? phone : null;
  d.address = (ai.address || '').trim().slice(0, 300) || null;
  d.customer_name = (ai.name || '').trim().slice(0, 60) || d.customer_name || firstName;
  d.note = (ai.note || '').trim().slice(0, 300) || null;
  d.total_est = items.reduce((t, i) => t + i.price * i.qty, 0);
  return d;
}

/* Còn thiếu gì. open/close: khung giờ nhận đơn "07:00" / "22:00" */
export function missingOf(d: Draft, now: Date, open = '07:00', close = '22:00') {
  const miss: string[] = [];
  if (!d.items.length) miss.push('items');
  if (!d.dine_type) miss.push('dine_type');
  if (!d.at) miss.push('at');
  else {
    const at = new Date(d.at);
    if (at.getTime() < now.getTime() - 10 * 60e3) miss.push('at_past');
    else if (at.getTime() > now.getTime() + 3 * 86400e3) miss.push('at_far');
    else { const t = vnTime(at); if (t < open || t > close) miss.push('at_hours'); }
  }
  if (d.dine_type === 'giao_hang') { if (!d.address) miss.push('address'); if (!d.customer_phone) miss.push('phone'); }
  return miss;
}

const DINE_TEXT: Record<string, string> = { mang_ve: 'Qua lấy', tai_quan: 'Ăn tại quán', giao_hang: 'Đi ship' };
export function itemLine(i: DItem) { return '• ' + i.qty + ' ' + i.name + (i.choices.length ? ' (' + i.choices.join(', ') + ')' : '') + (i.note ? ' — ' + i.note : ''); }
export function draftSummary(d: Draft, now: Date) {
  const lines = d.items.map(itemLine);
  const when = d.at ? (vnDate(new Date(d.at)) === vnDate(now) ? '' : vnWeekday(new Date(d.at)) + ' ' + vnDate(new Date(d.at)).slice(8) + '/' + vnDate(new Date(d.at)).slice(5, 7) + ' ') + vnTime(new Date(d.at)) : '';
  const how = [d.dine_type ? DINE_TEXT[d.dine_type] : '', when].filter(Boolean).join(' · ');
  if (how) lines.push((d.dine_type === 'giao_hang' ? '🛵 ' : d.dine_type === 'tai_quan' ? '🍽 ' : '🛍 ') + how);
  if (d.dine_type === 'giao_hang' && d.address) lines.push('📍 ' + d.address);
  if (d.customer_phone) lines.push('📞 ' + d.customer_phone);
  if (d.items.length) lines.push('Tạm tính: ' + vnd(d.total_est) + (d.dine_type === 'giao_hang' ? ' (chưa gồm phí ship)' : ''));
  return lines.join('\n');
}

export function helloForm(name: string | null, custom?: string | null) {
  return (custom ? custom.trim() + '\n\n' : 'Dạ Bé Nốc chào ' + (name || 'mình') + ' ạ 🥰\n') +
    'Mình đặt món theo mẫu này giúp em nha:\n' +
    '🍜 Món ăn:\n🧋 Đồ uống (size, đường, đá, topping):\n🛵 Qua lấy / Ăn tại quán / Ship:\n⏰ Giờ qua lấy / giờ đến quán / giờ nhận ship:\n📍 Địa chỉ + SĐT (nếu ship):';
}

/* Soạn câu trả lời. Trả về { text, quick } (quick: nút trả lời nhanh) */
export function composeReply(d: Draft, miss: string[], o: { now: Date; first: boolean; name: string | null; answer?: string | null; wasPending: boolean; changed?: boolean; open: string; close: string; hello?: string | null }) {
  const out: string[] = []; let quick: string[] | null = null;
  const nothing = !d.items.length && !d.dine_type && !d.at && !d.address && !d.unknown.length;
  if (o.answer) out.push(o.answer.trim());
  if (nothing) {
    if (!o.answer) return { text: helloForm(o.name, o.hello), quick: null, done: false };
    out.push('Mình muốn đặt món thì nhắn em món ăn, đồ uống, qua lấy / ăn tại quán / ship và giờ hẹn nha.');
    return { text: out.join('\n\n'), quick: null, done: false };
  }
  if (o.first) out.unshift('Dạ Bé Nốc chào ' + (o.name || 'mình') + ' ạ 🥰');
  if (d.items.length || d.dine_type || d.at) out.push('Em ghi nhận đơn của mình:\n' + draftSummary(d, o.now));
  if (d.unknown.length) out.push('Món ' + d.unknown.map(u => '“' + u + '”').join(', ') + ' em chưa tìm thấy trong menu quán, mình xem lại tên món giúp em nha.');

  const ask: string[] = [];
  const hasFood = d.items.some(i => !i.drink), hasDrink = d.items.some(i => i.drink);
  if (miss.includes('items')) ask.push('Mình muốn ăn gì, uống gì ạ?');
  else {
    if (!hasDrink && !d.asked.includes('drink')) { ask.push('Mình có dùng thêm đồ uống không ạ? (trà sữa, trà hoa quả, cà phê, matcha…)'); d.asked.push('drink'); }
    else if (!hasFood && !d.asked.includes('food')) { ask.push('Mình có dùng thêm đồ ăn không ạ? (cơm trộn, mì trộn, kimbap, đồ ăn vặt…)'); d.asked.push('food'); }
  }
  if (miss.includes('dine_type')) { ask.push('Mình qua lấy, ăn tại quán hay để quán ship ạ?'); quick = ['Qua lấy', 'Ăn tại quán', 'Ship']; }
  if (miss.includes('at')) ask.push(d.dine_type === 'mang_ve' ? 'Mấy giờ mình qua lấy ạ?' : d.dine_type === 'tai_quan' ? 'Mấy giờ mình đến quán ạ?' : d.dine_type === 'giao_hang' ? 'Mấy giờ mình muốn nhận hàng ạ?' : 'Mình hẹn mấy giờ ạ?');
  if (miss.includes('at_past')) ask.push('Giờ hẹn ' + vnTime(new Date(d.at!)) + ' đã qua rồi, mình cho em giờ khác nha.');
  if (miss.includes('at_far')) ask.push('Quán chỉ nhận đặt trước tối đa 3 ngày, mình chọn giờ gần hơn giúp em ạ.');
  if (miss.includes('at_hours')) ask.push('Quán nhận đơn từ ' + o.open + ' đến ' + o.close + ', mình chọn giờ trong khung này giúp em ạ.');
  if (miss.includes('address')) ask.push('Mình gửi em địa chỉ nhận hàng nha.');
  if (miss.includes('phone')) ask.push('Cho em xin số điện thoại người nhận để shipper gọi ạ.');

  const blocking = miss.length > 0 || d.unknown.length > 0;
  if (ask.length) out.push(ask.length === 1 ? ask[0] : ask.map(a => '👉 ' + a).join('\n'));
  if (!blocking && !ask.length) out.push(o.wasPending && o.changed === false ? 'Đơn của mình đang chờ quán xác nhận ạ, xác nhận xong em nhắn mình ngay nha.' : o.wasPending ? 'Em đã cập nhật đơn và gửi lại quán xác nhận ạ. Quán xác nhận xong em nhắn mình ngay.' : 'Em đã gửi đơn cho quán xác nhận ạ. Quán xác nhận xong em nhắn mình ngay, mình cần sửa gì cứ nhắn em nha.');
  return { text: out.join('\n\n'), quick, done: !blocking && !ask.length };
}

// ---------------------------------------------------------------------
// AI tách đơn
// ---------------------------------------------------------------------
export function systemPrompt(menu: Menu, now: Date, open: string, close: string) {
  return `Bạn là trợ lý nhận đơn qua Messenger của quán Bé Nốc (cơm trộn, mì trộn, kimbap, đồ ăn vặt, trà sữa, trà hoa quả, cà phê, matcha).
Bây giờ là ${vnTime(now)} ${vnWeekday(now)} ngày ${vnDate(now)} (giờ Việt Nam). Quán nhận đơn từ ${open} đến ${close}.

Nhiệm vụ: đọc hội thoại và trả về TRẠNG THÁI ĐƠN ĐẦY ĐỦ hiện tại dưới dạng JSON (cộng dồn mọi thông tin khách đã nói, kể cả tin cũ; khách đổi ý thì lấy ý mới nhất; khách bỏ món thì bỏ khỏi danh sách).

${menuText(menu)}

QUY TẮC:
- items: mỗi món {"m": số thứ tự món trong menu, "qty": số lượng, "choices": [số # của lựa chọn], "note": ghi chú riêng của món hoặc null}.
  * Chỉ dùng lựa chọn # thuộc các nhóm G của chính món đó. Khách không nói thì để [] (máy tự lấy mặc định).
  * Hai ly cùng món nhưng khác tuỳ chọn thì tách 2 dòng.
  * Khách gọi món không có trong menu, hoặc mơ hồ không đoán chắc được → ghi nguyên văn vào "unknown", KHÔNG tự đoán bừa.
- Viết tắt hay gặp: ts = trà sữa, tc = trân châu, tcđđ/tcdd = trân châu đường đen, thq/tra hq = trà hoa quả, cf/cafe/cfe = cà phê, mt = matcha, sz = size, đ = đường hoặc đá (theo ngữ cảnh), k/ko/kh/hok/hông = không, ít đ = ít đường hoặc ít đá theo ngữ cảnh, 1c/1 cốc/1 ly = 1, x2/2 suất = số lượng 2, ib = nhắn tin, sdt = số điện thoại, đc/dc = địa chỉ hoặc được (theo ngữ cảnh). Khách gõ không dấu cũng hiểu như có dấu.
- dine_type: "mang_ve" khi khách tự qua lấy / ghé lấy / mang về; "tai_quan" khi ăn tại quán / ngồi quán / đặt bàn; "giao_hang" khi ship / giao / gửi tới địa chỉ. Chưa rõ thì null.
- time: giờ hẹn dạng "HH:MM" 24 giờ (6h chiều = 18:00, 7r tối = 19:30, 11h trưa = 11:00, 12h trưa = 12:00). Khách nói "bây giờ", "luôn", "ngay", "sớm nhất" → "now". Không nói giờ → null. Giờ mơ hồ không suy ra được ("chiều nay", "tối") → null.
- date: "YYYY-MM-DD" nếu khách hẹn ngày khác hôm nay ("mai", "thứ 7"), không thì null.
- address: địa chỉ giao hàng nguyên văn. phone: số điện thoại khách đưa. name: tên người nhận nếu khách tự xưng. note: ghi chú chung cho cả đơn.
- intent: "order" (đặt / sửa đơn hoặc trả lời câu bot hỏi), "question" (chỉ hỏi thông tin: giá, món, giờ mở cửa…), "human" (phàn nàn, khiếu nại, hỏi đơn cũ, chuyển khoản, xin gặp chủ quán, việc bot không xử lý được), "other" (chào hỏi, cảm ơn…).
- answer: CHỈ điền khi intent = "question": trả lời ngắn, lịch sự, xưng "em", gọi khách là "mình", chỉ dựa vào menu và giờ nhận đơn ở trên, không bịa thêm. Không thì null.

Chỉ trả về đúng một object JSON, không giải thích:
{"intent":"order","items":[{"m":1,"qty":2,"choices":[],"note":null}],"unknown":[],"dine_type":null,"date":null,"time":null,"address":null,"phone":null,"name":null,"note":null,"answer":null}`;
}

export function userPrompt(d: Draft, convo: { sender: string; text: string; at: string }[], approved: string | null) {
  const cur = {
    items: d.items.map(i => ({ ten: i.name, qty: i.qty, tuy_chon: i.choices, note: i.note })), dine_type: d.dine_type,
    gio_hen: d.at ? vnDate(new Date(d.at)) + ' ' + vnTime(new Date(d.at)) : null, address: d.address, phone: d.customer_phone, note: d.note,
  };
  return (approved ? 'Khách vừa có một đơn ĐÃ được quán xác nhận: ' + approved + '\nNếu khách muốn sửa / huỷ đơn đã xác nhận đó → intent "human". Nếu khách đặt đơn MỚI thì tách bình thường.\n\n' : '') +
    'ĐƠN ĐANG GHI (trước tin mới): ' + JSON.stringify(cur) + '\n\nHỘI THOẠI (cũ → mới):\n' +
    convo.map(m => (m.sender === 'khach' ? 'Khách' : m.sender === 'bot' ? 'Bot' : 'Chủ quán') + ' [' + vnTime(new Date(m.at)) + ']: ' + m.text).join('\n') +
    '\n\nTrả về JSON trạng thái đơn mới nhất.';
}

export function parseJson(t: string): AiOut {
  const s = String(t || '').replace(/```(?:json)?/g, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('AI không trả JSON');
  return JSON.parse(s.slice(a, b + 1));
}

const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
export const aiProvider = () => (env('AI_PROVIDER') || (env('GEMINI_API_KEY') && !env('ANTHROPIC_API_KEY') ? 'gemini' : 'claude')).toLowerCase();
export async function askAi(system: string, user: string): Promise<AiOut> {
  const provider = aiProvider();
  let text = '', used = '';
  if (provider === 'gemini') {
    // Model không có / không được dùng (404, 403) thì thử model kế tiếp
    const models = env('GEMINI_MODEL') ? [env('GEMINI_MODEL')] : GEMINI_MODELS;
    let err = '';
    for (const model of models) {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } }),
      });
      if (r.ok) { const j = await r.json(); text = j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || ''; err = ''; used = model; break; }
      err = 'Gemini ' + model + ' ' + r.status + ': ' + (await r.text()).slice(0, 300);
      if (r.status !== 404 && r.status !== 403 && r.status !== 400) break;
    }
    if (err) throw new Error(err);
  } else {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env('CLAUDE_MODEL', 'claude-haiku-5-5'), max_tokens: 1500, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error('Claude ' + r.status + ': ' + (await r.text()).slice(0, 300));
    const j = await r.json(); text = (j?.content || []).map((c: any) => c.text || '').join(''); used = env('CLAUDE_MODEL', 'claude-haiku-5-5');
  }
  return Object.assign(parseJson(text), { _model: used });
}

// ---------------------------------------------------------------------
// Facebook
// ---------------------------------------------------------------------
async function graph(path: string, init?: RequestInit) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch('https://graph.facebook.com/' + GV() + '/' + path + sep + 'access_token=' + encodeURIComponent(env('FB_PAGE_TOKEN')), init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Facebook ' + r.status + ': ' + JSON.stringify(j?.error || j).slice(0, 300));
  return j;
}
async function fbSend(psid: string, text: string, quick: string[] | null, tag = BOT_TAG) {
  const parts: string[] = []; let rest = text;
  while (rest.length > 1900) { const cut = rest.lastIndexOf('\n', 1900) > 500 ? rest.lastIndexOf('\n', 1900) : 1900; parts.push(rest.slice(0, cut)); rest = rest.slice(cut).trimStart(); }
  parts.push(rest);
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    await graph('me/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      recipient: { id: psid }, messaging_type: 'RESPONSE',
      message: Object.assign({ text: parts[i], metadata: tag }, last && quick ? { quick_replies: quick.map(q => ({ content_type: 'text', title: q, payload: 'DINE:' + q })) } : {}),
    }) });
  }
}
const fbAction = (psid: string, a: 'typing_on' | 'mark_seen') =>
  graph('me/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipient: { id: psid }, sender_action: a }) }).catch(() => null);

export async function verifySignature(raw: string, header: string | null, secret: string) {
  if (!header || !secret || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const hex = [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
  const got = header.slice(7);
  if (got.length !== hex.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------
// Dữ liệu huấn luyện: mỗi lượt AI đọc tin khách lưu 1 mẫu vào fb_train (cập nhật 24),
// ĐÃ ẩn tên, SĐT, địa chỉ, số tài khoản. Khi chủ quán duyệt đơn, SQL gắn thêm đáp án đúng.
// Dùng để đo AI đọc đúng bao nhiêu % và sau này tự huấn luyện mô hình riêng của quán.
// ---------------------------------------------------------------------
const foldChar = (c: string) => (c.length > 1 ? c : c === 'đ' || c === 'Đ' ? 'd' : c.normalize('NFD').charAt(0).toLowerCase());
/* Bỏ dấu + chữ thường, giữ nguyên độ dài để cắt đúng chỗ trong chuỗi gốc */
export const fold = (s: string) => Array.from(String(s).normalize('NFC')).map(foldChar).join('');

const PHONE_RE = /(?<![\d])(?:\+?84|0)(?:[\s.\-]?\d){9}(?![\d])/g;
const EMAIL_RE = /[\w.+\-]+@[\w\-]+\.[\w.\-]+/g;
const LONGNUM_RE = /(?<![\d])\d{9,}(?![\d])/g;
const NAME_STOP = new Set(['mai', 'nam', 'long', 'anh', 'chi', 'em', 'hoa', 'bao', 'minh', 'thanh', 'trang', 'hanh']); // tên trùng từ thường dùng: không cắt từng chữ
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function menuWords(menu: Menu): Set<string> {
  const w = new Set<string>();
  const add = (s: string) => fold(s).split(/[^\p{L}\p{N}]+/u).forEach(x => x && w.add(x));
  for (const it of menu.items) add(it.name);
  for (const g of menu.groups.values()) for (const c of g.choices) add(c.name);
  return w;
}

/* Trả về hàm ẩn thông tin cá nhân. Cắt chắc chắn: SĐT, email, dãy số dài, địa chỉ + tên đã biết.
   Chỉ là "cố gắng hết sức": dữ liệu vẫn nằm trong Supabase của quán, đừng đăng công khai. */
export function anonymizer(o: { names?: (string | null | undefined)[]; addresses?: (string | null | undefined)[]; words?: Set<string> }) {
  const names = [...new Set((o.names || []).map(x => String(x || '').trim()).filter(x => Array.from(x).length >= 2))];
  const addrs = [...new Set((o.addresses || []).map(x => String(x || '').trim()).filter(x => x.length >= 5))].sort((a, b) => b.length - a.length);
  const words = o.words || new Set<string>();
  const tokens = [...new Set(names.flatMap(n => n.split(/\s+/)))].filter(t => Array.from(t).length >= 3 && !NAME_STOP.has(fold(t)) && !words.has(fold(t)));
  return (text: string | null | undefined): string => {
    let t = String(text ?? '').normalize('NFC');
    const blank = (needle: string, tag: string) => {
      const f = fold(needle).trim(); if (f.length < 2) return;
      const ft = fold(t); let res = '', i = 0;
      for (let j = ft.indexOf(f); j >= 0; j = ft.indexOf(f, i)) { res += t.slice(i, j) + tag; i = j + f.length; }
      t = res + t.slice(i);
    };
    t = t.replace(PHONE_RE, '<SDT>').replace(LONGNUM_RE, '<SO>').replace(EMAIL_RE, '<EMAIL>');
    for (const a of addrs) blank(a, '<DIA_CHI>');
    for (const n of names) blank(n, '<TEN>');
    for (const tok of tokens) t = t.replace(new RegExp('(?<![\\p{L}\\p{N}])' + reEsc(tok.normalize('NFC')) + '(?![\\p{L}\\p{N}])', 'gu'), '<TEN>');
    return t;
  };
}

/* Đơn nháp → dạng lưu làm mẫu (không có địa chỉ, SĐT, tên thật) */
export function stateOf(d: Draft, anon: (s: string | null | undefined) => string) {
  const at = d.at ? new Date(d.at) : null;
  return {
    items: d.items.map(i => ({ menu_item_id: i.menu_item_id, name: i.name, qty: i.qty, choice_ids: i.choice_ids, choices: i.choices, note: i.note ? anon(i.note) : null })),
    unknown: d.unknown.map(anon), dine_type: d.dine_type, date: at ? vnDate(at) : null, time: at ? vnTime(at) : null,
    address: d.address ? '<DIA_CHI>' : null, phone: d.customer_phone ? '<SDT>' : null, note: d.note ? anon(d.note) : null,
  };
}

export function trainSample(o: {
  thread: string; draftId?: string | null; now: Date; convo: { sender: string; text: string; at: string }[];
  anon: (s: string | null | undefined) => string; before: ReturnType<typeof stateOf>; after: Draft | null; ai: AiOut; model: string; menuHash: string;
}) {
  const intent = ['order', 'question', 'human', 'other'].includes(String(o.ai.intent)) ? String(o.ai.intent) : 'order';
  return {
    thread_hash: o.thread, draft_id: o.draftId || null, now_vn: vnDate(o.now) + ' ' + vnTime(o.now),
    convo: o.convo.slice(-12).map(m => ({ s: m.sender, h: vnTime(new Date(m.at)), t: o.anon(m.text) })),
    state_before: o.before, intent,
    target: o.after && intent !== 'human' ? Object.assign(stateOf(o.after, o.anon), { name: o.ai.name ? '<TEN>' : null }) : null,
    answer: intent === 'question' && o.ai.answer ? o.anon(o.ai.answer) : null,
    model: o.model || null, menu_hash: o.menuHash,
  };
}

async function sha(s: string) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}
/* Mã băm của PSID: gom mẫu cùng 1 khách, nhưng không lần ngược ra khách */
export const threadHash = async (psid: string) => (await sha('thread:' + psid + ':' + (env('FB_APP_SECRET') || 'benoc'))).slice(0, 16);

const knownMenus = new Set<string>();
/* Lưu mẫu. Lỗi gì cũng chỉ ghi log, không làm hỏng việc trả lời khách */
async function saveSample(sb: SupabaseClient, row: Record<string, unknown>, menuRaw: any[]) {
  try {
    const { data: st, error: e0 } = await sb.from('shop_settings').select('fb_train_on').eq('id', 1).maybeSingle();
    if (e0 || (st && st.fb_train_on === false)) return;   // chưa chạy cập nhật 24, hoặc chủ quán tắt lưu dữ liệu
    const hash = String(row.menu_hash);
    if (!knownMenus.has(hash)) {
      const { error } = await sb.from('fb_train_menu').upsert({ hash, menu: menuRaw }, { onConflict: 'hash', ignoreDuplicates: true });
      if (error) throw error; knownMenus.add(hash);
    }
    const { error } = await sb.from('fb_train').insert(row);
    if (error) throw error;
  } catch (e) { console.error('Lưu mẫu huấn luyện lỗi', e); }
}

/* Khách nhắn "xoá dữ liệu của tôi" (như chính sách riêng tư đã hứa) */
export function isForgetRequest(text: string) {
  const f = fold(text).trim();
  return f.length <= 80 && /xoa\s+(het\s+|toan\s+bo\s+)?(du\s*lieu|thong\s*tin|tin\s*nhan)\s+(cua\s+)?(toi|minh|em|tui|con)\b/.test(f);
}
async function forgetThread(sb: SupabaseClient, psid: string) {
  const { data: pend } = await sb.from('fb_drafts').select('id').eq('psid', psid).eq('status', 'cho_duyet').limit(1);
  await sb.from('fb_train').delete().eq('thread_hash', await threadHash(psid));
  await sb.from('fb_threads').delete().eq('psid', psid);   // tin nhắn và đơn nháp xoá theo
  return !!(pend && pend.length);
}

// ---------------------------------------------------------------------
// Xử lý một khách
// ---------------------------------------------------------------------
// Khoá quyền cao của Supabase: tên cũ SUPABASE_SERVICE_ROLE_KEY, tên mới SUPABASE_SECRET_KEY(S)
function serviceKey() {
  const k = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY'); if (k) return k;
  try { const m = JSON.parse(env('SUPABASE_SECRET_KEYS', '{}')); return m.default || Object.values(m)[0] || ''; } catch (_) { return ''; }
}
const db = () => createClient(env('SUPABASE_URL'), serviceKey() as string, { auth: { persistSession: false } });

async function ensureThread(sb: SupabaseClient, psid: string) {
  const { data } = await sb.from('fb_threads').select('*').eq('psid', psid).maybeSingle();
  if (data) return data;
  let name: string | null = null, link: string | null = null;
  try { const u = await graph(psid + '?fields=first_name,last_name,name'); name = u.name || [u.last_name, u.first_name].filter(Boolean).join(' ') || u.first_name || null; } catch (_) { /* thiếu quyền thì bỏ qua */ }
  try { const c = await graph('me/conversations?platform=messenger&user_id=' + psid + '&fields=link'); const l = c?.data?.[0]?.link; if (l) link = l.startsWith('http') ? l : 'https://www.facebook.com' + l; } catch (_) { /* bỏ qua */ }
  const row = { psid, name, link };
  await sb.from('fb_threads').upsert(row);
  return Object.assign({ paused_until: null, need_human: false }, row);
}

function textOf(m: any): string {
  if (m.text) return String(m.text).slice(0, 2000);
  const at = m.attachments || [];
  if (at.some((a: any) => a.type === 'image' && a.payload?.sticker_id)) return '[sticker]';
  if (at.some((a: any) => a.type === 'image')) return '[ảnh]';
  if (at.some((a: any) => a.type === 'location')) return '[vị trí]';
  if (at.length) return '[tệp]';
  return '';
}

/* Một sự kiện từ Facebook. Trả về psid cần xử lý (nếu có) */
async function storeEvent(sb: SupabaseClient, ev: any): Promise<string | null> {
  const m = ev.message, pb = ev.postback;
  if (m && m.is_echo) {
    // Tin Page gửi đi. Tin bot / trang Quản lý gửi thì đã lưu; còn lại là chủ quán tự nhắn trong hộp thư → bot im một lúc
    const psid = ev.recipient?.id; if (!psid) return null;
    if (String(m.metadata || '').startsWith('benoc-')) return null;
    await ensureThread(sb, psid);
    await sb.from('fb_messages').insert({ psid, mid: m.mid, sender: 'quan', text: textOf(m) || '[tin]' }).then(() => null, () => null);
    const mins = Number(env('BOT_PAUSE_MINUTES', '30')) || 30;
    await sb.from('fb_threads').update({ paused_until: new Date(Date.now() + mins * 60e3).toISOString(), last_at: new Date().toISOString() }).eq('psid', psid);
    return null;
  }
  const psid = ev.sender?.id; if (!psid) return null;
  if (m) {
    const text = textOf(m); if (!text) return null;
    await ensureThread(sb, psid);
    const { error } = await sb.from('fb_messages').insert({ psid, mid: m.mid, sender: 'khach', text });
    if (error) return null; // trùng mid: Facebook gửi lại
    await sb.from('fb_threads').update({ last_at: new Date().toISOString() }).eq('psid', psid);
    return psid;
  }
  if (pb) { // nút "Bắt đầu"
    await ensureThread(sb, psid);
    await sb.from('fb_messages').insert({ psid, mid: 'pb-' + (ev.timestamp || Date.now()) + '-' + psid, sender: 'khach', text: '[bắt đầu]' }).then(() => null, () => null);
    return psid;
  }
  return null;
}

async function botSay(sb: SupabaseClient, psid: string, text: string, quick: string[] | null) {
  await fbSend(psid, text, quick);
  await sb.from('fb_messages').insert({ psid, sender: 'bot', text });
}

export async function handleThread(sb: SupabaseClient, psid: string) {
  const now = new Date();
  const [{ data: th }, { data: st }] = await Promise.all([
    sb.from('fb_threads').select('*').eq('psid', psid).single(),
    sb.from('shop_settings').select('fb_bot_on, fb_open, fb_close, fb_hello').eq('id', 1).single(),
  ]);
  if (!th || !st || st.fb_bot_on === false) return;
  if (th.paused_until && new Date(th.paused_until) > now) return;
  const open = st.fb_open || '07:00', close = st.fb_close || '22:00';

  const since = new Date(now.getTime() - THREAD_HOURS * 3600e3).toISOString();
  const [{ data: msgs }, { data: drafts }] = await Promise.all([
    sb.from('fb_messages').select('sender, text, created_at').eq('psid', psid).gte('created_at', since).order('created_at', { ascending: false }).limit(30),
    sb.from('fb_drafts').select('*').eq('psid', psid).gte('updated_at', since).order('updated_at', { ascending: false }).limit(1),
  ]);
  const convo = (msgs || []).reverse().map((m: any) => ({ sender: m.sender, text: m.text, at: m.created_at }));
  const last = drafts && drafts[0];
  const approved = last && last.status === 'da_duyet' ? last : null;
  let d: Draft = last && (last.status === 'dang_hoi' || last.status === 'cho_duyet') ? last
    : { psid, status: 'dang_hoi', dine_type: null, at: null, customer_name: th.name, customer_phone: null, address: null, note: null, items: [], unknown: [], missing: [], total_est: 0, asked: [] };
  const wasPending = d.status === 'cho_duyet';
  const firstBot = !convo.some(m => m.sender === 'bot');
  const firstName: string | null = th.name ? String(th.name).split(' ').pop() || null : null;

  // Chỉ có câu "bắt đầu" / chưa nói gì: gửi mẫu đặt món
  const said = convo.filter(m => m.sender === 'khach' && m.text !== '[bắt đầu]');
  if (!said.length) { await botSay(sb, psid, helloForm(firstName, st.fb_hello), null); return; }
  const lastK = said[said.length - 1].text;
  if (/^\[(ảnh|tệp|vị trí)\]$/.test(lastK)) { // ảnh chuyển khoản, ảnh món… để chủ quán xem
    await sb.from('fb_threads').update({ need_human: true }).eq('psid', psid);
    await botSay(sb, psid, 'Dạ em đã nhận ' + lastK.slice(1, -1) + ', em báo chủ quán xem ngay ạ.', null); return;
  }
  if (lastK === '[sticker]') return;
  if (isForgetRequest(lastK)) { // “xoá dữ liệu của tôi” như chính sách riêng tư đã hứa
    const hadPending = await forgetThread(sb, psid);
    await fbSend(psid, 'Dạ em đã xoá tin nhắn và thông tin đặt món của mình rồi ạ.' + (hadPending ? ' Đơn đang chờ quán xác nhận cũng đã huỷ, mình cần đặt thì nhắn lại em nha.' : '') +
      ' Hoá đơn quán đã xác nhận thì quán vẫn phải lưu để đối soát doanh thu, mình thông cảm nha 🙏', null);
    return;
  }

  await fbAction(psid, 'typing_on');
  const menuRaw: any[] = (await sb.rpc('get_menu')).data || [];
  const menu = buildMenu(menuRaw);
  let ai: AiOut;
  try {
    const appr = approved ? draftSummary(approved as Draft, now).replace(/\n/g, '; ') : null;
    ai = await askAi(systemPrompt(menu, now, open, close), userPrompt(d, convo, appr));
  } catch (e) {
    console.error('AI lỗi', e);
    await sb.from('fb_threads').update({ need_human: true }).eq('psid', psid);
    await botSay(sb, psid, 'Dạ em ghi nhận tin nhắn của mình, chủ quán sẽ trả lời mình ngay ạ.', null); return;
  }

  // Chuẩn bị mẫu huấn luyện (chụp đơn TRƯỚC khi applyAi sửa vào d). Lưu sau khi đã trả lời khách.
  const anon = anonymizer({ names: [th.name, d.customer_name, ai.name], addresses: [d.address, ai.address], words: menuWords(menu) });
  const stateBefore = stateOf(d, anon);
  const log = async (after: Draft | null, draftId?: string | null) => {
    try {
      const menuHash = (await sha(JSON.stringify(menuRaw))).slice(0, 16);
      await saveSample(sb, trainSample({ thread: await threadHash(psid), draftId, now, convo, anon, before: stateBefore, after, ai, model: ai._model || aiProvider(), menuHash }), menuRaw);
    } catch (e) { console.error('Chuẩn bị mẫu lỗi', e); }
  };

  if (ai.intent === 'human') {
    const mins = Number(env('BOT_PAUSE_MINUTES', '30')) || 30;
    await sb.from('fb_threads').update({ need_human: true, paused_until: new Date(now.getTime() + mins * 60e3).toISOString() }).eq('psid', psid);
    await botSay(sb, psid, 'Dạ em báo chủ quán trả lời mình ngay ạ, mình đợi em chút nha.', null);
    await log(null, d.id); return;
  }
  const before = JSON.stringify({ i: d.items, t: d.dine_type, a: d.at, ad: d.address, p: d.customer_phone });
  d.asked = d.asked || [];
  applyAi(d, ai, menu, now, th.name);
  const changed = before !== JSON.stringify({ i: d.items, t: d.dine_type, a: d.at, ad: d.address, p: d.customer_phone });
  const miss = missingOf(d, now, open, close);
  d.missing = miss;

  // Khách chỉ chào / cảm ơn: trả lời ngắn, không gửi lại mẫu đặt món
  const nothing = !d.items.length && !d.dine_type && !d.at && !d.address && !d.unknown.length;
  if (ai.intent !== 'question' && ((wasPending && !changed) || (nothing && !firstBot))) {
    await botSay(sb, psid, wasPending ? 'Dạ đơn của mình đang chờ quán xác nhận ạ, có gì em nhắn mình ngay nha 🥰'
      : approved ? 'Dạ em cảm ơn mình ạ 🥰 Đơn của mình quán đã xác nhận rồi nha.' : 'Dạ mình muốn đặt món cứ nhắn em món ăn, đồ uống, qua lấy / ăn tại quán / ship và giờ hẹn nha 🥰', null);
    await log(d, d.id); return;
  }
  const r = composeReply(d, miss, { now, first: firstBot, name: firstName, answer: ai.intent === 'question' ? ai.answer : null, wasPending, changed, open, close, hello: st.fb_hello });
  const row: any = {
    psid, dine_type: d.dine_type, at: d.at, customer_name: d.customer_name, customer_phone: d.customer_phone, address: d.address, note: d.note,
    items: d.items, unknown: d.unknown, missing: miss, total_est: d.total_est, asked: d.asked, updated_at: now.toISOString(),
    status: r.done ? 'cho_duyet' : 'dang_hoi',
    changed_after: wasPending && changed ? true : (d.changed_after || false),
  };
  const hasSomething = d.items.length || d.dine_type || d.at || d.unknown.length;
  let draftId: string | null = d.id || null;
  if (hasSomething || d.id) {
    if (d.id) await sb.from('fb_drafts').update(row).eq('id', d.id);
    else { const { data: ins } = await sb.from('fb_drafts').insert(row).select('id').single(); draftId = ins?.id || null; }
  }
  await botSay(sb, psid, r.text, r.quick);
  await log(d, draftId);
}

// ---------------------------------------------------------------------
// Lệnh từ trang Quản lý (đăng nhập chủ quán)
// ---------------------------------------------------------------------
async function ownerOf(sb: SupabaseClient, req: Request) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data } = await sb.auth.getUser(jwt); const uid = data?.user?.id; if (!uid) return null;
  const { data: e } = await sb.from('employees').select('id, full_name, role, is_active').eq('auth_user_id', uid).maybeSingle();
  return e && e.is_active && e.role === 'owner' ? e : null;
}
export function approvedText(d: any, total: number, bank: any, now: Date) {
  const at = d.at ? new Date(d.at) : null; const t = at ? vnTime(at) : '';
  const day = at && vnDate(at) !== vnDate(now) ? ' ' + vnWeekday(at) + ' ' + vnDate(at).slice(8) + '/' + vnDate(at).slice(5, 7) : '';
  const how = d.dine_type === 'giao_hang' ? 'Quán giao cho mình lúc ' + t + day + ' ạ.' : d.dine_type === 'tai_quan' ? 'Hẹn mình ' + t + day + ' đến quán ạ.' : 'Hẹn mình ' + t + day + ' qua lấy ạ.';
  const lines = ['Dạ quán đã xác nhận đơn của mình ✅', (d.items || []).map(itemLine).join('\n'), 'Tổng: ' + vnd(total) + (d.dine_type === 'giao_hang' ? ' (chưa gồm phí ship)' : ''), how];
  if (bank && bank.bank_account) lines.push('Mình chuyển khoản trước được ạ: ' + bank.bank_name + ' ' + bank.bank_account + (bank.bank_holder ? ' (' + bank.bank_holder + ')' : '') + ', nội dung: BENOC ' + String(d.customer_name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase().slice(0, 15));
  lines.push('Cảm ơn mình đã đặt Bé Nốc 🥰');
  return lines.join('\n\n');
}
async function appAction(sb: SupabaseClient, req: Request, body: any) {
  const owner = await ownerOf(sb, req);
  if (!owner) return json({ error: 'FORBIDDEN' }, 403);
  if (body.action === 'approved') {
    const { data: d } = await sb.from('fb_drafts').select('*').eq('id', body.draft_id).single();
    if (!d || d.status !== 'da_duyet') return json({ error: 'DRAFT_NOT_APPROVED' }, 400);
    const { data: o } = await sb.from('orders').select('total').eq('id', d.order_id).maybeSingle();
    const { data: bank } = await sb.from('shop_settings').select('bank_name, bank_account, bank_holder').eq('id', 1).single();
    const text = approvedText(d, o ? o.total : d.total_est, body.with_bank === false ? null : bank, new Date());
    try { await fbSend(d.psid, text, null, APP_TAG); } catch (e) { return json({ error: String((e as Error).message) }, 502); }
    await sb.from('fb_messages').insert({ psid: d.psid, sender: 'quan', text });
    await sb.from('fb_threads').update({ need_human: false }).eq('psid', d.psid);
    return json({ ok: true });
  }
  if (body.action === 'send') {
    const text = String(body.text || '').trim().slice(0, 1900); if (!text || !body.psid) return json({ error: 'EMPTY' }, 400);
    try { await fbSend(String(body.psid), text, null, APP_TAG); } catch (e) { return json({ error: String((e as Error).message) }, 502); }
    await sb.from('fb_messages').insert({ psid: String(body.psid), sender: 'quan', text });
    return json({ ok: true });
  }
  if (body.action === 'profile') { // nút "Bắt đầu" + lời chào trên Messenger của Fanpage
    try {
      await graph('me/messenger_profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        get_started: { payload: 'GET_STARTED' },
        greeting: [{ locale: 'default', text: 'Bé Nốc nhận đặt món qua tin nhắn 🥰 Bấm Bắt đầu để xem mẫu đặt món.' }],
      }) });
    } catch (e) { return json({ error: String((e as Error).message) }, 502); }
    return json({ ok: true });
  }
  if (body.action === 'status') { // trang Cài đặt kiểm tra bot đã cài đủ chưa
    let page: any = null; try { page = await graph('me?fields=id,name'); } catch (e) { page = { error: String((e as Error).message) }; }
    return json({ ok: true, page, ai: aiProvider(), has_ai_key: !!(aiProvider() === 'gemini' ? env('GEMINI_API_KEY') : env('ANTHROPIC_API_KEY')), has_secret: !!env('FB_APP_SECRET'), has_verify: !!env('FB_VERIFY_TOKEN') });
  }
  return json({ error: 'BAD_ACTION' }, 400);
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: Object.assign({ 'content-type': 'application/json' }, CORS) });

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') { // Meta kiểm tra webhook
    if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === env('FB_VERIFY_TOKEN') && env('FB_VERIFY_TOKEN'))
      return new Response(url.searchParams.get('hub.challenge') || '', { status: 200 });
    return new Response('Bé Nốc fb-bot đang chạy', { status: req.headers.get('x-hub-signature-256') ? 403 : 200 });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const raw = await req.text();
  const sig = req.headers.get('x-hub-signature-256');
  const sb = db();
  if (!sig) { // lệnh từ trang Quản lý
    let body: any = {}; try { body = JSON.parse(raw || '{}'); } catch (_) { /* rỗng */ }
    return appAction(sb, req, body);
  }
  if (!(await verifySignature(raw, sig, env('FB_APP_SECRET')))) return new Response('bad signature', { status: 401 });
  let body: any; try { body = JSON.parse(raw); } catch (_) { return new Response('ok'); }
  if (body.object !== 'page') return new Response('ok');
  const work = (async () => {
    const touched = new Set<string>();
    for (const entry of body.entry || []) for (const ev of entry.messaging || []) {
      try { const p = await storeEvent(sb, ev); if (p) touched.add(p); } catch (e) { console.error('Lưu tin lỗi', e); }
    }
    for (const psid of touched) {
      fbAction(psid, 'mark_seen');
      // Đợi khách nhắn nốt; có tin mới hơn thì lượt sau xử lý, lượt này thôi
      const { data: a } = await sb.from('fb_messages').select('id').eq('psid', psid).eq('sender', 'khach').order('id', { ascending: false }).limit(1);
      await new Promise(r => setTimeout(r, DEBOUNCE_MS));
      const { data: b } = await sb.from('fb_messages').select('id').eq('psid', psid).eq('sender', 'khach').order('id', { ascending: false }).limit(1);
      if (a?.[0]?.id !== b?.[0]?.id) continue;
      try { await handleThread(sb, psid); } catch (e) { console.error('Xử lý lỗi', psid, e); }
    }
  })();
  const ER = (globalThis as any).EdgeRuntime;
  if (ER && ER.waitUntil) ER.waitUntil(work); else await work;
  return new Response('EVENT_RECEIVED', { status: 200 });
}

if (!env('FB_BOT_NO_SERVE')) (globalThis as any).Deno.serve(handle);
