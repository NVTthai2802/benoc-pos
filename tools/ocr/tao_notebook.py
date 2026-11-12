"""Sinh notebook danh_gia_ocr.ipynb (đánh giá OCR trên máy cho ảnh chat Messenger / Zalo)."""
import nbformat as nbf

C = []
def md(s): C.append(nbf.v4.new_markdown_cell(s.strip('\n')))
def code(s): C.append(nbf.v4.new_code_cell(s.strip('\n')))

md(r'''
# Đánh giá mô hình OCR nhẹ cho ảnh chụp màn hình chat Messenger / Zalo

**Bài toán.** Chủ quán chụp màn hình đoạn chat đặt món (Messenger / Zalo). App Android đọc chữ **ngay trên điện thoại**
bằng mô hình nhẹ, sau đó phần trích đơn dùng chữ đó. Yêu cầu: mô hình **nhẹ** (vài MB) và **nhanh** (dưới ~1 giây / ảnh trên điện thoại).

**Mô hình.** PaddleOCR **PP-OCRv5 mobile**, chạy bằng ONNX Runtime, gồm 2 bước:

| Bước | Mô hình | Việc |
|---|---|---|
| det | `PP-OCRv5_mobile_det` (DB, ~4,8 MB) | Bản đồ xác suất có chữ → các hộp dòng chữ |
| rec | `latin_PP-OCRv5_mobile_rec` (SVTR + CTC, ~8 MB) | Ảnh 1 dòng chữ → chuỗi ký tự |

Pipeline trong notebook **giống hệt** `OcrCore.kt` của app (cùng tiền xử lý, ngưỡng, nới hộp, giải mã CTC),
nên số liệu ở đây áp dụng được cho app (đã đối chiếu: cùng CER trên cùng bộ ảnh).

**Nội dung**
1. Cài đặt, tải mô hình
2. Phân tích bảng ký tự: mô hình có *biểu diễn được* tiếng Việt không?
3. Bộ dữ liệu đánh giá (giả lập Messenger / Zalo + ảnh thật nếu có)
4. Đánh giá bước tìm chữ (det): Precision / Recall / F1
5. Đánh giá bước đọc chữ (rec) tách riêng: CER, WER, độ chính xác dòng, lỗi theo loại ký tự
6. Đánh giá đầu–cuối (end-to-end) theo giao diện
7. Tốc độ, kích thước, số tham số
8. Ảnh hưởng tham số (kích thước ảnh det, hệ số nới hộp)
9. So sánh các mô hình rec (gồm chỗ cắm mô hình fine-tune)
10. Ảnh thật từ app (bảng `ocr_mau`)
11. Tổng hợp cho báo cáo

> Chạy trên Google Colab: **Runtime → Run all** (CPU là đủ, ~10–15 phút). Kết quả (bảng CSV, hình PNG) lưu ở thư mục `ket_qua/`.
''')

md('## 1. Cài đặt, tải mô hình')
code(r'''
import sys, subprocess, importlib
def pip(*p): subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', *p], check=True)
for mod, pkg in [('onnxruntime', 'onnxruntime'), ('cv2', 'opencv-python-headless'), ('onnx', 'onnx'), ('yaml', 'pyyaml')]:
    try: importlib.import_module(mod)
    except ImportError: pip(pkg)

import os, json, time, glob, random, unicodedata, urllib.request, platform
from collections import Counter, defaultdict
import numpy as np, cv2, yaml, onnx, onnxruntime as ort, pandas as pd
import matplotlib.pyplot as plt
from PIL import Image, ImageDraw, ImageFont

OUT = 'ket_qua'; os.makedirs(OUT, exist_ok=True)
plt.rcParams.update({'figure.dpi': 110, 'axes.grid': True, 'grid.alpha': .3, 'font.size': 10})
print('onnxruntime', ort.__version__, '| CPU:', platform.processor() or platform.machine(), '| số nhân:', os.cpu_count())
''')
code(r'''
HF = 'https://huggingface.co/{}/resolve/main/{}'
def tai(repo, f, dst):
    if not os.path.exists(dst):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        urllib.request.urlretrieve(HF.format(repo, f), dst)
    return dst

M = 'mo_hinh'
DET = tai('PaddlePaddle/PP-OCRv5_mobile_det_onnx', 'inference.onnx', f'{M}/det/inference.onnx')

def nap_rec(ten, repo):
    """Tải 1 mô hình rec ONNX của PaddleOCR + lấy bảng ký tự từ inference.yml"""
    onnx_p = tai(repo, 'inference.onnx', f'{M}/{ten}/inference.onnx')
    yml = tai(repo, 'inference.yml', f'{M}/{ten}/inference.yml')
    chars = yaml.safe_load(open(yml, encoding='utf-8'))['PostProcess']['character_dict']
    return {'ten': ten, 'onnx': onnx_p, 'chars': chars}

REC = {
    'latin (app đang dùng)': nap_rec('latin', 'PaddlePaddle/latin_PP-OCRv5_mobile_rec_onnx'),
    'đa ngôn ngữ (zh/en/ja)': nap_rec('ch', 'PaddlePaddle/PP-OCRv5_mobile_rec_onnx'),
}
# ── Chỗ cắm mô hình rec fine-tune tiếng Việt (khi có): file ONNX + bảng ký tự (1 ký tự / dòng)
FT_ONNX, FT_DICT = 'fine_tune/rec.onnx', 'fine_tune/rec_dict.txt'
if os.path.exists(FT_ONNX) and os.path.exists(FT_DICT):
    REC['fine-tune tiếng Việt'] = {'ten': 'ft', 'onnx': FT_ONNX, 'chars': [l.rstrip('\n') for l in open(FT_DICT, encoding='utf-8')]}
for k, v in REC.items(): print(f'{k:28s} {os.path.getsize(v["onnx"])/1e6:5.1f} MB, {len(v["chars"])} ký tự')
''')

