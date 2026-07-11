// K线包含关系处理（第62/65课）
// 62课：向上时高点取高、低点取高者；向下时低点取低、高点取低者。
// 65课：方向由被包含对的前一根与再前一根比较决定（gn>=gn-1 向上；dn<=dn-1 向下），
//       且遵守顺序原则（先1、2合并，再与第3根比）。
// 边界约定：序列开头尚无前置方向时按向上处理（原文未定义此情形，见算法规格）。

export function mergeKlines(bars) {
  const out = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!out.length) { out.push(mk(b, i)); continue; }
    const last = out[out.length - 1];
    const incl = (last.h >= b.h && last.l <= b.l) || (b.h >= last.h && b.l <= last.l);
    if (!incl) { out.push(mk(b, i)); continue; }
    const prev = out.length >= 2 ? out[out.length - 2] : null;
    const up = prev ? last.h >= prev.h : true;
    if (up) {
      if (b.h > last.h) { last.h = b.h; last.hiIdx = i; }
      if (b.l > last.l) { last.l = b.l; last.loIdx = i; }
    } else {
      if (b.h < last.h) { last.h = b.h; last.hiIdx = i; }
      if (b.l < last.l) { last.l = b.l; last.loIdx = i; }
    }
    last.end = i;
  }
  return out;
}

function mk(b, i) { return { h: b.h, l: b.l, start: i, end: i, hiIdx: i, loIdx: i }; }
