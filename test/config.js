/* =====================================================================
   CẤU HÌNH BÉ NỐC POS — 2 môi trường
   - PRODUCT: quán dùng thật       https://benoc-pos.pages.dev/          (Cloudflare Pages, nhánh main)
   - TEST:    thử tính năng mới    https://benoc-pos.pages.dev/test/
   (bản cũ trên GitHub Pages vẫn chạy: https://nvtthai2802.github.io/benoc-pos/ và /test/)
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
      SUPABASE_URL: 'https://bsnpcinocphuruahpzwr.supabase.co', // Supabase dự án benoc-pos-test
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzbnBjaW5vY3BodXJ1YWhwendyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMjExMDIsImV4cCI6MjEwNzc5NzEwMn0.2h23kG6JMU5Y3xSYjwU4jlIcA5ig6PM7ivpoXXrCR78',
      STORE_PREFIX: 'benoc.test.'
    }
  };
  // TEST nếu: trang nằm trong thư mục /test/, HOẶC là bản xem trước của Cloudflare Pages
  // (dạng <nhánh hoặc mã>.benoc.pages.dev). Chỉ đúng địa chỉ chính mới dùng cơ sở dữ liệu thật.
  const h = location.hostname;
  const isPreview = /\.pages\.dev$/.test(h) && h.split('.').length > 3;
  const isTest = isPreview || /\/test(\/|$)/.test(location.pathname);
  window.BENOC_ENV = isTest ? 'test' : 'product';
  window.BENOC_CONFIG = Object.assign({
    POLL_SECONDS: 15,         // trang khách tự cập nhật trạng thái đơn mỗi 15 giây
    LOGIN_DOMAIN: 'benoc.app' // nhân viên đăng nhập bằng số điện thoại; hệ thống đổi thành <sđt>@benoc.app
  }, ENVS[window.BENOC_ENV]);
})();
