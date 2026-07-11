// MACD（第24课辅助判断用，标准 12/26/9，柱体按国内惯例 2*(DIF-DEA)）

export function computeMACD(closes, fast = 12, slow = 26, signal = 9) {
  const ef = ema(closes, fast), es = ema(closes, slow);
  const dif = closes.map((_, i) => ef[i] - es[i]);
  const dea = ema(dif, signal);
  const hist = dif.map((d, i) => 2 * (d - dea[i]));
  return { dif, dea, hist };
}

function ema(arr, p) {
  const k = 2 / (p + 1), out = new Array(arr.length);
  let e = arr[0];
  for (let i = 0; i < arr.length; i++) { e = i ? arr[i] * k + e * (1 - k) : arr[0]; out[i] = e; }
  return out;
}
