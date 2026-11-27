// Ghép src/worker.js + src/dashboard.html thành worker.js một tệp để dán vào Cloudflare (Edit code) hoặc wrangler deploy.
// Chạy: node build.mjs
import { readFileSync, writeFileSync } from "node:fs";
const here = new URL(".", import.meta.url);
const js = readFileSync(new URL("src/worker.js", here), "utf8");
const html = readFileSync(new URL("src/dashboard.html", here), "utf8");
if (!js.includes("__DASHBOARD_HTML__")) throw new Error("Thiếu chỗ đặt __DASHBOARD_HTML__ trong src/worker.js");
const out = js.replace("__DASHBOARD_HTML__", () => JSON.stringify(html));
writeFileSync(new URL("worker.js", here), "// TỆP SINH TỰ ĐỘNG từ src/ bằng `node build.mjs` — sửa ở src/ rồi build lại.\n" + out);
console.log("worker.js:", Buffer.byteLength(out), "byte");
