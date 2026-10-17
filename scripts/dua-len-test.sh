#!/usr/bin/env bash
# Đưa bản mới nhất ở nhánh `test` lên MÔI TRƯỜNG TEST (thư mục test/ trên nhánh main).
# Trang test: https://nvtthai2802.github.io/benoc-pos/test/  — nối Supabase benoc-pos-test.
# Không đụng tới các file product ở gốc.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
[ -z "$(git status --porcelain)" ] || { echo "Còn thay đổi chưa commit, commit trước đã."; exit 1; }
git fetch -q origin
git checkout -q main && git pull -q --ff-only origin main
SRC=${1:-test}   # nhánh nguồn, mặc định `test`
rm -rf test && mkdir test
git archive "$SRC" -- '*.html' '*.js' '*.css' img | tar -x -C test
rm -rf test/scripts
git add -A test
if git diff --cached --quiet; then echo "Test đã là bản mới nhất."; exit 0; fi
git commit -qm "Test: cập nhật từ nhánh $SRC ($(git rev-parse --short "$SRC"))"
git push -q origin main
echo "Đã đưa lên TEST. Khoảng 1 phút sau mở: https://nvtthai2802.github.io/benoc-pos/test/"
