/* =====================================================================
   IN PHIẾU MÓN + TEM DÁN LY (máy in nhiệt Bluetooth trên Android)
   - Mỗi điện thoại cài 2 việc độc lập: PHIẾU MÓN và TEM DÁN LY (mỗi việc bật / tắt riêng).
     Ví dụ quầy pha chế 1 điện thoại: phiếu qua RawBT (máy MPT-II) + tem Bluetooth
     trực tiếp (máy CLABEL CT221B) → bấm Nhận đơn là cả hai máy cùng in.
   - Chỉ in khi có người bấm "Nhận đơn" (không in đơn ảo khách vừa gửi).
     Máy bấm Nhận đơn in ngay; các máy khác của cùng nơi tự in khi thấy đơn
     vừa được nhận (mỗi máy chỉ in một lần cho mỗi lần nhận).
   - Phiếu / tem vẽ thành ảnh (tiếng Việt có dấu luôn đúng), gửi sang máy in bằng:
       * RawBT: app trên Android, nối Bluetooth với MỘT máy in mặc định.
       * Bluetooth trực tiếp: Chrome nối thẳng máy in tem (BLE), lệnh TSPL.
       * Trình duyệt: hộp thoại in của Android.
   - Cài đặt lưu riêng trên từng máy.
   ===================================================================== */
