// Persistencia local (localStorage): cuentas con sus operaciones, bitácora y notas por operación.
// Los datos nunca salen del navegador. Recibe el almacén como parámetro para poder probarlo.

const KEY = 'trading-journal.v1';

export const emptyState = () => ({
  version: 1,
  accounts: {},        // número de cuenta -> { account, trades: {id: trade}, balanceOps: {id: op}, reported }
  journal: {},         // 'YYYY-MM-DD' -> entrada de bitácora
  tradeNotes: {},      // 'cuenta:id' -> { tags: [], note }
  entryNotes: {},      // 'cuenta:id de la primera operación cerrada de la entrada' -> { tags: [], note }
  settings: { unit: 'usd', active: null },
});

export function load(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return emptyState();
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch { return emptyState(); }
}

export function save(storage, state) {
  try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

// Une un reporte en el estado; las operaciones se identifican por su número de posición, así que
// subir dos veces el mismo reporte (o reportes que se solapan) no duplica nada.
export function mergeReport(state, report) {
  const num = report.account.number;
  const acc = state.accounts[num] || (state.accounts[num] = { account: report.account, trades: {}, balanceOps: {}, reported: {} });
  let added = 0, updated = 0;
  for (const t of report.trades) {
    if (acc.trades[t.id]) updated++; else added++;
    acc.trades[t.id] = t;
  }
  for (const b of report.balanceOps) acc.balanceOps[b.id ?? `${b.time}|${b.amount}`] = b;
  acc.account = report.account;
  acc.reported = report.reported;
  if (!state.settings.active || !state.accounts[state.settings.active]) state.settings.active = num;
  return { account: num, added, updated, total: Object.keys(acc.trades).length };
}

export const accountTrades = (state, num) => Object.values(state.accounts[num]?.trades || {});
export const accountOps = (state, num) => Object.values(state.accounts[num]?.balanceOps || {});
export const noteKey = (num, id) => `${num}:${id}`;

export function exportBackup(state) { return JSON.stringify(state); }

export function importBackup(state, json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || !data.accounts) throw new Error('El archivo no es un respaldo válido de esta aplicación.');
  const base = { ...emptyState(), ...data };
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, base);
  return state;
}
