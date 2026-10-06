// Parser del "Trade History Report" de MetaTrader 5 / Exness (.xlsx).
// Recibe las filas de la hoja como matriz (XLSX.utils.sheet_to_json con header:1) y no toca el DOM.

const SECTIONS = ['Positions', 'Orders', 'Deals', 'Results'];

export function parseTime(s) {
  const m = /^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s ?? '').trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}` : null;
}

// Milisegundos "ingenuos" (hora del servidor tomada como UTC) para poder restar y agrupar sin zonas horarias.
export const toMs = (iso) => Date.parse(iso + 'Z');

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const blank = (r) => !r || r.every((c) => c === null || c === undefined || c === '');

function headerMap(row) {
  const seen = {};
  const map = {};
  row.forEach((h, i) => {
    if (h === null || h === undefined || h === '') return;
    const k = String(h).trim();
    seen[k] = (seen[k] || 0) + 1;
    map[seen[k] > 1 ? `${k}#${seen[k]}` : k] = i;
  });
  return map;
}

function findSection(rows, name) {
  const i = rows.findIndex((r) => r && String(r[0] ?? '').trim() === name && r.slice(1).every((c) => c == null));
  if (i < 0) return null;
  const header = headerMap(rows[i + 1] || []);
  const body = [];
  for (let j = i + 2; j < rows.length; j++) {
    const r = rows[j];
    if (blank(r) || (r[0] == null) || SECTIONS.includes(String(r[0]).trim())) break;
    body.push(r);
  }
  return { header, body };
}

function parseAccount(rows) {
  const get = (label) => {
    const r = rows.find((x) => x && String(x[0] ?? '').trim() === label);
    return r ? r.slice(1).find((c) => c != null && c !== '') ?? null : null;
  };
  const acc = String(get('Account:') ?? '');
  const m = /^(\d+)\s*\(([^)]*)\)/.exec(acc);
  const parts = m ? m[2].split(',').map((s) => s.trim()) : [];
  const currency = parts[0] || 'USD';
  return {
    number: m ? m[1] : acc || 'desconocida',
    currency,
    server: parts[1] || '',
    mode: parts[2] || '',
    hedge: /hedge/i.test(acc),
    name: get('Name:') || '',
    company: get('Company:') || '',
    reportDate: parseTime(get('Date:')),
    // Las cuentas "cent" (USC) reportan en centavos de dólar.
    isCent: /^[A-Z]{2}C$/.test(currency),
  };
}

function parseResults(rows) {
  const i = rows.findIndex((r) => r && String(r[0] ?? '').trim() === 'Results');
  if (i < 0) return {};
  const out = {};
  for (let j = i + 1; j < rows.length; j++) {
    const r = rows[j] || [];
    for (let c = 0; c < r.length - 1; c++) {
      if (typeof r[c] === 'string' && r[c].trim().endsWith(':')) {
        const v = r.slice(c + 1).find((x) => x !== null && x !== undefined && x !== '');
        if (v !== undefined) out[r[c].trim().slice(0, -1)] = v;
      }
    }
  }
  return out;
}

export function parseExnessReport(rows) {
  const warnings = [];
  const account = parseAccount(rows);
  const pos = findSection(rows, 'Positions');
  if (!pos || pos.header.Position === undefined) {
    throw new Error('No encontré la sección "Positions". ¿Es el "Trade History Report" de MetaTrader 5/Exness?');
  }
  const ord = findSection(rows, 'Orders');
  const dea = findSection(rows, 'Deals');

  // Órdenes: sirven para saber si la entrada fue a mercado o con orden pendiente.
  const orders = new Map();
  if (ord) {
    for (const r of ord.body) {
      const id = num(r[ord.header.Order]);
      if (id != null) orders.set(id, String(r[ord.header.Type] ?? '').toLowerCase());
    }
  }

  // Deals: aportan depósitos/retiros y la razón de cierre (comentario [sl ...] / [tp ...]).
  const balanceOps = [];
  const exitHints = new Map();
  if (dea) {
    const h = dea.header;
    for (const r of dea.body) {
      const type = String(r[h.Type] ?? '').toLowerCase();
      const time = parseTime(r[h.Time]);
      if (type === 'balance' || type === 'credit' || type === 'bonus' || type === 'correction' || type === 'charge') {
        balanceOps.push({
          time, type, amount: num(r[h.Profit]) ?? 0, balance: num(r[h.Balance]),
          comment: r[h.Comment] || '', id: num(r[h.Deal]),
        });
      } else if (String(r[h.Direction] ?? '').toLowerCase().startsWith('out')) {
        const key = `${time}|${num(r[h.Profit])}|${num(r[h.Volume])}`;
        const c = String(r[h.Comment] ?? '');
        const reason = /\[sl/i.test(c) ? 'sl' : /\[tp/i.test(c) ? 'tp' : /\bso\b|stop out/i.test(c) ? 'stopout' : 'manual';
        (exitHints.get(key) || exitHints.set(key, []).get(key)).push(reason);
      }
    }
  }

  const h = pos.header;
  const t2 = h['Time#2'], p2 = h['Price#2'];
  const trades = [];
  for (const r of pos.body) {
    const openTime = parseTime(r[h.Time]);
    const closeTime = parseTime(r[t2]);
    const id = num(r[h.Position]);
    if (!openTime || !closeTime || id == null) { warnings.push(`Fila ignorada (datos incompletos): posición ${r[h.Position]}`); continue; }
    const side = String(r[h.Type]).toLowerCase();
    if (side !== 'buy' && side !== 'sell') { warnings.push(`Tipo desconocido "${side}" en la posición ${id}`); continue; }
    const volume = num(r[h.Volume]);
    const profit = num(r[h.Profit]) ?? 0;
    const commission = num(r[h.Commission]) ?? 0;
    const swap = num(r[h.Swap]) ?? 0;
    const openPrice = num(r[h.Price]);
    const closePrice = num(r[p2]);
    const hints = exitHints.get(`${closeTime}|${profit}|${volume}`);
    const exitReason = hints && hints.length ? hints.shift() : null;
    const oType = orders.get(id) || '';
    trades.push({
      id, symbol: String(r[h.Symbol] ?? ''), side, volume,
      openTime, closeTime, openPrice, closePrice,
      sl: num(r[h['S / L']]), tp: num(r[h['T / P']]),
      commission, swap, profit, net: profit + commission + swap,
      entryType: oType ? (oType.includes('limit') ? 'limit' : oType.includes('stop') ? 'stop' : 'market') : null,
      exitReason,
      durationSec: Math.max(0, Math.round((toMs(closeTime) - toMs(openTime)) / 1000)),
      move: openPrice != null && closePrice != null ? (side === 'buy' ? closePrice - openPrice : openPrice - closePrice) : null,
    });
  }
  trades.sort((a, b) => a.closeTime.localeCompare(b.closeTime) || a.id - b.id);

  const reported = parseResults(rows);
  const sumNet = trades.reduce((s, t) => s + t.net, 0);
  if (reported['Total Net Profit'] != null && Math.abs(reported['Total Net Profit'] - sumNet) > 0.5) {
    warnings.push(`El beneficio neto calculado (${sumNet.toFixed(2)}) difiere del reportado por MT5 (${reported['Total Net Profit']}). Revisa que el reporte esté completo.`);
  }
  return { account, trades, balanceOps, reported, warnings };
}
