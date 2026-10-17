/* =====================================================================
   CẤU HÌNH BÉ NỐC POS — 2 môi trường
   - PRODUCT: quán dùng thật       https://nvtthai2802.github.io/benoc-pos/
   - TEST:    thử tính năng mới    https://nvtthai2802.github.io/benoc-pos/test/
   Trang tự chọn môi trường theo địa chỉ: nằm trong thư mục /test/ là TEST.
   Để trống 2 dòng Supabase = chế độ xem thử (dữ liệu lưu trong trình duyệt).
   ===================================================================== */
(function () {
  const ENVS = {
    product: {
      SUPABASE_URL: 'https://hixdacnaxfuxuccbajzn.supabase.co',
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpeGRhY25heGZ1eHVjY2JhanpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxOTk1NzIsImV4cCI6MjEwNzc3NTU3Mn0.svOXrzV2rNaN1qqNKkbvXeWPHtirXrm7orOKB3WiR0Q',
      STORE_PREFIX: 'benoc.'
    },
    test: {
      SUPABASE_URL: '',      // Supabase dự án benoc-pos-test
      SUPABASE_ANON_KEY: '', // Project Settings > API > anon public key
      STORE_PREFIX: 'benoc.test.'
    }
  };
  const isTest = /\/test(\/|$)/.test(location.pathname);
  window.BENOC_ENV = isTest ? 'test' : 'product';
  window.BENOC_CONFIG = Object.assign({
    POLL_SECONDS: 15,         // trang khách tự cập nhật trạng thái đơn mỗi 15 giây
    LOGIN_DOMAIN: 'benoc.app' // nhân viên đăng nhập bằng số điện thoại; hệ thống đổi thành <sđt>@benoc.app
  }, ENVS[window.BENOC_ENV]);
})();
