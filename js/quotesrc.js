// 无代理行情兜底（纯静态部署用）：<script> 标签不受同源限制（JSONP）。
// 腾讯 fqkline 支持 _callback=fn（函数调用形态）；新浪 jsonp_v2 是「fn=(data)」全局赋值形态；
// 股票名用 qt.gtimg.cn 的 JS 变量接口（GBK，用 script charset 解码）。
// 与 serve.py / functions 的 /api/quote 同一返回契约：{code, name, period, rows}。

const MINUTE_SCALES = { m5: 5, m15: 15, m30: 30, m60: 60 };
let seq = 0;

function loadScript(src, readReady, { charset, timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const done = fn => { clearTimeout(timer); s.remove(); fn(); };
    const timer = setTimeout(() => done(() => reject(new Error('行情源超时'))), timeout);
    s.onerror = () => done(() => reject(new Error('行情源加载失败（网络或被拦截）')));
    s.onload = () => done(() => {
      try { resolve(readReady()); } catch (e) { reject(e); }
    });
    if (charset) s.charset = charset;
    s.src = src;
    document.head.appendChild(s);
  });
}

function takeGlobal(key) {
  const v = window[key];
  delete window[key];
  if (v === undefined) throw new Error('行情源返回为空');
  return v;
}

async function tencentKline(code, period, n, end = '') {
  const cb = `__cl_t${++seq}`;
  window[cb] = data => { window[cb + '_d'] = data; };
  try {
    const d = await loadScript(
      `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?_callback=${cb}&param=${code},${period},,${end},${n},qfq`,
      () => takeGlobal(cb + '_d'),
    );
    const node = d && d.data && d.data[code];
    const rows = (node && (node['qfq' + period] || node[period])) || [];
    // 腾讯行: [日期, 开, 收, 高, 低, 量, ...]
    return rows.map(r => [r[0], r[1], r[3], r[4], r[2], r[5] ?? '']);
  } finally { delete window[cb]; delete window[cb + '_d']; }
}

async function sinaKline(code, scale, n) {
  const cb = `__cl_s${++seq}`;
  try {
    const d = await loadScript(
      `https://quotes.sina.cn/cn/api/jsonp_v2.php/${cb}=/CN_MarketDataService.getKLineData`
      + `?symbol=${code}&scale=${scale}&ma=no&datalen=${Math.min(n, 1023)}`,
      () => takeGlobal(cb),
    );
    return (d || []).map(x => [x.day.slice(0, 16), x.open, x.high, x.low, x.close, x.volume || '']);
  } finally { delete window[cb]; }
}

async function tencentName(code) {
  try {
    const raw = await loadScript(
      `https://qt.gtimg.cn/q=${code}`,
      () => takeGlobal('v_' + code),
      { charset: 'GBK', timeout: 6000 },
    );
    return String(raw).split('~')[1] || '';
  } catch { return ''; }
}

export async function fetchQuoteJsonp(code, period, n, end = '') {
  const rows = MINUTE_SCALES[period]
    ? await sinaKline(code, MINUTE_SCALES[period], n)
    : await tencentKline(code, period, n, end);
  if (!rows.length) throw new Error('未取到数据（检查代码是否存在）');
  return { code, name: await tencentName(code), period, rows };
}

// fetch 直连版：浏览器扩展（manifest host_permissions 豁免 CORS）或任何无同源限制的环境。
// 普通网页里调用会因 CORS 抛错，调用方按能力探测顺序自然回落到 JSONP。
export async function fetchQuoteDirect(code, period, n, end = '') {
  let rows;
  if (MINUTE_SCALES[period]) {
    const r = await fetch(`https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData`
      + `?symbol=${code}&scale=${MINUTE_SCALES[period]}&ma=no&datalen=${Math.min(n, 1023)}`);
    const d = await r.json();
    rows = (d || []).map(x => [x.day.slice(0, 16), x.open, x.high, x.low, x.close, x.volume || '']);
  } else {
    const r = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},${period},,${end},${n},qfq`);
    const d = await r.json();
    const node = d.data && d.data[code];
    rows = ((node && (node['qfq' + period] || node[period])) || []).map(x => [x[0], x[1], x[3], x[4], x[2], x[5] ?? '']);
  }
  if (!rows.length) throw new Error('未取到数据（检查代码是否存在）');
  let name = '';
  try {
    const r = await fetch(`https://qt.gtimg.cn/q=${code}`);
    name = new TextDecoder('gbk').decode(await r.arrayBuffer()).split('~')[1] || '';
  } catch { /* 名字取不到不影响数据 */ }
  return { code, name, period, rows };
}