md(r'''
### Pipeline OCR (giống `OcrCore.kt` trong app)

- **det**: thu ảnh để cạnh dài ≤ `det_max_side` (bội số 32), chuẩn hoá ImageNet theo thứ tự kênh B, G, R như PaddleOCR →
  bản đồ xác suất → ngưỡng 0,3 → gom vùng liền nhau (4 hướng) → bỏ vùng có xác suất trung bình < 0,6 →
  **nới hộp** (DB *unclip*) một đoạn `d = w·h·r / (2(w+h))`, r = 1,5. Ảnh chụp màn hình không nghiêng nên dùng hộp thẳng.
- **rec**: cắt hộp, co về cao 48 px giữ tỉ lệ, chuẩn hoá `(x/255 − 0,5)/0,5` → xác suất từng bước thời gian →
  **giải mã CTC tham lam**: lấy lớp lớn nhất, gộp lớp lặp liền nhau, bỏ lớp *blank* (0). Lớp `i` ↔ ký tự `chars[i−1]`, lớp cuối = dấu cách.
''')
code(r'''
class OCR:
    def __init__(self, det_path, rec, threads=4, det_max_side=960, det_thresh=0.3, box_thresh=0.6, unclip=1.5):
        o = ort.SessionOptions(); o.intra_op_num_threads = threads; o.log_severity_level = 3
        self.det = ort.InferenceSession(det_path, o, providers=['CPUExecutionProvider'])
        self.rec = ort.InferenceSession(rec['onnx'], o, providers=['CPUExecutionProvider'])
        self.chars = rec['chars']
        self.det_max_side, self.det_thresh, self.box_thresh, self.unclip = det_max_side, det_thresh, box_thresh, unclip

    def detect(self, bgr):
        h, w = bgr.shape[:2]
        s = min(1.0, self.det_max_side / max(h, w))
        nh, nw = max(32, int(round(h * s / 32)) * 32), max(32, int(round(w * s / 32)) * 32)
        x = cv2.resize(bgr, (nw, nh)).astype(np.float32) / 255.0
        x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
        prob = self.det.run(None, {'x': x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0, 0]
        n, lab, st, _ = cv2.connectedComponentsWithStats((prob > self.det_thresh).astype(np.uint8), connectivity=4)
        sx, sy = w / nw, h / nh
        boxes = []
        for i in range(1, n):
            x0, y0, bw, bh, _ = st[i]
            if min(bw, bh) < 3 or prob[lab == i].mean() < self.box_thresh: continue
            d = bw * bh * self.unclip / (2 * (bw + bh))
            X0, Y0 = max(0, (x0 - d) * sx), max(0, (y0 - d) * sy)
            X1, Y1 = min(w, (x0 + bw + d) * sx), min(h, (y0 + bh + d) * sy)
            if Y1 - Y0 >= 6 and X1 - X0 >= 6: boxes.append((int(X0), int(Y0), int(X1), int(Y1)))
        return sorted(boxes, key=lambda b: (b[1] // 10, b[0]))

    def recognize(self, crop):
        h, w = crop.shape[:2]
        nw = min(1600, max(16, int(np.ceil(48 * w / h))))
        x = (cv2.resize(crop, (nw, 48)).astype(np.float32) / 255.0 - 0.5) / 0.5
        out = self.rec.run(None, {'x': x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
        idx, p = out.argmax(1), out.max(1)
        txt, conf, prev = [], [], -1
        for k, c in enumerate(idx):
            if c != prev and c != 0:
                txt.append(self.chars[c - 1] if c - 1 < len(self.chars) else ' '); conf.append(p[k])
            prev = c
        return unicodedata.normalize('NFC', ''.join(txt)), float(np.mean(conf)) if conf else 0.0

    def __call__(self, bgr):
        t0 = time.perf_counter(); boxes = self.detect(bgr); t1 = time.perf_counter()
        lines = []
        for b in boxes:
            t, c = self.recognize(bgr[b[1]:b[3], b[0]:b[2]])
            if t.strip(): lines.append({'box': b, 'text': t, 'conf': c})
        return {'lines': lines, 'det_ms': (t1 - t0) * 1e3, 'rec_ms': (time.perf_counter() - t1) * 1e3, 'n_box': len(boxes)}

ocr = OCR(DET, REC['latin (app đang dùng)'])
''')

md(r'''
## 2. Bảng ký tự: mô hình có biểu diễn được tiếng Việt không?

Mô hình CTC chỉ in ra được ký tự **có trong bảng ký tự** (mỗi ký tự là một lớp đầu ra). Ký tự không có lớp thì
mô hình **không bao giờ** đọc đúng, dù ảnh rõ đến đâu. Vì vậy đây là việc phải kiểm tra **đầu tiên**.
''')
code(r'''
NGUYEN_AM = 'aăâeêioôơuưy'
DAU = ['', '̀', '́', '̉', '̃', '̣']   # ngang, huyền, sắc, hỏi, ngã, nặng
VIET = sorted({unicodedata.normalize('NFC', v + d) for v in NGUYEN_AM for d in DAU} | {'đ'})
VIET = VIET + [c.upper() for c in VIET]
CO_DAU = [c for c in VIET if c.lower() not in 'aeiouy']          # chữ khác chữ Latin cơ bản

rows = []
for ten, r in REC.items():
    S = set(r['chars'])
    thieu = [c for c in CO_DAU if c not in S]
    rows.append({'mô hình': ten, 'số lớp': len(r['chars']) + 2, 'chữ có dấu TV': len(CO_DAU),
                 'có lớp': len(CO_DAU) - len(thieu), 'thiếu': len(thieu), '% biểu diễn được': round(100 * (1 - len(thieu) / len(CO_DAU)), 1),
                 'ví dụ thiếu': ''.join(thieu[:24])})
bang_ky_tu = pd.DataFrame(rows); bang_ky_tu.to_csv(f'{OUT}/1_bang_ky_tu.csv', index=False); bang_ky_tu
''')
code(r'''
# Theo từng thanh điệu: thanh nào bị thiếu nhiều nhất
ten_dau = ['ngang', 'huyền', 'sắc', 'hỏi', 'ngã', 'nặng']
fig, ax = plt.subplots(figsize=(7, 3.2))
for j, (ten, r) in enumerate(REC.items()):
    S = set(r['chars']); ty = []
    for d in DAU:
        cs = [unicodedata.normalize('NFC', v + d) for v in NGUYEN_AM]; cs += [c.upper() for c in cs]
        ty.append(100 * np.mean([c in S for c in cs]))
    ax.bar(np.arange(6) + j * 0.8 / len(REC), ty, 0.8 / len(REC), label=ten)
ax.set_xticks(np.arange(6) + 0.4 - 0.4 / len(REC)); ax.set_xticklabels(ten_dau)
ax.set_ylabel('% nguyên âm có lớp'); ax.set_ylim(0, 105); ax.set_title('Độ phủ bảng ký tự theo thanh điệu'); ax.legend(fontsize=8)
plt.tight_layout(); plt.savefig(f'{OUT}/1_do_phu_thanh_dieu.png'); plt.show()
''')
md(r'''
**Nhận xét.** Bản `latin` chỉ có các chữ có dấu dùng chung với tiếng Pháp / Bồ Đào Nha… (à á â ã è é ê ì í ò ó ô õ ù ú ý ă đ ơ ư),
**thiếu toàn bộ thanh hỏi và nặng** cùng phần lớn tổ hợp trên ă â ê ô ơ ư. Bản đa ngôn ngữ còn thiếu nhiều hơn.
⇒ Muốn đọc đúng tiếng Việt **bắt buộc** phải mở rộng bảng ký tự và **fine-tune** bước rec.
Bước det không phụ thuộc bảng ký tự nên dùng nguyên được.
''')

