import { parseExnessReport, toMs } from './core/parser.js';
import { computeStats, equityCurve, summarize, groupBy, day } from './core/stats.js';
import { buildInsights, fmtDuration, WEEKDAYS } from './core/insights.js';
import * as store from './core/store.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const storage = (() => { try { localStorage.getItem('x'); return localStorage; } catch { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } }; } })();
const state = store.load(storage);
const persist = () => { if (!store.save(storage, state)) toast('⚠️ No se pudo guardar en el navegador (¿almacenamiento lleno o bloqueado?). Exporta un respaldo.'); };

const TAGS = ['Setup válido', 'Sin SL', 'Moví el SL', 'Promedié', 'FOMO', 'Revancha', 'Sobreoperé', 'Noticias', 'Cerré por miedo', 'Fuera de horario'];
const MOODS = [['😄', 'Confiado'], ['😐', 'Neutral'], ['😰', 'Ansioso'], ['😡', 'Frustrado'], ['🥱', 'Cansado']];
const PLAN = [['si', 'Sí'], ['parcial', 'Parcial'], ['no', 'No']];

let tab = 'resumen';
let charts = [];
const view = { period: 'all', from: '', to: '', symbol: '', calMonth: null, selDay: null, showAll: false };

// ---------- datos y formato ----------
const acc = () => state.accounts[state.settings.active];
const allTrades = () => (acc() ? store.accountTrades(state, state.settings.active) : []);
const allOps = () => (acc() ? store.accountOps(state, state.settings.active) : []);
const divisor = () => (acc()?.account.isCent && state.settings.unit === 'usd' ? 100 : 1);
const cur = () => (divisor() === 100 ? 'USD' : acc()?.account.currency || '');

