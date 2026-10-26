#!/usr/bin/env python3
"""Biến file xuất từ Quản lý thành dữ liệu huấn luyện dạng văn bản → JSON.

Dùng:  python3 prepare.py benoc-huan-luyen-2026-10-26.jsonl --out data/

Ra:    data/train.jsonl  data/val.jsonl  data/stats.json
Mỗi dòng: {"id", "quality": "gold|silver", "input": "...", "output": "{...}"}
  gold   = đơn chủ quán đã duyệt (đáp án đúng, dùng để chấm điểm và tinh chỉnh)
  silver = đơn AI đọc (có thể sai nhẹ, dùng để học thêm; không dùng để chấm điểm)
Chia train / val theo KHÁCH, không để mẫu cùng 1 khách nằm ở cả hai tập.
"""
import argparse, hashlib, json, os
from collections import Counter

from common import defaults_of, load, normalize

NON_ORDER = ('human', 'question', 'other')


def make_input(t, defaults):
    st = t.get('state_before') or {}
    before = normalize(st, t['now_vn'][:10], defaults)
    for k in ('unknown', 'note'):
        before.pop(k, None)
    lines = ['bây giờ: ' + t['now_vn'], 'đơn đang ghi: ' + json.dumps(before, ensure_ascii=False, separators=(',', ':')), 'hội thoại:']
    who = {'khach': 'khách', 'bot': 'bot', 'quan': 'chủ quán'}
    for m in t.get('convo') or []:
        lines.append('%s [%s]: %s' % (who.get(m.get('s'), m.get('s')), m.get('h', ''), m.get('t', '')))
    return '\n'.join(lines)


def make_output(intent, order):
    o = {'intent': intent}
    if intent == 'order' and order is not None:
        o.update(order)
    return json.dumps(o, ensure_ascii=False, separators=(',', ':'))


def examples(turns, menus):
    for t in turns:
        if t.get('outcome') == 'huy':
            continue                       # đơn bị chủ quán huỷ: bot nhiều khả năng đọc sai
        defaults = defaults_of(menus.get(t.get('menu_hash')))
        intent = t.get('intent') or 'order'
        today = t['now_vn'][:10]
        gold = t.get('final') is not None and t.get('outcome') == 'da_duyet'
        if gold:
            yield t, 'gold', make_output('order', normalize(t['final'], today, defaults)), defaults
        elif intent in NON_ORDER:
            yield t, 'silver', make_output(intent, None), defaults
        elif t.get('target') is not None:
            yield t, 'silver', make_output('order', normalize(t['target'], today, defaults)), defaults


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('export'); ap.add_argument('--out', default='data'); ap.add_argument('--val-percent', type=int, default=15)
    ap.add_argument('--gold-only', action='store_true', help='chỉ lấy mẫu có đáp án chủ quán duyệt')
    a = ap.parse_args()
    menus, turns = load(a.export)
    os.makedirs(a.out, exist_ok=True)
    stats, files = Counter(), {k: open(os.path.join(a.out, k + '.jsonl'), 'w', encoding='utf-8') for k in ('train', 'val')}
    for t, quality, out, defaults in examples(turns, menus):
        if a.gold_only and quality != 'gold':
            continue
        split = 'val' if int(hashlib.sha1(t['thread_hash'].encode()).hexdigest()[:8], 16) % 100 < a.val_percent else 'train'
        files[split].write(json.dumps({'id': t['id'], 'quality': quality, 'input': make_input(t, defaults), 'output': out}, ensure_ascii=False) + '\n')
        stats[split + '_' + quality] += 1
    for f in files.values():
        f.close()
    stats['tong_luot_goc'] = len(turns)
    stats['gold_sua_lai'] = sum(1 for t in turns if t.get('final') is not None and t.get('edits'))
    json.dump(dict(stats), open(os.path.join(a.out, 'stats.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(dict(stats), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