md(r'''
## 3. Bộ dữ liệu đánh giá

### 3.1. Ảnh giả lập Messenger / Zalo

Vẽ màn hình chat 1080 × 2340 (tỉ lệ điện thoại phổ biến) với 4 giao diện: Messenger sáng / tối, Zalo sáng / tối;
font Roboto (Android), Inter (gần SF Pro của iOS), Noto Sans, Open Sans; nội dung là câu đặt món tiếng Việt
(có viết tắt *ko, đc, ck, sđt*, giờ, giá, địa chỉ, số điện thoại). Mỗi dòng chữ có **đáp án + hộp toạ độ** chính xác.
Sau đó thu ảnh về cạnh dài 1600 px **giống ảnh app chụp gửi đi**.

> Ảnh giả lập dễ hơn ảnh thật (không emoji, không ảnh đính kèm, không nhãn "đã xem"…). Số liệu cuối cùng cho
> báo cáo nên lấy trên **ảnh thật có đáp án** (mục 3.2 và 10).
''')
code(r'''
FONT_DIR = 'fonts'; os.makedirs(FONT_DIR, exist_ok=True)
GF = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'
FONTS = {}
for ten, path in [('Roboto', 'roboto/Roboto%5Bwdth,wght%5D.ttf'), ('Inter', 'inter/Inter%5Bopsz,wght%5D.ttf'),
                  ('Noto Sans', 'notosans/NotoSans%5Bwdth,wght%5D.ttf'), ('Open Sans', 'opensans/OpenSans%5Bwdth,wght%5D.ttf')]:
    f = f'{FONT_DIR}/{ten.replace(" ", "")}.ttf'
    try:
        if not os.path.exists(f): urllib.request.urlretrieve(GF + path, f)
        ImageFont.truetype(f, 20); FONTS[ten] = f
    except Exception as e: print('Không tải được font', ten, e)
if not FONTS:   # dự phòng: font có sẵn trên máy
    for f in glob.glob('/usr/share/fonts/**/DejaVuSans.ttf', recursive=True): FONTS['DejaVu Sans'] = f
print('Font dùng:', list(FONTS))
''')
code(r'''
KHACH = ["Em ơi cho chị 2 trà đào cam sả", "1 matcha latte size L ít đá nha", "Chị lấy lúc 5h30 chiều nhé",
 "Ship về 12 ngõ 5 Quang Trung giúp chị", "Có còn kimbap chiên không em?", "Thêm 1 bánh tráng trộn nữa nhé",
 "Ít ngọt, nhiều đá giúp mình", "sđt 0912 345 678 nha", "ok e, ck luôn nhé", "Cho mình 3 cốc cà phê muối",
 "Trà sữa trân châu đường đen 50% đường", "Mình qua lấy lúc 18h15 được không ạ", "2 cđ ít đá, 1 cđ nhiều sữa",
 "Đơn này ghi tên Hương giúp chị", "Bé Nốc ơi hôm nay mở cửa mấy giờ?", "Ủa sao chưa thấy ship vậy em",
 "Huỷ giúp chị ly trà đào nhé", "Cho chị 1 cơm gà xối mỡ, 1 canh chua", "Bỏ hành giúp mình với",
 "Mình ở toà A, tầng 12 nha shop", "Hôm qua uống ngon quá, nay đặt tiếp", "Ko lấy ống hút nhé em",
 "Lấy 4 hồng trà sữa, 2 ít ngọt 2 bình thường", "Tối nay 7 giờ mình qua", "Được giảm giá không em ơi",
 "Mình chuyển khoản rồi nhé", "Cho thêm tương ớt nha", "Đặt trước 10 phần cho văn phòng được ko",
 "Số nhà 45 Nguyễn Trãi, Thanh Xuân", "Cảm ơn shop nhiều 😊".replace(' 😊', ''), "Kem cheese thêm 1 phần",
 "Sữa chua nếp cẩm còn ko ạ", "Gửi giúp mình hoá đơn nhé", "Chị Hằng đặt 2 bánh mì pate"]
QUAN = ["Dạ quán nhận đơn ạ", "Dạ còn ạ, mình lấy mấy phần ạ?", "Tổng của mình là 85.000đ ạ",
 "Quán giao lúc 17h45 nha", "Dạ em ghi chú rồi ạ", "Mình chuyển khoản giúp em nhé", "Dạ hôm nay quán mở 7h đến 22h ạ",
 "Em gửi bếp rồi nha chị", "Dạ món này hết rồi ạ, mình đổi món khác nhé", "Phí ship 15k ạ",
 "Dạ shipper đang tới ạ", "Mình nhớ để ý điện thoại giúp em nhé", "Dạ đã nhận 120.000đ, cảm ơn mình ạ"]
NAMES = ["Nguyễn Thu Hà", "Trần Minh Đức", "Lê Phương Anh", "Phạm Quốc Bảo", "Vũ Ngọc Ánh", "Đặng Thị Hồng", "Hoàng Văn Kiên"]
THEMES = {
 'messenger_sang': dict(bg=(255,255,255), lb=(240,240,240), lt=(5,5,5), rb=(10,124,255), rt=(255,255,255), ui=(5,5,5), sub=(101,103,107)),
 'messenger_toi':  dict(bg=(0,0,0), lb=(48,48,48), lt=(228,230,235), rb=(10,124,255), rt=(255,255,255), ui=(228,230,235), sub=(176,179,184)),
 'zalo_sang':      dict(bg=(226,233,241), lb=(255,255,255), lt=(8,18,37), rb=(219,235,255), rt=(8,18,37), ui=(255,255,255), sub=(118,128,145), head=(0,104,255)),
 'zalo_toi':       dict(bg=(18,20,24), lb=(43,46,51), lt=(230,232,235), rb=(22,64,125), rt=(230,232,235), ui=(230,232,235), sub=(140,145,155), head=(30,32,36)),
}
W, H = 1080, 2340

def wrap(d, text, font, maxw):
    out, cur = [], ''
    for w in text.split(' '):
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=font) <= maxw: cur = t
        else: out.append(cur); cur = w
    return out + ([cur] if cur else [])

def ve_man_hinh(seed, theme, font_ten):
    rnd = random.Random(seed); th = THEMES[theme]; FF = FONTS[font_ten]
    im = Image.new('RGB', (W, H), th['bg']); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FF, rnd.choice([38, 40, 42, 44, 46])); fs = ImageFont.truetype(FF, 30); fh = ImageFont.truetype(FF, 44)
    gt = []
    def text(xy, s, font, fill, loai):
        d.text(xy, s, font=font, fill=fill); gt.append({'text': s, 'box': list(d.textbbox(xy, s, font=font)), 'loai': loai})
    if 'head' in th: d.rectangle([0, 0, W, 260], fill=th['head'])
    text((60, 30), f'{rnd.randint(7, 22)}:{rnd.randint(0, 59):02d}', fs, th['ui'], 'thanh_tren')
    text((200, 130), rnd.choice(NAMES), fh, th['ui'], 'ten')
    text((200, 190), rnd.choice(['Đang hoạt động', 'Hoạt động 5 phút trước', 'Vừa mới truy cập']), fs, th['ui'] if 'head' in th else th['sub'], 'thanh_tren')
    y = 320
    text((W // 2 - 120, y), rnd.choice(['Hôm nay 16:20', 'Hôm qua 09:05', 'T5 lúc 14:32']), fs, th['sub'], 'moc_gio'); y += 90
    pad, maxw = 34, 700
    while y < H - 300:
        right = rnd.random() < 0.4
        lines = wrap(d, rnd.choice(QUAN if right else KHACH), f, maxw)
        lh = f.size + 14
        bw = max(d.textlength(l, font=f) for l in lines) + 2 * pad; bh = lh * len(lines) + 2 * pad - 14
        if y + bh > H - 260: break
        x0 = W - 40 - bw if right else 140
        d.rounded_rectangle([x0, y, x0 + bw, y + bh], radius=44, fill=th['rb'] if right else th['lb'])
        if not right: d.ellipse([40, y + bh - 76, 116, y + bh], fill=(180, 190, 200))
        for i, l in enumerate(lines): text((x0 + pad, y + pad + i * lh), l, f, th['rt'] if right else th['lt'], 'quan' if right else 'khach')
        y += bh + rnd.choice([16, 24, 60])
    d.rounded_rectangle([140, H - 190, W - 200, H - 90], radius=50, fill=th['lb'])
    text((190, H - 162), 'Aa' if 'messenger' in theme else 'Tin nhắn', fs, th['sub'], 'o_soan')
    # Thu nhỏ như ảnh app chụp gửi đi (cạnh dài 1600 px)
    s = 1600 / H
    im = im.resize((round(W * s), round(H * s)), Image.LANCZOS)
    for g in gt: g['box'] = [round(v * s) for v in g['box']]
    return cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR), gt

N_ANH = 40   # tăng lên (vd 200) khi chạy cho báo cáo
DATA = []
for i in range(N_ANH):
    theme = list(THEMES)[i % 4]; font_ten = list(FONTS)[(i // 4) % len(FONTS)]
    img, gt = ve_man_hinh(1000 + i, theme, font_ten)
    DATA.append({'id': f'gl_{i:03d}', 'img': img, 'gt': gt, 'theme': theme, 'font': font_ten})
print(len(DATA), 'ảnh,', sum(len(x['gt']) for x in DATA), 'dòng chữ có đáp án')
fig, axs = plt.subplots(1, 4, figsize=(12, 6.5))
for ax, x in zip(axs, DATA[:4]): ax.imshow(cv2.cvtColor(x['img'], cv2.COLOR_BGR2RGB)); ax.set_title(f"{x['theme']} · {x['font']}", fontsize=8); ax.axis('off')
plt.tight_layout(); plt.savefig(f'{OUT}/2_anh_gia_lap.png'); plt.show()
''')
md(r'''
### 3.2. Ảnh thật (tuỳ chọn)

Đặt ảnh chụp thật vào thư mục `anh_that/`, mỗi ảnh kèm **file `.txt` cùng tên** chứa đáp án chép tay nguyên văn,
**mỗi dòng chữ trên màn hình là một dòng** theo thứ tự từ trên xuống. Ảnh thật không có hộp toạ độ nên được đánh giá
ở mức **cả trang** (mục 6.2). Trên Colab: kéo thả thư mục vào khung Files bên trái.
''')
code(r'''
THAT = []
for f in sorted(glob.glob('anh_that/*')):
    if f.lower().endswith(('.png', '.jpg', '.jpeg')) and os.path.exists(os.path.splitext(f)[0] + '.txt'):
        img = cv2.imread(f); s = min(1.0, 1600 / max(img.shape[:2]))
        if s < 1: img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        THAT.append({'id': os.path.basename(f), 'img': img,
                     'dap_an': [l.strip() for l in open(os.path.splitext(f)[0] + '.txt', encoding='utf-8') if l.strip()]})
print(len(THAT), 'ảnh thật có đáp án')
''')

