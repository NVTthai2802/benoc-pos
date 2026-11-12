// Kiểm tra bot lên đơn từ ảnh chụp (không gọi Zalo / Telegram / AI thật).
// Chạy: BOT_NO_SERVE=1 deno test -A supabase/functions/_test/bot_don_test.ts
import { assert, assertEquals, assertMatch, assertStringIncludes } from 'jsr:@std/assert@1';
Deno.env.set('BOT_NO_SERVE', '1');
const bot = await import('../bot-don/index.ts');

const menuRaw = JSON.parse(Deno.readTextFileSync(new URL('./menu_mau.json', import.meta.url)));
const menu = bot.buildMenu(menuRaw);
const num = (name: string) => menu.items.find(i => i.name === name)!.n;
const choice = (title: string, name: string) => [...menu.groups.values()].find(g => g.title === title && g.choices.some(c => c.name === name))!.choices.find(c => c.name === name)!.id;
const NOW = new Date('2026-10-24T08:00:00Z'); // 15:00 giờ Việt Nam
const empty = (): any => ({ psid: null, status: 'cho_duyet', dine_type: null, at: null, customer_name: null, customer_phone: null, address: null, note: null, items: [], unknown: [], missing: [], total_est: 0, asked: [] });

// ---------------------------------------------------------------------
// Phần tách đơn (giữ từ bot cũ)
// ---------------------------------------------------------------------
Deno.test('giờ Việt Nam', () => {
  assertEquals(bot.vnTime(NOW), '15:00');
  assertEquals(bot.vnToUtc('2026-10-24', '18:30')!.toISOString(), '2026-10-24T11:30:00.000Z');
  assertEquals(bot.vnToUtc('2026-10-24', '25:00'), null);
});

Deno.test('kiểm lại kết quả AI theo menu: giá, tuỳ chọn, thiếu gì', () => {
  const d = bot.applyAi(empty(), {
    dine_type: 'mang_ve', time: '18:00',
    items: [{ m: num('Cơm heo chiên xù'), qty: 1, choices: [choice('Topping thêm', 'Trứng ốp la')] }, { m: num('Hồng trà sữa trân châu'), qty: 2, choices: [choice('Đá', 'Ít đá')] }],
  }, menu, NOW, 'Nguyễn Lan');
  assertEquals(d.items[0].price, 35000);
  assertEquals(d.items[1].choices, ['Ít đá']);
  assertEquals(d.total_est, 35000 + 2 * 25000);
  assertEquals(d.customer_name, 'Nguyễn Lan');
  assertEquals(bot.missingOf(d, NOW), []);
  const ship = bot.applyAi(empty(), { dine_type: 'giao_hang', time: '19:30', items: [{ m: 999 }, { m: num('Cơm gà viên'), choices: [99999] }], phone: '+84 912 345 678' }, menu, NOW, null);
  assertEquals(ship.items.length, 1);
  assertEquals(ship.customer_phone, '0912345678');
  assertEquals(bot.missingOf(ship, NOW), ['address']);
  const late = bot.applyAi(empty(), { dine_type: 'tai_quan', time: '23:00', items: [{ m: 1 }] }, menu, NOW, null);
  assertEquals(bot.missingOf(late, NOW), ['at_hours']);
  const tmr = bot.applyAi(empty(), { dine_type: 'tai_quan', date: '2026-10-25', time: '11:00', items: [{ m: 1 }] }, menu, NOW, null);
  assertMatch(bot.draftSummary(tmr, NOW), /Chủ nhật 25\/10 11:00/);
});

Deno.test('chế độ suy nghĩ: lite không gửi, 2.5 tắt, 3.x giảm; model không nhận thì gọi lại không có', async () => {
  assertEquals(bot.thinkCfg('gemini-3.5-flash-lite'), null);
  assertEquals(bot.thinkCfg('gemini-2.5-flash'), { thinkingBudget: 0 });
  assertEquals(bot.thinkCfg('gemini-3.8-flash'), { thinkingLevel: 'low' });
  gem(); const real = globalThis.fetch; const bodies: any[] = [];
  Deno.env.set('GEMINI_MODEL', 'gemini-3.8-flash');
  globalThis.fetch = (async (_u: string, init?: any) => { const b = JSON.parse(init.body); bodies.push(b); return b.generationConfig.thinkingConfig ? new Response('bad', { status: 400 }) : aiOk({ intent: 'order' }); }) as typeof fetch;
  try { assertEquals((await bot.askAi('s', 'u'))._model, 'gemini-3.8-flash'); } finally { globalThis.fetch = real; Deno.env.delete('GEMINI_MODEL'); }
  assertEquals(bodies.length, 2); assertEquals(bodies[1].generationConfig.thinkingConfig, undefined);
});

Deno.test('ghi chú chỉ lặp lại tuỳ chọn thì bỏ; ghi chú thật thì giữ', () => {
  const mi = menu.items.find(i => i.name === 'Mì nem chua rán')!;
  const them = mi.groups.find(g => g.title === 'Thêm mì')!.choices[0].id;
  const d = bot.applyAi(empty(), { items: [{ m: mi.n, choices: [them], note: 'thêm mì' }, { m: num('Cơm trộn Hàn Quốc'), note: 'nhiều cơm' }, { m: num('Cơm trộn Hàn Quốc'), note: 'không trứng' }] }, menu, NOW, null);
  assertEquals(d.items.map(i => [i.name, i.choices, i.note]), [['Mì nem chua rán', ['Thêm 1 phần mì'], null], ['Cơm trộn Hàn Quốc', [], 'nhiều cơm'], ['Cơm trộn Hàn Quốc', [], 'không trứng']]);
  assert(bot.sameAsChoice('Thêm mì', 'Thêm 1 phần mì')); assert(!bot.sameAsChoice('mì cay', 'Thêm 1 phần mì')); assert(!bot.sameAsChoice('thêm', 'Thêm 1 phần mì'));
});

Deno.test('prompt dạy cách hiểu lệnh sửa và "tổng rồi chia chi tiết"', () => {
  const sp = bot.systemPrompt(menu, NOW, '07:00', '22:00');
  assertStringIncludes(sp, 'TỔNG rồi CHIA CHI TIẾT');
  assertStringIncludes(sp, 'sửa A thành B');
});