function money(x, { sign = false } = {}) {
  if (x === null || x === undefined || Number.isNaN(x)) return '–';
  if (!Number.isFinite(x)) return '∞';
  const v = x / divisor();
  const s = Math.abs(v).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pre = v < 0 ? '−' : sign && v > 0 ? '+' : '';
  return cur() === 'USD' ? `${pre}$${s}` : `${pre}${s} ${cur()}`;
}
const cls = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const num2 = (x) => (x === null || !Number.isFinite(x) ? '–' : x.toFixed(2));
const fmtDay = (d) => { const dt = new Date(`${d}T00:00:00Z`); return `${WEEKDAYS[dt.getUTCDay()].slice(0, 3)} ${d}`; };
const shortTime = (iso) => `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 4500);
}

// ---------- filtros ----------
function dateBounds() {
  const ts = allTrades();
  if (!ts.length) return {};
  const last = ts.reduce((m, t) => (t.closeTime > m ? t.closeTime : m), '').slice(0, 10);
  const minus = (d, n) => new Date(toMs(`${d}T00:00:00`) - n * 864e5).toISOString().slice(0, 10);
  if (view.period === '7') return { from: minus(last, 6), to: last };
  if (view.period === '30') return { from: minus(last, 29), to: last };
  if (view.period === 'month') return { from: `${last.slice(0, 7)}-01`, to: last };
  if (view.period === 'custom') return { from: view.from || '0000', to: view.to || '9999' };
  return {};
}
function filtered() {
  const { from, to } = dateBounds();
  return allTrades().filter((t) => (!from || day(t.closeTime) >= from) && (!to || day(t.closeTime) <= to) && (!view.symbol || t.symbol === view.symbol));
}

// ---------- gráficos ----------
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function chart(id, config) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  const grid = css('--grid'), muted = css('--muted');
  config.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false }, config.options);
  config.options.plugins = Object.assign({ legend: { display: false } }, config.options.plugins);
  config.options.scales = Object.assign({
    x: { grid: { color: grid }, ticks: { color: muted, maxRotation: 0, autoSkip: true } },
    y: { grid: { color: grid }, ticks: { color: muted } },
  }, config.options.scales);
  charts.push(new window.Chart(el, config));
}
const barColors = (vals) => vals.map((v) => (v >= 0 ? css('--win') : css('--loss')));
function barChart(id, labels, values, { yFmt, tipExtra } = {}) {
  chart(id, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: barColors(values), borderRadius: 3 }] },
    options: {
      scales: { y: { ticks: { callback: (v) => (yFmt || ((x) => money(x)))(v) } } },
      plugins: { tooltip: { callbacks: { label: (c) => money(c.parsed.y, { sign: true }) + (tipExtra ? ` · ${tipExtra(c.dataIndex)}` : '') } } },
    },
  });
}

// ---------- vistas ----------
function kpi(label, value, sub = '', c = '') {
  return `<div class="card kpi"><div class="s">${esc(label)}</div><div class="v ${c}">${value}</div><div class="s">${sub}</div></div>`;
}
const noData = () => `<div class="empty"><p>Aún no hay operaciones${allTrades().length ? ' en este filtro' : ''}.</p>${allTrades().length ? '' : '<p><button class="btn" data-goto="datos">Subir mi reporte de Exness</button></p>'}</div>`;

function renderResumen(el, ts, st) {
  if (!ts.length) { el.innerHTML = noData(); return; }
  const s = st.all, eq = st.equity;
  const days = st.daily;
  el.innerHTML = `
  <div class="grid kpis">
    ${kpi('Resultado neto', money(s.net, { sign: true }), `${s.n} operaciones · ${st.tradingDays} días`, cls(s.net))}
    ${kpi('Balance actual', money(eq.balance), `Depositado: ${money(eq.deposits)}`)}
    ${kpi('Win rate', pct(s.winRate), `${s.wins} ganadas · ${s.losses} perdidas`)}
    ${kpi('Factor de beneficio', Number.isFinite(s.profitFactor) ? num2(s.profitFactor) : '∞', s.profitFactor >= 1 ? 'Rentable (>1)' : 'No rentable (<1)', s.profitFactor >= 1 ? 'pos' : 'neg')}
    ${kpi('Ratio ganancia/pérdida', num2(s.payoff), `Media ${money(s.avgWin)} / ${money(s.avgLoss)}`)}
    ${kpi('Esperanza por operación', money(s.expectancy, { sign: true }), `Win rate mínimo: ${s.breakevenWinRate ? pct(s.breakevenWinRate) : '–'}`, cls(s.expectancy))}
    ${kpi('Drawdown máx. (histórico)', pct(eq.maxDDPct), money(eq.maxDD), eq.maxDDPct >= 0.2 ? 'neg' : '')}
    ${kpi('Rachas', `${st.streaks.maxWins.count} / ${st.streaks.maxLosses.count}`, 'Máx. ganadoras / perdedoras')}
  </div>
  <div class="grid cols2">
    <div class="card"><h3>Curva de balance</h3><div class="chart tall"><canvas id="c-equity"></canvas></div></div>
    <div class="card"><h3>Resultado por día</h3><div class="chart tall"><canvas id="c-daily"></canvas></div></div>
  </div>
  <div class="card" style="margin-top:12px"><h3>Lo más importante</h3>${topInsights(ts, st)}</div>`;
  const labels = eq.points.map((p) => p.t.slice(0, 10));
  chart('c-equity', {
    type: 'line',
    data: { labels, datasets: [{ data: eq.points.map((p) => p.balance), borderColor: css('--series'), backgroundColor: css('--series') + '22', fill: true, pointRadius: 0, borderWidth: 2, tension: 0.15 }] },
    options: { scales: { x: { ticks: { maxTicksLimit: 8, callback(v) { return String(this.getLabelForValue(v)).slice(5); } } }, y: { ticks: { callback: (v) => money(v) } } }, plugins: { tooltip: { callbacks: { title: (i) => eq.points[i[0].dataIndex].t.replace('T', ' '), label: (c) => money(c.parsed.y) } } } },
  });
  barChart('c-daily', days.map((d) => d.key.slice(5)), days.map((d) => d.net), { tipExtra: (i) => `${days[i].n} op.` });
}

function topInsights(ts, st) {
  const list = buildInsights(ts, st, { fmt: money, startBalance: st.equity.deposits }).filter((i) => i.level === 'alta' || i.level === 'media').slice(0, 3);
  if (!list.length) return '<p class="note">Sin alertas relevantes con los datos actuales. Mira la pestaña Insights para el detalle.</p>';
  return list.map((i) => `<p><span class="badge ${i.level}">${i.level}</span> <b>${esc(i.title)}</b></p>`).join('') + '<p class="note">Ver detalle y recomendaciones en la pestaña <a href="#" data-goto="insights">Insights</a>.</p>';
}

function groupTable(title, groups, labelFn, { id } = {}) {
  const rows = groups.filter((g) => g.n).map((g) => `<tr><td>${esc(labelFn(g.key))}</td><td>${g.n}</td><td>${pct(g.winRate, 0)}</td><td class="${cls(g.net)}">${money(g.net, { sign: true })}</td><td class="${cls(g.expectancy)}">${money(g.expectancy, { sign: true })}</td><td>${Number.isFinite(g.profitFactor) ? num2(g.profitFactor) : '∞'}</td></tr>`).join('');
  return `<div class="card"><h3>${esc(title)}</h3>${id ? `<div class="chart"><canvas id="${id}"></canvas></div>` : ''}<div class="scroll"><table><thead><tr><th></th><th>Ops</th><th>Win%</th><th>Neto</th><th>Media</th><th>PF</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderStats(el, ts, st) {
  if (!ts.length) { el.innerHTML = noData(); return; }
  const s = st.all, sk = st.streaks;
  const tagGroups = [];
  const tagMap = new Map();
  for (const t of ts) for (const tag of state.tradeNotes[store.noteKey(state.settings.active, t.id)]?.tags || []) (tagMap.get(tag) || tagMap.set(tag, []).get(tag)).push(t);
  for (const [k, v] of tagMap) tagGroups.push({ key: k, ...summarize(v) });
  const hours = st.byHour;
  el.innerHTML = `
  <div class="grid cols2">
    <div class="card"><h3>Detalle general</h3><table><tbody>
      <tr><td>Operaciones</td><td>${s.n}</td></tr>
      <tr><td>Ganancia bruta</td><td class="pos">${money(s.grossProfit)}</td></tr>
      <tr><td>Pérdida bruta</td><td class="neg">${money(s.grossLoss)}</td></tr>
      <tr><td>Mayor ganancia / pérdida</td><td>${money(s.largestWin)} / ${money(s.largestLoss)}</td></tr>
      <tr><td>Racha ganadora máx.</td><td>${sk.maxWins.count} (${money(sk.maxWins.sum, { sign: true })})</td></tr>
      <tr><td>Racha perdedora máx.</td><td>${sk.maxLosses.count} (${money(sk.maxLosses.sum, { sign: true })})</td></tr>
      <tr><td>Duración media (ganadoras / perdedoras)</td><td>${fmtDuration(s.avgDurationWinSec)} / ${fmtDuration(s.avgDurationLossSec)}</td></tr>
      <tr><td>Volumen total</td><td>${s.volume.toFixed(2)} lotes</td></tr>
      <tr><td>Posiciones simultáneas (máx.)</td><td>${st.maxConcurrent}</td></tr>
      <tr><td>Ops. con Stop Loss</td><td>${pct(ts.filter((t) => t.sl).length / ts.length, 0)}</td></tr>
      <tr><td>Comisión / swap</td><td>${money(s.commission)} / ${money(s.swap)}</td></tr>
    </tbody></table><p class="note">Una operación con resultado exactamente 0 no cuenta como ganada (MT5 sí la cuenta en su % de ganadas).</p></div>
    <div class="card"><h3>Por mes</h3><div class="chart"><canvas id="c-month"></canvas></div></div>
    ${groupTable('Por hora de entrada (servidor)', hours, (k) => `${String(k).padStart(2, '0')}:00`, { id: 'c-hour' })}
    ${groupTable('Por día de la semana', st.byWeekday, (k) => WEEKDAYS[k], { id: 'c-wd' })}
    ${groupTable('Por duración', st.byDuration, (k) => k, { id: 'c-dur' })}
    ${groupTable('Por dirección', st.bySide, (k) => (k === 'buy' ? 'Compra' : 'Venta'))}
    ${groupTable('Por tamaño de lote', st.byVolume, (k) => `${k} lotes`)}
    ${groupTable('Por tipo de entrada', st.byEntry, (k) => ({ market: 'A mercado', limit: 'Orden límite', stop: 'Orden stop' }[k] || k))}
    ${groupTable('Por motivo de cierre', st.byExit, (k) => ({ sl: 'Stop Loss', tp: 'Take Profit', manual: 'Manual', stopout: 'Stop out' }[k] || k))}
    ${groupTable('Con y sin Stop Loss', st.bySL, (k) => k)}
    ${tagGroups.length ? groupTable('Por etiqueta (tus notas)', tagGroups, (k) => k) : ''}
  </div>`;
  barChart('c-month', st.byMonth.map((m) => m.key), st.byMonth.map((m) => m.net), { tipExtra: (i) => `${st.byMonth[i].n} op.` });
  barChart('c-hour', hours.map((h) => `${String(h.key).padStart(2, '0')}h`), hours.map((h) => h.net), { tipExtra: (i) => `${hours[i].n} op.` });
  barChart('c-wd', st.byWeekday.map((d) => WEEKDAYS[d.key].slice(0, 3)), st.byWeekday.map((d) => d.net), { tipExtra: (i) => `${st.byWeekday[i].n} op.` });
  barChart('c-dur', st.byDuration.map((d) => d.key), st.byDuration.map((d) => d.net), { tipExtra: (i) => `${st.byDuration[i].n} op.` });
}

