// 笔（第62/65/77课）
// 成立条件（77课）：一顶一底；顶和底之间至少有一根不属于两分型的K线（strict 严格版，62/69/77课口径）；
// 顶分型最高K线的区间须至少一部分高于底分型最低K线的区间（g_top > g_bottom）。
// 宽松版（loose，79/80课、106课口径）：只要求顶底分型不共用K线。原文两口径并存未裁决，故做成开关。
// 同性分型取舍（77课三步骤）：顶取不低者、底取不高者，相等取先出现者。
//
// merged 索引距离：strict 要求 b.i - a.i >= 4（两分型各占3根且中间至少1根独立K线）；
// loose 要求 >= 3（分型不共用K线）。

export function buildBiPoints(merged, fractals, mode = 'strict') {
  const minGap = mode === 'strict' ? 4 : 3;
  const pts = [];
  for (const f of fractals) {
    if (!pts.length) { pts.push(f); continue; }
    const last = pts[pts.length - 1];
    if (f.type === last.type) {
      const better = f.type === 'top' ? f.price > last.price : f.price < last.price;
      if (better) pts[pts.length - 1] = f;
    } else if (canLink(last, f, merged, minGap)) {
      pts.push(f);
    }
  }
  return pts;
}

function canLink(a, b, merged, minGap) {
  if (b.i - a.i < minGap) return false;
  const top = a.type === 'top' ? a : b;
  const bot = a.type === 'top' ? b : a;
  return merged[top.i].h > merged[bot.i].h;
}

// 由分型端点序列生成笔。stroke: {i, dir, from, to, hi, lo, startIdx, endIdx}
// from/to 为端点 {price, rawIdx, mIdx}；rawIdx 取分型极值实际所在的原始K线。
export function buildBis(merged, pts) {
  const strokes = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    const from = ptOf(merged, a), to = ptOf(merged, b);
    strokes.push({
      i: strokes.length,
      dir: a.type === 'bottom' ? 'up' : 'down',
      from, to,
      hi: Math.max(from.price, to.price),
      lo: Math.min(from.price, to.price),
      startIdx: from.rawIdx, endIdx: to.rawIdx,
    });
  }
  return strokes;
}

function ptOf(merged, f) {
  const m = merged[f.i];
  return { price: f.price, rawIdx: f.type === 'top' ? m.hiIdx : m.loIdx, mIdx: f.i, type: f.type };
}
