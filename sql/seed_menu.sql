-- =====================================================================
-- MENU BÉ NỐC — dữ liệu ban đầu
-- Chạy SAU schema.sql. Sau này chủ quán sửa menu trong giao diện quản lý.
-- Giá lấy theo tờ menu chính (VNĐ).
-- =====================================================================

-- ---------- Danh mục ----------
-- color: vang | cam | hong | xanhla | xanhduong | tim | nau (màu khung giống tờ menu)
-- station: bep (bếp nóng) | pha_che (quầy pha chế). "Nước uống" (sữa đậu, trà quất...) do bếp làm.
insert into menu_categories (name, color, station, sort_order) values
  ('Cơm trộn', 'vang', 'bep', 1),
  ('Mì trộn', 'hong', 'bep', 2),
  ('Kimbap', 'xanhla', 'bep', 3),
  ('Đồ ăn vặt', 'cam', 'bep', 4),
  ('Nước uống', 'vang', 'bep', 5),
  ('Trà sữa', 'hong', 'pha_che', 6),
  ('Trà hoa quả', 'cam', 'pha_che', 7),
  ('Sốt khoai môn tươi', 'tim', 'pha_che', 8),
  ('Cà phê', 'nau', 'pha_che', 9),
  ('Matcha · Cacao · Khoai môn', 'xanhla', 'pha_che', 10),
  ('Món nên thử', 'xanhduong', 'pha_che', 11);