function renderInsights(el, ts, st) {
  if (!ts.length) { el.innerHTML = noData(); return; }
  const list = buildInsights(ts, st, { fmt: money, startBalance: st.equity.deposits });
  const names = { alta: 'Prioridad alta', media: 'A mejorar', info: 'Observación', ok: 'Lo que haces bien' };
  el.innerHTML = `<p class="note">Análisis automático de ${ts.length} operaciones. Son patrones estadísticos, no garantías: con pocas operaciones pueden ser casualidad.</p>` +
    ['alta', 'media', 'info', 'ok'].map((lv) => {
      const items = list.filter((i) => i.level === lv);
      return items.length ? `<h3 style="margin:16px 0 8px">${names[lv]}</h3><div class="grid">${items.map((i) => `<div class="card ins ${lv}"><h4>${esc(i.title)}</h4><p>${esc(i.detail)}</p><p class="tip">${esc(i.tip)}</p></div>`).join('')}</div>` : '';
    }).join('');
}

function renderOps(el, ts) {
  if (!ts.length) { el.innerHTML = noData(); return; }
  const sorted = [...ts].sort((a, b) => b.closeTime.localeCompare(a.closeTime));
  const shown = view.showAll ? sorted : sorted.slice(0, 100);
  const rows = shown.map((t) => {
    const n = state.tradeNotes[store.noteKey(state.settings.active, t.id)];
    return `<tr><td>${shortTime(t.closeTime)}</td><td>${esc(t.symbol)}</td><td>${t.side === 'buy' ? 'Compra' : 'Venta'}</td><td>${t.volume}</td><td>${t.openPrice}</td><td>${t.closePrice}</td><td>${t.sl ?? ''}</td><td>${t.tp ?? ''}</td><td>${fmtDuration(t.durationSec)}</td><td class="${cls(t.net)}">${money(t.net, { sign: true })}</td><td style="text-align:left">${(n?.tags || []).map((g) => `<span class="pill">${esc(g)}</span>`).join('')}${n?.note ? ` <span title="${esc(n.note)}">📝</span>` : ''} <button class="btn ghost sm" data-note="${t.id}">Notas</button></td></tr>`;
  }).join('');
  el.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h3>${ts.length} operaciones</h3><button class="btn ghost sm" id="csvBtn">Exportar CSV</button></div>
    <div class="scroll"><table><thead><tr><th>Cierre</th><th>Símbolo</th><th>Tipo</th><th>Lote</th><th>Entrada</th><th>Salida</th><th>SL</th><th>TP</th><th>Duración</th><th>Resultado</th><th style="text-align:left">Etiquetas / notas</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${sorted.length > shown.length ? `<p><button class="btn ghost sm" id="moreBtn">Mostrar las ${sorted.length}</button></p>` : ''}</div>`;
  $('#moreBtn')?.addEventListener('click', () => { view.showAll = true; render(); });
  $('#csvBtn')?.addEventListener('click', () => exportCsv(sorted));
}

// ---------- bitácora ----------
function renderBitacora(el) {
  const ts = allTrades();
  const byDay = new Map(groupBy(ts, (t) => day(t.closeTime)).map((g) => [g.key, g]));
  const last = ts.length ? ts.reduce((m, t) => (t.closeTime > m ? t.closeTime : m), '').slice(0, 10) : new Date().toISOString().slice(0, 10);
  if (!view.calMonth) view.calMonth = last.slice(0, 7);
  if (!view.selDay) view.selDay = last;
  const [y, m] = view.calMonth.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)), dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // semana empieza el lunes
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="d blank"></div>';
  let monthNet = 0;
  for (let d = 1; d <= dim; d++) {
    const key = `${view.calMonth}-${String(d).padStart(2, '0')}`;
    const g = byDay.get(key), j = state.journal[key];
    if (g) monthNet += g.net;
    cells += `<button class="d ${g ? (g.net >= 0 ? 'win' : 'loss') : ''} ${j ? 'has-note' : ''} ${key === view.selDay ? 'sel' : ''}" data-day="${key}">${d}${g ? `<b class="${cls(g.net)}">${money(g.net, { sign: true })}</b><span>${g.n} op.</span>` : ''}</button>`;
  }
  const monthName = first.toLocaleDateString('es-CR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  el.innerHTML = `<div class="grid cols2">
    <div class="card"><div class="row" style="justify-content:space-between"><button class="btn ghost sm" id="prevM">◀</button><b>${monthName[0].toUpperCase() + monthName.slice(1)}</b><button class="btn ghost sm" id="nextM">▶</button></div>
      <p class="note" style="text-align:center">Resultado del mes: <b class="${cls(monthNet)}">${money(monthNet, { sign: true })}</b></p>
      <div class="cal">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<div class="dow">${d}</div>`).join('')}${cells}</div></div>
    <div id="dayPanel"></div></div>
    <div id="journalStats" style="margin-top:12px"></div>`;
  $('#prevM').onclick = () => { shiftMonth(-1); };
  $('#nextM').onclick = () => { shiftMonth(1); };
  el.querySelectorAll('[data-day]').forEach((b) => { b.onclick = () => { view.selDay = b.dataset.day; renderBitacora(el); }; });
  renderDayPanel(byDay);
  renderJournalStats(byDay);
}
function shiftMonth(delta) {
  const [y, m] = view.calMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  view.calMonth = d.toISOString().slice(0, 7); render();
}

