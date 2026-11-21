// Đóng gói Bé Nốc POS: mỗi trang HTML là một đầu vào, JS/CSS được nén và gắn mã băm vào tên tệp.
// Ảnh, âm thanh, APK, thư viện quét mã, _headers nằm trong public/ (chép nguyên vào dist/).
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const pages = ['index', 'bep', 'phache', 'quanly', 'maytem', 'chinh-sach'];

export default defineConfig({
  build: {
    outDir: 'dist',
    target: ['es2022', 'safari15'],
    rollupOptions: {
      input: Object.fromEntries(pages.map(p => [p, resolve(import.meta.dirname, p + '.html')]))
    }
  }
});
