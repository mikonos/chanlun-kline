// 走势中枢（第17/20/33课）
// 定义：至少三个连续次级别走势类型重叠的部分（第17课）。
// 区间：ZG=min(g1,g2)、ZD=max(d1,d2)，等价于 [max(a2,c2), min(a1,c1)]（第20课）；
// GG/DD 为中枢震荡极值（第20课）。
// 延伸（第20课「围绕中枢的前后两个次级波动必须至少一个触及区间」的操作化）：
//   - 触及且后一段也触及 → 震荡延伸；
//   - 触及但后一段一去不回 → 该段是离开段，不计入中枢；
//   - 不触及但后一段拉回 → 单段脱离被拉回，仍算延伸；
//   - 连续两段不触及 → 中枢已结束。
// 升级：延伸超过5段（合计9段）构成更大级别中枢（第33课），只标注不递归。
// 首段视为进入段（中枢由进入后的三段重叠形成）；未成枢时段序按走势方向保持
// （17课分解定理：无中枢则走势类型不变），故失败时跳两段保持奇偶。
// subs 可为线段（最低级别中枢，第63课口径）或笔（民间"笔中枢"扩展，非原文口径）。

export function buildZhongshus(subs) {
  const out = [];
  let i = 1;
  while (i + 2 < subs.length) {
    const zg = Math.min(subs[i].hi, subs[i + 1].hi, subs[i + 2].hi);
    const zd = Math.max(subs[i].lo, subs[i + 1].lo, subs[i + 2].lo);
    if (!(zg > zd)) { i += 2; continue; }
    const touch = s => s.lo <= zg && s.hi >= zd;
    let end = i + 2;
    for (let j = i + 3; j < subs.length; j++) {
      const tj = touch(subs[j]);
      // 末段走势未完成：收在区间内才暂计入，冲出区间视为疑似离开段
      const tn = j + 1 < subs.length ? touch(subs[j + 1])
        : (subs[j].to.price <= zg && subs[j].to.price >= zd ? null : false);
      if (tj && tn !== false) end = j;
      else if (!tj && tn === true) { end = j + 1; j++; }
      else break;
    }
    let gg = -Infinity, dd = Infinity;
    for (let m = i; m <= end; m++) { gg = Math.max(gg, subs[m].hi); dd = Math.min(dd, subs[m].lo); }
    out.push({
      startSub: i, endSub: end, zg, zd, gg, dd,
      count: end - i + 1, upgraded: end - i + 1 >= 9,
      startIdx: subs[i].startIdx, endIdx: subs[end].endIdx,
      pending: subs[end].pending || end + 1 >= subs.length,
    });
    i = end + 2;
  }
  return out;
}

// 中枢间关系（第20课中心定理二，用 GG/DD）：
// 后DD>前GG=上涨；后GG<前DD=下跌；否则波动区间重叠=形成高级别中枢（扩展）
export function linkZhongshus(zss) {
  const links = [null];
  for (let k = 1; k < zss.length; k++) {
    const a = zss[k - 1], b = zss[k];
    links[k] = b.dd > a.gg ? 'up' : b.gg < a.dd ? 'down' : 'expand';
  }
  return links;
}
