-- =====================================================================
-- CẬP NHẬT 12: sắp xếp lại size / upsize của đồ uống
--   Nước uống (menu Ăn vặt)                          → tuỳ chọn "Size XL" +5k (không bắt buộc)
--   Trà sữa, Trà hoa quả, Sốt khoai môn tươi,
--   Món nên thử, Cà phê, Matcha · Cacao · Khoai môn  → size nhỏ nhất là L, tuỳ chọn "Upsize" +10k
--   (không còn chọn Size M / Size L)
--   Sốt cốm tươi                                     → tuỳ chọn "Upsize" +15k
-- - Chỉ đổi nhóm tuỳ chọn size/upsize và việc gắn nhóm đó vào món.
--   KHÔNG xoá món, KHÔNG đổi giá món, KHÔNG đụng đơn / hoá đơn (hoá đơn cũ đã lưu sẵn tên tuỳ chọn).
-- - Các nhóm khác (đường, đá, topping, chọn kem…) giữ nguyên.
-- Chạy trên Supabase SQL Editor. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================
begin;

-- 1. Ba nhóm chuẩn (tạo nếu chưa có, sửa lại nếu đã có)
insert into option_groups (name, title, kind, min_select, max_select, sort_order) values
  ('Upsize (+10k)',   'Upsize', 'do_uong', 0, 1, 1),
  ('Upsize (+15k)',   'Upsize', 'do_uong', 0, 1, 1),
  ('Size XL (+5k)',   'Size',   'do_uong', 0, 1, 1)
on conflict (name) do update set title = excluded.title, kind = 'do_uong',
  min_select = excluded.min_select, max_select = excluded.max_select;

-- 2. Lựa chọn trong mỗi nhóm: xoá lựa chọn lạ, thêm / sửa đúng giá
create temp table _want (grp text, choice text, price int, is_def boolean, ord int) on commit drop;
insert into _want values
  ('Upsize (+10k)',   'Upsize',  10000, false, 1),
  ('Upsize (+15k)',   'Upsize',  15000, false, 1),
  ('Size XL (+5k)',   'Size XL', 5000,  false, 1);

delete from option_choices c using option_groups g
where g.id = c.group_id and g.name in (select grp from _want)
  and not exists (select 1 from _want w where w.grp = g.name and w.choice = c.name);

update option_choices c set price_delta = w.price, is_default = w.is_def, sort_order = w.ord, is_available = true
from option_groups g, _want w
where g.id = c.group_id and w.grp = g.name and w.choice = c.name;

insert into option_choices (group_id, name, price_delta, is_default, is_available, sort_order)
select g.id, w.choice, w.price, w.is_def, true, w.ord
from _want w join option_groups g on g.name = w.grp
where not exists (select 1 from option_choices c where c.group_id = g.id and c.name = w.choice);

-- 3. Gỡ mọi nhóm size / upsize khỏi tất cả món (để gắn lại cho đúng ở bước 4)
delete from menu_item_option_groups l using option_groups g
where g.id = l.group_id
  and (g.title in ('Size', 'Upsize') or g.name ilike 'upsize%' or g.name ilike 'size%' or g.title ilike 'upsize%');

-- 4. Gắn lại theo danh mục (sort_order 0: size / upsize hiện đầu tiên)
insert into menu_item_option_groups (menu_item_id, group_id, sort_order)
select mi.id, g.id, 0
from menu_items mi
join menu_categories c on c.id = mi.category_id
join option_groups g on g.name = case
    when c.name ilike 'nước uống%'                                         then 'Size XL (+5k)'
    when c.name ilike '%cốm%'                                              then 'Upsize (+15k)'
    when c.name ilike 'trà sữa%' or c.name ilike 'trà hoa quả%'
      or c.name ilike 'sốt khoai môn%' or c.name ilike 'món nên thử%'
      or c.name ilike 'cà phê%' or c.name ilike '%matcha%' or c.name ilike '%cacao%' then 'Upsize (+10k)'
  end
on conflict do nothing;

-- 5. Dọn các nhóm size / upsize cũ không còn món nào dùng
delete from option_groups g
where (g.title in ('Size', 'Upsize') or g.name ilike 'upsize%' or g.name ilike 'size%' or g.title ilike 'upsize%')
  and g.name not in ('Upsize (+10k)', 'Upsize (+15k)', 'Size XL (+5k)')
  and not exists (select 1 from menu_item_option_groups l where l.group_id = g.id);

commit;

-- Kiểm tra: mỗi danh mục đồ uống dùng nhóm nào, bao nhiêu món
select c.name as danh_muc, g.name as nhom,
       (select string_agg(ch.name || ' +' || ch.price_delta, ' · ' order by ch.sort_order) from option_choices ch where ch.group_id = g.id) as lua_chon,
       count(*) as so_mon
from menu_item_option_groups l
join option_groups g on g.id = l.group_id
join menu_items mi on mi.id = l.menu_item_id
join menu_categories c on c.id = mi.category_id
where g.title in ('Size', 'Upsize')
group by c.sort_order, c.name, g.id, g.name order by c.sort_order;
