/* =====================================================================
   CẤU HÌNH BÉ NỐC POS
   Điền 2 dòng Supabase để chạy thật. Để trống = chế độ xem thử
   (dữ liệu lưu trong trình duyệt, chỉ dùng để thử giao diện).
   ===================================================================== */
window.BENOC_CONFIG = {
  SUPABASE_URL: '',        // ví dụ: https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: '',   // Supabase > Project Settings > API > anon public key
  POLL_SECONDS: 15,        // trang khách tự cập nhật trạng thái đơn mỗi 15 giây
  LOGIN_DOMAIN: 'benoc.app' // nhân viên đăng nhập bằng số điện thoại; hệ thống đổi thành <sđt>@benoc.app
};
