/* Ghi lại lỗi JS của trang để test báo hỏng */
export function watchErrors(page) {
  const errs = [];
  page.on('pageerror', e => errs.push(e.message + ' @ ' + page.url() + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  return errs;
}
/* Bản xem thử: chọn tài khoản mẫu ở màn đăng nhập (Chị Nốc = chủ quán, Máy bếp, Máy pha chế, Lan / Minh = nhân viên) */
export async function demoLogin(page, name) {
  // Đã đăng nhập sẵn (phiên lưu trong trình duyệt) thì bỏ qua
  const pick = page.getByRole('button', { name: new RegExp(name) }).first();
  const ready = page.locator('[data-tab], #cols, .topbar').first();
  await Promise.race([pick.waitFor(), ready.waitFor()]);
  if (await pick.isVisible()) await pick.click();
}
export const text = async loc => (await loc.innerText()).replace(/\s+/g, ' ');
