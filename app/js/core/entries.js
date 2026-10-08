// Agrupa operaciones en "entradas": una entrada equivale a todas las operaciones (lotes pequeños para
// promediar) cerradas dentro de una ventana de N minutos que arranca con la primera de ellas.
// El "día de trading" se calcula en hora local (el servidor MT5 de Exness va en GMT).
import { toMs } from './parser.js';

export const DEFAULTS = { windowMin: 30, tzOffset: -6 };

const isoFromMs = (ms) => new Date(ms).toISOString().slice(0, 19);

// Hora del servidor -> hora local (ISO sin zona).
export const toLocal = (iso, tzOffset = DEFAULTS.tzOffset) => isoFromMs(toMs(iso) + tzOffset * 3600e3);
export const localDay = (iso, tzOffset = DEFAULTS.tzOffset) => toLocal(iso, tzOffset).slice(0, 10);

export function groupEntries(trades, { windowMin = DEFAULTS.windowMin, tzOffset = DEFAULTS.tzOffset } = {}) {
  const sorted = [...trades].sort((a, b) => a.closeTime.localeCompare(b.closeTime) || a.id - b.id);
  const entries = [];
  let cur = null;
  for (const t of sorted) {
    const day = localDay(t.closeTime, tzOffset);
    const ms = toMs(t.closeTime);
    if (!cur || cur.day !== day || ms - cur.startMs >= windowMin * 60e3) {
      cur = { id: String(t.id), day, startMs: ms, trades: [] };
      entries.push(cur);
    }
    cur.trades.push(t);
  }
  const perDay = {};
  return entries.map((e) => {
    const n = (perDay[e.day] = (perDay[e.day] || 0) + 1);
    const ts = e.trades;
    const net = ts.reduce((s, t) => s + t.net, 0);
    const opens = ts.map((t) => t.openTime).sort();
    return {
      id: e.id, day: e.day, index: n, trades: ts, n: ts.length, net,
      volume: ts.reduce((s, t) => s + t.volume, 0),
      buys: ts.filter((t) => t.side === 'buy').length, sells: ts.filter((t) => t.side === 'sell').length,
      wins: ts.filter((t) => t.net > 0).length,
      firstOpen: opens[0], lastClose: ts[ts.length - 1].closeTime, firstClose: ts[0].closeTime,
      durationSec: Math.round((toMs(ts[ts.length - 1].closeTime) - toMs(opens[0])) / 1000),
    };
  });
}

// Alerta "ALTO": dos entradas consecutivas del mismo día con resultado negativo.
export function stopAlert(dayEntries) {
  for (let i = 1; i < dayEntries.length; i++) {
    if (dayEntries[i - 1].net < 0 && dayEntries[i].net < 0) {
      return { active: true, at: dayEntries[i].index, entries: [dayEntries[i - 1].index, dayEntries[i].index], loss: dayEntries[i - 1].net + dayEntries[i].net };
    }
  }
  return { active: false };
}

// Campos que cuentan como "bitácora completa" para poder seguir operando.
export const REQUIRED_JOURNAL = [['followed', 'si seguiste el plan'], ['improve', 'qué debes mejorar']];
export const missingJournal = (j = {}) => REQUIRED_JOURNAL.filter(([k]) => !String(j[k] ?? '').trim()).map(([, label]) => label);

export function dayAlerts(entries) {
  const byDay = new Map();
  for (const e of entries) (byDay.get(e.day) || byDay.set(e.day, []).get(e.day)).push(e);
  const out = new Map();
  for (const [d, list] of byDay) out.set(d, { entries: list, alert: stopAlert(list) });
  return out;
}
