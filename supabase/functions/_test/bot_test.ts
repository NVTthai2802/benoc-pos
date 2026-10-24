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
