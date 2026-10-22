/* =====================================================================
   IN PHIẾU / TEM DÁN LY (máy in nhiệt Bluetooth trên Android)
   - Mỗi máy (điện thoại) chọn một việc: in PHIẾU MÓN hoặc in TEM DÁN LY.
     Ví dụ: bếp 1 máy in phiếu; quầy pha chế 1 máy in phiếu + 1 máy in tem.
   - Chỉ in khi có người bấm "Nhận đơn" (không in đơn ảo khách vừa gửi).
     Máy bấm Nhận đơn in ngay; các máy khác của cùng nơi tự in khi thấy đơn
     vừa được nhận (mỗi máy chỉ in một lần cho mỗi lần nhận).
   - Phiếu / tem vẽ thành ảnh (tiếng Việt có dấu luôn đúng), gửi sang máy in bằng:
       * RawBT (khuyên dùng): app miễn phí trên Android, nối Bluetooth với máy in.
         Phiếu: lệnh ESC/POS. Tem: lệnh TSPL (máy in tem) hoặc ESC/POS.
       * Trình duyệt: hộp thoại in của Android (máy in có dịch vụ in riêng).
   - Cài đặt lưu riêng trên từng máy.
   ===================================================================== */
(function () {
'use strict';
const { esc, hhmm, store, ui, sizeOf, isSizeOpt, sizeText, isTakeaway, isDelivery } = BN; // (không in mã đơn, không in giá)
const STATION = window.BENOC_STATION || 'bep';
const KEY = 'printer.' + STATION;
const DEF = { mode: 'off', job: 'phieu', width: 58, copies: 1, big: true, label: '40x30', lang: 'tspl', inv: false, auto: true };
const get = () => Object.assign({}, DEF, store.get(KEY, {}));
const save = s => store.set(KEY, s);
const DOTS = { 58: 384, 80: 576 };   // số chấm in mỗi dòng
/* Khổ tem (máy 203 dpi = 8 chấm/mm). "58" = cuộn giấy dán liên tục 58 mm, mỗi tem cao 30 mm */
const LABELS = { '40x30': { w: 40, h: 30, gap: 2 }, '50x30': { w: 50, h: 30, gap: 2 }, '58': { w: 48, h: 30, gap: 0, roll: true } };
const labelOf = set => LABELS[set.label] || LABELS['40x30'];

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
  const W = DOTS[set.width] || 384, pad = 8, k = W / 384 * (set.big ? 1.12 : 1);
  const F = (px, b) => (b ? '800 ' : '500 ') + Math.round(px * k) + 'px "Be Vietnam Pro", "Roboto", sans-serif';
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  const ops = []; let y = pad;
  const text = (t, px, bold, align, gap) => { ctx.font = F(px, bold); wrap(ctx, t, W - pad * 2).forEach(l => { ops.push({ t: l, font: F(px, bold), y: y + px * k, align: align || 'left' }); y += px * k * 1.28; }); y += (gap || 0) * k; };
  const rule = (dash) => { ops.push({ rule: true, y: y + 4, dash }); y += 12 * k; };
  // Phiếu gọn để tiết kiệm giấy: loại đơn + số bàn / giờ giao, địa chỉ (ship), khách, giờ đặt, giờ nhận, món, ghi chú
  const where = isDelivery(o) ? 'ĐI SHIP' + (o.deliver_at ? ' · ' + hhmm(o.deliver_at) : '') : o.pickup ? 'ĐẾN LẤY' : isTakeaway(o) ? 'MANG VỀ' : 'Ở ĐÂY · BÀN ' + o.queue_number;
  text(where, 40, true, 'center', 2);
  if (isDelivery(o) && o.address) text(o.address, 22, true, 'center', 2);
  text([o.customer_name, o.customer_phone].filter(Boolean).join(' · '), 24, true, 'center');
  text('Đặt ' + hhmm(o.created_at) + ' · Nhận ' + hhmm(Date.now()) + (extra.reprint ? ' · in lại' : ''), 20, false, 'center', 2);
  rule(false);
  let lastGroup = null;
  items.forEach(i => {
    if (i.promo_group && i.promo_group !== lastGroup) text('[' + (i.promo_kind === 'combo' ? 'COMBO' : 'ƯU ĐÃI') + '] ' + (i.promo_name || ''), 20, true, 'left', 2);
    lastGroup = i.promo_group || null;
    const sz = sizeOf(i.options), opts = (i.options || []).filter(x => !isSizeOpt(x));
    text(i.qty + ' x ' + i.item_name + (sz ? ' - ' + sizeText(sz) : '') + (i.promo_part === 'tang' ? ' (TẶNG)' : ''), 30, true, 'left', 2);
    const tops = opts.filter(x => /topping/i.test(x.group || '')).map(x => '+ ' + x.choice);
    const rest = opts.filter(x => !/topping/i.test(x.group || '')).map(x => x.choice);
    if (rest.length) text('   ' + rest.join(', '), 22, false);
    if (tops.length) text('   ' + tops.join('  '), 24, true);
    if (i.note) text('   * ' + i.note, 24, true);
    y += 6 * k;
  });
  if (o.note) { rule(true); text('Ghi chú: ' + o.note, 24, true, 'left', 2); }
  y += 12 * k; // chừa chút giấy để xé
  cv.width = W; cv.height = Math.ceil(y);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, cv.height); ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
  ops.forEach(op => {
    if (op.rule) { ctx.lineWidth = 2; ctx.setLineDash(op.dash ? [8, 6] : []); ctx.beginPath(); ctx.moveTo(pad, op.y); ctx.lineTo(W - pad, op.y); ctx.stroke(); ctx.setLineDash([]); return; }
    ctx.font = op.font; ctx.textAlign = op.align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(op.t, op.align === 'center' ? W / 2 : pad, op.y);
  });
  return cv;
}

