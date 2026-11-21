// Mọi trang mở được, không có lỗi JS
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers.js';

for (const path of ['/index.html?ban=5', '/index.html', '/bep.html', '/phache.html', '/quanly.html', '/maytem.html', '/chinh-sach.html']) {
  test('mở ' + path, async ({ page }) => {
    const errs = watchErrors(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    expect(errs).toEqual([]);
  });
}

test('trang khách hiện menu và ưu đãi', async ({ page }) => {
  await page.goto('/index.html?ban=5');
  await expect(page.locator('[data-add]').first()).toBeVisible();
  expect(await page.locator('[data-add]').count()).toBeGreaterThan(20);
  await expect(page.getByText('Bàn').first()).toBeVisible();
});
