// 单元测试：node tests/run-tests.mjs
// 覆盖：包含处理、分型、笔（严格/宽松）、线段两种情况（含81课官方图例）、中枢、信号不变量

import assert from 'node:assert/strict';
import { mergeKlines } from '../js/merge.js';
import { findFractals } from '../js/fractal.js';
import { buildBiPoints, buildBis } from '../js/bi.js';
import { buildSegments } from '../js/segment.js';
import { buildZhongshus, linkZhongshus } from '../js/zhongshu.js';
import { computeMACD } from '../js/macd.js';
import { computeSignals } from '../js/signals.js';
import { genBars, genDemoBars, parseCSV } from '../js/data.js';
import { buildLevels } from '../js/recursion.js';
import { buildCommentary } from '../js/commentary.js';

let n = 0, failed = 0;
function t(name, fn) {
  n++;
  try { fn(); console.log(`ok ${n} - ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${n} - ${name}\n  ${e.message}`); }
}

const B = (h, l) => ({ h, l, o: l, c: h, t: 0 });

// ---------- 包含处理（62/65课） ----------
t('包含·向上合并取高高', () => {
  // [5,1]→[7,3] 上行，[6,4] 被 [7,3] 包含，方向向上(7>=5) → 合并为 [7,4]
  const m = mergeKlines([B(5, 1), B(7, 3), B(6, 4)]);
  assert.equal(m.length, 2);
  assert.deepEqual([m[1].h, m[1].l], [7, 4]);
});
t('包含·向下合并取低低', () => {
  const m = mergeKlines([B(9, 5), B(7, 3), B(6, 3.5)]);
  assert.equal(m.length, 2);
  assert.deepEqual([m[1].h, m[1].l], [6, 3]);
});
t('包含·顺序原则连续合并', () => {
  // 上行中依次包含：先 1、2 合并成新K线，再用新K线与第 3 根比（65课顺序原则）
  const m = mergeKlines([B(5, 1), B(9, 4), B(8, 5), B(8.5, 5.5)]);
  assert.equal(m.length, 2);
  assert.deepEqual([m[1].h, m[1].l], [9, 5.5]);
});
t('包含·序列开头默认向上', () => {
  const m = mergeKlines([B(10, 5), B(9, 6)]);
  assert.equal(m.length, 1);
  assert.deepEqual([m[0].h, m[0].l], [10, 6]);
});
t('包含·处理后无相邻包含', () => {
  const bars = genBars({ n: 500, seed: 7 });
  const m = mergeKlines(bars);
  for (let i = 1; i < m.length; i++) {
    const a = m[i - 1], b = m[i];
    assert.ok(!((a.h >= b.h && a.l <= b.l) || (b.h >= a.h && b.l <= a.l)), `相邻包含于 ${i}`);
  }
});

// ---------- 分型（62课） ----------
t('分型·顶底识别', () => {
  const m = mergeKlines([B(2, 1), B(4, 3), B(6, 5), B(4.5, 3.5), B(2.5, 1.5), B(5, 4)]);
  const fx = findFractals(m);
  assert.deepEqual(fx.map(f => f.type), ['top', 'bottom']);
  assert.equal(fx[0].price, 6);
  assert.equal(fx[1].price, 1.5);
});