function renderDayPanel(byDay) {
  const key = view.selDay, g = byDay.get(key), j = state.journal[key] || {};
  const dayTrades = allTrades().filter((t) => day(t.closeTime) === key).sort((a, b) => a.openTime.localeCompare(b.openTime));
  const radio = (name, opts, val) => opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" ${val === v ? 'checked' : ''}><span>${l}</span></label>`).join('');
  $('#dayPanel').innerHTML = `<div class="card">
    <h3>${fmtDay(key)}</h3>
    ${g ? `<p><b class="${cls(g.net)}">${money(g.net, { sign: true })}</b> · ${g.n} operaciones · win rate ${pct(g.winRate, 0)} · PF ${Number.isFinite(g.profitFactor) ? num2(g.profitFactor) : '∞'}</p>` : '<p class="note">Sin operaciones este día (puedes anotar tu plan o descanso igualmente).</p>'}
    <form class="form" id="jForm" autocomplete="off">
      <label>Plan previo (qué buscaré, zonas, límite de pérdida, número de operaciones)<textarea name="plan">${esc(j.plan)}</textarea></label>
      <div><b style="font-size:13px">Estado emocional</b><div class="chips">${MOODS.map(([e, l]) => `<label><input type="radio" name="mood" value="${l}" ${j.mood === l ? 'checked' : ''} hidden><span>${e} ${l}</span></label>`).join('')}</div></div>
      <div><b style="font-size:13px">¿Seguí mi plan?</b><div class="chips">${radio('followed', PLAN, j.followed).replace(/<input/g, '<input hidden')}</div></div>
      <label>Qué hice bien<textarea name="good">${esc(j.good)}</textarea></label>
      <label>Qué debo mejorar<textarea name="improve">${esc(j.improve)}</textarea></label>
      <label>Lección / regla para mañana<textarea name="lesson">${esc(j.lesson)}</textarea></label>
      <label>Calificación del día (disciplina, no resultado)
        <select name="rating"><option value="">–</option>${[1, 2, 3, 4, 5].map((n) => `<option ${String(j.rating) === String(n) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="note" id="saved"></div>
    </form>
    ${dayTrades.length ? `<h3 style="margin-top:14px">Operaciones del día</h3><div class="scroll" style="max-height:260px"><table><tbody>${dayTrades.map((t) => `<tr><td>${t.openTime.slice(11, 16)}</td><td>${t.side === 'buy' ? 'C' : 'V'} ${t.volume}</td><td>${fmtDuration(t.durationSec)}</td><td class="${cls(t.net)}">${money(t.net, { sign: true })}</td><td style="text-align:left">${(state.tradeNotes[store.noteKey(state.settings.active, t.id)]?.tags || []).map((x) => `<span class="pill">${esc(x)}</span>`).join('')}<button class="btn ghost sm" data-note="${t.id}">Notas</button></td></tr>`).join('')}</tbody></table></div>` : ''}
  </div>`;
  const form = $('#jForm');
  let h;
  form.addEventListener('input', () => {
    clearTimeout(h);
    h = setTimeout(() => {
      const fd = Object.fromEntries(new FormData(form).entries());
      const entry = Object.fromEntries(Object.entries(fd).filter(([, v]) => String(v).trim() !== ''));
      if (Object.keys(entry).length) state.journal[key] = { ...entry, updated: new Date().toISOString() }; else delete state.journal[key];
      persist(); $('#saved').textContent = 'Guardado ✓';
      const btn = document.querySelector(`[data-day="${key}"]`); if (btn) btn.classList.toggle('has-note', !!state.journal[key]);
    }, 400);
  });
}

function renderJournalStats(byDay) {
  const rows = [];
  const entries = Object.entries(state.journal);
  const agg = (field, label) => {
    const m = new Map();
    for (const [d, j] of entries) {
      if (!j[field] || !byDay.has(d)) continue;
      (m.get(j[field]) || m.set(j[field], []).get(j[field])).push(byDay.get(d).net);
    }
    for (const [k, v] of m) rows.push(`<tr><td>${label}: ${esc(({ si: 'Sí', parcial: 'Parcial', no: 'No' }[k]) || k)}</td><td>${v.length}</td><td class="${cls(v.reduce((a, b) => a + b, 0) / v.length)}">${money(v.reduce((a, b) => a + b, 0) / v.length, { sign: true })}</td></tr>`);
  };
  agg('followed', 'Seguí el plan'); agg('mood', 'Ánimo'); agg('rating', 'Calificación');
  $('#journalStats').innerHTML = `<div class="card"><h3>Qué dice tu bitácora</h3>${rows.length ? `<table><thead><tr><th></th><th>Días</th><th>Resultado medio/día</th></tr></thead><tbody>${rows.join('')}</tbody></table><p class="note">Con pocos días las medias son anecdóticas; cuanto más completes la bitácora, más útil se vuelve.</p>` : '<p class="note">Completa el plan, ánimo y si seguiste el plan en los días con operaciones: aquí verás cómo se relacionan con tu resultado.</p>'}<p class="note">${entries.length} entradas de bitácora.</p></div>`;
}

// ---------- notas por operación ----------
function openNote(id) {
  const key = store.noteKey(state.settings.active, id);
  const n = state.tradeNotes[key] || { tags: [], note: '' };
  const t = allTrades().find((x) => String(x.id) === String(id));
  const dlg = $('#tradeDlg');
  dlg.innerHTML = `<form method="dialog" class="form"><h3 style="margin:0">Operación ${esc(id)}</h3>
    <p class="note">${t ? `${t.side === 'buy' ? 'Compra' : 'Venta'} ${t.volume} ${esc(t.symbol)} · ${shortTime(t.openTime)} → ${shortTime(t.closeTime)} · <b class="${cls(t.net)}">${money(t.net, { sign: true })}</b>` : ''}</p>
    <div class="chips">${TAGS.map((g) => `<label><input type="checkbox" name="tag" value="${esc(g)}" ${n.tags.includes(g) ? 'checked' : ''} hidden><span>${esc(g)}</span></label>`).join('')}</div>
    <label>Nota (motivo de entrada, qué viste, qué sentiste)<textarea name="note">${esc(n.note)}</textarea></label>
    <div class="row"><button class="btn" value="save">Guardar</button><button class="btn ghost" value="cancel">Cancelar</button></div></form>`;
  dlg.querySelector('form').addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'save') return;
    const f = e.target;
    const tags = [...f.querySelectorAll('[name=tag]:checked')].map((c) => c.value);
    const note = f.note.value.trim();
    if (tags.length || note) state.tradeNotes[key] = { tags, note }; else delete state.tradeNotes[key];
    persist(); render();
  });
  dlg.showModal();
}

// ---------- datos ----------
function renderDatos(el) {
  const accs = Object.values(state.accounts);
  el.innerHTML = `
  <div class="card"><h3>Subir reporte de Exness</h3>
    <div class="drop" id="drop"><p><b>Arrastra aquí tu archivo .xlsx</b> o</p><p><input type="file" id="file" accept=".xlsx,.xls" multiple></p>
    <p class="note">Reporte "Trade History Report" de MetaTrader 5: pestaña <i>Historial</i> → clic derecho → <i>Informe</i> → <i>Abrir XML (MS Excel)</i>.<br>Puedes subir reportes nuevos cuando quieras: las operaciones ya cargadas no se duplican.</p></div>
    <div id="importMsg"></div></div>
  <div class="card" style="margin-top:12px"><h3>Cuentas cargadas</h3>
    ${accs.length ? `<table><thead><tr><th>Cuenta</th><th>Tipo</th><th>Operaciones</th><th>Último cierre</th><th></th></tr></thead><tbody>${accs.map((a) => { const ts = Object.values(a.trades); const last = ts.reduce((m, t) => (t.closeTime > m ? t.closeTime : m), ''); return `<tr><td>${esc(a.account.number)}</td><td>${esc(a.account.name)} (${esc(a.account.currency)}, ${esc(a.account.mode)})</td><td>${ts.length}</td><td>${last.replace('T', ' ')}</td><td><button class="btn danger sm" data-delacc="${esc(a.account.number)}">Eliminar</button></td></tr>`; }).join('')}</tbody></table>` : '<p class="note">Todavía no has cargado ninguna cuenta.</p>'}</div>
  <div class="card" style="margin-top:12px"><h3>Respaldo</h3>
    <p class="note">Tus datos viven solo en este navegador (si borras los datos del sitio, se pierden). Descarga un respaldo de vez en cuando; incluye operaciones, bitácora y notas.</p>
    <div class="row"><button class="btn" id="expBtn">Descargar respaldo (.json)</button><label class="btn ghost">Restaurar respaldo<input type="file" id="impFile" accept=".json" hidden></label></div></div>`;
  const drop = $('#drop');
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => handleFiles([...e.dataTransfer.files]));
  $('#file').addEventListener('change', (e) => handleFiles([...e.target.files]));
  $('#expBtn').onclick = () => download(`bitacora-trading-${new Date().toISOString().slice(0, 10)}.json`, store.exportBackup(state), 'application/json');
  $('#impFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!confirm('Restaurar reemplazará TODOS los datos actuales de la aplicación. ¿Continuar?')) return;
    try { store.importBackup(state, await f.text()); persist(); init(); toast('Respaldo restaurado ✓'); } catch (err) { toast(`⚠️ ${err.message}`); }
  });
  el.querySelectorAll('[data-delacc]').forEach((b) => b.addEventListener('click', () => {
    const n = b.dataset.delacc;
    if (!confirm(`¿Eliminar la cuenta ${n} y todas sus operaciones? (La bitácora diaria se conserva.) Esta acción no se puede deshacer.`)) return;
    delete state.accounts[n];
    for (const k of Object.keys(state.tradeNotes)) if (k.startsWith(`${n}:`)) delete state.tradeNotes[k];
    if (state.settings.active === n) state.settings.active = Object.keys(state.accounts)[0] || null;
    persist(); init();
  }));
}

async function handleFiles(files) {
  const out = [];
  for (const f of files) {
    try {
      if (!window.XLSX) throw new Error('No se cargó la librería de lectura de Excel.');
      const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
      const rep = parseExnessReport(rows);
      const r = store.mergeReport(state, rep);
      state.settings.active = r.account;
      out.push(`<p>✅ <b>${esc(f.name)}</b>: cuenta ${esc(r.account)} — ${r.added} operaciones nuevas, ${r.updated} ya existentes (total ${r.total}).</p>` + rep.warnings.map((w) => `<div class="warn-box">${esc(w)}</div>`).join(''));
    } catch (err) { out.push(`<p>❌ <b>${esc(f.name)}</b>: ${esc(err.message)}</p>`); }
  }
  persist();
  setupSelectors();
  $('#importMsg').innerHTML = out.join('');
  if (out.some((o) => o.startsWith('<p>✅'))) { toast('Reporte cargado ✓'); }
}

// ---------- exportar ----------
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportCsv(ts) {
  const head = ['id', 'simbolo', 'tipo', 'lote', 'apertura', 'precio_entrada', 'cierre', 'precio_salida', 'sl', 'tp', 'comision', 'swap', 'resultado', 'etiquetas', 'nota'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ts.map((t) => { const n = state.tradeNotes[store.noteKey(state.settings.active, t.id)] || {}; return [t.id, t.symbol, t.side, t.volume, t.openTime, t.openPrice, t.closeTime, t.closePrice, t.sl ?? '', t.tp ?? '', t.commission, t.swap, t.net, (n.tags || []).join('|'), n.note || ''].map(q).join(','); });
  download('operaciones.csv', '﻿' + [head.join(','), ...lines].join('\n'), 'text/csv');
}

// ---------- ciclo principal ----------
function render() {
  charts.forEach((c) => c.destroy()); charts = [];
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${tab}`; });
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('#filters').hidden = ['bitacora', 'datos'].includes(tab) || !allTrades().length;
  $('#filters').classList.toggle('is-custom', view.period === 'custom');
  const el = $(`#view-${tab}`);
  if (tab === 'datos') return renderDatos(el);
  if (tab === 'bitacora') return renderBitacora(el);
  const ts = filtered();
  const st = computeStats(ts, []);
  const b = dateBounds();
  // El balance y el drawdown se calculan siempre sobre todo el historial de la cuenta; el filtro solo recorta la curva.
  const fullEq = equityCurve([...allTrades()].sort((x, y) => x.closeTime.localeCompare(y.closeTime)), allOps());
  st.equity = { ...fullEq, points: fullEq.points.filter((p) => (!b.from || p.t.slice(0, 10) >= b.from) && (!b.to || p.t.slice(0, 10) <= b.to)) };
  $('#rangeHint').textContent = ts.length ? `${ts.length} operaciones${b.from ? ` · ${b.from.replace('0000', '…')} → ${b.to.replace('9999', '…')}` : ''}` : '';
  if (tab === 'resumen') renderResumen(el, ts, st);
  else if (tab === 'stats') renderStats(el, ts, st);
  else if (tab === 'insights') renderInsights(el, ts, st);
  else if (tab === 'ops') renderOps(el, ts);
}

