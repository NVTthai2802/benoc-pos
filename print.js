/* =====================================================================
   IN PHIẾU BẾP / PHA CHẾ (máy in nhiệt Bluetooth trên Android)
   - Chỉ in khi người làm bấm "Nhận đơn" (không in đơn ảo khách vừa gửi).
   - Phiếu vẽ thành ảnh (tiếng Việt có dấu luôn đúng), gửi sang máy in bằng:
       * RawBT (khuyên dùng): app miễn phí trên Android, nối Bluetooth với máy in.
         Trang gửi lệnh ESC/POS (ảnh raster) qua đường dẫn intent:…;scheme=rawbt.
       * Trình duyệt: hộp thoại in của Android (máy in có dịch vụ in riêng).
   - Cài đặt lưu riêng trên từng máy (bếp, pha chế mỗi nơi một máy in).
   ===================================================================== */
(function () {
'use strict';
const { esc, hhmm, store, ui, sizeOf, isSizeOpt, sizeText, isTakeaway, isDelivery } = BN; // (phiếu không in mã đơn, không in giá)
const KEY = 'printer.' + (window.BENOC_STATION || 'bep');
const DEF = { mode: 'off', width: 58, copies: 1, big: true };
const get = () => Object.assign({}, DEF, store.get(KEY, {}));
const save = s => store.set(KEY, s);
const DOTS = { 58: 384, 80: 576 };   // số chấm in mỗi dòng
const STN = { bep: 'BẾP', pha_che: 'PHA CHẾ' };

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
const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
/* Đường dẫn mở app RawBT (chưa cài thì Android mở cửa hàng Play để cài) */
const rawbtUrl = u8 => 'intent:base64,' + toB64(u8) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
const go = url => (window.BENOC_PRINT_HOOK || (u => { location.href = u; }))(url);

/* In bằng hộp thoại in của trình duyệt (khung ẩn, đúng khổ giấy) */
function browserPrint(cv, set) {
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument, img = cv.toDataURL('image/png');
  d.open(); d.write('<!doctype html><html><head><meta charset="utf-8"><style>@page{size:' + set.width + 'mm auto;margin:0}html,body{margin:0}img{width:' + set.width + 'mm;display:block}</style></head><body>' + Array.from({ length: set.copies || 1 }, () => '<img src="' + img + '">').join('') + '</body></html>'); d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { ui.toast('Không mở được hộp thoại in'); } setTimeout(() => f.remove(), 60000); }, 300);
}

function printTicket(o, items, extra, set) {
  set = set || get();
  if (set.mode === 'off' || !items.length) return false;
  const cv = ticketCanvas(o, items, extra, set);
  if (set.mode === 'rawbt') go(rawbtUrl(escpos(cv, set.copies)));
  else browserPrint(cv, set);
  return true;
}