// ---------- 笔（62/77课 严格 vs 79/80课 宽松） ----------
function zigzagBars() {
  // 顶分型@2（高10），底分型@6（低1），分型间隔4 → 严格版成笔
  return [B(4, 3), B(7, 6), B(10, 9), B(8, 7), B(6, 5), B(4, 3), B(2, 1), B(5, 4), B(7, 6)];
}
t('笔·严格版隔4成笔', () => {
  const m = mergeKlines(zigzagBars());
  const fx = findFractals(m);
  const pts = buildBiPoints(m, fx, 'strict');
  const bis = buildBis(m, pts);
  assert.equal(bis.length, 1);
  assert.equal(bis[0].dir, 'down');
  assert.deepEqual([bis[0].from.price, bis[0].to.price], [10, 1]);
});
t('笔·隔3严格版不成、宽松版成', () => {
  // 顶@2 底@5：距离3
  const bars = [B(4, 3), B(7, 6), B(10, 9), B(8, 7), B(5, 4), B(2, 1), B(5, 4), B(7, 6)];
  const m = mergeKlines(bars);
  const fx = findFractals(m);
  assert.equal(buildBis(m, buildBiPoints(m, fx, 'strict')).length, 0);
  assert.equal(buildBis(m, buildBiPoints(m, fx, 'loose')).length, 1);
});
t('笔·同性分型取极值', () => {
  // 两个顶：先8后10（无中间底分型成笔），取10
  const bars = [B(4, 3), B(6, 5), B(8, 7), B(7, 6), B(9, 8), B(10, 9), B(8, 7), B(6, 5), B(4, 3), B(2, 1), B(4, 3), B(6, 5)];
  const m = mergeKlines(bars);
  const fx = findFractals(m);
  const pts = buildBiPoints(m, fx, 'strict');
  const tops = pts.filter(p => p.type === 'top');
  assert.ok(tops.every(p => p.price === 10), '应只保留更高的顶');
});

// ---------- 线段（67/71/77/78课） ----------
// 直接构造笔序列。价格路径 path=[p0,p1,...] 依次为各笔端点。
function mkStrokes(path) {
  const st = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    st.push({
      i: i - 1, dir: b > a ? 'up' : 'down',
      from: { price: a, rawIdx: (i - 1) * 5 }, to: { price: b, rawIdx: i * 5 },
      hi: Math.max(a, b), lo: Math.min(a, b),
      startIdx: (i - 1) * 5, endIdx: i * 5,
    });
  }
  return st;
}
t('线段·三笔重叠未破坏=单一未完成段', () => {
  const segs = buildSegments(mkStrokes([0, 10, 4, 14]));
  assert.equal(segs.length, 1);
  assert.ok(segs[0].pending);
});
t('线段·情况一（无缺口顶分型）', () => {
  // 上段 0→10→7→12，后 12→9→11→8：特征序列 [7,10],[9,12],[8,11] 顶分型无缺口 → 分界@12
  const segs = buildSegments(mkStrokes([0, 10, 7, 12, 9, 11, 8]));
  assert.equal(segs.length, 2);
  assert.equal(segs[0].to.price, 12);
  assert.equal(segs[0].count, 3);
  assert.ok(!segs[0].pending && segs[1].pending);
});
t('线段·81课图例：5高于7 → 三段', () => {
  // 起笔小折返，大涨到10(即"5")，下上下上下，最后上到9(即"7"<10)
  const segs = buildSegments(mkStrokes([2, 3, 1, 10, 6.5, 8, 5, 8, 6.5, 9]));
  assert.equal(segs.length, 3, `期望3段，得到${segs.length}`);
  assert.equal(segs[0].to.price, 10);
  assert.equal(segs[1].to.price, 5);
  assert.equal(segs[1].dir, 'down');
  assert.ok(segs[2].pending);
});
t('线段·81课图例：5低于7 → 一段', () => {
  const segs = buildSegments(mkStrokes([2, 3, 1, 10, 6.5, 8, 5, 8, 6.5, 10.5]));
  assert.equal(segs.length, 1, `期望1段，得到${segs.length}`);
  assert.ok(segs[0].pending);
});
t('线段·情况二未确认前新高=延续（78课A+B+C）', () => {
  // 缺口后仅一笔回调即新高：不能分段
  const segs = buildSegments(mkStrokes([0, 10, 8, 20, 15, 25]));
  assert.equal(segs.length, 1);
});
t('线段·完成段笔数为单数（77课）', () => {
  for (const seed of [3, 11, 29]) {
    const bars = genBars({ n: 900, seed });
    const m = mergeKlines(bars);
    const bis = buildBis(m, buildBiPoints(m, findFractals(m), 'strict'));
    const segs = buildSegments(bis);
    for (const s of segs) {
      if (s.pending) continue;
      assert.ok(s.count >= 3, `段仅${s.count}笔`);
      assert.equal(s.count % 2, 1, `段笔数${s.count}非单数`);
    }
    // 方向交替 + 首尾相连
    for (let i = 1; i < segs.length; i++) {
      assert.notEqual(segs[i].dir, segs[i - 1].dir, '线段方向未交替');
      assert.equal(segs[i].from.price, segs[i - 1].to.price, '线段未首尾相连');
    }
    // 向上段顶高于底（78课）
    for (const s of segs) {
      if (s.pending) continue;
      assert.ok(s.dir === 'up' ? s.to.price > s.from.price : s.to.price < s.from.price, '线段端点方向错误');
    }
  }
});

