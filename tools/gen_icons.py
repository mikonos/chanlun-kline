#!/usr/bin/env python3
"""生成扩展图标 icons/icon{16,48,128}.png：深底 + 红绿K线 + 黄色笔折线。零依赖（stdlib PNG）。"""
import os
import struct
import zlib

BG = (20, 22, 28, 255)
RED = (224, 82, 79, 255)
GREEN = (63, 168, 124, 255)
YELLOW = (232, 199, 106, 255)

S = 128
px = [[BG for _ in range(S)] for _ in range(S)]


def rect(x0, y0, x1, y1, c):
    for y in range(max(0, y0), min(S, y1)):
        for x in range(max(0, x0), min(S, x1)):
            px[y][x] = c


def line(x0, y0, x1, y1, c, w=5):
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(steps + 1):
        x = x0 + (x1 - x0) * i // steps
        y = y0 + (y1 - y0) * i // steps
        rect(x - w // 2, y - w // 2, x + w // 2 + 1, y + w // 2 + 1, c)


# 三根K线（影线+实体）：红、绿、红
for cx, top, bot, bt, bb, c in [
    (30, 22, 96, 34, 72, RED),
    (64, 40, 118, 52, 100, GREEN),
    (98, 10, 84, 22, 60, RED),
]:
    rect(cx - 2, top, cx + 3, bot, c)          # 影线
    rect(cx - 11, bt, cx + 12, bb, c)          # 实体

# 黄色笔折线穿过三根K线的分型位
line(12, 88, 30, 30, YELLOW)
line(30, 30, 64, 104, YELLOW)
line(64, 104, 98, 18, YELLOW)
line(98, 18, 120, 44, YELLOW)


def write_png(path, size):
    rows = []
    for y in range(size):
        row = b'\x00'
        sy = y * S // size
        for x in range(size):
            row += bytes(px[sy][x * S // size])
        rows.append(row)
    raw = b''.join(rows)

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print(path, size, 'x', size)


os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons'), exist_ok=True)
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
for s in (16, 48, 128):
    write_png(os.path.join(base, f'icon{s}.png'), s)