-- ---------- Món ----------
insert into menu_items (category_id, name, price, prep_minutes, tag, description, sort_order)
select c.id, v.name, v.price, v.prep, v.tag, v.descr, v.ord
from (values
  -- Cơm trộn
  ('Cơm trộn', 'Cơm heo chiên xù',        30000, 7, null, null, 1),
  ('Cơm trộn', 'Cơm gà viên',             30000, 7, null, null, 2),
  ('Cơm trộn', 'Cơm nem chua rán',        30000, 7, null, null, 3),
  ('Cơm trộn', 'Cơm thịt băm trứng',      30000, 7, null, null, 4),
  ('Cơm trộn', 'Cơm trộn Hàn Quốc',       30000, 7, null, null, 5),
  ('Cơm trộn', 'Cơm heo chua ngọt',       33000, 8, 'Best seller', null, 6),
  ('Cơm trộn', 'Cơm gà chua ngọt',        33000, 8, null, null, 7),
  -- Mì trộn
  ('Mì trộn', 'Mì heo chiên xù',          30000, 7, null, null, 1),
  ('Mì trộn', 'Mì gà viên',               30000, 7, null, null, 2),
  ('Mì trộn', 'Mì nem chua rán',          30000, 7, null, null, 3),
  ('Mì trộn', 'Mì trứng xúc xích',        27000, 7, null, null, 4),
  ('Mì trộn', 'Mì thập cẩm viên chiên',   33000, 8, null, null, 5),
  -- Kimbap
  ('Kimbap', 'Kimbap thường',             22000, 4, null, null, 1),
  ('Kimbap', 'Kimbap Mix',                25000, 5, null, null, 2),
  ('Kimbap', 'Kimbap chiên',              27000, 8, null, null, 3),
  -- Đồ ăn vặt
  ('Đồ ăn vặt', 'Nem chua rán ngon (6 cái)',    25000, 8, null, null, 1),
  ('Đồ ăn vặt', 'Nem chua rán thường (8 cái)',  25000, 8, null, null, 2),
  ('Đồ ăn vặt', 'Khoai lang kén',               25000, 8, null, null, 3),
  ('Đồ ăn vặt', 'Khoai lắc phô mai',            25000, 8, null, null, 4),
  ('Đồ ăn vặt', 'Ngô chiên bơ',                 25000, 8, null, null, 5),
  ('Đồ ăn vặt', 'Sét viên chiên',               25000, 8, null, null, 6),
  ('Đồ ăn vặt', 'Tokbokki',                     25000, 10, null, null, 7),
  ('Đồ ăn vặt', 'Gà viên sốt chua ngọt',        33000, 9, null, null, 8),
  -- Trà sữa (size L)
  ('Trà sữa', 'Hồng trà sữa trân châu',               25000, 4, null, null, 1),
  ('Trà sữa', 'Trà sữa thạch dừa',                    30000, 4, null, null, 2),
  ('Trà sữa', 'Trà sữa trân châu đường đen',          30000, 4, null, null, 3),
  ('Trà sữa', 'Sữa tươi trân châu đường đen',         30000, 4, null, null, 4),
  ('Trà sữa', 'Trà sữa trân châu kem trứng dừa nướng',30000, 5, null, null, 5),
  ('Trà sữa', 'Trà sữa trân châu kem cheese',         30000, 5, null, null, 6),
  ('Trà sữa', 'Lục trà sữa trân châu',                25000, 4, null, null, 7),
  ('Trà sữa', 'Lục trà sữa xoài',                     30000, 4, null, null, 8),
  ('Trà sữa', 'Ngọc hồng trà fulltopping',            35000, 5, 'Đặc biệt',
     'Trân châu hoàng gia, sương sáo, thạch dừa, thạch trà, pudding trứng, kem trứng', 9),
  -- Trà hoa quả (size L)
  ('Trà hoa quả', 'Trà chanh vàng mật ngọt',  19000, 4, null, null, 1),
  ('Trà hoa quả', 'Trà chanh thơm bất tận',   25000, 4, null, null, 2),
  ('Trà hoa quả', 'Hương dứa nắng hạ',        25000, 4, null, null, 3),
  ('Trà hoa quả', 'Hoàng hôn đào chanh',      25000, 4, null, null, 4),
  ('Trà hoa quả', 'Hồng lựu thanh mai',       25000, 4, null, null, 5),
  ('Trà hoa quả', 'Nho Ruby',                 25000, 4, null, null, 6),
  ('Trà hoa quả', 'Nho xanh đại náo',         25000, 4, null, null, 7),
  ('Trà hoa quả', 'Lục trà dưa lưới',         25000, 4, null, null, 8),
  ('Trà hoa quả', 'Lục trà dâu tằm',          25000, 4, null, null, 9),
  ('Trà hoa quả', 'Trà cam đào dâu tây',      29000, 4, null, null, 10),
  ('Trà hoa quả', 'Trà dâu đam mỹ',           29000, 4, null, null, 11),
  ('Trà hoa quả', 'Trà nho tím vân mây',      29000, 5, 'Đặc biệt', null, 12),
  -- Sốt khoai môn tươi (size L)
  ('Sốt khoai môn tươi', 'Hồng trà sữa sốt khoai môn', 35000, 5, null, 'Topping hạt nổ + trân châu', 1),
  ('Sốt khoai môn tươi', 'Lục trà sữa sốt khoai môn',  35000, 5, null, 'Topping hạt nổ + trân châu', 2),
  ('Sốt khoai môn tươi', 'Sữa dừa sốt khoai môn',      35000, 5, null, 'Topping hạt nổ + trân châu', 3),
  ('Sốt khoai môn tươi', 'Sữa tươi sốt khoai môn',     35000, 5, null, 'Topping hạt nổ + trân châu', 4),
  -- Cà phê (giá size M, size L cộng thêm qua tuỳ chọn)
  ('Cà phê', 'Cà phê đen',                    15000, 3, null, null, 1),
  ('Cà phê', 'Cà phê sữa',                    20000, 3, null, null, 2),
  ('Cà phê', 'Bạc xỉu',                       22000, 3, null, null, 3),
  ('Cà phê', 'Cà phê muối',                   25000, 4, null, null, 4),
  ('Cà phê', 'Cà phê kem dẻo Buôn Mê',        25000, 5, 'Đặc biệt', null, 5),
  ('Cà phê', 'Sữa tươi sương sáo cà phê',     30000, 5, 'Đặc biệt', null, 6),
  -- Matcha · Cacao · Khoai môn (giá size M)
  ('Matcha · Cacao · Khoai môn', 'Matcha latte',          25000, 4, null, null, 1),
  ('Matcha · Cacao · Khoai môn', 'Matcha latte dâu',      30000, 4, null, null, 2),
  ('Matcha · Cacao · Khoai môn', 'Matcha latte xoài',     30000, 4, null, null, 3),
  ('Matcha · Cacao · Khoai môn', 'Matcha sữa dừa',        35000, 4, null, null, 4),
  ('Matcha · Cacao · Khoai môn', 'Matcha latte kem',      30000, 5, null, null, 5),
  ('Matcha · Cacao · Khoai môn', 'Matcha cold whisk',     35000, 5, 'Đặc biệt', null, 6),
  ('Matcha · Cacao · Khoai môn', 'Cacao latte',           25000, 4, null, null, 7),
  ('Matcha · Cacao · Khoai môn', 'Cacao mint',            30000, 5, 'Đặc biệt',
     '2 tầng: dưới bạc hà mát lạnh, trên cacao thơm béo', 8),
  ('Matcha · Cacao · Khoai môn', 'Khoai môn latte',       25000, 4, null, null, 9),
  ('Matcha · Cacao · Khoai môn', 'Khoai môn latte kem',   30000, 5, null, null, 10),
  -- Món nên thử (size L)
  ('Món nên thử', 'Trà bí đao sương sáo hạt chia',  20000, 4, null, null, 1),
  ('Món nên thử', 'Sữa dừa sương sáo hạt chia',     25000, 4, null, null, 2),
  ('Món nên thử', 'Trà sen vàng',                   30000, 5, null, 'Thêm lớp kem cheese mịn', 3),
  ('Món nên thử', 'Trời xanh mây trắng',            35000, 5, 'Đặc biệt', null, 4),
  -- Nước uống
  ('Nước uống', 'Dưa hấu ép 700ml',  15000, 4, null, null, 1),
  ('Nước uống', 'Cam ép 500ml',      15000, 4, null, null, 2),
  ('Nước uống', 'Sữa đậu',           10000, 2, null, null, 3),
  ('Nước uống', 'Me đá',             10000, 2, null, null, 4),
  ('Nước uống', 'Trà quất',          10000, 2, null, null, 5),
  ('Nước uống', 'Trà chanh',         10000, 2, null, null, 6),
  ('Nước uống', 'Trà Thái xanh',     12000, 3, null, null, 7),
  ('Nước uống', 'Trà việt quất',     12000, 3, null, null, 8),
  ('Nước uống', 'Trà ổi',            12000, 3, null, null, 9),
  ('Nước uống', 'Trà đào',           12000, 3, null, null, 10),
  ('Nước uống', 'Trà măng cụt',      12000, 3, null, null, 11),
  ('Nước uống', 'Trà dưa lưới',      12000, 3, null, null, 12),
  ('Nước uống', 'Trà chanh dây',     12000, 3, null, null, 13)
) as v(cat, name, price, prep, tag, descr, ord)
join menu_categories c on c.name = v.cat;

