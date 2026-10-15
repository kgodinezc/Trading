// Persistencia local (localStorage): cuentas con sus operaciones, bitácora y notas por operación.
// Los datos nunca salen del navegador. Recibe el almacén como parámetro para poder probarlo.

const KEY = 'trading-journal.v1';

export const emptyState = () => ({
  version: 1,
  accounts: {},        // número de cuenta -> { account, trades: {id: trade}, balanceOps: {id: op}, reported }
  journals: {},        // cuenta -> { 'YYYY-MM-DD' -> entrada de bitácora }
  tradeNotes: {},      // 'cuenta:id' -> { tags: [], note }
  entryNotes: {},      // 'cuenta:id de la primera operación cerrada de la entrada' -> { tags: [], note }
  settings: { unit: 'usd', active: null },
});

// Migraciones de datos guardados:
// 1) la bitácora era un solo diario global; ahora hay uno por cuenta (la antigua pasa a la cuenta activa/primera);
// 2) el estado emocional y la lección se quitaron: lo ya escrito se conserva dentro de "Qué debo mejorar".
const mergeLegacyFields = (j) => {
  if (!j || (!j.mood && !j.lesson)) { if (j) { delete j.mood; delete j.lesson; } return; }
  const extra = [j.lesson && `Lección: ${j.lesson}`, j.mood && `Ánimo: ${j.mood}`].filter(Boolean).join('\n');
  j.improve = [j.improve, extra].filter((x) => x && String(x).trim()).join('\n');
  delete j.mood; delete j.lesson;
};

export function migrateJournal(state) {
  state.journals = state.journals || {};
  const legacy = state.journal;
  if (legacy && typeof legacy === 'object') {
    const target = (state.accounts && state.accounts[state.settings?.active] ? state.settings.active : null) || Object.keys(state.accounts || {})[0] || null;
    if (!Object.keys(legacy).length) delete state.journal;
    else if (target) { state.journals[target] = { ...legacy, ...(state.journals[target] || {}) }; delete state.journal; }
  }
  for (const days of [...Object.values(state.journals), ...(state.journal ? [state.journal] : [])]) for (const j of Object.values(days)) mergeLegacyFields(j);
  return state;
}

export function load(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return emptyState();
    return migrateJournal({ ...emptyState(), ...JSON.parse(raw) });
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
  migrateJournal(state);
  return { account: num, added, updated, total: Object.keys(acc.trades).length };
}

export const accountTrades = (state, num) => Object.values(state.accounts[num]?.trades || {});
export const accountOps = (state, num) => Object.values(state.accounts[num]?.balanceOps || {});
export const noteKey = (num, id) => `${num}:${id}`;

export function exportBackup(state) { return JSON.stringify(state); }

export function importBackup(state, json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || !data.accounts) throw new Error('El archivo no es un respaldo válido de esta aplicación.');
  const base = migrateJournal({ ...emptyState(), ...data });
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, base);
  return state;
}
