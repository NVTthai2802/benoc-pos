// =====================================================================
// BÉ NỐC — BOT LÊN ĐƠN TỪ ẢNH CHỤP (Supabase Edge Function "bot-don")
//
//  Chủ quán nhắn khách trên Facebook như bình thường, rồi:
//  ảnh chụp đoạn chat ──Zalo / Telegram──▶ bot-don ──AI đọc ảnh──▶ đơn thật vào thẳng bếp / pha chế (nhãn ĐƠN ONLINE)
//                                              └─ nhắn lại tóm tắt đơn cho chủ quán
//  (fb_drafts vẫn lưu bản bot đọc để sửa tiếp và làm dữ liệu huấn luyện; cập nhật 27)
//
//  Nhắn chữ cho bot để sửa đơn vừa lên ("thêm 1 trà đào", "giờ 18h"), hoặc gõ thẳng cả đơn.
//  Nhắn "huỷ" để huỷ đơn vừa lên. Bếp đã bấm Nhận thì bot không sửa / huỷ nữa (sửa ở màn hình bếp). Chỉ tài khoản đã kết nối bằng mã (lấy trong Quản lý) mới dùng được.
//
//  Biến môi trường (Supabase → Edge Functions → Secrets):
//    ZALO_BOT_TOKEN       token bot Zalo (tạo ở https://bot.zapps.me)          ┐ cần ít nhất 1 trong 2
//    TELEGRAM_BOT_TOKEN   token bot Telegram (tạo bằng @BotFather)            ┘
//    GEMINI_API_KEY       khoá AI Gemini   (GEMINI_MODEL: để trống tự thử gemini-3.5-flash-lite → 3.8-flash → 2.5-flash)
//    ANTHROPIC_API_KEY    hoặc khoá Claude (CLAUDE_MODEL, mặc định claude-haiku-5-5); AI_PROVIDER = gemini | claude để chọn
//  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: Supabase tự cấp sẵn.
//
//  Khi tạo function: TẮT "Verify JWT" (Zalo / Telegram không gửi JWT). Tin từ Zalo / Telegram được
//  kiểm tra bằng mã bí mật suy ra từ token; lệnh từ trang Quản lý thì kiểm tra tài khoản chủ quán.
//  Webhook Zalo / Telegram: bấm "Cài webhook" trong Quản lý → Đơn online → Cài đặt bot.
// =====================================================================
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const env = (k: string, d = '') => (globalThis as any).Deno?.env.get(k) ?? d;
const PHOTO_WAIT_MS = 3000;     // chủ quán hay gửi nhiều ảnh liền nhau: đợi gom đủ rồi đọc một lượt
const MAX_PHOTOS = 8;           // tối đa 8 ảnh / đơn
const MAX_PHOTO_BYTES = 8e6;    // ảnh lớn hơn 8MB thì bỏ
const OPEN_MINUTES = 90;        // đơn nháp gửi trong 90 phút gần nhất coi là "đơn đang ghi" (nhắn chữ là sửa đơn này)
export const KENH = { zalo: 'zalo', tele: 'tele' } as const;
export type Kenh = 'zalo' | 'tele';

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
  id?: string; psid: string | null; status: string; dine_type: string | null; at: string | null; customer_name: string | null; customer_phone: string | null;
  address: string | null; note: string | null; items: DItem[]; unknown: string[]; missing: string[]; total_est: number; asked: string[]; changed_after?: boolean;
};
export type AiOut = {
  intent?: string; items?: { m: number; qty?: number; choices?: number[]; note?: string }[]; unknown?: string[];
  dine_type?: string | null; date?: string | null; time?: string | null; address?: string | null; phone?: string | null; name?: string | null; note?: string | null; answer?: string | null;
  same_order?: boolean; khach?: string | null; convo?: { s: string; t: string }[];
  _model?: string;   // máy chủ gắn thêm: model nào đã đọc (không phải AI trả)
};

/* Ghi chú có phải chỉ nhắc lại một lựa chọn không: bỏ dấu, bỏ từ đệm ("thêm", "1", "phần", "cho"), các chữ còn lại đều nằm trong tên lựa chọn */
const FILLER = new Set(['them', '1', 'mot', 'phan', 'cho', 'lay', 'nhe', 'a']);
export function sameAsChoice(note: string, choice: string) {
  const w = (t: string) => fold(t).split(/[^a-z0-9]+/).filter(x => x && !FILLER.has(x));
  const a = w(note), b = new Set(w(choice));
  return a.length > 0 && a.every(x => b.has(x));
}
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
    let note: string | null = (x.note || '').trim().slice(0, 120) || null;
    if (note && names.some(n => sameAsChoice(note!, n))) note = null;   // ghi chú chỉ lặp lại tuỳ chọn đã chọn (vd "thêm mì" khi đã chọn "Thêm 1 phần mì")
    items.push({ menu_item_id: it.id, name: it.name, qty, choice_ids: ids, choices: [...new Set(names)], note, price: it.price + extra, drink: it.drink });
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

