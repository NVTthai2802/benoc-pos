-- =====================================================================
-- CẬP NHẬT 5 (17/10/2026): TOPPING ĐỒ UỐNG, LƯỢNG ĐƯỜNG, LƯỢNG ĐÁ
-- Thêm 3 nhóm tuỳ chọn đồ uống:
--   - "Topping đồ uống": trân châu hoàng gia, sương sáo, thạch dừa, thạch trà,
--      thạch pudding trứng, kem trứng, kem cheese (mỗi loại +5.000đ, chủ quán sửa giá
--      trong Quản lý > Menu > Tuỳ chọn). Gắn cho trà sữa, trà hoa quả, sốt khoai môn tươi,
--      matcha · cacao · khoai môn, món nên thử.
--   - "Lượng đường": Không đường / Ít đường / Đường bình thường (mặc định)
--   - "Lượng đá":    Không đá / Ít đá / Đá bình thường (mặc định)
--      Gắn cho mọi đồ uống: các danh mục của quầy pha chế + danh mục Nước uống.
-- Trang khách hiện lượng đường, lượng đá thành 3 ô có hình minh hoạ.
-- Chỉ THÊM, không xoá gì. Chạy lại lần hai không sao (đã có thì bỏ qua).
-- =====================================================================
begin;

do $$
declare v_id int;
begin
  if not exists (select 1 from option_groups where name = 'Lượng đường') then
    insert into option_groups (name, title, min_select, max_select, sort_order, kind)
    values ('Lượng đường', 'Đường', 1, 1, 3, 'do_uong') returning id into v_id;
    insert into option_choices (group_id, name, price_delta, is_default, sort_order) values
      (v_id, 'Không đường', 0, false, 1), (v_id, 'Ít đường', 0, false, 2), (v_id, 'Đường bình thường', 0, true, 3);
  end if;
  if not exists (select 1 from option_groups where name = 'Lượng đá') then
    insert into option_groups (name, title, min_select, max_select, sort_order, kind)
    values ('Lượng đá', 'Đá', 1, 1, 4, 'do_uong') returning id into v_id;
    insert into option_choices (group_id, name, price_delta, is_default, sort_order) values
      (v_id, 'Không đá', 0, false, 1), (v_id, 'Ít đá', 0, false, 2), (v_id, 'Đá bình thường', 0, true, 3);
  end if;
  if not exists (select 1 from option_groups where name = 'Topping đồ uống') then
    insert into option_groups (name, title, min_select, max_select, sort_order, kind)
    values ('Topping đồ uống', 'Topping thêm', 0, 7, 5, 'do_uong') returning id into v_id;
    insert into option_choices (group_id, name, price_delta, is_default, sort_order) values
      (v_id, 'Trân châu hoàng gia', 5000, false, 1),
      (v_id, 'Sương sáo',           5000, false, 2),
      (v_id, 'Thạch dừa',           5000, false, 3),
      (v_id, 'Thạch trà',           5000, false, 4),
      (v_id, 'Thạch pudding trứng', 5000, false, 5),
      (v_id, 'Kem trứng',           5000, false, 6),
      (v_id, 'Kem cheese',          5000, false, 7);
  end if;
end $$;

-- Đường + đá: mọi đồ uống (quầy pha chế + Nước uống). Thứ tự: sau upsize / chọn kem.
insert into menu_item_option_groups (menu_item_id, group_id, sort_order)
select mi.id, g.id, case g.name when 'Lượng đường' then 5 else 6 end
  from menu_items mi
  join menu_categories c on c.id = mi.category_id
  join option_groups g on g.name in ('Lượng đường', 'Lượng đá')
 where c.station = 'pha_che' or c.name = 'Nước uống'
on conflict (menu_item_id, group_id) do nothing;

-- Topping: trà sữa, trà hoa quả, sốt khoai môn, matcha · cacao · khoai môn, món nên thử
insert into menu_item_option_groups (menu_item_id, group_id, sort_order)
select mi.id, g.id, 7
  from menu_items mi
  join menu_categories c on c.id = mi.category_id
  join option_groups g on g.name = 'Topping đồ uống'
 where c.name in ('Trà sữa', 'Trà hoa quả', 'Sốt khoai môn tươi', 'Matcha · Cacao · Khoai môn', 'Món nên thử')
on conflict (menu_item_id, group_id) do nothing;

commit;

-- Kiểm tra
select g.name, g.kind, g.min_select, g.max_select,
       (select string_agg(c.name || case when c.is_default then ' (mặc định)' else '' end || ' +' || c.price_delta, ', ' order by c.sort_order) from option_choices c where c.group_id = g.id) as lua_chon,
       (select count(*) from menu_item_option_groups l where l.group_id = g.id) as so_mon
  from option_groups g where g.name in ('Lượng đường', 'Lượng đá', 'Topping đồ uống') order by g.sort_order;