// ---------- 中枢（17/20/33课） ----------
function mkSubs(path) { return mkStrokes(path); }
t('中枢·首段为进入段，区间=[max低, min高]', () => {
  // 进入段 10→4，随后 上下上 [4,8],[2,8],[2,9]：ZG=8, ZD=4
  const zs = buildZhongshus(mkSubs([10, 4, 8, 2, 9]));
  assert.equal(zs.length, 1);
  assert.equal(zs[0].startSub, 1);
  assert.equal(zs[0].zg, 8);
  assert.equal(zs[0].zd, 4);
  assert.equal(zs[0].dd, 2);
  assert.equal(zs[0].gg, 9);
});
t('中枢·三段无重叠不成中枢', () => {
  const zs = buildZhongshus(mkSubs([0, 10, 8, 20, 18, 30]));
  assert.equal(zs.length, 0);
});
t('中枢·震荡延伸，离开段不被吸收', () => {
  // 中枢[4,8]；9→5 触及且后段拉回=延伸；5→20 触及但一去不回=离开段，不计入
  const zs = buildZhongshus(mkSubs([10, 4, 8, 2, 9, 5, 20, 15, 25]));
  assert.equal(zs.length, 1);
  assert.equal(zs[0].count, 4);
  assert.equal(zs[0].gg, 9, '离开段的高点不应计入GG');
});
t('中枢·9段升级标注', () => {
  const zs = buildZhongshus(mkSubs([10, 4, 8, 2, 9, 3, 8.5, 2.5, 9.5, 3.5, 7.5, 4.2, 20]));
  assert.equal(zs.length, 1);
  assert.ok(zs[0].count >= 9 && zs[0].upgraded, `count=${zs[0].count}`);
});
t('中枢·GG/DD 同向判定（中心定理二）', () => {
  const subs = mkSubs([20, 10, 14, 11, 13, 4, 6, 3, 5, 2, 4.5]);
  const zss = buildZhongshus(subs);
  assert.equal(zss.length, 2);
  const links = linkZhongshus(zss);
  assert.equal(links[1], 'down');
});

// ---------- 信号 ----------
t('信号·三买：离开后回试不跌破ZG', () => {
  // 中枢[4,8]（10,4,8,2,9 前三段成枢：区间[4,8]) ... 离开段 3→12(hi>ZG)，回试 12→9(lo=9>=8) → B3
  const subs = mkSubs([10, 4, 8, 3, 12, 9, 15]);
  const zss = buildZhongshus(subs);
  assert.equal(zss.length, 1);
  const links = linkZhongshus(zss);
  const macd = { dif: new Array(200).fill(0), dea: new Array(200).fill(0), hist: new Array(200).fill(0) };
  const sig = computeSignals({ subs, zss, links, macd });
  assert.ok(sig.some(s => s.kind === 'B3'), `期望B3，得到 ${JSON.stringify(sig.map(s => s.kind))}`);
});
t('CSV·分钟线解析与时间原样展示（65课：定义适用任何周期）', () => {
  const rows = Array.from({ length: 12 }, (_, i) =>
    `2026-07-10 ${String(10 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}:00,10,11,9,10.5`);
  const bars = parseCSV('date,open,high,low,close\n' + rows.join('\n'));
  assert.equal(bars.length, 12);
  assert.equal(bars[0].ds, '2026-07-10 10:00', '秒应被截掉、不做时区换算');
  const m = mergeKlines(bars);
  assert.ok(m.length >= 1);
});

