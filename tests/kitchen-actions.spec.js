// Thao tác trên màn Bếp (bản React): sửa số lượng, thêm món, đổi tuỳ chọn, thu tiền có tiền thối, huỷ đơn
import { test, expect } from '@playwright/test';
import { watchErrors, demoLogin } from './helpers.js';

async function newOrder(page, name, aria) {
  await page.goto('/index.html?ban=7');
  await page.locator('[aria-label^="' + aria + '"]').click();
  await page.locator('#cartBtn').click();
  await page.locator('#cName').fill(name);
  await page.locator('#cPhone').fill('0912345678');
  await page.locator('#cSend').click();
  await expect(page.locator('#statusView')).toContainText(name);
}
const cardOf = (page, name) => page.locator('#cols .kc').filter({ hasText: name }).first();

test('sửa đơn, thêm món, thu tiền có tiền thối, huỷ', async ({ page }) => {
  const errs = watchErrors(page);
  const NAME = 'Sửa E2E ' + Date.now().toString().slice(-4);
  await newOrder(page, NAME, 'Thêm Khoai lang kén');
  await page.goto('/bep.html');
  await demoLogin(page, 'Máy bếp');
  const card = () => cardOf(page, NAME);
  await expect(card()).toContainText('25.000đ');

  // Sửa đơn: +1 khoai → 50.000đ
  await card().getByRole('button', { name: 'Sửa đơn', exact: true }).click();
  await card().getByRole('button', { name: 'Thêm 1 Khoai lang kén' }).click();
  await expect(card().locator('.kc-total')).toContainText('50.000đ');

  // Thêm món mới có tuỳ chọn qua "+ Thêm món"
  await card().getByRole('button', { name: '+ Thêm món' }).click();
  await page.locator('#pkQ').fill('kimbap thuong');
  await page.locator('.pk-item').filter({ hasText: 'Kimbap thường' }).first().click();
  await expect(page.locator('#bnSheet')).toContainText('Thêm vào đơn');
  await page.locator('#bnSheet').getByRole('button', { name: 'Thêm vào đơn' }).click();
  await expect(card()).toContainText('Kimbap thường');
  await expect(card().locator('.kc-total')).toContainText('72.000đ');
  await card().getByRole('button', { name: 'Xong' }).click();

  // Thu tiền: chọn 100.000đ → tiền thối 28.000đ, rồi Thôi
  await card().getByRole('button', { name: 'Thu tiền', exact: true }).click();
  await card().getByRole('button', { name: '100.000đ' }).click();
  await expect(card().locator('.change')).toContainText('28.000đ');
  await card().locator('.panel').getByRole('button', { name: 'Thôi' }).click();

  // Huỷ đơn
  await card().getByRole('button', { name: 'Huỷ', exact: true }).click();
  await card().getByRole('button', { name: 'Huỷ đơn' }).click();
  await expect(page.locator('#cols')).not.toContainText(NAME);
  expect(errs).toEqual([]);
});

test('nhận đơn → +5 phút → ra món → thu trước bằng QR (chuyển khoản)', async ({ page }) => {
  const errs = watchErrors(page);
  const NAME = 'QR E2E ' + Date.now().toString().slice(-4);
  await newOrder(page, NAME, 'Thêm Khoai lang kén');
  await page.goto('/bep.html');
  await demoLogin(page, 'Máy bếp');
  const card = () => cardOf(page, NAME);
  await card().getByRole('button', { name: 'Nhận đơn', exact: true }).click();
  await expect(card().getByRole('button', { name: '+5 phút' })).toBeVisible();
  await card().getByRole('button', { name: '+5 phút' }).click();
  await card().getByRole('button', { name: 'Thu tiền', exact: true }).click();
  await card().getByRole('button', { name: 'QR chuyển khoản' }).click();
  await expect(card().locator('.vqr')).toBeVisible();
  await card().getByRole('button', { name: 'Đã nhận chuyển khoản' }).click();
  await expect(card()).toContainText('Đã thu 25.000đ');
  await card().getByRole('button', { name: 'Ra món' }).click();
  await expect(page.locator('#cols')).not.toContainText(NAME, { timeout: 10_000 });
  expect(errs).toEqual([]);
});
