import { genBars, genDemoBars, parseCSV } from './data.js';
import { mergeKlines } from './merge.js';
import { findFractals } from './fractal.js';
import { buildBiPoints, buildBis } from './bi.js';
import { buildSegments } from './segment.js';
import { buildZhongshus, linkZhongshus } from './zhongshu.js';
import { buildLevels } from './recursion.js';
import { computeMACD } from './macd.js';
import { computeSignals } from './signals.js';
import { ChanChart } from './chart.js';
import { fetchQuoteJsonp } from './quotesrc.js';

const $ = id => document.getElementById(id);
const chart = new ChanChart($('main-cv'), $('macd-cv'), $('info'));
const csvFiles = new Map(); // 文件名 → bars；本级别/次级别各导一份即可切换对照

function currentBars() {
  const src = $('src').value;
  if (src.startsWith('csv:')) return csvFiles.get(src.slice(4)) || genDemoBars({ seed: 7 });
  if (src === 'demo') return genDemoBars({ seed: +$('seed').value });
  return genBars({ n: +$('nbars').value, seed: +$('seed').value, style: src });
}

function pipeline(bars, biMode) {
  const merged = mergeKlines(bars);
  const fractals = findFractals(merged);
  const biPts = buildBiPoints(merged, fractals, biMode);
  const strokes = buildBis(merged, biPts);
  const segments = buildSegments(strokes);
  const zsSeg = buildZhongshus(segments);
  const links = linkZhongshus(zsSeg);
  const zsBi = buildZhongshus(strokes);
  const levels = buildLevels(segments); // 级别递归（35课）：levels[0] 即段中枢层
  const macd = computeMACD(bars.map(b => b.c));
  // 信号一律基于线段中枢（63课：线段定义最低级别中枢）
  const signals = computeSignals({ subs: segments, zss: zsSeg, links, macd });
  // 未完成的一笔：最后确认分型之后至当前极值，虚线显示
  let pendingLeg = null;
  const lastPt = biPts[biPts.length - 1];
  if (lastPt) {
    const m0 = merged[lastPt.i];
    let px = lastPt.type === 'top' ? Infinity : -Infinity, pi = -1;
    for (let mi = lastPt.i + 1; mi < merged.length; mi++) {
      const m = merged[mi];
      if (lastPt.type === 'top' ? m.l < px : m.h > px) { px = lastPt.type === 'top' ? m.l : m.h; pi = lastPt.type === 'top' ? m.loIdx : m.hiIdx; }
    }
    if (pi >= 0) pendingLeg = { from: { rawIdx: lastPt.type === 'top' ? m0.hiIdx : m0.loIdx, price: lastPt.price }, to: { rawIdx: pi, price: px } };
  }
  return { bars, merged, fractals, biPts, strokes, pendingLeg, segments, zsSeg, zsBi, levels, links, macd, signals };
}

function recompute() {
  const bars = currentBars();
  const d = pipeline(bars, $('bimode').value);
  chart.setData(d);
  const nsig = d.signals.filter(s => s.kind !== 'PBC').length;
  const lvTxt = d.levels.map((l, k) => `L${k + 1}:${l.zss.length}枢${l.trends.length}型`).join(' ');
  $('stats').textContent =
    `K线 ${bars.length} ｜ 合并后 ${d.merged.length} ｜ 分型 ${d.fractals.length} ｜ 笔 ${d.strokes.length}` +
    ` ｜ 线段 ${d.segments.length} ｜ 段中枢 ${d.zsSeg.length} ｜ 买卖点 ${nsig} ｜ 盘整背驰 ${d.signals.length - nsig}` +
    (lvTxt ? ` ｜ 递归 ${lvTxt}` : '');
}

function readShow() {
  chart.setShow({
    merged: $('sw-merged').checked, fractal: $('sw-fx').checked, bi: $('sw-bi').checked,
    seg: $('sw-seg').checked, zsSeg: $('sw-zs').checked, zsBi: $('sw-zsbi').checked,
    signals: $('sw-sig').checked, bands: $('sw-band').checked, lv: $('sw-lv').checked,
  });
}

['src', 'nbars', 'seed', 'bimode'].forEach(id => $(id).addEventListener('change', recompute));
['sw-merged', 'sw-fx', 'sw-bi', 'sw-seg', 'sw-zs', 'sw-zsbi', 'sw-sig', 'sw-band', 'sw-lv'].forEach(id => $(id).addEventListener('change', readShow));
$('regen').addEventListener('click', () => { $('seed').value = String(1 + Math.floor(Math.random() * 99999)); recompute(); });
function rebuildCsvOptions() {
  const sel = $('src');
  [...sel.querySelectorAll('option[data-csv]')].forEach(o => o.remove());
  for (const name of csvFiles.keys()) {
    const o = document.createElement('option');
    o.value = 'csv:' + name;
    o.textContent = '📄 ' + name;
    o.dataset.csv = '1';
    sel.appendChild(o);
  }
}

