# XSS Security Report

## Status: PASS

## Findings

- Có hàm `esc()` (`core.js:24`) thoát `& < > " '`. Đã rà mọi chỗ ghép chuỗi HTML có dữ liệu khách nhập (tên, SĐT, ghi chú, lời nhắn gọi nhân viên, địa chỉ, tên món, tuỳ chọn) ở `kitchen.js`, `quanly.html`, `index.html`, `report.js`, `staff.js`: đều qua `esc()`.
- `ui.toast()` dùng `textContent`. Không có `eval`, `new Function`, `document.write`.
- Quan trọng vì khách chưa đăng nhập gửi được chữ lên màn bếp / quản lý (nơi có phiên chủ quán).

## What's at risk

Không thấy.

## What's already secure

Thoát HTML nhất quán.

## Recommendations

Giữ thói quen `esc()`; bật CSP thật để có thêm lớp bảo vệ.