(function () {
'use strict';
const { esc, hhmm, store, ui, sizeOf, isSizeOpt, sizeText, isTakeaway, isDelivery } = BN; // (không in mã đơn)
const money = n => Math.round(Number(n) || 0).toLocaleString('vi-VN') + 'đ';
const STATION = window.BENOC_STATION || 'bep';
const KEY = 'printer.' + STATION;
/* mode = cách in phiếu món, tmode = cách in tem dán ly ('off' | 'rawbt' | 'ble' | 'browser') */
const DEF = { mode: 'off', width: 58, copies: 1, big: true, tmode: 'off', label: '40x30', lang: 'tspl', inv: false, offx: 0, offy: 0, auto: true, qr: true };
function get() {
  const raw = store.get(KEY, {}), s = Object.assign({}, DEF, raw);
  if (raw.job) { if (raw.job === 'tem') { s.tmode = raw.mode || 'off'; s.mode = 'off'; } delete s.job; } // cài đặt bản trước (1 việc / máy)
  return s;
}
const save = s => store.set(KEY, s);
const DOTS = { 58: 384, 80: 576 };   // số chấm in mỗi dòng
const HEAD = 384;                    // bề rộng đầu in máy tem 2 inch (48 mm)
/* Khổ tem (máy 203 dpi = 8 chấm/mm). "58" = cuộn giấy dán liên tục 58 mm, mỗi tem cao 30 mm */
const LABELS = { '40x30': { w: 40, h: 30, gap: 2 }, '50x30': { w: 50, h: 30, gap: 2 }, '50x40': { w: 50, h: 40, gap: 2 }, '58': { w: 48, h: 30, gap: 0, roll: true } };
const labelOf = set => LABELS[set.label] || LABELS['40x30'];
const jobs = set => [set.mode !== 'off' && 'phieu', set.tmode !== 'off' && 'tem'].filter(Boolean);

/* ---------- Mã QR chuyển khoản in cuối phiếu ----------
   Phiếu vẽ đồng bộ nên tải sẵn thư viện QR khi mở trang; chưa tải xong thì phiếu in không có mã. */
const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
if (BN.FEATURES.vietqr && BN.loadScript) { BN.loadScript(QR_LIB).catch(() => {}); if (BN.loadBank) BN.loadBank(); }
/* Ma trận ô đen/trắng của mã QR (null nếu chưa có thư viện) */
function qrMatrix(text) {
  if (!window.QRCode) return null;
  const box = document.createElement('div');
  try {
    const q = new window.QRCode(box, { text, width: 64, height: 64, correctLevel: window.QRCode.CorrectLevel.M })._oQRCode;
    const n = q.getModuleCount(), m = [];
    for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(q.isDark(r, c)); m.push(row); }
    return m;
  } catch (e) { return null; }
}

/* ---------- Vẽ phiếu ---------- */
function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/), lines = []; let cur = '';
  words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } });
  if (cur) lines.push(cur);
  return lines;
}
/* o: đơn; items: món của nơi này; extra: { minutes, station, reprint } */
function ticketCanvas(o, items, extra, set) {
  set = set || get(); extra = extra || {};
  // Lề hai bên rộng hơn (giấy cuộn nhỏ, đầu in hay mờ ở mép), chữ nhỏ lại, dòng thưa hơn cho dễ đọc
  const W = DOTS[set.width] || 384, pad = Math.round(W * 0.04), k = W / 384 * (set.big ? 1.08 : 1), IW = W - pad * 2, LH = 1.42;
  const F = (px, b) => (b ? '800 ' : '500 ') + Math.round(px * k) + 'px "Be Vietnam Pro", "Roboto", sans-serif';
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  const ops = []; let y = pad;
  const put = (t, px, bold, align, x) => ops.push({ t, font: F(px, bold), y: y + px * k, align: align || 'left', x });
  const text = (t, px, bold, align, gap) => { ctx.font = F(px, bold); wrap(ctx, t, IW).forEach(l => { put(l, px, bold, align); y += px * k * LH; }); y += (gap || 0) * k; };
  const rule = (dash) => { y += 4 * k; ops.push({ rule: true, y: Math.round(y), dash }); y += 10 * k; };
  const gap = n => { y += n * k; };
  // Hai cột trái / phải; không đủ chỗ thì số tiền xuống dòng dưới (không đè chữ)
  const pair = (l, r, px, bold) => {
    ctx.font = F(px, bold); const fit = ctx.measureText(l).width + ctx.measureText(r).width + 12 * k <= IW;
    put(l, px, bold, 'left'); if (!fit) { y += px * k * LH; } put(r, px, bold, 'right'); y += px * k * LH;
  };
  const lineAmt = i => i.amount != null ? i.amount : (i.unit_price || 0) * i.qty;

  /* ===== PHẦN BẾP: nơi ăn, khách, giờ ===== */
  text('BÉ NỐC', 18, true, 'center', 2);
  const at = o.deliver_at ? ' · ' + hhmm(o.deliver_at) : '';
  const at2 = o.deliver_at ? ' ' + hhmm(o.deliver_at) : '';
  const where = isDelivery(o) ? 'GIAO' + (at2 || ' HÀNG') : o.pickup ? 'ĐẾN LẤY' + at2 : isTakeaway(o) ? 'MANG VỀ' : o.queue_number == null ? 'ĂN TẠI QUÁN' + at : 'BÀN ' + o.queue_number;
  text(where, 36, true, 'center', 2);
  if (o.source === 'fb') text('ĐƠN ONLINE', 20, true, 'center');
  if (isDelivery(o) && o.address) text(o.address, 20, true, 'center');
  if (o.customer_name) text(o.customer_name, 26, true, 'center');
  if (o.customer_phone) text(o.customer_phone, 20, true, 'center');
  text('Đặt ' + hhmm(o.created_at) + ' · Nhận ' + hhmm(Date.now()) + (extra.reprint ? ' · IN LẠI' : ''), 18, false, 'center');
  if (extra.full) text('PHIẾU TỔNG CẢ ĐƠN', 20, true, 'center');
  rule(false);

  /* ===== MÓN: số lượng bên trái, tên món, tiền bên phải; tuỳ chọn thụt vào ===== */
  let lastGroup = null, count = 0;
  items.forEach((i, idx) => {
    if (i.promo_group && i.promo_group !== lastGroup) text('[' + (i.promo_kind === 'combo' ? 'COMBO' : 'ƯU ĐÃI') + '] ' + (i.promo_name || ''), 18, true, 'left', 2);
    lastGroup = i.promo_group || null; count += i.qty;
    const sz = sizeOf(i.options), opts = (i.options || []).filter(x => !isSizeOpt(x));
    const amt = lineAmt(i), price = i.promo_part === 'tang' && !amt ? 'Tặng' : money(amt);
    ctx.font = F(26, true); const qw = ctx.measureText('9x ').width;
    ctx.font = F(20, true); const pw = ctx.measureText(price).width + 10 * k;
    ctx.font = F(26, true);
    wrap(ctx, i.item_name + (sz ? ' · ' + sizeText(sz) : ''), IW - qw - pw).forEach((l, n) => {
      if (n === 0) { put(i.qty + 'x', 26, true, 'left'); ops.push({ t: price, font: F(20, true), y: y + 26 * k, align: 'right' }); }
      put(l, 26, true, 'left', pad + qw); y += 26 * k * 1.32;
    });
    const sub = (t, px, b) => { ctx.font = F(px, b); wrap(ctx, t, IW - qw).forEach(l => { put(l, px, b, 'left', pad + qw); y += px * k * LH; }); };
    const rest = opts.filter(x => !/topping/i.test(x.group || '')).map(x => x.choice);
    const tops = opts.filter(x => /topping/i.test(x.group || '')).map(x => '+ ' + x.choice);
    if (rest.length) sub(rest.join(', '), 20, false);
    if (tops.length) sub(tops.join('  '), 20, true);
    if (i.note) sub('* ' + i.note, 20, true);
    if (i.qty > 1 && amt) { put(i.qty + ' x ' + money(amt / i.qty), 17, false, 'right'); y += 17 * k * LH; }
    gap(idx < items.length - 1 ? 10 : 2);
  });
  if (o.note) { rule(true); text('GHI CHÚ: ' + o.note, 20, true, 'left'); }

  /* ===== PHẦN TIỀN ===== */
  rule(false);
  const sum = items.reduce((t, i) => t + lineAmt(i), 0);
  const total = o.total != null ? o.total : sum, paid = o.paid_amount || 0, due = Math.round(total - paid);
  if (total !== sum) pair((extra.full ? 'Cộng món' : 'Món phiếu này') + ' (' + count + ')', money(sum), 20);
  pair(total !== sum ? 'TỔNG ĐƠN' : 'TỔNG (' + count + ' món)', money(total), 26, true);
  if (o.paid_amount != null && paid > 0 && paid < total) pair('Đã trả', money(paid), 20);
  gap(4);
  const how = o.paid_method === 'chuyen_khoan' ? 'Chuyển khoản' : o.paid_method === 'tien_mat' ? 'Tiền mặt' : '';
  if (o.paid_amount == null || paid <= 0) text('CHƯA THANH TOÁN', 24, true, 'center');
  else if (paid >= total) { text('ĐÃ THANH TOÁN', 24, true, 'center'); if (how) text(how, 20, true, 'center'); }
  else text('CÒN THU ' + money(due), 24, true, 'center');

  /* ===== MÃ QR: chỉ khi còn phải thu, đúng số tiền còn thu của cả đơn ===== */
  const qm = set.qr !== false && BN.FEATURES.vietqr && due > 0 && o.id ? qrMatrix(BN.vietQR(due, BN.qrNoteFor(o))) : null;
  if (qm) {
    rule(true);
    text('Quét mã chuyển khoản ' + money(due), 20, true, 'center', 6);
    const n = qm.length, cell = Math.max(3, Math.floor(Math.min(IW * 0.72, 230 * k) / n)), size = cell * n;
    ops.push({ qr: qm, x: Math.round((W - size) / 2), y: Math.round(y), cell }); y += size + 10 * k;
    const B = BN.BANK;
    text(B.bank + (B.holder ? ' · ' + B.holder : ''), 17, true, 'center');
  }
  gap(6);
  text('Cảm ơn bạn, hẹn gặp lại!', 18, false, 'center');
  y += 6 * k;

  cv.width = W; cv.height = Math.ceil(y);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, cv.height); ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
  ops.forEach(op => {
    if (op.qr) { op.qr.forEach((row, r) => row.forEach((d, c) => { if (d) ctx.fillRect(op.x + c * op.cell, op.y + r * op.cell, op.cell, op.cell); })); return; }
    if (op.rule) { ctx.lineWidth = 2; ctx.setLineDash(op.dash ? [6, 6] : []); ctx.beginPath(); ctx.moveTo(pad, op.y); ctx.lineTo(W - pad, op.y); ctx.stroke(); ctx.setLineDash([]); return; }
    ctx.font = op.font; ctx.textAlign = op.align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(op.t, op.x != null ? op.x : op.align === 'center' ? W / 2 : op.align === 'right' ? W - pad : pad, op.y);
  });
  return cv;
}

