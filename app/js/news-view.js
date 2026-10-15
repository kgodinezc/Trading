// Pestaña "Noticias": titulares y agenda económica con su lectura de impacto en oro, petróleo, S&P 500, Nasdaq 100 y Bitcoin.
// Los datos (data/news.json) los genera un workflow de GitHub Actions cada pocos minutos.
import { toLocal } from './core/entries.js';
import { classify, classifyEvent, summarizeBias, ASSETS, assetName } from './core/newsimpact.js';

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
    for (const i of d.items) i.impacts = classify(i);
    for (const e of d.calendar) e.read = classifyEvent(e);
    data = d; error = null;
  } catch (e) { error = e.message; }
  loadedAt = Date.now();
  return data;
}

// ---- Actualización a demanda ----
// GitHub ejecuta el cron de forma irregular (a veces cada varias horas). Con un token propio (guardado solo en este
// navegador y fuera de los respaldos) el botón pide la actualización al instante mediante la API de GitHub.
const TOKEN_KEY = 'trading-journal.gh-token';
const LAST_KEY = 'trading-journal.gh-last-dispatch';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
export const getToken = () => lsGet(TOKEN_KEY) || '';
export const setToken = (t) => lsSet(TOKEN_KEY, t ? t.trim() : null);

export function repoSlug() {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return m && repo ? `${m[1]}/${repo}` : 'kgodinezc/Trading';
}

let busy = false, notice = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const isRefreshing = () => busy;
const ageMin = (now = Date.now()) => (data ? Math.round((now - ms(data.generatedAt)) / 60000) : null);