Deno.test('câu bot nhắn lại: tóm tắt, món chưa rõ, còn thiếu', () => {
  const d = bot.applyAi(empty(), { dine_type: 'giao_hang', time: '19:30', items: [{ m: num('Cơm gà viên'), qty: 2 }], unknown: ['bún bò'] }, menu, NOW, 'Lan');
  const t = bot.draftReply(d, bot.missingOf(d, NOW), NOW, false);
  assertStringIncludes(t, '✅ Đã gửi bếp · Lan');
  assertStringIncludes(t, '2 Cơm gà viên');
  assertStringIncludes(t, '“bún bò”');
  assertStringIncludes(t, 'Còn thiếu: địa chỉ ship, SĐT người nhận');
  assertStringIncludes(bot.draftReply(d, [], NOW, true), '🔄 Đã sửa đơn ở bếp');
  const noDine = bot.applyAi(empty(), { items: [{ m: num('Cơm gà viên') }] }, menu, NOW, null);
  assertStringIncludes(bot.draftReply(noDine, bot.missingOf(noDine, NOW), NOW, false), 'tạm để Mang về');
});

Deno.test('prompt: menu, giờ hiện tại, đơn đang ghi, ảnh / tin chữ', () => {
  const sp = bot.systemPrompt(menu, NOW, '07:00', '22:00');
  assertStringIncludes(sp, '15:00 Thứ 7 ngày 2026-10-24');
  assertStringIncludes(sp, num('Cơm gà viên') + '. Cơm gà viên — 30k');
  assertStringIncludes(sp, 'ẢNH CHỤP MÀN HÌNH');
  assertStringIncludes(sp, 'CHỐNG ĐẾM TRÙNG');   // khách nhắc lại món thì không cộng thêm
  const cur = bot.applyAi(empty(), { items: [{ m: num('Cơm gà viên') }] }, menu, NOW, 'Lan');
  assertStringIncludes(bot.userPrompt({ cur, nImages: 2, caption: 'khách quen' }), 'Chủ quán gửi 2 ảnh');
  assertStringIncludes(bot.userPrompt({ cur, nImages: 2 }), '"ten":"Cơm gà viên"');
  assertStringIncludes(bot.userPrompt({ cur: null, nImages: 0, text: 'thêm 1 trà đào' }), 'Chủ quán nhắn: "thêm 1 trà đào"');
});

Deno.test('đọc JSON AI có rào ```', () => {
  assertEquals(bot.parseJson('```json\n{"intent":"order","items":[]}\n```').intent, 'order');
});

Deno.test('tin xác nhận gửi khách sau khi duyệt', () => {
  const d = bot.applyAi(empty(), { dine_type: 'giao_hang', time: '19:30', address: '12 ngõ 5 Nguyễn Trãi', phone: '0912345678', items: [{ m: num('Cơm gà viên'), qty: 2 }] }, menu, NOW, 'Nguyễn Lan');
  const t = bot.approvedText(d, 60000, { bank_name: 'MB Bank', bank_account: '0393247469', bank_holder: '' }, NOW);
  assertStringIncludes(t, 'Tổng: 60.000đ');
  assertStringIncludes(t, 'giao cho mình lúc 19:30');
  assertStringIncludes(t, 'BENOC NGUYEN LAN');
});

// ---------------------------------------------------------------------
// AI: dự phòng khi quá tải, gửi kèm ảnh
// ---------------------------------------------------------------------
const aiOk = (o: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] }), { status: 200 });
const gem = () => { Deno.env.set('GEMINI_API_KEY', 'k'); Deno.env.delete('ANTHROPIC_API_KEY'); Deno.env.delete('AI_PROVIDER'); Deno.env.delete('GEMINI_MODEL'); };

Deno.test('Gemini: quá tải / không có model → thử model kế; sai khoá → dừng; ảnh gửi kèm', async () => {
  gem(); const real = globalThis.fetch; const model = (url: string) => String(url).split('/models/')[1].split(':')[0];
  try {
    // tin chữ: cũng model nhanh trước
    let tseen: string[] = [];
    globalThis.fetch = (async (url: string) => { tseen.push(model(url)); return aiOk({ intent: 'order' }); }) as typeof fetch;
    await bot.askAi('s', 'u'); assertEquals(tseen, ['gemini-3.5-flash-lite']);
    let seen: string[] = []; let body: any = null;
    globalThis.fetch = (async (url: string, init?: any) => { seen.push(model(url)); body = JSON.parse(init.body); return seen.length === 1 ? new Response('x', { status: 503 }) : aiOk({ intent: 'order', items: [] }); }) as typeof fetch;
    const a = await bot.askAi('s', 'u', [{ mime: 'image/png', b64: 'QUJD' }]);
    assertEquals([a.intent, a._model], ['order', 'gemini-2.5-flash']);
    assertEquals(body.generationConfig.thinkingConfig, { thinkingBudget: 0 });   // tắt suy nghĩ cho nhanh
    assertEquals(body.contents[0].parts.slice(1), [{ text: 'Ảnh 1:' }, { inlineData: { mimeType: 'image/png', data: 'QUJD' } }]);

    seen = [];
    globalThis.fetch = (async (url: string) => { seen.push(model(url)); return seen.length <= 3 ? new Response('busy', { status: 429 }) : aiOk({ intent: 'order' }); }) as typeof fetch;
    assertEquals((await bot.askAi('s', 'u', [{ mime: 'image/png', b64: 'QUJD' }]))._model, 'gemini-3.5-flash-lite');
    assertEquals(seen.length, 4);

    seen = [];
    globalThis.fetch = (async (url: string) => { seen.push(model(url)); return new Response('bad key', { status: 401 }); }) as typeof fetch;
    let threw = false; try { await bot.askAi('s', 'u', [{ mime: 'image/png', b64: 'QUJD' }]); } catch (_) { threw = true; }
    assert(threw); assertEquals(seen, ['gemini-3.5-flash-lite']);
  } finally { globalThis.fetch = real; }
});

