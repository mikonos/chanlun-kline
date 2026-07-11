// 数据源：可复现的合成K线生成器 + CSV 解析

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// style: 'mixed' 趋势与盘整交替 | 'trend' 强趋势 | 'range' 宽幅震荡
// 三层时间尺度合成：快摆动≈笔尺度(8-12根)、中摆动≈线段尺度(24-40根)、
// 慢漂移≈趋势/中枢尺度(带方向持续性，长趋势可跨越多个盘整形成两个以上同向中枢)。
export function genBars({ n = 800, seed = 42, style = 'mixed' } = {}) {
  const rnd = mulberry32(seed);
  const bars = [];
  let base = 100, drift = 0, amp = 0.03, period = 30, phase = 0, regime = 0;
  let phase2 = 0, period2 = 10, sign = rnd() < 0.5 ? 1 : -1;
  let prevP = 100;
  let day = Date.UTC(2024, 0, 2);
  const DAY = 86400000;
  const pathAt = t => base * (1 + amp * Math.sin(phase + t) + amp * 0.45 * Math.sin(phase2 + t * 2.7));
  for (let i = 0; i < n; i++) {
    if (regime <= 0) {
      const r = rnd();
      const trending = style === 'trend' ? r < 0.8 : style === 'range' ? r < 0.15 : r < 0.5;
      if (rnd() > 0.65) sign = -sign; // 方向持续性：65% 概率延续原方向
      if (trending) {
        regime = 40 + Math.floor(rnd() * 45);
        drift = sign * (0.16 + rnd() * 0.22);
        amp = 0.016 + rnd() * 0.012;
        period = 20 + rnd() * 12;
      } else {
        regime = 70 + Math.floor(rnd() * 70);
        drift = sign * rnd() * 0.03;
        amp = 0.03 + rnd() * 0.02;
        period = 26 + rnd() * 14;
      }
    }
    regime--;
    base *= 1 + drift / 100;
    phase += (2 * Math.PI) / period * (0.8 + rnd() * 0.4);
    phase2 += (2 * Math.PI) / period2 * (0.7 + rnd() * 0.6);
    if (rnd() < 0.02) period2 = 8 + rnd() * 4;
    const o = prevP;
    let h = o, l = o, c = o;
    for (let s = 1; s <= 4; s++) {
      c = pathAt(s / 4 - 1) * (1 + (rnd() - 0.5) * 0.004);
      if (c > h) h = c;
      if (c < l) l = c;
    }
    // 偶发跳空，制造缺口与包含关系素材
    if (rnd() < 0.04) { const j = base * (rnd() - 0.5) * 0.014; h = Math.max(h, c + j); l = Math.min(l, c + j); c += j * 0.7; }
    h += base * rnd() * 0.0018;
    l -= base * rnd() * 0.0018;
    prevP = c;
    while (new Date(day).getUTCDay() === 0 || new Date(day).getUTCDay() === 6) day += DAY;
    bars.push({ t: day, o: r2(o), h: r2(h), l: r2(l), c: r2(c), ds: iso(day) });
    day += DAY;
  }
  return bars;
}

function r2(x) { return Math.round(x * 100) / 100; }
function iso(t) { return new Date(t).toISOString().slice(0, 10); }