function setupSelectors() {
  const as = $('#accountSel');
  const accs = Object.values(state.accounts);
  as.innerHTML = accs.length ? accs.map((a) => `<option value="${esc(a.account.number)}" ${a.account.number === state.settings.active ? 'selected' : ''}>Cuenta ${esc(a.account.number)}</option>`).join('') : '<option>Sin cuentas</option>';
  const us = $('#unitSel');
  if (acc()?.account.isCent) {
    us.hidden = false;
    us.innerHTML = `<option value="usd" ${state.settings.unit === 'usd' ? 'selected' : ''}>Mostrar en USD ($)</option><option value="raw" ${state.settings.unit === 'raw' ? 'selected' : ''}>Mostrar en centavos (USC)</option>`;
  } else { us.hidden = true; }
  const syms = [...new Set(allTrades().map((t) => t.symbol))].sort();
  $('#symbolSel').innerHTML = `<option value="">Todos</option>${syms.map((s) => `<option ${s === view.symbol ? 'selected' : ''}>${esc(s)}</option>`).join('')}`;
  render();
}

function init() {
  view.calMonth = null; view.selDay = null; view.symbol = '';
  if (!acc()) tab = 'datos';
  setupSelectors();
}

$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); } });
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-goto]'); if (g) { e.preventDefault(); tab = g.dataset.goto; render(); }
  const n = e.target.closest('[data-note]'); if (n) openNote(n.dataset.note);
});
$('#accountSel').addEventListener('change', (e) => { state.settings.active = e.target.value; persist(); view.calMonth = null; view.selDay = null; view.symbol = ''; setupSelectors(); });
$('#unitSel').addEventListener('change', (e) => { state.settings.unit = e.target.value; persist(); render(); });
$('#periodSel').addEventListener('change', (e) => { view.period = e.target.value; render(); });
$('#fromDate').addEventListener('change', (e) => { view.from = e.target.value; render(); });
$('#toDate').addEventListener('change', (e) => { view.to = e.target.value; render(); });
$('#symbolSel').addEventListener('change', (e) => { view.symbol = e.target.value; render(); });
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => render());

init();