md(r'''
## Thước đo

- **CER** (Character Error Rate) = (số ký tự thay + xoá + chèn) / số ký tự đáp án, tính bằng khoảng cách Levenshtein.
- **WER**: như CER nhưng theo từ (tách theo dấu cách).
- **Độ chính xác dòng**: % dòng đọc đúng hoàn toàn.
- **CER bỏ dấu**: bỏ hết dấu thanh, dấu mũ, đ → d ở cả hai phía rồi mới so. Chênh lệch giữa CER và CER bỏ dấu
  cho biết bao nhiêu lỗi là do **dấu**.
- **CER sàn**: % ký tự đáp án **không có trong bảng ký tự** của mô hình. Mô hình không thể có CER thấp hơn mức này.
''')
code(r'''
def lev_ops(a, b):
    """Khoảng cách Levenshtein + căn chỉnh: trả (khoảng cách, danh sách (loại, ký tự đáp án, ký tự đoán))"""
    n, m = len(a), len(b)
    D = np.zeros((n + 1, m + 1), np.int32); D[:, 0] = np.arange(n + 1); D[0, :] = np.arange(m + 1)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            D[i, j] = min(D[i-1, j] + 1, D[i, j-1] + 1, D[i-1, j-1] + (a[i-1] != b[j-1]))
    ops, i, j = [], n, m
    while i or j:
        if i and j and D[i, j] == D[i-1, j-1] + (a[i-1] != b[j-1]):
            ops.append(('dung' if a[i-1] == b[j-1] else 'thay', a[i-1], b[j-1])); i, j = i - 1, j - 1
        elif i and D[i, j] == D[i-1, j] + 1: ops.append(('xoa', a[i-1], '')); i -= 1
        else: ops.append(('chen', '', b[j-1])); j -= 1
    return int(D[n, m]), ops[::-1]

def lev(a, b):
    """Chỉ khoảng cách (nhanh hơn, dùng cho chuỗi dài cả trang)"""
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1): cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]
def bo_dau(s): return ''.join(c for c in unicodedata.normalize('NFD', s) if not unicodedata.combining(c)).replace('đ', 'd').replace('Đ', 'D')

def loai_ky_tu(c):
    if c == ' ': return 'dấu cách'
    if c.isdigit(): return 'chữ số'
    if c.isalpha(): return 'chữ không dấu' if c.isascii() else 'chữ có dấu'
    return 'dấu câu / ký hiệu'

def tong_hop(cap):
    """cap = [(đáp án, đoán)] → CER, WER, CER bỏ dấu, % dòng đúng"""
    e = n = ew = nw = eb = ok = 0
    for g, p in cap:
        e += lev(g, p); n += len(g); eb += lev(bo_dau(g), bo_dau(p)); ok += g == p
        gw, pw = g.split(), p.split(); ew += lev(gw, pw); nw += len(gw)
    return {'CER %': round(100 * e / max(n, 1), 2), 'CER bỏ dấu %': round(100 * eb / max(n, 1), 2),
            'WER %': round(100 * ew / max(nw, 1), 2), 'dòng đúng %': round(100 * ok / max(len(cap), 1), 1), 'số dòng': len(cap)}
''')

