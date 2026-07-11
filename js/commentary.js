// 缠师点评：从管线结构确定性生成——每句话都可回溯到当前图的段/中枢/信号/递归数据，
// 不做任何数据之外的断言；措辞按缠师口径，引文均已对108课语料逐字核对（规格 §12）。

const SIG_NAME = {
  B1: '第一类买点', B2: '第二类买点', B3: '第三类买点',
  S1: '第一类卖点', S2: '第二类卖点', S3: '第三类卖点',
};
const SIG_RULE = {
  B1: '下跌趋势的背驰点——「没有趋势，没有背驰」的正用（15课）',
  B2: '第一类买点后，次级别回抽不创新低（53课）',
  B3: '向上离开中枢后，回抽不跌破ZG（20课）',
  S1: '上涨趋势的背驰点——趋势力度衰竭处（15/24课）',
  S2: '第一类卖点后，次级别反弹不创新高（53课）',
  S3: '向下离开中枢后，回抽不升破ZD（20课）',
};
// 金句池（逐字，出处课号）；按数据指纹确定性轮换，同一张图永远给同一句
const MOTTOS = [
  ['市场无须分析，只要看和干', '5课'],
  ['走势终完美', '17课'],
  ['没有趋势，没有背驰', '15课'],
  ['三类买卖点，都不能偏废，不能说哪一个更重要，站在同一级别上，三者都重要', '53课'],
  ['市场没有同情、不信眼泪', '80课'],
  ['当下性，其实就是本ID的客观性', '65课'],
];

