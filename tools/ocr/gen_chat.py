"""Sinh ảnh giả lập màn hình chat Messenger / Zalo (kèm đáp án từng dòng) để đo OCR.

Đây chỉ là bộ đo nhanh; đánh giá thật phải dùng ảnh chụp thật của quán.
python3 gen_chat.py out_dir 20
"""
import sys, os, json, random
from PIL import Image, ImageDraw, ImageFont

FONT = os.environ.get('FONT', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
W, H = 1080, 2340

KHACH = [
    "Em ơi cho chị 2 trà đào cam sả", "1 matcha latte size L ít đá nha",
    "Chị lấy lúc 5h30 chiều nhé", "Ship về 12 ngõ 5 Quang Trung giúp chị",
    "Có còn kimbap chiên không em?", "Thêm 1 bánh tráng trộn nữa nhé",
    "Ít ngọt, nhiều đá giúp mình", "sđt 0912 345 678 nha", "ok e, ck luôn nhé",
    "Cho mình 3 cốc cà phê muối", "Trà sữa trân châu đường đen 50% đường",
    "Mình qua lấy lúc 18h15 được không ạ", "2 cđ ít đá, 1 cđ nhiều sữa",
    "Đơn này ghi tên Hương giúp chị", "Bé Nốc ơi hôm nay mở cửa mấy giờ?",
    "Ủa sao chưa thấy ship vậy em", "Huỷ giúp chị ly trà đào nhé",
]
QUAN = [
    "Dạ quán nhận đơn ạ", "Dạ còn ạ, mình lấy mấy phần ạ?", "Tổng của mình là 85.000đ ạ",
    "Quán giao lúc 17h45 nha", "Dạ em ghi chú rồi ạ 🥰", "Mình chuyển khoản giúp em nhé",
    "Dạ hôm nay quán mở 7h đến 22h ạ", "Em gửi bếp rồi nha chị",
]
THEMES = {
    'messenger_sang': dict(bg=(255, 255, 255), lb=(240, 240, 240), lt=(5, 5, 5), rb=(10, 124, 255), rt=(255, 255, 255), ui=(5, 5, 5), sub=(101, 103, 107)),
    'messenger_toi':  dict(bg=(0, 0, 0), lb=(48, 48, 48), lt=(228, 230, 235), rb=(10, 124, 255), rt=(255, 255, 255), ui=(228, 230, 235), sub=(176, 179, 184)),
    'zalo_sang':      dict(bg=(226, 233, 241), lb=(255, 255, 255), lt=(8, 18, 37), rb=(219, 235, 255), rt=(8, 18, 37), ui=(255, 255, 255), sub=(118, 128, 145), head=(0, 104, 255)),
    'zalo_toi':       dict(bg=(18, 20, 24), lb=(43, 46, 51), lt=(230, 232, 235), rb=(22, 64, 125), rt=(230, 232, 235), ui=(230, 232, 235), sub=(140, 145, 155), head=(30, 32, 36)),
}
NAMES = ["Nguyễn Thu Hà", "Trần Minh Đức", "Lê Phương Anh", "Phạm Quốc Bảo", "Vũ Ngọc Ánh"]


def wrap(d, text, font, maxw):
    out, cur = [], ''
    for w in text.split(' '):
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=font) <= maxw: cur = t
        else: out.append(cur); cur = w
    if cur: out.append(cur)
    return out


def make(seed, theme_name):
    rnd = random.Random(seed); th = THEMES[theme_name]
    im = Image.new('RGB', (W, H), th['bg']); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, rnd.choice([38, 40, 42, 44]))
    fs = ImageFont.truetype(FONT, 30); fh = ImageFont.truetype(FONT, 44)
    gt = []
    def text(xy, s, font, fill):
        d.text(xy, s, font=font, fill=fill)
        gt.append({'text': s, 'box': list(d.textbbox(xy, s, font=font))})
    # thanh trạng thái + đầu cuộc chat
    head = th.get('head')
    if head: d.rectangle([0, 0, W, 260], fill=head)
    text((60, 30), f"{rnd.randint(7, 22)}:{rnd.randint(0, 59):02d}", fs, th['ui'] if head else th['ui'])
    name = rnd.choice(NAMES)
    text((200, 130), name, fh, th['ui'])
    text((200, 190), rnd.choice(["Đang hoạt động", "Hoạt động 5 phút trước", "Vừa mới truy cập"]), fs, th['ui'] if head else th['sub'])
    y = 320
    text((W // 2 - 120, y), rnd.choice(["Hôm nay 16:20", "Hôm qua 09:05", "T5 lúc 14:32"]), fs, th['sub']); y += 90
    pad, maxw = 34, 700
    while y < H - 300:
        right = rnd.random() < 0.4
        msg = rnd.choice(QUAN if right else KHACH)
        lines = wrap(d, msg, f, maxw)
        lh = f.size + 14
        bw = max(d.textlength(l, font=f) for l in lines) + 2 * pad
        bh = lh * len(lines) + 2 * pad - 14
        if y + bh > H - 260: break
        x0 = W - 40 - bw if right else 140
        d.rounded_rectangle([x0, y, x0 + bw, y + bh], radius=44, fill=th['rb'] if right else th['lb'])
        if not right: d.ellipse([40, y + bh - 76, 116, y + bh], fill=(180, 190, 200))
        for i, l in enumerate(lines):
            text((x0 + pad, y + pad + i * lh), l, f, th['rt'] if right else th['lt'])
        y += bh + rnd.choice([16, 24, 60])
    d.rounded_rectangle([140, H - 190, W - 200, H - 90], radius=50, fill=th['lb'])
    text((190, H - 162), "Aa" if 'messenger' in theme_name else "Tin nhắn", fs, th['sub'])
    return im, gt


if __name__ == '__main__':
    out, n = sys.argv[1], int(sys.argv[2])
    os.makedirs(out, exist_ok=True)
    names = list(THEMES)
    for i in range(n):
        th = names[i % len(names)]
        im, gt = make(1000 + i, th)
        fn = f'{i:03d}_{th}'
        im.save(os.path.join(out, fn + '.png'))
        json.dump(gt, open(os.path.join(out, fn + '.json'), 'w'), ensure_ascii=False)
    print('xong', n)