/* ---------- Ảnh → lệnh ESC/POS (GS v 0) ----------
   Máy in nhiệt rẻ (MPT-II…) qua Bluetooth không chặn luồng: gửi nhiều dữ liệu liền một lúc thì
   bộ nhớ máy tràn, rơi mất vài byte → máy in phần ảnh còn lại thành chữ rác (phiếu dài hay bị).
   Nên: hàng trắng không gửi ảnh mà đẩy giấy (ESC J), bỏ cột trắng bên phải, mỗi lệnh ảnh tối đa
   24 hàng (≈1 KB) → ít dữ liệu hơn nhiều, và nếu có rơi byte thì chỉ hỏng một dải nhỏ. */
const BAND = 24;
function escpos(cv, copies) {
  const b = bits(cv), bw = b.bw, H = b.H;
  const right = r => { for (let c = bw - 1; c >= 0; c--) if (b.data[r * bw + c]) return c + 1; return 0; }; // số byte tới chấm đen cuối hàng
  // Khoảng trắng: gửi ảnh trắng rộng 1 byte (1 byte / hàng) thay cho ESC J — máy MPT-II đẩy giấy bằng ESC J bị hụt
  // nên các dòng chữ dính vào nhau. In ảnh thì máy đi giấy đúng từng chấm.
  const feed = (out, n) => { while (n > 0) { const h = Math.min(BAND * 4, n); out.push(0x1D, 0x76, 0x30, 0x00, 1, 0, h & 255, h >> 8); for (let i = 0; i < h; i++) out.push(0); n -= h; } };
  const body = [];
  let blank = 0;
  for (let y = 0; y < H;) {
    if (!right(y)) { blank++; y++; continue; }
    feed(body, blank); blank = 0;
    // Dải liên tiếp các hàng có mực, tối đa BAND hàng
    let y1 = y, wb = 0;
    while (y1 < H && y1 - y < BAND) { const r = right(y1); if (!r) break; wb = Math.max(wb, r); y1++; }
    const h = y1 - y;
    body.push(0x1D, 0x76, 0x30, 0x00, wb & 255, wb >> 8, h & 255, h >> 8);
    for (let r = y; r < y1; r++) for (let c = 0; c < wb; c++) body.push(b.data[r * bw + c]);
    y = y1;
  }
  feed(body, blank);
  const out = [0x1B, 0x40]; // ESC @ khởi động
  for (let c = 0; c < (copies || 1); c++) {
    for (let i = 0; i < body.length; i++) out.push(body[i]);
    out.push(0x1B, 0x64, 0x04); // đẩy giấy 4 dòng để xé (không gửi lệnh cắt: máy không có dao in ra chữ rác)
  }
  return new Uint8Array(out);
}
/* ---------- Tem dán ly: mỗi ly một tem ---------- */
/* Tách món thành từng ly: 3 x Trà đào → 3 tem 1/3, 2/3, 3/3 (đánh số trên cả đơn) */
function cups(items) {
  const out = [];
  items.forEach(i => { for (let n = 0; n < (i.qty || 1); n++) out.push(i); });
  return out.map((i, n) => ({ i, n: n + 1, of: out.length }));
}
const whereShort = o => isDelivery(o) ? 'SHIP' + (o.deliver_at ? ' ' + hhmm(o.deliver_at) : '') : o.pickup ? 'ĐẾN LẤY' + (o.deliver_at ? ' ' + hhmm(o.deliver_at) : '') : isTakeaway(o) ? 'MANG VỀ' : o.queue_number == null ? 'ĐẶT BÀN' + (o.deliver_at ? ' ' + hhmm(o.deliver_at) : '') : 'BÀN ' + o.queue_number;
/* Giá 1 ly: món đã gộp (amount = cả dòng) thì chia theo số ly; quà tặng in "Tặng" */
const cupPrice = i => { const v = i.amount != null ? i.amount / (i.qty || 1) : (i.unit_price || 0); return i.promo_part === 'tang' && !v ? 'Tặng' : money(v); };
function labelCanvas(o, cup, set) {
  set = set || get();
  // Đầu in máy tem 2 inch (CLABEL CT221B…) chỉ rộng 48 mm = 384 chấm: tem 50 mm thì phần quá 384 chấm bị mất.
  // Nội dung luôn nằm trong vùng in được; căn lề ngang dịch cả khối nội dung (không cắt ảnh).
  const L = labelOf(set), W = L.w * 8, H = L.h * 8, pad = 10, i = cup.i;
  const PW = Math.min(W, HEAD), dx = Math.round((set.offx || 0) * 8);
  // Khối chữ dịch theo căn lề; chạm mép vùng in thì khối hẹp lại (chữ tự xuống dòng) chứ không bị xén
  const X0 = Math.max(0, Math.min(PW - 80, pad + dx)), X1 = Math.min(PW, Math.max(X0 + 80, PW - pad + dx)), CW = X1 - X0;
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  cv.width = W; cv.height = H;
  const sz = sizeOf(i.options), opts = (i.options || []).filter(x => !isSizeOpt(x));
  const tops = opts.filter(x => /topping/i.test(x.group || '')).map(x => '+' + x.choice);
  const rest = opts.filter(x => !/topping/i.test(x.group || '')).map(x => x.choice);
  // Vẽ thử với cỡ chữ giảm dần đến khi vừa tem
  for (let k = 1; k >= 0.6; k -= 0.05) {
    const F = (px, b) => (b ? '800 ' : '600 ') + Math.round(px * k * PW / 320) + 'px "Be Vietnam Pro", "Roboto", sans-serif';
    const lh = px => px * k * PW / 320 * 1.2;
    const ops = []; let y = pad;
    const line = (t, px, b, max) => { ctx.font = F(px, b); let ls = wrap(ctx, t, CW); if (max && ls.length > max) { ls = ls.slice(0, max); ls[max - 1] += '…'; } ls.forEach(l => { y += lh(px); ops.push({ t: l, font: F(px, b), y: y - lh(px) * 0.2 }); }); };
    // Dòng đầu: bàn / mang về … bên trái, số ly bên phải
    ctx.font = F(30, true); y += lh(30);
    ops.push({ t: whereShort(o), font: F(30, true), y: y - lh(30) * 0.2 });
    ops.push({ t: cup.n + '/' + cup.of, font: F(26, true), y: y - lh(30) * 0.2, right: true });
    if (o.customer_name) line(o.customer_name, 20, true, 1);
    y += 4; ops.push({ rule: true, y }); y += 4;
    line(i.item_name + (sz ? ' · ' + sizeText(sz) : '') + (i.promo_part === 'tang' ? ' (TẶNG)' : ''), 26, true, 2);
    if (rest.length) line(rest.join(', '), 20, false, 2);
    if (tops.length) line(tops.join(' '), 20, true, 2);
    if (i.note) line('* ' + i.note, 20, true, 1);
    const TIN = 24; // giờ in lùi vào trong và lên trên 3 mm (mép tem hay bị xén)
    const fits = y <= H - pad - TIN - lh(22);
    if (!fits && k > 0.61) continue;
    // Dòng cuối: giá 1 ly (gồm size, topping) bên trái, giờ in bên phải
    ops.push({ t: cupPrice(i), font: F(22, true), y: H - pad - TIN });
    ops.push({ t: hhmm(Date.now()), font: F(18, true), y: H - pad - TIN, right: true, inset: TIN });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
    if (set.offy < 0) ctx.translate(0, Math.round(set.offy * 8)); // căn lề lên
    ops.forEach(op => {
      if (op.rule) { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X0, op.y); ctx.lineTo(X1, op.y); ctx.stroke(); return; }
      ctx.font = op.font; ctx.textBaseline = 'alphabetic'; ctx.textAlign = op.right ? 'right' : 'left';
      ctx.fillText(op.t, op.right ? X1 - (op.inset || 0) : X0, op.y);
    });
    break;
  }
  return cv;
}
/* Ảnh → hàng bit (1 = chấm đen) */
function bits(cv) {
  const W = cv.width, H = cv.height, px = cv.getContext('2d').getImageData(0, 0, W, H).data, bw = Math.ceil(W / 8), out = new Uint8Array(bw * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11 < 150) out[y * bw + (x >> 3)] |= 0x80 >> (x & 7); }
  return { bw, H, data: out };
}
const ascii = s => Array.from(s, c => c.charCodeAt(0));
/* Các dải hàng có mực: tách dải ở mỗi khe trắng; mỗi dải cắt bớt cột trắng hai bên */
function inkBands(b) {
  const rows = [];
  for (let r = 0; r < b.H; r++) { let c0 = -1, c1 = -1; for (let c = 0; c < b.bw; c++) if (b.data[r * b.bw + c]) { if (c0 < 0) c0 = c; c1 = c; } rows.push(c0 < 0 ? null : [c0, c1]); }
  const out = []; let cur = null, gap = 0;
  rows.forEach((v, r) => {
    if (!v) { if (cur && ++gap >= 2) { out.push(cur); cur = null; } return; }
    gap = 0;
    if (!cur) cur = { r0: r, r1: r, c0: v[0], c1: v[1] }; else { cur.r1 = r; cur.c0 = Math.min(cur.c0, v[0]); cur.c1 = Math.max(cur.c1, v[1]); }
  });
  if (cur) out.push(cur);
  return out;
}
/* Lệnh TSPL cho máy in tem (Xprinter, TSC, Gprinter…): mỗi tem một lần CLS / BITMAP / PRINT */
function tspl(cvs, set) {
  const L = labelOf(set), out = ascii('SIZE ' + L.w + ' mm,' + L.h + ' mm\r\nGAP ' + L.gap + ' mm,0 mm\r\nDIRECTION 1\r\nREFERENCE 0,0\r\n');
  const x = 0, y = Math.max(0, Math.round((set.offy || 0) * 8)); // căn lề ngang đã dịch trong ảnh tem (labelCanvas); dọc: dịch xuống ở đây
  cvs.forEach(cv => {
    const b = bits(cv);
    out.push(...ascii('CLS\r\n'));
    // Chỉ gửi những dải có chữ (bỏ phần trắng) → ít dữ liệu, in nhanh hơn nhiều qua Bluetooth.
    // TSPL: bit 0 = in đen (ngược với ESC/POS). "Đảo màu" (máy in ngược) thì gửi cả tem.
    const bands = set.inv ? [{ r0: 0, r1: b.H - 1, c0: 0, c1: b.bw - 1 }] : inkBands(b);
    bands.forEach(t => {
      const wb = t.c1 - t.c0 + 1, h = t.r1 - t.r0 + 1;
      out.push(...ascii('BITMAP ' + (x + t.c0 * 8) + ',' + (y + t.r0) + ',' + wb + ',' + h + ',0,'));
      for (let r = t.r0; r <= t.r1; r++) for (let c = t.c0; c <= t.c1; c++) { const v = b.data[r * b.bw + c]; out.push(set.inv ? v : (~v) & 255); }
      out.push(13, 10);
    });
    out.push(...ascii('PRINT 1,1\r\n'));
  });
  return new Uint8Array(out);
}
/* Tem bằng ESC/POS: cuộn 58 mm thì cách nhau một khoảng rồi cắt; giấy tem có khe thì đẩy tới tem sau (GS FF) */
function escposLabels(cvs, set) {
  const L = labelOf(set), out = [0x1B, 0x40];
  cvs.forEach((cv, n) => {
    const raw = escpos(cv, 1); // ESC @ + ảnh + đẩy giấy + cắt
    const body = Array.from(raw.subarray(2, raw.length - 7));
    out.push(...body);
    if (L.roll) out.push(0x1B, 0x64, 0x02); else out.push(0x1D, 0x0C);
  });
  if (L.roll) out.push(0x1B, 0x64, 0x02, 0x1D, 0x56, 0x42, 0x00);
  return new Uint8Array(out);
}
const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
/* Đường dẫn mở app RawBT (chưa cài thì Android mở cửa hàng Play để cài) */
const rawbtUrl = u8 => 'intent:base64,' + toB64(u8) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
const go = url => (window.BENOC_PRINT_HOOK || (u => { location.href = u; }))(url);