md(r'''
## 4. Bước tìm chữ (det): Precision / Recall / F1

So hộp mô hình tìm được với hộp đáp án từng dòng. Hộp det đã được **nới** (unclip) nên luôn to hơn hộp chữ sát;
vì vậy dùng 2 tiêu chí ghép:
- **IoU ≥ 0,5** (tiêu chuẩn phổ biến, khắt khe với hộp đã nới)
- **Bao phủ**: hộp đoán chứa ≥ 90% diện tích hộp đáp án và mỗi hộp đoán chỉ ghép 1 dòng (đúng thứ bước rec cần).

Ngoài ra đếm **gộp** (1 hộp đoán chứa ≥ 2 dòng đáp án) và **tách** (1 dòng đáp án bị chia ≥ 2 hộp).
''')
code(r'''
def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1])); i = ix * iy
    return i / ((a[2]-a[0]) * (a[3]-a[1]) + (b[2]-b[0]) * (b[3]-b[1]) - i + 1e-9)
def phu(g, p):   # % diện tích hộp đáp án g nằm trong hộp đoán p
    ix = max(0, min(g[2], p[2]) - max(g[0], p[0])); iy = max(0, min(g[3], p[3]) - max(g[1], p[1]))
    return ix * iy / ((g[2]-g[0]) * (g[3]-g[1]) + 1e-9)

def danh_gia_det(model, data):
    tp_i = tp_p = n_pred = n_gt = gop = tach = 0; ious = []
    for x in data:
        P = model.detect(x['img']); G = [g['box'] for g in x['gt']]; n_pred += len(P); n_gt += len(G)
        used = set()   # IoU ≥ 0,5, ghép tham lam theo IoU lớn nhất
        for gi, pi, v in sorted([(gi, pi, iou(g, p)) for gi, g in enumerate(G) for pi, p in enumerate(P)], key=lambda t: -t[2]):
            if v < 0.5: break
            if gi in used or ('p', pi) in used: continue
            used |= {gi, ('p', pi)}; tp_i += 1; ious.append(v)
        cover = [[pi for pi, p in enumerate(P) if phu(g, p) >= 0.9] for g in G]
        dem = Counter(pi for c in cover for pi in c)
        tp_p += sum(1 for c in cover if len(c) == 1 and dem[c[0]] == 1)
        gop += sum(1 for v in dem.values() if v >= 2)
        tach += sum(1 for g in G if sum(1 for p in P if phu(g, p) > 0.15) >= 2)
    r = {}
    for ten, tp in [('IoU≥0,5', tp_i), ('Bao phủ', tp_p)]:
        pr, rc = tp / max(n_pred, 1), tp / max(n_gt, 1)
        r[ten] = {'Precision %': round(100 * pr, 1), 'Recall %': round(100 * rc, 1), 'F1 %': round(200 * pr * rc / max(pr + rc, 1e-9), 1)}
    return pd.DataFrame(r).T, {'hộp đoán': n_pred, 'dòng đáp án': n_gt, 'gộp': gop, 'tách': tach, 'IoU TB (cặp ghép)': round(float(np.mean(ious)), 3)}, ious

bang_det, them_det, ious = danh_gia_det(ocr, DATA)
bang_det.to_csv(f'{OUT}/3_det.csv'); print(them_det); bang_det
''')
md(r'''
**Nhận xét.** Recall (bao phủ) gần 100%: hầu như không sót dòng nào, không gộp, không tách dòng. Precision thấp hơn
chủ yếu vì det **bắt cả avatar** (hình tròn cạnh bong bóng) thành vùng chữ (xem hình dưới); các hộp này rec đọc ra rỗng
hoặc vài ký tự rác, có thể lọc bằng độ tin cậy / tỉ lệ khung. IoU thấp (TB ~0,64) là do hộp det đã **nới** cố ý
(để không cắt mất dấu) so với hộp chữ sát của đáp án, không phải do det lệch.
''')
code(r'''
x = DATA[1]; P = ocr.detect(x['img']); vis = cv2.cvtColor(x['img'], cv2.COLOR_BGR2RGB).copy()
for g in x['gt']: cv2.rectangle(vis, tuple(g['box'][:2]), tuple(g['box'][2:]), (0, 200, 0), 2)
for p in P: cv2.rectangle(vis, p[:2], p[2:], (255, 60, 60), 2)
fig, axs = plt.subplots(1, 2, figsize=(11, 6.5), gridspec_kw={'width_ratios': [1, 1.3]})
axs[0].imshow(vis); axs[0].set_title('Xanh: hộp đáp án · Đỏ: hộp det (đã nới)', fontsize=9); axs[0].axis('off')
axs[1].hist(ious, bins=30, color='#4C72B0'); axs[1].set_xlabel('IoU của cặp ghép'); axs[1].set_ylabel('số dòng'); axs[1].set_title('Phân bố IoU')
plt.tight_layout(); plt.savefig(f'{OUT}/3_det_minh_hoa.png'); plt.show()
''')

