// Kiểm tra phần logic của bot (không gọi Facebook / AI thật).
// Chạy: FB_BOT_NO_SERVE=1 deno test -A supabase/functions/_test/bot_test.ts
import { assert, assertEquals, assertMatch, assertStringIncludes } from 'jsr:@std/assert@1';
Deno.env.set('FB_BOT_NO_SERVE', '1');
const bot = await import('../fb-bot/index.ts');

const menu = bot.buildMenu(JSON.parse(Deno.readTextFileSync(new URL('./menu_mau.json', import.meta.url))));
const num = (name: string) => menu.items.find(i => i.name === name)!.n;
const choice = (title: string, name: string) => [...menu.groups.values()].find(g => g.title === title && g.choices.some(c => c.name === name))!.choices.find(c => c.name === name)!.id;
const NOW = new Date('2026-10-24T08:00:00Z'); // 15:00 giờ Việt Nam
const empty = (): any => ({ psid: 'p1', status: 'dang_hoi', dine_type: null, at: null, customer_name: 'Nguyễn Lan', customer_phone: null, address: null, note: null, items: [], unknown: [], missing: [], total_est: 0, asked: [] });
const reply = (d: any, first = false) => bot.composeReply(d, bot.missingOf(d, NOW), { now: NOW, first, name: 'Lan', wasPending: false, open: '07:00', close: '22:00' });

Deno.test('giờ Việt Nam', () => {
  assertEquals(bot.vnTime(NOW), '15:00');
  assertEquals(bot.vnToUtc('2026-10-24', '18:30')!.toISOString(), '2026-10-24T11:30:00.000Z');
  assertEquals(bot.vnToUtc('2026-10-24', '25:00'), null);
});

Deno.test('đơn qua lấy đủ ý → gửi quán duyệt', () => {
  const d = bot.applyAi(empty(), {
    intent: 'order', dine_type: 'mang_ve', time: '18:00',
    items: [{ m: num('Cơm heo chiên xù'), qty: 1, choices: [choice('Topping thêm', 'Trứng ốp la')] }, { m: num('Hồng trà sữa trân châu'), qty: 2, choices: [choice('Đá', 'Ít đá')] }],
  }, menu, NOW, 'Nguyễn Lan');
  assertEquals(d.items.length, 2);
  assertEquals(d.items[0].price, 35000);           // 30k + trứng 5k
  assertEquals(d.items[1].choices, ['Ít đá']);      // mặc định không ghi ra
  assertEquals(d.items[1].choice_ids.length, 2);    // vẫn gửi đủ đường mặc định + ít đá
  assertEquals(d.total_est, 35000 + 2 * 25000);
  assertEquals(bot.missingOf(d, NOW), []);
  const r = reply(d);
  assert(r.done);
  assertStringIncludes(r.text, 'Qua lấy · 18:00');
  assertStringIncludes(r.text, 'gửi đơn cho quán xác nhận');
});

Deno.test('ship thiếu địa chỉ, SĐT → hỏi đúng 2 ý', () => {
  const d = bot.applyAi(empty(), { dine_type: 'giao_hang', time: '19:30', items: [{ m: num('Cơm gà viên') }, { m: num('Hồng trà sữa trân châu') }] }, menu, NOW, null);
  assertEquals(bot.missingOf(d, NOW), ['address', 'phone']);
  const r = reply(d);
  assert(!r.done);
  assertStringIncludes(r.text, 'địa chỉ');
  assertStringIncludes(r.text, 'số điện thoại');
  assert(!r.text.includes('Mấy giờ'));
});

Deno.test('chưa có hình thức, giờ → hỏi kèm nút bấm', () => {
  const d = bot.applyAi(empty(), { items: [{ m: num('Cơm gà viên') }] }, menu, NOW, null);
  const r = reply(d);
  assertEquals(r.quick, ['Qua lấy', 'Ăn tại quán', 'Ship']);
  assertStringIncludes(r.text, 'Mình hẹn mấy giờ');
  assertStringIncludes(r.text, 'đồ uống');           // chỉ gọi đồ ăn → gợi ý đồ uống 1 lần
  assert(d.asked.includes('drink'));
  assert(!reply(d).text.includes('thêm đồ uống'));   // không hỏi lại
});

