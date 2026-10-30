# ACCESS_CONTROL Security Report

## Status: PASS

## Findings

- Khách chỉ xem / gọi nhân viên cho đơn của mình qua `access_token` (UUID ngẫu nhiên `gen_random_uuid()`), không phải `order_id`.
- Nhân viên thao tác mọi đơn là đúng nghiệp vụ (một quán).
- Nhân viên chỉ xem ca của mình (`shift_self`), không sửa được bảng `employees`, `shop_settings`, kho, ưu đãi (chỉ chủ quán).
- Ảnh chấm công: mỗi người chỉ xem thư mục `<uid>/` của mình, chủ quán xem tất cả. Ảnh đơn (`don-anh`) chỉ chủ quán xem.

## What's at risk

Không thấy lỗi IDOR.

## What's already secure

Như trên.

## Recommendations

Không cần sửa.