/* In bằng hộp thoại in của trình duyệt (khung ẩn, đúng khổ giấy) */
function browserPrint(imgs, page) {
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open(); d.write('<!doctype html><html><head><meta charset="utf-8"><style>@page{size:' + page.w + 'mm ' + (page.h ? page.h + 'mm' : 'auto') + ';margin:0}html,body{margin:0}img{width:' + page.w + 'mm;display:block' + (page.h ? ';height:' + page.h + 'mm;page-break-after:always' : '') + '}</style></head><body>' + imgs.map(u => '<img src="' + u + '">').join('') + '</body></html>'); d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { ui.toast('Không mở được hộp thoại in'); } setTimeout(() => f.remove(), 60000); }, 300);
}

/* ---------- Bluetooth trực tiếp (Chrome nối thẳng máy in tem BLE) ---------- */
const U16 = h => '0000' + h.toString(16).padStart(4, '0') + '-0000-1000-8000-00805f9b34fb'; // UUID đầy đủ (Bluefy trên iPhone cần)
const BLE_SVCS = ['49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '6e400001-b5a3-f393-e0a9-e50e24dcca9e'].concat([0xff00, 0xffe0, 0xfff0, 0x18f0, 0xae30, 0xae00].map(U16));
const errMsg = e => (e && (e.message || e.name)) || String(e);
/* Mỗi việc một máy Bluetooth riêng: slot 'phieu' (máy in phiếu) và 'tem' (máy in tem) */
const SLOT_NAME = { phieu: 'máy in phiếu', tem: 'máy in tem' };
const slots = { phieu: { dev: null, ch: null, q: Promise.resolve() }, tem: { dev: null, ch: null, q: Promise.resolve() } };
const bleSubs = [];
const nameKey = k => 'ble.' + STATION + (k === 'tem' ? '' : '.' + k); // (tem giữ khoá cũ)
const bleOk = k => { const b = slots[k]; return !!(b.ch && b.dev && b.dev.gatt.connected); };
const bleName = k => (slots[k].dev && slots[k].dev.name) || store.get(nameKey(k), '') || '';
const bleEmit = () => bleSubs.forEach(f => { try { f(); } catch (e) { /* bỏ qua */ } });
const canBle = () => !!navigator.bluetooth;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/* Lệnh nối có hạn giờ: trên iPhone (Bluefy) lệnh nối không tự hết hạn, treo mãi thì huỷ để lần sau nối được */
const sleep = ms => new Promise(r => setTimeout(r, ms));
function gattConnect(dev, ms) {
  let t;
  return Promise.race([dev.gatt.connect(), new Promise((_, no) => { t = setTimeout(() => { try { dev.gatt.disconnect(); } catch (e) { /* bỏ qua */ } no(new Error('Máy in không phản hồi. Kiểm tra máy in đang bật và không nối với điện thoại khác.')); }, ms || 12000); })])
    .finally(() => clearTimeout(t));
}
async function bleOpen(k) {
  const b = slots[k], dev = b.dev, g = await gattConnect(dev);
  try {
  const writable = [];
  for (const sv of await g.getPrimaryServices()) {
    let cs = []; try { cs = await sv.getCharacteristics(); } catch (e) { continue; }
    cs.forEach(c => { if (c.properties.write || c.properties.writeWithoutResponse) writable.push(c); });
  }
  b.ch = writable.find(c => /49535343-8841|bef8d6c9|ff02|ae01|2af1|fff2|ffe1/i.test(c.uuid)) || writable[0] || null;
  if (!b.ch) throw new Error('Máy này không nhận lệnh in qua Bluetooth');
  } catch (e) { b.ch = null; try { dev.gatt.disconnect(); } catch (x) { /* bỏ qua */ } throw e; } // nối dở thì cắt hẳn
  store.set(nameKey(k), dev.name || ''); bleEmit();
}
async function bleAttach(k, dev) {
  const b = slots[k];
  if (b.dev !== dev) { b.dev = dev; dev.addEventListener('gattserverdisconnected', () => { if (b.dev === dev) { b.ch = null; bleEmit(); autoReconnect(k); } }); }
  await bleOpen(k);
}
/* Mất kết nối (tắt màn hình, ra ngoài, máy in tắt…): tự nối lại, không cần chọn lại máy.
   Trang đang ẩn thì đợi hiện lại mới nối. */
const retry = { phieu: 0, tem: 0 };
function autoReconnect(k) {
  const b = slots[k];
  if (!b.dev || bleOk(k) || b.reconnecting || b.manual) return;
  if (document.hidden) return; // visibilitychange sẽ gọi lại
  const gen = b.gen = (b.gen || 0) + 1;
  b.reconnecting = true;
  bleOpen(k).then(() => { retry[k] = 0; }, () => { retry[k]++; })
    .finally(() => {
      if (b.gen !== gen) return; // người dùng đã bấm Kết nối, bỏ lượt tự nối này
      b.reconnecting = false;
      if (!bleOk(k) && retry[k] < (isIOS() ? 8 : 20)) setTimeout(() => autoReconnect(k), Math.min(15000, 2000 * retry[k]));
    });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) Object.keys(slots).forEach(k => { retry[k] = 0; autoReconnect(k); }); });
