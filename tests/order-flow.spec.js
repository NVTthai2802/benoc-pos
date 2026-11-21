// Luồng chính của quán: khách gọi món → bếp nhận → ra món → thu tiền → hoá đơn hiện ở Quản lý
import { test, expect } from '@playwright/test';
import { watchErrors, demoLogin } from './helpers.js';

test('khách đặt → bếp nhận → ra món → thu tiền mặt → có hoá đơn', async ({ page }) => {
  const errs = watchErrors(page);
  const NAME = 'Khách E2E ' + Date.now().toString().slice(-4);

  // Khách quét mã bàn 5, gọi 1 món không tuỳ chọn
  await page.goto('/index.html?ban=5');
  await page.locator('[aria-label^="Thêm Khoai lang kén"]').click();
  await page.locator('#cartBtn').click();
  await page.locator('#cName').fill(NAME);
  await page.locator('#cPhone').fill('0912345678');
  await page.locator('#cSend').click();
  await expect(page.locator('#statusView')).toContainText('Đang chờ bếp nhận đơn');
  await expect(page.locator('#statusView')).toContainText('25.000đ');

  // Bếp
  await page.goto('/bep.html');
  await demoLogin(page, 'Máy bếp');
  const card = () => page.locator('article, li, section, div').filter({ hasText: NAME }).filter({ has: page.locator('button') }).last();
  await expect(card()).toContainText('Khoai lang kén');
  await card().getByRole('button', { name: 'Nhận đơn' }).click();
  await expect(card().getByRole('button', { name: /Ra món/ })).toBeVisible();
  await card().getByRole('button', { name: /Ra món/ }).click();
  await card().getByRole('button', { name: /Thanh toán/ }).click();
  await card().locator('[data-act="pay-ok"][data-m="tien_mat"]').click();
  await expect(page.locator('body')).not.toContainText(NAME, { timeout: 10_000 });

  // Quản lý: hoá đơn hôm nay có đơn vừa thu
  await page.goto('/quanly.html#doanhthu');
  await demoLogin(page, 'Chị Nốc');
  await expect(page.locator('#invBox')).toContainText(NAME);
  await expect(page.locator('#invBox')).toContainText('Tiền mặt');

  expect(errs).toEqual([]);
});
