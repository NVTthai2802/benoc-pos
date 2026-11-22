// Bấm Lưu thật trong các hộp thoại Quản lý (dữ liệu mẫu, mỗi bản một trình duyệt riêng),
// rồi so các tab sau khi lưu: bản React phải ra đúng kết quả như bản cũ (?cu=1).
import { test, expect } from '@playwright/test';
import { watchErrors, demoLogin } from './helpers.js';

const TABS = ['menu', 'uudai', 'kho', 'nhanvien'];

async function run(browser, q) {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); const errs = watchErrors(page);
  await page.goto('/quanly.html' + q); await demoLogin(page, 'Chị Nốc');
  const tab = async t => { await page.locator('[data-tab="' + t + '"]').click(); await expect(page.locator('#main .loading')).toHaveCount(0); await page.waitForTimeout(300); };
  const sh = s => page.locator('#bnSheet ' + s).first();
  const done = async () => { await expect(page.locator('#bnOverlay')).toBeHidden(); await page.waitForTimeout(400); };
  // Menu: sửa món, thêm danh mục, sửa nhóm tuỳ chọn
  await tab('menu');
  await page.locator('#main .ptitle .chipbtn', { hasText: 'Món' }).click();
  await page.locator('#main .list .lmain').first().click();
  await sh('#fName').fill('TEST – Claude món'); await sh('#fPrice').fill('33000'); await sh('input[name=grp] >> nth=0').click(); await sh('#itSave').click(); await done();
  await page.locator('#main .ptitle .chipbtn', { hasText: 'Danh mục' }).click();
  await page.locator('#addCat').click(); await sh('#cName').fill('TEST – Claude DM'); await sh('input[name=col] >> nth=2').check({ force: true }); await sh('#cSave').click(); await done();
  await page.locator('#main .ptitle .chipbtn', { hasText: 'Tuỳ chọn' }).click();
  await page.locator('#main .list .lrow').first().click(); await sh('#chAdd').click(); await sh('[data-f=name] >> nth=-1').fill('TEST lựa chọn'); await sh('[data-f=price] >> nth=-1').fill('2000'); await sh('#gSave').click(); await done();
  // Ưu đãi: tạo combo
  await tab('uudai');
  await page.locator('#addPromo').click(); await sh('#prName').fill('TEST – Claude combo');
  await sh('[data-pp="combo"] >> nth=0').click(); await sh('[data-pp="combo"] >> nth=1').click(); await sh('[data-cq][data-d="1"] >> nth=0').click(); await sh('#prPrice').fill('40000');
  await sh('[data-day="1"]').click(); await sh('#prLim').fill('5'); await sh('#prSave').click(); await done();
  // Kho: nhập hàng, thêm hàng, thêm quy cách
  await tab('kho');
  await page.locator('#main .sk-acts .btn').first().click(); await sh('[data-st="1"]').click(); await sh('#smN').fill('TEST nhập'); await sh('#smSave').click(); await done();
  await page.locator('#addStock').click(); await sh('#siName').fill('TEST – Claude hàng'); await sh('[data-pre="1"]').click(); await sh('#siQty').fill('7'); await sh('#siMin').fill('2'); await sh('#siSave').click(); await done();
  // Nhân viên: đổi lương, trả lương
  await tab('nhanvien');
  await page.locator('#main .list .lrow').first().click(); await sh('#eRate').fill('32000'); await sh('#eSave').click(); await done();
  const pay = page.locator('#main button.btn-soft:has-text("Trả")').first();
  if (await pay.count()) { await pay.click(); await sh('#poOk').click(); await done(); }
  const out = {};
  for (const t of TABS) { await tab(t); if (t === 'menu') { await page.locator('#main .ptitle .chipbtn', { hasText: 'Món' }).click(); await page.waitForTimeout(200); } out[t] = (await page.locator('#main').innerText()).replace(/\s+/g, ' '); }
  await ctx.close();
  return { out, errs };
}

test('lưu trong hộp thoại Quản lý: React ra đúng kết quả như bản cũ', async ({ browser }) => {
  test.setTimeout(180_000);
  const r = await run(browser, ''), l = await run(browser, '?cu=1');
  for (const t of TABS) expect.soft(r.out[t], 'tab ' + t).toBe(l.out[t]);
  expect(r.out.menu).toContain('TEST – Claude món');
  expect(r.out.uudai).toContain('TEST – Claude combo');
  expect(r.out.kho).toContain('TEST – Claude hàng');
  expect(r.errs).toEqual([]); expect(l.errs).toEqual([]);
});