async function dispatchWorkflow(token) {
  const r = await fetch(`https://api.github.com/repos/${repoSlug()}/actions/workflows/pages.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (r.status === 204) return null;
  if (r.status === 401) return 'El token no es válido o venció. Genera uno nuevo y vuelve a pegarlo.';
  if (r.status === 403 || r.status === 404) return 'El token no tiene permiso para este repositorio: debe ser de tipo fine-grained, solo del repositorio Trading, con "Actions: Read and write".';
  return `GitHub respondió ${r.status}.`;
}

// Relee el archivo; si no hay datos más nuevos y hay token, pide la actualización y espera a que se publique (≈1 min).
export async function refreshNow(onStatus = () => {}) {
  if (busy) return { busy: true };
  busy = true;
  try {
    const before = data ? data.generatedAt : '';
    await loadNews();
    if (data && data.generatedAt !== before) return { changed: true };
    const token = getToken();
    if (!token) return { changed: false, needsToken: true };
    onStatus('Pidiendo la actualización a GitHub…');
    const err = await dispatchWorkflow(token);
    if (err) return { changed: false, error: err };
    lsSet(LAST_KEY, String(Date.now()));
    for (let i = 1; i <= 24; i++) {
      onStatus(`GitHub está descargando y publicando las noticias… ${i * 10} s (suele tardar ~1 min)`);
      await sleep(10000);
      const prev = data ? data.generatedAt : '';
      await loadNews();
      if (data && data.generatedAt !== prev) return { changed: true };
    }
    return { changed: false, timeout: true };
  } finally { busy = false; }
}

// Al abrir la pestaña con datos viejos y token guardado, se pide la actualización sola (máx. una vez cada 10 min).
export function shouldAutoRefresh(now = Date.now()) {
  const last = Number(lsGet(LAST_KEY) || 0);
  return !busy && !!getToken() && data && ageMin(now) > 30 && now - last > 10 * 60e3;
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
  alcista: ['▲ Alcista para', 'ok'], bajista: ['▼ Bajista para', 'alta'],
  mixto: ['◆ Señales mixtas para', 'media'], neutral: ['• Sin impacto claro en', 'info'],
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
  const note = notice && now - notice.at < 120000 ? notice : null; // los avisos caducan a los 2 min
  const hours = prefs.hours || 24;
  const asset = ASSETS.some((a) => a.id === prefs.asset) ? prefs.asset : 'gold';
  const aname = assetName(asset);
  const mode = prefs.only === 'all' ? 'all' : prefs.only === 'neutral' ? 'neutral' : 'bias'; // 'relevant' (valor antiguo) = con sesgo
  const items = data.items.filter((i) => now - ms(i.published) <= hours * 3600e3)
    .filter((i) => mode === 'all' || (i.impacts[asset].relevant && (mode === 'neutral' || i.impacts[asset].bias !== 'neutral')))
    .filter((i) => prefs.bias === 'all' || i.impacts[asset].bias === prefs.bias)
    .filter((i) => !prefs.q || `${i.title} ${i.source}`.toLowerCase().includes(prefs.q.toLowerCase()));
  const sum = summarizeBias(data.items, now, { hours: 12, asset });
  const overview = ASSETS.map((a) => ({ a, s: summarizeBias(data.items, now, { hours: 12, asset: a.id }) }));
  const tone = sum.label.includes('alcista') ? 'ok' : sum.label.includes('bajista') ? 'alta' : 'info';
  const stale = (now - ms(data.generatedAt)) / 60000;
  const okSrc = data.sources.filter((s) => s.ok).length;

  const cal = data.calendar.filter((e) => (prefs.usdOnly ? e.country === 'USD' : true) && (prefs.highOnly ? e.impact === 'high' : e.impact !== 'low'))
    .filter((e) => e.time ? dayOf(e.time, off) === dayOf(new Date(now).toISOString().slice(0, 19), off) : e.date === dayOf(new Date(now).toISOString().slice(0, 19), off))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const topicRows = sum.topics.slice(0, 5).map((t) => `<li><b>${t.net > 0 ? '▲' : '▼'} ${esc(t.topic)}</b> <span class="note">(${t.bull} a favor · ${t.bear} en contra)</span>${t.example ? `<div class="note">«${esc(t.example.length > 110 ? t.example.slice(0, 107) + '…' : t.example)}»</div>` : ''}</li>`).join('');
  const calHtml = cal.length ? `<div class="scroll" style="max-height:340px"><table><thead><tr><th>Hora</th><th>Mon.</th><th>Evento</th><th>Impacto</th><th>Prev.</th><th>Pron.</th><th>Real</th></tr></thead><tbody>${cal.map((e) => {
    const [lab, lv] = IMPACT[e.impact] || IMPACT.low; const past = e.time && ms(e.time) < now;
    const sp = e.read.surprise[asset]; const sur = sp ? ` <span class="badge ${sp.bias === 'alcista' ? 'ok' : 'alta'}">${sp.bias} para ${esc(aname)}</span>` : '';
    return `<tr style="${past ? 'opacity:.6' : ''}"><td>${e.time ? hm(e.time, off) : 'Pend.'}</td><td>${esc(e.country)}</td><td style="text-align:left;white-space:normal">${esc(e.title)}${sur}${e.read.how[asset] ? `<details><summary class="note">Cómo leerlo para ${esc(aname)}</summary><div class="note">${esc(e.read.how[asset])}</div></details>` : ''}</td><td><span class="badge ${lv}">${lab}</span></td><td>${esc(e.previous ?? '–')}</td><td>${esc(e.forecast ?? '–')}</td><td>${esc(e.actual ?? '–')}</td></tr>`;
  }).join('')}</tbody></table></div>` : '<p class="note">No hay eventos con estos filtros para hoy.</p>';

  let lastDay = '';
  const list = items.map((i) => {
    const d = dayOf(i.published, off); let head = '';
    if (d !== lastDay) { lastDay = d; head = `<h3 style="margin:14px 0 6px">${d === dayOf(new Date(now).toISOString().slice(0, 19), off) ? 'Hoy' : esc(d)}</h3>`; }
    const imp = i.impacts[asset];
    const [lab, lv] = BIAS[imp.bias]; const isNew = lastSeen && i.published > lastSeen;
    const dots = imp.bias === 'neutral' ? '' : '●'.repeat(imp.strength) + '○'.repeat(3 - imp.strength);
    const others = ASSETS.filter((a) => a.id !== asset && i.impacts[a.id].relevant && i.impacts[a.id].bias !== 'neutral')
      .map((a) => `<span class="pill" title="Lectura para ${esc(a.name)}">${esc(a.name)} ${{ alcista: '▲', bajista: '▼', mixto: '◆' }[i.impacts[a.id].bias]}</span>`).join('');
    const href = safeHref(i.link);
    return `${head}<div class="card ins ${lv}" style="margin-bottom:8px">
      <div class="row" style="justify-content:space-between"><span class="note">${hm(i.published, off)} · ${rel(i.published, now)} · ${esc(i.source)}${i.alsoIn.length ? ` +${i.alsoIn.length}` : ''}</span>
      <span><span class="badge ${lv}">${lab} ${esc(aname)}</span> <span class="note" title="Fuerza de la señal">${dots}</span>${isNew ? ' <span class="badge info">Nueva</span>' : ''}</span></div>
      <h4>${href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a>` : esc(i.title)}</h4>
      ${imp.reasons.map((r) => `<p class="tip" style="color:var(--muted)">${esc(r.why)}</p>`).join('')}
      ${imp.topics.length ? `<div>${imp.topics.map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div>` : ''}
      ${others ? `<div class="note">También afecta a: ${others}</div>` : ''}</div>`;
  }).join('');

  el.innerHTML = `
  <div class="card" style="margin-bottom:12px"><div class="row" style="justify-content:space-between">
    <div><b>Actualizado ${rel(data.generatedAt, now)}</b> <span class="note">(${toLocal(data.generatedAt, off).replace('T', ' ').slice(0, 16)} ${esc(tzLabel())}) · ${okSrc}/${data.sources.length} fuentes activas</span></div>
    <button class="btn ghost sm" id="newsRefresh" ${busy ? 'disabled' : ''}>${busy ? 'Actualizando…' : 'Actualizar ahora'}</button></div>
    ${stale > 45 ? `<div class="warn-box">Las noticias publicadas tienen ${stale >= 120 ? Math.floor(stale / 60) + ' h' : Math.round(stale) + ' min'}: la actualización automática de GitHub se está retrasando. ${getToken() ? 'Pulsa "Actualizar ahora" para pedirla al instante.' : 'Configura el token de abajo para poder pedirla al instante con el botón.'}</div>` : ''}
    <div id="newsStatus" class="note" role="status" aria-live="polite">${note ? `<span class="${note.kind === 'error' ? 'neg' : note.kind === 'ok' ? 'pos' : ''}">${esc(note.text)}</span>` : ''}</div>
    <details id="ghCfg" ${note && note.openCfg ? 'open' : ''} style="margin-top:6px"><summary class="note">Actualización a demanda ${getToken() ? '(token guardado ✓)' : '(requiere un token)'}</summary>
      <p class="note">GitHub ejecuta la actualización automática de forma irregular. Con un token propio, el botón la pide al instante. Pasos: (1) abre <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">GitHub → Fine-grained tokens → Generate new token</a>; (2) <i>Repository access</i>: solo <b>${esc(repoSlug())}</b>; (3) <i>Permissions → Repository permissions → Actions: Read and write</i> (nada más); (4) copia el token y pégalo aquí. Se guarda solo en este navegador y no entra en los respaldos.</p>
      <div class="row"><input type="password" id="ghToken" placeholder="github_pat_…" style="width:260px" autocomplete="off" value="">
        <button class="btn sm" id="ghSave">Guardar token</button>${getToken() ? '<button class="btn ghost sm" id="ghDel">Quitar token</button>' : ''}</div></details>
  </div>
  <div class="assets" role="tablist" aria-label="Activo">${overview.map(({ a, s: o }) => {
    const t = o.label.includes('alcista') ? 'ok' : o.label.includes('bajista') ? 'alta' : 'info';
    return `<button class="asset ${a.id === asset ? 'on' : ''}" data-asset="${a.id}" role="tab" aria-selected="${a.id === asset}"><b>${esc(a.name)}</b><span class="note">${esc(a.code)}</span><span class="badge ${t}">${esc(o.label.replace('ligeramente ', 'lig. ').replace(' / dividido', ''))}</span><span class="note">▲${o.bull} ▼${o.bear}${o.mixed ? ` ◆${o.mixed}` : ''}</span></button>`;
  }).join('')}</div>
  <div class="grid cols2">
    <div class="card ins ${tone}"><h3>Perspectiva de ${esc(aname)} (últimas 12 h)</h3>
      <h4 style="font-size:20px;text-transform:capitalize">${esc(sum.label)}</h4>
      <p>${sum.bull} noticias a favor · ${sum.bear} en contra · ${sum.mixed} mixtas (${sum.total} con sesgo en las últimas 12 h). Las más recientes pesan más.</p>
      <ul class="drivers">${topicRows || '<li class="note">Sin factores dominantes.</li>'}</ul>
      <p class="note">Lectura automática por palabras clave; es una guía de contexto, no una señal de entrada. Confírmala siempre con el gráfico.</p></div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Agenda de hoy (${esc(tzLabel())})</h3>
      <span class="row"><label class="inline"><input type="checkbox" id="fUsd" ${prefs.usdOnly ? 'checked' : ''}> Solo USD</label><label class="inline"><input type="checkbox" id="fHigh" ${prefs.highOnly ? 'checked' : ''}> Solo impacto alto</label></span></div>
      ${calHtml}${data.calendarOk ? '' : `<p class="note">Calendario no disponible${data.calendarError ? `: ${esc(data.calendarError)}` : ''}.</p>`}</div></div>
  <div class="card" style="margin:12px 0"><div class="row">
    <label class="inline">Ventana <select id="fHours">${[3, 6, 12, 24, 48].map((h) => `<option value="${h}" ${h === hours ? 'selected' : ''}>${h} h</option>`).join('')}</select></label>
    <label class="inline">Sesgo <select id="fBias">${[['all', 'Todos'], ['alcista', 'Alcistas'], ['bajista', 'Bajistas'], ['mixto', 'Mixtas']].map(([v, l]) => `<option value="${v}" ${prefs.bias === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="inline">Mostrar <select id="fMode">${[['bias', `Con sesgo claro para ${aname}`], ['neutral', 'Relevantes (incluye neutrales)'], ['all', 'Todo']].map(([v, l]) => `<option value="${v}" ${mode === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <input type="text" id="fQ" placeholder="Buscar…" value="${esc(prefs.q || '')}" style="width:160px">
    <span class="note">${items.length} titulares</span></div></div>
  ${list || '<div class="empty"><p>No hay titulares con estos filtros.</p></div>'}
  <p class="note">Los titulares enlazan a la fuente original (en inglés). Fuentes: ${data.sources.map((s) => `<span title="${esc(s.error || s.count + ' titulares')}">${s.ok ? '✅' : '⚠️'} ${esc(s.name)}</span>`).join(' · ')}</p>`;

  const again = () => renderNews(el, { prefs, save, tzOff, tzLabel, lastSeen });
  const status = (text, kind = 'info') => { const n = document.getElementById('newsStatus'); if (n) n.innerHTML = `<span class="${kind === 'error' ? 'neg' : ''}">${esc(text)}</span>`; };
  const run = async () => {
    const btn = el.querySelector('#newsRefresh'); if (btn) { btn.disabled = true; btn.textContent = 'Actualizando…'; }
    const r = await refreshNow(status);
    if (r.busy) return;
    if (r.changed) notice = { at: Date.now(), kind: 'ok', text: `Noticias actualizadas ✓ (${toLocal(data.generatedAt, tzOff()).slice(11, 16)})` };
    else if (r.needsToken) notice = { at: Date.now(), kind: 'info', openCfg: true, text: `No hay datos más nuevos publicados (los últimos son de hace ${ageMin()} min). GitHub no ha ejecutado la actualización automática; para pedirla al instante, configura el token de abajo.` };
    else if (r.error) notice = { at: Date.now(), kind: 'error', openCfg: true, text: r.error };
    else if (r.timeout) notice = { at: Date.now(), kind: 'info', text: 'GitHub sigue trabajando en la actualización; vuelve a pulsar el botón en un minuto.' };
    again();
  };
  el.querySelector('#newsRefresh').onclick = run;
  el.querySelector('#ghSave').onclick = () => { const v = el.querySelector('#ghToken').value.trim(); if (!v) return; setToken(v); notice = { at: Date.now(), kind: 'ok', text: 'Token guardado. Pulsa "Actualizar ahora".' }; again(); };
  const del = el.querySelector('#ghDel'); if (del) del.onclick = () => { setToken(''); notice = null; again(); };
  if (shouldAutoRefresh()) run();
  const bind = (id, fn, evn = 'change') => el.querySelector(id).addEventListener(evn, (e) => { fn(e.target); save(); again(); });
  el.querySelectorAll('[data-asset]').forEach((b) => b.addEventListener('click', () => { prefs.asset = b.dataset.asset; save(); again(); }));
  bind('#fHours', (t) => { prefs.hours = +t.value; });
  bind('#fBias', (t) => { prefs.bias = t.value; });
  bind('#fMode', (t) => { prefs.only = t.value; });
  bind('#fUsd', (t) => { prefs.usdOnly = t.checked; });
  bind('#fHigh', (t) => { prefs.highOnly = t.checked; });
  el.querySelector('#fQ').addEventListener('change', (e) => { prefs.q = e.target.value.trim(); save(); again(); });
}

export const newestPublished = () => (data && data.items.length ? data.items.reduce((m, i) => (i.published > m ? i.published : m), '') : '');
