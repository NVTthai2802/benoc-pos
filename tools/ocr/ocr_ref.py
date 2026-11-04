"""Pipeline OCR tham chiếu (Python) — giống hệt cách app Android chạy, để đo và đối chiếu.

det: PP-OCRv5_mobile_det (DB) → vùng chữ (hộp thẳng, ảnh chụp màn hình không bị nghiêng)
rec: *_PP-OCRv5_mobile_rec (SVTR + CTC) → chữ từng dòng

Dùng: python3 ocr_ref.py anh.png [det.onnx rec.onnx dict.txt]
"""
import sys, time, json, unicodedata
import numpy as np, cv2, onnxruntime as ort

DET_MAX_SIDE = 960       # cạnh dài tối đa đưa vào det (bội số 32)
DET_THRESH, BOX_THRESH, UNCLIP = 0.3, 0.6, 1.5
REC_H, REC_MAX_W = 48, 1600


def load_dict(path):
    with open(path, encoding='utf-8') as f:
        return [l.rstrip('\n') for l in f]


class Ocr:
    def __init__(self, det, rec, dict_path, threads=4):
        o = ort.SessionOptions(); o.intra_op_num_threads = threads; o.log_severity_level = 3
        self.det = ort.InferenceSession(det, o, providers=['CPUExecutionProvider'])
        self.rec = ort.InferenceSession(rec, o, providers=['CPUExecutionProvider'])
        self.chars = load_dict(dict_path)   # lớp 0 = blank, 1..n = dict, n+1 = dấu cách

    # ---------- phát hiện vùng chữ
    def detect(self, bgr):
        h, w = bgr.shape[:2]
        s = min(1.0, DET_MAX_SIDE / max(h, w))
        nh, nw = max(32, int(round(h * s / 32)) * 32), max(32, int(round(w * s / 32)) * 32)
        x = cv2.resize(bgr, (nw, nh)).astype(np.float32) / 255.0
        x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
        prob = self.det.run(None, {'x': x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0, 0]
        mask = (prob > DET_THRESH).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(mask, connectivity=4)
        sx, sy = w / nw, h / nh
        boxes = []
        for i in range(1, n):
            x0, y0, bw, bh, area = st[i]
            if min(bw, bh) < 3: continue
            score = float(prob[lab == i].mean())
            if score < BOX_THRESH: continue
            d = bw * bh * UNCLIP / (2 * (bw + bh))           # nới hộp như DB (unclip) cho hình chữ nhật
            X0, Y0 = max(0, (x0 - d) * sx), max(0, (y0 - d) * sy)
            X1, Y1 = min(w, (x0 + bw + d) * sx), min(h, (y0 + bh + d) * sy)
            if Y1 - Y0 < 6 or X1 - X0 < 6: continue
            boxes.append((int(X0), int(Y0), int(X1), int(Y1), score))
        boxes.sort(key=lambda b: (b[1] // 10, b[0]))
        return boxes

    # ---------- đọc chữ một dòng
    def recognize(self, bgr):
        h, w = bgr.shape[:2]
        nw = min(REC_MAX_W, max(16, int(np.ceil(REC_H * w / h))))
        x = cv2.resize(bgr, (nw, REC_H)).astype(np.float32) / 255.0
        x = (x - 0.5) / 0.5
        out = self.rec.run(None, {'x': x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
        idx, p = out.argmax(1), out.max(1)
        txt, conf, prev = [], [], -1
        for k, c in enumerate(idx):
            if c != prev and c != 0:
                txt.append(self.chars[c - 1] if c - 1 < len(self.chars) else ' ')
                conf.append(p[k])
            prev = c
        return unicodedata.normalize('NFC', ''.join(txt)), float(np.mean(conf)) if conf else 0.0

    def run(self, bgr):
        t0 = time.perf_counter(); boxes = self.detect(bgr); t1 = time.perf_counter()
        lines = []
        for x0, y0, x1, y1, s in boxes:
            t, c = self.recognize(bgr[y0:y1, x0:x1])
            if t.strip(): lines.append({'box': [x0, y0, x1, y1], 'text': t, 'conf': round(c, 3)})
        t2 = time.perf_counter()
        return {'lines': lines, 'det_ms': round((t1 - t0) * 1000), 'rec_ms': round((t2 - t1) * 1000)}


if __name__ == '__main__':
    a = sys.argv[1:]
    det = a[1] if len(a) > 1 else 'PP-OCRv5_mobile_det_onnx/inference.onnx'
    rec = a[2] if len(a) > 2 else 'latin_PP-OCRv5_mobile_rec_onnx/inference.onnx'
    dic = a[3] if len(a) > 3 else 'latin_dict.txt'
    r = Ocr(det, rec, dic).run(cv2.imread(a[0]))
    print(json.dumps(r, ensure_ascii=False, indent=1))
