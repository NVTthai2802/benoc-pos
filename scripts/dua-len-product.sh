#!/usr/bin/env bash
# Đưa bản đã thử ổn trên TEST lên PRODUCT (các file ở gốc nhánh main — quán đang dùng).
# Chỉ chạy sau khi đã thử trên trang test. Nếu bản mới có file sql/cap-nhat-*.sql mới,
# phải chạy file đó trên Supabase product TRƯỚC khi chạy script này.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
[ -z "$(git status --porcelain)" ] || { echo "Còn thay đổi chưa commit, commit trước đã."; exit 1; }
git fetch -q origin
git checkout -q main && git pull -q --ff-only origin main
SRC=${1:-test}
# Lấy toàn bộ file từ nhánh nguồn (trừ thư mục test/ chỉ có ở main), xoá file đã bỏ ở nguồn
for f in $(git ls-tree -r --name-only HEAD | grep -v '^test/'); do
  git cat-file -e "$SRC:$f" 2>/dev/null || git rm -q "$f"
done
git checkout "$SRC" -- .
git add -A
if git diff --cached --quiet; then echo "Product đã là bản mới nhất."; exit 0; fi
git commit -qm "Product: phát hành từ nhánh $SRC ($(git rev-parse --short "$SRC"))"
git push -q origin main
echo "Đã đưa lên PRODUCT: https://nvtthai2802.github.io/benoc-pos/"
