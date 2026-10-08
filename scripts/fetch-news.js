// Descarga titulares (RSS) y el calendario económico y los guarda en app/data/news.json.
// Se ejecuta en GitHub Actions cada pocos minutos (los navegadores no pueden leer estos sitios por CORS).
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { classify } from '../app/js/core/newsimpact.js';
import { parseFeed, parseCalendar, splitTitleSource, normTitle, isoUtc } from '../app/js/core/feed.js';

const UA = 'Mozilla/5.0 (compatible; TradingJournalBot/1.0; +https://github.com/kgodinezc/Trading)';
const gn = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

export const SOURCES = [
  { id: 'gn-gold', name: 'Google News · Oro', url: gn('gold price OR XAUUSD OR bullion when:2d') },
  { id: 'gn-fed', name: 'Google News · Fed y dólar', url: gn('"Federal Reserve" OR FOMC OR "Treasury yields" OR "US dollar" when:2d') },
  { id: 'gn-data', name: 'Google News · Datos EE. UU.', url: gn('nonfarm payrolls OR CPI inflation OR jobless claims OR "retail sales" when:2d') },
  { id: 'gn-geo', name: 'Google News · Geopolítica', url: gn('"safe haven" OR tariffs OR sanctions OR "Middle East" OR Ukraine markets when:2d') },
  { id: 'fed', name: 'Reserva Federal', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { id: 'fxstreet', name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
  { id: 'marketwatch', name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/marketpulse/' },
  { id: 'cnbc-econ', name: 'CNBC · Economía', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html' },
  { id: 'cnbc-fin', name: 'CNBC · Finanzas', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html' },
  { id: 'investing', name: 'Investing.com · Metales', url: 'https://www.investing.com/rss/commodities_Metals.rss' },
];
const CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.xml';
// Diferencia (horas) de la hora del calendario respecto a UTC. Se confirma en el log de cada ejecución.
const CAL_TZ = Number(process.env.CAL_TZ_OFFSET ?? 0);
const MAX_AGE_H = 72, MAX_ITEMS = 250, PER_SOURCE = 60;

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

export async function build({ now = Date.now(), fetcher = get } = {}) {
  const sources = [], all = [];
  await Promise.all(SOURCES.map(async (s) => {
    const t0 = Date.now();
    try {
      const items = parseFeed(await fetcher(s.url)).slice(0, PER_SOURCE);
      sources.push({ id: s.id, name: s.name, ok: true, count: items.length, ms: Date.now() - t0 });
      for (const i of items) all.push({ ...i, feed: s.name });
    } catch (e) { sources.push({ id: s.id, name: s.name, ok: false, count: 0, error: String(e.message || e), ms: Date.now() - t0 }); }
  }));

  const seen = new Map();
  for (const i of all) {
    const { title, sourceName } = splitTitleSource(i.title, i.sourceName);
    const ms = Date.parse(`${i.published}Z`);
    if (now - ms > MAX_AGE_H * 3600e3 || ms - now > 3600e3) continue;
    const key = normTitle(title);
    if (!key) continue;
    const media = sourceName || i.feed;
    if (seen.has(key)) { const e = seen.get(key); if (!e.media.includes(media)) e.media.push(media); continue; }
    seen.set(key, { id: createHash('sha1').update(key).digest('hex').slice(0, 10), title, link: i.link, published: i.published, summary: i.summary === title ? '' : i.summary, source: media, media: [media] });
  }
  const items = [...seen.values()].sort((a, b) => b.published.localeCompare(a.published)).slice(0, MAX_ITEMS)
    .map(({ media, ...x }) => ({ ...x, alsoIn: media.filter((m) => m !== x.source).slice(0, 3) }));

  let calendar = [], calendarOk = false, calendarError = null;
  try { calendar = parseCalendar(await fetcher(CALENDAR_URL), { tzOffset: CAL_TZ }); calendarOk = calendar.length > 0; } catch (e) { calendarError = String(e.message || e); }
  return { generatedAt: isoUtc(now), calendarTzOffset: CAL_TZ, sources, calendarOk, calendarError, items, calendar };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = await build();
  for (const s of data.sources) console.log(`${s.ok ? 'OK ' : 'ERR'} ${s.id.padEnd(12)} ${String(s.count).padStart(3)} items ${s.ms}ms ${s.error || ''}`);
  console.log(`calendario: ${data.calendarOk ? data.calendar.length + ' eventos' : 'ERR ' + data.calendarError}; noticias únicas: ${data.items.length}`);
  for (const e of data.calendar.filter((x) => x.country === 'USD' && x.impact !== 'low').slice(0, 12)) console.log(`  CAL ${e.date} ${e.time || 'sin hora'} [feed-raw→UTC] ${e.country} ${e.impact} ${e.title} prev=${e.previous} fc=${e.forecast}`);
  console.log('--- muestra de clasificación (más recientes) ---');
  for (const i of data.items.slice(0, 40)) { const c = classify(i); console.log(`${c.bias.padEnd(8)} ${String(c.score).padStart(3)} ${c.relevant ? 'R' : '-'} ${i.published.slice(5, 16)} [${i.source}] ${i.title.slice(0, 110)}`); }
  if (!data.sources.some((s) => s.ok) && !data.calendarOk) { console.error('Ninguna fuente respondió; no se actualiza news.json'); process.exit(1); }
  mkdirSync(new URL('../app/data/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../app/data/news.json', import.meta.url), JSON.stringify(data));
  console.log('app/data/news.json escrito');
}
