#!/usr/bin/env python3
"""开发用静态服务：no-cache 头（避免浏览器缓存旧 ES 模块）+ 历史分析落盘接口。

历史快照存放在项目内 history/ 文件夹，一个快照一个 JSON 文件：
  GET    /api/history          列出全部快照的元数据（不含K线数据）
  GET    /api/history/<file>   读取单个快照（含K线数据）
  POST   /api/history          保存快照（body 为快照 JSON）
  DELETE /api/history/<file>   删除快照文件
"""
import http.server
import json
import os
import re
import sys
import urllib.request
from urllib.parse import unquote, urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
HIST_DIR = os.path.join(ROOT, 'history')

MINUTE_SCALES = {'m5': 5, 'm15': 15, 'm30': 30, 'm60': 60}


def http_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


def fetch_quote(code, period, n, end=''):
    """拉取行情：day/week/month=腾讯前复权（end=YYYY-MM-DD 可往前翻页）；m5/m15/m30/m60=新浪分钟线（不复权）。
    返回 {code, name, period, rows: [[date, o, h, l, c, v], ...]}"""
    if period in ('day', 'week', 'month'):
        d = http_json(f'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={code},{period},,{end},{n},qfq')
        rows = d['data'][code].get('qfq' + period) or d['data'][code].get(period) or []
        # 腾讯行: [日期, 开, 收, 高, 低, 量, ...]
        recs = [[r[0], r[1], r[3], r[4], r[2], r[5] if len(r) > 5 else ''] for r in rows]
    else:
        scale = MINUTE_SCALES[period]
        d = http_json(f'https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData'
                      f'?symbol={code}&scale={scale}&ma=no&datalen={min(n, 1023)}')
        recs = [[r['day'][:16], r['open'], r['high'], r['low'], r['close'], r.get('volume', '')] for r in (d or [])]
    name = ''
    try:
        req = urllib.request.Request(f'https://qt.gtimg.cn/q={code}', headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=6) as r:
            name = r.read().decode('gbk').split('~')[1]
    except Exception:
        pass
    return {'code': code, 'name': name, 'period': period, 'rows': recs}


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _hist_path(self):
        name = os.path.basename(unquote(self.path)[len('/api/history/'):])
        if not re.fullmatch(r'[\w().\- ]+\.json', name):
            return None
        return os.path.join(HIST_DIR, name)

    def do_GET(self):
        if self.path.startswith('/api/quote'):
            q = parse_qs(urlparse(self.path).query)
            code = (q.get('code') or [''])[0].lower()
            period = (q.get('period') or ['day'])[0]
            n = min(int((q.get('n') or ['800'])[0]), 2000)
            end = (q.get('end') or [''])[0]
            if not re.fullmatch(r'(sh|sz)\d{6}', code):
                self._json({'error': '代码格式应为 sh/sz + 6位数字，如 sh688719'}, 400)
                return
            if period not in ('day', 'week', 'month') and period not in MINUTE_SCALES:
                self._json({'error': f'周期仅支持 day/week/month/{"/".join(MINUTE_SCALES)}'}, 400)
                return
            if end and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', end):
                self._json({'error': 'end 格式应为 YYYY-MM-DD'}, 400)
                return
            try:
                d = fetch_quote(code, period, n, end)
                if not d['rows']:
                    self._json({'error': '未取到数据（检查代码是否存在）'}, 404)
                else:
                    self._json(d)
            except Exception as e:
                self._json({'error': f'行情源请求失败：{e}'}, 502)
        elif self.path == '/api/history':
            os.makedirs(HIST_DIR, exist_ok=True)
            items = []
            for fn in sorted(os.listdir(HIST_DIR), reverse=True):
                if not fn.endswith('.json'):
                    continue
                try:
                    with open(os.path.join(HIST_DIR, fn), encoding='utf-8') as f:
                        d = json.load(f)
                    items.append({'file': fn, 'ts': d.get('ts'), 'title': d.get('title'),
                                  'note': d.get('note'), 'summary': d.get('summary'),
                                  'biMode': d.get('biMode')})
                except Exception:
                    items.append({'file': fn, 'title': fn, 'summary': '（文件损坏，无法解析）'})
            self._json(items)
        elif self.path.startswith('/api/history/'):
            p = self._hist_path()
            if p and os.path.isfile(p):
                with open(p, encoding='utf-8') as f:
                    self._json(json.load(f))
            else:
                self._json({'error': 'not found'}, 404)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path != '/api/history':
            self._json({'error': 'unknown endpoint'}, 404)
            return
        try:
            n = int(self.headers.get('Content-Length', 0))
            d = json.loads(self.rfile.read(n))
            if not (isinstance(d.get('bars'), list) and d.get('title')):
                raise ValueError('缺少 bars/title 字段')
            os.makedirs(HIST_DIR, exist_ok=True)
            stamp = re.sub(r'\D', '', str(d.get('ts', '')))[:12] or 'snap'
            safe = re.sub(r'[^\w.\-]+', '_', str(d['title']))[:60].strip('_')
            fn, i = f'{stamp}_{safe}.json', 1
            while os.path.exists(os.path.join(HIST_DIR, fn)):
                fn = f'{stamp}_{safe}_{i}.json'
                i += 1
            with open(os.path.join(HIST_DIR, fn), 'w', encoding='utf-8') as f:
                json.dump(d, f, ensure_ascii=False)
            self._json({'ok': True, 'file': fn})
        except Exception as e:
            self._json({'error': str(e)}, 400)

    def do_DELETE(self):
        p = self._hist_path() if self.path.startswith('/api/history/') else None
        if p and os.path.isfile(p):
            os.remove(p)
            self._json({'ok': True})
        else:
            self._json({'error': 'not found'}, 404)


if __name__ == '__main__':
    os.chdir(ROOT)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8722
    http.server.test(HandlerClass=Handler, port=port)