// —— 级别递归（35课）——
const mkU = (from, to, i) => ({
  dir: to > from ? 'up' : 'down',
  from: { price: from, rawIdx: i * 10 }, to: { price: to, rawIdx: i * 10 + 9 },
  hi: Math.max(from, to), lo: Math.min(from, to),
  startIdx: i * 10, endIdx: i * 10 + 9, pending: false, count: 1,
});
const mkSeq = pts => pts.map((p, i) => mkU(p[0], p[1], i));

t('递归·三个上移中枢归并为一个上涨走势类型（35课+17课）', () => {
  const units = mkSeq([[5, 20], [20, 10], [10, 20], [20, 10], [10, 40], [40, 35], [35, 45], [45, 35],
    [35, 70], [70, 65], [65, 75], [75, 65], [65, 100]]);
  const levels = buildLevels(units);
  assert.equal(levels.length, 1, '仅一级（走势类型只剩1个，无从上推）');
  assert.equal(levels[0].zss.length, 3);
  assert.equal(levels[0].trends.length, 1);
  const t0 = levels[0].trends[0];
  assert.equal(t0.kind, '上涨');
  assert.equal(t0.zsCount, 3);
  assert.ok(t0.pending, '末组走势类型恒未完成（走势终完美）');
  assert.equal(t0.startU, 0);
  assert.equal(t0.endU, units.length - 1, '走势类型无缝覆盖全部单元');
});

t('递归·重叠的走势类型涌现出 L2 中枢（35课逐级上推）', () => {
  const units = mkSeq([
    [0, 20], [20, 10], [10, 20], [20, 10],            // 枢A [10,20]
    [10, 50], [50, 40], [40, 52], [52, 40],           // 枢B [40,50] —— 与A同向上移
    [40, 70], [70, 55], [55, 68], [68, 55],           // 枢C [55,68] —— 仍上移，A+B+C=上涨趋势
    [55, 80], [80, 68.5], [68.5, 77], [77, 64],       // 枢D [68.5,77] —— 与C波动区间重叠→新组
    [64, 85], [85, 78], [78, 84], [84, 77.5],         // 枢E [78,84] —— 与D重叠→新组
    [77.5, 95], [95, 84.5], [84.5, 93], [93, 84.2],   // 枢F [84.5,93] —— 与E重叠→新组
    [84.2, 100],                                       // 未完成尾巴
  ]);
  const levels = buildLevels(units);
  assert.equal(levels[0].zss.length, 6, 'L1 六个段中枢');
  assert.equal(levels[0].trends.length, 4, '分组：上涨(A,B,C)+盘整(D)+盘整(E)+盘整(F)');
  assert.equal(levels[0].trends[0].kind, '上涨');
  assert.equal(levels[0].trends[0].zsCount, 3);
  assert.equal(levels.length, 2, '三个重叠的走势类型上推出第二级');
  assert.equal(levels[1].zss.length, 1);
  const z2 = levels[1].zss[0];
  assert.equal(z2.zg, 80, 'L2 ZG=min(80,85,100)');
  assert.equal(z2.zd, 77.5, 'L2 ZD=max(55,64,77.5)');
});

