// Canvas 渲染引擎：主图（K线+缠论标注）+ MACD 副图，缩放/平移/十字线

const C = {
  bg: '#14161c', grid: '#20242e', axis: '#8b93a7', cross: 'rgba(200,210,230,.45)',
  up: '#e0524f', down: '#3fa87c',
  mergedBox: 'rgba(170,178,196,.5)',
  fxTop: '#ffb02e', fxBot: '#39c0f0',
  bi: '#e8c76a', seg: '#5b8cff',
  zsSeg: { fill: 'rgba(91,140,255,.10)', line: 'rgba(120,160,255,.65)', text: 'rgba(160,185,255,.95)' },
  zsBi: { fill: 'rgba(170,178,196,.07)', line: 'rgba(170,178,196,.4)', text: 'rgba(180,188,205,.8)' },
  zsLv: [ // 递归高级别中枢：L2 紫 / L3 金 / L4 玫红
    { fill: 'rgba(186,120,255,.09)', line: 'rgba(196,140,255,.8)', text: 'rgba(210,165,255,.95)' },
    { fill: 'rgba(240,185,11,.08)', line: 'rgba(240,185,11,.75)', text: 'rgba(245,205,90,.95)' },
    { fill: 'rgba(255,110,160,.08)', line: 'rgba(255,110,160,.75)', text: 'rgba(255,150,185,.95)' },
  ],
  trend: { '上涨': 'rgba(224,82,79,.30)', '下跌': 'rgba(63,168,124,.32)', '盘整': 'rgba(150,158,176,.25)' },
  buy: { B1: '#e74c3c', B2: '#ff7f50', B3: '#c0392b' },
  sell: { S1: '#27ae60', S2: '#58d68d', S3: '#1e8449' },
  pbc: '#ffb02e',
  dif: '#e8e8ec', dea: '#f0b90b',
  bandA: 'rgba(91,140,255,.13)', bandC: 'rgba(255,159,67,.16)',
};

export class ChanChart {
  constructor(mainCv, macdCv, infoEl) {
    this.mainCv = mainCv; this.macdCv = macdCv; this.infoEl = infoEl;
    this.data = null;
    this.show = { merged: false, fractal: false, bi: true, seg: true, zsSeg: true, zsBi: false, signals: true, bands: true, lv: true };
    this.view = { i0: 0, i1: 100 };
    this.hover = null;
    this.drag = null;
    this._bind(mainCv); this._bind(macdCv);
    const ro = new ResizeObserver(() => this.draw());
    ro.observe(mainCv.parentElement);
  }

  setData(d) {
    this.data = d;
    this.mOf = new Array(d.bars.length);
    d.merged.forEach((m, mi) => { for (let i = m.start; i <= m.end; i++) this.mOf[i] = mi; });
    this.resetView();
  }

  setShow(s) { Object.assign(this.show, s); this.draw(); }

  resetView() {
    const n = this.data ? this.data.bars.length : 100;
    this.view.i0 = n <= 1000 ? -2 : n - 800;
    this.view.i1 = n + 2;
    this.draw();
  }