// ---------------------------------------------------------------------
// AI đọc ảnh chụp đoạn chat / tin chữ của chủ quán
// ---------------------------------------------------------------------
export function systemPrompt(menu: Menu, now: Date, open: string, close: string) {
  return `Bạn là trợ lý lên đơn cho quán Bé Nốc (cơm trộn, mì trộn, kimbap, đồ ăn vặt, trà sữa, trà hoa quả, cà phê, matcha).
Bây giờ là ${vnTime(now)} ${vnWeekday(now)} ngày ${vnDate(now)} (giờ Việt Nam). Quán nhận đơn từ ${open} đến ${close}.

Chủ quán gửi cho bạn MỘT trong hai loại:
(a) ẢNH CHỤP MÀN HÌNH đoạn chat đặt món giữa quán và MỘT khách (Messenger / Facebook / Zalo), có thể nhiều ảnh, theo thứ tự cũ → mới. Tin của QUÁN thường nằm bên PHẢI (bong bóng có màu), tin của KHÁCH nằm bên TRÁI. Tên khách thường ở đầu màn hình. Ảnh vừa chụp, nên "chiều nay", "tối nay" là hôm nay; tin có mốc giờ / ngày thì dựa vào đó.
(b) TIN CHỮ do chủ quán gõ: lệnh sửa ĐƠN ĐANG GHI ("thêm 1 trà đào", "bỏ kimbap", "giờ 18h", "ship 12 ngõ 5…, sđt 09…"), hoặc cả một đơn chủ quán tự gõ khi chưa có đơn đang ghi.

Nhiệm vụ: trả về TRẠNG THÁI ĐƠN ĐẦY ĐỦ, MỚI NHẤT dưới dạng JSON: gom mọi thông tin hai bên đã chốt; khách đổi ý thì lấy ý mới nhất; quán báo hết món / khách bỏ món thì bỏ khỏi danh sách.

CHỐNG ĐẾM TRÙNG (rất quan trọng):
- Khách hay NHẮC LẠI cả đơn hoặc GHI RÕ HƠN món đã gọi (nhất là khi quán chưa trả lời kịp). Món nhắc lại / ghi rõ hơn là CÙNG MỘT MÓN, KHÔNG cộng thêm số lượng.
  Ví dụ: "Cho em 1 cơm trộn ạ" … "Alo ạ" … "Cho em 1ts cốm, 1 cơm trộn HQ ạ" → đơn là 1 Cơm trộn Hàn Quốc + 1 Trà sữa cốm (KHÔNG phải 2 cơm trộn). Tin sau đầy đủ hơn thì lấy tin sau.
- Chỉ cộng thêm khi khách nói rõ là gọi THÊM: "thêm 1…", "1… nữa", "cho thêm", "gọi thêm", hoặc quán hỏi "mình lấy thêm gì không" và khách gọi món mới.
- Tin của quán hoặc bot (bên phải) nhắc lại / tóm tắt đơn thì KHÔNG phải món mới.
- "TỔNG rồi CHIA CHI TIẾT": "2 cơm trộn, 1 cơm trộn nhiều cơm, 1 cơm trộn không trứng" = 2 phần cơm trộn chia thành 2 dòng (1 nhiều cơm + 1 không trứng), KHÔNG phải 4 phần. Số ở đầu là tổng, các dòng sau là cách chia của chính tổng đó.

LỆNH SỬA CỦA CHỦ QUÁN (tin chữ):
- "sửa A thành B" / "đổi A thành B": bỏ A khỏi đơn, thay bằng B (giữ số lượng của A nếu không nói số mới).
- "thêm ...": thêm món mới; "bỏ ..." / "không lấy ...": bỏ món đó.
- Một tin có thể có nhiều lệnh nối bằng dấu phẩy / "và"; làm lần lượt từng lệnh trên ĐƠN ĐANG GHI, rồi trả về cả đơn sau khi sửa.
  Ví dụ: đơn đang ghi [1 Cơm trộn Hàn Quốc, 1 Hồng trà sữa cốm tươi]; chủ quán nhắn "sửa cơm trộn thành mỳ nem thêm mỳ, thêm cơm băm và 2 cơm trộn, 1 cơm trộn nhiều cơm, 1 cơm trộn không trứng"
  → [1 Mì nem chua rán (lựa chọn "Thêm 1 phần mì"), 1 Cơm thịt băm trứng, 1 Cơm trộn Hàn Quốc note "nhiều cơm", 1 Cơm trộn Hàn Quốc note "không trứng", 1 Hồng trà sữa cốm tươi].
- Yêu cầu khớp một lựa chọn # của món (thêm mì, ít đá, size L…) thì chọn lựa chọn đó, KHÔNG ghi lặp vào note. Yêu cầu không có trong lựa chọn ("nhiều cơm", "không trứng", "ít cay") thì ghi vào note của đúng món đó.

${menuText(menu)}

QUY TẮC:
- items: mỗi món {"m": số thứ tự món trong menu, "qty": số lượng, "choices": [số # của lựa chọn], "note": ghi chú riêng của món hoặc null}.
  * Chỉ dùng lựa chọn # thuộc các nhóm G của chính món đó. Không nói thì để [] (máy tự lấy mặc định).
  * Hai ly cùng món nhưng khác tuỳ chọn thì tách 2 dòng.
  * Món không có trong menu, hoặc mơ hồ không đoán chắc được → ghi nguyên văn vào "unknown", KHÔNG đoán bừa.
- Viết tắt hay gặp: ts = trà sữa, tc = trân châu, tcđđ/tcdd = trân châu đường đen, thq/tra hq = trà hoa quả, cf/cafe/cfe = cà phê, mt = matcha, sz = size, đ = đường hoặc đá (theo ngữ cảnh), k/ko/kh/hok/hông = không, ít đ = ít đường hoặc ít đá theo ngữ cảnh, 1c/1 cốc/1 ly = 1, x2/2 suất = số lượng 2, ib = nhắn tin, sdt = số điện thoại, đc/dc = địa chỉ hoặc được (theo ngữ cảnh). Gõ không dấu cũng hiểu như có dấu.
- dine_type: "mang_ve" khi khách tự qua lấy / ghé lấy / mang về; "tai_quan" khi ăn tại quán / ngồi quán / đặt bàn; "giao_hang" khi ship / giao / gửi tới địa chỉ. Chưa rõ thì null.
- time: giờ hẹn dạng "HH:MM" 24 giờ (6h chiều = 18:00, 7r tối = 19:30, 11h trưa = 11:00). "Bây giờ", "luôn", "ngay", "sớm nhất" → "now". Không nói giờ → null. Giờ mơ hồ ("chiều nay", "tối") → null.
- date: "YYYY-MM-DD" nếu hẹn ngày khác hôm nay ("mai", "thứ 7"), không thì null.
- address: địa chỉ giao hàng nguyên văn. phone: số điện thoại khách đưa. name: tên người nhận nếu khách tự xưng. note: ghi chú chung cho cả đơn.
- khach: tên khách hiện trên đầu đoạn chat (tên Facebook / Zalo) nếu thấy trong ảnh, không thì null.
- convo: CHỈ với ảnh: chép lại các tin LIÊN QUAN tới đơn theo thứ tự [{"s":"khach" hoặc "quan","t":"nội dung"}], tối đa 30 tin, bỏ tin không liên quan. Tin chữ của chủ quán thì để [].
- same_order: CHỈ khi có ĐƠN ĐANG GHI: true nếu ảnh / tin mới là của CÙNG khách, cùng đơn đó (bổ sung, sửa) — khi đó trả về trạng thái đã gộp cả thông tin cũ; false nếu là khách khác / đơn khác. Tin chữ của chủ quán luôn là true nếu có đơn đang ghi.
- intent: "order" bình thường; "khong_phai_don" nếu ảnh không phải đoạn chat đặt món (ảnh món ăn, ảnh chuyển khoản, ảnh mờ không đọc được…).

Chỉ trả về đúng một object JSON, không giải thích:
{"intent":"order","same_order":false,"khach":null,"convo":[{"s":"khach","t":"..."}],"items":[{"m":1,"qty":2,"choices":[],"note":null}],"unknown":[],"dine_type":null,"date":null,"time":null,"address":null,"phone":null,"name":null,"note":null}`;
}

