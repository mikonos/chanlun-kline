// Cloudflare Pages Function：行情代理（与本地 serve.py 的 /api/quote 同一契约）
// 日线/周线/月线 = 腾讯前复权；分钟线 = 新浪（不复权）。
const MINUTE_SCALES = { m5: 5, m15: 15, m30: 30, m60: 60 };
const UA = { 'user-agent': 'Mozilla/5.0' };

export async function onRequestGet({ request }) {
  const u = new URL(request.url);
  const code = (u.searchParams.get('code') || '').toLowerCase();
  const period = u.searchParams.get('period') || 'day';
  const n = Math.min(parseInt(u.searchParams.get('n') || '800', 10) || 800, 2000);
  const end = u.searchParams.get('end') || '';
  if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return new Response(JSON.stringify({ error: 'end 格式应为 YYYY-MM-DD' }), { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  const J = (obj, status = 200) => new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

  if (!/^(sh|sz)\d{6}$/.test(code)) return J({ error: '代码格式应为 sh/sz + 6位数字，如 sh688719' }, 400);
  if (!['day', 'week', 'month'].includes(period) && !MINUTE_SCALES[period]) {
    return J({ error: '周期仅支持 day/week/month/m5/m15/m30/m60' }, 400);
  }

  try {
    let recs;
    if (MINUTE_SCALES[period]) {
      const r = await fetch(`https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData`
        + `?symbol=${code}&scale=${MINUTE_SCALES[period]}&ma=no&datalen=${Math.min(n, 1023)}`, { headers: UA });
      const d = await r.json();
      recs = (d || []).map(x => [x.day.slice(0, 16), x.open, x.high, x.low, x.close, x.volume || '']);
    } else {
      const r = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},${period},,${end},${n},qfq`, { headers: UA });
      const d = await r.json();
      const rows = (d.data && d.data[code] && (d.data[code]['qfq' + period] || d.data[code][period])) || [];
      // 腾讯行: [日期, 开, 收, 高, 低, 量, ...]
      recs = rows.map(x => [x[0], x[1], x[3], x[4], x[2], x[5] ?? '']);
    }
    if (!recs.length) return J({ error: '未取到数据（检查代码是否存在）' }, 404);

    let name = '';
    try {
      const r = await fetch(`https://qt.gtimg.cn/q=${code}`, { headers: UA });
      name = new TextDecoder('gbk').decode(await r.arrayBuffer()).split('~')[1] || '';
    } catch { /* Workers 缺 gbk 解码时放弃名字，不影响数据 */ }

    return J({ code, name, period, rows: recs });
  } catch (e) {
    return J({ error: '行情源请求失败：' + e.message }, 502);
  }
}
