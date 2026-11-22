// Địa chỉ in phiếu: chủ quán sửa trong Cài đặt → máy bếp đọc lại và in đầu phiếu
import { test, expect } from '@playwright/test';
import { demoLogin } from './helpers.js';
test('phiếu mới + địa chỉ in', async ({ page }) => {
  // Chủ quán sửa địa chỉ in trong Cài đặt
  await page.goto('/quanly.html'); await demoLogin(page, 'Chị Nốc');
  await page.locator('[data-tab="caidat"]').click();
  await page.fill('#sAddr', 'Số 5 An Khánh, Hoài Đức'); await page.fill('#sPhone', '0345 678 910');
  await page.click('#sSave'); await page.waitForTimeout(800);
  expect(await page.evaluate(async () => { const s = await BN.api.settings(); return [s.print_address, s.print_phone]; })).toEqual(['Số 5 An Khánh, Hoài Đức', '0345 678 910']);
  // Máy bếp đọc lại và in phiếu
  await page.goto('/bep.html');
  await page.waitForFunction(() => window.BNPrint && BN.loadShop);
  const url = await page.evaluate(async () => { await BN.loadShop(); const x = { o: { id: 'x', dine_type: 'tai_quan', queue_number: 12, customer_name: 'Minh Anh', customer_phone: '0912345678', created_at: new Date().toISOString(), note: 'Ra món ăn trước' },
    items: [{ item_name: 'Cơm heo chua ngọt', category_name: 'Cơm trộn', qty: 2, unit_price: 40000, options: [{ group: 'Topping thêm', choice: 'Trứng ốp la' }], note: 'ít cay' }, { item_name: 'Kimbap chiên', category_name: 'Kimbap', qty: 1, unit_price: 25000, options: [] }] };
    return [BN.SHOP.address, BNPrint.ticketCanvas(x.o, x.items, {}, Object.assign(BNPrint.get(), { width: 58 })).toDataURL()]; });
  expect(url[0]).toBe('Số 5 An Khánh, Hoài Đức');
  expect(url[1].length).toBeGreaterThan(1000);
});