Deno.test('giờ đã qua / ngoài giờ / "bây giờ"', () => {
  const past = bot.applyAi(empty(), { dine_type: 'mang_ve', time: '10:00', items: [{ m: 1 }, { m: num('Hồng trà sữa trân châu') }] }, menu, NOW, null);
  assertEquals(bot.missingOf(past, NOW), ['at_past']);
  const late = bot.applyAi(empty(), { dine_type: 'tai_quan', time: '23:00', items: [{ m: 1 }] }, menu, NOW, null);
  assertEquals(bot.missingOf(late, NOW), ['at_hours']);
  const asap = bot.applyAi(empty(), { dine_type: 'mang_ve', time: 'now', items: [{ m: 1 }] }, menu, NOW, null);
  assertEquals(bot.vnTime(new Date(asap.at!)), '15:15');
  const tmr = bot.applyAi(empty(), { dine_type: 'tai_quan', date: '2026-10-25', time: '11:00', items: [{ m: 1 }] }, menu, NOW, null);
  assertEquals(bot.missingOf(tmr, NOW), []);
  assertMatch(bot.draftSummary(tmr, NOW), /Chủ nhật 25\/10 11:00/);
});

Deno.test('AI trả món / lựa chọn sai → bỏ qua, SĐT chuẩn hoá', () => {
  const d = bot.applyAi(empty(), { items: [{ m: 999 }, { m: num('Cơm gà viên'), choices: [99999, choice('Đá', 'Ít đá')] }], phone: '+84 912 345 678', unknown: ['bún bò'] }, menu, NOW, null);
  assertEquals(d.items.length, 1);
  assertEquals(d.items[0].choice_ids, []);          // "Ít đá" không thuộc nhóm của cơm
  assertEquals(d.customer_phone, '0912345678');
  const r = reply(d);
  assertStringIncludes(r.text, '“bún bò”');
  assert(!r.done);
});

Deno.test('khách chưa nói gì → gửi mẫu đặt món', () => {
  const r = reply(empty(), true);
  assertStringIncludes(r.text, 'Món ăn:');
  assertStringIncludes(r.text, 'Qua lấy / Ăn tại quán / Ship');
});

Deno.test('đọc JSON AI có rào ```', () => {
  assertEquals(bot.parseJson('```json\n{"intent":"order","items":[]}\n```').intent, 'order');
});

Deno.test('chữ ký Facebook', async () => {
  const body = '{"object":"page"}';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('bimat'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hex = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map(b => b.toString(16).padStart(2, '0')).join('');
  assert(await bot.verifySignature(body, 'sha256=' + hex, 'bimat'));
  assert(!(await bot.verifySignature(body + ' ', 'sha256=' + hex, 'bimat')));
  assert(!(await bot.verifySignature(body, null, 'bimat')));
});

Deno.test('Meta kiểm tra webhook (GET)', async () => {
  Deno.env.set('FB_VERIFY_TOKEN', 'benoc123');
  const ok = await bot.handle(new Request('https://x/fb-bot?hub.mode=subscribe&hub.verify_token=benoc123&hub.challenge=42'));
  assertEquals(await ok.text(), '42');
  const bad = await bot.handle(new Request('https://x/fb-bot?hub.mode=subscribe&hub.verify_token=sai&hub.challenge=42'));
  assert((await bad.text()) !== '42');
});

Deno.test('tin xác nhận gửi khách sau khi duyệt', () => {
  const d = bot.applyAi(empty(), { dine_type: 'giao_hang', time: '19:30', address: '12 ngõ 5 Nguyễn Trãi', phone: '0912345678', items: [{ m: num('Cơm gà viên'), qty: 2 }] }, menu, NOW, 'Nguyễn Lan');
  const t = bot.approvedText(d, 60000, { bank_name: 'MB Bank', bank_account: '0393247469', bank_holder: '' }, NOW);
  assertStringIncludes(t, 'Tổng: 60.000đ');
  assertStringIncludes(t, 'giao cho mình lúc 19:30');
  assertStringIncludes(t, 'BENOC NGUYEN LAN');
});

Deno.test('prompt có menu, giờ hiện tại, đơn đang ghi', () => {
  const sp = bot.systemPrompt(menu, NOW, '07:00', '22:00');
  assertStringIncludes(sp, '15:00 Thứ 7 ngày 2026-10-24');
  assertStringIncludes(sp, num('Cơm gà viên') + '. Cơm gà viên — 30k');
  const up = bot.userPrompt(empty(), [{ sender: 'khach', text: '2 ts tcdd', at: NOW.toISOString() }], null);
  assertStringIncludes(up, 'Khách [15:00]: 2 ts tcdd');
});

Deno.test('Gemini: chỉ có GEMINI_API_KEY → tự dùng Gemini, model không có thì thử model kế', async () => {
  Deno.env.set('GEMINI_API_KEY', 'k'); Deno.env.delete('ANTHROPIC_API_KEY'); Deno.env.delete('AI_PROVIDER'); Deno.env.delete('GEMINI_MODEL');
  assertEquals(bot.aiProvider(), 'gemini');
  const seen: string[] = []; const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    seen.push(String(url).split('/models/')[1].split(':')[0]);
    if (seen.length === 1) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"intent":"order","items":[]}' }] } }] }), { status: 200 });
  }) as typeof fetch;
  try { assertEquals((await bot.askAi('s', 'u')).intent, 'order'); } finally { globalThis.fetch = real; }
  assertEquals(seen, ['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
});

