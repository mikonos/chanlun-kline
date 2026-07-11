// 分型（第62课）：顶分型=第二K线高点为三K线中最高且低点也最高；底分型相反。
// 包含处理后相邻K线高低点严格同向，故高点条件与低点条件等价，只比较一侧即可。

export function findFractals(merged) {
  const fx = [];
  for (let i = 1; i + 1 < merged.length; i++) {
    const a = merged[i - 1], b = merged[i], c = merged[i + 1];
    if (b.h > a.h && b.h > c.h) fx.push({ type: 'top', i, price: b.h });
    else if (b.l < a.l && b.l < c.l) fx.push({ type: 'bottom', i, price: b.l });
  }
  return fx;
}