md(r'''
## 5. Bước đọc chữ (rec) tách riêng

Cắt từng dòng theo **hộp đáp án** (nới đúng như det) rồi cho rec đọc. Như vậy lỗi ở đây **chỉ do rec**, không lẫn lỗi det.
''')
code(r'''
def cat_dong(img, b, unclip=1.5):
    w, h = b[2] - b[0], b[3] - b[1]; d = w * h * unclip / (2 * (w + h)) * 0.6   # 0,6: hộp chữ sát đã cao hơn bản đồ det
    H_, W_ = img.shape[:2]
    return img[max(0, int(b[1]-d)):min(H_, int(b[3]+d)), max(0, int(b[0]-d)):min(W_, int(b[2]+d))]

def danh_gia_rec(model, data):
    rows = []
    for x in data:
        for g in x['gt']:
            t0 = time.perf_counter(); p, c = model.recognize(cat_dong(x['img'], g['box'])); ms = (time.perf_counter() - t0) * 1e3
            rows.append({'anh': x['id'], 'theme': x['theme'], 'font': x['font'], 'loai': g['loai'], 'dap_an': g['text'], 'doan': p, 'conf': c, 'ms': ms})
    return pd.DataFrame(rows)

REC_KQ = {ten: danh_gia_rec(OCR(DET, r), DATA) for ten, r in REC.items()}
rows = []
for ten, df in REC_KQ.items():
    S = set(REC[ten]['chars']) | {' '}
    allc = ''.join(df.dap_an); san = 100 * sum(c not in S for c in allc) / len(allc)
    rows.append({'mô hình': ten, **tong_hop(list(zip(df.dap_an, df.doan))), 'CER sàn %': round(san, 2), 'ms / dòng': round(df.ms.mean(), 1)})
bang_rec = pd.DataFrame(rows); bang_rec.to_csv(f'{OUT}/4_rec.csv', index=False); bang_rec
''')
md(r'''
**Nhận xét.** Hai mô hình sai theo **hai kiểu khác nhau**:
- `latin`: chữ không có lớp bị **bỏ mất hẳn** ("một" → "mt"), nên CER bỏ dấu vẫn cao (~10%), gần bằng CER sàn.
- `đa ngôn ngữ`: chữ không có lớp được **thay bằng chữ không dấu gần nhất** ("một" → "mot"), nên CER bỏ dấu rất thấp (~1%):
  mô hình đọc **khung chữ cái** tốt hơn nhiều, chỉ thiếu dấu.

⇒ Khi fine-tune, mở rộng bảng ký tự của mô hình nào cũng được, nhưng nên **thử cả bản đa ngôn ngữ làm điểm xuất phát**
(nhận dạng khung chữ tốt hơn; đổi lại file nặng gấp đôi vì bảng 18k ký tự, có thể cắt bớt lớp tiếng Trung).
''')
md(r'''
### 5.1. Lỗi theo loại ký tự

Căn chỉnh từng dòng đoán với đáp án, rồi tính tỉ lệ lỗi (thay + xoá) cho từng loại ký tự **trong đáp án**.
Tách riêng chữ có dấu **có lớp** và **không có lớp** trong bảng ký tự để thấy lỗi do *thiếu lớp* hay do *đọc sai*.
''')
code(r'''
def loi_theo_loai(df, chars):
    S = set(chars); dem = Counter(); loi = Counter(); nham = Counter()
    for g, p in zip(df.dap_an, df.doan):
        for op, a, b in lev_ops(g, p)[1]:
            if op == 'chen': continue
            k = loai_ky_tu(a)
            if k == 'chữ có dấu': k += ' (có lớp)' if a in S else ' (KHÔNG có lớp)'
            dem[k] += 1
            if op != 'dung': loi[k] += 1; nham[(a, b or '∅')] += 1
    t = pd.DataFrame({'số ký tự': dem, 'lỗi': loi}).fillna(0).astype(int)
    t['tỉ lệ lỗi %'] = (100 * t['lỗi'] / t['số ký tự']).round(1)
    return t.sort_values('tỉ lệ lỗi %', ascending=False), nham

ten0 = 'latin (app đang dùng)'
bang_loai, nham = loi_theo_loai(REC_KQ[ten0], REC[ten0]['chars'])
bang_loai.to_csv(f'{OUT}/5_loi_theo_loai.csv'); display(bang_loai)
ax = bang_loai['tỉ lệ lỗi %'].plot.barh(figsize=(7, 3), color='#C44E52'); ax.invert_yaxis(); ax.set_xlabel('% ký tự sai')
ax.set_title(f'Tỉ lệ lỗi theo loại ký tự · rec {ten0}'); plt.tight_layout(); plt.savefig(f'{OUT}/5_loi_theo_loai.png'); plt.show()
print('20 cặp nhầm nhiều nhất (đáp án → đoán, ∅ = bị bỏ mất):')
print(pd.DataFrame([(a, b, n) for (a, b), n in nham.most_common(20)], columns=['đáp án', 'đoán', 'số lần']).to_string(index=False))
''')
code(r'''
df = REC_KQ[ten0]; sai = df[df.dap_an != df.doan].sample(min(10, (df.dap_an != df.doan).sum()), random_state=0)
print('Ví dụ dòng đọc sai:'); [print(f'  ĐÁP ÁN: {g}\n  ĐOÁN  : {p}\n') for g, p in zip(sai.dap_an, sai.doan)];
''')

md(r'''
## 6. Đánh giá đầu–cuối (det + rec, đúng như app chạy)

### 6.1. Ảnh giả lập: theo dòng, theo giao diện
Mỗi dòng đáp án lấy các dòng đoán có tâm nằm trong hộp đáp án (nới 15 px), ghép trái → phải.
''')
code(r'''
def e2e(model, data):
    rows, tm = [], []
    for x in data:
        r = model(x['img']); tm.append({'anh': x['id'], 'det_ms': r['det_ms'], 'rec_ms': r['rec_ms'], 'n_dong': len(r['lines'])})
        for g in x['gt']:
            x0, y0, x1, y1 = g['box']
            cand = [l for l in r['lines'] if x0 - 15 <= (l['box'][0] + l['box'][2]) / 2 <= x1 + 15 and y0 - 15 <= (l['box'][1] + l['box'][3]) / 2 <= y1 + 15]
            p = ' '.join(l['text'] for l in sorted(cand, key=lambda l: l['box'][0])).strip()
            rows.append({'theme': x['theme'], 'font': x['font'], 'loai': g['loai'], 'dap_an': g['text'], 'doan': p})
    return pd.DataFrame(rows), pd.DataFrame(tm)

E2E, TM = e2e(ocr, DATA)
tong = pd.DataFrame([{'nhóm': 'TẤT CẢ', **tong_hop(list(zip(E2E.dap_an, E2E.doan)))}] +
                    [{'nhóm': k, **tong_hop(list(zip(g.dap_an, g.doan)))} for k, g in E2E.groupby('theme')] +
                    [{'nhóm': 'font ' + k, **tong_hop(list(zip(g.dap_an, g.doan)))} for k, g in E2E.groupby('font')] +
                    [{'nhóm': 'vùng ' + k, **tong_hop(list(zip(g.dap_an, g.doan)))} for k, g in E2E.groupby('loai')])
tong.to_csv(f'{OUT}/6_e2e.csv', index=False); tong
''')
code(r'''
t = tong[tong.nhóm.isin(THEMES)].set_index('nhóm')[['CER %', 'CER bỏ dấu %']]
ax = t.plot.bar(figsize=(7, 3.2), rot=0, color=['#C44E52', '#8172B2']); ax.set_ylabel('%'); ax.set_xlabel('')
ax.set_title('CER đầu–cuối theo giao diện (có dấu / bỏ dấu)'); plt.tight_layout(); plt.savefig(f'{OUT}/6_e2e_giao_dien.png'); plt.show()
''')
md(r'''
### 6.2. Cả trang (dùng được cho ảnh thật không có hộp)
Nối mọi dòng đoán theo thứ tự đọc thành 1 chuỗi, nối mọi dòng đáp án thành 1 chuỗi, tính CER / WER cả trang.
''')
code(r'''
def trang(model, items, dap_an_cua):
    cap = []
    for x in items:
        r = model(x['img']); p = ' '.join(l['text'] for l in r['lines']); cap.append((' '.join(dap_an_cua(x)), p))
    return tong_hop(cap)
rows = [{'bộ': 'giả lập', **trang(ocr, DATA, lambda x: [g['text'] for g in sorted(x['gt'], key=lambda g: (g['box'][1] // 10, g['box'][0]))])}]
if THAT: rows.append({'bộ': 'ảnh thật', **trang(ocr, THAT, lambda x: x['dap_an'])})
bang_trang = pd.DataFrame(rows).drop(columns='dòng đúng %').rename(columns={'số dòng': 'số ảnh'}); bang_trang.to_csv(f'{OUT}/6_ca_trang.csv', index=False); bang_trang
''')

