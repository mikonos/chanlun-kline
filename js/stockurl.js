// 从行情网站 URL 中识别股票代码（浏览器扩展用，也可独立测试）。
// 返回 'sh688719' 形式，识别不出返回 null。只认 A 股 sh/sz。

const PATTERNS = [
  /xueqiu\.com\/S\/(SH|SZ)(\d{6})/i,                          // 雪球 /S/SH688719
  /quote\.eastmoney\.com\/(?:kcb\/|cyb\/)?(sh|sz)?(\d{6})/i,  // 东方财富 /sh688719.html /kcb/688719.html
  /guba\.eastmoney\.com\/list,(?:(sh|sz))?(\d{6})/i,          // 东财股吧 /list,688719
  /finance\.sina\.com\.cn\/realstock\/company\/(sh|sz)(\d{6})/i, // 新浪财经
  /gu\.qq\.com\/(sh|sz)(\d{6})/i,                             // 腾讯自选股
  /stockpage\.10jqka\.com\.cn\/(\d{6})()/i,                   // 同花顺（无前缀）
  /\b(sh|sz)(\d{6})\b/i,                                      // 兜底：URL 任意位置的 sh/sz+6位
];

export function extractStockCode(url) {
  if (!url) return null;
  for (const re of PATTERNS) {
    const m = url.match(re);
    if (!m) continue;
    // 捕获组顺序可能是 (前缀,代码) 或 (代码,空)——同花顺模式代码在第1组
    let prefix = m[1], digits = m[2];
    if (/^\d{6}$/.test(prefix || '')) { digits = prefix; prefix = ''; }
    if (!/^\d{6}$/.test(digits || '')) continue;
    const p = (prefix || '').toLowerCase() || (digits[0] === '6' ? 'sh' : 'sz');
    return p + digits;
  }
  return null;
}