// ---------------------------------------------------------------------
// Ẩn danh dữ liệu huấn luyện
// ---------------------------------------------------------------------
Deno.test('ẩn tên, SĐT; giữ địa chỉ', () => {
  const anon = bot.anonymizer({ names: ['Nguyễn Lan', null], words: bot.menuWords(menu) });
  assertEquals(anon('sdt 0912.345.678 nhé'), 'sdt <SDT> nhé');
  assertEquals(anon('stk 0393247469123'), 'stk <SO>');
  assertEquals(anon('ship tới 12 ngõ 5 Nguyễn Trãi giúp'), 'ship tới 12 ngõ 5 Nguyễn Trãi giúp');
  assertEquals(anon('mình tên Lan, nguyễn lan'), 'mình tên <TEN>, <TEN>');
  assertEquals(anon('2 ts tcdd 6r tối'), '2 ts tcdd 6r tối');
});

// ---------------------------------------------------------------------
// Zalo / Telegram
// ---------------------------------------------------------------------
Deno.test('đọc tin Zalo / Telegram', () => {
  const z = bot.parseUpdate('zalo', { ok: true, result: { event_name: 'message.image.received', message: { from: { id: 'u1', display_name: 'Ngọc' }, chat: { id: 'c1', chat_type: 'PRIVATE' }, photo: 'https://zalo/a.jpg', caption: 'khách quen', message_id: 'm1', date: 1 } } })!;
  assertEquals([z.chatId, z.name, z.photo, z.caption, z.text], ['c1', 'Ngọc', 'https://zalo/a.jpg', 'khách quen', null]);
  const zt = bot.parseUpdate('zalo', { event_name: 'message.text.received', message: { from: { id: 'u1' }, chat: { id: 'c1' }, text: 'huỷ' } })!;
  assertEquals(zt.text, 'huỷ');
  assertEquals(bot.parseUpdate('zalo', { event_name: 'message.sticker.received', message: { chat: { id: 'c1' } } })!.unsupported, 'sticker');
  const t = bot.parseUpdate('tele', { update_id: 1, message: { chat: { id: 42 }, from: { first_name: 'Thái' }, photo: [{ file_id: 'nho' }, { file_id: 'to' }] } })!;
  assertEquals([t.chatId, t.name, t.photo], ['42', 'Thái', 'to']);
  assertEquals(bot.parseUpdate('tele', { message: { chat: { id: 42 }, document: { file_id: 'f', mime_type: 'image/png' } } })!.photo, 'f');
  assertEquals(bot.parseUpdate('tele', { my_chat_member: {} }), null);
});

Deno.test('webhook: sai mã bí mật bị chặn, GET báo đang chạy', async () => {
  Deno.env.set('ZALO_BOT_TOKEN', 'zt'); Deno.env.set('SUPABASE_URL', 'https://x.supabase.co'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'k');
  const s1 = await bot.webhookSecret('zalo'), s2 = await bot.webhookSecret('zalo');
  assertEquals(s1, s2); assert(s1.length >= 32); assert(!s1.includes('zt'));
  const bad = await bot.handle(new Request('https://x/bot-don', { method: 'POST', headers: { 'x-bot-api-secret-token': 'sai' }, body: '{}' }));
  assertEquals(bad.status, 401);
  assertStringIncludes(await (await bot.handle(new Request('https://x/bot-don'))).text(), 'đang chạy');
});

// Supabase giả
function fakeSb(tables: Record<string, any[]>, links: Record<string, boolean> = {}) {
  let seq = 1; const uploads: string[] = [];
  const from = (name: string) => {
    const f: ((r: any) => boolean)[] = []; let op = 'select', payload: any = null, ord: [string, boolean] | null = null, lim = 1e9, mode = '', retSel = false;
    const exec = (): any => {
      const rows = (tables[name] ||= []);
      if (op === 'insert') { const r = Object.assign({ id: name === 'fb_drafts' ? crypto.randomUUID() : seq++, created_at: new Date().toISOString() }, name === 'bot_photos' ? { done: false } : {}, payload); rows.push(r); return { data: retSel ? r : null, error: null }; }
      if (op === 'upsert') { const i = rows.findIndex(x => x.hash === payload.hash); if (i < 0) rows.push({ ...payload }); return { data: null, error: null }; }
      const hit = rows.filter(r => f.every(g => g(r)));
      if (op === 'update') { hit.forEach(r => Object.assign(r, payload)); return { data: null, error: null }; }
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
      insert: (p: any) => (op = 'insert', payload = p, q), update: (p: any) => (op = 'update', payload = p, q), upsert: (p: any) => (op = 'upsert', payload = p, q),
      then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
    };
    return q;
  };
  const rpc = async (n: string, a: any) => {
    if (n === 'get_menu') return { data: menuRaw, error: null };
    // Giả lập SQL 27: tạo / thay đơn thật trong bảng orders; locked khi đơn có cờ nhan = true
    if (n === 'bot_don_mo') { const o = (tables.orders || []).find(x => x.id === a.p_order); return { data: !!o && !o.nhan, error: null }; }
    if (n === 'bot_dat_don') {
      const d = tables.fb_drafts.find(x => x.id === a.p_draft); const os = (tables.orders ||= []);
      const gone = d.items.find((i: any) => (tables.het || []).includes(i.menu_item_id));
      if (gone) return { data: null, error: { message: 'ITEM_UNAVAILABLE', hint: gone.menu_item_id } };
      const total = d.items.reduce((t: number, i: any) => t + i.price * i.qty, 0);
      let o = d.order_id && os.find(x => x.id === d.order_id);
      if (o && o.nhan) return { data: { action: 'locked', order_id: o.id }, error: null };
      const action = o ? 'updated' : 'created';
      if (!o) { o = { id: crypto.randomUUID(), source: 'fb' }; os.push(o); }
      Object.assign(o, { items: d.items.map((i: any) => ({ ...i })), customer_name: d.customer_name || 'Khách online', dine_type: d.dine_type || 'mang_ve', total });
      Object.assign(d, { status: 'da_duyet', order_id: o.id, total_est: total });
      return { data: { action, order_id: o.id, total }, error: null };
    }
    if (n === 'bot_huy_don') {
      const d = tables.fb_drafts.find(x => x.id === a.p_draft); const o = (tables.orders || []).find(x => x.id === d.order_id);
      if (o && o.nhan) return { data: { action: 'locked' }, error: null };
      tables.orders = (tables.orders || []).filter(x => x !== o); d.status = 'huy'; return { data: { action: 'cancelled' }, error: null };
    }
    if (n === 'bot_link_use') { const ok = !!links[a.p_code]; if (ok) { delete links[a.p_code]; (tables.bot_users ||= []).push({ kenh: a.p_kenh, chat_id: a.p_chat, name: a.p_name }); } return { data: ok, error: null }; }
    return { data: null, error: null };
  };
  const files = new Map<string, Uint8Array>();
  const storage = { from: (_b: string) => ({
    upload: async (path: string, body: any) => { uploads.push(path); if (body instanceof Uint8Array) files.set(path, body); return { error: null }; },
    download: async (path: string) => files.has(path) ? { data: new Blob([files.get(path)! as Uint8Array<ArrayBuffer>]), error: null } : { data: null, error: { message: 'not found' } },
    remove: async (paths: string[]) => { paths.forEach(p => files.delete(p)); return { data: null, error: null }; },
  }) };
  return { sb: { from, rpc, storage } as any, uploads, files };
}

