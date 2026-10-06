import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExnessReport, parseTime } from '../app/js/core/parser.js';
import { computeStats, summarize, streaks } from '../app/js/core/stats.js';
import { buildInsights } from '../app/js/core/insights.js';
import { emptyState, mergeReport, accountTrades, load, save, importBackup, exportBackup } from '../app/js/core/store.js';

// Reporte sintético con la misma estructura que el "Trade History Report" de Exness/MT5.
const N = null;
function fakeReport() {
  const pos = [
    ['2026.09.01 10:00:00', 1001, 'XAUUSDc', 'buy', '0.1', 100, N, 110, '2026.09.01 10:10:00', 105, 0, 0, 50, N, N],
    ['2026.09.01 10:05:00', 1002, 'XAUUSDc', 'sell', '0.2', 100, 105, N, '2026.09.01 10:30:00', 104, 0, 0, -80, N, N],
    ['2026.09.02 14:00:00', 1003, 'XAUUSDc', 'buy', '0.1', 100, N, N, '2026.09.02 14:02:00', 101, -1, -0.5, 10, N, N],
  ];
  return [
    ['Trade History Report', ...Array(14).fill(N)],
    ['Name:', N, N, 'Standard Cent', ...Array(11).fill(N)],
    ['Account:', N, N, '999 (USC, Exness-MT5Real22, real, Hedge)', ...Array(11).fill(N)],
    ['Company:', N, N, 'Exness Technologies Ltd', ...Array(11).fill(N)],
    ['Date:', N, N, '2026.09.03 09:00', ...Array(11).fill(N)],
    ['Positions', ...Array(14).fill(N)],
    ['Time', 'Position', 'Symbol', 'Type', 'Volume', 'Price', 'S / L', 'T / P', 'Time', 'Price', 'Commission', 'Swap', 'Profit', N, N],
    ...pos,
    [N, N, N, N, N, N, N, N, N, N, 0, 0, -20, N, N],
    ['Orders', ...Array(14).fill(N)],
    ['Open Time', 'Order', 'Symbol', 'Type', 'Volume', 'Price', 'S / L', 'T / P', 'Time', 'State', N, 'Comment', N, N, N],
    ['2026.09.01 10:00:00', 1001, 'XAUUSDc', 'buy', '0.1 / 0.1', 'market', N, N, '2026.09.01 10:00:00', 'filled', N, N, N, N, N],
    ['2026.09.01 10:05:00', 1002, 'XAUUSDc', 'sell limit', '0.2 / 0.2', 100, N, N, '2026.09.01 10:05:00', 'filled', N, N, N, N, N],
    ['Deals', ...Array(14).fill(N)],
    ['Time', 'Deal', 'Symbol', 'Type', 'Direction', 'Volume', 'Price', 'Order', 'Commission', 'Fee', 'Swap', 'Profit', 'Balance', 'Comment', N],
    ['2026.09.01 09:00:00', 1, N, 'balance', N, N, N, N, 0, 0, 0, 1000, 1000, 'D-1', N],
    ['2026.09.01 10:30:00', 2, 'XAUUSDc', 'buy', 'out', '0.2', 104, 9, 0, 0, 0, -80, 920, '[sl 105]', N],
    [N, N, N, N, N, N, N, N, 0, 0, 0, 920, 920, N, N],
    ['Results', ...Array(14).fill(N)],
    ['Total Net Profit:', N, N, -21.5, 'Gross Profit:', N, N, 60, 'Gross Loss:', N, N, -80, N, N, N],
  ];
}

test('parseTime normaliza fechas de MT5', () => {
  assert.equal(parseTime('2026.09.16 22:13:40'), '2026-09-16T22:13:40');
  assert.equal(parseTime('2026.10.06 09:49'), '2026-10-06T09:49:00');
  assert.equal(parseTime('nada'), null);
});

