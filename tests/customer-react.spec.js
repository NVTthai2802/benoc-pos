// Trang khách bản React phải hiện đúng như bản cũ (?cu=1): menu, ưu đãi, vé số, hộp thoại món / ưu đãi / giỏ, trạng thái đơn
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers.js';

const norm = s => s.replace(/\s+/g, ' ').replace(/\bBN[0-9A-F]{6}\b/g, 'BNxxxxxx').trim();

async function snap(browser, q) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  const sheet = async () => { await expect(page.locator('#bnOverlay')).toBeVisible(); await page.waitForTimeout(150); return norm(await page.locator('#bnSheet').innerText()); };
  const close = async () => { await page.locator('#bnSheet [data-close]').first().click(); await expect(page.locator('#bnOverlay')).toBeHidden(); };
  await page.goto('/index.html?ban=5' + q);
  await expect(page.locator('#menuList .item').first()).toBeVisible();
  await page.waitForTimeout(300);
  const out = {
    menu: norm(await page.locator('#menuList').innerText()),
    promos: norm(await page.locator('#promos').innerText()),
    ticket: norm(await page.locator('#ticket').innerText()),
    tabs: norm(await page.locator('#tabsIn').innerText()),
    chip: norm(await page.locator('#chip').innerText())
  };
  // Món có tuỳ chọn
  await page.locator('.item:has(.item-opts) .item-main').first().click();
  out.item = await sheet();
  await page.locator('#bnSheet [data-q="1"]').click();
  out.itemQty = norm(await page.locator('#itAdd').innerText());
  await page.locator('#itAdd').click();
  await expect(page.locator('#bnOverlay')).toBeHidden();
  // Ưu đãi đầu tiên bấm được
  const pr = page.locator('#promos button.pr-card').first();
  if (await pr.count()) { await pr.click(); out.promo = await sheet(); await close(); }
  // Tìm kiếm
  await page.locator('#mSearch').fill('zzzz');
  out.searchEmpty = norm(await page.locator('#mEmpty').innerText());
  await page.locator('#mSearch').fill('');
  // Giỏ
  await page.locator('[aria-label^="Thêm Khoai lang kén"]').click();
  out.cartBar = norm(await page.locator('#cartBtn').innerText());
  await page.locator('#cartBtn').click();
  out.cart = await sheet();
  await page.locator('#cName').fill('TEST – Claude so khớp');
  await page.locator('#cPhone').fill('0912');
  await page.locator('#cSend').click();
  out.badPhone = norm(await page.locator('#cMsg').innerText());
  await page.locator('#cPhone').fill('0912345678');
  await page.locator('#cSend').click();
  await expect(page.locator('#statusView')).toContainText('Đang chờ');
  if (await page.locator('#bnOverlay').isVisible()) { out.payNow = await sheet(); await close(); }
  out.status = norm(await page.locator('#statusView').innerText());
  await page.locator('#stMore').click();
  out.banner = norm(await page.locator('#banner').innerText());
  // Trang tạo đơn giao hàng
  await page.goto('/index.html?dat=giao' + q);
  await expect(page.locator('#menuList .item').first()).toBeVisible();
  await page.waitForTimeout(300);
  out.giao = norm(await page.locator('#ticket').innerText());
  await ctx.close();
  return { out, errs };
}

test('trang khách: React giống bản cũ', async ({ browser }) => {
  const r = await snap(browser, '');
  const l = await snap(browser, '&cu=1');
  for (const k of Object.keys(l.out)) expect.soft(r.out[k], k).toBe(l.out[k]);
  expect(r.errs).toEqual([]);
  expect(l.errs).toEqual([]);
});