t('递归·全管线不变量（覆盖无缝/递归收敛/末组未完成）', () => {
  for (const seed of [3, 17, 42, 99]) {
    const bars = genBars({ n: 900, seed, style: 'mixed' });
    const merged = mergeKlines(bars);
    const strokes = buildBis(merged, buildBiPoints(merged, findFractals(merged), 'strict'));
    const segs = buildSegments(strokes);
    const levels = buildLevels(segs);
    let prevN = segs.length;
    for (const [k, L] of levels.entries()) {
      assert.ok(L.units.length <= prevN, `L${k + 1} 单元数不增`);
      prevN = L.trends.length;
      for (const z of L.zss) assert.ok(z.zg > z.zd, 'ZG>ZD');
      L.trends.forEach((tr, ti) => {
        assert.equal(tr.startU, ti === 0 ? 0 : L.trends[ti - 1].endU + 1, '走势类型无缝相接');
        assert.ok(tr.pending === (ti === L.trends.length - 1), '仅末组未完成');
      });
      if (L.trends.length) assert.equal(L.trends[L.trends.length - 1].endU, L.units.length - 1, '覆盖到最后一个单元');
    }
  }
});

t('点评·教学数据生成完整且句句可回溯', () => {
  const bars = genDemoBars({ seed: 42 });
  const merged = mergeKlines(bars);
  const strokes = buildBis(merged, buildBiPoints(merged, findFractals(merged), 'strict'));
  const segments = buildSegments(strokes);
  const zsSeg = buildZhongshus(segments);
  const links = linkZhongshus(zsSeg);
  const macd = computeMACD(bars.map(b => b.c));
  const d = {
    bars, strokes, segments, zsSeg, links,
    levels: buildLevels(segments),
    signals: computeSignals({ subs: segments, zss: zsSeg, links, macd }),
  };
  const cmt = buildCommentary(d);
  assert.ok(cmt.length >= 4, '至少含格局/当下段或位置/信号/纪律');
  const all = cmt.join('\n');
  assert.ok(all.includes('走势类型序列'), '格局句含递归走势类型序列');
  assert.ok(/B\d·第[一二三]类买点|S\d·第[一二三]类卖点/.test(all), '信号句含最近买卖点');
  assert.ok(all.includes('不构成投资建议'), '免责句在场');
  assert.ok(all.includes(`${bars.length}根K线`), '数据规模可回溯');
  // 无信号分支
  const cmt2 = buildCommentary({ ...d, signals: [] });
  assert.ok(cmt2.join('').includes('至今没有出现任何三类买卖点'), '无信号时给完备性提示');
});

t('信号·全管线不变量（多种子）', () => {
  for (const seed of [2, 5, 13, 21, 34]) {
    for (const style of ['mixed', 'trend', 'range']) {
      const bars = genBars({ n: 700, seed, style });
      const m = mergeKlines(bars);
      const fx = findFractals(m);
      for (const mode of ['strict', 'loose']) {
        const pts = buildBiPoints(m, fx, mode);
        const bis = buildBis(m, pts);
        const minGap = mode === 'strict' ? 4 : 3;
        for (let i = 0; i < bis.length; i++) {
          const b = bis[i];
          assert.ok(b.to.mIdx - b.from.mIdx >= minGap, `笔${i}间距不足`);
          assert.ok(b.dir === 'up' ? b.to.price > b.from.price : b.to.price < b.from.price, `笔${i}方向错误`);
          if (i) assert.notEqual(b.dir, bis[i - 1].dir, `笔${i}方向未交替`);
        }
        const segs = buildSegments(bis);
        const zss = buildZhongshus(segs);
        for (const z of zss) assert.ok(z.zg > z.zd && z.count >= 3, '中枢区间非法');
        const macd = computeMACD(bars.map(x => x.c));
        const sig = computeSignals({ subs: segs, zss, links: linkZhongshus(zss), macd });
        for (const s of sig) assert.ok(s.rawIdx >= 0 && s.rawIdx < bars.length, '信号越界');
      }
    }
  }
});

console.log(failed ? `\n${failed}/${n} FAILED` : `\n${n} tests passed`);
process.exit(failed ? 1 : 0);
