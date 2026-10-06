// Estadísticas de trading. Todo se calcula en la unidad de la cuenta (p. ej. centavos en una cuenta USC);
// la conversión para mostrar se hace en la interfaz.
import { toMs } from './parser.js';

const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
const avg = (a, f) => (a.length ? sum(a, f) / a.length : 0);
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const day = (iso) => iso.slice(0, 10);
export const hourOf = (iso) => Number(iso.slice(11, 13));
export const weekdayOf = (iso) => new Date(toMs(iso)).getUTCDay(); // 0 = domingo

export function summarize(trades) {
  const wins = trades.filter((t) => t.net > 0);
  const losses = trades.filter((t) => t.net < 0);
  const grossProfit = sum(wins, (t) => t.net);
  const grossLoss = sum(losses, (t) => t.net);
  const n = trades.length;
  const avgWin = avg(wins, (t) => t.net);
  const avgLoss = avg(losses, (t) => t.net);
  const payoff = avgLoss ? avgWin / Math.abs(avgLoss) : null;
  return {
    n, wins: wins.length, losses: losses.length, breakeven: n - wins.length - losses.length,
    net: grossProfit + grossLoss, grossProfit, grossLoss,
    winRate: n ? wins.length / n : 0,
    profitFactor: grossLoss ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : 0,
    avgWin, avgLoss, payoff,
    expectancy: n ? (grossProfit + grossLoss) / n : 0,
    // % de aciertos mínimo para no perder dinero con el ratio ganancia/pérdida actual
    breakevenWinRate: payoff ? 1 / (1 + payoff) : null,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.net)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.net)) : 0,
    avgDurationSec: avg(trades, (t) => t.durationSec),
    avgDurationWinSec: avg(wins, (t) => t.durationSec),
    avgDurationLossSec: avg(losses, (t) => t.durationSec),
    volume: sum(trades, (t) => t.volume),
    commission: sum(trades, (t) => t.commission),
    swap: sum(trades, (t) => t.swap),
  };
}

export function groupBy(trades, keyFn) {
  const m = new Map();
  for (const t of trades) {
    const k = keyFn(t);
    if (k === null || k === undefined) continue;
    (m.get(k) || m.set(k, []).get(k)).push(t);
  }
  return [...m.entries()].map(([key, ts]) => ({ key, ...summarize(ts) }));
}

export function streaks(trades) {
  let w = 0, l = 0, wSum = 0, lSum = 0;
  let maxW = { count: 0, sum: 0 }, maxL = { count: 0, sum: 0 };
  let curW = { count: 0, sum: 0 }, curL = { count: 0, sum: 0 };
  for (const t of trades) {
    if (t.net > 0) { w++; wSum += t.net; l = 0; lSum = 0; }
    else if (t.net < 0) { l++; lSum += t.net; w = 0; wSum = 0; }
    else { w = l = 0; wSum = lSum = 0; }
    if (w > maxW.count) maxW = { count: w, sum: wSum };
    if (l > maxL.count) maxL = { count: l, sum: lSum };
    curW = { count: w, sum: wSum }; curL = { count: l, sum: lSum };
  }
  return { maxWins: maxW, maxLosses: maxL, current: curW.count ? { type: 'win', ...curW } : curL.count ? { type: 'loss', ...curL } : null };
}

// Curva de balance con depósitos/retiros y drawdown máximo sobre el balance.
export function equityCurve(trades, balanceOps) {
  const events = [
    ...balanceOps.map((b) => ({ t: b.time, d: b.amount, flow: true })),
    ...trades.map((x) => ({ t: x.closeTime, d: x.net, flow: false })),
  ].sort((a, b) => a.t.localeCompare(b.t) || (b.flow - a.flow));
  let bal = 0, peak = 0, maxDD = 0, maxDDPct = 0, deposits = 0, ddStart = null, ddWorstStart = null, ddWorstEnd = null;
  const points = [];
  for (const e of events) {
    bal += e.d;
    if (e.flow) deposits += e.d;
    if (bal >= peak) { peak = bal; ddStart = e.t; }
    const dd = peak - bal;
    if (dd > maxDD) { maxDD = dd; maxDDPct = peak > 0 ? dd / peak : 0; ddWorstStart = ddStart; ddWorstEnd = e.t; }
    points.push({ t: e.t, balance: bal, flow: e.flow });
  }
  return { points, balance: bal, deposits, maxDD, maxDDPct, ddWorstStart, ddWorstEnd, peak };
}

export function dailyTable(trades) {
  const g = groupBy(trades, (t) => day(t.closeTime)).sort((a, b) => a.key.localeCompare(b.key));
  return g;
}

// Máximo de posiciones abiertas a la vez (y por día), útil para detectar promediar/grids.
export function concurrency(trades) {
  const ev = [];
  for (const t of trades) { ev.push([toMs(t.openTime), 1, t]); ev.push([toMs(t.closeTime), -1, t]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, max = 0;
  const byTrade = new Map();
  const open = new Set();
  for (const [, d, t] of ev) {
    if (d === 1) { open.add(t); cur++; for (const o of open) byTrade.set(o, Math.max(byTrade.get(o) || 0, cur)); }
    else { open.delete(t); cur--; }
    max = Math.max(max, cur);
  }
  return { max, byTrade };
}

export const DURATION_BUCKETS = [
  ['< 1 min', 60], ['1-5 min', 300], ['5-15 min', 900], ['15-60 min', 3600], ['1-4 h', 14400], ['> 4 h', Infinity],
];
export const durationBucket = (sec) => DURATION_BUCKETS.find(([, max]) => sec < max)[0];

export function computeStats(trades, balanceOps = []) {
  const sorted = [...trades].sort((a, b) => a.closeTime.localeCompare(b.closeTime));
  const equity = equityCurve(sorted, balanceOps);
  const daily = dailyTable(sorted);
  const conc = concurrency(sorted);
  const byHour = groupBy(sorted, (t) => hourOf(t.openTime)).sort((a, b) => a.key - b.key);
  const byWeekday = groupBy(sorted, (t) => weekdayOf(t.openTime)).sort((a, b) => a.key - b.key);
  const bySide = groupBy(sorted, (t) => t.side);
  const byVolume = groupBy(sorted, (t) => t.volume).sort((a, b) => a.key - b.key);
  const byDuration = DURATION_BUCKETS.map(([k]) => groupBy(sorted, (t) => durationBucket(t.durationSec)).find((g) => g.key === k) || { key: k, n: 0, net: 0, winRate: 0 });
  const byEntry = groupBy(sorted, (t) => t.entryType);
  const byExit = groupBy(sorted, (t) => t.exitReason);
  const bySL = groupBy(sorted, (t) => (t.sl ? 'con SL' : 'sin SL'));
  const bySymbol = groupBy(sorted, (t) => t.symbol).sort((a, b) => b.n - a.n);
  const byMonth = groupBy(sorted, (t) => t.closeTime.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key));
  return {
    all: summarize(sorted), equity, daily, streaks: streaks(sorted),
    byHour, byWeekday, bySide, byVolume, byDuration, byEntry, byExit, bySL, bySymbol, byMonth,
    maxConcurrent: conc.max, concurrentByTrade: conc.byTrade,
    tradingDays: daily.length,
    medianDurationSec: median(sorted.map((t) => t.durationSec)),
  };
}