/* Chạy 1 tin qua bot với Zalo / AI giả. Trả về các tin bot nhắn lại */
async function run(tables: Record<string, any[]>, msg: Partial<any>, aiJson: unknown = null, links: Record<string, boolean> = {}) {
  gem(); Deno.env.set('ZALO_BOT_TOKEN', 'zt');
  tables.shop_settings ||= [{ id: 1, fb_open: '00:00', fb_close: '23:59', fb_train_on: true }];
  const sent: string[] = []; const ai: any[] = []; const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: any) => {
    const u = String(url);
    if (u.includes('generativelanguage')) { ai.push(JSON.parse(init.body)); return aiOk(aiJson); }
    if (u.includes('zaloplatforms.com') && u.endsWith('/sendMessage')) { sent.push(JSON.parse(init.body).text); return new Response('{"ok":true}'); }
    if (u.startsWith('https://zalo/')) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { headers: { 'content-type': 'application/octet-stream' } });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  const f = fakeSb(tables, links);
  try { await bot.handleIncoming(f.sb, Object.assign({ kenh: 'zalo', chatId: 'c1', name: 'Ngọc', text: null, photo: null, caption: null }, msg) as any, 0); }
  finally { globalThis.fetch = real; }
  return { sent, ai, uploads: f.uploads };
}

Deno.test('chưa kết nối: bot từ chối; nhắn đúng mã thì kết nối được, mã sai thì không', async () => {
  const t: Record<string, any[]> = {};
  const a = await run(t, { text: 'xin chào' });
  assertStringIncludes(a.sent[0], 'chưa được dùng bot');
  const b = await run(t, { text: '111111' });
  assertStringIncludes(b.sent[0], 'Mã không đúng');
  const c = await run(t, { text: '123456' }, null, { '123456': true });
  assertStringIncludes(c.sent[0], '✅ Đã kết nối Ngọc');
  assertEquals(t.bot_users, [{ kenh: 'zalo', chat_id: 'c1', name: 'Ngọc' }]);
  const d = await run(t, { text: 'hi' });
  assertStringIncludes(d.sent[0], 'Chụp màn hình');
});

const linked = (): Record<string, any[]> => ({ bot_users: [{ kenh: 'zalo', chat_id: 'c1', name: 'Ngọc' }] });

Deno.test('gửi ảnh → đơn thật vào thẳng bếp, lưu ảnh, chép đoạn chat, ghi mẫu huấn luyện', async () => {
  const t = linked();
  const r = await run(t, { photo: 'https://zalo/a.jpg' }, {
    intent: 'order', khach: 'Nguyễn Lan', dine_type: 'giao_hang', time: '19:30', address: '12 ngõ 5 Nguyễn Trãi', phone: '0912345678',
    items: [{ m: num('Cơm gà viên'), qty: 2 }], convo: [{ s: 'khach', t: '2 cơm gà viên ship 12 ngõ 5 Nguyễn Trãi sdt 0912345678' }, { s: 'quan', t: 'Dạ vâng ạ' }, { s: 'bot', t: 'lạ' }],
  });
  assertEquals(r.ai.length, 1);
  assertEquals(r.ai[0].contents[0].parts.find((p: any) => p.inlineData).inlineData.mimeType, 'image/jpeg');   // đoán đúng loại ảnh dù Zalo trả octet-stream
  assertEquals(t.bot_photos[0].done, true);
  const d = t.fb_drafts[0];
  assertEquals([d.kenh, d.chat_id, d.nguoi_gui, d.status, d.customer_name, d.total_est], ['zalo', 'c1', 'Ngọc', 'da_duyet', 'Nguyễn Lan', 60000]);
  assertEquals(t.orders.length, 1); assertEquals([t.orders[0].source, t.orders[0].dine_type, d.order_id], ['fb', 'giao_hang', t.orders[0].id]);
  assertEquals(d.convo.length, 2);                          // bỏ tin không phải khách / quán
  assertEquals(d.anh.length, 1); assertMatch(d.anh[0], new RegExp('^' + d.id + '/\\d+-1\\.jpg$'));
  assertEquals(r.uploads, d.anh);
  assertStringIncludes(r.sent[0], 'Đang đọc 1 ảnh');
  assertStringIncludes(r.sent[1], '✅ Đã gửi bếp · Nguyễn Lan');
  assertEquals(t.fb_train.length, 1);
  const s = JSON.stringify(t.fb_train[0]);
  assert(!s.includes('0912345678') && !s.includes('Nguyễn Lan'));
  assertStringIncludes(s, '12 ngõ 5 Nguyễn Trãi');
});

Deno.test('ảnh: tên khách là tên đầu màn hình, AI nhặt nhầm tên chủ quán trong khung trích dẫn thì bỏ', async () => {
  const t = linked();
  await run(t, { photo: 'https://zalo/a.jpg' }, {
    intent: 'order', khach: 'Thanhh Hienn', name: 'Hồng Ngọc', dine_type: 'giao_hang', time: '09:45', address: 'ktx C1',
    items: [{ m: num('Cơm gà viên'), qty: 1 }], convo: [{ s: 'khach', t: '1 cơm gà viên ship ktx C1' }],
  });
  assertEquals(t.fb_drafts[0].customer_name, 'Thanhh Hienn');
  assertEquals(t.orders[0].customer_name ?? 'Thanhh Hienn', 'Thanhh Hienn');
});

