-- =====================================================================
-- CẬP NHẬT 9: đồ uống chọn rõ SIZE M / SIZE L thay cho "Upsize"
-- - Nhóm tuỳ chọn đồ uống đang có lựa chọn "Upsize" đổi thành nhóm "Size":
--     Size M  (giá gốc, chọn sẵn)   ·   Size L  (+5k / +10k như cũ)
-- - Món không có Upsize giữ nguyên, chỉ hiện giá.
-- - Không đổi giá, không đổi món nào gắn với nhóm nào. Chạy lại nhiều lần vẫn an toàn.
-- Chạy trên Supabase SQL Editor (test trước, product sau), trước khi đưa giao diện mới lên.
-- =====================================================================
begin;

-- 1. Lựa chọn "Upsize" → "Size L"
update option_choices c set name = 'Size L', is_default = false, sort_order = 2
from option_groups g
where g.id = c.group_id and g.kind = 'do_uong' and c.name ilike 'upsize%';

-- 2. Thêm "Size M" (giá gốc, chọn sẵn) cho các nhóm vừa có Size L
insert into option_choices (group_id, name, price_delta, is_default, is_available, sort_order)
select g.id, 'Size M', 0, true, true, 1
from option_groups g
where g.kind = 'do_uong'
  and exists (select 1 from option_choices c where c.group_id = g.id and c.name = 'Size L')
  and not exists (select 1 from option_choices c where c.group_id = g.id and c.name = 'Size M');

-- 3. Nhóm thành "Size", bắt buộc chọn 1 (M chọn sẵn nên khách không phải bấm thêm)
update option_groups g set title = 'Size', min_select = 1, max_select = 1,
  name = case when g.name ilike 'upsize%' then regexp_replace(g.name, '^[Uu]psize', 'Size M/L') else g.name end
where g.kind = 'do_uong'
  and exists (select 1 from option_choices c where c.group_id = g.id and c.name = 'Size L')
  and exists (select 1 from option_choices c where c.group_id = g.id and c.name = 'Size M');

commit;

-- Kiểm tra: mỗi nhóm Size có đúng 2 lựa chọn M (0đ, chọn sẵn) và L (+giá)
select g.name as nhom, g.title, g.min_select, g.max_select,
       string_agg(c.name || ' +' || c.price_delta || case when c.is_default then ' (chọn sẵn)' else '' end, ' · ' order by c.sort_order) as lua_chon,
       (select count(*) from menu_item_option_groups l where l.group_id = g.id) as so_mon
from option_groups g join option_choices c on c.group_id = g.id
where g.kind = 'do_uong'
group by g.id order by g.sort_order, g.id;