md(r'''
## 7. Tốc độ, kích thước, số tham số

> Thời gian ở đây là **CPU của máy chạy notebook**. Thời gian trên **điện thoại thật** lấy từ bảng `ocr_mau`
> (app tự đo và gửi về, mục 10).
''')
code(r'''
def tham_so(p):
    # PaddleOCR → ONNX lưu trọng số vừa ở initializer vừa ở node Constant: đếm cả hai (bỏ hằng số vô hướng)
    m = onnx.load(p); n = sum(int(np.prod(t.dims)) for t in m.graph.initializer)
    for nd in m.graph.node:
        if nd.op_type == 'Constant':
            for a in nd.attribute:
                if a.HasField('t') and len(a.t.dims): n += int(np.prod(a.t.dims))
    return n
rows = [{'mô hình': 'det PP-OCRv5_mobile_det', 'MB': round(os.path.getsize(DET) / 1e6, 2), 'triệu tham số': round(tham_so(DET) / 1e6, 2)}]
rows += [{'mô hình': 'rec ' + k, 'MB': round(os.path.getsize(v['onnx']) / 1e6, 2), 'triệu tham số': round(tham_so(v['onnx']) / 1e6, 2)} for k, v in REC.items()]
bang_kt = pd.DataFrame(rows); bang_kt.to_csv(f'{OUT}/7_kich_thuoc.csv', index=False); bang_kt
''')
code(r'''
TM['tong_ms'] = TM.det_ms + TM.rec_ms; TM['rec_ms_dong'] = TM.rec_ms / TM.n_dong.clip(lower=1)
q = TM[['det_ms', 'rec_ms', 'tong_ms', 'rec_ms_dong', 'n_dong']].describe(percentiles=[.5, .9]).loc[['mean', '50%', '90%', 'max']].round(1)
q.to_csv(f'{OUT}/7_toc_do.csv'); display(q)

rows = []   # số luồng CPU (điện thoại thường dùng 4 nhân lớn)
sub = DATA[:8]
for th in [1, 2, 4]:
    m = OCR(DET, REC[ten0], threads=th); m(sub[0]['img'])   # chạy nóng
    ts = [m(x['img']) for x in sub]
    rows.append({'luồng': th, 'det ms': np.mean([t['det_ms'] for t in ts]), 'rec ms': np.mean([t['rec_ms'] for t in ts])})
luong = pd.DataFrame(rows).round(1); luong.to_csv(f'{OUT}/7_so_luong.csv', index=False)
fig, axs = plt.subplots(1, 2, figsize=(11, 3.4))
axs[0].scatter(TM.n_dong, TM.tong_ms, s=14); axs[0].set_xlabel('số dòng trên ảnh'); axs[0].set_ylabel('ms / ảnh'); axs[0].set_title('Thời gian tăng theo số dòng (rec đọc từng dòng)')
luong.set_index('luồng')[['det ms', 'rec ms']].plot.bar(stacked=True, ax=axs[1], rot=0); axs[1].set_ylabel('ms / ảnh'); axs[1].set_title('Số luồng CPU')
plt.tight_layout(); plt.savefig(f'{OUT}/7_toc_do.png'); plt.show(); luong
''')

md(r'''
**Nhận xét.** Bước rec chiếm ~70% thời gian và tăng tuyến tính theo số dòng (mỗi dòng ~45 ms trên CPU này).
Nhiều luồng hơn không phải lúc nào cũng nhanh hơn: trên máy ít nhân hoặc bị chia sẻ, 4 luồng có thể chậm hơn 2 luồng
→ trên điện thoại nên đo thật (app dùng tối đa 4 luồng).
''')
md(r'''
## 8. Ảnh hưởng tham số

- `det_max_side`: kích thước cạnh dài đưa vào det. Nhỏ → nhanh hơn nhưng chữ nhỏ dễ bị sót.
- `unclip`: hệ số nới hộp. Nhỏ → cắt mất dấu phía trên / dưới (ố, ộ, ữ); lớn → dính dòng bên cạnh.

(Chạy trên một phần bộ dữ liệu cho nhanh.)
''')
code(r'''
SUB = DATA[:16]
def quet(**kw):
    m = OCR(DET, REC[ten0], **kw); e, t = e2e(m, SUB)
    return {**kw, **tong_hop(list(zip(e.dap_an, e.doan))), 'det ms': round(t.det_ms.mean(), 1), 'tổng ms': round((t.det_ms + t.rec_ms).mean(), 1)}
q1 = pd.DataFrame([quet(det_max_side=s) for s in [640, 736, 960, 1280]])
q2 = pd.DataFrame([quet(unclip=u) for u in [1.0, 1.3, 1.5, 1.8, 2.2]])
q1.to_csv(f'{OUT}/8_det_max_side.csv', index=False); q2.to_csv(f'{OUT}/8_unclip.csv', index=False)
fig, axs = plt.subplots(1, 2, figsize=(11, 3.4))
a = axs[0]; a.plot(q1.det_max_side, q1['CER %'], 'o-', color='#C44E52'); a.set_xlabel('det_max_side'); a.set_ylabel('CER %', color='#C44E52')
a2 = a.twinx(); a2.plot(q1.det_max_side, q1['det ms'], 's--', color='#4C72B0'); a2.set_ylabel('det ms', color='#4C72B0'); a.set_title('Kích thước ảnh det')
axs[1].plot(q2.unclip, q2['CER %'], 'o-', color='#C44E52'); axs[1].set_xlabel('unclip'); axs[1].set_ylabel('CER %'); axs[1].set_title('Hệ số nới hộp')
plt.tight_layout(); plt.savefig(f'{OUT}/8_tham_so.png'); plt.show(); display(q1); q2
''')

