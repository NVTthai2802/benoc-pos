/* =====================================================================
   CẤU HÌNH BÉ NỐC POS
   Điền 2 dòng Supabase để chạy thật. Để trống = chế độ xem thử
   (dữ liệu lưu trong trình duyệt, chỉ dùng để thử giao diện).
   ===================================================================== */
window.BENOC_CONFIG = {
  SUPABASE_URL: 'https://hixdacnaxfuxuccbajzn.supabase.co',        // ví dụ: https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpeGRhY25heGZ1eHVjY2JhanpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTk1NzIsImV4cCI6MjEwNzc3NTU3Mn0.svOXrzV2rNaN1qqNKkbvXeWPHtirXrm7orOKB3WiR0Q',   // Supabase > Project Settings > API > anon public key
  POLL_SECONDS: 15,        // trang khách tự cập nhật trạng thái đơn mỗi 15 giây
  LOGIN_DOMAIN: 'benoc.app' // nhân viên đăng nhập bằng số điện thoại; hệ thống đổi thành <sđt>@benoc.app
};