window.addEventListener('pageshow', () => Object.keys(slots).forEach(k => autoReconnect(k)));
/* Chọn máy in (trình duyệt bắt buộc người dùng bấm) */
async function bleConnect(k) {
  if (!canBle()) throw new Error(isIOS() ? 'Trên iPhone, mở trang bằng app Bluefy (App Store) để nối Bluetooth.' : 'Trình duyệt này không nối Bluetooth được. Mở bằng Chrome.');
  let dev;
  try { dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SVCS }); }
  catch (e) {
    if (/cancel/i.test(errMsg(e))) throw e;
    // Bluefy / trình duyệt không cho "chọn tất cả": lọc theo dịch vụ và tên máy in hay gặp
    dev = await navigator.bluetooth.requestDevice({ filters: BLE_SVCS.map(s => ({ services: [s] })).concat(['CT', 'MPT', 'Printer', 'BT', 'P', 'Q', 'X', 'M', 'C'].map(n => ({ namePrefix: n }))), optionalServices: BLE_SVCS });
  }
  // Bấm nối tay: dừng tự nối nền, huỷ lệnh nối đang treo rồi mới nối (iPhone kẹt nếu nối chồng)
  const b = slots[k];
  b.manual = true; b.gen = (b.gen || 0) + 1; b.reconnecting = false; retry[k] = 0;
  try {
    [b.dev, dev].forEach(d => { if (d && !(d.gatt && d.gatt.connected && b.dev === d && b.ch)) try { d.gatt.disconnect(); } catch (e) { /* bỏ qua */ } });
    if (isIOS()) await sleep(400);
    try { await bleAttach(k, dev); }
    catch (e) { await sleep(800); try { dev.gatt.disconnect(); } catch (x) { /* bỏ qua */ } await sleep(300); await bleAttach(k, dev); } // thử lại 1 lần
  } finally { b.manual = false; }
  return dev.name;
}
/* Mở lại trang: nối lại máy đã chọn trước (nếu trình duyệt cho), không thì phải bấm Kết nối */
async function bleRestore(k) {
  try {
    if (bleOk(k)) return true;
    if (slots[k].dev) { await bleOpen(k); return true; }
    if (!canBle() || !navigator.bluetooth.getDevices) return false;
    const ds = await navigator.bluetooth.getDevices(), name = bleName(k);
    const d = ds.find(x => x.name === name); if (!d) return false;
    await Promise.race([bleAttach(k, d), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 8000))]);
    return true;
  } catch (e) { return false; }
}
/* Gửi lệnh theo hàng đợi, từng gói nhỏ có xác nhận (không mất dữ liệu) */
function bleSend(k, u8) {
  const b = slots[k];
  const run = async () => {
    if (window.BENOC_BLE_HOOK) return window.BENOC_BLE_HOOK(u8, k);
    if (!bleOk(k)) { if (!b.dev) throw Object.assign(new Error(SLOT_NAME[k] + ' chưa kết nối'), { code: 'NO_BLE' }); await bleOpen(k); }
    const slow = b.ch.writeValueWithResponse ? x => b.ch.writeValueWithResponse(x) : x => b.ch.writeValue(x); // Bluefy: writeValue
    // Gửi nhanh: liền nhiều gói không chờ xác nhận, cứ 8 gói chờ 1 lần để máy in kịp nhận (không tràn bộ nhớ)
    const fast = b.ch.properties.writeWithoutResponse && b.ch.writeValueWithoutResponse && store.get('bleFast', true) ? x => b.ch.writeValueWithoutResponse(x) : null;
    if (k === 'phieu') {
      // Phiếu: gói nhỏ, chờ xác nhận từng gói, nghỉ chút cho máy in kịp đốt giấy (phiếu dài / mã QR hay bị rơi chữ cuối phiếu)
      for (let i = 0; i < u8.length; i += 120) { await slow(u8.slice(i, i + 120)); await sleep(18); }
      return;
    }
    for (let i = 0, n = 0; i < u8.length; i += 180, n++) {
      const part = u8.slice(i, i + 180);
      if (fast && n % 8 !== 7 && i + 180 < u8.length) await fast(part); else await slow(part);
    }
  };
  const p = b.q.then(run, run); b.q = p.catch(() => {}); return p;
}

