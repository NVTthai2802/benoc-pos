// Các tab React của trang Quản lý phải hiện đúng như bản cũ (?cu=1)
import { test, expect } from '@playwright/test';
import { watchErrors, demoLogin } from './helpers.js';

const TABS = ['doanhthu', 'menu', 'uudai', 'kho', 'nhanvien', 'chamcong', 'caidat'];

async function grab(page, url) {
  await page.goto(url);
  await demoLogin(page, 'Chị Nốc');
  const out = {};
  for (const t of TABS) {
    await page.locator('[data-tab="' + t + '"]').click();
    await expect(page.locator('#main .loading')).toHaveCount(0);
    await page.waitForTimeout(600);
    // bỏ phần mã QR (vẽ không đồng bộ) và giờ hiện tại
    out[t] = (await page.locator('#main').innerText()).replace(/Đang tạo mã…\n?/g, '');
  }
  return out;
}

test('7 tab Quản lý: bản React giống bản cũ', async ({ page }) => {
  const errs = watchErrors(page);
  const react = await grab(page, '/quanly.html');
  const legacy = await grab(page, '/quanly.html?cu=1');
  for (const t of TABS) expect.soft(react[t], 'tab ' + t).toBe(legacy[t]);
  expect(errs).toEqual([]);
});
