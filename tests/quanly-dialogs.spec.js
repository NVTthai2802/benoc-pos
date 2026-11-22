// Hộp thoại trang Quản lý bản React phải giống bản cũ (?cu=1): chữ, giá trị các ô, ô nào đang ẩn,
// và lỗi khi bấm Lưu thiếu thông tin. Không bấm Lưu thật (trừ khi bước ghi rõ) để dữ liệu mẫu giữ nguyên.
import { test, expect } from '@playwright/test';
import { watchErrors, demoLogin } from './helpers.js';
import { STEPS } from './dialog-steps.js';

async function sheetState(page, wait = 250) {
  await page.waitForTimeout(wait);
  return page.evaluate(() => {
    const sh = document.getElementById('bnSheet');
    const fields = [...sh.querySelectorAll('input,select,textarea')].map(el => [el.id || el.name || el.dataset.f || el.type, el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value, !!el.closest('[hidden]')].join('|'));
    const pressed = [...sh.querySelectorAll('[aria-pressed]')].map(b => b.textContent.trim() + '=' + b.getAttribute('aria-pressed').replace('null', 'false'))  // bản cũ ghi "null" khi chưa chọn;
    return { text: sh.innerText.replace(/\s+/g, ' ').replace(/Lấy mã kết nối \d{6}/, 'Lấy mã kết nối ######').trim(), fields, pressed };
  });
}

async function run(page, base) {
  await page.goto(base);
  await demoLogin(page, 'Chị Nốc');
  const out = {};
  for (const st of STEPS) {
    await page.locator('[data-tab="' + st.tab + '"]').click();
    await expect(page.locator('#main .loading')).toHaveCount(0);
    if (st.sub) await page.locator('#main .ptitle .chipbtn', { hasText: st.sub }).click();
    if (st.sub2) await page.locator('#main .seg2 button, #main .chipbtn', { hasText: st.sub2 }).first().click();
    await page.waitForTimeout(300);
    const opener = page.locator(st.open).nth(st.nth || 0);
    if (!(await opener.count())) { out[st.name] = 'không có ' + st.open; continue; }
    await opener.click();
    await expect(page.locator('#bnOverlay')).toBeVisible();
    out[st.name] = await sheetState(page, 600);
    for (const [i, act] of (st.then || []).entries()) {
      const [kind, sel, val] = act;
      const loc = page.locator('#bnSheet ' + sel).first();
      if (kind === 'click') await loc.click({ timeout: 5000 });
      else if (kind === 'check') await loc.check({ force: true });
      else if (kind === 'fill') await loc.fill(val);
      else if (kind === 'select') await loc.selectOption(val);
      out[st.name + '#' + i] = await sheetState(page);
    }
    if (await page.locator('#bnOverlay').isVisible()) { await page.locator('#bnSheet [data-close]').first().click(); }
    await expect(page.locator('#bnOverlay')).toBeHidden();
  }
  return out;
}

test('hộp thoại Quản lý: React giống bản cũ', async ({ page }) => {
  test.setTimeout(180_000);
  const errs = watchErrors(page);
  const react = await run(page, '/quanly.html');
  const legacy = await run(page, '/quanly.html?cu=1');
  for (const k of Object.keys(legacy)) {
    const a = react[k], b = legacy[k];
    expect.soft(typeof b, k + ' mở được').toBe('object');
    if (typeof b === 'string' || typeof a === 'string') { expect.soft(a, k).toBe(b); continue; }
    expect.soft(a.text, k + ' chữ').toBe(b.text);
    expect.soft(a.fields, k + ' các ô').toEqual(b.fields);
    expect.soft(a.pressed, k + ' nút chọn').toEqual(b.pressed);
  }
  console.log(Object.keys(legacy).length + ' trạng thái hộp thoại đã so; ví dụ: ' + Object.keys(legacy).join(', '));
  expect(errs).toEqual([]);
});
