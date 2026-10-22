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
const { esc, hhmm, store, ui, sizeOf, isSizeOpt, sizeText, isTakeaway, isDelivery } = BN; // (không in mã đơn, không in giá)
const STATION = window.BENOC_STATION || 'bep';
const KEY = 'printer.' + STATION;
/* mode = cách in phiếu món, tmode = cách in tem dán ly ('off' | 'rawbt' | 'ble' | 'browser') */
const DEF = { mode: 'off', width: 58, copies: 1, big: true, tmode: 'off', label: '40x30', lang: 'tspl', inv: false, offx: 0, offy: 0, auto: true };
function get() {
  const raw = store.get(KEY, {}), s = Object.assign({}, DEF, raw);
  if (raw.job) { if (raw.job === 'tem') { s.tmode = raw.mode || 'off'; s.mode = 'off'; } delete s.job; } // cài đặt bản trước (1 việc / máy)
  return s;
}
const save = s => store.set(KEY, s);
const DOTS = { 58: 384, 80: 576 };   // số chấm in mỗi dòng
/* Khổ tem (máy 203 dpi = 8 chấm/mm). "58" = cuộn giấy dán liên tục 58 mm, mỗi tem cao 30 mm */
const LABELS = { '40x30': { w: 40, h: 30, gap: 2 }, '50x30': { w: 50, h: 30, gap: 2 }, '50x40': { w: 50, h: 40, gap: 2 }, '58': { w: 48, h: 30, gap: 0, roll: true } };
const labelOf = set => LABELS[set.label] || LABELS['40x30'];
const jobs = set => [set.mode !== 'off' && 'phieu', set.tmode !== 'off' && 'tem'].filter(Boolean);

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
    const TIN = 24; // giờ in lùi vào trong và lên trên 3 mm (mép tem hay bị xén)
    const fits = y <= H - pad - TIN - lh(16);
    if (!fits && k > 0.61) continue;
    ops.push({ t: hhmm(Date.now()), font: F(18, true), y: H - pad - TIN, right: true, inset: TIN });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
    if (set.offx < 0 || set.offy < 0) ctx.translate(Math.min(0, Math.round((set.offx || 0) * 8)), Math.min(0, Math.round((set.offy || 0) * 8))); // căn lề trái / lên
    ops.forEach(op => {
      if (op.rule) { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pad, op.y); ctx.lineTo(W - pad, op.y); ctx.stroke(); return; }
      ctx.font = op.font; ctx.textBaseline = 'alphabetic'; ctx.textAlign = op.right ? 'right' : 'left';
      ctx.fillText(op.t, op.right ? W - pad - (op.inset || 0) : pad, op.y);
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
  const x = Math.max(0, Math.round((set.offx || 0) * 8)), y = Math.max(0, Math.round((set.offy || 0) * 8)); // căn lề: dịch tem (mm)
  cvs.forEach(cv => {
    const b = bits(cv);
    out.push(...ascii('CLS\r\nBITMAP ' + x + ',' + y + ',' + b.bw + ',' + b.H + ',0,'));
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

/* ---------- Bluetooth trực tiếp (Chrome nối thẳng máy in tem BLE) ---------- */
const BLE_SVCS = ['49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '6e400001-b5a3-f393-e0a9-e50e24dcca9e', 0xff00, 0xffe0, 0xfff0, 0x18f0, 0xae30, 0xae00];
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
async function bleOpen(k) {
  const b = slots[k], g = await b.dev.gatt.connect();
  const writable = [];
  for (const sv of await g.getPrimaryServices()) {
    let cs = []; try { cs = await sv.getCharacteristics(); } catch (e) { continue; }
    cs.forEach(c => { if (c.properties.write || c.properties.writeWithoutResponse) writable.push(c); });
  }
  b.ch = writable.find(c => /49535343-8841|bef8d6c9|ff02|ae01|2af1|fff2|ffe1/i.test(c.uuid)) || writable[0] || null;
  if (!b.ch) throw new Error('Máy này không nhận lệnh in qua Bluetooth');
  store.set(nameKey(k), b.dev.name || ''); bleEmit();
}
async function bleAttach(k, dev) {
  const b = slots[k];
  if (b.dev !== dev) { b.dev = dev; dev.addEventListener('gattserverdisconnected', () => { if (b.dev === dev) { b.ch = null; bleEmit(); } }); }
  await bleOpen(k);
}
/* Chọn máy in (trình duyệt bắt buộc người dùng bấm) */
async function bleConnect(k) {
  if (!canBle()) throw new Error(isIOS() ? 'Trên iPhone, mở trang bằng app Bluefy (App Store) để nối Bluetooth.' : 'Trình duyệt này không nối Bluetooth được. Mở bằng Chrome.');
  const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SVCS });
  await bleAttach(k, dev); return dev.name;
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
    for (let i = 0; i < u8.length; i += 180) await b.ch.writeValueWithResponse(u8.subarray(i, i + 180));
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
function bleOut(j, kind) { return bleSend(kind, j.ble).catch(e => { ui.toast((kind === 'tem' ? 'Chưa in được tem: ' : 'Chưa in được phiếu: ') + (e.code === 'NO_BLE' ? 'bấm Kết nối ' + SLOT_NAME[kind] : e.message)); if (window.BNPrintFail) window.BNPrintFail(kind, e); throw e; }); }
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
    items: [{ qty: 2, item_name: window.BENOC_STATION === 'pha_che' ? 'Hồng trà sữa trân châu' : 'Cơm heo chua ngọt', options: window.BENOC_STATION === 'pha_che' ? [{ group: 'Upsize', choice: 'Upsize', price: 10000 }, { group: 'Đường', choice: 'Ít đường' }, { group: 'Topping thêm', choice: 'Trân châu hoàng gia' }] : [{ group: 'Topping thêm', choice: 'Trứng ốp la' }], note: 'ít cay' },
      { qty: 1, item_name: window.BENOC_STATION === 'pha_che' ? 'Trà đào' : 'Kimbap chiên', options: [], note: null }] };
}
function openSettings(onChange) {
  let s = get();
  const PLACE = STATION === 'pha_che' ? 'quầy pha chế' : 'bếp';
  const seg = (attr, cur, list) => '<div class="seg2" style="grid-template-columns:repeat(' + list.length + ',1fr)">' + list.map(([v, t]) => '<button type="button" data-' + attr + '="' + v + '" aria-pressed="' + (String(cur) === String(v)) + '">' + t + '</button>').join('') + '</div>';
  const radios = (name, cur, list) => '<div class="pr-modes">' + list.map(([k, t, d]) => '<label class="check"><input type="radio" name="' + name + '" value="' + k + '"' + (cur === k ? ' checked' : '') + '><span><b>' + t + '</b><small>' + d + '</small></span></label>').join('') + '</div>';
  const prevT = () => { const x = sample(); return '<div class="pr-prev"><img src="' + ticketCanvas(x.o, x.items, { minutes: 10 }, s).toDataURL('image/png') + '" alt="Phiếu mẫu" style="width:' + (s.width === 80 ? 288 : 220) + 'px"></div>'; };
  const prevL = () => { const x = sample(); return '<div class="pr-prev">' + cups(x.items).slice(0, 2).map(c => '<img src="' + labelCanvas(x.o, c, s).toDataURL('image/png') + '" alt="Tem mẫu" style="width:' + labelOf(s).w * 4.4 + 'px">').join('') + '</div>'; };
  const bleBox = k => '<div class="pr-ble"><span class="grow">' + (bleOk(k) ? '<b class="ok">● Đã nối</b> ' + esc(bleName(k)) : bleName(k) ? '<b class="bad">● Chưa nối</b> ' + esc(bleName(k)) : 'Chưa chọn ' + SLOT_NAME[k]) + '</span><button class="btn btn-sm" type="button" data-ble="' + k + '">' + (bleName(k) ? 'Kết nối lại' : 'Chọn ' + SLOT_NAME[k]) + '</button></div>' +
    '<p class="small muted" style="margin:0">' + (canBle() ? 'Tắt app riêng của máy in trước (máy chỉ nối được một nơi). Bật Bluetooth' + (isIOS() ? '.' : ' và Vị trí.') : isIOS() ? '<b>iPhone:</b> Safari / Chrome không nối Bluetooth được. Cài app <b>Bluefy</b> (App Store) rồi mở trang này bằng Bluefy.' : 'Trình duyệt này không nối Bluetooth được, mở bằng Chrome.') + '</p>';
  const IOS = isIOS();
  const body = () => '' +
    '<section class="pr-sec"><h3>Phiếu món</h3><p class="small muted" style="margin:0 0 6px">Phiếu các món của ' + PLACE + ' (không in giá, không in mã đơn) để người làm xem.</p>' +
    radios('prm', s.mode, [IOS ? null : ['rawbt', 'Qua app RawBT (Android)', 'Máy in mặc định trong RawBT (ví dụ MPT-II). Mở RawBT chọn máy một lần.'], ['ble', 'Bluetooth trực tiếp', 'Trang nối thẳng máy in phiếu. Dùng trên iPhone (qua app Bluefy) hoặc khi RawBT đã dùng cho máy khác.'], IOS ? null : ['browser', 'Hộp thoại in của trình duyệt', 'Máy in có ứng dụng in riêng của hãng.'], ['off', 'Không in phiếu', 'Máy này không in phiếu.']].filter(Boolean)) +
    (s.mode === 'ble' ? bleBox('phieu') : '') +
    (s.mode !== 'off' ? '<div class="field">Khổ giấy</div>' + seg('w', s.width, [[58, '58 mm'], [80, '80 mm']]) +
      '<div class="grid2"><label class="field" for="prCopies">Số bản mỗi lần<input id="prCopies" class="num" type="number" min="1" max="3" value="' + s.copies + '"></label>' +
      '<label class="check" style="align-self:end"><input type="checkbox" id="prBig"' + (s.big ? ' checked' : '') + '><span><b>Chữ to</b><small>Dễ đọc khi đứng làm</small></span></label></div>' + prevT() +
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
    const read = () => { if (q('#prCopies')) s.copies = Math.max(1, Math.min(3, Number(q('#prCopies').value) || 1)); if (q('#prBig')) s.big = q('#prBig').checked; if (q('#prInv')) s.inv = q('#prInv').checked; s.auto = q('#prAuto').checked; };
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
        try { const n = await bleConnect(k); ui.toast('Đã nối ' + SLOT_NAME[k] + ' ' + (n || '')); } catch (err) { if (!/cancel/i.test(err.message)) ui.toast('Không nối được: ' + err.message); }
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
  ble: { ok: bleOk, has: k => !!slots[k].dev || !!window.BENOC_BLE_HOOK, name: bleName, label: k => SLOT_NAME[k], connect: bleConnect, restore: bleRestore, send: bleSend, on: f => { bleSubs.push(f); } } };
})();
