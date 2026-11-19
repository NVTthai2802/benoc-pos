-- =====================================================================
-- CẬP NHẬT 40 — Best seller cho TỪNG MỤC menu (cơm trộn, mì trộn, trà sữa…)
-- ---------------------------------------------------------------------
-- Mỗi mục: món bán nhiều nhất 7 ngày (theo số lượng, không tính món tặng).
-- Nhiều món bằng số lượng cao nhất → gắn cho tất cả các món đó.
-- Chỉ thay hàm best_sellers (giữ nguyên cột trả về). Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================
create or replace function best_sellers(p_days int default 7)
returns table (menu_item_id uuid, station text, qty bigint)
language sql stable security definer set search_path = public as $$
  with s as (
    select (i ->> 'menu_item_id')::uuid as mid,
           sum(coalesce((i ->> 'qty')::int, 0)) as q
      from sales, jsonb_array_elements(items) i
     where paid_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 60)))
       and coalesce(i ->> 'promo_part', '') <> 'tang'
       and (i ->> 'menu_item_id') is not null
     group by 1
  ), r as (
    select s.mid, coalesce(c.station, 'bep') as st, s.q,
           rank() over (partition by m.category_id order by s.q desc) as rk
      from s join menu_items m on m.id = s.mid
      left join menu_categories c on c.id = m.category_id
     where m.category_id is not null
  )
  select mid, st, q from r where rk = 1 and q > 0
$$;
grant execute on function best_sellers(int) to anon, authenticated;

select 'Đã cập nhật: best seller cho từng mục menu' as ket_qua;
