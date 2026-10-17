/* Đăng nhập dùng chung cho màn hình bếp và trang quản lý */
(function () {
'use strict';
const { api, ui, esc, errText, DEMO } = BN;
const ROLE = { owner: 'Chủ quán', staff: 'Nhân viên', kitchen: 'Máy bếp' };

/* Hiện màn hình đăng nhập vào `root` nếu chưa đăng nhập; khi xong gọi onReady(session) */
async function requireLogin(root, opts) {
  let s = null;
  try { s = await api.session(); } catch (e) { s = null; }
  if (s && s.employee) { opts.onReady(s); return; }
  if (DEMO) {
    // Nút đổi vai trên thanh test mang sẵn tài khoản (?as=...) để vào thẳng
    const as = BN.PARAMS.get('as');
    if (as) { const s2 = await api.demoLogin(as); if (s2 && s2.employee) { opts.onReady(s2); return; } }
    return demoPicker(root, opts);
  }
  let owner = true;
  try { owner = await api.hasOwner(); } catch (e) { root.innerHTML = '<div class="wrap login"><p class="msg">Không kết nối được máy chủ. Kiểm tra mạng và cấu hình Supabase trong config.js.</p></div>'; return; }
  if (s && !s.employee) {
    root.innerHTML = '<div class="wrap login"><div class="login-card"><h1>Bé Nốc</h1><p class="msg">' + esc(BN.ERR.NOT_EMPLOYEE) + '</p><button class="btn" id="lgOut" type="button">Đăng xuất</button></div></div>';
    root.querySelector('#lgOut').onclick = async () => { await api.signOut(); location.reload(); };
    return;
  }
  owner ? loginForm(root, opts) : ownerSetup(root, opts);
}

function loginForm(root, opts) {
  root.innerHTML = '<div class="wrap login"><form class="login-card" id="lgForm" novalidate>' +
    '<h1>Bé Nốc</h1><h2>' + esc(opts.title || 'Đăng nhập') + '</h2><p>Đăng nhập bằng số điện thoại chủ quán đã tạo cho bạn.</p>' +
    '<label class="field" for="lgPhone">Số điện thoại<input id="lgPhone" inputmode="tel" autocomplete="username" required></label>' +
    '<label class="field" for="lgPass">Mật khẩu<input id="lgPass" type="password" autocomplete="current-password" required></label>' +
    '<p class="msg" id="lgMsg" hidden></p><button class="btn btn-block" type="submit" id="lgBtn">Đăng nhập</button></form></div>';
  const f = root.querySelector('#lgForm');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = f.querySelector('#lgMsg'), btn = f.querySelector('#lgBtn'); msg.hidden = true; btn.disabled = true;
    try { const s = await api.signIn(f.querySelector('#lgPhone').value, f.querySelector('#lgPass').value); if (!s || !s.employee) BN.fail('NOT_EMPLOYEE'); opts.onReady(s); }
    catch (err) { msg.textContent = errText(err); msg.hidden = false; btn.disabled = false; }
  });
}

function ownerSetup(root, opts) {
  root.innerHTML = '<div class="wrap login"><form class="login-card" id="ownForm" novalidate>' +
    '<h1>Bé Nốc</h1><h2>Cài đặt lần đầu</h2><p>Hệ thống chưa có chủ quán. Tạo tài khoản chủ quán để bắt đầu. Bước này chỉ làm một lần.</p>' +
    '<label class="field" for="owName">Tên của bạn<input id="owName" autocomplete="name" required></label>' +
    '<label class="field" for="owPhone">Số điện thoại (dùng để đăng nhập)<input id="owPhone" inputmode="tel" autocomplete="username" required></label>' +
    '<label class="field" for="owPass">Mật khẩu (ít nhất 6 ký tự)<input id="owPass" type="password" autocomplete="new-password" required></label>' +
    '<p class="msg" id="owMsg" hidden></p><button class="btn btn-block" type="submit" id="owBtn">Tạo tài khoản chủ quán</button></form></div>';
  const f = root.querySelector('#ownForm');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = f.querySelector('#owMsg'), btn = f.querySelector('#owBtn'); msg.hidden = true; btn.disabled = true;
    try { const s = await api.setupOwner(f.querySelector('#owName').value, f.querySelector('#owPhone').value.replace(/\D/g, ''), f.querySelector('#owPass').value); opts.onReady(s); }
    catch (err) { msg.textContent = errText(err); msg.hidden = false; btn.disabled = false; }
  });
}

async function demoPicker(root, opts) {
  const emps = (await api.employees()).filter(e => e.is_active && (!opts.roles || opts.roles.indexOf(e.role) >= 0));
  root.innerHTML = '<div class="wrap login"><div class="login-card"><h1>Bé Nốc</h1><h2>' + esc(opts.title || 'Đăng nhập') + '</h2>' +
    '<p>Bản xem thử: chọn một tài khoản mẫu để vào. Bản thật đăng nhập bằng số điện thoại và mật khẩu.</p>' +
    emps.map(e => '<button class="acct" type="button" data-emp="' + esc(e.id) + '"><b>' + esc(e.full_name) + '</b><span class="pill pill-mute">' + esc(ROLE[e.role]) + '</span></button>').join('') + '</div></div>';
  root.querySelectorAll('[data-emp]').forEach(b => b.onclick = async () => opts.onReady(await api.demoLogin(b.dataset.emp)));
}

function whoChip(s) {
  const r = ROLE[s.employee.role], same = r === s.employee.full_name;
  return '<span class="who-chip"><b>' + esc(s.employee.full_name) + '</b>' + (same ? '' : ' · ' + esc(r)) + ' <button class="link" type="button" data-logout>Đăng xuất</button></span>';
}
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-logout]')) return;
  await api.signOut();
  // Bản xem thử: bỏ ?as= để không tự đăng nhập lại, giữ vai (slot) hiện tại
  if (DEMO) location.replace(location.pathname + '?slot=' + encodeURIComponent(BN.SLOT)); else location.reload();
});

BN.staff = { requireLogin, whoChip, ROLE };
})();
