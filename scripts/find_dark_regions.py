"""Ищет крупные тёмные прямоугольные области (карточки) на скриншоте.

Работает по «маскам»: бинаризует изображение по яркости, находит связные
компоненты и печатает те, что похожи на прямоугольные карточки.
"""
import sys
from collections import deque
from PIL import Image

LUMA = 0.2126 * 0 + 1.0  # placeholder, luma считается ниже


def analyze(path, thr=95, min_area=3000):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()

    mask = bytearray(w * h)
    for y in range(h):
        base = y * w
        for x in range(w):
            r, g, b = px[x, y]
            if 0.2126 * r + 0.7152 * g + 0.0722 * b < thr:
                mask[base + x] = 1

    seen = bytearray(w * h)
    comps = []
    for y in range(h):
        base = y * w
        for x in range(w):
            i = base + x
            if not mask[i] or seen[i]:
                continue
            q = deque([(x, y)])
            seen[i] = 1
            minx = maxx = x
            miny = maxy = y
            area = 0
            rs = gs = bs = 0
            while q:
                cx, cy = q.popleft()
                area += 1
                r, g, b = px[cx, cy]
                rs += r
                gs += g
                bs += b
                if cx < minx: minx = cx
                if cx > maxx: maxx = cx
                if cy < miny: miny = cy
                if cy > maxy: maxy = cy
                for nx, ny in ((cx-1, cy), (cx+1, cy), (cx, cy-1), (cx, cy+1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if mask[j] and not seen[j]:
                            seen[j] = 1
                            q.append((nx, ny))
            if area >= min_area:
                bw = maxx - minx + 1
                bh = maxy - miny + 1
                fill = area / (bw * bh)
                comps.append((area, minx, miny, bw, bh, fill,
                              (rs // area, gs // area, bs // area)))

    print(f'\n=== {path} ({w}x{h}) — тёмных регионов(area>={min_area}): {len(comps)} ===')
    comps.sort(reverse=True)
    for area, x, y, bw, bh, fill, avg in comps[:12]:
        shape = 'ПРЯМОУГ.' if fill > 0.75 else 'не-прямоуг.'
        print(f'  ({x},{y}) {bw}x{bh} площадь={area} заливка={fill:.2f} {shape} цвет={avg}')


for p in sys.argv[1:]:
    analyze(p)