// 教学走势：按笔级路标构造的确定性行情——下跌趋势（两个段中枢+背驰）→ 一买/二买
// → 上涨（中枢+三买）。每个路标腿渲染为一笔尺度的K线串。
const DEMO_WAYPOINTS = [
  100, 96, 99, 88, 91, 82,                // 顶部下跌段（99→82，三笔）
  87, 84, 90,                             // 中枢A段1：82→90
  85, 88.5, 83,                           // 中枢A段2：90→83
  86.5, 84.2, 89,                         // 中枢A段3：83→89（A=[83,89]）
  76, 79.5, 68, 71, 60,                   // b段：89→60
  65, 62, 68,                             // 中枢B段1：60→68
  63, 66.5, 61,                           // 中枢B段2：68→61
  64.5, 62.2, 67,                         // 中枢B段3：61→67（B=[61,67]，与A构成下跌趋势）
  61.5, 64, 56, 58.5, 51, 53.5, 46,       // c段：67→46（更缓——背驰，一买）
  50.5, 47.5, 52,                         // 反弹段 46→52
  49, 51.5, 48,                           // 回抽段 52→48：不创新低，二买
  53, 50, 58,                             // 上行段 48→58
  54, 56.5, 53,                           // 中枢C段1：58→53
  56, 53.8, 57.8,                         // 中枢C段2：53→57.8
  54.5, 56.8, 53.2,                       // 中枢C段3：57.8→53.2（C=[53.2,57.8]）
  60, 57.2, 66,                           // 向上离开C：53.2→66
  61, 64.2, 59,                           // 回试段 66→59：不跌破ZG，三买
  63.8, 60.5, 65, 62, 72,                 // 后续上涨
];

export function genDemoBars({ seed = 7 } = {}) {
  const rnd = mulberry32(seed);
  const bars = [];
  let day = Date.UTC(2024, 0, 2);
  const DAY = 86400000;
  let prev = DEMO_WAYPOINTS[0];
  for (let w = 1; w < DEMO_WAYPOINTS.length; w++) {
    const target = DEMO_WAYPOINTS[w];
    const len = Math.max(8, Math.min(15, Math.round(Math.abs(target - prev) * 0.55 + 7)));
    for (let k = 1; k <= len; k++) {
      const t0 = (k - 1) / len, t1 = k / len;
      const ease = t => t * t * (3 - 2 * t);
      const o = prev + (target - prev) * ease(t0) + prev * (rnd() - 0.5) * 0.003;
      const c = prev + (target - prev) * ease(t1) + prev * (rnd() - 0.5) * 0.003;
      const h = Math.max(o, c) + Math.abs(target - prev) * 0.02 + prev * rnd() * 0.002;
      const l = Math.min(o, c) - Math.abs(target - prev) * 0.02 - prev * rnd() * 0.002;
      while (new Date(day).getUTCDay() === 0 || new Date(day).getUTCDay() === 6) day += DAY;
      bars.push({ t: day, o: r2(o), h: r2(h), l: r2(l), c: r2(c), ds: iso(day) });
      day += DAY;
    }
    prev = target;
  }
  return bars;
}

// CSV：支持表头 date/日期/时间, open/开盘, high/最高, low/最低, close/收盘；无表头按前5列
export function parseCSV(text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) throw new Error('CSV 为空');
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const head = lines[0].toLowerCase().split(sep).map(s => s.trim().replace(/["']/g, ''));
  const find = (...names) => head.findIndex(hh => names.some(nm => hh.includes(nm)));
  let iD = find('date', '日期', '时间', 'time'), iO = find('open', '开'), iH = find('high', '最高', '高'),
    iL = find('low', '最低', '低'), iC = find('close', '收');
  let start = 1;
  if (iO < 0 || iH < 0 || iL < 0 || iC < 0) { iD = 0; iO = 1; iH = 2; iL = 3; iC = 4; start = /[a-z一-龥]/i.test(lines[0]) ? 1 : 0; }
  const bars = [];
  for (let k = start; k < lines.length; k++) {
    const cells = lines[k].split(sep);
    const o = +cells[iO], h = +cells[iH], l = +cells[iL], c = +cells[iC];
    if (![o, h, l, c].every(Number.isFinite)) continue;
    const raw = (cells[iD] || '').trim().replace(/["']/g, '');
    const t = Date.parse(raw) || bars.length;
    // 时间一律按原样字符串展示（截掉秒），不做时区换算
    bars.push({ t, o, h, l, c, ds: raw.replace(/(:\d{2}):\d{2}$/, '$1') || String(bars.length) });
  }
  if (bars.length < 10) throw new Error('CSV 解析后有效K线不足 10 根');
  return bars;
}
