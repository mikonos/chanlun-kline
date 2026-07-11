// 扩展后台：点击工具栏图标 → 从当前标签页 URL 识别股票代码 → 打开缠论看图并直达该股。
// 识别规则在 js/stockurl.js（雪球/东方财富/股吧/新浪财经/腾讯自选股/同花顺 + sh/sz 兜底）。
import { extractStockCode } from './js/stockurl.js';

chrome.action.onClicked.addListener(tab => {
  const code = extractStockCode(tab && tab.url);
  const page = chrome.runtime.getURL('index.html') + (code ? `?code=${code}` : '');
  chrome.tabs.create({ url: page });
});
