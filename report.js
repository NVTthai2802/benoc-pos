/* =====================================================================
   BÁO CÁO EXCEL THÁNG — tạo ngay trên trình duyệt (thư viện ExcelJS)
   Các trang: Tổng quan · Theo ngày · Theo tuần · Theo giờ · Món bán chạy · Ưu đãi ·
              Hoá đơn · Kho hàng · Nhập xuất kho · Nhân viên & lương · Ca làm
   Số tổng dùng công thức Excel (SUM, SUMIFS…) nên sửa số liệu trong file thì tổng tự tính lại.
   ===================================================================== */
(function () {
'use strict';
const { api, DRINK_CATS } = BN;
const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
const C = { ink: 'FF3B2A24', red: 'FFE2325C', head: 'FF3B2A24', headInk: 'FFFFFFFF', soft: 'FFFFF3C4', band: 'FFFDF8EE', line: 'FFE7D9C2', ok: 'FF2E7D4F', bad: 'FFC62828', note: 'FF7A6A5E' };
const FONT = 'Arial';
const MONEY = '#,##0" đ";-#,##0" đ";"-"', INT = '#,##0;-#,##0;"-"', DEC = '#,##0.0;-#,##0.0;"-"', PCT = '0.0%;-0.0%;"-"', DATE = 'dd/mm/yyyy', TIME = 'hh:mm', DT = 'dd/mm/yyyy hh:mm';
const DOW = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const DINE = { tai_quan: 'Ăn tại quán', mang_ve: 'Mang về', giao_hang: 'Giao hàng' };
const PAY = { tien_mat: 'Tiền mặt', chuyen_khoan: 'Chuyển khoản' };
const ROLE = { owner: 'Chủ quán', staff: 'Nhân viên', kitchen: 'Máy bếp', bar: 'Máy pha chế' };
const KIND = { nhap: 'Nhập hàng', dung: 'Lấy dùng', hong: 'Hỏng / mất', kiem: 'Kiểm kho' };
const pad = n => String(n).padStart(2, '0');
/* ExcelJS ghi ngày giờ theo UTC: đổi giờ máy (Việt Nam) sang "giờ ghi trong ô" để Excel hiện đúng giờ quán */
const xd = v => { if (v == null) return null; const d = new Date(v); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds())); };
const dayKey = v => { const d = new Date(v); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const colL = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const sumOf = (arr, f) => arr.reduce((t, x) => t + (Number(f(x)) || 0), 0);

/* ---------- Khung trình bày chung ---------- */
function sheetOf(wb, name, title, sub, cols, tab) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: tab || C.red } }, views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
  ws.columns = cols.map(c => ({ key: c.key, width: c.w || 14 }));
  ws.mergeCells(1, 1, 1, Math.max(cols.length, 4));
  Object.assign(ws.getCell('A1'), { value: title }); ws.getCell('A1').font = { name: FONT, size: 15, bold: true, color: { argb: C.red } };
  ws.mergeCells(2, 1, 2, Math.max(cols.length, 4));
  ws.getCell('A2').value = sub; ws.getCell('A2').font = { name: FONT, size: 10, italic: true, color: { argb: C.note } };
  ws.getRow(1).height = 24;
  const h = ws.getRow(4);
  cols.forEach((c, i) => { const cell = h.getCell(i + 1); cell.value = c.h; cell.font = { name: FONT, bold: true, size: 10, color: { argb: C.headInk } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } }; cell.alignment = { vertical: 'middle', horizontal: c.num ? 'right' : 'left', wrapText: true, indent: c.num ? 0 : 1 }; cell.border = { bottom: { style: 'thin', color: { argb: C.head } } }; });
  h.height = 30;
  ws.pageSetup.printTitlesRow = '4:4'; // in nhiều trang: trang nào cũng có dòng tiêu đề cột
  ws._cols = cols; ws._next = 5;
  return ws;
}
/* Ghi 1 dòng dữ liệu; v có thể là số, chữ, ngày, hoặc { formula, result } */
function addRow(ws, vals, opt) {
  opt = opt || {};
  const r = ws.getRow(ws._next++);
  ws._cols.forEach((c, i) => {
    const cell = r.getCell(i + 1), v = vals[c.key];
    cell.value = v === undefined ? null : v;
    cell.font = { name: FONT, size: 10, bold: !!opt.bold, color: { argb: opt.color || (c.color && c.color(vals)) || C.ink } };
    if (c.fmt) cell.numFmt = c.fmt;
    cell.alignment = { vertical: 'top', horizontal: c.num ? 'right' : 'left', wrapText: !!c.wrap, indent: c.num ? 0 : 1 }; // chữ cách số bên cạnh
    cell.border = { bottom: { style: 'hair', color: { argb: C.line } } };
    if (opt.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opt.fill } };
    else if ((r.number - 5) % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.band } };
  });
  if (opt.total) r.eachCell(cell => { cell.border = { top: { style: 'medium', color: { argb: C.head } }, bottom: { style: 'medium', color: { argb: C.head } } }; });
  return r;
}
/* Dòng tổng: cột có sum = true dùng SUBTOTAL (vẫn đúng khi lọc) */
function totalRow(ws, label, first, last, extra) {
  last = ws._next - 1; // dòng dữ liệu cuối; chưa có dòng nào thì tổng = 0 (tránh tự cộng chính nó)
  const vals = {}; ws._cols.forEach((c, i) => { if (c.sum) { const L = colL(i + 1); vals[c.key] = last >= first ? { formula: 'SUBTOTAL(9,' + L + first + ':' + L + last + ')' } : 0; } });
  vals[ws._cols[0].key] = label; Object.assign(vals, extra || {});
  return addRow(ws, vals, { bold: true, fill: C.soft, total: true });
}
const note = (ws, text) => { const r = ws.getRow(ws._next++ + 1); r.getCell(1).value = text; r.getCell(1).font = { name: FONT, size: 9, italic: true, color: { argb: C.note } }; ws._next++; };
const fx = (formula, result) => ({ formula, result: result == null ? undefined : result });

