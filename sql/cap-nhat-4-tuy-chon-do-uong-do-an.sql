-- =====================================================================
-- CẬP NHẬT 4 (17/10/2026): PHÂN LOẠI TUỲ CHỌN + GỘP SIZE THÀNH UPSIZE
-- 1. Mỗi nhóm tuỳ chọn có loại: 'do_uong' (đồ uống) hoặc 'do_an' (đồ ăn).
-- 2. Chỉ giữ 2 nhóm size: "Upsize (+5k)" và "Upsize (+10k)" (không bắt buộc chọn).
--    - "Size to (+5k)" đổi thành "Upsize (+5k)"
--    - Món đang dùng "Size M/L (+5k)"  chuyển sang "Upsize (+5k)"
--    - Món đang dùng "Size M/L (+10k)" chuyển sang "Upsize (+10k)"
--    - Bỏ 2 nhóm "Size M/L (+5k)" và "Size M/L (+10k)"
-- Giá không đổi: trước là M = giá gốc, L = +5k/+10k; nay là giá gốc, Upsize = +5k/+10k.
-- Không đụng tới đơn, doanh thu (hoá đơn cũ lưu sẵn tên tuỳ chọn).
-- Chạy trên Supabase TEST trước, ổn rồi mới chạy trên PRODUCT. Chạy lại lần hai không sao.
-- =====================================================================
begin;

-- 1. Cột loại tuỳ chọn
alter table option_groups add column if not exists kind text not null default 'do_an'
  check (kind in ('do_an', 'do_uong'));

-- 2. Nhóm "Upsize (+5k)"
do $$
declare v_id int;
begin
  if not exists (select 1 from option_groups where name = 'Upsize (+5k)') then
    select id into v_id from option_groups where name = 'Size to (+5k)';
    if v_id is not null then
      update option_groups set name = 'Upsize (+5k)', title = 'Upsize', min_select = 0, max_select = 1 where id = v_id;
      update option_choices set name = 'Upsize' where group_id = v_id;
    else
      insert into option_groups (name, title, min_select, max_select, sort_order, kind)
      values ('Upsize (+5k)', 'Upsize', 0, 1, 2, 'do_uong') returning id into v_id;
      insert into option_choices (group_id, name, price_delta, is_default, sort_order) values (v_id, 'Upsize', 5000, false, 1);
    end if;
  end if;
  if not exists (select 1 from option_groups where name = 'Upsize (+10k)') then
    insert into option_groups (name, title, min_select, max_select, sort_order, kind)
    values ('Upsize (+10k)', 'Upsize', 0, 1, 2, 'do_uong') returning id into v_id;
    insert into option_choices (group_id, name, price_delta, is_default, sort_order) values (v_id, 'Upsize', 10000, false, 1);
  end if;
end $$;

-- 3. Chuyển món từ Size M/L sang Upsize (giữ thứ tự hiển thị), rồi bỏ 2 nhóm Size M/L
insert into menu_item_option_groups (menu_item_id, group_id, sort_order)
select l.menu_item_id, up.id, l.sort_order
  from menu_item_option_groups l
  join option_groups old on old.id = l.group_id
  join option_groups up  on up.name = case old.name when 'Size M/L (+5k)'  then 'Upsize (+5k)'
                                                   when 'Size M/L (+10k)' then 'Upsize (+10k)' end
on conflict (menu_item_id, group_id) do nothing;

delete from option_groups where name in ('Size M/L (+5k)', 'Size M/L (+10k)');  -- lựa chọn M/L và liên kết tự xoá theo

-- 4. Gán loại: nhóm size, kem → đồ uống; nhóm gắn với món của quầy pha chế / danh mục đồ uống → đồ uống
update option_groups set kind = 'do_uong'
 where name in ('Upsize (+5k)', 'Upsize (+10k)', 'Kem matcha', 'Kem khoai môn')
    or id in (select l.group_id from menu_item_option_groups l
                join menu_items mi on mi.id = l.menu_item_id
                join menu_categories c on c.id = mi.category_id
               where c.station = 'pha_che' or c.name ~* '(nước|trà|cà phê|sữa|matcha)');

commit;

-- Kiểm tra
select g.name, g.kind, g.title, g.min_select,
       (select string_agg(c.name || ' +' || c.price_delta, ', ' order by c.sort_order) from option_choices c where c.group_id = g.id) as lua_chon,
       (select count(*) from menu_item_option_groups l where l.group_id = g.id) as so_mon
  from option_groups g order by g.kind desc, g.sort_order, g.id;