/* ---------- Cài đặt máy in (từng máy) ---------- */
function sample() {
  return { o: { id: 'abcd1234', queue_number: 12, customer_name: 'Khách thử', customer_phone: '0912345678', dine_type: 'tai_quan', created_at: new Date().toISOString(), note: 'In thử phiếu' },
    items: [{ qty: 2, item_name: window.BENOC_STATION === 'pha_che' ? 'Hồng trà sữa trân châu' : 'Cơm heo chua ngọt', options: window.BENOC_STATION === 'pha_che' ? [{ group: 'Upsize', choice: 'Upsize', price: 10000 }, { group: 'Đường', choice: 'Ít đường' }, { group: 'Topping thêm', choice: 'Trân châu hoàng gia' }] : [{ group: 'Topping thêm', choice: 'Trứng ốp la' }], note: 'ít cay' },
      { qty: 1, item_name: window.BENOC_STATION === 'pha_che' ? 'Trà đào' : 'Kimbap chiên', options: [], note: null }] };
}
function openSettings(onChange) {
  let s = get();
  const preview = () => { const x = sample(); return ticketCanvas(x.o, x.items, { minutes: 10 }, s).toDataURL('image/png'); };
  const body = () => '' +
    '<div class="field">Cách in</div><div class="pr-modes">' +
    [['rawbt', 'Qua app RawBT (khuyên dùng)', 'Máy in nhiệt Bluetooth trên Android. Cài app RawBT từ Play Store, mở app chọn máy in Bluetooth một lần.'],
     ['browser', 'Hộp thoại in của trình duyệt', 'Khi máy in có dịch vụ in riêng trên Android (ứng dụng của hãng máy in).'],
     ['off', 'Không in', 'Tắt in phiếu trên máy này.']].map(([k, t, d]) => '<label class="check"><input type="radio" name="prm" value="' + k + '"' + (s.mode === k ? ' checked' : '') + '><span><b>' + t + '</b><small>' + d + '</small></span></label>').join('') + '</div>' +
    '<div class="field">Khổ giấy</div><div class="seg2">' + [58, 80].map(w => '<button type="button" data-w="' + w + '" aria-pressed="' + (s.width === w) + '">' + w + ' mm</button>').join('') + '</div>' +
    '<div class="grid2"><label class="field" for="prCopies">Số bản mỗi lần<input id="prCopies" class="num" type="number" min="1" max="3" value="' + s.copies + '"></label>' +
    '<label class="check" style="align-self:end"><input type="checkbox" id="prBig"' + (s.big ? ' checked' : '') + '><span><b>Chữ to</b><small>Dễ đọc khi đứng bếp</small></span></label></div>' +
    '<div class="field">Xem trước phiếu</div><div class="pr-prev"><img src="' + preview() + '" alt="Phiếu mẫu" style="width:' + (s.width === 80 ? 288 : 220) + 'px"></div>' +
    '<p class="small muted" style="margin:0">Phiếu chỉ in khi bấm <b>Nhận đơn</b>, chỉ có món của ' + (window.BENOC_STATION === 'pha_che' ? 'quầy pha chế' : 'bếp') + ' (không in giá). Bấm <b>In lại phiếu</b> trên thẻ đơn nếu cần in lại.</p>';
  ui.sheet(ui.head('Máy in phiếu ' + (window.BENOC_STATION === 'pha_che' ? 'pha chế' : 'bếp'), 'Cài riêng trên máy này') + '<div class="sh-body pr-set" id="prBody">' + body() + '</div>' +
    '<div class="sh-foot"><button class="btn btn-line" type="button" id="prTest">In thử</button><button class="btn grow" type="button" id="prSave">Lưu</button></div>', sh => {
    const redraw = () => { const top = sh.querySelector('#prBody').scrollTop; s.copies = Math.max(1, Math.min(3, Number(sh.querySelector('#prCopies').value) || 1)); s.big = sh.querySelector('#prBig').checked; sh.querySelector('#prBody').innerHTML = body(); sh.querySelector('#prBody').scrollTop = top; };
    sh.addEventListener('change', e => { if (e.target.name === 'prm') s.mode = e.target.value; redraw(); });
    sh.addEventListener('click', e => {
      const w = e.target.closest('[data-w]'); if (w) { s.width = Number(w.dataset.w); redraw(); return; }
      if (e.target.closest('#prTest')) { redraw(); const x = sample(); if (s.mode === 'off') { ui.toast('Chọn cách in trước'); return; } printTicket(x.o, x.items, { minutes: 10 }, s); }
      if (e.target.closest('#prSave')) { redraw(); save(s); ui.close(); ui.toast(s.mode === 'off' ? 'Đã tắt in phiếu trên máy này' : 'Đã lưu. Bấm Nhận đơn là in phiếu.'); if (onChange) onChange(s); }
    });
  });
}

window.BNPrint = { get, save, ticketCanvas, escpos, rawbtUrl, printTicket, openSettings };
})();