/* Lệnh in của một việc (phiếu / tem) cho một đơn. null = không có gì để in. */
function build(kind, o, items, extra, set) {
  if (!items.length) return null;
  if (kind === 'tem') {
    if (set.tmode === 'off') return null;
    const cvs = cups(items).map(c => labelCanvas(o, c, set)), L = labelOf(set);
    if (set.tmode === 'ble') return { ble: tspl(cvs, set) };
    if (set.tmode === 'rawbt') return { url: rawbtUrl(set.lang === 'escpos' || L.roll ? escposLabels(cvs, set) : tspl(cvs, set)) };
    return { imgs: cvs.map(c => c.toDataURL('image/png')), page: { w: L.w, h: L.h } };
  }
  if (set.mode === 'off') return null;
  const cv = ticketCanvas(o, items, extra, set);
  return set.mode === 'rawbt' ? { url: rawbtUrl(escpos(cv, set.copies)) }
    : set.mode === 'ble' ? { ble: escpos(cv, set.copies) }
    : { imgs: Array.from({ length: set.copies || 1 }, () => cv.toDataURL('image/png')), page: { w: set.width } };
}
function bleOut(j, kind) { return bleSend(kind, j.ble).catch(e => { ui.toast((kind === 'tem' ? 'Chưa in được tem: ' : 'Chưa in được phiếu: ') + (e.code === 'NO_BLE' ? 'bấm Kết nối ' + SLOT_NAME[kind] : errMsg(e))); if (window.BNPrintFail) window.BNPrintFail(kind, e); throw e; }); }
/* In các việc đang bật (hoặc chỉ các việc trong only). Bluetooth gửi trước (chạy nền),
   rồi mới mở RawBT / hộp thoại in. Trả về số việc đã gửi. */
function printTicket(o, items, extra, set, only) {
  set = set || get();
  const list = (only || jobs(set)).map(k => ({ k, j: build(k, o, items, extra, set) })).filter(x => x.j);
  list.filter(x => x.j.ble).forEach(x => { bleOut(x.j, x.k).catch(() => {}); });
  list.filter(x => !x.j.ble).forEach(x => { if (x.j.url) go(x.j.url); else browserPrint(x.j.imgs, x.j.page); });
  return list.length;
}
/* Máy khác bấm Nhận đơn: tự in. Bluetooth trực tiếp in được ngay. RawBT có thể bị Chrome chặn
   (không có thao tác bấm): mở được RawBT thì trang bị ẩn đi chốc lát → coi như đã in.
   Trả về danh sách việc còn phải bấm in tay. */
async function tryAuto(o, items, extra, set) {
  set = set || get();
  const manual = [];
  if (!set.auto) return jobs(set);
  for (const k of jobs(set)) {
    const j = build(k, o, items, extra, set); if (!j) continue;
    if (j.ble) { try { await bleOut(j, k); } catch (e) { manual.push(k); } continue; }
    if (!j.url) { manual.push(k); continue; }
    const ok = await new Promise(res => {
      let done = false;
      const hid = () => { if (document.hidden && !done) { done = true; res(true); } };
      document.addEventListener('visibilitychange', hid);
      try { go(j.url); } catch (e) { /* bị chặn */ }
      setTimeout(() => { document.removeEventListener('visibilitychange', hid); if (!done) { done = true; res(!!window.BENOC_PRINT_HOOK); } }, 1800);
    });
    if (!ok) manual.push(k);
  }
  return manual;
}

