// Đóng gói Bé Nốc POS: mỗi trang HTML là một đầu vào, JS/CSS được nén và gắn mã băm vào tên tệp.
// Ảnh, âm thanh, APK, thư viện quét mã, _headers nằm trong public/ (chép nguyên vào dist/).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

// Mã bản build: trang so với /version.json để biết đã có bản mới (Bước 4)
const BUILD = Date.now().toString(36);

const pages = ['index', 'bep', 'phache', 'quanly', 'maytem', 'chinh-sach'];

export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [react(), {
    name: 'benoc-pwa',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: BUILD }) });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: readFileSync('sw.src.js', 'utf8').replaceAll('__BUILD__', BUILD) });
    }
  }],
  build: {
    outDir: 'dist',
    target: ['es2022', 'safari15'],
    rollupOptions: {
      input: Object.fromEntries(pages.map(p => [p, resolve(import.meta.dirname, p + '.html')]))
    }
  }
});
