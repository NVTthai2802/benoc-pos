"""Dùng chung cho prepare.py và score.py: đọc file xuất từ Quản lý, chuẩn hoá đơn, so sánh đơn."""
import json
from collections import Counter


def load(path):
    """File .jsonl tải ở Quản lý → Facebook → Cài đặt bot → Tải dữ liệu huấn luyện."""
    menus, turns = {}, []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            o = json.loads(line)
            if o.get('type') == 'menu':
                menus[o['hash']] = o['menu']
            else:
                turns.append(o)
    return menus, turns


def defaults_of(menu_raw):
    """{tên món: {tên các lựa chọn mặc định}}. Lựa chọn mặc định khách không cần nói ra."""
    out = {}
    for cat in menu_raw or []:
        for it in cat.get('items', []):
            out[it['name']] = {c['name'] for g in it.get('option_groups', []) for c in g.get('choices', []) if c.get('default')}
    return out


def clean_items(items, defaults):
    res = []
    for i in items or []:
        dft = defaults.get(i.get('name'), set())
        res.append({'name': i.get('name'), 'qty': int(i.get('qty') or 1),
                    'choices': [c for c in (i.get('choices') or []) if c not in dft],
                    'note': i.get('note') or None})
    return res


def normalize(obj, now_date, defaults):
    """Đơn (target hoặc final) → dạng so sánh / làm đáp án: chỉ ý khách nói ra."""
    if obj is None:
        return None
    date = obj.get('date')
    return {
        'items': clean_items(obj.get('items'), defaults),
        'dine_type': obj.get('dine_type'),
        'date': None if date == now_date else date,   # cùng ngày hôm nay thì bỏ, giống cách AI được dặn
        'time': obj.get('time'),
        'address': obj.get('address'),
        'phone': obj.get('phone'),
        'note': obj.get('note'),
        'unknown': obj.get('unknown') or [],
    }


def norm_items(items):
    return Counter((i['name'], int(i.get('qty', 1)), tuple(sorted(i.get('choices') or []))) for i in items or [])


def compare(pred, gold):
    """So 1 đơn máy đọc với đơn đúng. Trả về các chỉ số 0/1 và số dòng món khớp."""
    p, g = norm_items(pred.get('items')), norm_items(gold.get('items'))
    tp = sum((p & g).values())
    items_ok = p == g
    dine_ok = pred.get('dine_type') == gold.get('dine_type')
    time_ok = (pred.get('date'), pred.get('time')) == (gold.get('date'), gold.get('time'))
    return {'tp': tp, 'pred_n': sum(p.values()), 'gold_n': sum(g.values()),
            'items_ok': items_ok, 'dine_ok': dine_ok, 'time_ok': time_ok, 'all_ok': items_ok and dine_ok and time_ok}


def summarize(results):
    n = len(results)
    if not n:
        return {'so_don': 0}
    tp, pn, gn = (sum(r[k] for r in results) for k in ('tp', 'pred_n', 'gold_n'))
    prec, rec = tp / pn if pn else 0.0, tp / gn if gn else 0.0
    return {
        'so_don': n,
        'dong_mon_precision': round(prec, 3), 'dong_mon_recall': round(rec, 3),
        'dong_mon_f1': round(2 * prec * rec / (prec + rec), 3) if prec + rec else 0.0,
        'dung_het_mon': round(sum(r['items_ok'] for r in results) / n, 3),
        'dung_hinh_thuc': round(sum(r['dine_ok'] for r in results) / n, 3),
        'dung_gio': round(sum(r['time_ok'] for r in results) / n, 3),
        'dung_ca_don': round(sum(r['all_ok'] for r in results) / n, 3),
    }
