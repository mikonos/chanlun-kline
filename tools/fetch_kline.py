#!/usr/bin/env python3
"""拉取A股K线，转为本应用可导入的 CSV。

用法:
  python3 tools/fetch_kline.py sh000001 800                 # 日线（腾讯，前复权）
  python3 tools/fetch_kline.py sh688719 800 m30             # 30分钟线（新浪，不复权）
  python3 tools/fetch_kline.py sz300750 500 m5 宁德5分钟.csv  # 5分钟线，指定输出名
周期: day(默认) / m5 / m15 / m30 / m60
代码前缀: sh / sz（日线另支持 hk00700 港股、usAAPL.OQ 美股）
注意: 分钟线为不复权价，跨除权日的分钟图请谨慎与前复权日线对照。
"""
import json
import sys
import urllib.request

PERIODS = {'m5': 5, 'm15': 15, 'm30': 30, 'm60': 60}

args = sys.argv[1:]
code = args[0] if args else 'sh000001'
n = 800
period = 'day'
out = None
for a in args[1:]:
    if a.isdigit():
        n = int(a)
    elif a in PERIODS or a == 'day':
        period = a
    else:
        out = a
if out is None:
    out = f'{code}.csv' if period == 'day' else f'{code}_{period}.csv'


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


if period == 'day':
    d = get(f'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={code},day,,,{n},qfq')
    node = d['data'][code]
    rows = node.get('qfqday') or node.get('day')
    if not rows:
        sys.exit(f'未取到数据: {d.get("msg", d)}')
    # 腾讯行格式: [日期, 开盘, 收盘, 最高, 最低, 成交量, ...]
    recs = [(r[0], r[1], r[3], r[4], r[2], r[5] if len(r) > 5 else '') for r in rows]
else:
    scale = PERIODS[period]
    d = get(f'https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData'
            f'?symbol={code}&scale={scale}&ma=no&datalen={min(n, 1023)}')
    if not d:
        sys.exit('未取到数据（新浪接口返回空，检查代码或稍后重试）')
    recs = [(r['day'][:16], r['open'], r['high'], r['low'], r['close'], r.get('volume', '')) for r in d]

with open(out, 'w', encoding='utf-8') as f:
    f.write('date,open,high,low,close,volume\n')
    for rec in recs:
        f.write(','.join(str(x) for x in rec) + '\n')

print(f'{out}: {len(recs)} 根K线 ({recs[0][0]} ~ {recs[-1][0]})')