  _bind(cv) {
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const f = Math.exp(e.deltaY * 0.0016);
      const { i0, i1 } = this.view;
      const anchor = i0 + (e.clientX - r.left) / r.width * (i1 - i0);
      this._setView(anchor - (anchor - i0) * f, anchor + (i1 - anchor) * f);
    }, { passive: false });
    cv.addEventListener('pointerdown', e => { this.drag = { x: e.clientX, i0: this.view.i0, i1: this.view.i1 }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      const r = this.mainCv.getBoundingClientRect();
      if (this.drag) {
        const di = (this.drag.x - e.clientX) / r.width * (this.drag.i1 - this.drag.i0);
        this._setView(this.drag.i0 + di, this.drag.i1 + di);
      }
      this.hover = { x: e.clientX - r.left, y: e.clientY - r.top, pane: cv === this.mainCv ? 'main' : 'macd' };
      this.draw();
    });
    cv.addEventListener('pointerup', () => { this.drag = null; });
    cv.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
    cv.addEventListener('dblclick', () => this.resetView());
  }

  _setView(i0, i1) {
    const n = this.data.bars.length;
    let span = i1 - i0;
    span = Math.max(8, Math.min(span, n * 1.3 + 20));
    if (i0 < -span * 0.5) i0 = -span * 0.5;
    if (i0 + span > n + span * 0.5) i0 = n + span * 0.5 - span;
    this.view.i0 = i0; this.view.i1 = i0 + span;
    this.draw();
  }

  _prep(cv) {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [g, w, h];
  }

  draw() {
    if (!this.data) return;
    this._drawMain();
    this._drawMacd();
    this._drawInfo();
  }

  _xMap(w) {
    const { i0, i1 } = this.view;
    const bw = w / (i1 - i0);
    return [i => (i + 0.5 - i0) * bw, bw];
  }

  _drawMain() {
    const [g, w, h] = this._prep(this.mainCv);
    const d = this.data, { i0, i1 } = this.view, s = this.show;
    g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
    const [x, bw] = this._xMap(w);
    const a = Math.max(0, Math.floor(i0)), b = Math.min(d.bars.length - 1, Math.ceil(i1));
    let lo = Infinity, hi = -Infinity;
    for (let i = a; i <= b; i++) { const k = d.bars[i]; if (k.l < lo) lo = k.l; if (k.h > hi) hi = k.h; }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const pad = (hi - lo) * 0.07 + 1e-9;
    lo -= pad; hi += pad;
    const y = p => (hi - p) / (hi - lo) * (h - 26) + 18;

    // 网格与价格轴
    g.strokeStyle = C.grid; g.fillStyle = C.axis; g.font = '10px sans-serif'; g.lineWidth = 1;
    const step = niceStep((hi - lo) / 5);
    for (let p = Math.ceil(lo / step) * step; p < hi; p += step) {
      g.beginPath(); g.moveTo(0, y(p)); g.lineTo(w, y(p)); g.stroke();
      g.fillText(p.toFixed(step < 1 ? 2 : 0), w - 44, y(p) - 2);
    }
    for (let i = Math.ceil(a / 50) * 50; i <= b; i += 50) {
      if (!d.bars[i]) continue;
      g.beginPath(); g.moveTo(x(i), 0); g.lineTo(x(i), h); g.stroke();
      g.fillText(axisLbl(d.bars[i]), x(i) + 2, h - 4);
    }

    // 中枢矩形（先画作底）
    if (s.zsBi && d.zsBi) for (const z of d.zsBi) this._zsRect(g, x, y, z, C.zsBi, bw, '笔');
    if (s.zsSeg && d.zsSeg) for (const z of d.zsSeg) this._zsRect(g, x, y, z, C.zsSeg, bw, '');
    // 递归高级别中枢（35课）：levels[1] 起为 L2+
    if (s.lv && d.levels) {
      for (let lv = 1; lv < d.levels.length; lv++) {
        const col = C.zsLv[Math.min(lv - 1, C.zsLv.length - 1)];
        for (const z of d.levels[lv].zss) this._zsRect(g, x, y, z, col, bw, `L${lv + 1}`, 2);
      }
    }

    // K线
    const bodyW = Math.max(1, bw * 0.68);
    for (let i = a; i <= b; i++) {
      const k = d.bars[i], up = k.c >= k.o, cx = x(i);
      g.strokeStyle = g.fillStyle = up ? C.up : C.down;
      g.beginPath(); g.moveTo(cx, y(k.h)); g.lineTo(cx, y(k.l)); g.stroke();
      if (bw > 1.6) {
        const t = y(Math.max(k.o, k.c)), bh = Math.max(1, Math.abs(y(k.o) - y(k.c)));
        g.fillRect(cx - bodyW / 2, t, bodyW, bh);
      }
    }

    // 合并K线框
    if (s.merged && bw > 2.5) {
      g.strokeStyle = C.mergedBox; g.setLineDash([3, 3]); g.lineWidth = 1;
      for (const m of d.merged) {
        if (m.end < a || m.start > b || m.end === m.start) continue;
        const x0 = x(m.start) - bw * 0.45, x1 = x(m.end) + bw * 0.45;
        g.strokeRect(x0, y(m.h) - 1, x1 - x0, y(m.l) - y(m.h) + 2);
      }
      g.setLineDash([]);
    }

    // 分型箭头（77课：顶用向下箭头、底用向上箭头）
    if (s.fractal && bw > 2.5) {
      for (const f of d.fractals) {
        const m = d.merged[f.i];
        const i = f.type === 'top' ? m.hiIdx : m.loIdx;
        if (i < a || i > b) continue;
        const cx = x(i);
        if (f.type === 'top') tri(g, cx, y(f.price) - 8, 4, false, C.fxTop);
        else tri(g, cx, y(f.price) + 8, 4, true, C.fxBot);
      }
    }

    // 笔
    if (s.bi && d.strokes.length) {
      g.strokeStyle = C.bi; g.lineWidth = 1.3; g.beginPath();
      g.moveTo(x(d.strokes[0].from.rawIdx), y(d.strokes[0].from.price));
      for (const st of d.strokes) g.lineTo(x(st.to.rawIdx), y(st.to.price));
      g.stroke();
      if (d.pendingLeg) {
        g.setLineDash([5, 4]); g.beginPath();
        g.moveTo(x(d.pendingLeg.from.rawIdx), y(d.pendingLeg.from.price));
        g.lineTo(x(d.pendingLeg.to.rawIdx), y(d.pendingLeg.to.price));
        g.stroke(); g.setLineDash([]);
      }
    }

    // 线段
    if (s.seg && d.segments.length) {
      g.strokeStyle = C.seg; g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(x(d.segments[0].from.rawIdx), y(d.segments[0].from.price));
      for (const sg of d.segments) {
        if (sg.pending) break;
        g.lineTo(x(sg.to.rawIdx), y(sg.to.price));
      }
      g.stroke();
      const last = d.segments[d.segments.length - 1];
      if (last.pending) {
        // 未完成段画到段内极值（78课标准化口径），极值之后用点线示意当下位置
        g.setLineDash([7, 5]); g.beginPath();
        g.moveTo(x(last.from.rawIdx), y(last.from.price));
        g.lineTo(x(last.ext.rawIdx), y(last.ext.price));
        g.stroke();
        if (last.ext.rawIdx !== last.to.rawIdx) {
          g.setLineDash([2, 4]); g.beginPath();
          g.moveTo(x(last.ext.rawIdx), y(last.ext.price));
          g.lineTo(x(last.to.rawIdx), y(last.to.price));
          g.stroke();
        }
        g.setLineDash([]);
      }
    }

    // 买卖点与背驰标记
    if (s.signals) {
      g.font = 'bold 10px sans-serif'; g.textAlign = 'center';
      for (const sg of d.signals) {
        if (sg.rawIdx < a || sg.rawIdx > b) continue;
        const cx = x(sg.rawIdx);
        if (sg.kind === 'PBC') {
          const yy = sg.dirDown ? y(sg.price) + 14 : y(sg.price) - 14;
          diamond(g, cx, yy, 6, C.pbc);
          g.fillStyle = C.pbc; g.fillText('盘背', cx, yy + (sg.dirDown ? 16 : -10));
          continue;
        }
        const buy = sg.kind[0] === 'B';
        const col = buy ? C.buy[sg.kind] : C.sell[sg.kind];
        const yy = buy ? y(sg.price) + 20 : y(sg.price) - 20;
        g.strokeStyle = col; g.lineWidth = 1;
        g.beginPath(); g.moveTo(cx, y(sg.price) + (buy ? 3 : -3)); g.lineTo(cx, yy + (buy ? -8 : 8)); g.stroke();
        g.fillStyle = col;
        rrect(g, cx - 11, yy - 7, 22, 14, 3); g.fill();
        g.fillStyle = '#fff'; g.fillText(sg.kind, cx, yy + 3.5);
      }
      g.textAlign = 'left';
    }

    // 级别泳道（35课递归）：每级一行，色块=走势类型（红涨/绿跌/灰盘整），虚边=未完成
    if (s.lv && d.levels && d.levels.length) {
      g.font = '9px sans-serif';
      for (let lv = 0; lv < d.levels.length; lv++) {
        const y0 = 16 + lv * 15;
        g.fillStyle = C.axis;
        g.fillText(`L${lv + 1}`, 3, y0 + 9);
        for (const t of d.levels[lv].trends) {
          let x0 = x(t.startIdx) - bw * 0.4, x1 = x(t.endIdx) + bw * 0.4;
          if (x1 < 18 || x0 > w) continue;
          x0 = Math.max(x0, 18); x1 = Math.min(x1, w - 46);
          if (x1 <= x0) continue;
          g.fillStyle = C.trend[t.kind];
          g.fillRect(x0, y0, x1 - x0, 11);
          g.strokeStyle = 'rgba(200,210,230,.5)'; g.lineWidth = 1;
          if (t.pending) g.setLineDash([3, 3]);
          g.strokeRect(x0, y0, x1 - x0, 11);
          g.setLineDash([]);
          const lbl = `${t.kind}·${t.zsCount}枢${t.pending ? '…' : ''}`;
          if (x1 - x0 > lbl.length * 9 + 6) {
            g.fillStyle = 'rgba(230,235,245,.92)';
            g.fillText(lbl, x0 + 4, y0 + 9);
          }
        }
      }
    }

    // 十字线
    if (this.hover && this.hover.pane === 'main') {
      g.strokeStyle = C.cross; g.setLineDash([4, 4]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(this.hover.x, 0); g.lineTo(this.hover.x, h); g.stroke();
      g.beginPath(); g.moveTo(0, this.hover.y); g.lineTo(w, this.hover.y); g.stroke();
      g.setLineDash([]);
      const p = hi - (this.hover.y - 18) / (h - 26) * (hi - lo);
      g.fillStyle = '#0e1015'; g.fillRect(w - 52, this.hover.y - 8, 50, 14);
      g.fillStyle = '#dfe4ee'; g.fillText(p.toFixed(2), w - 48, this.hover.y + 3);
    }
  }

  _zsRect(g, x, y, z, col, bw, tag, lw = 1.2) {
    const x0 = x(z.startIdx) - bw * 0.4, x1 = x(z.endIdx) + bw * 0.4;
    const y0 = y(z.zg), y1 = y(z.zd);
    g.fillStyle = col.fill; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = col.line; g.lineWidth = lw;
    if (z.pending) g.setLineDash([5, 4]);
    g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.setLineDash([]);
    g.fillStyle = col.text; g.font = '10px sans-serif';
    g.fillText(`${tag}中枢·${z.count}段${z.upgraded ? '·9段升级' : ''}`, x0 + 3, y0 - 3);
  }

  _drawMacd() {
    const [g, w, h] = this._prep(this.macdCv);
    const d = this.data, { i0, i1 } = this.view, m = d.macd;
    g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
    const [x, bw] = this._xMap(w);
    const a = Math.max(0, Math.floor(i0)), b = Math.min(d.bars.length - 1, Math.ceil(i1));
    let ex = 1e-9;
    for (let i = a; i <= b; i++) ex = Math.max(ex, Math.abs(m.dif[i]), Math.abs(m.dea[i]), Math.abs(m.hist[i]));
    const y = v => h / 2 - v / ex * (h / 2 - 8);

    // 背驰对比区带（a段蓝 / c段橙）
    if (this.show.bands && this.show.signals) {
      for (const sg of d.signals) {
        if (!sg.aRange) continue;
        g.fillStyle = C.bandA; g.fillRect(x(sg.aRange[0]) - bw / 2, 0, x(sg.aRange[1]) - x(sg.aRange[0]) + bw, h);
        g.fillStyle = C.bandC; g.fillRect(x(sg.cRange[0]) - bw / 2, 0, x(sg.cRange[1]) - x(sg.cRange[0]) + bw, h);
      }
    }

    g.strokeStyle = C.grid; g.beginPath(); g.moveTo(0, y(0)); g.lineTo(w, y(0)); g.stroke();
    const hw = Math.max(1, bw * 0.55);
    for (let i = a; i <= b; i++) {
      const v = m.hist[i];
      g.fillStyle = v >= 0 ? C.up : C.down;
      const y0 = y(0), y1 = y(v);
      g.fillRect(x(i) - hw / 2, Math.min(y0, y1), hw, Math.max(1, Math.abs(y1 - y0)));
    }
    line(g, x, y, m.dif, a, b, C.dif, 1.2);
    line(g, x, y, m.dea, a, b, C.dea, 1.2);
    g.fillStyle = C.axis; g.font = '10px sans-serif';
    g.fillText('MACD(12,26,9) 柱=2×(DIF-DEA) · 背驰对比带: 蓝=进入段a 橙=离开段c', 6, 12);

    if (this.hover) {
      g.strokeStyle = C.cross; g.setLineDash([4, 4]);
      g.beginPath(); g.moveTo(this.hover.x, 0); g.lineTo(this.hover.x, h); g.stroke();
      g.setLineDash([]);
    }
  }

  _drawInfo() {
    if (!this.infoEl) return;
    const d = this.data;
    if (!this.hover) { this.infoEl.textContent = ''; return; }
    const { i0, i1 } = this.view;
    const r = this.mainCv.getBoundingClientRect();
    const i = Math.round(i0 + this.hover.x / r.width * (i1 - i0) - 0.5);
    if (i < 0 || i >= d.bars.length) { this.infoEl.textContent = ''; return; }
    const k = d.bars[i], mi = this.mOf[i], m = d.merged[mi];
    let t = `${k.ds}  开${k.o} 高${k.h} 低${k.l} 收${k.c}`;
    if (m) t += `  ｜ 合并K#${mi} [${m.l}, ${m.h}]${m.end > m.start ? `(含${m.end - m.start + 1}根)` : ''}`;
    const sg = d.segments.find(s2 => i >= s2.startIdx && i <= s2.endIdx);
    if (sg) t += ` ｜ 线段${sg.dir === 'up' ? '↑' : '↓'}${sg.pending ? '(未完成)' : ''} ${sg.count}笔`;
    if (this.show.lv && d.levels) {
      for (let lv = 0; lv < d.levels.length; lv++) {
        const tr = d.levels[lv].trends.find(t2 => i >= t2.startIdx && i <= t2.endIdx);
        if (tr) t += ` ｜ L${lv + 1}${tr.kind}(${tr.zsCount}枢)${tr.pending ? '…' : ''}`;
      }
    }
    this.infoEl.textContent = t;
  }
}

function line(g, x, y, arr, a, b, col, lw) {
  g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
  for (let i = a; i <= b; i++) { const px = x(i), py = y(arr[i]); i === a ? g.moveTo(px, py) : g.lineTo(px, py); }
  g.stroke();
}
function tri(g, cx, cy, r, up, col) {
  g.fillStyle = col; g.beginPath();
  if (up) { g.moveTo(cx, cy - r); g.lineTo(cx - r, cy + r); g.lineTo(cx + r, cy + r); }
  else { g.moveTo(cx, cy + r); g.lineTo(cx - r, cy - r); g.lineTo(cx + r, cy - r); }
  g.closePath(); g.fill();
}
function diamond(g, cx, cy, r, col) {
  g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath();
  g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy);
  g.closePath(); g.stroke();
}
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}
function axisLbl(b) {
  if (!b.ds) return '';
  return b.ds.length > 10 ? b.ds.slice(5) : b.ds.slice(2); // 分钟线显示 MM-DD HH:MM，日线显示 YY-MM-DD
}
