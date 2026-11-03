-- =====================================================================
-- CẬP NHẬT 33: LÊN ĐƠN BẰNG PHÍM TẮT IPHONE
--   Chủ quán gõ lưng iPhone → Phím tắt chụp màn hình đoạn chat, gửi thẳng vào bot-don
--   → đơn vào bếp / pha chế giống bot Zalo (nhãn ĐƠN ONLINE). Đơn ghi kênh 'ios'.
--   Chỉ nới ràng buộc cột fb_drafts.kenh, không đổi dữ liệu. Chạy lại vẫn an toàn.
-- Chạy trên TEST trước, rồi Product (sau cập nhật 31).
-- =====================================================================
begin;

alter table fb_drafts drop constraint if exists fb_drafts_kenh_check;
alter table fb_drafts add constraint fb_drafts_kenh_check check (kenh in ('fb', 'zalo', 'tele', 'ios'));

commit;