Deno.test('ẩn thông tin cá nhân trước khi lưu mẫu', () => {
  const anon = bot.anonymizer({ names: ['Nguyễn Lan', null], addresses: ['12 ngõ 5 Nguyễn Trãi, Hà Đông'], words: bot.menuWords(menu) });
  assertEquals(anon('sdt 0912.345.678 nhé'), 'sdt <SDT> nhé');
  assertEquals(anon('gọi +84 912 345 678'), 'gọi <SDT>');
  assertEquals(anon('stk 0393247469123'), 'stk <SO>');
  assertEquals(anon('mail lan.nguyen@gmail.com'), 'mail <EMAIL>');
  assertEquals(anon('ship tới 12 ngo 5 nguyen trai, ha dong giúp'), 'ship tới <DIA_CHI> giúp');   // không dấu, khác hoa thường vẫn cắt
  assertEquals(anon('mình tên Lan, nguyễn lan'), 'mình tên <TEN>, <TEN>');
  assertEquals(anon('Lan ơi'), '<TEN> ơi');
  assertEquals(anon('2 ts tcdd 6r tối'), '2 ts tcdd 6r tối');                  // không cắt nhầm tin đặt món
  assertEquals(anon('30000'), '30000');                                          // giá tiền, ít hơn 9 chữ số
  // tên trùng từ thường dùng ("Mai" = ngày mai, "mình") thì không cắt từng chữ
  const a2 = bot.anonymizer({ names: ['Trần Mai', 'Phạm Minh'] });
  assertEquals(a2('mai mình qua lấy'), 'mai mình qua lấy');
  assertEquals(a2('Trần Mai đặt'), '<TEN> đặt');
});

Deno.test('mẫu huấn luyện không chứa tên, SĐT, địa chỉ thật', () => {
  const anon = bot.anonymizer({ names: ['Nguyễn Lan'], addresses: ['12 ngõ 5 Nguyễn Trãi'], words: bot.menuWords(menu) });
  const before = bot.stateOf(empty(), anon);
  const d = bot.applyAi(empty(), { intent: 'order', dine_type: 'giao_hang', time: '19:30', address: '12 ngõ 5 Nguyễn Trãi', phone: '0912345678', name: 'Lan',
    items: [{ m: num('Cơm gà viên'), qty: 2, note: 'giao cho chị Lan 0912345678' }] }, menu, NOW, 'Nguyễn Lan');
  const row = bot.trainSample({
    thread: 'abc', draftId: 'd1', now: NOW, anon, before, after: d, ai: { intent: 'order', name: 'Lan' }, model: 'gemini-3.8-flash', menuHash: 'm1',
    convo: [{ sender: 'khach', text: '2 cơm gà viên, ship 12 ngõ 5 Nguyễn Trãi, sdt 0912345678', at: NOW.toISOString() }, { sender: 'bot', text: 'Dạ Lan ơi, giao 12 ngõ 5 Nguyễn Trãi nhé', at: NOW.toISOString() }],
  });
  const s = JSON.stringify(row);
  for (const bad of ['0912345678', 'Nguyễn Trãi', 'ngõ 5', 'Nguyễn Lan', 'chị Lan']) assert(!s.includes(bad), 'còn lộ: ' + bad);
  assertEquals(row.now_vn, '2026-10-24 15:00');
  assertEquals(row.target!.address, '<DIA_CHI>');
  assertEquals(row.target!.phone, '<SDT>');
  assertEquals(row.target!.time, '19:30');
  assertEquals(row.target!.items[0].name, 'Cơm gà viên');
  assertEquals(row.convo[0].t, '2 cơm gà viên, ship <DIA_CHI>, sdt <SDT>');
  assertEquals(row.convo[0].h, '15:00');
  // intent human: không có đáp án đơn
  assertEquals(bot.trainSample({ thread: 'abc', now: NOW, anon, before, after: d, ai: { intent: 'human' }, model: 'x', menuHash: 'm1', convo: [] }).target, null);
});

