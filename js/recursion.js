// 级别递归（第35课）：线段→最低级别中枢→走势类型→把走势类型当作次级别单元→
// 高一级中枢→高一级走势类型→逐级上推，直到单元不足或不再成枢。
//
// 走势类型切分规则（第17课分类 + 第20课中心定理二 + 第36课走势类型连接）：
// - 中枢分组：相邻中枢同向且波动区间不重叠（后DD>前GG=向上，后GG<前DD=向下）→ 并入同组；
//   组内≥2枢=趋势（上涨/下跌），1枢=盘整。波动区间重叠（扩展关系）不并组——
//   各自成盘整，重叠留给上一级去成枢（33课走势多义性下本实现选定的确定性分解，见规格§11）。
// - 组边界（36课连接）：下一组首枢的进入段（formation 前一个单元）属于下一组，
//   其起点即前一组终点——连接点为两走势类型共享端点。
// - 首枢之前的裸单元并入第一组；末组恒为未完成（17课走势终完美）。
import { buildZhongshus } from './zhongshu.js';

export function buildLevels(segments, maxLevels = 4) {
  const levels = [];
  let units = segments;
  for (let lv = 0; lv < maxLevels && units.length >= 3; lv++) {
    const zss = buildZhongshus(units);
    if (!zss.length) break;
    const trends = buildTrends(units, zss);
    levels.push({ units, zss, trends });
    if (!trends.length || trends.length >= units.length) break; // 防御：递归必须收敛
    units = trends;
  }
  return levels;
}

function groupZss(zss) {
  const groups = [];
  let g = null;
  for (let k = 0; k < zss.length; k++) {
    if (!g) { g = { a: k, b: k, dir: null }; continue; }
    const prev = zss[g.b], cur = zss[k];
    const rel = cur.dd > prev.gg ? 'up' : cur.gg < prev.dd ? 'down' : 'overlap';
    if (rel !== 'overlap' && (g.dir === null || g.dir === rel)) { g.dir = rel; g.b = k; }
    else { groups.push(g); g = { a: k, b: k, dir: null }; }
  }
  if (g) groups.push(g);
  return groups;
}

export function buildTrends(units, zss) {
  const groups = groupZss(zss);
  const trends = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const gr = groups[gi];
    const startU = gi === 0 ? 0 : trends[gi - 1].endU + 1;
    const endU = gi < groups.length - 1
      ? Math.max(startU, zss[groups[gi + 1].a].startSub - 2)
      : units.length - 1;
    let hi = -Infinity, lo = Infinity;
    for (let m = startU; m <= endU; m++) { hi = Math.max(hi, units[m].hi); lo = Math.min(lo, units[m].lo); }
    const from = units[startU].from, to = units[endU].to;
    const zsCount = gr.b - gr.a + 1;
    trends.push({
      kind: zsCount >= 2 ? (gr.dir === 'up' ? '上涨' : '下跌') : '盘整',
      zsCount, zsA: gr.a, zsB: gr.b,
      dir: gr.dir || (to.price >= from.price ? 'up' : 'down'),
      from, to, hi, lo, startU, endU,
      startIdx: units[startU].startIdx, endIdx: units[endU].endIdx,
      pending: gi === groups.length - 1,
      count: endU - startU + 1,
    });
  }
  return trends;
}