Deno.test('prompt: phân biệt Zalo / Messenger bằng dấu hiệu cụ thể, không dựa vào màu xanh', () => {
  const p = bot.systemPrompt(menu, new Date('2026-05-12T04:00:00Z'), '07:00', '22:00');
  for (const k of ['PHÂN BIỆT ZALO / MESSENGER', 'GIỜ nằm BÊN TRONG bong bóng', 'DANH SÁCH', '"Tin nhắn"', 'nguon_ly_do', 'xanh NHẠT = ZALO']) assertStringIncludes(p, k);
});

Deno.test('prompt: tên khách chỉ lấy ở thanh tiêu đề, không lấy tên trong khung trích dẫn', () => {
  const p = bot.systemPrompt(menu, new Date('2026-05-12T04:00:00Z'), '07:00', '22:00');
  assertStringIncludes(p, 'KHUNG TRÍCH DẪN');
  assertStringIncludes(p, 'CHỈ khi khách tự xưng');
});

Deno.test('nhắn chữ → sửa đơn ở bếp; "huỷ" → huỷ đơn; bếp đã nhận thì khoá', async () => {
  const t = linked();
  await run(t, { photo: 'https://zalo/a.jpg' }, { intent: 'order', khach: 'Lan', dine_type: 'mang_ve', time: '18:00', items: [{ m: num('Cơm gà viên') }], convo: [{ s: 'khach', t: '1 cơm gà' }] });
  const id = t.fb_drafts[0].id;
  const r = await run(t, { text: 'thêm 1 trà sữa' }, { intent: 'order', dine_type: 'mang_ve', time: '18:00', items: [{ m: num('Cơm gà viên') }, { m: num('Hồng trà sữa trân châu') }] });
  assertStringIncludes(r.ai[0].contents[0].parts[0].text, 'ĐƠN ĐANG GHI');
  assertEquals(t.fb_drafts.length, 1);
  assertEquals(t.fb_drafts[0].id, id);
  assertEquals(t.fb_drafts[0].items.length, 2);
  assertEquals(t.fb_drafts[0].customer_name, 'Lan');        // giữ tên khách cũ
  assertEquals(t.fb_drafts[0].convo.at(-1), { s: 'sua', t: 'thêm 1 trà sữa' });
  assertStringIncludes(r.sent[0], '🔄 Đã sửa đơn ở bếp · Lan');
  assertEquals(t.orders.length, 1); assertEquals(t.orders[0].items.length, 2);       // vẫn 1 đơn ở bếp, đã thay món
  // bếp nhận rồi: nhắn sửa thì báo khoá, không gọi AI
  t.orders[0].nhan = true;
  const lk = await run(t, { text: 'thêm 1 cơm' }, { intent: 'order' });
  assertEquals(lk.ai.length, 0); assertStringIncludes(lk.sent[0], 'đã nhận đơn này');
  const lk2 = await run(t, { text: 'huỷ' }); assertStringIncludes(lk2.sent[0], 'không huỷ được');
  t.orders[0].nhan = false;
  const c = await run(t, { text: 'Huỷ' });
  assertEquals(t.fb_drafts[0].status, 'huy'); assertEquals(t.orders.length, 0);
  assertStringIncludes(c.sent[0], 'Đã huỷ đơn của Lan');
  const c2 = await run(t, { text: 'huỷ' });
  assertStringIncludes(c2.sent[0], 'Không có đơn nào');
});

Deno.test('ảnh khách khác (same_order = false) → đơn mới; ảnh không phải đơn → báo lại', async () => {
  const t = linked();
  await run(t, { photo: 'https://zalo/a.jpg' }, { intent: 'order', khach: 'Lan', items: [{ m: 1 }], convo: [] });
  await run(t, { photo: 'https://zalo/b.jpg' }, { intent: 'order', same_order: false, khach: 'Huy', items: [{ m: 2 }], convo: [] });
  assertEquals(t.fb_drafts.map(d => d.customer_name), ['Lan', 'Huy']);
  const r = await run(t, { photo: 'https://zalo/c.jpg' }, { intent: 'khong_phai_don' });
  assertEquals(t.fb_drafts.length, 2);
  assertStringIncludes(r.sent.at(-1)!, 'không thấy đoạn chat đặt món');
});

Deno.test('ảnh mới khi đơn trước bếp đã nhận → đơn mới; tên khách khác → đơn mới', async () => {
  const t = linked();
  await run(t, { photo: 'https://zalo/a.jpg' }, { intent: 'order', khach: 'Lan', items: [{ m: num('Cơm gà viên') }], convo: [] });
  t.orders[0].nhan = true;
  const r = await run(t, { photo: 'https://zalo/b.jpg' }, { intent: 'order', same_order: true, khach: 'Mai', items: [{ m: num('Hồng trà sữa trân châu') }], convo: [] });
  assertStringIncludes(r.ai[0].contents[0].parts[0].text, 'Chưa có đơn đang ghi');     // không đưa đơn cũ cho AI
  assertEquals(t.orders.length, 2); assertStringIncludes(r.sent.at(-1)!, '✅ Đã gửi bếp');
  // đơn trước chưa nhận nhưng AI đọc ra tên khác → vẫn là đơn mới
  const r2 = await run(t, { photo: 'https://zalo/c.jpg' }, { intent: 'order', same_order: true, khach: 'Huy', items: [{ m: 1 }], convo: [] });
  assertEquals(t.orders.length, 3); assertStringIncludes(r2.sent.at(-1)!, '✅ Đã gửi bếp · Huy');
});

Deno.test('prompt dạy nhận diện Messenger / Zalo, ai cầm máy; ghi nguồn vào ghi chú đơn', async () => {
  const sp = bot.systemPrompt(menu, NOW, '07:00', '22:00');
  for (const x of ['MESSENGER', 'ZALO', 'AI CẦM MÁY', 'đặt đơn mới', '"nguon"']) assertStringIncludes(sp, x);
  assertEquals(bot.noteWithSource('lấy thêm đũa', 'Zalo'), 'Zalo · lấy thêm đũa');
  assertEquals(bot.noteWithSource('Zalo · lấy thêm đũa', 'Messenger'), 'Messenger · lấy thêm đũa');
  assertEquals(bot.noteWithSource(null, null), null);
  const t = linked();
  await run(t, { photo: 'https://zalo/a.jpg' }, { intent: 'order', nguon: 'messenger', khach: 'Lan', note: 'gọi trước khi giao', items: [{ m: num('Cơm gà viên'), note: 'nhiều tương' }], convo: [] });
  assertEquals(t.fb_drafts[0].note, 'Messenger · gọi trước khi giao');
  assertEquals(t.fb_drafts[0].items[0].note, 'nhiều tương');
  await run(t, { text: 'giờ 18h' }, { intent: 'order', note: 'gọi trước khi giao', items: [{ m: num('Cơm gà viên'), note: 'nhiều tương' }] });   // sửa bằng chữ: giữ nguồn
  assertEquals(t.fb_drafts[0].note, 'Messenger · gọi trước khi giao');
});

