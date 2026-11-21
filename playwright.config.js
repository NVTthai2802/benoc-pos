// Test tự động chạy trên bản build xem thử (VITE_DEMO=1): dữ liệu mẫu trong trình duyệt, không đụng Supabase của quán.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', viewport: { width: 900, height: 900 }, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' },
  webServer: {
    command: 'VITE_DEMO=1 npx vite build --outDir dist-demo && npx vite preview --outDir dist-demo --port 4173 --strictPort',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