/* ---------- Cài đặt máy in (từng máy) ---------- */
function sample() {
  return { o: { id: 'abcd1234', queue_number: 12, customer_name: 'Khách thử', customer_phone: '0912345678', dine_type: 'tai_quan', created_at: new Date().toISOString(), note: 'In thử phiếu' },
    items: [{ qty: 2, unit_price: window.BENOC_STATION === 'pha_che' ? 40000 : 40000, item_name: window.BENOC_STATION === 'pha_che' ? 'Hồng trà sữa trân châu' : 'Cơm heo chua ngọt', options: window.BENOC_STATION === 'pha_che' ? [{ group: 'Upsize', choice: 'Upsize', price: 10000 }, { group: 'Đường', choice: 'Ít đường' }, { group: 'Topping thêm', choice: 'Trân châu hoàng gia' }] : [{ group: 'Topping thêm', choice: 'Trứng ốp la' }], note: 'ít cay' },
      { qty: 1, unit_price: 25000, item_name: window.BENOC_STATION === 'pha_che' ? 'Trà đào' : 'Kimbap chiên', options: [], note: null }] };
}
function openSettings(onChange) {
  let s = get();
  const PLACE = STATION === 'pha_che' ? 'quầy pha chế' : 'bếp';
  const seg = (attr, cur, list) => '<div class="seg2" style="grid-template-columns:repeat(' + list.length + ',1fr)">' + list.map(([v, t]) => '<button type="button" data-' + attr + '="' + v + '" aria-pressed="' + (String(cur) === String(v)) + '">' + t + '</button>').join('') + '</div>';
  const radios = (name, cur, list) => '<div class="pr-modes">' + list.map(([k, t, d]) => '<label class="check"><input type="radio" name="' + name + '" value="' + k + '"' + (cur === k ? ' checked' : '') + '><span><b>' + t + '</b><small>' + d + '</small></span></label>').join('') + '</div>';
  const prevT = () => { const x = sample(); return '<div class="pr-prev"><img src="' + ticketCanvas(x.o, x.items, { minutes: 10 }, s).toDataURL('image/png') + '" alt="Phiếu mẫu" style="width:' + (s.width === 80 ? 288 : 220) + 'px"></div>'; };
  const prevL = () => { const x = sample(); return '<div class="pr-prev">' + cups(x.items).slice(0, 2).map(c => '<img src="' + labelCanvas(x.o, c, s).toDataURL('image/png') + '" alt="Tem mẫu" style="width:' + labelOf(s).w * 4.4 + 'px">').join('') + '</div>'; };
  const bleBox = k => '<div class="pr-ble"><span class="grow">' + (bleOk(k) ? '<b class="ok">● Đã nối</b> ' + esc(bleName(k)) : bleName(k) ? '<b class="bad">● Chưa nối</b> ' + esc(bleName(k)) : 'Chưa chọn ' + SLOT_NAME[k]) + '</span><button class="btn btn-sm" type="button" data-ble="' + k + '">' + (bleName(k) ? 'Kết nối lại' : 'Chọn ' + SLOT_NAME[k]) + '</button></div>' +
    '<label class="check"><input type="checkbox" class="prFast"' + (store.get('bleFast', true) ? ' checked' : '') + '><span><b>Gửi nhanh</b><small>Bỏ chọn nếu tem / phiếu in ra bị vỡ, thiếu dòng (gửi chậm mà chắc)</small></span></label>' +
    '<p class="small muted" style="margin:0">' + (canBle() ? 'Tắt app riêng của máy in trước (máy chỉ nối được một nơi). Bật Bluetooth' + (isIOS() ? '.' : ' và Vị trí.') : isIOS() ? '<b>iPhone:</b> Safari / Chrome không nối Bluetooth được. Cài app <b>Bluefy</b> (App Store) rồi mở trang này bằng Bluefy.' : 'Trình duyệt này không nối Bluetooth được, mở bằng Chrome.') + '</p>';
  const IOS = isIOS();
  const body = () => '' +
    '<section class="pr-sec"><h3>Phiếu món</h3><p class="small muted" style="margin:0 0 6px">Phiếu các món của ' + PLACE + ': giá từng món, tổng tiền, đã / chưa thanh toán (không in mã đơn).</p>' +
    radios('prm', s.mode, [IOS ? null : ['rawbt', 'Qua app RawBT (Android)', 'Máy in mặc định trong RawBT (ví dụ MPT-II). Mở RawBT chọn máy một lần.'], ['ble', 'Bluetooth trực tiếp', 'Trang nối thẳng máy in phiếu. Dùng trên iPhone (qua app Bluefy) hoặc khi RawBT đã dùng cho máy khác.'], IOS ? null : ['browser', 'Hộp thoại in của trình duyệt', 'Máy in có ứng dụng in riêng của hãng.'], ['off', 'Không in phiếu', 'Máy này không in phiếu.']].filter(Boolean)) +
    (s.mode === 'ble' ? bleBox('phieu') : '') +
    (s.mode !== 'off' ? '<div class="field">Khổ giấy</div>' + seg('w', s.width, [[58, '58 mm'], [80, '80 mm']]) +
      '<div class="grid2"><label class="field" for="prCopies">Số bản mỗi lần<input id="prCopies" class="num" type="number" min="1" max="3" value="' + s.copies + '"></label>' +
      '<label class="check" style="align-self:end"><input type="checkbox" id="prBig"' + (s.big ? ' checked' : '') + '><span><b>Chữ to</b><small>Dễ đọc khi đứng làm</small></span></label></div>' +
      (BN.FEATURES.vietqr ? '<label class="check"><input type="checkbox" id="prQr"' + (s.qr !== false ? ' checked' : '') + '><span><b>In mã QR chuyển khoản cuối phiếu</b><small>Chỉ in khi đơn còn phải thu tiền, đúng số tiền còn thu.</small></span></label>' : '') + prevT() +
      '<div class="row"><button class="btn btn-line btn-sm" type="button" data-test="phieu">In thử phiếu</button></div>' : '') + '</section>' +
    '<section class="pr-sec"><h3>Tem dán ly</h3><p class="small muted" style="margin:0 0 6px">Mỗi ly một tem: bàn / mang về, tên khách, món, size, đường, đá, topping, ghi chú.</p>' +
    radios('prt', s.tmode, [['ble', 'Bluetooth trực tiếp (khuyên dùng cho máy tem)', 'Trang nối thẳng máy in tem (CLABEL CT221B…). Dùng được cùng lúc với máy in phiếu.'], IOS ? null : ['rawbt', 'Qua app RawBT (Android)', 'Chỉ khi điện thoại này không dùng RawBT để in phiếu.'], ['off', 'Không in tem', 'Máy này không in tem.']].filter(Boolean)) +
    (s.tmode !== 'off'
      ? (s.tmode === 'ble' ? bleBox('tem') : '') +
        '<div class="field">Khổ tem</div>' + seg('lb', s.label, [['40x30', '40×30'], ['50x30', '50×30'], ['50x40', '50×40'], ['58', 'Cuộn 58']]) +
        (s.tmode === 'rawbt' && s.label !== '58' ? '<div class="field">Lệnh máy in</div>' + seg('lang', s.lang, [['tspl', 'TSPL (máy in tem)'], ['escpos', 'ESC/POS']]) : '') +
        (s.label !== '58' ? '<div class="field">Căn lề ngang</div><div class="pr-off"><button class="btn btn-line btn-sm" type="button" data-off="-1" aria-label="Dịch sang trái">◀ Trái</button><b class="num">' + (s.offx > 0 ? '+' : '') + s.offx + ' mm</b><button class="btn btn-line btn-sm" type="button" data-off="1" aria-label="Dịch sang phải">Phải ▶</button></div>' +
          '<div class="field">Căn lề dọc</div><div class="pr-off"><button class="btn btn-line btn-sm" type="button" data-offy="-1" aria-label="Dịch lên">▲ Lên</button><b class="num">' + (s.offy > 0 ? '+' : '') + (s.offy || 0) + ' mm</b><button class="btn btn-line btn-sm" type="button" data-offy="1" aria-label="Dịch xuống">Xuống ▼</button></div>' +
          '<p class="small muted" style="margin:0">In thử thấy chữ lệch khỏi tem thì dịch về phía ngược lại, mỗi lần 1 mm, rồi in thử lại.</p>' +
          '<label class="check"><input type="checkbox" id="prInv"' + (s.inv ? ' checked' : '') + '><span><b>Đảo màu</b><small>Bật nếu in ra tem đen kín, chữ trắng</small></span></label>' : '') +
        prevL() + '<div class="row"><button class="btn btn-line btn-sm" type="button" data-test="tem">In thử tem</button></div>'
      : '') + '</section>' +
    '<label class="check"><input type="checkbox" id="prAuto"' + (s.auto ? ' checked' : '') + '><span><b>Tự in khi máy khác bấm Nhận đơn</b><small>Mở sẵn màn hình ' + PLACE + ' trên máy này.</small></span></label>';
  ui.sheet(ui.head('Máy in ' + PLACE, 'Cài riêng trên điện thoại này') + '<div class="sh-body pr-set" id="prBody">' + body() + '</div>' +
    '<div class="sh-foot"><button class="btn btn-block" type="button" id="prSave">Lưu</button></div>', sh => {
    const q = id => sh.querySelector(id);
    const read = () => { if (q('#prCopies')) s.copies = Math.max(1, Math.min(3, Number(q('#prCopies').value) || 1)); if (q('#prBig')) s.big = q('#prBig').checked; if (q('#prQr')) s.qr = q('#prQr').checked; if (q('#prInv')) s.inv = q('#prInv').checked; s.auto = q('#prAuto').checked; const f = sh.querySelector('.prFast'); if (f) store.set('bleFast', f.checked); };
    const redraw = () => { read(); const top = q('#prBody').scrollTop; q('#prBody').innerHTML = body(); q('#prBody').scrollTop = top; };
    const unsub = () => { const i = bleSubs.indexOf(onBle); if (i >= 0) bleSubs.splice(i, 1); };
    const onBle = () => { if (!document.body.contains(sh)) { unsub(); return; } redraw(); };
    bleSubs.push(onBle);
    sh.addEventListener('change', e => { if (e.target.name === 'prm') s.mode = e.target.value; if (e.target.name === 'prt') s.tmode = e.target.value; redraw(); });
    sh.addEventListener('click', async e => {
      const t = e.target.closest('[data-w],[data-lb],[data-lang],[data-off],[data-offy]');
      if (t) { if (t.dataset.w) s.width = Number(t.dataset.w); if (t.dataset.lb) s.label = t.dataset.lb; if (t.dataset.lang) s.lang = t.dataset.lang; if (t.dataset.off) s.offx = Math.max(-10, Math.min(10, (s.offx || 0) + Number(t.dataset.off))); if (t.dataset.offy) s.offy = Math.max(-10, Math.min(10, (s.offy || 0) + Number(t.dataset.offy))); redraw(); return; }
      if (e.target.closest('[data-ble]')) {
        const b = e.target.closest('[data-ble]'), k = b.dataset.ble; b.disabled = true;
        try { const n = await bleConnect(k); ui.toast('Đã nối ' + SLOT_NAME[k] + ' ' + (n || '')); } catch (err) { if (!/cancel/i.test(errMsg(err))) ui.toast('Không nối được: ' + errMsg(err)); }
        redraw(); return;
      }
      const tb = e.target.closest('[data-test]');
      if (tb) { read(); const x = sample(), k = tb.dataset.test; printTicket(x.o, k === 'tem' ? x.items.slice(0, 1).map(i => Object.assign({}, i, { qty: 1 })) : x.items, { minutes: 10 }, s, [k]); return; }
      if (e.target.closest('#prSave')) {
        read(); save(s); unsub(); ui.close();
        const on = jobs(s);
        ui.toast(!on.length ? 'Máy này không in' : 'Đã lưu. Bấm Nhận đơn là máy này in ' + on.map(k => k === 'tem' ? 'tem dán ly' : 'phiếu').join(' + ') + '.');
        if (onChange) onChange(s);
      }
    });
  });
}

/* Chữ trên nút Máy in */
function label(set) {
  set = set || get();
  const on = jobs(set);
  if (!on.length) return '';
  return on.map(k => k === 'tem' ? 'tem' : 'phiếu').join(' + ');
}

window.BNPrint = { get, save, jobs, label, ticketCanvas, labelCanvas, cups, escpos, tspl, rawbtUrl, build, printTicket, tryAuto, openSettings,
  errMsg, ble: { ok: bleOk, has: k => !!slots[k].dev || !!window.BENOC_BLE_HOOK, name: bleName, label: k => SLOT_NAME[k], connect: bleConnect, restore: bleRestore, send: bleSend, on: f => { bleSubs.push(f); } } };
})();
