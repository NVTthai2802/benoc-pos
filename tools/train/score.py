#!/usr/bin/env python3
"""Chấm điểm việc đọc đơn.

1) Đo AI API (Gemini / Claude) đang đọc đúng bao nhiêu % trên đơn chủ quán đã duyệt:
     python3 score.py baseline benoc-huan-luyen-2026-10-26.jsonl
2) Chấm mô hình tự build trên tập val (gold) mà prepare.py đã tách:
     python3 score.py model data/val.jsonl preds.jsonl
   preds.jsonl: mỗi dòng {"id": <id mẫu>, "output": "<chuỗi JSON mô hình sinh ra>"}
Chỉ chấm các mẫu gold. Chỉ số: dòng món (precision / recall / f1), đúng hết món, đúng hình thức nhận, đúng giờ, đúng cả đơn.
"""
import json, sys

from common import compare, defaults_of, load, normalize, summarize


def baseline(path):
    menus, turns = load(path)
    res = []
    for t in turns:
        if t.get('final') is None or t.get('outcome') != 'da_duyet' or t.get('target') is None:
            continue
        d, today = defaults_of(menus.get(t.get('menu_hash'))), t['now_vn'][:10]
        res.append(compare(normalize(t['target'], today, d), normalize(t['final'], today, d)))
    return res


def model(val_path, pred_path):
    gold = {}
    for line in open(val_path, encoding='utf-8'):
        o = json.loads(line)
        if o.get('quality') == 'gold':
            gold[o['id']] = json.loads(o['output'])
    res = []
    for line in open(pred_path, encoding='utf-8'):
        p = json.loads(line)
        if p['id'] not in gold:
            continue
        try:
            out = json.loads(p['output'])
        except Exception:
            out = {}                      # sinh ra JSON hỏng = sai hết
        res.append(compare(out if isinstance(out, dict) else {}, gold[p['id']]))
    return res


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'baseline':
        r = baseline(sys.argv[2])
    elif len(sys.argv) == 4 and sys.argv[1] == 'model':
        r = model(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
    print(json.dumps(summarize(r), ensure_ascii=False, indent=1))
