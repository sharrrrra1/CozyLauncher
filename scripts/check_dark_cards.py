"""Ищет тёмные «карточки» на скриншоте светлой темы.

Идея: карточки в UI — это прямоугольные области. Ищем в правой части окна
(контент) горизонтальные полосы, которые заметно темнее окружения, и печатаем
их координаты и цвет.
"""
import sys
from PIL import Image


def analyze(path, dark_luma=120):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()

    # Работаем в области контента (правее сайдбара ~260px), исключая низ (консоль-бар)
    x0 = int(w * 0.22)
    y0 = int(h * 0.06)
    y1 = int(h * 0.92)

    row_dark = []
    for y in range(y0, y1, 2):
        cnt = 0
        for x in range(x0, w, 3):
            r, g, b = px[x, y]
            luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
            if luma < dark_luma:
                cnt += 1
        row_dark.append((y, cnt))

    if not row_dark:
        print(f'{path}: нет данных')
        return

    total = max(c for _, c in row_dark)
    width_samples = (w - x0) // 3
    print(f'\n=== {path} ({w}x{h}) ===')
    print(f'макс. тёмных пикселей в строке: {total} из {width_samples}')

    # Ищем непрерывные полосы, где тёмных пикселей заметно много
    thr = max(6, int(width_samples * 0.12))
    bands = []
    cur = None
    for y, c in row_dark:
        if c >= thr:
            if cur is None:
                cur = [y, y, c]
            else:
                cur[1] = y
                cur[2] = max(cur[2], c)
        else:
            if cur is not None:
                bands.append(cur)
                cur = None
    if cur is not None:
        bands.append(cur)

    for (ya, yb, peak) in bands:
        if yb - ya < 6:
            continue
        # Средний цвет полосы
        rs = gs = bs = n = 0
        for y in range(ya, yb + 1, 2):
            for x in range(x0, w, 4):
                r, g, b = px[x, y]
                rs += r
                gs += g
                bs += b
                n += 1
        if n:
            avg = (rs // n, gs // n, bs // n)
            luma = 0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2]
            print(f'  полоса y={ya}-{yb} (высота {yb-ya}) средний цвет={avg} luma={luma:.0f} тёмных={peak}')


for p in sys.argv[1:]:
    analyze(p)
