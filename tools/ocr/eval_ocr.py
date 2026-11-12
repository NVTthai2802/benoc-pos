"""Đo OCR trên một thư mục ảnh có đáp án (ảnh.png + ảnh.json = [{"text": "...", "box": [x0,y0,x1,y1]}]).

python3 eval_ocr.py THU_MUC det.onnx rec.onnx dict.txt
In ra: CER (tỉ lệ sai ký tự), CER khi bỏ dấu, số dòng đúng hoàn toàn, thời gian trung bình mỗi ảnh.
"""
import sys, glob, json, unicodedata as u, cv2
from ocr_ref import Ocr


def lev(a, b):
    p = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        c = [i]
        for j, y in enumerate(b, 1): c.append(min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (x != y)))
        p = c
    return p[-1]


def strip(s):
    return ''.join(c for c in u.normalize('NFD', s) if not u.combining(c)).replace('đ', 'd').replace('Đ', 'D')


def run(det, rec, dic, files):
    o = Ocr(det, rec, dic); E = N = Es = ok = tot = dm = rm = 0
    for f in files:
        gt = json.load(open(f.rsplit('.', 1)[0] + '.json', encoding='utf-8')); r = o.run(cv2.imread(f)); dm += r['det_ms']; rm += r['rec_ms']
        for g in gt:
            x0, y0, x1, y1 = g['box']
            # dòng dự đoán có tâm nằm trong hộp đáp án (nới 15px), ghép trái → phải
            cand = [l for l in r['lines'] if x0 - 15 <= (l['box'][0] + l['box'][2]) / 2 <= x1 + 15 and y0 - 15 <= (l['box'][1] + l['box'][3]) / 2 <= y1 + 15]
            pred = ' '.join(l['text'] for l in sorted(cand, key=lambda l: l['box'][0])).strip()
            t = g['text']; E += lev(pred, t); N += len(t); Es += lev(strip(pred), strip(t)); ok += pred == t; tot += 1
    n = max(1, len(files))
    return dict(anh=len(files), CER=round(100 * E / N, 2), CER_bo_dau=round(100 * Es / N, 2), dong_dung_het=f'{ok}/{tot}', det_ms=dm // n, rec_ms=rm // n)


if __name__ == '__main__':
    d, det, rec, dic = sys.argv[1:5]
    files = sorted(f for f in glob.glob(d + '/*') if f.lower().endswith(('.png', '.jpg', '.jpeg')))
    print(json.dumps(run(det, rec, dic, files), ensure_ascii=False))
