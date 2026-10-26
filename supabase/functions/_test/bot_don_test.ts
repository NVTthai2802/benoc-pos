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
  assertStringIncludes(t, '📝 Đơn nháp mới · Lan');
  assertStringIncludes(t, '2 Cơm gà viên');
  assertStringIncludes(t, '“bún bò”');
  assertStringIncludes(t, 'Còn thiếu: địa chỉ ship, SĐT người nhận');
  assertStringIncludes(bot.draftReply(d, [], NOW, true), '🔄 Đã cập nhật đơn');
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
    // tin chữ: model mạnh trước
    let tseen: string[] = [];
    globalThis.fetch = (async (url: string) => { tseen.push(model(url)); return aiOk({ intent: 'order' }); }) as typeof fetch;
    await bot.askAi('s', 'u'); assertEquals(tseen, ['gemini-3.8-flash']);
    let seen: string[] = []; let body: any = null;
    globalThis.fetch = (async (url: string, init?: any) => { seen.push(model(url)); body = JSON.parse(init.body); return seen.length === 1 ? new Response('x', { status: 503 }) : aiOk({ intent: 'order', items: [] }); }) as typeof fetch;
    const a = await bot.askAi('s', 'u', [{ mime: 'image/png', b64: 'QUJD' }]);
    assertEquals([a.intent, a._model], ['order', 'gemini-3.8-flash']);
    assertEquals(body.contents[0].parts[1], { inlineData: { mimeType: 'image/png', data: 'QUJD' } });

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
    if (n === 'bot_link_use') { const ok = !!links[a.p_code]; if (ok) { delete links[a.p_code]; (tables.bot_users ||= []).push({ kenh: a.p_kenh, chat_id: a.p_chat, name: a.p_name }); } return { data: ok, error: null }; }
    return { data: null, error: null };
  };
  const storage = { from: (_b: string) => ({ upload: async (path: string) => { uploads.push(path); return { error: null }; } }) };
  return { sb: { from, rpc, storage } as any, uploads };
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

Deno.test('gửi ảnh → đơn nháp chờ duyệt, lưu ảnh, chép đoạn chat, ghi mẫu huấn luyện', async () => {
  const t = linked();
  const r = await run(t, { photo: 'https://zalo/a.jpg' }, {
    intent: 'order', khach: 'Nguyễn Lan', dine_type: 'giao_hang', time: '19:30', address: '12 ngõ 5 Nguyễn Trãi', phone: '0912345678',
    items: [{ m: num('Cơm gà viên'), qty: 2 }], convo: [{ s: 'khach', t: '2 cơm gà viên ship 12 ngõ 5 Nguyễn Trãi sdt 0912345678' }, { s: 'quan', t: 'Dạ vâng ạ' }, { s: 'bot', t: 'lạ' }],
  });
  assertEquals(r.ai.length, 1);
  assertEquals(r.ai[0].contents[0].parts[1].inlineData.mimeType, 'image/jpeg');   // đoán đúng loại ảnh dù Zalo trả octet-stream
  assertEquals(t.bot_photos[0].done, true);
  const d = t.fb_drafts[0];
  assertEquals([d.kenh, d.chat_id, d.nguoi_gui, d.status, d.customer_name, d.total_est], ['zalo', 'c1', 'Ngọc', 'cho_duyet', 'Nguyễn Lan', 60000]);
  assertEquals(d.convo.length, 2);                          // bỏ tin không phải khách / quán
  assertEquals(d.anh.length, 1); assertMatch(d.anh[0], new RegExp('^' + d.id + '/\\d+-1\\.jpg$'));
  assertEquals(r.uploads, d.anh);
  assertStringIncludes(r.sent[0], 'Đang đọc 1 ảnh');
  assertStringIncludes(r.sent[1], '📝 Đơn nháp mới · Nguyễn Lan');
  assertEquals(t.fb_train.length, 1);
  const s = JSON.stringify(t.fb_train[0]);
  assert(!s.includes('0912345678') && !s.includes('Nguyễn Lan'));
  assertStringIncludes(s, '12 ngõ 5 Nguyễn Trãi');
});

Deno.test('nhắn chữ → sửa đơn vừa lên; "huỷ" → bỏ đơn', async () => {
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
  assertStringIncludes(r.sent[0], '🔄 Đã cập nhật đơn · Lan');
  const c = await run(t, { text: 'Huỷ' });
  assertEquals(t.fb_drafts[0].status, 'huy');
  assertStringIncludes(c.sent[0], 'Đã huỷ đơn nháp của Lan');
  const c2 = await run(t, { text: 'huỷ' });
  assertStringIncludes(c2.sent[0], 'Không có đơn nháp');
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
