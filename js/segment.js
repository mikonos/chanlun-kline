// 线段划分（第67/71/77/78/81课）
//
// 程序即71课所述：「假设某转折点是两线段的分界点，然后对此用线段划分的两种情况去考察
// 是否满足，如果满足其中一种，那么这点就是真正的线段的分界点；如果不满足，那就不是，
// 原来的线段依然延续」。
//
// 候选分界点 = 段内新极值处（向上段的新高/向下段的新低）。
// e1 = 假设转折点前线段的最后一个特征元素（同段内元素做包含合并，71课）；
// e2 = 从转折点开始的第一笔；e1、e2 之间有缺口 → 情况二，否则情况一（71课）。
// 情况一：转折点后的特征元素间可做包含合并（71课），出现分型（第三元素低于/高于中间元素）
//         即线段在该极值处结束（67课）。分界点两侧元素不做包含合并（78课）。
// 情况二：从极值点开始的反向走势，其特征序列（与原段同向的笔）必须做包含合并（78课），
//         出现分型（不分两种情况，67课）即确认；确认前若创出新极值则取消假设，
//         前后合为一段（78课 A+B+C；81课图例：5低于或等于7都是一段，5高于7是三段）。
//
// 特征元素的包含判定采用严格包含（两侧同时严格），分型判定只比较极值侧
// （顶比高点、底比低点）——此组合可复现81课官方图例判段，见算法规格与测试。

export function buildSegments(strokes) {
  const segs = [];
  let start = chooseStart(strokes);
  let guard = 0;
  while (start < strokes.length) {
    const end = findDivision(strokes, start);
    if (end == null) {
      // 78课回收：新段未确立自身分界即反破起点（向下的线段破了该向上笔的底）
      // → 撤销上一分界，原线段延续，从其起点重找更晚的分界
      if (segs.length && breaksStart(strokes, start) && guard++ < strokes.length) {
        const prev = segs.pop();
        const re = findDivision(strokes, prev.startStroke, prev.endStroke);
        if (re != null) { segs.push(makeSeg(strokes, prev.startStroke, re, false)); start = re + 1; continue; }
        start = prev.startStroke;
      }
      break;
    }
    segs.push(makeSeg(strokes, start, end, false));
    start = end + 1;
  }
  if (start < strokes.length) segs.push(makeSeg(strokes, start, strokes.length - 1, true));
  return segs;
}

function breaksStart(strokes, start) {
  const s0 = strokes[start], up = s0.dir === 'up', p = s0.from.price;
  for (let j = start + 1; j < strokes.length; j++) {
    if (up ? strokes[j].lo < p : strokes[j].hi > p) return true;
  }
  return false;
}

// 数据起点的段方向不由第一笔武断决定（78课：实际划分从近期显著高低点开始）。
// 两种起点各试一次划分，取更早确认分界者；首笔可作前导不入段。
function chooseStart(strokes) {
  if (strokes.length < 2) return 0;
  const d0 = findDivision(strokes, 0);
  const d1 = findDivision(strokes, 1);
  if (d0 == null) return d1 != null ? 1 : 0;
  return d1 != null && d1 < d0 ? 1 : 0;
}

function findDivision(strokes, start, minEnd = -1) {
  const dir = strokes[start].dir;
  const up = dir === 'up';
  let cand = null;
  for (let k = start; k < strokes.length; k++) {
    const s = strokes[k];

    if (cand && (up ? s.hi > cand.T : s.lo < cand.T)) cand = null; // 新极值，假设取消

    if (cand) {
      if (cand.kase == null) {
        if (s.dir !== dir && k > cand.at) {
          const gap = up ? s.lo > cand.e1.hi : s.hi < cand.e1.lo;
          cand.kase = gap ? 2 : 1;
          if (gap) cand.confEls = [];
          else cand.postEls = [{ hi: s.hi, lo: s.lo }];
        }
      } else if (cand.kase === 1) {
        if (s.dir !== dir && k > cand.at + 1) {
          pushMerged(cand.postEls, { hi: s.hi, lo: s.lo }, up);
          const p = cand.postEls;
          if (p.length >= 2 && (up ? p[p.length - 1].hi < p[0].hi : p[p.length - 1].lo > p[0].lo)) return cand.at;
        }
      } else {
        if (s.dir === dir && k > cand.at + 1) {
          pushMerged(cand.confEls, { hi: s.hi, lo: s.lo }, !up);
          const c = cand.confEls;
          if (c.length >= 3) {
            const [a, b, d] = [c[c.length - 3], c[c.length - 2], c[c.length - 1]];
            if (up ? (b.lo < a.lo && b.lo < d.lo) : (b.hi > a.hi && b.hi > d.hi)) return cand.at;
          }
        }
      }
    }

    if (!cand && s.dir === dir && k >= start + 2 && k > minEnd && isNewExtreme(strokes, start, k, up)) {
      const pre = mergeSeq(charEls(strokes, start, k, dir), up);
      if (pre.length) cand = { at: k, T: up ? s.hi : s.lo, e1: pre[pre.length - 1], kase: null };
    }
  }
  return null;
}

function isNewExtreme(strokes, start, k, up) {
  const v = up ? strokes[k].hi : strokes[k].lo;
  for (let j = start; j < k; j++) {
    if (up ? strokes[j].hi >= v : strokes[j].lo <= v) return false;
  }
  return true;
}

function charEls(strokes, start, k, dir) {
  const els = [];
  for (let j = start; j < k; j++) if (strokes[j].dir !== dir) els.push({ hi: strokes[j].hi, lo: strokes[j].lo });
  return els;
}

// 严格包含（两侧同时严格）才合并；方向按前两元素高点比较，首对无前置时用 defaultUp
function pushMerged(out, e, defaultUp) {
  if (!out.length) { out.push({ ...e }); return; }
  const last = out[out.length - 1];
  const contained = (e.hi < last.hi && e.lo > last.lo) || (e.hi > last.hi && e.lo < last.lo);
  if (!contained) { out.push({ ...e }); return; }
  const prev = out.length >= 2 ? out[out.length - 2] : null;
  const upDir = prev ? last.hi >= prev.hi : defaultUp;
  if (upDir) { last.hi = Math.max(last.hi, e.hi); last.lo = Math.max(last.lo, e.lo); }
  else { last.hi = Math.min(last.hi, e.hi); last.lo = Math.min(last.lo, e.lo); }
}

function mergeSeq(els, defaultUp) {
  const out = [];
  for (const e of els) pushMerged(out, e, defaultUp);
  return out;
}

function makeSeg(strokes, a, b, pending) {
  let hi = -Infinity, lo = Infinity;
  const s0 = strokes[a], s1 = strokes[b];
  const up = s0.dir === 'up';
  let ext = s0.from;
  for (let i = a; i <= b; i++) {
    hi = Math.max(hi, strokes[i].hi); lo = Math.min(lo, strokes[i].lo);
    for (const p of [strokes[i].from, strokes[i].to]) {
      if (up ? p.price > ext.price : p.price < ext.price) ext = p;
    }
  }
  return {
    startStroke: a, endStroke: b, dir: s0.dir, from: s0.from, to: s1.to, ext,
    hi, lo, startIdx: s0.startIdx, endIdx: s1.endIdx, pending, count: b - a + 1,
  };
}