Deno.test('khách nhắn “xoá dữ liệu của tôi”', () => {
  for (const t of ['xoá dữ liệu của tôi', 'Xóa dữ liệu của tôi', 'xoa du lieu cua toi', 'Xoá hết dữ liệu của mình đi ạ', 'xoá thông tin của em']) assert(bot.isForgetRequest(t), t);
  for (const t of ['2 ts, xoá giúp mình ly trà đào, ship 12 ngõ 5 Nguyễn Trãi giờ chiều', 'xoá món cơm gà', 'cho mình xem dữ liệu', 'ok']) assert(!bot.isForgetRequest(t), t);
});

Deno.test('mã băm khách không lộ PSID, cùng PSID ra cùng mã', async () => {
  Deno.env.set('FB_APP_SECRET', 's3');
  const a = await bot.threadHash('1234567890'), b = await bot.threadHash('1234567890'), c = await bot.threadHash('999');
  assertEquals(a, b); assert(a !== c); assertEquals(a.length, 16); assert(!a.includes('1234567890'));
});

// ---------------------------------------------------------------------
// Chạy cả handleThread với Supabase giả + Facebook / AI giả
// ---------------------------------------------------------------------
function fakeSb(tables: Record<string, any[]>, menuRaw: any[]) {
  let seq = 1;
  const from = (name: string) => {
    const f: ((r: any) => boolean)[] = []; let op = 'select', payload: any = null, ord: [string, boolean] | null = null, lim = 1e9, mode = '', retSel = false;
    const exec = (): any => {
      const rows = (tables[name] ||= []);
      if (op === 'insert') {
        const r = Object.assign({ id: name === 'fb_messages' || name === 'fb_train' ? seq++ : crypto.randomUUID(), created_at: new Date().toISOString() }, payload);
        if (r.mid && rows.some(x => x.mid === r.mid)) return { data: null, error: { message: 'dup' } };
        rows.push(r); return { data: retSel ? r : null, error: null };
      }
      if (op === 'upsert') { const key = payload.hash ? 'hash' : 'psid'; const i = rows.findIndex(x => x[key] === payload[key]); if (i < 0) rows.push({ ...payload }); return { data: null, error: null }; }
      const hit = rows.filter(r => f.every(g => g(r)));
      if (op === 'update') { hit.forEach(r => Object.assign(r, payload)); return { data: null, error: null }; }
      if (op === 'delete') {
        tables[name] = rows.filter(r => !hit.includes(r));
        if (name === 'fb_threads') for (const t of ['fb_messages', 'fb_drafts']) tables[t] = (tables[t] || []).filter(r => !hit.some(h => h.psid === r.psid));
        return { data: null, error: null };
      }
      let out = hit.slice();
      if (ord) { const [c, asc] = ord; out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); }
      out = out.slice(0, lim);
      if (mode === 'single') return out.length ? { data: out[0], error: null } : { data: null, error: { message: 'none' } };
      if (mode === 'maybe') return { data: out[0] || null, error: null };
      return { data: out, error: null };
    };
    const q: any = {
      select: () => { if (op === 'insert') retSel = true; return q; },
      eq: (c: string, v: any) => (f.push(r => r[c] === v), q), gte: (c: string, v: any) => (f.push(r => r[c] >= v), q),
      order: (c: string, o?: any) => (ord = [c, !(o && o.ascending === false)], q), limit: (n: number) => (lim = n, q),
      single: () => (mode = 'single', q), maybeSingle: () => (mode = 'maybe', q),
      insert: (p: any) => (op = 'insert', payload = p, q), update: (p: any) => (op = 'update', payload = p, q),
      upsert: (p: any) => (op = 'upsert', payload = p, q), delete: () => (op = 'delete', q),
      then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
    };
    return q;
  };
  return { from, rpc: async (_n: string) => ({ data: menuRaw, error: null }) } as any;
}

async function runBot(tables: Record<string, any[]>, aiJson: unknown, text: string) {
  Deno.env.set('FB_PAGE_TOKEN', 't'); Deno.env.set('GEMINI_API_KEY', 'k'); Deno.env.delete('ANTHROPIC_API_KEY'); Deno.env.delete('AI_PROVIDER'); Deno.env.delete('GEMINI_MODEL');
  const menuRaw = JSON.parse(Deno.readTextFileSync(new URL('./menu_mau.json', import.meta.url)));
  tables.fb_threads ||= [{ psid: 'p1', name: 'Nguyễn Lan', paused_until: null, need_human: false }];
  tables.fb_messages = [{ id: 1, psid: 'p1', sender: 'khach', text, created_at: new Date().toISOString() }];
  tables.shop_settings ||= [{ id: 1, fb_bot_on: true, fb_open: '00:00', fb_close: '23:59', fb_hello: null, fb_train_on: true }];
  const sent: string[] = []; const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: any) => {
    const u = String(url);
    if (u.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(aiJson) }] } }] }), { status: 200 });
    if (u.includes('graph.facebook.com') && init?.body) { const b = JSON.parse(init.body); if (b.message?.text) sent.push(b.message.text); }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  try { await bot.handleThread(fakeSb(tables, menuRaw), 'p1'); } finally { globalThis.fetch = real; }
  return sent;
}