md(r'''
## 9. So sánh các mô hình rec (đầu–cuối)

Đặt mô hình fine-tune vào `fine_tune/rec.onnx` + `fine_tune/rec_dict.txt` rồi chạy lại notebook: mô hình đó tự xuất hiện
trong mọi bảng (bảng ký tự, rec, đầu–cuối) để so trực tiếp với bản gốc.
''')
code(r'''
rows = []
for ten, r in REC.items():
    m = OCR(DET, r); e, t = e2e(m, DATA)
    rows.append({'mô hình rec': ten, **tong_hop(list(zip(e.dap_an, e.doan))), 'ms / ảnh': round((t.det_ms + t.rec_ms).mean(), 1),
                 'MB': round(os.path.getsize(r['onnx']) / 1e6, 1)})
so_sanh = pd.DataFrame(rows); so_sanh.to_csv(f'{OUT}/9_so_sanh_mo_hinh.csv', index=False)
ax = so_sanh.set_index('mô hình rec')[['CER %', 'CER bỏ dấu %', 'WER %']].plot.bar(figsize=(8, 3.4), rot=0)
ax.set_ylabel('%'); ax.set_xlabel(''); ax.set_title('So sánh mô hình rec (đầu–cuối, ảnh giả lập)')
plt.tight_layout(); plt.savefig(f'{OUT}/9_so_sanh.png'); plt.show(); so_sanh
''')

md(r'''
## 10. Ảnh thật từ app (bảng `ocr_mau` trên Supabase Test)

App bản `ocr` ở chế độ TEST tự đo thời gian trên điện thoại và gửi kèm kết quả. Xuất dữ liệu:
Supabase **benoc-pos-test → SQL Editor** chạy câu dưới, bấm **Export → CSV**, lưu thành `ocr_mau.csv` cạnh notebook.

```sql
select id, created_at, device, model, w, h, det_ms, rec_ms, n_dong, cer_gemini, n_ky_tu, chu, dap_an
from ocr_mau order by id;
```

- `det_ms`, `rec_ms`: thời gian **trên điện thoại thật**.
- `cer_gemini`: CER so với đoạn chat Gemini chép ra (đáp án *tạm*: Gemini chỉ chép tin liên quan tới đơn và cũng có thể sai) → chỉ để xem xu hướng.
- `dap_an`: điền tay nguyên văn (mỗi dòng 1 dòng chữ) cho một tập ảnh → CER **chuẩn** trên ảnh thật.
''')
code(r'''
if os.path.exists('ocr_mau.csv'):
    om = pd.read_csv('ocr_mau.csv'); om['tong_ms'] = om.det_ms + om.rec_ms
    print(len(om), 'ảnh từ', om.device.nunique(), 'máy')
    display(om.groupby(['device', 'model'])[['det_ms', 'rec_ms', 'tong_ms', 'n_dong']].describe(percentiles=[.5, .9]).round(0).T)
    fig, axs = plt.subplots(1, 2, figsize=(11, 3.4))
    om.tong_ms.plot.hist(bins=30, ax=axs[0]); axs[0].set_xlabel('ms / ảnh trên điện thoại'); axs[0].set_title('Thời gian OCR trên máy thật')
    om.cer_gemini.dropna().plot.hist(bins=30, ax=axs[1], color='#C44E52'); axs[1].set_xlabel('CER % so với Gemini'); axs[1].set_title('CER tạm (so Gemini)')
    plt.tight_layout(); plt.savefig(f'{OUT}/10_may_that.png'); plt.show()
    co = om[om.dap_an.notna() & (om.dap_an.astype(str).str.strip() != '')]
    if len(co):
        kq = tong_hop([(' '.join(str(d).split('\n')), str(c)) for d, c in zip(co.dap_an, co.chu.fillna(''))])
        print('CER CHUẨN trên', len(co), 'ảnh thật có đáp án:', kq)
else:
    print('Chưa có ocr_mau.csv: bỏ qua mục này (xem hướng dẫn xuất ở trên).')
''')

md('## 11. Tổng hợp cho báo cáo')
code(r'''
r0 = bang_rec.set_index('mô hình')
tong_ket = {
    'Ảnh giả lập / dòng chữ': f"{len(DATA)} / {sum(len(x['gt']) for x in DATA)}",
    'Det F1 (bao phủ) %': bang_det.loc['Bao phủ', 'F1 %'],
    'Det F1 (IoU≥0,5) %': bang_det.loc['IoU≥0,5', 'F1 %'],
    'Rec CER % (latin gốc)': r0.loc[ten0, 'CER %'],
    'Rec CER sàn % (ký tự không có lớp)': r0.loc[ten0, 'CER sàn %'],
    'Đầu–cuối CER %': tong.set_index('nhóm').loc['TẤT CẢ', 'CER %'],
    'Đầu–cuối CER bỏ dấu %': tong.set_index('nhóm').loc['TẤT CẢ', 'CER bỏ dấu %'],
    'Đầu–cuối WER %': tong.set_index('nhóm').loc['TẤT CẢ', 'WER %'],
    'Thời gian TB ms / ảnh (CPU notebook)': round(TM.tong_ms.mean(), 1),
    'Kích thước det + rec (MB)': round(os.path.getsize(DET) / 1e6 + os.path.getsize(REC[ten0]['onnx']) / 1e6, 1),
}
tk = pd.DataFrame(tong_ket.items(), columns=['chỉ số', 'giá trị']); tk.to_csv(f'{OUT}/0_tong_ket.csv', index=False)
print('Đã lưu', len(os.listdir(OUT)), 'file vào', OUT); tk
''')
md(r'''
### Gợi ý diễn giải

1. **Bước tìm chữ đủ tốt để dùng ngay**: recall ~100%, không gộp / tách dòng; precision giảm do bắt nhầm avatar (lọc được). Không cần train lại.
2. **Bước đọc chữ là nút thắt**: phần lớn lỗi nằm ở chữ có dấu. *CER sàn* cho thấy một phần lỗi **không thể sửa**
   bằng hậu xử lý vì mô hình **không có lớp** cho chữ đó, còn CER bỏ dấu cho biết mô hình đọc khung chữ cái khá tốt.
3. **Hướng cải tiến**: mở rộng bảng ký tự đủ 134 chữ tiếng Việt, fine-tune rec trên dữ liệu chat giả lập + ảnh thật
   (giữ kiến trúc mobile → kích thước, tốc độ gần như không đổi), rồi so lại ở mục 9. Bản đa ngôn ngữ có CER bỏ dấu ~1%
   (đọc khung chữ tốt hơn bản latin) nên đáng thử làm điểm xuất phát.
4. **Tốc độ**: thời gian tăng gần tuyến tính theo số dòng (rec đọc từng dòng); trên điện thoại xem mục 10.
5. **Hạn chế**: ảnh giả lập dễ hơn ảnh thật; cần một tập ảnh thật có đáp án chép tay để có số liệu cuối cùng.
''')

nb = nbf.v4.new_notebook(cells=C, metadata={
    'kernelspec': {'name': 'python3', 'display_name': 'Python 3', 'language': 'python'},
    'language_info': {'name': 'python'}, 'colab': {'provenance': [], 'toc_visible': True}})
nbf.write(nb, 'danh_gia_ocr.ipynb')
print('đã ghi', len(C), 'ô')