async function build(month, onStep) {
  onStep = onStep || (() => {});
  const y = month.getFullYear(), m = month.getMonth(), from = new Date(y, m, 1), to = new Date(y, m + 1, 1);
  const now = new Date(), lastDay = to > now ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : new Date(y, m + 1, 0);
  const label = pad(m + 1) + '/' + y;
  onStep('Đang tải dữ liệu tháng ' + label + '…');
  const [data, prev, menu, settings] = await Promise.all([api.reportData({ from, to }), api.sales({ from: new Date(y, m - 1, 1), to: from }).catch(() => []), api.adminMenu().catch(() => null), api.settings().catch(() => ({}))]);
  if (!window.ExcelJS) { onStep('Đang tải thư viện Excel…'); await BN.loadScript(LIB); }
  onStep('Đang tạo file…');
  const sales = data.sales, shop = settings.shop_name || 'Bé Nốc';
  const catOf = new Map(); if (menu) { const cs = new Map(menu.categories.map(c => [c.id, c])); menu.items.forEach(it => catOf.set(it.id, cs.get(it.category_id))); }
  const kindOf = i => { const c = catOf.get(i.menu_item_id); return c ? ((c.station === 'pha_che' || DRINK_CATS.test(c.name)) ? 'Đồ uống' : 'Món ăn') : (i.station === 'pha_che' ? 'Đồ uống' : 'Món ăn'); };
  const empName = new Map(data.employees.map(e => [e.id, e.full_name]));
  const wb = new window.ExcelJS.Workbook(); wb.creator = shop + ' POS'; wb.created = new Date();
  const sub = shop + ' · từ 01/' + label + ' đến ' + pad(new Date(y, m + 1, 0).getDate()) + '/' + label + ' · xuất lúc ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ' ' + pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear();

  /* ===== Tổng quan (tạo trước để đứng đầu, điền sau) ===== */
  const ov = sheetOf(wb, 'Tổng quan', 'BÁO CÁO THÁNG ' + label + ' · ' + shop.toUpperCase(), sub, [{ key: 'a', h: 'Chỉ số', w: 34 }, { key: 'b', h: 'Giá trị', w: 20, num: true }, { key: 'c', h: 'Ghi chú', w: 60, wrap: true }], C.red);

  /* ===== Theo ngày ===== */
  const days = []; for (let d = new Date(from); d <= lastDay; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  const byDay = new Map(days.map(d => [dayKey(d), []])); sales.forEach(s => { const k = dayKey(s.paid_at); if (byDay.has(k)) byDay.get(k).push(s); });
  const avgMin = (list, st) => { const v = list.map(s => s.station_minutes && s.station_minutes[st]).filter(x => x != null); return v.length ? Math.round(sumOf(v, x => x) / v.length * 10) / 10 : null; };
  const dCols = [{ key: 'd', h: 'Ngày', w: 12, fmt: DATE }, { key: 'w', h: 'Thứ', w: 10, color: v => /Chủ nhật|Thứ 7/.test(v.w) ? C.red : null }, { key: 'n', h: 'Số hoá đơn', w: 11, num: true, fmt: INT, sum: true },
    { key: 'rev', h: 'Doanh thu', w: 15, num: true, fmt: MONEY, sum: true }, { key: 'cash', h: 'Tiền mặt', w: 14, num: true, fmt: MONEY, sum: true }, { key: 'bank', h: 'Chuyển khoản', w: 14, num: true, fmt: MONEY, sum: true },
    { key: 'tq', h: 'Ăn tại quán', w: 14, num: true, fmt: MONEY, sum: true }, { key: 'mv', h: 'Mang về', w: 13, num: true, fmt: MONEY, sum: true }, { key: 'gh', h: 'Giao hàng', w: 13, num: true, fmt: MONEY, sum: true },
    { key: 'avg', h: 'TB / hoá đơn', w: 13, num: true, fmt: MONEY }, { key: 'kb', h: 'Bếp làm TB (phút)', w: 12, num: true, fmt: DEC }, { key: 'kp', h: 'Pha chế TB (phút)', w: 12, num: true, fmt: DEC }];
  const wd = sheetOf(wb, 'Theo ngày', 'DOANH THU THEO NGÀY · ' + label, sub, dCols, 'FFF2B33D');
  const dFirst = wd._next;
  days.forEach(d => {
    const L = byDay.get(dayKey(d)), r = wd._next, by = k => sumOf(L.filter(s => (s.dine_type || 'tai_quan') === k), s => s.total);
    addRow(wd, { d: xd(d), w: DOW[d.getDay()], n: L.length, rev: sumOf(L, s => s.total), cash: sumOf(L.filter(s => s.payment_method === 'tien_mat'), s => s.total), bank: sumOf(L.filter(s => s.payment_method === 'chuyen_khoan'), s => s.total),
      tq: by('tai_quan'), mv: by('mang_ve'), gh: by('giao_hang'), avg: fx('IFERROR(D' + r + '/C' + r + ',0)', L.length ? sumOf(L, s => s.total) / L.length : 0), kb: avgMin(L, 'bep'), kp: avgMin(L, 'pha_che') });
  });
  const dLast = wd._next - 1, dTot = wd._next;
  totalRow(wd, 'Cả tháng', dFirst, dLast, { avg: fx('IFERROR(D' + dTot + '/C' + dTot + ',0)'), kb: avgMin(sales, 'bep'), kp: avgMin(sales, 'pha_che') });
  wd.autoFilter = { from: 'A4', to: colL(dCols.length) + dLast };
  note(wd, 'Doanh thu tính theo lúc thu tiền. Cột Thứ tô đỏ là cuối tuần. Bếp / pha chế TB: số phút trung bình từ lúc nhận đơn tới lúc ra món.');

  /* ===== Theo tuần (công thức SUMIFS lấy từ trang Theo ngày) ===== */
  const wCols = [{ key: 't', h: 'Tuần', w: 9 }, { key: 'a', h: 'Từ ngày', w: 12, fmt: DATE }, { key: 'b', h: 'Đến ngày', w: 12, fmt: DATE }, { key: 'n', h: 'Số hoá đơn', w: 11, num: true, fmt: INT, sum: true },
    { key: 'rev', h: 'Doanh thu', w: 15, num: true, fmt: MONEY, sum: true }, { key: 'cash', h: 'Tiền mặt', w: 14, num: true, fmt: MONEY, sum: true }, { key: 'bank', h: 'Chuyển khoản', w: 14, num: true, fmt: MONEY, sum: true },
    { key: 'avg', h: 'TB / hoá đơn', w: 13, num: true, fmt: MONEY }, { key: 'pd', h: 'TB / ngày', w: 13, num: true, fmt: MONEY }, { key: 'share', h: '% tháng', w: 9, num: true, fmt: PCT }];
  const ww = sheetOf(wb, 'Theo tuần', 'DOANH THU THEO TUẦN · ' + label, sub, wCols, 'FFF2B33D');
  const weeks = []; let ws0 = new Date(from);
  while (ws0 <= lastDay) { const we = new Date(ws0); we.setDate(we.getDate() + ((7 - we.getDay()) % 7)); const end = we > lastDay ? new Date(lastDay) : we; weeks.push([new Date(ws0), end]); ws0 = new Date(end); ws0.setDate(ws0.getDate() + 1); }
  const wFirst = ww._next, wTotRow = wFirst + weeks.length;
  const rng = col => "'Theo ngày'!$" + col + '$' + dFirst + ':$' + col + '$' + dLast, crit = r => ",'Theo ngày'!$A$" + dFirst + ':$A$' + dLast + ',">="&B' + r + ",'Theo ngày'!$A$" + dFirst + ':$A$' + dLast + ',"<="&C' + r;
  weeks.forEach(([a, b], k) => {
    const r = ww._next, L = sales.filter(s => { const t = new Date(s.paid_at); return t >= a && t < new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1); }), rev = sumOf(L, s => s.total);
    addRow(ww, { t: 'Tuần ' + (k + 1), a: xd(a), b: xd(b), n: fx('SUMIFS(' + rng('C') + crit(r) + ')', L.length), rev: fx('SUMIFS(' + rng('D') + crit(r) + ')', rev),
      cash: fx('SUMIFS(' + rng('E') + crit(r) + ')', sumOf(L.filter(s => s.payment_method === 'tien_mat'), s => s.total)), bank: fx('SUMIFS(' + rng('F') + crit(r) + ')', sumOf(L.filter(s => s.payment_method === 'chuyen_khoan'), s => s.total)),
      avg: fx('IFERROR(E' + r + '/D' + r + ',0)'), pd: fx('IFERROR(E' + r + '/(C' + r + '-B' + r + '+1),0)'), share: fx('IFERROR(E' + r + '/$E$' + wTotRow + ',0)') });
  });
  totalRow(ww, 'Cả tháng', wFirst, ww._next - 1, { avg: fx('IFERROR(E' + wTotRow + '/D' + wTotRow + ',0)'), pd: fx('IFERROR(E' + wTotRow + '/' + days.length + ',0)'), share: fx('IFERROR(E' + wTotRow + '/E' + wTotRow + ',0)') });
  note(ww, 'Tuần tính từ Thứ 2 đến Chủ nhật, cắt theo ngày đầu và cuối tháng. Số liệu lấy từ trang Theo ngày.');

  /* ===== Theo giờ ===== */
  const hCols = [{ key: 'h', h: 'Khung giờ', w: 14 }, { key: 'n', h: 'Số hoá đơn', w: 11, num: true, fmt: INT, sum: true }, { key: 'rev', h: 'Doanh thu', w: 15, num: true, fmt: MONEY, sum: true }, { key: 'share', h: '% doanh thu', w: 11, num: true, fmt: PCT }, { key: 'pd', h: 'TB hoá đơn / ngày', w: 14, num: true, fmt: DEC }];
  const wh = sheetOf(wb, 'Theo giờ', 'KHÁCH ĐÔNG GIỜ NÀO · ' + label, sub, hCols, 'FFF2B33D');
  const hrs = new Map(); sales.forEach(s => { const h = new Date(s.paid_at).getHours(); const v = hrs.get(h) || { n: 0, rev: 0 }; v.n++; v.rev += s.total; hrs.set(h, v); });
  const hList = [...hrs.keys()].sort((a, b) => a - b), hFirst = wh._next, hTot = hFirst + hList.length;
  hList.forEach(h => { const r = wh._next, v = hrs.get(h); addRow(wh, { h: pad(h) + ':00 – ' + pad(h + 1) + ':00', n: v.n, rev: v.rev, share: fx('IFERROR(C' + r + '/$C$' + hTot + ',0)'), pd: fx('IFERROR(B' + r + '/' + days.length + ',0)') }); });
  totalRow(wh, 'Cả tháng', hFirst, Math.max(hFirst, wh._next - 1), { share: fx('IFERROR(C' + hTot + '/C' + hTot + ',0)'), pd: fx('IFERROR(B' + hTot + '/' + days.length + ',0)') });
  note(wh, 'Theo giờ thu tiền. Dùng để xếp ca: giờ nhiều hoá đơn cần thêm người.');

  /* ===== Món bán chạy ===== */
  const items = new Map();
  sales.forEach(s => (s.items || []).forEach(i => { const k = i.name; const v = items.get(k) || { name: k, kind: kindOf(i), qty: 0, gift: 0, rev: 0 }; if (i.promo_part === 'tang') v.gift += i.qty; else v.qty += i.qty; v.rev += i.price * i.qty; items.set(k, v); }));
  const iList = [...items.values()].sort((a, b) => b.qty - a.qty || b.rev - a.rev);
  const iCols = [{ key: 'k', h: '#', w: 5, num: true }, { key: 'name', h: 'Món', w: 34 }, { key: 'kind', h: 'Loại', w: 11 }, { key: 'qty', h: 'Số phần bán', w: 12, num: true, fmt: INT, sum: true }, { key: 'gift', h: 'Số phần tặng', w: 12, num: true, fmt: INT, sum: true }, { key: 'rev', h: 'Doanh thu', w: 15, num: true, fmt: MONEY, sum: true }, { key: 'share', h: '% doanh thu', w: 11, num: true, fmt: PCT }];
  const wi = sheetOf(wb, 'Món bán chạy', 'MÓN BÁN CHẠY · ' + label, sub, iCols, 'FFE2325C');
  const iFirst = wi._next, iTot = iFirst + iList.length;
  iList.forEach((v, k) => { const r = wi._next; addRow(wi, { k: k + 1, name: v.name, kind: v.kind, qty: v.qty, gift: v.gift, rev: v.rev, share: fx('IFERROR(F' + r + '/$F$' + iTot + ',0)') }); });
  totalRow(wi, '', iFirst, Math.max(iFirst, wi._next - 1), { name: 'Tất cả', share: fx('IFERROR(F' + iTot + '/F' + iTot + ',0)') });
  wi.autoFilter = { from: 'A4', to: 'G' + Math.max(iFirst, iTot - 1) };
  note(wi, 'Món trong combo được chia giá theo tỉ lệ giá gốc nên doanh thu từng món vẫn khớp tổng. Món tặng không tính tiền, đếm riêng ở cột Số phần tặng. Lọc cột Loại để xem riêng Món ăn hoặc Đồ uống.');

  /* ===== Ưu đãi ===== */
  const promos = new Map();
  sales.forEach(s => { const g = new Map(); (s.items || []).forEach(i => { if (!i.promo_group) return; const x = g.get(i.promo_group) || { name: i.promo_name || 'Ưu đãi', kind: i.promo_kind, rev: 0, gift: 0 }; x.rev += i.price * i.qty; if (i.promo_part === 'tang') x.gift += i.qty; g.set(i.promo_group, x); });
    g.forEach(x => { const v = promos.get(x.name) || { name: x.name, kind: x.kind === 'combo' ? 'Combo' : 'Mua tặng', n: 0, gift: 0, rev: 0 }; v.n++; v.gift += x.gift; v.rev += x.rev; promos.set(x.name, v); });
    // Giảm giá / đồng giá: mỗi món bán được tính 1 lần dùng
    (s.items || []).forEach(i => { if (i.promo_kind !== 'giam_gia') return; const k = i.promo_name || 'Giảm giá'; const v = promos.get(k) || { name: k, kind: 'Giảm giá', n: 0, gift: 0, rev: 0 }; v.n += i.qty; v.rev += i.price * i.qty; promos.set(k, v); }); });
  if (promos.size) {
    const pCols = [{ key: 'name', h: 'Ưu đãi', w: 34 }, { key: 'kind', h: 'Loại', w: 12 }, { key: 'n', h: 'Số lần khách đặt', w: 14, num: true, fmt: INT, sum: true }, { key: 'gift', h: 'Món tặng', w: 11, num: true, fmt: INT, sum: true }, { key: 'rev', h: 'Tiền thu', w: 15, num: true, fmt: MONEY, sum: true }];
    const wp = sheetOf(wb, 'Ưu đãi', 'ƯU ĐÃI ĐÃ BÁN · ' + label, sub, pCols, 'FFA47ACB'); const pFirst = wp._next;
    [...promos.values()].sort((a, b) => b.n - a.n).forEach(v => addRow(wp, v));
    totalRow(wp, 'Tất cả', pFirst, wp._next - 1);
  }

  /* ===== Hoá đơn ===== */
  const bCols = [{ key: 'd', h: 'Ngày', w: 11, fmt: DATE }, { key: 't', h: 'Giờ', w: 7, fmt: TIME }, { key: 'dine', h: 'Loại đơn', w: 12 }, { key: 'q', h: 'Số bàn', w: 8, num: true },
    { key: 'name', h: 'Khách', w: 16 }, { key: 'phone', h: 'SĐT', w: 13 }, { key: 'addr', h: 'Địa chỉ giao', w: 22, wrap: true }, { key: 'items', h: 'Món', w: 50, wrap: true }, { key: 'n', h: 'Số món', w: 8, num: true, fmt: INT, sum: true },
    { key: 'total', h: 'Tổng tiền', w: 14, num: true, fmt: MONEY, sum: true }, { key: 'pay', h: 'Thanh toán', w: 13 }, { key: 'who', h: 'Người thu', w: 14 }];
  const wb2 = sheetOf(wb, 'Hoá đơn', 'TẤT CẢ HOÁ ĐƠN · ' + label, sub, bCols, 'FF7A5C3E');
  const bFirst = wb2._next;
  sales.forEach(s => {
    const txt = (s.items || []).map(i => i.qty + '× ' + i.name + ((i.options || []).length ? ' (' + i.options.map(o => o.choice).join(', ') + ')' : '') + (i.promo_part === 'tang' ? ' [tặng]' : i.promo_group || i.promo_kind === 'giam_gia' ? ' [' + (i.promo_name || 'ưu đãi') + ']' : '')).join('\n');
    addRow(wb2, { d: xd(new Date(new Date(s.paid_at).setHours(0, 0, 0, 0))), t: xd(s.paid_at), dine: DINE[s.dine_type || 'tai_quan'], q: s.queue_number || null,
      name: s.customer_name || '', phone: s.customer_phone || '', addr: s.address || '', items: txt, n: sumOf(s.items || [], i => i.qty), total: s.total, pay: PAY[s.payment_method] || s.payment_method, who: empName.get(s.cashier_id) || '' });
  });
  totalRow(wb2, 'Tổng (' + sales.length + ' hoá đơn)', bFirst, Math.max(bFirst, wb2._next - 1));
  wb2.autoFilter = { from: 'A4', to: colL(bCols.length) + Math.max(bFirst, wb2._next - 2) };
  note(wb2, 'Dùng nút lọc ở dòng tiêu đề để xem theo ngày, loại đơn, cách thanh toán… Dòng Tổng tự tính lại theo các dòng đang hiện.');

  /* ===== Kho hàng ===== */
  const packName = new Map(data.packs.map(p => [p.id, p.name])), mv = new Map();
  data.stockMoves.forEach(x => { const v = mv.get(x.item_id) || { nhap: 0, dung: 0, hong: 0, kiem: 0, cost: 0 }; v[x.kind] += Number(x.delta) || 0; if (x.kind === 'nhap') v.cost += x.cost || 0; mv.set(x.item_id, v); });
  const stockText = it => { const q = Number(it.qty), per = Number(it.per_buy) || 1; if (per <= 1 || it.buy_unit === it.use_unit || Math.abs(q) < per) return q + ' ' + it.use_unit; const w = Math.floor(Math.abs(q) / per), r = Math.round((Math.abs(q) - w * per) * 100) / 100; return (q < 0 ? '−' : '') + w + ' ' + it.buy_unit + (r ? ' + ' + r + ' ' + it.use_unit : ''); };
  const kCols = [{ key: 'g', h: 'Nhóm', w: 21 }, { key: 'name', h: 'Mặt hàng', w: 24 }, { key: 'pack', h: 'Quy cách', w: 24 }, { key: 'unit', h: 'Đơn vị dùng', w: 10 },
    { key: 'qty', h: 'Tồn hiện tại', w: 11, num: true, fmt: DEC }, { key: 'qtxt', h: 'Tồn dễ đọc', w: 22 }, { key: 'min', h: 'Mức báo sắp hết', w: 11, num: true, fmt: DEC }, { key: 'st', h: 'Trạng thái', w: 11, color: v => v.st === 'Sắp hết' ? C.bad : C.ok },
    { key: 'nhap', h: 'Nhập trong tháng', w: 12, num: true, fmt: DEC, sum: false }, { key: 'dung', h: 'Dùng trong tháng', w: 12, num: true, fmt: DEC }, { key: 'hong', h: 'Hỏng / mất', w: 10, num: true, fmt: DEC }, { key: 'kiem', h: 'Lệch kiểm kho', w: 11, num: true, fmt: DEC },
    { key: 'cost', h: 'Tiền nhập trong tháng', w: 15, num: true, fmt: MONEY, sum: true }, { key: 'price', h: 'Giá nhập 1 đv nhập', w: 14, num: true, fmt: MONEY }];
  const wk = sheetOf(wb, 'Kho hàng', 'KHO HÀNG · ' + label, sub, kCols, 'FF3E9B6B');
  const kFirst = wk._next;
  data.stockItems.filter(it => it.is_active !== false || mv.has(it.id)).sort((a, b) => (a.grp || 'zz').localeCompare(b.grp || 'zz', 'vi') || a.name.localeCompare(b.name, 'vi')).forEach(it => {
    const v = mv.get(it.id) || { nhap: 0, dung: 0, hong: 0, kiem: 0, cost: 0 }, low = Number(it.qty) <= Number(it.min_qty || 0);
    addRow(wk, { g: it.grp || 'Chưa xếp nhóm', name: it.name, pack: packName.get(it.pack_id) || (it.buy_unit === it.use_unit && Number(it.per_buy) === 1 ? 'Theo ' + it.use_unit : '1 ' + it.buy_unit + ' = ' + it.per_buy + ' ' + it.use_unit), unit: it.use_unit,
      qty: Number(it.qty), qtxt: stockText(it), min: Number(it.min_qty || 0), st: low ? 'Sắp hết' : 'Đủ', nhap: v.nhap, dung: -v.dung, hong: -v.hong, kiem: v.kiem, cost: v.cost, price: it.cost_per_buy == null ? null : it.cost_per_buy });
  });
  const kTot = wk._next;
  totalRow(wk, data.stockItems.length ? 'Tổng tiền nhập' : 'Chưa có hàng hoá trong kho', kFirst, Math.max(kFirst, wk._next - 1));
  note(wk, 'Tồn hiện tại là số lúc xuất file. Các cột trong tháng tính theo đơn vị dùng. Lệch kiểm kho: âm là thiếu so với sổ, dương là thừa. Hàng Sắp hết tô đỏ.');

  /* ===== Nhập xuất kho ===== */
  const itemById = new Map(data.stockItems.map(i => [i.id, i]));
  const mCols = [{ key: 'd', h: 'Lúc', w: 16, fmt: DT }, { key: 'name', h: 'Mặt hàng', w: 24 }, { key: 'k', h: 'Việc', w: 12 }, { key: 'amt', h: 'Số lượng ghi', w: 11, num: true, fmt: DEC }, { key: 'unit', h: 'Đơn vị', w: 9 },
    { key: 'delta', h: 'Thay đổi tồn (đv dùng)', w: 13, num: true, fmt: DEC }, { key: 'after', h: 'Tồn sau', w: 10, num: true, fmt: DEC }, { key: 'cost', h: 'Tiền nhập', w: 14, num: true, fmt: MONEY, sum: true }, { key: 'who', h: 'Người ghi', w: 14 }, { key: 'note', h: 'Ghi chú', w: 28, wrap: true }];
  const wm = sheetOf(wb, 'Nhập xuất kho', 'LỊCH SỬ NHẬP / XUẤT KHO · ' + label, sub, mCols, 'FF3E9B6B'); const mFirst = wm._next;
  data.stockMoves.forEach(x => addRow(wm, { d: xd(x.created_at), name: (itemById.get(x.item_id) || {}).name || '(đã xoá)', k: KIND[x.kind] || x.kind, amt: Number(x.amount), unit: x.unit, delta: Number(x.delta), after: Number(x.qty_after), cost: x.cost || null, who: x.employee_name || '', note: x.note || '' }));
  totalRow(wm, 'Tổng', mFirst, Math.max(mFirst, wm._next - 1));
  wm.autoFilter = { from: 'A4', to: 'J' + Math.max(mFirst, wm._next - 2) };

  /* ===== Nhân viên & lương ===== */
  const done = data.shifts.filter(s => s.check_out_at), byEmp = new Map();
  done.forEach(s => { const v = byEmp.get(s.employee_id) || { n: 0, act: 0, paid: 0, pay: 0, out: 0, name: s.employee_name }; v.n++; v.act += s.actual_minutes || 0; v.paid += s.paid_minutes || 0; v.pay += s.pay_amount || 0; if (s.paid_out_at) v.out += s.pay_amount || 0; byEmp.set(s.employee_id, v); });
  const eCols = [{ key: 'name', h: 'Nhân viên', w: 20 }, { key: 'role', h: 'Vai trò', w: 11 }, { key: 'phone', h: 'SĐT', w: 13 }, { key: 'rate', h: 'Lương / giờ', w: 12, num: true, fmt: MONEY }, { key: 'n', h: 'Số ca', w: 8, num: true, fmt: INT, sum: true },
    { key: 'act', h: 'Giờ làm thực tế', w: 12, num: true, fmt: DEC, sum: true }, { key: 'paid', h: 'Giờ tính lương', w: 12, num: true, fmt: DEC, sum: true }, { key: 'pay', h: 'Tiền lương', w: 15, num: true, fmt: MONEY, sum: true },
    { key: 'out', h: 'Đã trả', w: 14, num: true, fmt: MONEY, sum: true }, { key: 'due', h: 'Còn phải trả', w: 14, num: true, fmt: MONEY, sum: true, color: v => (v.due && v.due.result > 0) ? C.bad : null }];
  const we2 = sheetOf(wb, 'Nhân viên & lương', 'NHÂN VIÊN & TIỀN LƯƠNG · ' + label, sub, eCols, 'FF3A7FC2'); const eFirst = we2._next;
  const emps = data.employees.filter(e => byEmp.has(e.id) || (e.is_active && (e.role === 'staff')));
  byEmp.forEach((v, id) => { if (!emps.some(e => e.id === id)) emps.push({ id, full_name: v.name, role: 'staff', hourly_rate: null, phone: '' }); });
  emps.forEach(e => { const v = byEmp.get(e.id) || { n: 0, act: 0, paid: 0, pay: 0, out: 0 }, r = we2._next;
    addRow(we2, { name: e.full_name, role: ROLE[e.role] || e.role, phone: e.phone || '', rate: e.hourly_rate, n: v.n, act: Math.round(v.act / 6) / 10, paid: Math.round(v.paid / 6) / 10, pay: v.pay, out: v.out, due: fx('H' + r + '-I' + r, v.pay - v.out) }); });
  const eTot = we2._next; totalRow(we2, 'Tổng', eFirst);
  const open = data.shifts.filter(s => !s.check_out_at).length;
  note(we2, 'Chỉ tính các ca đã kết thúc trong tháng (theo ngày vào ca).' + (open ? ' Còn ' + open + ' ca chưa ra ca nên chưa tính lương.' : '') + ' Giờ tính lương là sau khi làm tròn theo cài đặt của quán.');

  /* ===== Ca làm ===== */
  const sCols = [{ key: 'name', h: 'Nhân viên', w: 18 }, { key: 'd', h: 'Ngày', w: 11, fmt: DATE }, { key: 'in', h: 'Vào ca', w: 8, fmt: TIME }, { key: 'out', h: 'Ra ca', w: 8, fmt: TIME }, { key: 'act', h: 'Giờ thực tế', w: 10, num: true, fmt: DEC, sum: true },
    { key: 'paid', h: 'Giờ tính lương', w: 11, num: true, fmt: DEC, sum: true }, { key: 'rate', h: 'Lương / giờ', w: 12, num: true, fmt: MONEY }, { key: 'pay', h: 'Tiền ca', w: 13, num: true, fmt: MONEY, sum: true },
    { key: 'st', h: 'Trạng thái', w: 12, color: v => v.st === 'Chưa trả' ? C.bad : v.st === 'Đã trả' ? C.ok : C.note }, { key: 'note', h: 'Ghi chú', w: 26, wrap: true }];
  const wsft = sheetOf(wb, 'Ca làm', 'CHI TIẾT CA LÀM · ' + label, sub, sCols, 'FF3A7FC2'); const sFirst = wsft._next;
  data.shifts.slice().sort((a, b) => (a.employee_name || '').localeCompare(b.employee_name || '', 'vi') || (a.check_in_at < b.check_in_at ? -1 : 1)).forEach(s => addRow(wsft, {
    name: s.employee_name, d: xd(new Date(new Date(s.check_in_at).setHours(0, 0, 0, 0))), in: xd(s.check_in_at), out: s.check_out_at ? xd(s.check_out_at) : null, act: s.actual_minutes != null ? Math.round(s.actual_minutes / 6) / 10 : null,
    paid: s.paid_minutes != null ? Math.round(s.paid_minutes / 6) / 10 : null, rate: s.hourly_rate, pay: s.pay_amount, st: !s.check_out_at ? 'Đang làm' : s.paid_out_at ? 'Đã trả' : 'Chưa trả', note: s.note || '' }));
  totalRow(wsft, 'Tổng', sFirst, Math.max(sFirst, wsft._next - 1));
  wsft.autoFilter = { from: 'A4', to: 'J' + Math.max(sFirst, wsft._next - 2) };

  /* ===== Điền trang Tổng quan (liên kết sang các trang khác) ===== */
  const rev = sumOf(sales, s => s.total), prevRev = sumOf(prev, s => s.total), cost = sumOf(data.stockMoves.filter(x => x.kind === 'nhap'), x => x.cost || 0), wage = sumOf(done, s => s.pay_amount || 0);
  const best = days.map(d => [d, sumOf(byDay.get(dayKey(d)), s => s.total)]).sort((a, b) => b[1] - a[1])[0];
  const lowN = data.stockItems.filter(it => it.is_active !== false && Number(it.qty) <= Number(it.min_qty || 0)).length;
  const R = {}; const put = (k, a, b, c, opt) => { R[k] = ov._next; addRow(ov, { a, b, c }, opt); };
  const sec = t => { const r = ov.getRow(ov._next++); r.getCell(1).value = t; r.getCell(1).font = { name: FONT, bold: true, size: 11, color: { argb: C.red } }; r.height = 20; };
  sec('DOANH THU');
  put('rev', 'Doanh thu', fx("'Theo ngày'!D" + dTot, rev), 'Tổng tiền đã thu trong tháng (gồm cả đơn giao hàng).', { bold: true });
  put('n', 'Số hoá đơn', fx("'Theo ngày'!C" + dTot, sales.length), '');
  put('avg', 'Trung bình / hoá đơn', fx('IFERROR(B' + (R.rev) + '/B' + (R.n) + ',0)'), '');
  put('pd', 'Trung bình / ngày', fx('IFERROR(B' + R.rev + '/' + days.length + ',0)'), 'Chia cho ' + days.length + ' ngày' + (to > now ? ' (tính tới hôm nay)' : '') + '.');
  put('cash', 'Tiền mặt', fx("'Theo ngày'!E" + dTot), 'Đối chiếu với tiền trong két.');
  put('bank', 'Chuyển khoản', fx("'Theo ngày'!F" + dTot), 'Đối chiếu với sao kê ngân hàng.');
  put('prev', 'Doanh thu tháng trước', prevRev, '');
  put('grow', 'Tăng / giảm so với tháng trước', fx('IFERROR(B' + R.rev + '/B' + R.prev + '-1,0)'), prevRev ? '' : 'Tháng trước chưa có số liệu.');
  put('best', 'Ngày bán cao nhất', best && best[1] ? pad(best[0].getDate()) + '/' + pad(m + 1) + ' (' + DOW[best[0].getDay()] + ')' : '-', best && best[1] ? Math.round(best[1]).toLocaleString('vi-VN') + ' đ' : '');
  ov._next++; sec('CHI PHÍ GHI TRONG HỆ THỐNG');
  put('cost', 'Tiền nhập hàng', fx("'Kho hàng'!M" + kTot, cost), 'Theo các lần Nhập hàng có ghi tiền ở trang Kho.');
  put('wage', 'Tiền lương nhân viên', fx("'Nhân viên & lương'!H" + eTot, wage), 'Các ca đã kết thúc trong tháng.');
  put('left', 'Còn lại tạm tính', fx('B' + R.rev + '-B' + R.cost + '-B' + R.wage, rev - cost - wage), 'Doanh thu trừ nhập hàng và lương. CHƯA trừ mặt bằng, điện nước, gas, chi phí khác ngoài hệ thống.', { bold: true });
  ov._next++; sec('KHÁC');
  put('low', 'Mặt hàng sắp hết (lúc xuất file)', lowN, lowN ? 'Xem trang Kho hàng (tô đỏ).' : '');
  put('emp', 'Số nhân viên có ca trong tháng', byEmp.size, '');
  put('top', 'Món bán chạy nhất', iList[0] ? iList[0].name : '-', iList[0] ? iList[0].qty + ' phần' : '');
  ['avg', 'pd', 'rev', 'cash', 'bank', 'prev', 'cost', 'wage', 'left'].forEach(k => { ov.getCell('B' + R[k]).numFmt = MONEY; });
  ov.getCell('B' + R.n).numFmt = INT; ov.getCell('B' + R.grow).numFmt = PCT; ov.getCell('B' + R.low).numFmt = INT; ov.getCell('B' + R.emp).numFmt = INT;
  ov.getCell('B' + R.left).font = { name: FONT, size: 11, bold: true, color: { argb: rev - cost - wage >= 0 ? C.ok : C.bad } };
  ov._next++;
  const r0 = ov.getRow(ov._next++); r0.getCell(1).value = 'Các trang trong file:'; r0.getCell(1).font = { name: FONT, bold: true, size: 10 };
  [['Theo ngày', 'doanh thu từng ngày, tiền mặt / chuyển khoản, ăn tại quán / mang về / giao'], ['Theo tuần', 'cộng theo tuần (Thứ 2 – Chủ nhật)'], ['Theo giờ', 'giờ nào đông khách'], ['Món bán chạy', 'số phần, doanh thu từng món'],
   ['Hoá đơn', 'toàn bộ hoá đơn, lọc được'], ['Kho hàng', 'tồn kho, nhập / dùng trong tháng'], ['Nhập xuất kho', 'từng lần nhập, lấy dùng, kiểm kho'], ['Nhân viên & lương', 'giờ công, tiền lương, đã trả / còn nợ'], ['Ca làm', 'từng ca vào / ra']]
    .forEach(([n, d]) => { const r = ov.getRow(ov._next++); r.getCell(1).value = { text: '› ' + n, hyperlink: "#'" + n + "'!A1" }; r.getCell(1).font = { name: FONT, size: 10, color: { argb: C.red }, underline: true }; r.getCell(2).value = d; r.getCell(2).font = { name: FONT, size: 10, color: { argb: C.note } }; });
  ov.views = [{ showGridLines: false }];

  const buf = await wb.xlsx.writeBuffer();
  return { blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name: 'BaoCao_' + shop.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '') + '_' + y + '-' + pad(m + 1) + '.xlsx', count: sales.length };
}

/* Tải file về máy */
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

window.BNReport = { build, download };
})();
