// 扩展后台：点击工具栏图标 → 从当前标签页 URL（其次页面标题）识别股票代码 → 打开缠论看图直达该股。
// 识别规则在 js/stockurl.js（雪球/东方财富/股吧/新浪财经/腾讯自选股/同花顺/百度股市通 + sh/sz 兜底 + 标题兜底）。
import { extractStockCode, extractFromTitle } from './js/stockurl.js';

chrome.action.onClicked.addListener(tab => {
  const code = extractStockCode(tab && tab.url) || extractFromTitle(tab && tab.title);
  const page = chrome.runtime.getURL('index.html') + (code ? `?code=${code}&src=ext` : '?src=ext');
  chrome.tabs.create({ url: page });
});