test('parseExnessReport lee cuenta, operaciones, depósitos y razón de cierre', () => {
  const r = parseExnessReport(fakeReport());
  assert.equal(r.account.number, '999');
  assert.equal(r.account.currency, 'USC');
  assert.equal(r.account.isCent, true);
  assert.equal(r.trades.length, 3);
  assert.equal(r.balanceOps.length, 1);
  assert.equal(r.balanceOps[0].amount, 1000);
  const t1 = r.trades.find((t) => t.id === 1001), t2 = r.trades.find((t) => t.id === 1002), t3 = r.trades.find((t) => t.id === 1003);
  assert.equal(t1.volume, 0.1);
  assert.equal(t1.entryType, 'market');
  assert.equal(t2.entryType, 'limit');
  assert.equal(t2.exitReason, 'sl');
  assert.equal(t1.durationSec, 600);
  assert.equal(t2.move, -4);
  assert.equal(t3.net, 8.5);
  assert.deepEqual(r.warnings, []);
});

test('parseExnessReport rechaza archivos que no son del reporte', () => {
  assert.throws(() => parseExnessReport([['a', 'b'], [1, 2]]), /Positions/);
});

test('summarize calcula métricas básicas', () => {
  const s = summarize([{ net: 50, durationSec: 60 }, { net: -80, durationSec: 60 }, { net: 10, durationSec: 60 }, { net: 0, durationSec: 60 }]);
  assert.equal(s.n, 4);
  assert.equal(s.wins, 2);
  assert.equal(s.losses, 1);
  assert.equal(s.breakeven, 1);
  assert.equal(s.net, -20);
  assert.equal(s.profitFactor, 0.75);
  assert.equal(s.avgWin, 30);
  assert.equal(s.payoff, 30 / 80);
  assert.ok(Math.abs(s.breakevenWinRate - 1 / (1 + 30 / 80)) < 1e-9);
});

test('streaks cuenta rachas y las suma', () => {
  const st = streaks([5, 5, -1, -2, -3, 4].map((net) => ({ net })));
  assert.deepEqual(st.maxWins, { count: 2, sum: 10 });
  assert.deepEqual(st.maxLosses, { count: 3, sum: -6 });
});

test('computeStats: balance, drawdown y agrupaciones', () => {
  const r = parseExnessReport(fakeReport());
  const st = computeStats(r.trades, r.balanceOps);
  assert.ok(Math.abs(st.equity.balance - 978.5) < 1e-9);
  assert.equal(st.equity.deposits, 1000);
  assert.equal(st.equity.maxDD, 80);
  assert.equal(st.tradingDays, 2);
  assert.equal(st.byHour.find((h) => h.key === 10).n, 2);
  assert.equal(st.maxConcurrent, 2);
  assert.equal(st.bySL.find((g) => g.key === 'con SL').n, 1);
});

test('buildInsights detecta esperanza negativa y falta de SL', () => {
  const trades = [];
  for (let i = 0; i < 40; i++) {
    const win = i % 5 !== 0 ? 1 : 0; // 80% aciertos, pero pérdidas grandes
    const m = String(i % 50).padStart(2, '0');
    trades.push({ id: i, symbol: 'X', side: 'buy', volume: 0.1, openTime: `2026-09-0${1 + (i % 9)}T10:${m}:00`, closeTime: `2026-09-0${1 + (i % 9)}T10:${m}:30`, net: win ? 5 : -50, profit: win ? 5 : -50, commission: 0, swap: 0, durationSec: 30, sl: null, tp: null, entryType: 'market' });
  }
  const st = computeStats(trades, [{ time: '2026-08-31T00:00:00', amount: 1000 }]);
  const ids = buildInsights(trades, st).map((i) => i.id);
  assert.ok(ids.includes('edge'));
  assert.ok(ids.includes('sl'));
});

test('buildInsights no falla sin operaciones', () => {
  assert.deepEqual(buildInsights([], computeStats([], [])), []);
});

test('store: unir reportes no duplica operaciones y el respaldo se restaura', () => {
  const mem = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } };
  const state = emptyState();
  const r = parseExnessReport(fakeReport());
  assert.deepEqual(mergeReport(state, r), { account: '999', added: 3, updated: 0, total: 3 });
  assert.deepEqual(mergeReport(state, r), { account: '999', added: 0, updated: 3, total: 3 });
  assert.equal(accountTrades(state, '999').length, 3);
  state.journal['2026-09-01'] = { lesson: 'x' };
  assert.equal(save(mem, state), true);
  assert.equal(load(mem).journal['2026-09-01'].lesson, 'x');
  const restored = importBackup(emptyState(), exportBackup(state));
  assert.equal(Object.keys(restored.accounts).length, 1);
  assert.throws(() => importBackup(emptyState(), '{"x":1}'), /respaldo/);
});