-- ---------- Nhóm tuỳ chọn ----------
-- kind: 'do_uong' = tuỳ chọn đồ uống, 'do_an' = tuỳ chọn đồ ăn
insert into option_groups (name, title, min_select, max_select, sort_order, kind) values
  ('Upsize (+10k)',       'Upsize',       0, 1, 1, 'do_uong'),  -- trà sữa, trà hoa quả, sốt khoai môn, món nên thử, cà phê, matcha · cacao (size nhỏ nhất là L)
  ('Upsize (+15k)',       'Upsize',       0, 1, 1, 'do_uong'),  -- các món cốm
  ('Size XL (+5k)',       'Size',         0, 1, 1, 'do_uong'),  -- nước uống của menu Ăn vặt
  ('Kem matcha',          'Chọn kem',     1, 1, 3, 'do_uong'),
  ('Kem khoai môn',       'Chọn kem',     1, 1, 3, 'do_uong'),
  ('Thêm mì',             'Thêm mì',      0, 1, 4, 'do_an'),
  ('Combo kimbap',        'Combo',        0, 1, 5, 'do_an'),
  ('Topping cơm/mì',      'Topping thêm', 0, 6, 6, 'do_an');

insert into option_choices (group_id, name, price_delta, is_default, sort_order)
select g.id, v.name, v.price, v.is_default, v.ord
from (values
  ('Upsize (+10k)',   'Upsize',  10000, false, 1),
  ('Upsize (+15k)',   'Upsize',  15000, false, 1),
  ('Size XL (+5k)',   'Size XL', 5000,  false, 1),
  ('Kem matcha',      'Kem muối',  0, false, 1),
  ('Kem matcha',      'Kem cheese',0, false, 2),
  ('Kem khoai môn',   'Kem trứng', 0, false, 1),
  ('Kem khoai môn',   'Kem cheese',0, false, 2),
  ('Thêm mì',         'Thêm 1 phần mì', 7000, false, 1),
  ('Combo kimbap',    'Thêm gà sốt chua ngọt', 15000, false, 1),
  ('Topping cơm/mì',  'Trứng ốp la',       5000,  false, 1),
  ('Topping cơm/mì',  'Xúc xích chiên',    10000, false, 2),
  ('Topping cơm/mì',  'Gà viên',           10000, false, 3),
  ('Topping cơm/mì',  'Nem chua rán 2 cái',10000, false, 4),
  ('Topping cơm/mì',  'Heo chiên xù',      15000, false, 5),
  ('Topping cơm/mì',  'Lạp xưởng',         15000, false, 6)
) as v(grp, name, price, is_default, ord)
join option_groups g on g.name = v.grp;

