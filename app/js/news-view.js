// Pestaña "Noticias": titulares y agenda económica con su lectura de impacto en el oro.
// Los datos (data/news.json) los genera un workflow de GitHub Actions cada pocos minutos.
import { toLocal } from './core/entries.js';
import { classify, classifyEvent, summarizeBias } from './core/newsimpact.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeHref = (u) => (/^https?:\/\//i.test(u || '') ? esc(u) : '');
const ms = (iso) => Date.parse(`${iso}Z`);

let data = null, error = null, loadedAt = 0;
export const newsLoadedAt = () => loadedAt;

export async function loadNews() {
  try {
    const r = await fetch(`data/news.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 404 ? 'Aún no se ha generado data/news.json' : `HTTP ${r.status}`);
    const d = await r.json();
    for (const i of d.items) i.impact = classify(i);
    for (const e of d.calendar) e.read = classifyEvent(e);
    data = d; error = null;
  } catch (e) { error = e.message; }
  loadedAt = Date.now();
  return data;
}

const rel = (iso, now = Date.now()) => {
  const m = Math.round((now - ms(iso)) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  if (m < 1440) return `hace ${Math.floor(m / 60)} h ${m % 60} min`;
  return `hace ${Math.floor(m / 1440)} d`;
};
const hm = (iso, off) => toLocal(iso, off).slice(11, 16);
const dayOf = (iso, off) => toLocal(iso, off).slice(0, 10);

const BIAS = {
  alcista: ['▲ Alcista para el oro', 'ok'], bajista: ['▼ Bajista para el oro', 'alta'],
  mixto: ['◆ Señales mixtas', 'media'], neutral: ['• Sin impacto claro', 'info'],
};
const IMPACT = { high: ['Alto', 'alta'], medium: ['Medio', 'media'], low: ['Bajo', 'info'] };

// Aviso global: evento de alto impacto en USD que ocurre en la próxima hora o acaba de ocurrir.
export function upcomingAlert(off, now = Date.now()) {
  if (!data) return null;
  const ev = data.calendar.filter((e) => e.time && e.country === 'USD' && e.impact === 'high' && ms(e.time) >= now - 15 * 60e3 && ms(e.time) <= now + 60 * 60e3)
    .sort((a, b) => a.time.localeCompare(b.time))[0];
  if (!ev) return null;
  const min = Math.round((ms(ev.time) - now) / 60000);
  return { title: ev.title, when: hm(ev.time, off), min, past: min < 0 };
}

export function renderNews(el, { prefs, save, tzOff, tzLabel, lastSeen }) {
  const off = tzOff();
  if (!data) {
    el.innerHTML = `<div class="empty"><p><b>Todavía no hay noticias cargadas.</b></p><p>${esc(error || 'Cargando…')}</p>
      <p class="note">Las noticias las descarga un workflow de GitHub Actions (cada ~10 min) y se publican junto con la página. Si acabas de activarlo, espera a su primera ejecución. En local: <code>npm run news</code>.</p>
      <p><button class="btn" id="newsRetry">Reintentar</button></p></div>`;
    el.querySelector('#newsRetry').onclick = async () => { await loadNews(); renderNews(el, arguments[1]); };
    return;
  }
  const now = Date.now();
  const hours = prefs.hours || 24;
  const items = data.items.filter((i) => now - ms(i.published) <= hours * 3600e3)
    .filter((i) => prefs.only === 'all' || i.impact.relevant)
    .filter((i) => prefs.bias === 'all' || i.impact.bias === prefs.bias)
    .filter((i) => !prefs.q || `${i.title} ${i.source}`.toLowerCase().includes(prefs.q.toLowerCase()));
  const sum = summarizeBias(data.items.filter((i) => i.impact.relevant), now, { hours: 12 });
  const tone = sum.label.includes('alcista') ? 'ok' : sum.label.includes('bajista') ? 'alta' : 'info';
  const stale = (now - ms(data.generatedAt)) / 60000;
  const okSrc = data.sources.filter((s) => s.ok).length;

  const cal = data.calendar.filter((e) => (prefs.usdOnly ? e.country === 'USD' : true) && (prefs.highOnly ? e.impact === 'high' : e.impact !== 'low'))
    .filter((e) => e.time ? dayOf(e.time, off) === dayOf(new Date(now).toISOString().slice(0, 19), off) : e.date === dayOf(new Date(now).toISOString().slice(0, 19), off))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const topicRows = sum.topics.slice(0, 5).map((t) => `<span class="pill" title="${t.bull} a favor · ${t.bear} en contra">${esc(t.topic)} ${t.net > 0 ? '▲' : '▼'}</span>`).join(' ');
  const calHtml = cal.length ? `<div class="scroll" style="max-height:340px"><table><thead><tr><th>Hora</th><th>Mon.</th><th>Evento</th><th>Impacto</th><th>Prev.</th><th>Pron.</th><th>Real</th></tr></thead><tbody>${cal.map((e) => {
    const [lab, lv] = IMPACT[e.impact] || IMPACT.low; const past = e.time && ms(e.time) < now;
    const sur = e.read.surprise ? ` <span class="badge ${e.read.surprise.bias === 'alcista' ? 'ok' : 'alta'}">${e.read.surprise.bias} para el oro</span>` : '';
    return `<tr style="${past ? 'opacity:.6' : ''}"><td>${e.time ? hm(e.time, off) : 'Pend.'}</td><td>${esc(e.country)}</td><td style="text-align:left;white-space:normal">${esc(e.title)}${sur}${e.read.how ? `<details><summary class="note">Cómo leerlo para el oro</summary><div class="note">${esc(e.read.how)}</div></details>` : ''}</td><td><span class="badge ${lv}">${lab}</span></td><td>${esc(e.previous ?? '–')}</td><td>${esc(e.forecast ?? '–')}</td><td>${esc(e.actual ?? '–')}</td></tr>`;
  }).join('')}</tbody></table></div>` : '<p class="note">No hay eventos con estos filtros para hoy.</p>';

  let lastDay = '';
  const list = items.map((i) => {
    const d = dayOf(i.published, off); let head = '';
    if (d !== lastDay) { lastDay = d; head = `<h3 style="margin:14px 0 6px">${d === dayOf(new Date(now).toISOString().slice(0, 19), off) ? 'Hoy' : esc(d)}</h3>`; }
    const [lab, lv] = BIAS[i.impact.bias]; const isNew = lastSeen && i.published > lastSeen;
    const dots = i.impact.bias === 'neutral' ? '' : '●'.repeat(i.impact.strength) + '○'.repeat(3 - i.impact.strength);
    const href = safeHref(i.link);
    return `${head}<div class="card ins ${lv}" style="margin-bottom:8px">
      <div class="row" style="justify-content:space-between"><span class="note">${hm(i.published, off)} · ${rel(i.published, now)} · ${esc(i.source)}${i.alsoIn.length ? ` +${i.alsoIn.length}` : ''}</span>
      <span><span class="badge ${lv}">${lab}</span> <span class="note" title="Fuerza de la señal">${dots}</span>${isNew ? ' <span class="badge info">Nueva</span>' : ''}</span></div>
      <h4>${href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a>` : esc(i.title)}</h4>
      ${i.impact.reasons.map((r) => `<p class="tip" style="color:var(--muted)">${esc(r.why)}</p>`).join('')}
      ${i.impact.topics.length ? `<div>${i.impact.topics.map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div>` : ''}</div>`;
  }).join('');

  el.innerHTML = `
  <div class="card" style="margin-bottom:12px"><div class="row" style="justify-content:space-between">
    <div><b>Actualizado ${rel(data.generatedAt, now)}</b> <span class="note">(${toLocal(data.generatedAt, off).replace('T', ' ').slice(0, 16)} ${esc(tzLabel())}) · ${okSrc}/${data.sources.length} fuentes activas</span>
    ${stale > 45 ? '<div class="warn-box">Los datos tienen más de 45 min: el workflow de actualización puede estar retrasado o detenido.</div>' : ''}</div>
    <button class="btn ghost sm" id="newsRefresh">Actualizar ahora</button></div></div>
  <div class="grid cols2">
    <div class="card ins ${tone}"><h3>Sesgo reciente para el oro (últimas 12 h)</h3>
      <h4 style="font-size:20px;text-transform:capitalize">${esc(sum.label)}</h4>
      <p>${sum.bull} noticias a favor · ${sum.bear} en contra · ${sum.mixed} mixtas, de ${sum.total} relevantes. Las más recientes pesan más.</p>
      <div>${topicRows || '<span class="note">Sin temas dominantes.</span>'}</div>
      <p class="note">Lectura automática por palabras clave; es una guía de contexto, no una señal de entrada. Confírmala siempre con el gráfico.</p></div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Agenda de hoy (${esc(tzLabel())})</h3>
      <span class="row"><label class="inline"><input type="checkbox" id="fUsd" ${prefs.usdOnly ? 'checked' : ''}> Solo USD</label><label class="inline"><input type="checkbox" id="fHigh" ${prefs.highOnly ? 'checked' : ''}> Solo impacto alto</label></span></div>
      ${calHtml}${data.calendarOk ? '' : `<p class="note">Calendario no disponible${data.calendarError ? `: ${esc(data.calendarError)}` : ''}.</p>`}</div></div>
  <div class="card" style="margin:12px 0"><div class="row">
    <label class="inline">Ventana <select id="fHours">${[3, 6, 12, 24, 48].map((h) => `<option value="${h}" ${h === hours ? 'selected' : ''}>${h} h</option>`).join('')}</select></label>
    <label class="inline">Sesgo <select id="fBias">${[['all', 'Todos'], ['alcista', 'Alcistas'], ['bajista', 'Bajistas'], ['mixto', 'Mixtas']].map(([v, l]) => `<option value="${v}" ${prefs.bias === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="inline"><input type="checkbox" id="fRel" ${prefs.only !== 'all' ? 'checked' : ''}> Solo relevantes para el oro</label>
    <input type="text" id="fQ" placeholder="Buscar…" value="${esc(prefs.q || '')}" style="width:160px">
    <span class="note">${items.length} titulares</span></div></div>
  ${list || '<div class="empty"><p>No hay titulares con estos filtros.</p></div>'}
  <p class="note">Los titulares enlazan a la fuente original (en inglés). Fuentes: ${data.sources.map((s) => `<span title="${esc(s.error || s.count + ' titulares')}">${s.ok ? '✅' : '⚠️'} ${esc(s.name)}</span>`).join(' · ')}</p>`;

  const again = () => renderNews(el, { prefs, save, tzOff, tzLabel, lastSeen });
  el.querySelector('#newsRefresh').onclick = async (ev) => { ev.target.disabled = true; await loadNews(); again(); };
  const bind = (id, fn, evn = 'change') => el.querySelector(id).addEventListener(evn, (e) => { fn(e.target); save(); again(); });
  bind('#fHours', (t) => { prefs.hours = +t.value; });
  bind('#fBias', (t) => { prefs.bias = t.value; });
  bind('#fRel', (t) => { prefs.only = t.checked ? 'relevant' : 'all'; });
  bind('#fUsd', (t) => { prefs.usdOnly = t.checked; });
  bind('#fHigh', (t) => { prefs.highOnly = t.checked; });
  el.querySelector('#fQ').addEventListener('change', (e) => { prefs.q = e.target.value.trim(); save(); again(); });
}

export const newestPublished = () => (data && data.items.length ? data.items.reduce((m, i) => (i.published > m ? i.published : m), '') : '');
