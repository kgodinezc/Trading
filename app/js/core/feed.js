// Lectura de feeds RSS/Atom y del calendario económico (XML) sin dependencias; se usa en Node (scripts/fetch-news.js).

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' };

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

const unCdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

export function stripHtml(s) {
  let t = unCdata(String(s ?? ''));
  if (/&lt;\/?[a-z]/i.test(t)) t = decodeEntities(t); // descripciones con HTML escapado
  return decodeEntities(t.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function tag(block, names) {
  for (const n of names) {
    const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i').exec(block);
    if (m) return m[1];
  }
  return null;
}

const safeUrl = (u) => { try { const x = new URL(String(u).trim()); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

export const isoUtc = (ms) => new Date(ms).toISOString().slice(0, 19);

export function parseFeed(xml) {
  const items = [];
  const re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi;
  let m;
  while ((m = re.exec(String(xml ?? '')))) {
    const b = m[0];
    const title = stripHtml(tag(b, ['title']) ?? '');
    let link = tag(b, ['link']);
    link = link && stripHtml(link) ? stripHtml(link) : (/<link[^>]*href=["']([^"']+)["']/i.exec(b) || [])[1] || tag(b, ['guid']);
    const date = tag(b, ['pubDate', 'published', 'updated', 'dc:date']);
    const ms = date ? Date.parse(stripHtml(date)) : NaN;
    const src = tag(b, ['source']);
    if (!title || !Number.isFinite(ms)) continue;
    items.push({
      title,
      link: safeUrl(decodeEntities(link ?? '')),
      published: isoUtc(ms),
      summary: stripHtml(tag(b, ['description', 'summary', 'content:encoded', 'content']) ?? '').slice(0, 280),
      sourceName: src ? stripHtml(src) : null,
    });
  }
  return items;
}

// Quita el sufijo " - Medio" que agrega Google News y devuelve el medio.
export function splitTitleSource(title, sourceName) {
  const i = title.lastIndexOf(' - ');
  if (i > 0 && title.length - i < 40) return { title: title.slice(0, i).trim(), sourceName: sourceName || title.slice(i + 3).trim() };
  return { title, sourceName };
}

export const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Calendario (formato ForexFactory): <event><title/><country/><date>MM-DD-YYYY</date><time>8:30am</time><impact/>...
// `tzOffset` = horas de diferencia de la hora del feed respecto a UTC (hora feed = UTC + tzOffset).
export function parseCalendar(xml, { tzOffset = 0 } = {}) {
  const out = [];
  const re = /<event>[\s\S]*?<\/event>/gi;
  let m;
  while ((m = re.exec(String(xml ?? '')))) {
    const b = m[0];
    const g = (n) => { const v = tag(b, [n]); return v == null ? '' : stripHtml(v); };
    const d = /^(\d{2})-(\d{2})-(\d{4})$/.exec(g('date'));
    if (!d) continue;
    const t = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(g('time'));
    let time = null, dateOnly = `${d[3]}-${d[1]}-${d[2]}`;
    if (t) {
      let h = parseInt(t[1], 10) % 12; if (/pm/i.test(t[3])) h += 12;
      time = isoUtc(Date.UTC(+d[3], +d[1] - 1, +d[2], h, +t[2]) - tzOffset * 3600e3);
    }
    out.push({
      title: g('title'), country: g('country').toUpperCase(), impact: g('impact').toLowerCase() || 'low',
      time, date: dateOnly, forecast: g('forecast') || null, previous: g('previous') || null, actual: g('actual') || null,
      link: safeUrl(decodeEntities(g('url'))),
    });
  }
  return out;
}