$('csv').addEventListener('change', async e => {
  let lastName = null;
  for (const f of e.target.files) {
    try {
      csvFiles.set(f.name, parseCSV(await f.text()));
      lastName = f.name;
    } catch (err) { alert(f.name + ' 解析失败：' + err.message); }
  }
  if (!lastName) return;
  rebuildCsvOptions();
  $('src').value = 'csv:' + lastName;
  recompute();
});

// ---- 在线拉取行情（serve.py 代理：日线=腾讯前复权，分钟=新浪不复权）----
function normCode(raw) {
  const s = raw.trim().toLowerCase();
  if (/^(sh|sz)\d{6}$/.test(s)) return s;
  if (/^\d{6}$/.test(s)) return (s[0] === '6' ? 'sh' : 'sz') + s; // 6开头判沪、其余判深；指数请带前缀
  return null;
}
const PERIOD_NAME = { month: '月线', week: '周线', day: '日线', m60: '60分', m30: '30分', m15: '15分', m5: '5分' };

async function fetchQuote() {
  const code = normCode($('quote-code').value);
  if (!code) { alert('代码格式：6位数字（自动判沪深），指数请带前缀如 sh000001'); return; }
  const period = $('quote-period').value;
  const btn = $('quote-go');
  btn.disabled = true; btn.textContent = '拉取中…';
  try {
    const n = period.startsWith('m') && period !== 'month' ? 1023 : period === 'day' ? 800 : 2000;
    let d;
    try {
      d = await api(`api/quote?code=${code}&period=${period}&n=${n}`);
    } catch (e) {
      if (e.message !== '服务接口不可用') throw e;
      d = await fetchQuoteJsonp(code, period, n); // 纯静态部署：JSONP 直连行情源，零后端
    }
    const csv = 'date,open,high,low,close,volume\n' + d.rows.map(r => r.join(',')).join('\n');
    const name = `${d.name || code}(${code})·${PERIOD_NAME[period]}`;
    csvFiles.set(name, parseCSV(csv));
    rebuildCsvOptions();
    $('src').value = 'csv:' + name;
    recompute();
  } catch (e) { alert('拉取失败：' + e.message); }
  btn.disabled = false; btn.textContent = '看图';
}
$('quote-go').addEventListener('click', fetchQuote);
$('quote-code').addEventListener('keydown', e => { if (e.key === 'Enter') fetchQuote(); });

// ---- 历史分析：双模式存储 ----
// 本地 serve.py：落盘项目 history/ 文件夹（一快照一 JSON 文件）；
// 公网静态部署（GitHub/Cloudflare Pages）：无落盘接口，自动降级为访客浏览器 localStorage。
async function api(path, opts = {}) {
  let r;
  try { r = await fetch(path, opts); }
  catch { throw new Error('服务接口不可用'); }
  const d = await r.json().catch(() => ({}));
  // 静态部署下 api 路径返回 404 HTML（无 d.error）→ 视为「无服务接口」；HTTP/2 的 statusText 常为空串
  if (!r.ok) throw new Error(d.error || (r.status === 404 ? '服务接口不可用' : `HTTP ${r.status} ${r.statusText}`.trim()));
  return d;
}

const LS_KEY = 'chanlun_history_v1';
let histApi = null; // null=未探测 true=落盘接口 false=localStorage
async function histBackend() {
  if (histApi === null) {
    try { await api('api/history'); histApi = true; } catch { histApi = false; }
  }
  return histApi;
}
const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const lsWrite = arr => localStorage.setItem(LS_KEY, JSON.stringify(arr));

async function histList() {
  if (await histBackend()) return api('api/history');
  return lsRead().map(h => ({ file: h.id, ts: h.ts, title: h.title, note: h.note, summary: h.summary, biMode: h.biMode }));
}
async function histGet(key) {
  if (await histBackend()) return api('api/history/' + encodeURIComponent(key));
  const h = lsRead().find(x => x.id === key);
  if (!h) throw new Error('记录不存在');
  return h;
}
async function histPut(snap) {
  if (await histBackend()) return api('api/history', { method: 'POST', body: JSON.stringify(snap) });
  const arr = lsRead();
  arr.unshift(snap);
  while (arr.length > 30) arr.pop();
  try { lsWrite(arr); } catch (e) { throw new Error('浏览器存储已满，请删除旧记录：' + e.message); }
}
async function histDel(key) {
  if (await histBackend()) return api('api/history/' + encodeURIComponent(key), { method: 'DELETE' });
  lsWrite(lsRead().filter(x => x.id !== key));
}