export function buildCommentary(d) {
  const { bars, strokes, segments, zsSeg, levels, links, signals } = d;
  const out = [];
  if (!bars.length) return out;
  const c = bars[bars.length - 1].c;
  const f = x => (x >= 100 ? x.toFixed(1) : x.toFixed(2));
  const D = i => (bars[i] && bars[i].ds) || '';

  // ① 格局：本级别走势类型序列（35课递归的 L1 层）
  const trends = (levels[0] && levels[0].trends) || [];
  if (trends.length) {
    const seq = trends.map(t =>
      `${t.kind}${t.zsCount > 1 ? `（${t.zsCount}枢）` : ''}${t.pending ? '…' : ''}`).join(' → ');
    out.push(`格局：${bars.length}根K线分解为${strokes.length}笔、${segments.length}段、${zsSeg.length}个中枢，走势类型序列：${seq}。末端类型未完成——「任何级别的任何走势类型终要完成」（17课），完成之前只有分类，没有断言。`);
  } else if (segments.length) {
    out.push(`格局：${bars.length}根K线分解为${strokes.length}笔、${segments.length}段，尚无三段重叠成枢——本级别连中枢都没有，盘整与趋势的分类无从谈起。没有符合定义的，就是没有（65课）。要更细的结构，换低一级周期的图（显微镜倍数论，53课）。`);
  } else {
    out.push(`本图仅${bars.length}根K线、${strokes.length}笔，不足以构成线段——65课早有交代：「在年线图里，找到分型的机会更小，可能十几年找不到一个也很正常」。换低一级周期再看。`);
    return out;
  }

  // ② 当下段：方向、运行极值（含未成笔的尾巴）、两个剧本（67课两种情况 + 78课回收）
  const last = segments[segments.length - 1];
  if (last && last.pending) {
    const up = last.dir === 'up';
    let runExt = up ? -Infinity : Infinity;
    for (let i = last.startIdx; i < bars.length; i++) {
      runExt = up ? Math.max(runExt, bars[i].h) : Math.min(runExt, bars[i].l);
    }
    const dir = up ? '向上' : '向下', ext = f(runExt), from = f(last.from.price);
    const back = up ? `有效跌破起点${from}，则本段不成立、按78课回收口径前段延续` : `有效升破起点${from}，则本段不成立、按78课回收口径前段延续`;
    out.push(`当下段：${dir}段未完成（${last.count}笔，运行极值${ext}，现价${f(c)}）。终结它需要特征序列分型的确认（67课两种情况），在此之前，${up ? '回落' : '反弹'}都按段内波动分类；${back}。两个剧本都写好应对，就无所谓惊吓。`);
  }

  // ③ 位置：现价与最后中枢的关系（20/53课的三种语境）
  const z = zsSeg[zsSeg.length - 1];
  if (z) {
    const zd = f(z.zd), zg = f(z.zg);
    if (c > z.zg) {
      out.push(`位置：现价${f(c)}在最后中枢[${zd}, ${zg}]上方——离开段语境。次级别回抽不回到${zg}之内，就是第三类买点的标准判据（20课）；跌回中枢之内，则按中枢延伸处理，回到震荡口径。`);
    } else if (c < z.zd) {
      out.push(`位置：现价${f(c)}在最后中枢[${zd}, ${zg}]下方——向下离开段语境。反抽不升破${zd}，就是第三类卖点的标准判据（20课）；收回中枢之内，则按中枢延伸处理。`);
    } else {
      out.push(`位置：现价${f(c)}在中枢[${zd}, ${zg}]之内——中枢震荡。「在第二、三买卖点之间，都是中枢震荡，这时候，是不会有该级别的买卖点的」（53课），不参与是最干脆的做法；要参与，用的也只能是低级别的买卖点。`);
    }
  }

  // ④ 信号：最近一个三类买卖点 + 完备性
  const sigs = signals.filter(s => s.kind !== 'PBC');
  if (sigs.length) {
    const s = sigs[sigs.length - 1];
    const hist = sigs.length > 1 ? `本图共出现${sigs.length}个三类买卖点（${sigs.map(x => x.kind).join('、')}），最近的` : '本级别最近的买卖点';
    out.push(`信号：${hist}是 ${s.kind}·${SIG_NAME[s.kind]} @${f(s.price)}（${D(s.rawIdx)}）——判据：${SIG_RULE[s.kind]}。此后未再出现新的三类买卖点，而「市场必然产生赢利的买卖点，只有第一、二、三类」（21课），三类位置之外的进出，理论上没有依据。`);
  } else {
    out.push(`信号：本级别至今没有出现任何三类买卖点。按买卖点分析的完备性——「市场必然产生赢利的买卖点，只有第一、二、三类」（21课）——当下没有理论支持的进出位置，等待本身就是操作。`);
  }

  // ⑤ 力度：趋势与背驰的资格判定（15课铁律）
  const hasTrend = zsSeg.length >= 2 && (links.includes('up') || links.includes('down'));
  const pbcs = signals.filter(s => s.kind === 'PBC');
  if (hasTrend) {
    const hasS1B1 = sigs.some(s => s.kind === 'B1' || s.kind === 'S1');
    if (!hasS1B1 && !pbcs.length) {
      out.push(`力度：已有依次同向的中枢构成趋势，但离开段未见背驰——背驰未现，趋势按延续处理；要找转折，等MACD辅助判断给出证据（柱子面积与黄白线的对比，24课），不要用感觉替走势发言。`);
    }
  } else if (zsSeg.length === 1) {
    out.push(`力度：只有一个中枢，整段走势仍属「盘整」类型——「没有趋势，没有背驰。在盘整中是无所谓“背驰”的」（15课）。此处只有盘整背驰的推广用法（对围绕中枢的进出力度作比较，27课），没有趋势背驰的一买一卖。`);
  }

  // ⑥ 纪律 + 免责（金句按数据指纹确定性轮换）
  const [motto, cite] = MOTTOS[(bars.length + Math.round(c * 100)) % MOTTOS.length];
  out.push(`纪律：「${motto}」（${cite}）。以上解读由当前图的几何结构自动生成，研究学习用途，不构成投资建议。`);

  return out;
}