-- ---------- Gắn tuỳ chọn vào món ----------
-- Theo cả danh mục
insert into menu_item_option_groups (menu_item_id, group_id, sort_order)
select mi.id, g.id, v.ord
from (values
  ('Cơm trộn',           'Topping cơm/mì', 2),
  ('Mì trộn',            'Thêm mì',        1),
  ('Mì trộn',            'Topping cơm/mì', 2),
  ('Kimbap',             'Combo kimbap',   1),
  ('Nước uống',          'Size XL (+5k)',   0),
  ('Trà sữa',            'Upsize (+10k)',   0),
  ('Trà hoa quả',        'Upsize (+10k)',   0),
  ('Sốt khoai môn tươi', 'Upsize (+10k)',   0),
  ('Món nên thử',        'Upsize (+10k)',   0),
  ('Cà phê',             'Upsize (+10k)',   0),
  ('Matcha · Cacao · Khoai môn', 'Upsize (+10k)', 0)
) as v(cat, grp, ord)
join menu_categories c on c.name = v.cat
join menu_items mi on mi.category_id = c.id
join option_groups g on g.name = v.grp;

-- Theo từng món
insert into menu_item_option_groups (menu_item_id, group_id, sort_order)
select mi.id, g.id, v.ord
from (values
  ('Matcha latte kem',          'Kem matcha',      2),
  ('Khoai môn latte kem',       'Kem khoai môn',   2)
) as v(item, grp, ord)
join menu_items mi on mi.name = v.item
join option_groups g on g.name = v.grp;

-- ---------- Topping đồ uống, lượng đường, lượng đá (giống cap-nhat-5) ----------
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