// 早期版本快照存浏览器 localStorage——本地落盘接口可用时一次性迁移成文件后清空
async function migrateLocalHist() {
  const old = lsRead();
  if (!old.length) return;
  try {
    if (!(await histBackend())) return; // 静态部署：localStorage 即正式存储，不迁移
    for (const h of old.reverse()) await api('api/history', { method: 'POST', body: JSON.stringify(h) });
    localStorage.removeItem(LS_KEY);
  } catch { /* 接口中途失败时保留原数据，下次启动再试 */ }
}

function srcTitle() {
  const src = $('src').value;
  const base = src.startsWith('csv:') ? src.slice(4)
    : `${$('src').selectedOptions[0].textContent}·种子${$('seed').value}`;
  return `${base} · ${$('bimode').value === 'strict' ? '严格笔' : '宽松笔'}`;
}

async function renderHist() {
  const list = $('hist-list');
  list.innerHTML = '';
  let items;
  try { items = await histList(); }
  catch (e) { $('hist-count').textContent = e.message; return; }
  const where = histApi ? '存于项目 history/ 文件夹' : '存于本浏览器（静态部署无落盘服务）';
  $('hist-count').textContent = items.length ? `${items.length} 份 · ${where}` : `暂无保存（${where}）`;
  const mkBtn = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => fn().catch(err => alert(err.message)));
    return b;
  };
  for (const h of items) {
    const row = document.createElement('div');
    row.className = 'hist-item';
    const main = document.createElement('div');
    main.className = 'hi-main';
    const t = document.createElement('div');
    t.className = 'hi-title';
    t.textContent = `${h.title}（${h.ts || ''}）`;
    const meta = document.createElement('div');
    meta.className = 'hi-meta';
    meta.textContent = `${h.summary || ''}${histApi ? '　· history/' + h.file : ''}`;
    main.append(t, meta);
    if (h.note) {
      const n = document.createElement('div');
      n.className = 'hi-note';
      n.textContent = '📝 ' + h.note;
      main.append(n);
    }
    const ops = document.createElement('div');
    ops.className = 'hi-ops';
    ops.append(
      mkBtn('载入', async () => {
        loadSnapshot(await histGet(h.file));
      }),
      mkBtn('删', async () => {
        const what = histApi ? `文件 history/${h.file}` : '本浏览器中的该记录';
        if (!confirm(`删除「${h.title}（${h.ts || ''}）」？将删除${what}，不可恢复。`)) return;
        await histDel(h.file);
        await renderHist();
      }),
    );
    row.append(main, ops);
    list.append(row);
  }
}

$('hist-btn').addEventListener('click', () => {
  const p = $('hist-panel');
  p.hidden = !p.hidden;
  if (!p.hidden) renderHist();
});

$('hist-save').addEventListener('click', async () => {
  const bars = currentBars();
  const d = pipeline(bars, $('bimode').value);
  const sigTxt = d.signals.map(s => `${s.kind}@${s.price.toFixed(2)}`).join(' ') || '无信号';
  const snap = {
    id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toLocaleString('zh-CN', { hour12: false }),
    title: srcTitle(),
    note: $('hist-note').value.trim(),
    biMode: $('bimode').value,
    summary: `${bars.length}K（${bars[0].ds}~${bars[bars.length - 1].ds}）｜ ${d.strokes.length}笔 ${d.segments.length}段 ${d.zsSeg.length}枢 ｜ ${sigTxt}`,
    bars,
  };
  try {
    await histPut(snap);
    $('hist-note').value = '';
    await renderHist();
  } catch (e) { alert('保存失败：' + e.message); }
});

function loadSnapshot(h) {
  const name = `历史·${h.title}（${h.ts || ''}）`;
  csvFiles.set(name, h.bars);
  rebuildCsvOptions();
  $('bimode').value = h.biMode || 'strict';
  $('src').value = 'csv:' + name;
  recompute();
  $('hist-panel').hidden = true;
}

$('hist-import').addEventListener('change', async e => {
  for (const f of e.target.files) {
    try {
      const h = JSON.parse(await f.text());
      if (!Array.isArray(h.bars) || !h.title) throw new Error('缺少 bars/title 字段');
      await histPut(h);
    } catch (err) { alert(f.name + ' 导入失败：' + err.message); }
  }
  e.target.value = '';
  await renderHist();
});

readShow();
recompute();
migrateLocalHist();
