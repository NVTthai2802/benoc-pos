// Màn Bếp / Pha chế bản React phải hiện đúng như bản cũ (?cu=1), kể cả các bảng Thu tiền / Sửa đơn / Huỷ
import { test, expect } from '@playwright/test';
import { watchErrors, demoLogin } from './helpers.js';

async function snap(page, url, who) {
  await page.goto(url);
  await demoLogin(page, who);
  await expect(page.locator('#cols .kc').first()).toBeVisible();
  await page.waitForTimeout(500);
  const out = { cols: await page.locator('#cols').innerText(), seg: await page.locator('#seg').innerText() };
  // Mở bảng của thẻ đầu tiên ở cột Chờ nhận: Sửa đơn, Thu tiền, Huỷ
  const first = () => page.locator('#list-cho_nhan .kc').first();
  for (const [btn, key] of [['Sửa đơn', 'edit'], ['Thu tiền', 'pay'], ['Huỷ', 'cancel']]) {
    await first().getByRole('button', { name: btn, exact: true }).click();
    out[key] = await first().locator('.panel').innerText();
    await first().locator('.panel').getByRole('button', { name: /^(Thôi|Xong|Giữ lại)$/ }).click();
  }
  // Chi tiết đơn
  await first().getByRole('button', { name: /Xem chi tiết đơn/ }).click();
  out.detail = await page.locator('#bnSheet').innerText();
  await page.locator('#bnSheet [data-close]').first().click();
  return out;
}

for (const [path, who] of [['/bep.html', 'Máy bếp'], ['/phache.html', 'Máy pha chế']]) {
  test('màn ' + path + ': React giống bản cũ', async ({ page }) => {
    const errs = watchErrors(page);
    const react = await snap(page, path, who);
    const legacy = await snap(page, path + '?cu=1', who);
    for (const k of Object.keys(legacy)) expect.soft(react[k], k).toBe(legacy[k]);
    expect(errs).toEqual([]);
  });
}