Deno.test('bot ghi mẫu huấn luyện: đơn ship đủ ý', async () => {
  const t: Record<string, any[]> = {};
  const msg = '2 cơm gà viên, ship 12 ngõ 5 Nguyễn Trãi, sdt 0912345678';
  const sent = await runBot(t, { intent: 'order', dine_type: 'giao_hang', time: 'now', address: '12 ngõ 5 Nguyễn Trãi', phone: '0912345678', items: [{ m: num('Cơm gà viên'), qty: 2 }, { m: num('Hồng trà sữa trân châu') }] }, msg);
  assertEquals(t.fb_drafts.length, 1);
  assertEquals(t.fb_drafts[0].status, 'cho_duyet');
  assertEquals(t.fb_train.length, 1);
  const s = t.fb_train[0];
  assertEquals(s.draft_id, t.fb_drafts[0].id);
  assertEquals(s.intent, 'order');
  assertEquals(s.model, 'gemini-3.8-flash');
  assertEquals(s.target.items[0].qty, 2);
  assertEquals(s.convo[0].t, '2 cơm gà viên, ship <DIA_CHI>, sdt <SDT>');
  assertEquals(s.state_before.items, []);
  assert(!JSON.stringify(s).includes('0912345678') && !JSON.stringify(s).includes('Nguyễn Trãi'));
  assertEquals(t.fb_train_menu.length, 1);
  assertEquals(t.fb_train_menu[0].hash, s.menu_hash);
  assert(sent.length >= 1);
  // lượt thứ hai cùng menu: không lưu thêm ảnh chụp menu
  await runBot(t, { intent: 'order', dine_type: 'giao_hang', time: 'now', address: '12 ngõ 5 Nguyễn Trãi', phone: '0912345678', items: [{ m: num('Cơm gà viên'), qty: 3 }, { m: num('Hồng trà sữa trân châu') }] }, 'thêm 1 phần nữa');
  assertEquals(t.fb_train_menu.length, 1);
});

Deno.test('bot ghi mẫu: intent human không có đáp án đơn, tắt lưu thì không ghi', async () => {
  const t: Record<string, any[]> = {};
  await runBot(t, { intent: 'human' }, 'shipper giao trễ quá');
  assertEquals(t.fb_train.length, 1);
  assertEquals(t.fb_train[0].intent, 'human');
  assertEquals(t.fb_train[0].target, null);
  assertEquals(t.fb_threads[0].need_human, true);
  const off: Record<string, any[]> = { shop_settings: [{ id: 1, fb_bot_on: true, fb_open: '00:00', fb_close: '23:59', fb_train_on: false }] };
  await runBot(off, { intent: 'order', items: [{ m: 1 }] }, '1 cơm');
  assertEquals((off.fb_train || []).length, 0);
});

Deno.test('bot xoá hết dữ liệu khách khi được yêu cầu', async () => {
  Deno.env.set('FB_APP_SECRET', 's3');
  const mine = await bot.threadHash('p1'), other = await bot.threadHash('p2');
  const t: Record<string, any[]> = {
    fb_threads: [{ psid: 'p1', name: 'Lan' }, { psid: 'p2', name: 'Huy' }],
    fb_drafts: [{ id: 'd1', psid: 'p1', status: 'cho_duyet' }, { id: 'd2', psid: 'p2', status: 'cho_duyet' }],
    fb_train: [{ id: 1, thread_hash: mine }, { id: 2, thread_hash: mine }, { id: 3, thread_hash: other }],
  };
  const sent = await runBot(t, { intent: 'order' }, 'xoá dữ liệu của tôi');
  assertEquals(t.fb_threads.map(x => x.psid), ['p2']);
  assertEquals(t.fb_drafts.map(x => x.id), ['d2']);
  assertEquals(t.fb_train.map(x => x.id), [3]);
  assertEquals((t.fb_messages || []).length, 0);
  assertEquals(sent.length, 1);
  assertStringIncludes(sent[0], 'đã xoá');
  assertStringIncludes(sent[0], 'đã huỷ');    // có đơn đang chờ duyệt thì báo huỷ luôn
});