/* ---------- Ảnh → lệnh ESC/POS (GS v 0, chia từng dải để máy in không tràn bộ nhớ) ---------- */
function escpos(cv, copies) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, px = ctx.getImageData(0, 0, W, H).data, bw = Math.ceil(W / 8);
  const out = [0x1B, 0x40]; // ESC @ khởi động
  for (let c = 0; c < (copies || 1); c++) {
    for (let y0 = 0; y0 < H; y0 += 120) {
      const h = Math.min(120, H - y0);
      out.push(0x1D, 0x76, 0x30, 0x00, bw & 255, bw >> 8, h & 255, h >> 8);
      for (let y = y0; y < y0 + h; y++) for (let xb = 0; xb < bw; xb++) {
        let b = 0;
        for (let bit = 0; bit < 8; bit++) { const x = xb * 8 + bit; if (x < W) { const i = (y * W + x) * 4; if (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11 < 150) b |= 0x80 >> bit; } }
        out.push(b);
      }
    }
    out.push(0x1B, 0x64, 0x03, 0x1D, 0x56, 0x42, 0x00); // đẩy giấy 3 dòng + cắt (máy không có dao cắt thì bỏ qua)
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
const whereShort = o => isDelivery(o) ? 'SHIP' + (o.deliver_at ? ' ' + hhmm(o.deliver_at) : '') : o.pickup ? 'ĐẾN LẤY' : isTakeaway(o) ? 'MANG VỀ' : 'BÀN ' + o.queue_number;
function labelCanvas(o, cup, set) {
  set = set || get();
  const L = labelOf(set), W = L.w * 8, H = L.h * 8, pad = 10, i = cup.i;
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  cv.width = W; cv.height = H;
  const sz = sizeOf(i.options), opts = (i.options || []).filter(x => !isSizeOpt(x));
  const tops = opts.filter(x => /topping/i.test(x.group || '')).map(x => '+' + x.choice);
  const rest = opts.filter(x => !/topping/i.test(x.group || '')).map(x => x.choice);
  // Vẽ thử với cỡ chữ giảm dần đến khi vừa tem
  for (let k = 1; k >= 0.6; k -= 0.05) {
    const F = (px, b) => (b ? '800 ' : '600 ') + Math.round(px * k * W / 320) + 'px "Be Vietnam Pro", "Roboto", sans-serif';
    const lh = px => px * k * W / 320 * 1.2;
    const ops = []; let y = pad;
    const line = (t, px, b, max) => { ctx.font = F(px, b); let ls = wrap(ctx, t, W - pad * 2); if (max && ls.length > max) { ls = ls.slice(0, max); ls[max - 1] += '…'; } ls.forEach(l => { y += lh(px); ops.push({ t: l, font: F(px, b), y: y - lh(px) * 0.2 }); }); };
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
    const fits = y <= H - pad - lh(16);
    if (!fits && k > 0.61) continue;
    ops.push({ t: hhmm(Date.now()), font: F(16, false), y: H - pad, right: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
    ops.forEach(op => {
      if (op.rule) { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pad, op.y); ctx.lineTo(W - pad, op.y); ctx.stroke(); return; }
      ctx.font = op.font; ctx.textBaseline = 'alphabetic'; ctx.textAlign = op.right ? 'right' : 'left';
      ctx.fillText(op.t, op.right ? W - pad : pad, op.y);
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
/* Lệnh TSPL cho máy in tem (Xprinter, TSC, Gprinter…): mỗi tem một lần CLS / BITMAP / PRINT */
function tspl(cvs, set) {
  const L = labelOf(set), out = ascii('SIZE ' + L.w + ' mm,' + L.h + ' mm\r\nGAP ' + L.gap + ' mm,0 mm\r\nDIRECTION 1\r\nREFERENCE 0,0\r\n');
  cvs.forEach(cv => {
    const b = bits(cv);
    out.push(...ascii('CLS\r\nBITMAP 0,0,' + b.bw + ',' + b.H + ',0,'));
    // TSPL: bit 0 = in đen (ngược với ESC/POS). "Đảo màu" cho máy in ngược.
    for (let j = 0; j < b.data.length; j++) out.push(set.inv ? b.data[j] : (~b.data[j]) & 255);
    out.push(...ascii('\r\nPRINT 1,1\r\n'));
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

/* Lệnh in cho một đơn theo việc của máy này. Trả về null nếu không có gì để in. */
function job(o, items, extra, set) {
  set = set || get();
  if (set.mode === 'off' || !items.length) return null;
  if (set.job === 'tem') {
    const cvs = cups(items).map(c => labelCanvas(o, c, set));
    const L = labelOf(set);
    return set.mode === 'rawbt' ? { url: rawbtUrl(set.lang === 'escpos' || L.roll ? escposLabels(cvs, set) : tspl(cvs, set)) }
      : { imgs: cvs.map(c => c.toDataURL('image/png')), page: { w: L.w, h: L.h } };
  }
  const cv = ticketCanvas(o, items, extra, set);
  return set.mode === 'rawbt' ? { url: rawbtUrl(escpos(cv, set.copies)) }
    : { imgs: Array.from({ length: set.copies || 1 }, () => cv.toDataURL('image/png')), page: { w: set.width } };
}
function send(j) { if (!j) return false; if (j.url) go(j.url); else browserPrint(j.imgs, j.page); return true; }
function printTicket(o, items, extra, set) { return send(job(o, items, extra, set)); }
/* Máy khác bấm Nhận đơn: thử in luôn (không có thao tác bấm, Chrome có thể chặn mở app RawBT).
   Mở được RawBT thì trang bị ẩn đi trong chốc lát → coi như đã in. Không thì báo để người làm bấm in. */
function tryAuto(o, items, extra, set) {
  set = set || get();
  const j = job(o, items, extra, set);
  if (!j) return Promise.resolve('none');
  if (!j.url || !set.auto) return Promise.resolve('manual');
  return new Promise(ok => {
    let done = false;
    const hid = () => { if (document.hidden && !done) { done = true; ok('printed'); } };
    document.addEventListener('visibilitychange', hid);
    try { go(j.url); } catch (e) { /* bị chặn */ }
    setTimeout(() => { document.removeEventListener('visibilitychange', hid); if (!done) { done = true; ok(window.BENOC_PRINT_HOOK ? 'printed' : 'manual'); } }, 1800);
  });
}

/* ---------- Cài đặt máy in (từng máy) ---------- */
function sample() {
  return { o: { id: 'abcd1234', queue_number: 12, customer_name: 'Khách thử', customer_phone: '0912345678', dine_type: 'tai_quan', created_at: new Date().toISOString(), note: 'In thử phiếu' },
    items: [{ qty: 2, item_name: window.BENOC_STATION === 'pha_che' ? 'Hồng trà sữa trân châu' : 'Cơm heo chua ngọt', options: window.BENOC_STATION === 'pha_che' ? [{ group: 'Upsize', choice: 'Upsize', price: 10000 }, { group: 'Đường', choice: 'Ít đường' }, { group: 'Topping thêm', choice: 'Trân châu hoàng gia' }] : [{ group: 'Topping thêm', choice: 'Trứng ốp la' }], note: 'ít cay' },
      { qty: 1, item_name: window.BENOC_STATION === 'pha_che' ? 'Trà đào' : 'Kimbap chiên', options: [], note: null }] };
}
function openSettings(onChange) {
  let s = get();
  const PLACE = STATION === 'pha_che' ? 'quầy pha chế' : 'bếp';
  const preview = () => { const x = sample(); if (s.job === 'tem') return cups(x.items).slice(0, 2).map(c => labelCanvas(x.o, c, s).toDataURL('image/png')); return [ticketCanvas(x.o, x.items, { minutes: 10 }, s).toDataURL('image/png')]; };
  const seg = (attr, cur, list) => '<div class="seg2" style="grid-template-columns:repeat(' + list.length + ',1fr)">' + list.map(([v, t]) => '<button type="button" data-' + attr + '="' + v + '" aria-pressed="' + (String(cur) === String(v)) + '">' + t + '</button>').join('') + '</div>';
  const radios = (name, cur, list) => '<div class="pr-modes">' + list.map(([k, t, d]) => '<label class="check"><input type="radio" name="' + name + '" value="' + k + '"' + (cur === k ? ' checked' : '') + '><span><b>' + t + '</b><small>' + d + '</small></span></label>').join('') + '</div>';
  const body = () => '' +
    '<div class="field">Máy in này in gì</div>' + seg('job', s.job, [['phieu', 'Phiếu món'], ['tem', 'Tem dán ly']]) +
    '<p class="small muted" style="margin:0">' + (s.job === 'tem' ? 'Mỗi ly một tem: bàn / mang về, tên khách, tên món, size, đường, đá, topping, ghi chú.' : 'Phiếu các món của ' + PLACE + ' trong đơn (không in giá, không in mã đơn).') + '</p>' +
    '<div class="field">Cách in</div>' + radios('prm', s.mode,
      [['rawbt', 'Qua app RawBT (khuyên dùng)', 'Máy in nhiệt Bluetooth trên Android. Cài app RawBT từ Play Store, mở app chọn máy in Bluetooth một lần.'],
       ['browser', 'Hộp thoại in của trình duyệt', 'Khi máy in có dịch vụ in riêng trên Android (ứng dụng của hãng máy in).'],
       ['off', 'Không in', 'Máy này không in.']]) +
    (s.job === 'tem'
      ? '<div class="field">Khổ tem</div>' + seg('lb', s.label, [['40x30', '40 × 30 mm'], ['50x30', '50 × 30 mm'], ['58', 'Cuộn 58 mm']]) +
        (s.mode === 'rawbt' && s.label !== '58'
          ? '<div class="field">Lệnh máy in</div>' + seg('lang', s.lang, [['tspl', 'TSPL (máy in tem)'], ['escpos', 'ESC/POS']]) +
            (s.lang === 'tspl' ? '<label class="check"><input type="checkbox" id="prInv"' + (s.inv ? ' checked' : '') + '><span><b>Đảo màu</b><small>Bật nếu in thử ra tem đen kín, chữ trắng</small></span></label>' : '')
          : '')
      : '<div class="field">Khổ giấy</div>' + seg('w', s.width, [[58, '58 mm'], [80, '80 mm']]) +
        '<div class="grid2"><label class="field" for="prCopies">Số bản mỗi lần<input id="prCopies" class="num" type="number" min="1" max="3" value="' + s.copies + '"></label>' +
        '<label class="check" style="align-self:end"><input type="checkbox" id="prBig"' + (s.big ? ' checked' : '') + '><span><b>Chữ to</b><small>Dễ đọc khi đứng bếp</small></span></label></div>') +
    '<label class="check"><input type="checkbox" id="prAuto"' + (s.auto ? ' checked' : '') + '><span><b>Tự in khi máy khác bấm Nhận đơn</b><small>Mở sẵn màn hình ' + PLACE + ' trên máy này. Nếu điện thoại chặn tự in, màn hình hiện nút để bấm in.</small></span></label>' +
    '<div class="field">Xem trước</div><div class="pr-prev">' + preview().map(u => '<img src="' + u + '" alt="Mẫu" style="width:' + (s.job === 'tem' ? labelOf(s).w * 4.4 : s.width === 80 ? 288 : 220) + 'px">').join('') + '</div>';
  ui.sheet(ui.head('Máy in ' + PLACE, 'Cài riêng trên máy này') + '<div class="sh-body pr-set" id="prBody">' + body() + '</div>' +
    '<div class="sh-foot"><button class="btn btn-line" type="button" id="prTest">In thử</button><button class="btn grow" type="button" id="prSave">Lưu</button></div>', sh => {
    const q = id => sh.querySelector(id);
    const read = () => { if (q('#prCopies')) s.copies = Math.max(1, Math.min(3, Number(q('#prCopies').value) || 1)); if (q('#prBig')) s.big = q('#prBig').checked; if (q('#prInv')) s.inv = q('#prInv').checked; s.auto = q('#prAuto').checked; };
    const redraw = () => { read(); const top = q('#prBody').scrollTop; q('#prBody').innerHTML = body(); q('#prBody').scrollTop = top; };
    sh.addEventListener('change', e => { if (e.target.name === 'prm') s.mode = e.target.value; redraw(); });
    sh.addEventListener('click', e => {
      const t = e.target.closest('[data-job],[data-w],[data-lb],[data-lang]');
      if (t) { if (t.dataset.job) s.job = t.dataset.job; if (t.dataset.w) s.width = Number(t.dataset.w); if (t.dataset.lb) s.label = t.dataset.lb; if (t.dataset.lang) s.lang = t.dataset.lang; redraw(); return; }
      if (e.target.closest('#prTest')) { read(); const x = sample(); if (s.mode === 'off') { ui.toast('Chọn cách in trước'); return; } printTicket(x.o, s.job === 'tem' ? x.items.slice(0, 1).map(i => Object.assign({}, i, { qty: 1 })) : x.items, { minutes: 10 }, s); }
      if (e.target.closest('#prSave')) { read(); save(s); ui.close(); ui.toast(s.mode === 'off' ? 'Máy này không in' : 'Đã lưu. Có người bấm Nhận đơn là máy này in ' + (s.job === 'tem' ? 'tem dán ly.' : 'phiếu.')); if (onChange) onChange(s); }
    });
  });
}

window.BNPrint = { get, save, ticketCanvas, labelCanvas, cups, escpos, tspl, rawbtUrl, job, printTicket, tryAuto, openSettings };
})();