Deno.test('nhiều ảnh của nhiều khách → mỗi khách 1 đơn, mỗi đơn 1 tin; ảnh gắn đúng đơn', async () => {
  const t = linked();
  // giả lập gửi 2 ảnh liền nhau: ảnh đầu chờ, ảnh sau đọc cả lô
  t.bot_photos = [{ id: -1, kenh: 'zalo', chat_id: 'c1', ref: 'https://zalo/1.jpg', done: false, created_at: new Date().toISOString() }];
  const r = await run(t, { photo: 'https://zalo/2.jpg' }, { orders: [
    { anh: [1], intent: 'order', nguon: 'zalo', khach: 'Thanhh Hienn', dine_type: 'giao_hang', address: 'ktx C1', items: [{ m: num('Cơm heo chiên xù') }], convo: [] },
    { anh: [2], intent: 'order', nguon: 'messenger', khach: 'Bìm Sữa Xuân Mai', dine_type: 'giao_hang', address: 'kidsplaza', phone: '0968870906', items: [{ m: num('Hồng trà sữa trân châu') }, { m: num('Kimbap chiên') }], convo: [] },
  ] });
  assertStringIncludes(r.sent[0], 'Đang đọc 2 ảnh');
  assertEquals(t.fb_drafts.map(d => d.customer_name).sort(), ['Bìm Sữa Xuân Mai', 'Thanhh Hienn']);
  assertEquals(t.orders.length, 2);
  const replies = r.sent.filter(x => x.startsWith('✅'));
  assertEquals(replies.length, 2);
  for (const d of t.fb_drafts) assertEquals(d.anh.length, 1);
  assertEquals(t.fb_drafts.find(d => d.customer_name === 'Thanhh Hienn').note, 'Zalo');
  assertEquals(bot.splitOrders({ orders: [{ anh: [9] }, { anh: [] }] } as any, 2).map(x => x.imgIdx), [[], []]);   // số ảnh sai → không gắn bừa
  assertEquals(bot.splitOrders({ intent: 'order' } as any, 3)[0].imgIdx, [0, 1, 2]);                             // 1 đơn kiểu cũ → mọi ảnh
});

Deno.test('nhiều hơn 6 ảnh → chia nhóm, gọi AI song song', async () => {
  gem(); Deno.env.set('ZALO_BOT_TOKEN', 'zt');
  const t = linked(); t.shop_settings = [{ id: 1, fb_open: '00:00', fb_close: '23:59' }];
  const now = new Date().toISOString();
  t.bot_photos = Array.from({ length: 7 }, (_, i) => ({ id: -10 + i, kenh: 'zalo', chat_id: 'c1', ref: 'https://zalo/' + i + '.jpg', done: false, created_at: now }));
  const calls: number[] = []; const sent: string[] = []; const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: any) => {
    const u = String(url);
    if (u.includes('generativelanguage')) { const n = JSON.parse(init.body).contents[0].parts.filter((p: any) => p.inlineData).length; calls.push(n);
      return aiOk({ orders: [{ anh: [...Array(n).keys()].map(i => i + 1), intent: 'order', khach: 'Khách ' + calls.length, items: [{ m: 1 }], convo: [] }] }); }
    if (u.endsWith('/sendMessage')) { sent.push(JSON.parse(init.body).text); return new Response('{"ok":true}'); }
    if (u.startsWith('https://zalo/')) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1]));
    return new Response('{}');
  }) as typeof fetch;
  try { await bot.handleIncoming(fakeSb(t).sb, { kenh: 'zalo', chatId: 'c1', name: 'Ngọc', text: null, photo: 'https://zalo/7.jpg', caption: null }, 0); } finally { globalThis.fetch = real; }
  assertEquals(calls.sort(), [2, 6]);            // 8 ảnh → nhóm 6 + nhóm 2
  assertEquals(t.orders.length, 2);
  assertStringIncludes(sent[0], 'Đang đọc 8 ảnh');
});

Deno.test('món hết hàng / không có món → báo lại, chưa gửi bếp', async () => {
  const t = linked(); (t as any).het = [menu.items.find(i => i.name === 'Cơm gà viên')!.id];
  const r = await run(t, { text: '1 cơm gà viên' }, { intent: 'order', items: [{ m: num('Cơm gà viên') }] });
  assertStringIncludes(r.sent[0], '“Cơm gà viên” đang tạm hết'); assertEquals((t.orders || []).length, 0);
  const r2 = await run(linked(), { text: 'khách hỏi giờ mở cửa' }, { intent: 'order', items: [] });
  assertStringIncludes(r2.sent[0], 'Chưa thấy món nào');
});

Deno.test('AI lỗi → báo chủ quán gửi lại, không tạo đơn', async () => {
  gem(); Deno.env.set('ZALO_BOT_TOKEN', 'zt');
  const t = linked(); t.shop_settings = [{ id: 1 }];
  const sent: string[] = []; const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: any) => {
    const u = String(url);
    if (u.includes('generativelanguage')) return new Response('bad', { status: 401 });
    if (u.endsWith('/sendMessage')) { sent.push(JSON.parse(init.body).text); return new Response('{"ok":true}'); }
    return new Response('{}');
  }) as typeof fetch;
  try { await bot.handleIncoming(fakeSb(t).sb, { kenh: 'zalo', chatId: 'c1', name: 'Ngọc', text: '2 cơm gà ship 18h', photo: null, caption: null }, 0); } finally { globalThis.fetch = real; }
  assertEquals((t.fb_drafts || []).length, 0);
  assertStringIncludes(sent[0], 'AI đang quá tải');
});

