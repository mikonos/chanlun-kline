// 背驰与三类买卖点（第15/17/20/21/24/27/37/53课）
//
// 趋势背驰（B1/S1）：至少第二个依次同向中枢之后（第27课「没有趋势没有背驰」），
//   离开段创出新低/新高（第37课），中枢内黄白线回拉零轴附近（第24课），
//   离开段 MACD 柱面积或 DIF 极值小于进入段（第24/27课，两信号满足其一）。
// 盘整背驰（PBC）：非趋势语境下同向进入/离开段的力度衰竭（第24/27课）。
// B2/S2：第一类买卖点后第二段次级别走势的极值点，不创新极值（第21/53课）。
// B3/S3：次级别向上离开中枢后，第一个回试段低点不跌破 ZG → 三买；向下离开后
//   第一个回抽段高点不升破 ZD → 三卖（第20课）。
// 回拉零轴判据为工程参数：中枢范围内 DIF 回到进入段极值的 25% 以内（含穿越零轴）。

export function computeSignals({ subs, zss, links, macd: m }) {
  const sig = [];
  if (!subs.length || !zss.length) return sig;

  const force = (sub, sgn) => {
    let s = 0;
    for (let i = sub.startIdx; i <= sub.endIdx; i++) {
      const h = m.hist[i];
      if (sgn > 0 ? h > 0 : h < 0) s += Math.abs(h);
    }
    return s;
  };
  const difExt = (sub, sgn) => {
    let e = 0;
    for (let i = sub.startIdx; i <= sub.endIdx; i++) e = sgn > 0 ? Math.max(e, m.dif[i]) : Math.min(e, m.dif[i]);
    return e;
  };

  zss.forEach((zs, k) => {
    const enter = zs.startSub > 0 ? subs[zs.startSub - 1] : null;
    const leave = zs.endSub + 1 < subs.length ? subs[zs.endSub + 1] : null;

    // ---- 背驰：离开段与进入段同向才有趋势/盘整背驰可言 ----
    if (enter && leave && enter.dir === leave.dir) {
      const down = enter.dir === 'down';
      const sgn = down ? -1 : 1;
      const newExtreme = down ? leave.lo < Math.min(enter.lo, zs.dd) : leave.hi > Math.max(enter.hi, zs.gg);
      const difEnter = difExt(enter, sgn);
      let pulled = false;
      for (let i = subs[zs.startSub].startIdx; i <= subs[zs.endSub].endIdx; i++) {
        if (down ? m.dif[i] >= 0.25 * difEnter : m.dif[i] <= 0.25 * difEnter) { pulled = true; break; }
      }
      const weaker = force(leave, sgn) < force(enter, sgn) || Math.abs(difExt(leave, sgn)) < Math.abs(difEnter);
      if (newExtreme && pulled && weaker) {
        const base = {
          rawIdx: leave.endIdx, price: leave.to.price, zsIdx: k,
          aRange: [enter.startIdx, enter.endIdx], cRange: [leave.startIdx, leave.endIdx],
        };
        if (links[k] === (down ? 'down' : 'up')) {
          sig.push({ ...base, kind: down ? 'B1' : 'S1', note: down ? '下跌趋势背驰' : '上涨趋势背驰' });
          const s1 = subs[zs.endSub + 2], s2 = subs[zs.endSub + 3];
          if (s1 && s2 && (down ? s2.lo > leave.lo : s2.hi < leave.hi)) {
            sig.push({
              kind: down ? 'B2' : 'S2', rawIdx: s2.endIdx, price: s2.to.price, zsIdx: k,
              note: down ? '回抽不创新低' : '回抽不创新高',
            });
          }
        } else {
          sig.push({ ...base, kind: 'PBC', dirDown: down, note: '盘整背驰' });
        }
      }
    }

    // ---- 第三类买卖点：向上离开后首个回试段低点不破ZG / 向下离开后首个回抽段高点不破ZD ----
    // 情形1：冲出段被计入中枢（中枢最后一段即离开），下一段直接是回试；
    // 情形2：离开段在中枢外，再下一段是回试。「必须是第一次」故只看紧邻两段。
    const a = zs.endSub + 1 < subs.length ? subs[zs.endSub + 1] : null;
    const b = zs.endSub + 2 < subs.length ? subs[zs.endSub + 2] : null;
    const lastIn = subs[zs.endSub];
    if (a && a.dir === 'down' && lastIn.hi > zs.zg && a.lo >= zs.zg) {
      sig.push({ kind: 'B3', rawIdx: a.endIdx, price: a.to.price, zsIdx: k, note: '回试不跌破ZG' });
    } else if (a && a.dir === 'up' && lastIn.lo < zs.zd && a.hi <= zs.zd) {
      sig.push({ kind: 'S3', rawIdx: a.endIdx, price: a.to.price, zsIdx: k, note: '回抽不升破ZD' });
    } else if (a && b && a.dir === 'up' && a.hi > zs.zg && b.lo >= zs.zg) {
      sig.push({ kind: 'B3', rawIdx: b.endIdx, price: b.to.price, zsIdx: k, note: '回试不跌破ZG' });
    } else if (a && b && a.dir === 'down' && a.lo < zs.zd && b.hi <= zs.zd) {
      sig.push({ kind: 'S3', rawIdx: b.endIdx, price: b.to.price, zsIdx: k, note: '回抽不升破ZD' });
    }
  });

  sig.sort((a, b) => a.rawIdx - b.rawIdx);
  return sig;
}
