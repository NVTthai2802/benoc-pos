// Gửi phiếu Bluetooth theo nhịp in: phiếu dài không vượt bộ nhớ đệm, dữ liệu tới máy in đủ và đúng thứ tự.
import { test, expect } from '@playwright/test';

test('phiếu dài gửi theo nhịp in, không vượt bộ nhớ đệm', async ({ page }) => {
  await page.goto('/bep.html');
  await page.waitForFunction(() => window.BNPrint && window.BNPrint.pacedSend);
  const r = await page.evaluate(async () => {
    const P = window.BNPrint, set = Object.assign(P.get(), { width: 58, big: true, copies: 1 });
    // 18 dòng món có tuỳ chọn, ghi chú
    const items = [];
    for (let i = 0; i < 18; i++) items.push({ item_name: 'Cơm heo chua ngọt ' + i, qty: 1 + (i % 3), unit_price: 30000, options: i % 2 ? [{ group: 'Đường', choice: 'Đường bình thường' }, { group: 'Đá', choice: 'Đá bình thường' }] : [], note: i % 4 ? null : 'Không hành, ít cay' });
    const o = { id: 'x', queue_number: 20, customer_name: 'Trang', customer_phone: '0912345678', created_at: new Date().toISOString() };
    const cv = P.ticketCanvas(o, items, { minutes: 10 }, set), u8 = P.escpos(cv, 1);
    // Máy in giả: nhận gói theo đồng hồ ảo, đốt giấy đúng tốc độ PACE (chỉ in dải ảnh khi nhận đủ dải)
    let clock = 0; const got = [], times = [];
    const fast = async p => { clock += 9; got.push(p); times.push([clock, p.length]); };
    const slow = async p => { clock += 45; got.push(p); times.push([clock, p.length]); };
    const st = await P.pacedSend(u8, fast, slow, async ms => { clock += ms; }, () => clock);
    const all = new Uint8Array(u8.length); let off = 0; got.forEach(p => { all.set(p, off); off += p.length; });
    const same = off === u8.length && all.every((v, i) => v === u8[i]);
    const ends = P.rowEnds(u8);
    return { bytes: u8.length, rows: ends.length, height: cv.height, same, peak: st.peak, cap: P.PACE.cap, packets: st.packets, ms: clock, printMs: ends.length / P.PACE.rows * 1000 };
  });
  expect(r.same).toBe(true);
  expect(r.rows).toBe(r.height + 4 * 30);        // mọi hàng chấm của ảnh + 4 dòng đẩy giấy
  expect(r.peak).toBeLessThanOrEqual(r.cap);       // không bao giờ dồn quá bộ nhớ đệm giả định
  expect(r.ms).toBeLessThan(r.printMs * 1.2);      // gửi gần bằng thời gian máy đốt giấy (không chờ thừa)
});
