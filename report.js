/* =====================================================================
   BÁO CÁO EXCEL THÁNG — tạo ngay trên trình duyệt (thư viện ExcelJS)
   Các trang: Tổng quan · Biểu đồ · Theo ngày · Theo tuần · Theo giờ · Món bán chạy · Ưu đãi ·
              Hoá đơn · Kho hàng · Nhập xuất kho · Nhân viên & lương · Ca làm · Ca làm tháng trước
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

/* ---------- Biểu đồ Excel thật (sửa số trong file thì biểu đồ tự vẽ lại) ----------
   ExcelJS chưa vẽ được biểu đồ nên sau khi tạo file, mở gói .xlsx (JSZip) và chèn
   phần biểu đồ theo chuẩn Office Open XML: xl/charts/chartN.xml + xl/drawings/drawingN.xml. */
const LIB_ZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const PAL = { main: 'E2325C', blue: '3A7FC2', amber: 'C9821C', prev: 'A39486', grid: 'E7D9C2', ink: '5A4A40' };
const xe = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ref = (sheet, col, r1, r2) => "'" + sheet.replace(/'/g, "''") + "'!$" + col + '$' + r1 + ':$' + col + '$' + r2;
const serial = d => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 864e5;
const fill = c => '<c:spPr><a:solidFill><a:srgbClr val="' + c + '"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr>';
const txt = (sz, b, col) => '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="' + sz + '" b="' + (b ? 1 : 0) + '"><a:solidFill><a:srgbClr val="' + (col || PAL.ink) + '"/></a:solidFill><a:latin typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="vi-VN"/></a:p></c:txPr>';
function cache(kind, vals, fmt) {
  const pts = vals.map((v, i) => v == null || v === '' ? '' : '<c:pt idx="' + i + '"><c:v>' + xe(v) + '</c:v></c:pt>').join('');
  return kind === 'num' ? '<c:numCache><c:formatCode>' + xe(fmt || 'General') + '</c:formatCode><c:ptCount val="' + vals.length + '"/>' + pts + '</c:numCache>' : '<c:strCache><c:ptCount val="' + vals.length + '"/>' + pts + '</c:strCache>';
}
/* spec: { type: 'col'|'bar'|'doughnut', title, cat: { f, vals, num, fmt }, series: [{ name, f, vals, color, colors(i) }], labels, valFmt, hideValAxis } */
function chartXml(sp) {
  const cat = sp.cat.num ? '<c:cat><c:numRef><c:f>' + xe(sp.cat.f) + '</c:f>' + cache('num', sp.cat.vals, sp.cat.fmt) + '</c:numRef></c:cat>' : '<c:cat><c:strRef><c:f>' + xe(sp.cat.f) + '</c:f>' + cache('str', sp.cat.vals) + '</c:strRef></c:cat>';
  const lbl = (pct, pos) => '<c:dLbls><c:numFmt formatCode="' + xe(pct ? '0%' : (sp.valFmt || '#,##0')) + '" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>' + txt(pct ? 1000 : 900, pct, pct ? 'FFFFFF' : null) + (pos ? '<c:dLblPos val="' + pos + '"/>' : '') +
    '<c:showLegendKey val="0"/><c:showVal val="' + (pct ? 0 : 1) + '"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="' + (pct ? 1 : 0) + '"/><c:showBubbleSize val="0"/>' + (pct ? '<c:showLeaderLines val="0"/>' : '') + '</c:dLbls>';
  const ser = sp.series.map((s, k) => '<c:ser><c:idx val="' + k + '"/><c:order val="' + k + '"/><c:tx><c:v>' + xe(s.name) + '</c:v></c:tx>' +
    (sp.type === 'doughnut' ? '' : fill(s.color) + '<c:invertIfNegative val="0"/>') +
    (s.colors ? sp.cat.vals.map((_, i) => { const c = s.colors(i); return c ? '<c:dPt><c:idx val="' + i + '"/>' + (sp.type === 'doughnut' ? '' : '<c:invertIfNegative val="0"/>') + '<c:bubble3D val="0"/>' + fill(c) + '</c:dPt>' : ''; }).join('') : '') +
    (sp.type === 'doughnut' ? lbl(true) : sp.labels ? lbl(false, 'outEnd') : '') +
    cat + '<c:val><c:numRef><c:f>' + xe(s.f) + '</c:f>' + cache('num', s.vals.map(v => v == null ? null : Math.round(v * 100) / 100)) + '</c:numRef></c:val></c:ser>').join('');
  let plot;
  if (sp.type === 'doughnut') plot = '<c:doughnutChart><c:varyColors val="1"/>' + ser + '<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>';
  else {
    const hor = sp.type === 'bar';
    plot = '<c:barChart><c:barDir val="' + (hor ? 'bar' : 'col') + '"/><c:grouping val="clustered"/><c:varyColors val="0"/>' + ser + '<c:gapWidth val="' + (sp.series.length > 1 ? 80 : 50) + '"/>' + (sp.series.length > 1 ? '<c:overlap val="-8"/>' : '') + '<c:axId val="101"/><c:axId val="102"/></c:barChart>' +
      '<c:catAx><c:axId val="101"/><c:scaling><c:orientation val="' + (hor ? 'maxMin' : 'minMax') + '"/></c:scaling><c:delete val="0"/><c:axPos val="' + (hor ? 'l' : 'b') + '"/>' +
      (sp.cat.num ? '<c:numFmt formatCode="' + xe(sp.cat.fmt || 'General') + '" sourceLinked="0"/>' : '') + '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>' +
      '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="' + PAL.grid + '"/></a:solidFill></a:ln></c:spPr>' + txt(900) + '<c:crossAx val="102"/><c:crosses val="autoZero"/><c:auto val="0"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="1"/></c:catAx>' +
      '<c:valAx><c:axId val="102"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="' + (sp.hideValAxis ? 1 : 0) + '"/><c:axPos val="' + (hor ? 'b' : 'l') + '"/>' +
      (sp.hideValAxis ? '' : '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="' + PAL.grid + '"/></a:solidFill><a:prstDash val="dash"/></a:ln></c:spPr></c:majorGridlines>') +
      '<c:numFmt formatCode="' + xe(sp.axisFmt || '#,##0') + '" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>' + txt(900) +
      '<c:crossAx val="101"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>';
  }
  const legend = sp.type === 'doughnut' || sp.series.length > 1 ? '<c:legend><c:legendPos val="' + (sp.type === 'doughnut' ? 'r' : 't') + '"/><c:overlay val="0"/>' + txt(1000) + '</c:legend>' : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="vi-VN" sz="1200" b="1"><a:solidFill><a:srgbClr val="3B2A24"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>' + xe(sp.title) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>' +
    '<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>' + plot + '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>' + legend + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>' +
    '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="' + PAL.grid + '"/></a:solidFill></a:ln></c:spPr>' + txt(1000) + '</c:chartSpace>';
}
/* charts: [{ sheet: 'Tên trang', from: [col, row], to: [col, row] (đánh số từ 0), spec }] */
async function addCharts(buf, charts) {
  if (!charts.length) return buf;
  if (!window.JSZip) await BN.loadScript(LIB_ZIP);
  const zip = await window.JSZip.loadAsync(buf);
  const wbXml = await zip.file('xl/workbook.xml').async('string'), wbRels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  let ct = await zip.file('[Content_Types].xml').async('string');
  const sheetPath = name => {
    const m = [...wbXml.matchAll(/<sheet\b[^>]*>/g)].map(x => x[0]).find(t => (t.match(/name="([^"]*)"/) || [])[1] === xe(name));
    const rid = m && (m.match(/r:id="([^"]+)"/) || [])[1];
    const rel = rid && [...wbRels.matchAll(/<Relationship\b[^>]*>/g)].map(x => x[0]).find(t => t.includes('Id="' + rid + '"'));
    const target = rel && rel.match(/Target="([^"]+)"/)[1];
    return target && ('xl/' + target.replace(/^\/?xl\//, '').replace(/^\.\//, ''));
  };
  const bySheet = new Map(); charts.forEach(c => { if (!bySheet.has(c.sheet)) bySheet.set(c.sheet, []); bySheet.get(c.sheet).push(c); });
  let nChart = 0, nDraw = 0;
  for (const [name, list] of bySheet) {
    const sp = sheetPath(name); if (!sp || !zip.file(sp)) continue;
    const dn = ++nDraw, anchors = [], drels = [];
    list.forEach((c, k) => {
      const cn = ++nChart;
      zip.file('xl/charts/chart' + cn + '.xml', chartXml(c.spec));
      ct = ct.replace('</Types>', '<Override PartName="/xl/charts/chart' + cn + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>');
      drels.push('<Relationship Id="rId' + (k + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart' + cn + '.xml"/>');
      anchors.push('<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>' + c.from[0] + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + c.from[1] + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>' + c.to[0] + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + c.to[1] + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
        '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (k + 2) + '" name="' + xe(c.spec.title) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId' + (k + 1) + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>');
    });
    zip.file('xl/drawings/drawing' + dn + '.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' + anchors.join('') + '</xdr:wsDr>');
    zip.file('xl/drawings/_rels/drawing' + dn + '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + drels.join('') + '</Relationships>');
    ct = ct.replace('</Types>', '<Override PartName="/xl/drawings/drawing' + dn + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
    // gắn bản vẽ vào trang
    const relPath = sp.replace(/worksheets\//, 'worksheets/_rels/') + '.rels', rid = 'rIdBNChart';
    const relLine = '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing' + dn + '.xml"/>';
    const oldRels = zip.file(relPath) ? await zip.file(relPath).async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    zip.file(relPath, oldRels.replace('</Relationships>', relLine + '</Relationships>'));
    let xml = await zip.file(sp).async('string');
    if (!/xmlns:r=/.test(xml.slice(0, 600))) xml = xml.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    const tag = '<drawing r:id="' + rid + '"/>', after = ['<legacyDrawing', '<legacyDrawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst'].map(t => xml.indexOf(t)).filter(i => i > 0);
    const at = after.length ? Math.min(...after) : xml.lastIndexOf('</worksheet>');
    zip.file(sp, xml.slice(0, at) + tag + xml.slice(at));
  }
  zip.file('[Content_Types].xml', ct);
  return await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

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
  const pFrom = new Date(y, m - 1, 1), pLabel = pad(pFrom.getMonth() + 1) + '/' + pFrom.getFullYear(), pDays = new Date(y, m, 0).getDate();
  const [data, pData, menu, settings] = await Promise.all([api.reportData({ from, to }), api.reportData({ from: pFrom, to: from }).catch(() => null), api.adminMenu().catch(() => null), api.settings().catch(() => ({}))]);
  const prev = pData ? pData.sales : [], pShifts = pData ? pData.shifts : [], pMoves = pData ? pData.stockMoves : [];
  if (!window.ExcelJS) { onStep('Đang tải thư viện Excel…'); await BN.loadScript(LIB); }
  onStep('Đang tạo file…');
  const sales = data.sales, shop = settings.shop_name || 'Bé Nốc';
  const catOf = new Map(); if (menu) { const cs = new Map(menu.categories.map(c => [c.id, c])); menu.items.forEach(it => catOf.set(it.id, cs.get(it.category_id))); }
  const kindOf = i => { const c = catOf.get(i.menu_item_id); return c ? ((c.station === 'pha_che' || DRINK_CATS.test(c.name)) ? 'Đồ uống' : 'Món ăn') : (i.station === 'pha_che' ? 'Đồ uống' : 'Món ăn'); };
  const empName = new Map(data.employees.map(e => [e.id, e.full_name]));
  const wb = new window.ExcelJS.Workbook(); wb.creator = shop + ' POS'; wb.created = new Date();
  const sub = shop + ' · từ 01/' + label + ' đến ' + pad(new Date(y, m + 1, 0).getDate()) + '/' + label + ' · xuất lúc ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ' ' + pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear();

  /* ===== Tổng quan (tạo trước để đứng đầu, điền sau) ===== */
  const ov = sheetOf(wb, 'Tổng quan', 'BÁO CÁO THÁNG ' + label + ' · ' + shop.toUpperCase(), sub, [{ key: 'a', h: 'Chỉ số', w: 30 }, { key: 'b', h: 'Tháng ' + label, w: 17, num: true }, { key: 'c', h: 'Tháng trước (' + pLabel + ')', w: 17, num: true },
    { key: 'd', h: 'Chênh lệch', w: 15, num: true }, { key: 'e', h: '% thay đổi', w: 11, num: true, fmt: PCT }, { key: 'f', h: 'Ghi chú', w: 46, wrap: true }], C.red);
  /* ===== Biểu đồ (tạo trước để đứng thứ 2, vẽ sau cùng) ===== */
  const CH = 'Biểu đồ';
  const wc = wb.addWorksheet(CH, { properties: { tabColor: { argb: 'FF2E8A55' } }, views: [{ showGridLines: false }], pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });

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

  /* ===== Nhân viên & lương: tách rõ tháng này / tháng trước ===== */
  const empSum = list => { const by = new Map(); list.filter(s => s.check_out_at).forEach(s => { const v = by.get(s.employee_id) || { n: 0, act: 0, paid: 0, pay: 0, out: 0, name: s.employee_name }; v.n++; v.act += s.actual_minutes || 0; v.paid += s.paid_minutes || 0; v.pay += s.pay_amount || 0; if (s.paid_out_at) v.out += s.pay_amount || 0; by.set(s.employee_id, v); }); return by; };
  const done = data.shifts.filter(s => s.check_out_at), byEmp = empSum(data.shifts), pByEmp = empSum(pShifts);
  const LW = 'Nhân viên & lương';
  const eCols = [{ key: 'name', h: 'Nhân viên', w: 20 }, { key: 'rate', h: 'Lương / giờ', w: 12, num: true, fmt: MONEY },
    { key: 'n', h: 'Số ca', w: 7, num: true, fmt: INT, sum: true }, { key: 'paid', h: 'Giờ tính lương', w: 10, num: true, fmt: DEC, sum: true }, { key: 'pay', h: 'Tiền lương', w: 14, num: true, fmt: MONEY, sum: true },
    { key: 'out', h: 'Đã trả', w: 13, num: true, fmt: MONEY, sum: true }, { key: 'due', h: 'Còn phải trả', w: 13, num: true, fmt: MONEY, sum: true, color: v => (v.due && v.due.result > 0) ? C.bad : null },
    { key: 'pn', h: 'Số ca', w: 7, num: true, fmt: INT, sum: true }, { key: 'ppay', h: 'Tiền lương', w: 14, num: true, fmt: MONEY, sum: true }, { key: 'pdue', h: 'Còn nợ', w: 12, num: true, fmt: MONEY, sum: true, color: v => v.pdue > 0 ? C.bad : null },
    { key: 'diff', h: 'Lương tăng / giảm', w: 14, num: true, fmt: '+#,##0" đ";-#,##0" đ";"-"' }];
  const we2 = sheetOf(wb, LW, 'TIỀN LƯƠNG NHÂN VIÊN · THÁNG ' + label + ' SO VỚI THÁNG ' + pLabel, sub, eCols, 'FF3A7FC2'); const eFirst = we2._next;
  // dòng nhóm cột phía trên tiêu đề: tháng này | tháng trước
  const grp = (c1, c2, text, color) => { we2.mergeCells(3, c1, 3, c2); const cell = we2.getCell(3, c1); cell.value = text; cell.font = { name: FONT, bold: true, size: 10, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }; cell.alignment = { horizontal: 'center', vertical: 'middle' }; };
  grp(3, 7, 'THÁNG ' + label + (to > now ? ' (tới hôm nay)' : ''), 'FFE2325C'); grp(8, 10, 'THÁNG TRƯỚC · ' + pLabel, 'FF8A7B6E'); we2.getRow(3).height = 20;
  const emps = data.employees.filter(e => byEmp.has(e.id) || pByEmp.has(e.id) || (e.is_active && e.role === 'staff'));
  new Map([...byEmp, ...pByEmp]).forEach((v, id) => { if (!emps.some(e => e.id === id)) emps.push({ id, full_name: v.name, role: 'staff', hourly_rate: null }); });
  const z = { n: 0, act: 0, paid: 0, pay: 0, out: 0 };
  emps.forEach(e => { const v = byEmp.get(e.id) || z, p = pByEmp.get(e.id) || z, r = we2._next;
    addRow(we2, { name: e.full_name, rate: e.hourly_rate, n: v.n, paid: Math.round(v.paid / 6) / 10, pay: v.pay, out: v.out, due: fx('E' + r + '-F' + r, v.pay - v.out),
      pn: p.n, ppay: p.pay, pdue: p.pay - p.out, diff: fx('E' + r + '-I' + r, v.pay - p.pay) }); });
  const eLast = we2._next - 1, eTot = we2._next; totalRow(we2, 'Tổng', eFirst, eLast, { diff: fx('E' + eTot + '-I' + eTot) });
  const open = data.shifts.filter(s => !s.check_out_at).length;
  note(we2, 'Ca tính vào tháng theo ngày vào ca. Chỉ tính ca đã kết thúc.' + (open ? ' Tháng này còn ' + open + ' ca chưa ra ca nên chưa có tiền.' : '') + ' "Còn nợ" của tháng trước là số chưa trả tính tới lúc xuất file. Chi tiết từng ca: trang Ca làm (tháng này) và Ca làm tháng trước.');

  /* ===== Ca làm (tháng này) + Ca làm tháng trước ===== */
  const sCols = [{ key: 'name', h: 'Nhân viên', w: 18 }, { key: 'd', h: 'Ngày', w: 11, fmt: DATE }, { key: 'in', h: 'Vào ca', w: 8, fmt: TIME }, { key: 'out', h: 'Ra ca', w: 8, fmt: TIME }, { key: 'act', h: 'Giờ thực tế', w: 10, num: true, fmt: DEC, sum: true },
    { key: 'paid', h: 'Giờ tính lương', w: 11, num: true, fmt: DEC, sum: true }, { key: 'rate', h: 'Lương / giờ', w: 12, num: true, fmt: MONEY }, { key: 'pay', h: 'Tiền ca', w: 13, num: true, fmt: MONEY, sum: true },
    { key: 'st', h: 'Trạng thái', w: 12, color: v => v.st === 'Chưa trả' ? C.bad : v.st === 'Đã trả' ? C.ok : C.note }, { key: 'note', h: 'Ghi chú', w: 26, wrap: true }];
  const shiftSheet = (name, title, list, tab) => {
    const w = sheetOf(wb, name, title, sub, sCols, tab); const f0 = w._next;
    list.slice().sort((a, b) => (a.employee_name || '').localeCompare(b.employee_name || '', 'vi') || (a.check_in_at < b.check_in_at ? -1 : 1)).forEach(s => addRow(w, {
      name: s.employee_name, d: xd(new Date(new Date(s.check_in_at).setHours(0, 0, 0, 0))), in: xd(s.check_in_at), out: s.check_out_at ? xd(s.check_out_at) : null, act: s.actual_minutes != null ? Math.round(s.actual_minutes / 6) / 10 : null,
      paid: s.paid_minutes != null ? Math.round(s.paid_minutes / 6) / 10 : null, rate: s.hourly_rate, pay: s.pay_amount, st: !s.check_out_at ? 'Đang làm' : s.paid_out_at ? 'Đã trả' : 'Chưa trả', note: s.note || '' }));
    totalRow(w, list.length ? 'Tổng' : 'Không có ca nào', f0, Math.max(f0, w._next - 1));
    w.autoFilter = { from: 'A4', to: 'J' + Math.max(f0, w._next - 2) };
    note(w, 'Lọc cột Nhân viên để xem riêng từng người; lọc Trạng thái = Chưa trả để biết còn nợ ca nào. Dòng Tổng tự tính theo các dòng đang hiện.');
  };
  shiftSheet('Ca làm', 'CHI TIẾT CA LÀM · THÁNG ' + label, data.shifts, 'FF3A7FC2');
  shiftSheet('Ca làm tháng trước', 'CHI TIẾT CA LÀM · THÁNG TRƯỚC ' + pLabel, pShifts, 'FF8A7B6E');

  /* ===== Điền trang Tổng quan: tháng này so với tháng trước ===== */
  const rev = sumOf(sales, s => s.total), prevRev = sumOf(prev, s => s.total);
  const cost = sumOf(data.stockMoves.filter(x => x.kind === 'nhap'), x => x.cost || 0), pCost = sumOf(pMoves.filter(x => x.kind === 'nhap'), x => x.cost || 0);
  const wage = sumOf(done, s => s.pay_amount || 0), pWage = sumOf(pShifts.filter(s => s.check_out_at), s => s.pay_amount || 0);
  const wOut = sumOf(done.filter(s => s.paid_out_at), s => s.pay_amount || 0), pOut = sumOf(pShifts.filter(s => s.check_out_at && s.paid_out_at), s => s.pay_amount || 0);
  const best = days.map(d => [d, sumOf(byDay.get(dayKey(d)), s => s.total)]).sort((a, b) => b[1] - a[1])[0];
  const lowN = data.stockItems.filter(it => it.is_active !== false && Number(it.qty) <= Number(it.min_qty || 0)).length;
  const pBy = (f) => sumOf(prev.filter(f), s => s.total);
  const R = {}, UP_GOOD = new Set(['rev', 'n', 'avg', 'pd', 'left']);
  const put = (k, a, b, c, note, opt) => { const r = ov._next; R[k] = r; const cmp = c !== undefined && c !== null;
    addRow(ov, { a, b, c: cmp ? c : null, d: cmp ? fx('B' + r + '-C' + r) : null, e: cmp ? fx('IF(C' + r + '=0,"",B' + r + '/C' + r + '-1)') : null, f: note || '' }, opt); };
  const sec = t => { const r = ov.getRow(ov._next++); r.getCell(1).value = t; r.getCell(1).font = { name: FONT, bold: true, size: 11, color: { argb: C.red } }; r.height = 22; r.getCell(1).alignment = { vertical: 'bottom' }; };
  sec('DOANH THU');
  put('rev', 'Doanh thu', fx("'Theo ngày'!D" + dTot, rev), prevRev, 'Tổng tiền đã thu (gồm cả đơn giao hàng).', { bold: true });
  put('n', 'Số hoá đơn', fx("'Theo ngày'!C" + dTot, sales.length), prev.length, '');
  put('avg', 'Trung bình / hoá đơn', fx('IFERROR(B' + R.rev + '/B' + R.n + ',0)'), fx('IFERROR(C' + R.rev + '/C' + R.n + ',0)'), '');
  put('pd', 'Trung bình / ngày', fx('IFERROR(B' + R.rev + '/' + days.length + ',0)'), fx('IFERROR(C' + R.rev + '/' + pDays + ',0)'), 'Tháng này chia ' + days.length + ' ngày' + (to > now ? ' (tính tới hôm nay)' : '') + ', tháng trước chia ' + pDays + ' ngày.');
  put('cash', 'Tiền mặt', fx("'Theo ngày'!E" + dTot), pBy(s => s.payment_method === 'tien_mat'), 'Đối chiếu với tiền trong két.');
  put('bank', 'Chuyển khoản', fx("'Theo ngày'!F" + dTot), pBy(s => s.payment_method === 'chuyen_khoan'), 'Đối chiếu với sao kê ngân hàng.');
  put('tq', 'Ăn tại quán', fx("'Theo ngày'!G" + dTot), pBy(s => (s.dine_type || 'tai_quan') === 'tai_quan'), '');
  put('mv', 'Mang về', fx("'Theo ngày'!H" + dTot), pBy(s => s.dine_type === 'mang_ve'), '');
  put('gh', 'Giao hàng', fx("'Theo ngày'!I" + dTot), pBy(s => s.dine_type === 'giao_hang'), '');
  ov._next++; sec('CHI PHÍ GHI TRONG HỆ THỐNG');
  put('cost', 'Tiền nhập hàng', fx("'Kho hàng'!M" + kTot, cost), pCost, 'Các lần Nhập hàng có ghi tiền ở trang Kho.');
  put('wage', 'Tiền lương nhân viên', fx("'" + LW + "'!E" + eTot, wage), fx("'" + LW + "'!I" + eTot, pWage), 'Ca đã kết thúc trong tháng. Chi tiết ở trang ' + LW + '.');
  put('left', 'Còn lại tạm tính', fx('B' + R.rev + '-B' + R.cost + '-B' + R.wage, rev - cost - wage), fx('C' + R.rev + '-C' + R.cost + '-C' + R.wage, prevRev - pCost - pWage), 'Doanh thu trừ nhập hàng và lương. CHƯA trừ mặt bằng, điện nước, gas, chi phí ngoài hệ thống.', { bold: true });
  ov._next++; sec('TRẢ LƯƠNG');
  put('wout', 'Lương đã trả', wOut, pOut, '');
  put('wdue', 'Lương còn phải trả', fx('B' + R.wage + '-B' + R.wout, wage - wOut), fx('C' + R.wage + '-C' + R.wout, pWage - pOut), 'Tính tới lúc xuất file. Tháng trước còn nợ thì trả trước.', { bold: true });
  ov._next++; sec('KHÁC');
  put('best', 'Ngày bán cao nhất', best && best[1] ? pad(best[0].getDate()) + '/' + pad(m + 1) + ' (' + DOW[best[0].getDay()] + ')' : '-', null, best && best[1] ? Math.round(best[1]).toLocaleString('vi-VN') + ' đ' : '');
  put('top', 'Món bán chạy nhất', iList[0] ? iList[0].name : '-', null, iList[0] ? iList[0].qty + ' phần' : '');
  put('emp', 'Số nhân viên có ca', byEmp.size, pByEmp.size, '');
  put('low', 'Mặt hàng sắp hết (lúc xuất file)', lowN, null, lowN ? 'Xem trang Kho hàng (tô đỏ).' : '');
  ['rev', 'avg', 'pd', 'cash', 'bank', 'tq', 'mv', 'gh', 'cost', 'wage', 'left', 'wout', 'wdue'].forEach(k => ['B', 'C', 'D'].forEach(c => { ov.getCell(c + R[k]).numFmt = MONEY; }));
  ['n', 'emp', 'low'].forEach(k => ['B', 'C', 'D'].forEach(c => { ov.getCell(c + R[k]).numFmt = INT; }));
  ['best', 'top'].forEach(k => { ov.getCell('B' + R[k]).alignment = { horizontal: 'right', vertical: 'top' }; });
  // tô màu chênh lệch: xanh = tốt hơn tháng trước, đỏ = kém hơn (với chi phí thì ngược lại)
  Object.keys(R).forEach(k => { if (['best', 'top', 'low', 'emp'].includes(k)) return; const r = R[k]; const good = UP_GOOD.has(k);
    ov.addConditionalFormatting({ ref: 'D' + r + ':E' + r, rules: [{ type: 'expression', priority: 1, formulae: ['AND(ISNUMBER($D' + r + '),$D' + r + (good ? '>0)' : '<0)')], style: { font: { color: { argb: C.ok }, bold: true } } }, { type: 'expression', priority: 2, formulae: ['AND(ISNUMBER($D' + r + '),$D' + r + (good ? '<0)' : '>0)')], style: { font: { color: { argb: C.bad }, bold: true } } }] }); });
  ov.getCell('B' + R.left).font = { name: FONT, size: 11, bold: true, color: { argb: rev - cost - wage >= 0 ? C.ok : C.bad } };
  ov.getCell('B' + R.wdue).font = { name: FONT, size: 10, bold: true, color: { argb: wage - wOut > 0 ? C.bad : C.ok } };
  ov.getCell('C' + R.wdue).font = { name: FONT, size: 10, bold: true, color: { argb: pWage - pOut > 0 ? C.bad : C.ok } };
  ov._next++;
  const r0 = ov.getRow(ov._next++); r0.getCell(1).value = 'Các trang trong file (bấm để mở):'; r0.getCell(1).font = { name: FONT, bold: true, size: 10 };
  [[CH, 'biểu đồ doanh thu, giờ đông khách, món bán chạy, lương — so với tháng trước'], ['Theo ngày', 'doanh thu từng ngày, tiền mặt / chuyển khoản, ăn tại quán / mang về / giao'], ['Theo tuần', 'cộng theo tuần (Thứ 2 – Chủ nhật)'], ['Theo giờ', 'giờ nào đông khách'], ['Món bán chạy', 'số phần, doanh thu từng món'],
   ['Hoá đơn', 'toàn bộ hoá đơn, lọc được'], ['Kho hàng', 'tồn kho, nhập / dùng trong tháng'], ['Nhập xuất kho', 'từng lần nhập, lấy dùng, kiểm kho'], [LW, 'lương tháng này và tháng trước đặt cạnh nhau, đã trả / còn nợ'], ['Ca làm', 'từng ca tháng này'], ['Ca làm tháng trước', 'từng ca tháng trước']]
    .forEach(([n, d]) => { const r = ov.getRow(ov._next++); r.getCell(1).value = { text: '› ' + n, hyperlink: "#'" + n + "'!A1" }; r.getCell(1).font = { name: FONT, size: 10, color: { argb: C.red }, underline: true }; ov.mergeCells(r.number, 2, r.number, 6); r.getCell(2).value = d; r.getCell(2).font = { name: FONT, size: 10, color: { argb: C.note } }; });
  ov.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];

  /* ===== Trang Biểu đồ =====
     Cột A–J: biểu đồ. Cột L–N: bảng số liệu vẽ biểu đồ (lấy bằng công thức từ các trang khác). */
  for (let c = 1; c <= 10; c++) wc.getColumn(c).width = 10;
  wc.getColumn(11).width = 3; wc.getColumn(12).width = 24; wc.getColumn(13).width = 16; wc.getColumn(14).width = 16;
  wc.mergeCells('A1:J1'); wc.getCell('A1').value = 'BIỂU ĐỒ THÁNG ' + label + ' · ' + shop.toUpperCase(); wc.getCell('A1').font = { name: FONT, size: 15, bold: true, color: { argb: C.red } }; wc.getRow(1).height = 24;
  wc.mergeCells('A2:J2'); wc.getCell('A2').value = sub + ' · Sửa số ở các trang khác thì biểu đồ tự vẽ lại.'; wc.getCell('A2').font = { name: FONT, size: 10, italic: true, color: { argb: C.note } };
  const charts = []; let row = 3; // dòng (đánh số từ 1) đang trống
  const block = (head, hint, height, spec, half) => {
    // half: 'l' | 'r' → 2 biểu đồ cạnh nhau, dùng chung dòng tiêu đề
    if (half !== 'r') { const h = wc.getRow(row); h.getCell(1).value = head; h.getCell(1).font = { name: FONT, size: 11, bold: true, color: { argb: C.ink } }; h.height = 22; h.getCell(1).alignment = { vertical: 'bottom' };
      wc.mergeCells(row + 1, 1, row + 1, 10); const n = wc.getCell(row + 1, 1); n.value = hint; n.font = { name: FONT, size: 9, italic: true, color: { argb: C.note } }; n.alignment = { wrapText: true, vertical: 'top' }; wc.getRow(row + 1).height = 26; }
    const top = row + 1; // index 0-based của dòng sau dòng ghi chú
    const [c0, c1] = half === 'l' ? [0, 5] : half === 'r' ? [5, 10] : [0, 10];
    charts.push({ sheet: CH, from: [c0, top + 1], to: [c1, top + 1 + height], spec });
    if (half !== 'l') row = top + 1 + height + 2;
  };
  // Bảng số liệu bên phải
  const dt = (title) => { const r = wc.getRow(dRow++); r.getCell(12).value = title; r.getCell(12).font = { name: FONT, size: 10, bold: true, color: { argb: C.headInk } }; [12, 13, 14].forEach(c => { r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } }; }); };
  const drow = (a, b, c, fmt) => { const r = wc.getRow(dRow++); r.getCell(12).value = a; [b, c].forEach((v, i) => { if (v === undefined) return; const cell = r.getCell(13 + i); cell.value = v; cell.numFmt = fmt || MONEY; cell.alignment = { horizontal: 'right' }; }); [12, 13, 14].forEach(c => { r.getCell(c).font = { name: FONT, size: 10, color: { argb: C.ink } }; r.getCell(c).border = { bottom: { style: 'hair', color: { argb: C.line } } }; }); return r.number; };
  let dRow = 4; const dh = wc.getRow(3); dh.getCell(12).value = 'SỐ LIỆU VẼ BIỂU ĐỒ (tự lấy từ các trang khác)'; dh.getCell(12).font = { name: FONT, size: 9, bold: true, color: { argb: C.note } };

  // 1. So với tháng trước
  dt('So với tháng trước'); { const r = wc.getRow(dRow - 1); r.getCell(13).value = 'Tháng ' + label; r.getCell(14).value = 'Tháng ' + pLabel; [13, 14].forEach(c => { r.getCell(c).font = { name: FONT, size: 10, bold: true, color: { argb: C.headInk } }; r.getCell(c).alignment = { horizontal: 'right' }; }); }
  const cmpKeys = [['Doanh thu', 'rev'], ['Nhập hàng', 'cost'], ['Lương', 'wage'], ['Còn lại tạm tính', 'left']];
  const cmpVals = { rev: [rev, prevRev], cost: [cost, pCost], wage: [wage, pWage], left: [rev - cost - wage, prevRev - pCost - pWage] };
  const c1 = dRow; cmpKeys.forEach(([t, k]) => drow(t, fx("'Tổng quan'!B" + R[k], cmpVals[k][0]), fx("'Tổng quan'!C" + R[k], cmpVals[k][1]))); const c2 = dRow - 1;
  block('1. Tháng này so với tháng trước', 'Cột đỏ là tháng ' + label + ', cột xám là tháng ' + pLabel + '. "Còn lại" = doanh thu − nhập hàng − lương (chưa trừ chi phí ngoài hệ thống).' + (to > now ? ' Tháng này chưa hết nên số còn tăng.' : ''), 16,
    { type: 'col', title: 'Doanh thu, chi phí: tháng ' + label + ' và ' + pLabel, cat: { f: ref(CH, 'L', c1, c2), vals: cmpKeys.map(x => x[0]) }, labels: true, valFmt: '#,##0,"k"', axisFmt: '#,##0.0,,"tr"',
      series: [{ name: 'Tháng ' + label, f: ref(CH, 'M', c1, c2), vals: cmpKeys.map(x => cmpVals[x[1]][0]), color: PAL.main }, { name: 'Tháng ' + pLabel, f: ref(CH, 'N', c1, c2), vals: cmpKeys.map(x => cmpVals[x[1]][1]), color: PAL.prev }] });

  // 2. Doanh thu theo ngày
  const dVals = days.map(d => sumOf(byDay.get(dayKey(d)), s => s.total));
  block('2. Doanh thu từng ngày', 'Cột vàng là Thứ 7 và Chủ nhật. Ngày cột thấp bất thường thì xem lại trang Hoá đơn ngày đó.', 18,
    { type: 'col', title: 'Doanh thu theo ngày · tháng ' + label, cat: { f: ref('Theo ngày', 'A', dFirst, dLast), vals: days.map(serial), num: true, fmt: 'dd/mm' }, axisFmt: '#,##0,"k"',
      series: [{ name: 'Doanh thu', f: ref('Theo ngày', 'D', dFirst, dLast), vals: dVals, color: PAL.main, colors: i => (days[i].getDay() === 0 || days[i].getDay() === 6) ? PAL.amber : null }] });

  // 3. Theo giờ
  if (hList.length) block('3. Khách đông giờ nào', 'Số hoá đơn theo giờ thu tiền, cộng cả tháng. Giờ có cột cao cần thêm người trong ca.', 16,
    { type: 'col', title: 'Số hoá đơn theo khung giờ', cat: { f: ref('Theo giờ', 'A', hFirst, hTot - 1), vals: hList.map(h => pad(h) + ':00 – ' + pad(h + 1) + ':00') }, labels: true, valFmt: '#,##0', axisFmt: '#,##0',
      series: [{ name: 'Số hoá đơn', f: ref('Theo giờ', 'B', hFirst, hTot - 1), vals: hList.map(h => hrs.get(h).n), color: PAL.blue }] });

  // 4. Top 10 món
  const nTop = Math.min(10, iList.length);
  if (nTop) block('4. ' + nTop + ' món bán chạy nhất', 'Số phần bán (không tính phần tặng). Xem đủ các món ở trang Món bán chạy.', Math.max(12, nTop * 2),
    { type: 'bar', title: 'Món bán chạy · số phần', cat: { f: ref('Món bán chạy', 'B', iFirst, iFirst + nTop - 1), vals: iList.slice(0, nTop).map(v => v.name) }, labels: true, valFmt: '#,##0', hideValAxis: true,
      series: [{ name: 'Số phần', f: ref('Món bán chạy', 'D', iFirst, iFirst + nTop - 1), vals: iList.slice(0, nTop).map(v => v.qty), color: PAL.main }] });

  // 5–6. Cơ cấu: thanh toán, loại đơn (2 biểu đồ cạnh nhau)
  dRow++; dt('Cách thanh toán'); const p1 = drow('Tiền mặt', fx("'Tổng quan'!B" + R.cash)); drow('Chuyển khoản', fx("'Tổng quan'!B" + R.bank));
  dRow++; dt('Loại đơn'); const t1 = drow('Ăn tại quán', fx("'Tổng quan'!B" + R.tq)); drow('Mang về', fx("'Tổng quan'!B" + R.mv)); drow('Giao hàng', fx("'Tổng quan'!B" + R.gh));
  if (rev) {
    const paidBy = k => sumOf(sales.filter(s => s.payment_method === k), s => s.total), dineBy = k => sumOf(sales.filter(s => (s.dine_type || 'tai_quan') === k), s => s.total);
    const cat3 = [PAL.main, PAL.blue, PAL.amber];
    block('5. Khách trả tiền thế nào · đơn loại gì', 'Tính theo tiền thu được trong tháng. Số % ghi trên từng phần.', 13,
      { type: 'doughnut', title: 'Cách thanh toán', cat: { f: ref(CH, 'L', p1, p1 + 1), vals: ['Tiền mặt', 'Chuyển khoản'] }, series: [{ name: 'Tiền thu', f: ref(CH, 'M', p1, p1 + 1), vals: [paidBy('tien_mat'), paidBy('chuyen_khoan')], colors: i => cat3[i] }] }, 'l');
    block('', '', 13, { type: 'doughnut', title: 'Loại đơn', cat: { f: ref(CH, 'L', t1, t1 + 2), vals: ['Ăn tại quán', 'Mang về', 'Giao hàng'] }, series: [{ name: 'Tiền thu', f: ref(CH, 'M', t1, t1 + 2), vals: ['tai_quan', 'mang_ve', 'giao_hang'].map(dineBy), colors: i => cat3[i] }] }, 'r');
  }

  // 7. Lương từng nhân viên: tháng này vs tháng trước
  if (eLast >= eFirst) block('6. Lương từng nhân viên', 'Cột đỏ là tháng ' + label + ', cột xám là tháng ' + pLabel + '. Đã trả / còn nợ xem ở trang ' + LW + '.', Math.max(12, emps.length * 2 + 4),
    { type: 'bar', title: 'Tiền lương: tháng ' + label + ' và ' + pLabel, cat: { f: ref(LW, 'A', eFirst, eLast), vals: emps.map(e => e.full_name) }, labels: true, valFmt: '#,##0,"k"', hideValAxis: true,
      series: [{ name: 'Tháng ' + label, f: ref(LW, 'E', eFirst, eLast), vals: emps.map(e => (byEmp.get(e.id) || z).pay), color: PAL.main }, { name: 'Tháng ' + pLabel, f: ref(LW, 'I', eFirst, eLast), vals: emps.map(e => (pByEmp.get(e.id) || z).pay), color: PAL.prev }] });

  onStep('Đang vẽ biểu đồ…');
  let buf = await wb.xlsx.writeBuffer();
  try { buf = await addCharts(buf, charts); } catch (e) { console.warn('Không vẽ được biểu đồ', e); }
  return { blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name: 'BaoCao_' + shop.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '') + '_' + y + '-' + pad(m + 1) + '.xlsx', count: sales.length };
}

/* Tải file về máy */
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

window.BNReport = { build, download };
})();