// ---------------------------------------------------------------------
// Phím tắt iPhone (kênh ios): gõ lưng máy → chụp màn hình → POST thẳng ảnh vào bot-don
// ---------------------------------------------------------------------
async function shortcut(tables: Record<string, any[]>, body: BodyInit, headers: Record<string, string>, aiJson: unknown = null) {
  gem(); Deno.env.set('CAPTURE_KEY', 'khoaPhimTat123');
  tables.shop_settings ||= [{ id: 1, fb_open: '00:00', fb_close: '23:59', fb_train_on: true }];
  const ai: any[] = [], outbound: string[] = []; const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: any) => {
    const u = String(url);
    if (u.includes('generativelanguage')) { ai.push(JSON.parse(init.body)); return aiOk(aiJson); }
    if (u.includes('zaloplatforms.com') || u.includes('telegram.org')) outbound.push(u);
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  const f = fakeSb(tables);
  try {
    const res = await bot.handleShortcut(f.sb, new Request('https://x/bot-don', { method: 'POST', headers, body }));
    return { status: res.status, j: await res.json(), ai, outbound, uploads: f.uploads };
  } finally { globalThis.fetch = real; }
}
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const ORDER = {
  intent: 'order', khach: 'Phạm Hà', nguon: 'messenger', dine_type: 'mang_ve', time: '18:00',
  items: [{ m: num('Cơm gà viên'), qty: 2 }], convo: [{ s: 'khach', t: '2 cơm gà viên 6h qua lấy' }, { s: 'quan', t: 'Dạ' }],
};

Deno.test('Phím tắt: sai / thiếu mã thì từ chối, không gọi AI', async () => {
  const t: Record<string, any[]> = {};
  const a = await shortcut(t, JPG, { 'x-capture-key': 'sai', 'content-type': 'image/jpeg' });
  assertEquals(a.status, 401); assertEquals(a.ai.length, 0);
  Deno.env.delete('CAPTURE_KEY');
  const f = fakeSb(t);
  const b = await bot.handleShortcut(f.sb, new Request('https://x', { method: 'POST', headers: { 'x-capture-key': 'x' }, body: JPG }));
  assertEquals(b.status, 503);
});

Deno.test('Phím tắt (x-wait: 1): ảnh → đơn vào thẳng bếp, trả lời trong kết quả (không cần kết nối mã, không nhắn Zalo)', async () => {
  const t: Record<string, any[]> = {};
  const r = await shortcut(t, JPG, { 'x-capture-key': 'khoaPhimTat123', 'x-device': 'iphone-chu-quan', 'x-wait': '1', 'content-type': 'image/jpeg' }, ORDER);
  assertEquals(r.status, 200);
  assertEquals(r.ai.length, 1);
  assertEquals(r.ai[0].contents[0].parts.find((p: any) => p.inlineData).inlineData.mimeType, 'image/jpeg');
  const d = t.fb_drafts[0];
  assertEquals([d.kenh, d.chat_id, d.status, d.customer_name, d.total_est], ['ios', 'iphone-chu-quan', 'da_duyet', 'Phạm Hà', 60000]);
  assertEquals(t.orders.length, 1);
  assertStringIncludes(r.j.tom_tat, '✅ Đã gửi bếp · Phạm Hà');
  assert(!r.j.tom_tat.includes('Đang đọc'));
  assertEquals(r.outbound, []);
  assertEquals(t.bot_photos, undefined);           // không gom ảnh, đọc luôn
  assertEquals(d.anh.length, 1); assertEquals(r.uploads, d.anh);
  assertEquals(t.fb_train.length, 1);
});

Deno.test('Phím tắt: nhắn chữ sửa đơn vừa lên, "huỷ" huỷ đơn', async () => {
  const t: Record<string, any[]> = {};
  const H = { 'x-capture-key': 'khoaPhimTat123', 'x-device': 'iphone-chu-quan' };
  await shortcut(t, JPG, { ...H, 'x-wait': '1', 'content-type': 'image/jpeg' }, ORDER);
  const e = await shortcut(t, JSON.stringify({ text: 'thêm 1 cơm gà viên' }), { ...H, 'content-type': 'application/json' },
    { intent: 'order', khach: 'Phạm Hà', dine_type: 'mang_ve', time: '18:00', items: [{ m: num('Cơm gà viên'), qty: 3 }] });
  assertEquals(t.fb_drafts.length, 1);
  assertEquals(t.fb_drafts[0].items[0].qty, 3);
  assertStringIncludes(e.j.tom_tat, '🔄 Đã sửa đơn ở bếp');
  const c = await shortcut(t, 'huỷ', { ...H, 'content-type': 'text/plain' });
  assertStringIncludes(c.j.tom_tat, '🗑 Đã huỷ đơn của Phạm Hà');
  assertEquals(t.orders.length, 0);
  assertEquals(c.ai.length, 0);
});

Deno.test('Phím tắt: không phải ảnh / mã 6 số không kết nối kênh ios', async () => {
  const t: Record<string, any[]> = {};
  const H = { 'x-capture-key': 'khoaPhimTat123' };
  const a = await shortcut(t, new TextEncoder().encode('khong phai anh'), { ...H, 'content-type': 'application/octet-stream' });
  assertEquals(a.status, 415);
  await shortcut(t, '123456', { ...H, 'content-type': 'text/plain' }, { intent: 'khong_phai_don' });
  assertEquals(t.bot_users, undefined);
});