-- ---------- Ảnh minh hoạ ban đầu (cắt từ ảnh menu của quán) ----------
-- Ảnh nằm trong thư mục img/ của trang web. Chủ quán đổi ảnh trong trang Quản lý > Menu.
update menu_items mi set image_path = 'img/' || v.file || '.jpg'
from (values
  ('Cơm nem chua rán','com-nem-chua-ran'), ('Cơm thịt băm trứng','com-thit-bam-trung'),
  ('Cơm gà viên','com-ga-vien'), ('Cơm heo chua ngọt','com-heo-chua-ngot'),
  ('Cơm trộn Hàn Quốc','com-tron-han-quoc'), ('Mì thập cẩm viên chiên','mi-thap-cam'),
  ('Kimbap Mix','kimbap-mix'), ('Kimbap thường','kimbap-thuong'), ('Kimbap chiên','kimbap-chien'),
  ('Gà viên sốt chua ngọt','ga-vien-chua-ngot'), ('Sét viên chiên','set-vien-chien'),
  ('Khoai lắc phô mai','khoai-lac-pho-mai'), ('Nem chua rán thường (8 cái)','nem-chua-ran-thuong'),
  ('Nem chua rán ngon (6 cái)','nem-chua-ran-ngon'), ('Ngô chiên bơ','ngo-chien-bo'), ('Sữa đậu','sua-dau'),
  ('Trà chanh vàng mật ngọt','tra-chanh-vang'), ('Trà chanh thơm bất tận','tra-chanh-thom'),
  ('Hương dứa nắng hạ','huong-dua'), ('Hoàng hôn đào chanh','hoang-hon-dao'),
  ('Hồng lựu thanh mai','hong-luu'), ('Nho Ruby','nho-ruby'), ('Nho xanh đại náo','nho-xanh'),
  ('Lục trà dưa lưới','luc-tra-dua-luoi'), ('Lục trà dâu tằm','luc-tra-dau-tam'),
  ('Trà cam đào dâu tây','tra-cam-dao'), ('Trà dâu đam mỹ','tra-dau-dam-my'), ('Trà nho tím vân mây','tra-nho-tim'),
  ('Hồng trà sữa trân châu','hong-tra-sua'), ('Trà sữa thạch dừa','ts-thach-dua'),
  ('Trà sữa trân châu đường đen','ts-duong-den'), ('Sữa tươi trân châu đường đen','sua-tuoi-duong-den'),
  ('Trà sữa trân châu kem trứng dừa nướng','ts-kem-trung'), ('Trà sữa trân châu kem cheese','ts-kem-cheese'),
  ('Lục trà sữa trân châu','luc-tra-sua'), ('Lục trà sữa xoài','luc-tra-xoai'), ('Ngọc hồng trà fulltopping','ngoc-hong-tra'),
  ('Hồng trà sữa sốt khoai môn','kmt-hong-tra'), ('Lục trà sữa sốt khoai môn','kmt-luc-tra'),
  ('Sữa dừa sốt khoai môn','kmt-sua-dua'), ('Sữa tươi sốt khoai môn','kmt-sua-tuoi'),
  ('Cà phê đen','cf-den'), ('Cà phê sữa','cf-sua'), ('Bạc xỉu','bac-xiu'), ('Cà phê muối','cf-muoi'),
  ('Cà phê kem dẻo Buôn Mê','cf-kem-deo'), ('Sữa tươi sương sáo cà phê','sua-tuoi-suong-sao-cf'),
  ('Matcha latte','matcha-latte'), ('Matcha latte dâu','matcha-dau'), ('Matcha latte xoài','matcha-xoai'),
  ('Matcha sữa dừa','matcha-sua-dua'), ('Matcha latte kem','matcha-kem'), ('Matcha cold whisk','matcha-cold-whisk'),
  ('Cacao latte','cacao-latte'), ('Cacao mint','cacao-mint'), ('Khoai môn latte','km-latte'),
  ('Khoai môn latte kem','km-latte-kem'),
  ('Trà bí đao sương sáo hạt chia','bi-dao-suong-sao'), ('Sữa dừa sương sáo hạt chia','sua-dua-suong-sao'),
  ('Trà sen vàng','tra-sen-vang'), ('Trời xanh mây trắng','troi-xanh-may-trang')
) as v(item, file)
where mi.name = v.item;