export function userPrompt(o: { cur: Draft | null; nImages: number; text?: string | null; caption?: string | null }) {
  const c = o.cur;
  const cur = c ? {
    khach: c.customer_name, items: c.items.map(i => ({ ten: i.name, qty: i.qty, tuy_chon: i.choices, note: i.note })), dine_type: c.dine_type,
    gio_hen: c.at ? vnDate(new Date(c.at)) + ' ' + vnTime(new Date(c.at)) : null, address: c.address, phone: c.customer_phone, note: c.note,
  } : null;
  return (cur ? 'ĐƠN ĐANG GHI (lên cách đây chưa lâu): ' + JSON.stringify(cur) + '\n\n' : 'Chưa có đơn đang ghi.\n\n') +
    (o.nImages ? 'Chủ quán gửi ' + o.nImages + ' ảnh chụp màn hình (theo thứ tự cũ → mới).' + (o.caption ? ' Chủ quán ghi kèm: "' + o.caption + '"' : '') : 'Chủ quán nhắn: "' + (o.text || '') + '"') +
    '\n\nTrả về JSON trạng thái đơn mới nhất.';
}

export function parseJson(t: string): AiOut {
  const s = String(t || '').replace(/```(?:json)?/g, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('AI không trả JSON');
  return JSON.parse(s.slice(a, b + 1));
}


export type Img = { mime: string; b64: string };
// Model nhanh chạy trước; model "suy nghĩ" (3.8-flash) chậm, chỉ để cuối làm dự phòng.
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.8-flash'];
const AI_TIMEOUT_MS = 12000;     // 1 lần gọi AI (chỉ chữ) quá 12 giây thì bỏ, thử model khác
const AI_IMG_TIMEOUT_MS = 25000; // có ảnh thì đọc lâu hơn
/* Tắt / giảm "suy nghĩ" để trả lời nhanh: việc tách đơn không cần suy luận dài */
export function thinkCfg(model: string): Record<string, unknown> | null {
  if (/lite/.test(model)) return null;
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: 'low' };
  return null;
}
const AI_RETRY_MS = 2000;      // mọi model đều quá tải: đợi 2 giây rồi thử lại 1 vòng
const AI_BUDGET_MS = 110000;   // tổng thời gian tối đa cho 1 lượt (function bị dừng ở ~150 giây)
export const aiProvider = () => (env('AI_PROVIDER') || (env('GEMINI_API_KEY') && !env('ANTHROPIC_API_KEY') ? 'gemini' : 'claude')).toLowerCase();
export async function askAi(system: string, user: string, images: Img[] = []): Promise<AiOut> {
  const provider = aiProvider();
  const deadline = Date.now() + AI_BUDGET_MS, per = images.length ? AI_IMG_TIMEOUT_MS : AI_TIMEOUT_MS;
  let text = '', used = '';
  if (provider === 'gemini') {
    // Model lỗi (không có, quá tải 503, hết lượt 429, chậm quá) thì thử model kế tiếp. Cả lượt đều quá tải: đợi chút, thử lại 1 vòng.
    // Sai khoá (401) thì dừng luôn.
    const models = env('GEMINI_MODEL') ? [env('GEMINI_MODEL')] : GEMINI_MODELS;
    const parts: any[] = [{ text: user }, ...images.map(im => ({ inlineData: { mimeType: im.mime, data: im.b64 } }))];
    let err = '';
    for (let round = 0; round < 2 && !used; round++) {
      if (round) await new Promise(r => setTimeout(r, AI_RETRY_MS));
      let retry = false;
      for (const model of models) {
        const left = deadline - Date.now(); if (left < 5000) { retry = false; break; }
        const t0 = Date.now();
        let r: Response;
        const call = (think: Record<string, unknown> | null) => fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }],
            generationConfig: Object.assign({ responseMimeType: 'application/json', temperature: 0.1 }, think ? { thinkingConfig: think } : {}) }),
          signal: AbortSignal.timeout(Math.min(per, left)),
        });
        try {
          r = await call(thinkCfg(model));
          if (r.status === 400 && thinkCfg(model)) { console.warn('Gemini ' + model + ' không nhận thinkingConfig, gọi lại không có'); r = await call(null); }   // model không hỗ trợ tuỳ chọn suy nghĩ
        } catch (e) { err = 'Gemini ' + model + ': ' + String((e as Error)?.name === 'TimeoutError' ? 'quá ' + Math.round(Math.min(per, left) / 1000) + ' giây' : e); retry = true; console.warn(err); continue; }
        if (r.ok) { const j = await r.json(); text = j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || ''; err = ''; used = model; console.log('⏱ AI ' + model + ' ' + (Date.now() - t0) + 'ms' + (images.length ? ' · ' + images.length + ' ảnh' : ' · chữ')); break; }
        err = 'Gemini ' + model + ' ' + r.status + ': ' + (await r.text()).slice(0, 300);
        console.warn(err);
        if (r.status === 401) { retry = false; break; }
        if (r.status === 429 || r.status >= 500) retry = true;
      }
      if (!retry) break;
    }
    if (err) throw new Error(err);
  } else {
    const content: any[] = [...images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.b64 } })), { type: 'text', text: user }];
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env('CLAUDE_MODEL', 'claude-haiku-5-5'), max_tokens: 3000, temperature: 0, system, messages: [{ role: 'user', content }] }),
      signal: AbortSignal.timeout(Math.max(per, 60000)),
    });
    if (!r.ok) throw new Error('Claude ' + r.status + ': ' + (await r.text()).slice(0, 300));
    const j = await r.json(); text = (j?.content || []).map((c: any) => c.text || '').join(''); used = env('CLAUDE_MODEL', 'claude-haiku-5-5');
  }
  return Object.assign(parseJson(text), { _model: used });
}

// ---------------------------------------------------------------------
// Dữ liệu huấn luyện: mỗi lần AI đọc ảnh chụp / tin của chủ quán lưu 1 mẫu vào fb_train (cập nhật 24),
// ĐÃ ẩn tên, SĐT, số tài khoản (địa chỉ giữ nguyên để mô hình học trích địa chỉ). Khi chủ quán duyệt đơn, SQL gắn thêm đáp án đúng.
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

/* Trả về hàm ẩn thông tin cá nhân. Cắt: SĐT, email, dãy số dài, tên đã biết. Địa chỉ giữ nguyên (chủ quán đồng ý).
   Chỉ là "cố gắng hết sức": dữ liệu vẫn nằm trong Supabase của quán, đừng đăng công khai. */
export function anonymizer(o: { names?: (string | null | undefined)[]; words?: Set<string> }) {
  const names = [...new Set((o.names || []).map(x => String(x || '').trim()).filter(x => Array.from(x).length >= 2))];
  const words = o.words || new Set<string>();
  const tokens = [...new Set(names.map(n => n.split(/\s+/).pop() || ''))].filter(t => Array.from(t).length >= 3 && !NAME_STOP.has(fold(t)) && !words.has(fold(t)));
  return (text: string | null | undefined): string => {
    let t = String(text ?? '').normalize('NFC');
    const blank = (needle: string, tag: string) => {
      const f = fold(needle).trim(); if (f.length < 2) return;
      const ft = fold(t); let res = '', i = 0;
      for (let j = ft.indexOf(f); j >= 0; j = ft.indexOf(f, i)) { res += t.slice(i, j) + tag; i = j + f.length; }
      t = res + t.slice(i);
    };
    t = t.replace(PHONE_RE, '<SDT>').replace(LONGNUM_RE, '<SO>').replace(EMAIL_RE, '<EMAIL>');
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
    address: d.address, phone: d.customer_phone ? '<SDT>' : null, note: d.note ? anon(d.note) : null,
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
/* Mã băm gom mẫu cùng 1 khách, không lần ngược ra khách */
export const threadHash = async (psid: string) => (await sha('thread:' + psid + ':' + (env('ZALO_BOT_TOKEN') || env('TELEGRAM_BOT_TOKEN') || 'benoc'))).slice(0, 16);

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


// Khoá quyền cao của Supabase: tên cũ SUPABASE_SERVICE_ROLE_KEY, tên mới SUPABASE_SECRET_KEY(S)
function serviceKey() {
  const k = env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY'); if (k) return k;
  try { const m = JSON.parse(env('SUPABASE_SECRET_KEYS', '{}')); return m.default || Object.values(m)[0] || ''; } catch (_) { return ''; }
}
const db = () => createClient(env('SUPABASE_URL'), serviceKey() as string, { auth: { persistSession: false } });


// ---------------------------------------------------------------------
// Zalo Bot / Telegram: nhận tin, gửi tin, lấy ảnh
// ---------------------------------------------------------------------
const tokenOf = (k: Kenh) => (k === 'zalo' ? env('ZALO_BOT_TOKEN') : env('TELEGRAM_BOT_TOKEN')).trim();
/* Mã bí mật gắn vào webhook (Zalo / Telegram gửi kèm mỗi lần gọi). Suy ra từ token nên không phải nhập thêm secret */
export async function webhookSecret(k: Kenh) { const t = tokenOf(k); return t ? (await sha('benoc-bot-don:' + k + ':' + t)).slice(0, 48) : ''; }
const apiBase = (k: Kenh) => (k === 'zalo' ? 'https://bot-api.zaloplatforms.com/bot' : 'https://api.telegram.org/bot') + tokenOf(k) + '/';

async function botApi(k: Kenh, method: string, body: unknown) {
  const r = await fetch(apiBase(k) + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error((k === 'zalo' ? 'Zalo ' : 'Telegram ') + method + ' ' + r.status + ': ' + JSON.stringify(j).slice(0, 300));
  return j;
}
export async function sendText(k: Kenh, chatId: string, text: string) {
  const max = k === 'zalo' ? 1800 : 3900; const parts: string[] = []; let rest = text;
  while (rest.length > max) { const cut = rest.lastIndexOf('\n', max) > 300 ? rest.lastIndexOf('\n', max) : max; parts.push(rest.slice(0, cut)); rest = rest.slice(cut).trimStart(); }
  parts.push(rest);
  for (const p of parts) await botApi(k, 'sendMessage', { chat_id: chatId, text: p });
}
const say = (k: Kenh, chatId: string, text: string) => sendText(k, chatId, text).catch(e => console.error('Gửi tin lỗi', e));

export type Incoming = { kenh: Kenh; chatId: string; name: string | null; text: string | null; photo: string | null; caption: string | null; unsupported?: string };
/* Đọc 1 lần gọi webhook thành tin thống nhất. Không phải tin nhắn thì trả null */
export function parseUpdate(k: Kenh, body: any): Incoming | null {
  if (k === 'tele') {
    const m = body?.message || body?.edited_message; if (!m?.chat) return null;
    const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.from?.username || null;
    let photo: string | null = null;
    if (Array.isArray(m.photo) && m.photo.length) photo = m.photo[m.photo.length - 1].file_id;            // ảnh to nhất
    else if (m.document && /^image\//.test(m.document.mime_type || '')) photo = m.document.file_id;       // gửi ảnh dạng tệp
    return { kenh: k, chatId: String(m.chat.id), name, text: m.text ? String(m.text) : null, photo, caption: m.caption ? String(m.caption) : null,
      unsupported: !m.text && !photo ? 'tin này' : undefined };
  }
  const r = body?.result || body; const m = r?.message; if (!m?.chat?.id) return null;
  const ev = String(r.event_name || '');
  const name = m.from?.display_name || m.from?.name || m.from?.first_name || null;
  const photo = m.photo || m.photo_url || m.image || m.url || null;
  if (ev.includes('image') && !photo) console.warn('Zalo ảnh không có link', JSON.stringify(r).slice(0, 600));
  return { kenh: k, chatId: String(m.chat.id), name, text: m.text ? String(m.text) : null, photo: photo ? String(photo) : null, caption: m.caption ? String(m.caption) : null,
    unsupported: !m.text && !photo ? (ev.includes('sticker') ? 'sticker' : ev.includes('voice') ? 'tin thoại' : 'tin này') : undefined };
}

const sniff = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 ? 'image/png'
  : b[0] === 0x52 && b[8] === 0x57 && b[9] === 0x45 ? 'image/webp' : '';
export function b64(u8: Uint8Array) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }
/* Tải ảnh về. Zalo: ref là link ảnh. Telegram: ref là file_id */
async function fetchImage(k: Kenh, ref: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    let url = ref;
    if (k === 'tele') { const f = await botApi(k, 'getFile', { file_id: ref }); url = 'https://api.telegram.org/file/bot' + tokenOf(k) + '/' + f.result.file_path; }
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) { console.warn('Tải ảnh lỗi', r.status); return null; }
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) return null;
    const ct = (r.headers.get('content-type') || '').split(';')[0];
    const mime = /^image\/(jpeg|png|webp)$/.test(ct) ? ct : sniff(bytes);
    return mime ? { bytes, mime } : null;
  } catch (e) { console.warn('Tải ảnh lỗi', e); return null; }
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

// ---------------------------------------------------------------------
// Xử lý tin của chủ quán
// ---------------------------------------------------------------------
const MISS_TEXT: Record<string, string> = {
  items: 'món', dine_type: 'qua lấy / ăn tại quán / ship', at: 'giờ hẹn', at_past: 'giờ hẹn đã qua', at_far: 'giờ hẹn quá 3 ngày',
  at_hours: 'giờ hẹn ngoài giờ nhận đơn', address: 'địa chỉ ship', phone: 'SĐT người nhận',
};
export const HELP = 'Đây là bot lên đơn của Bé Nốc 🥰\n\n' +
  '📸 Chụp màn hình đoạn chat đặt món với khách rồi gửi vào đây (nhiều ảnh gửi liền nhau cũng được) → bot lên đơn, gửi thẳng vào bếp / pha chế.\n' +
  '✏️ Nhắn chữ để sửa đơn vừa lên: "thêm 1 trà đào", "bỏ kimbap", "giờ 18h30", "ship 12 ngõ 5 Quang Trung, sđt 09…".\n' +
  '⌨️ Gõ thẳng cả đơn bằng chữ cũng được.\n' +
  '🗑 Nhắn "huỷ" để huỷ đơn vừa lên.\n\n' +
  'Sửa / huỷ qua bot được khi bếp chưa bấm Nhận đơn. Bếp nhận rồi thì sửa trên màn hình bếp.';
export const NOT_LINKED = 'Tài khoản này chưa được dùng bot lên đơn của Bé Nốc.\nChủ quán vào Quản lý → Đơn online → Cài đặt bot → "Lấy mã kết nối", rồi nhắn mã 6 số đó vào đây.';
const isCancel = (t: string) => /^\/?(huy|xoa|bo)(\s+(don|đơn))?\s*[.!]*$/.test(fold(t).trim());
const isHelp = (t: string) => /^\/?(start|help|hd|huong\s*dan|menu|hi|hello|chao|alo)\b/.test(fold(t).trim()) && fold(t).trim().length < 20;

/* Câu bot nhắn lại sau khi gửi / sửa đơn ở bếp */
export function draftReply(d: Draft, miss: string[], now: Date, updated: boolean) {
  const out = [(updated ? '🔄 Đã sửa đơn ở bếp' : '✅ Đã gửi bếp') + ' · ' + (d.customer_name || 'Khách online')];
  if (d.items.length || d.dine_type || d.at) out.push(draftSummary(d, now));
  if (!d.dine_type) out.push('ℹ️ Chưa rõ qua lấy / ăn tại quán / ship nên tạm để Mang về.');
  if (d.unknown.length) out.push('❓ Chưa rõ món: ' + d.unknown.map(u => '“' + u + '”').join(', ') + ' (chưa đưa vào đơn)');
  const m = miss.filter(x => x !== 'dine_type').map(x => MISS_TEXT[x]).filter(Boolean);
  if (m.length) out.push('⚠️ Còn thiếu: ' + m.join(', ') + '. Nhắn thêm để bổ sung.');
  out.push('Nhắn thêm để sửa, nhắn "huỷ" để huỷ (khi bếp chưa nhận đơn).');
  return out.join('\n\n');
}
export const LOCKED = '🔒 Bếp / pha chế đã nhận đơn này nên bot không sửa được nữa. Sửa trên màn hình bếp (nút Sửa đơn) giúp em nha.';

async function isAllowed(sb: SupabaseClient, k: Kenh, chatId: string) {
  const { data } = await sb.from('bot_users').select('chat_id').eq('kenh', k).eq('chat_id', chatId).maybeSingle();
  return !!data;
}
/* Đơn nháp gần nhất của người gửi, còn sửa được */
async function openDraft(sb: SupabaseClient, k: Kenh, chatId: string, now: Date): Promise<any | null> {
  const since = new Date(now.getTime() - OPEN_MINUTES * 60e3).toISOString();
  const { data } = await sb.from('fb_drafts').select('*').eq('kenh', k).eq('chat_id', chatId).gte('updated_at', since).order('updated_at', { ascending: false }).limit(1);
  const d = data && data[0];
  return d && d.status !== 'huy' ? d : null;   // đơn bot đã gửi bếp (da_duyet) vẫn sửa / huỷ được khi bếp chưa nhận
}

/* Một tin từ Zalo / Telegram. Ảnh thì gom rồi đọc sau PHOTO_WAIT_MS */
export async function handleIncoming(sb: SupabaseClient, m: Incoming, wait = PHOTO_WAIT_MS) {
  const text = (m.text || '').trim();
  // Mã kết nối 6 số (Telegram: "/start 123456" khi mở link)
  const code = /^(?:\/start\s+)?(\d{6})$/.exec(text);
  if (code) {
    const { data: ok, error } = await sb.rpc('bot_link_use', { p_code: code[1], p_kenh: m.kenh, p_chat: m.chatId, p_name: m.name || '' });
    if (error) console.error('Kết nối lỗi', error);
    await say(m.kenh, m.chatId, ok ? '✅ Đã kết nối' + (m.name ? ' ' + m.name : '') + ' với bot lên đơn Bé Nốc.\n\n' + HELP : 'Mã không đúng hoặc đã hết hạn (mã chỉ dùng được 10 phút). Lấy mã mới trong Quản lý nha.');
    return;
  }
  if (!(await isAllowed(sb, m.kenh, m.chatId))) { await say(m.kenh, m.chatId, NOT_LINKED); return; }
  const now = new Date();

  if (m.photo) {
    const { data: me, error } = await sb.from('bot_photos').insert({ kenh: m.kenh, chat_id: m.chatId, ref: m.photo, caption: m.caption }).select('id').single();
    if (error || !me) { console.error('Lưu ảnh lỗi', error); return; }
    await new Promise(r => setTimeout(r, wait));
    const { data: last } = await sb.from('bot_photos').select('id').eq('kenh', m.kenh).eq('chat_id', m.chatId).eq('done', false).order('id', { ascending: false }).limit(1);
    if (last?.[0]?.id !== me.id) return;   // còn ảnh gửi sau: lượt của ảnh cuối sẽ đọc cả lô
    const since = new Date(now.getTime() - 15 * 60e3).toISOString();
    const { data: batch } = await sb.from('bot_photos').select('*').eq('kenh', m.kenh).eq('chat_id', m.chatId).eq('done', false).gte('created_at', since).order('id', { ascending: true }).limit(MAX_PHOTOS);
    const rows = batch || [];
    if (!rows.length) return;
    say(m.kenh, m.chatId, '⏳ Đang đọc ' + rows.length + ' ảnh…');   // không chờ, đọc luôn
    await Promise.all(rows.map((p: any) => sb.from('bot_photos').update({ done: true }).eq('id', p.id)));
    const caption = rows.map((p: any) => p.caption).filter(Boolean).join(' · ') || null;
    await buildDraft(sb, m, now, { refs: rows.map((p: any) => p.ref), caption });
    return;
  }
  if (!text) { await say(m.kenh, m.chatId, 'Bot chỉ đọc được ảnh chụp và tin chữ, chưa đọc được ' + (m.unsupported || 'tin này') + ' ạ.'); return; }
  if (isHelp(text)) { await say(m.kenh, m.chatId, HELP); return; }
  if (isCancel(text)) {
    const d = await openDraft(sb, m.kenh, m.chatId, now);
    if (!d) { await say(m.kenh, m.chatId, 'Không có đơn nào vừa lên để huỷ. Đơn cũ hơn thì huỷ trên màn hình bếp nha.'); return; }
    const { data: r, error } = await sb.rpc('bot_huy_don', { p_draft: d.id });
    if (error) { console.error('Huỷ đơn lỗi', error); await say(m.kenh, m.chatId, 'Chưa huỷ được, thử lại giúp em nha.'); return; }
    await say(m.kenh, m.chatId, r?.action === 'locked' ? '🔒 Bếp / pha chế đã nhận đơn của ' + (d.customer_name || 'khách') + ', bot không huỷ được nữa. Huỷ trên màn hình bếp giúp em nha.'
      : '🗑 Đã huỷ đơn của ' + (d.customer_name || 'khách') + (d.order_id ? ', bếp không còn thấy đơn này.' : '.'));
    return;
  }
  await buildDraft(sb, m, now, { text });
}

/* Đọc ảnh / tin chữ bằng AI → tạo mới hoặc sửa đơn nháp */
async function buildDraft(sb: SupabaseClient, m: Incoming, now: Date, src: { refs?: string[]; caption?: string | null; text?: string }) {
  const t0 = Date.now(), tm: string[] = [];
  const lap = (what: string, since: number) => tm.push(what + ' ' + (Date.now() - since) + 'ms');
  // Lấy cài đặt, đơn đang ghi, menu và tải ảnh cùng lúc cho nhanh
  const [{ data: st }, cur, menuRes, got] = await Promise.all([
    sb.from('shop_settings').select('fb_open, fb_close').eq('id', 1).maybeSingle(),
    openDraft(sb, m.kenh, m.chatId, now).then(async d => {   // kèm luôn: đơn ở bếp còn sửa được không
      if (d?.order_id) { const { data: ok } = await sb.rpc('bot_don_mo', { p_order: d.order_id }); d._open = ok !== false; }
      return d;
    }),
    sb.rpc('get_menu'),
    Promise.all((src.refs || []).map(ref => fetchImage(m.kenh, ref))),
  ]);
  // Nhắn chữ sửa đơn mà bếp đã nhận: báo luôn, khỏi gọi AI
  if (src.text && cur?.order_id && cur._open === false) { await say(m.kenh, m.chatId, LOCKED); return; }
  const open = st?.fb_open || '07:00', close = st?.fb_close || '22:00';
  const menuRaw: any[] = menuRes.data || [];
  const menu = buildMenu(menuRaw);
  const imgs = got.filter((x): x is { bytes: Uint8Array; mime: string } => !!x);
  lap('chuẩn bị + tải ảnh', t0); const tAi = Date.now();
  if (src.refs && !imgs.length) { await say(m.kenh, m.chatId, 'Bot chưa tải được ảnh, gửi lại giúp em nha (ảnh JPG / PNG, dưới 8MB).'); return; }

  let ai: AiOut;
  try { ai = await askAi(systemPrompt(menu, now, open, close), userPrompt({ cur, nImages: imgs.length, text: src.text, caption: src.caption }), imgs.map(i => ({ mime: i.mime, b64: b64(i.bytes) }))); }
  catch (e) { console.error('AI lỗi', e); await say(m.kenh, m.chatId, 'AI đang quá tải, chưa đọc được. Gửi lại sau ít phút giúp em nha.'); return; }
  lap('AI', tAi); const tDb = Date.now();
  if (ai.intent === 'khong_phai_don') { await say(m.kenh, m.chatId, 'Ảnh này không thấy đoạn chat đặt món. Chụp màn hình phần tin nhắn có món, giờ hẹn… rồi gửi lại nha.'); return; }

  const same = !!cur && (src.text ? true : ai.same_order === true);
  if (same && cur.order_id && cur._open === false) { await say(m.kenh, m.chatId, LOCKED); return; }
  const base: Draft = same ? JSON.parse(JSON.stringify(cur))
    : { psid: null as any, status: 'cho_duyet', dine_type: null, at: null, customer_name: null, customer_phone: null, address: null, note: null, items: [], unknown: [], missing: [], total_est: 0, asked: [] };
  const anon = anonymizer({ names: [ai.khach, ai.name, base.customer_name], words: menuWords(menu) });
  const stateBefore = stateOf(base, anon);
  const d = applyAi(base, ai, menu, now, (ai.khach || '').trim().slice(0, 60) || null);
  const miss = missingOf(d, now, open, close);
  const newConvo = (ai.convo || []).filter(x => x && (x.s === 'khach' || x.s === 'quan') && String(x.t || '').trim()).slice(0, 40).map(x => ({ s: x.s, t: String(x.t).slice(0, 500) }));
  const oldConvo: any[] = same ? (cur.convo || []) : [];
  const convo = [...oldConvo, ...(src.text ? [{ s: 'sua', t: src.text.slice(0, 500) }] : newConvo.filter(x => !oldConvo.some(o => o.s === x.s && o.t === x.t)))].slice(-80);

  const row: any = {
    kenh: m.kenh, chat_id: m.chatId, nguoi_gui: m.name, psid: null, status: 'cho_duyet', changed_after: false,
    dine_type: d.dine_type, at: d.at, customer_name: d.customer_name, customer_phone: d.customer_phone, address: d.address, note: d.note,
    items: d.items, unknown: d.unknown, missing: miss, total_est: d.total_est, convo, updated_at: now.toISOString(),
  };
  let draftId: string | null = same ? cur.id : null;
  if (draftId) await sb.from('fb_drafts').update(row).eq('id', draftId);
  else { const { data: ins, error } = await sb.from('fb_drafts').insert(Object.assign({ asked: [], anh: [] }, row)).select('id').single(); if (error) console.error('Lưu đơn lỗi', error); draftId = ins?.id || null; }

  // Gửi thẳng vào bếp / pha chế (tạo đơn thật, hoặc thay đơn thật khi bếp chưa nhận)
  let sent: any = null, fail = '';
  if (!d.items.length) fail = '⚠️ Chưa thấy món nào trong ' + (src.refs ? 'ảnh' : 'tin') + ', chưa gửi bếp. Nhắn món giúp em (vd "2 cơm trộn, 1 trà sữa").';
  else if (draftId) {
    const { data, error } = await sb.rpc('bot_dat_don', { p_draft: draftId });
    if (error) {
      console.error('Gửi bếp lỗi', error);
      const gone = /ITEM_UNAVAILABLE/.test(error.message || '') ? d.items.find(i => i.menu_item_id === (error as any).hint) : null;
      fail = gone ? '⚠️ Món “' + gone.name + '” đang tạm hết, chưa gửi bếp. Nhắn "bỏ ' + gone.name + '" hoặc đổi món khác giúp em.' : '⚠️ Chưa gửi được bếp (' + (error.message || 'lỗi') + '). Nhắn lại giúp em nha.';
    } else sent = data;
    if (sent?.action === 'locked') fail = LOCKED;
  }
  lap('ghi đơn + gửi bếp', tDb);
  // Trả lời chủ quán ngay; lưu ảnh và mẫu huấn luyện làm song song sau đó (không bắt chủ quán chờ)
  const tSay = Date.now();
  if (sent?.total) d.total_est = sent.total;   // giá thật ở bếp (có ưu đãi, tuỳ chọn)
  const replied = say(m.kenh, m.chatId, fail || draftReply(d, miss, now, sent?.action === 'updated')).then(() => lap('nhắn Zalo', tSay));

  // Lưu ảnh để đối chiếu khi duyệt (lỗi thì bỏ qua, đơn vẫn lên)
  const saveImgs = (async () => {
    if (!draftId || !imgs.length) return;
    const paths = (await Promise.all(imgs.map(async (im, i) => {
      const ext = im.mime === 'image/png' ? 'png' : im.mime === 'image/webp' ? 'webp' : 'jpg';
      const path = draftId + '/' + now.getTime() + '-' + (i + 1) + '.' + ext;
      try { const { error } = await sb.storage.from('don-anh').upload(path, im.bytes, { contentType: im.mime, upsert: true }); if (error) throw error; return path; }
      catch (e) { console.error('Lưu ảnh lỗi', e); return null; }
    }))).filter((x): x is string => !!x);
    if (paths.length) await sb.from('fb_drafts').update({ anh: [...(same ? cur.anh || [] : []), ...paths] }).eq('id', draftId);
  })();

  // Mẫu huấn luyện (đoạn chat chép từ ảnh, đã ẩn tên, SĐT)
  const saveTrain = (async () => {
    try {
      const menuHash = (await sha(JSON.stringify(menuRaw))).slice(0, 16);
      const at = now.toISOString();
      await saveSample(sb, trainSample({ thread: await threadHash(m.kenh + ':' + (d.customer_name || draftId)), draftId, now, anon, before: stateBefore, after: d,
        ai: Object.assign({}, ai, { intent: 'order' }), model: ai._model || aiProvider(), menuHash,
        convo: convo.map(x => ({ sender: x.s === 'sua' ? 'quan' : x.s, text: x.t, at })) }), menuRaw);
    } catch (e) { console.error('Chuẩn bị mẫu lỗi', e); }
  })();
  await Promise.all([replied, saveImgs, saveTrain]);
  console.log('⏱ ' + (src.refs ? src.refs.length + ' ảnh' : 'chữ') + ' · ' + tm.join(' · ') + ' · tổng ' + (Date.now() - t0) + 'ms (' + (ai._model || '') + ')');
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
const fnUrl = () => env('SUPABASE_URL').replace(/\/$/, '') + '/functions/v1/bot-don';
async function appAction(sb: SupabaseClient, req: Request, body: any) {
  const owner = await ownerOf(sb, req);
  if (!owner) return json({ error: 'FORBIDDEN' }, 403);
  const kenhs: Kenh[] = (['zalo', 'tele'] as Kenh[]).filter(k => tokenOf(k));
  if (body.action === 'status') {
    const out: any = { ok: true, ai: aiProvider(), has_ai_key: !!(aiProvider() === 'gemini' ? env('GEMINI_API_KEY') : env('ANTHROPIC_API_KEY')), kenh: {} };
    for (const k of ['zalo', 'tele'] as Kenh[]) {
      if (!tokenOf(k)) { out.kenh[k] = { token: false }; continue; }
      const x: any = { token: true };
      try { const me = await botApi(k, 'getMe', {}); x.name = me.result?.display_name || me.result?.account_name || me.result?.first_name || me.result?.username || null; x.username = me.result?.username || null; } catch (e) { x.error = String((e as Error).message); }
      try { const w = await botApi(k, 'getWebhookInfo', {}); x.webhook = (w.result?.url || '') === fnUrl(); x.webhook_url = w.result?.url || null; } catch (_) { x.webhook = null; }
      out.kenh[k] = x;
    }
    return json(out);
  }
  if (body.action === 'setup') {   // cài webhook Zalo / Telegram trỏ về function này
    if (!kenhs.length) return json({ error: 'Chưa có ZALO_BOT_TOKEN / TELEGRAM_BOT_TOKEN trong Secrets' }, 400);
    const res: any = {};
    for (const k of kenhs) {
      try { await botApi(k, 'setWebhook', Object.assign({ url: fnUrl(), secret_token: await webhookSecret(k) }, k === 'tele' ? { allowed_updates: ['message', 'edited_message'] } : {})); res[k] = 'ok'; }
      catch (e) { res[k] = String((e as Error).message); }
    }
    return json({ ok: true, res });
  }
  if (body.action === 'approved') {   // gửi câu xác nhận về Zalo / Telegram để chủ quán copy cho khách
    const { data: d } = await sb.from('fb_drafts').select('*').eq('id', body.draft_id).single();
    if (!d || d.status !== 'da_duyet') return json({ error: 'DRAFT_NOT_APPROVED' }, 400);
    if (!d.chat_id || !['zalo', 'tele'].includes(d.kenh)) return json({ error: 'Đơn này không gửi từ Zalo / Telegram' }, 400);
    const { data: o } = await sb.from('orders').select('total').eq('id', d.order_id).maybeSingle();
    const { data: bank } = await sb.from('shop_settings').select('bank_name, bank_account, bank_holder').eq('id', 1).single();
    const text = approvedText(d, o ? o.total : d.total_est, body.with_bank === false ? null : bank, new Date());
    try { await sendText(d.kenh, d.chat_id, '✅ Đã duyệt đơn ' + (d.customer_name || 'khách') + ', phiếu đã sang bếp. Tin xác nhận để copy gửi khách ở tin dưới 👇'); await sendText(d.kenh, d.chat_id, text); }
    catch (e) { return json({ error: String((e as Error).message) }, 502); }
    return json({ ok: true });
  }
  return json({ error: 'BAD_ACTION' }, 400);
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: Object.assign({ 'content-type': 'application/json' }, CORS) });

/* Tin này từ Zalo hay Telegram? (so mã bí mật gửi kèm) */
async function channelOf(req: Request): Promise<Kenh | null> {
  const t = req.headers.get('x-telegram-bot-api-secret-token'), z = req.headers.get('x-bot-api-secret-token');
  if (t && tokenOf('tele') && t === await webhookSecret('tele')) return 'tele';
  if (z && tokenOf('zalo') && z === await webhookSecret('zalo')) return 'zalo';
  return null;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return new Response('Bé Nốc bot-don đang chạy', { status: 200 });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const sb = db();
  const k = await channelOf(req);
  const raw = await req.text();
  if (!k) {
    if (req.headers.get('x-telegram-bot-api-secret-token') || req.headers.get('x-bot-api-secret-token')) return new Response('bad secret', { status: 401 });
    let body: any = {}; try { body = JSON.parse(raw || '{}'); } catch (_) { /* rỗng */ }
    return appAction(sb, req, body);
  }
  let body: any; try { body = JSON.parse(raw); } catch (_) { return new Response('ok'); }
  const m = parseUpdate(k, body);
  if (!m) return new Response('ok');
  const work = handleIncoming(sb, m).catch(e => console.error('Xử lý lỗi', e));
  const ER = (globalThis as any).EdgeRuntime;
  if (ER && ER.waitUntil) ER.waitUntil(work); else await work;
  return new Response('ok', { status: 200 });
}

if (!env('BOT_NO_SERVE')) (globalThis as any).Deno.serve(handle);