Deno.test('Phím tắt chế độ nhanh (mặc định): trả "Đã nhận" ngay, ảnh đi đường gom như Zalo, lên đơn ngầm, xoá ảnh tạm', async () => {
  const t: Record<string, any[]> = {};
  const H = { 'x-capture-key': 'khoaPhimTat123', 'x-device': 'iphone-chu-quan', 'content-type': 'image/jpeg' };
  gem(); Deno.env.set('CAPTURE_KEY', 'khoaPhimTat123');
  t.shop_settings = [{ id: 1, fb_open: '00:00', fb_close: '23:59', fb_train_on: true }];
  const ai: any[] = []; const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: any) => String(url).includes('generativelanguage') ? (ai.push(JSON.parse(init.body)), aiOk(ORDER)) : new Response('{}')) as typeof fetch;
  const f = fakeSb(t);
  const bg: Promise<unknown>[] = [];
  (globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => bg.push(p) };
  try {
    const res = await bot.handleShortcut(f.sb, new Request('https://x/bot-don', { method: 'POST', headers: H, body: JPG }));
    const j = await res.json();
    assertStringIncludes(j.tom_tat, '📥 Đã nhận ảnh');
    assertEquals(bg.length, 1);
    assertEquals(t.bot_photos.length, 1);
    assertEquals([t.bot_photos[0].kenh, t.bot_photos[0].chat_id], ['ios', 'iphone-chu-quan']);
    assertMatch(t.bot_photos[0].ref, /^ios-tam\/iphone-chu-quan\/\d+-\w+\.jpg$/);
    await Promise.all(bg);
  } finally { globalThis.fetch = real; delete (globalThis as any).EdgeRuntime; }
  assertEquals(ai.length, 1);
  assertEquals(t.bot_photos[0].done, true);
  const d = t.fb_drafts[0];
  assertEquals([d.kenh, d.status, d.customer_name], ['ios', 'da_duyet', 'Phạm Hà']);
  assertEquals(t.orders.length, 1);
  assert(![...f.files.keys()].some(k => k.startsWith('ios-tam/')));   // ảnh tạm đã xoá
  assertEquals(d.anh.length, 1);                                          // ảnh lưu lại theo đơn
});

// ---------------------------------------------------------------------
// OCR trên máy (app Android, TEST): lưu song song, không ảnh hưởng lên đơn
// ---------------------------------------------------------------------
Deno.test('OCR: đọc dữ liệu app gửi, thứ tự dòng, so với đoạn chat Gemini', () => {
  const o = bot.parseOcr({ model: 'latin_PP-OCRv5_mobile', w: 720, h: 1600, det_ms: 210, rec_ms: 640, lines: [
    { b: [400, 300, 700, 340], t: 'Dạ quán nhận', c: 0.9 }, { b: [60, 200, 500, 240], t: '2 cơm gà viên', c: 0.95 },
    { b: [60, 245, 300, 285], t: '6h qua lấy', c: 0.8 }, { b: [1, 2], t: 'hỏng', c: 1 }, { b: [0, 0, 1, 1], t: '   ', c: 1 }, { b: [0, 0, 5, 5], t: 'x', c: 7 }] })!;
  assertEquals(o.lines.length, 4); assertEquals(o.lines[3].c, 1);   // bỏ dòng thiếu toạ độ, dòng rỗng; điểm tin cậy kẹp về 0..1
  assertEquals(bot.ocrText(o.lines.slice(0, 3)), '2 cơm gà viên 6h qua lấy Dạ quán nhận');
  assertEquals(bot.editInside('cơm gà', 'xx 2 cơm gà viên'), 0);
  assertEquals(bot.editInside('một', 'mt'), 1);
  const r = bot.ocrVsConvo(o.lines.slice(0, 3), [{ t: '2 cơm gà viên 6h qua lấy' }, { t: 'Dạ' }]);
  assertEquals(r, { cer: 0, n: 26 });
  assertEquals(bot.ocrVsConvo([{ b: [0, 0, 9, 9], t: 'Dang hot dng', c: 1 }], [{ t: 'Đang hoạt động' }]).cer! > 20, true);
  assertEquals(bot.parseOcr({ lines: 'x' }), null);
});

Deno.test('OCR: ảnh kèm kết quả OCR (multipart) → đơn lên như cũ, lưu ocr_mau, gắn đơn + CER so với Gemini', async () => {
  const t: Record<string, any[]> = {};
  gem(); Deno.env.set('CAPTURE_KEY', 'khoaPhimTat123');
  t.shop_settings = [{ id: 1, fb_open: '00:00', fb_close: '23:59', fb_train_on: true }];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => String(url).includes('generativelanguage') ? aiOk(ORDER) : new Response('{}')) as typeof fetch;
  const f = fakeSb(t); const bg: Promise<unknown>[] = [];
  (globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => bg.push(p) };
  const fd = new FormData();
  fd.append('anh', new File([JPG], 'anh.jpg', { type: 'image/jpeg' }));
  fd.append('ocr', JSON.stringify({ model: 'm1', w: 720, h: 1600, det_ms: 200, rec_ms: 600, lines: [{ b: [60, 200, 500, 240], t: '2 cơm gà vien 6h qua lấy', c: 0.9 }, { b: [400, 300, 700, 340], t: 'Dạ', c: 1 }] }));
  try {
    const res = await bot.handleShortcut(f.sb, new Request('https://x/bot-don', { method: 'POST', headers: { 'x-capture-key': 'khoaPhimTat123', 'x-device': 'android-test' }, body: fd }));
    assertStringIncludes((await res.json()).tom_tat, '📥 Đã nhận ảnh');
    await Promise.all(bg);
  } finally { globalThis.fetch = real; delete (globalThis as any).EdgeRuntime; }
  assertEquals(t.orders.length, 1);                       // đơn vẫn lên bằng Gemini
  const o = t.ocr_mau[0];
  assertEquals([o.device, o.model, o.n_dong, o.det_ms, o.chu], ['android-test', 'm1', 2, 200, '2 cơm gà vien 6h qua lấy Dạ']);
  assertMatch(o.anh, /^ocr-mau\/\d{4}-\d\d-\d\d\/[\w-]+\.jpg$/);
  assert(f.files.has(o.anh));                             // bản ảnh riêng, không bị xoá cùng ảnh tạm
  assertEquals(o.draft_id, t.fb_drafts[0].id);
  assertEquals(o.n_ky_tu, 26); assertEquals(o.cer_gemini, 3.85);   // 1 lỗi (viên → vien) / 26 ký tự
});

Deno.test('OCR: thiếu bảng ocr_mau (Product) hay OCR hỏng thì vẫn lên đơn bình thường', async () => {
  const t: Record<string, any[]> = {};
  const fd = new FormData();
  fd.append('anh', new File([JPG], 'anh.jpg', { type: 'image/jpeg' })); fd.append('ocr', '{hỏng');
  const r = await shortcut(t, fd, { 'x-capture-key': 'khoaPhimTat123', 'x-device': 'android-test', 'x-wait': '1' }, ORDER);
  assertEquals(r.status, 200); assertEquals(t.orders.length, 1); assertEquals((t.ocr_mau || []).length, 0);
});
