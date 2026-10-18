-- =====================================================================
-- CẬP NHẬT 11: chỉ Cà phê và Matcha · Cacao (· Khoai môn) có chọn Size M / Size L
-- - Các đồ uống khác (trà hoa quả, sốt khoai môn, nước uống, trà sữa…) bỏ mục chọn size,
--   chỉ còn một giá như đang ghi trên menu.
-- - CHỈ gỡ liên kết "món ↔ nhóm Size". Không xoá món, không đổi giá, không đụng đơn / hoá đơn.
--   Nhóm Size vẫn còn trong Menu → Tuỳ chọn, muốn gắn lại cho món nào thì sửa món đó.
-- Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================
begin;

-- Xem trước những món sẽ bỏ chọn size
select c.name as danh_muc, mi.name as mon, g.name as nhom
from menu_item_option_groups l
join option_groups g on g.id = l.group_id
join menu_items mi on mi.id = l.menu_item_id
left join menu_categories c on c.id = mi.category_id
where g.title = 'Size'
  and not (coalesce(c.name, '') ilike '%cà phê%' or coalesce(c.name, '') ilike '%matcha%' or coalesce(c.name, '') ilike '%cacao%')
order by c.sort_order, mi.sort_order;

delete from menu_item_option_groups l
using option_groups g, menu_items mi
left join menu_categories c on c.id = mi.category_id
where g.id = l.group_id and mi.id = l.menu_item_id
  and g.title = 'Size'
  and not (coalesce(c.name, '') ilike '%cà phê%' or coalesce(c.name, '') ilike '%matcha%' or coalesce(c.name, '') ilike '%cacao%');

commit;

-- Kiểm tra: chỉ còn món thuộc Cà phê / Matcha · Cacao có Size
select c.name as danh_muc, count(*) as so_mon_co_size
from menu_item_option_groups l
join option_groups g on g.id = l.group_id
join menu_items mi on mi.id = l.menu_item_id
left join menu_categories c on c.id = mi.category_id
where g.title = 'Size'
group by c.name order by c.name;
