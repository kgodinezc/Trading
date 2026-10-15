import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, parseCalendar, splitTitleSource, normTitle, decodeEntities } from '../app/js/core/feed.js';
import { classify, classifyEvent, summarizeBias } from '../app/js/core/newsimpact.js';
import { build } from '../scripts/fetch-news.js';

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Gold climbs as dollar slips - Reuters]]></title><link>https://example.com/a?x=1&amp;y=2</link><pubDate>Wed, 08 Oct 2026 14:30:00 GMT</pubDate><description>&lt;p&gt;Gold &amp;amp; more&lt;/p&gt;</description><source url="https://reuters.com">Reuters</source></item>
<item><title>Sin fecha</title><link>https://example.com/b</link></item>
<item><title>Peligroso</title><link>javascript:alert(1)</link><pubDate>Wed, 08 Oct 2026 14:31:00 GMT</pubDate></item>
</channel></rss>`;
const ATOM = `<feed><entry><title>Fed statement</title><link rel="alternate" href="https://fed.gov/x"/><updated>2026-10-08T18:00:00Z</updated><summary>Texto</summary></entry></feed>`;
const CAL = `<weeklyevents>
<event><title><![CDATA[Non-Farm Employment Change]]></title><country>USD</country><date><![CDATA[10-02-2026]]></date><time><![CDATA[8:30am]]></time><impact><![CDATA[High]]></impact><forecast><![CDATA[150K]]></forecast><previous><![CDATA[140K]]></previous></event>
<event><title>Bank Holiday</title><country>JPY</country><date>10-08-2026</date><time>All Day</time><impact>Low</impact></event>
</weeklyevents>`;

test('parseFeed lee RSS y Atom, decodifica y descarta lo inválido', () => {
  const r = parseFeed(RSS);
  assert.equal(r.length, 2); // sin fecha se descarta
  assert.equal(r[0].title, 'Gold climbs as dollar slips - Reuters');
  assert.equal(r[0].link, 'https://example.com/a?x=1&y=2');
  assert.equal(r[0].published, '2026-10-08T14:30:00');
  assert.equal(r[0].summary, 'Gold & more');
  assert.equal(r[0].sourceName, 'Reuters');
  assert.equal(r[1].link, null); // javascript: no es un enlace válido
  const a = parseFeed(ATOM);
  assert.equal(a[0].link, 'https://fed.gov/x');
  assert.equal(a[0].published, '2026-10-08T18:00:00');
});

test('helpers de feed', () => {
  assert.equal(decodeEntities('A &amp; B &#39;c&#39; &#x41;'), "A & B 'c' A");
  assert.deepEqual(splitTitleSource('Gold rises - Kitco', null), { title: 'Gold rises', sourceName: 'Kitco' });
  assert.equal(normTitle('Gold Rises!  Again'), 'gold rises again');
});

test('parseCalendar convierte la hora del feed a UTC', () => {
  const utc = parseCalendar(CAL, { tzOffset: 0 });
  assert.equal(utc[0].time, '2026-10-02T08:30:00');
  assert.equal(utc[0].impact, 'high');
  const et = parseCalendar(CAL, { tzOffset: -4 }); // el feed estaría en hora del Este (EDT)
  assert.equal(et[0].time, '2026-10-02T12:30:00');
  assert.equal(utc[1].time, null);
  assert.equal(utc[1].date, '2026-10-08');
});

test('classify: sesgo para el oro', () => {
  const c = (t) => classify({ title: t }).gold;
  assert.equal(c('Gold climbs as dollar slips and Treasury yields fall').bias, 'alcista');
  assert.equal(c('Gold falls as dollar gains ahead of Fed minutes').bias, 'bajista');
  assert.equal(c('Fed officials signal fewer rate cuts this year').bias, 'bajista');
  assert.equal(c('Fed signals rate cuts could come sooner').bias, 'alcista');
  assert.equal(c('US payrolls beat expectations, unemployment rate falls').bias, 'bajista');
  assert.equal(c('US jobless claims rise more than expected').bias, 'alcista');
  assert.equal(c('Gold hits record high as safe-haven demand surges').bias, 'alcista');
  assert.equal(c('Central banks keep buying gold, PBOC adds to reserves').bias, 'alcista');
  const n = c('Apple unveils new iPhone');
  assert.equal(n.bias, 'neutral');
  assert.equal(n.relevant, false);
  assert.ok(c('Gold climbs as dollar slips').reasons.length >= 2);
});

test('classifyEvent: lectura y sorpresa por activo', () => {
  assert.equal(classifyEvent({ title: 'Non-Farm Employment Change' }).kind, 'crecimiento');
  assert.equal(classifyEvent({ title: 'CPI m/m' }).kind, 'inflacion');
  assert.equal(classifyEvent({ title: 'Unemployment Claims' }).kind, 'inverso');
  assert.equal(classifyEvent({ title: 'FOMC Member Powell Speaks' }).kind, 'discurso');
  assert.equal(classifyEvent({ title: 'Crude Oil Inventories' }).kind, 'crudo');
  const cpi = classifyEvent({ title: 'CPI m/m', actual: '0.5%', forecast: '0.3%' });
  assert.equal(cpi.surprise.gold.bias, 'bajista');
  assert.equal(cpi.surprise.nasdaq.bias, 'bajista');
  assert.equal(cpi.surprise.btc.bias, 'bajista');
  assert.equal(cpi.surprise.oil, null); // sin efecto claro
  const claims = classifyEvent({ title: 'Unemployment Claims', actual: '230K', forecast: '220K' });
  assert.equal(claims.surprise.gold.bias, 'alcista');
  assert.equal(claims.surprise.oil.bias, 'bajista');
  const eia = classifyEvent({ title: 'Crude Oil Inventories', actual: '3.2M', forecast: '-1.0M' });
  assert.equal(eia.surprise.oil.bias, 'bajista'); // acumulación
  assert.equal(eia.surprise.gold, null);
  assert.equal(classifyEvent({ title: 'Unemployment Claims' }).surprise.gold, null);
  assert.ok(classifyEvent({ title: 'CPI m/m' }).how.sp500.length > 10);
});

test('summarizeBias pondera por antigüedad y por activo', () => {
  const now = Date.parse('2026-10-08T18:00:00Z');
  const mk = (t, title) => ({ published: t, title, impacts: classify({ title }) });
  const items = [
    mk('2026-10-08T17:30:00', 'Gold climbs as dollar slips and yields fall'),
    mk('2026-10-08T16:00:00', 'Central banks keep buying gold'),
    mk('2026-10-08T02:00:00', 'Gold falls as dollar gains'), // fuera de la ventana de 12 h
    mk('2026-10-08T17:00:00', 'Bitcoin ETF inflows hit record as BTC tops $120,000'),
  ];
  const g = summarizeBias(items, now, { hours: 12, asset: 'gold' });
  assert.equal(g.total, 2);
  assert.equal(g.bull, 2);
  assert.match(g.label, /alcista/);
  const b = summarizeBias(items, now, { hours: 12, asset: 'btc' });
  assert.ok(b.total >= 1 && b.bull >= 1);
  assert.equal(summarizeBias(items, now, { hours: 12, asset: 'oil' }).total, 0);
});

test('build: une fuentes, deduplica, descarta antiguas y tolera fallos', async () => {
  const now = Date.parse('2026-10-08T18:00:00Z');
  const fetcher = async (url) => {
    if (url.includes('google.com')) return RSS;                   // 4 fuentes de Google con el mismo contenido
    if (url.includes('fxstreet')) return ATOM;
    if (url.includes('faireconomy')) return CAL;
    throw new Error('HTTP 403');
  };
  const d = await build({ now, fetcher });
  assert.equal(d.items.filter((i) => i.title === 'Gold climbs as dollar slips').length, 1);
  assert.ok(d.sources.some((s) => !s.ok && /403/.test(s.error)));
  assert.ok(d.sources.some((s) => s.ok));
  assert.equal(d.calendarOk, true);
  assert.equal(d.items.find((i) => i.title === 'Gold climbs as dollar slips').source, 'Reuters');
  const old = await build({ now: Date.parse('2026-10-20T00:00:00Z'), fetcher });
  assert.equal(old.items.length, 0); // todo es más viejo que 72 h
});

test('classify: titulares reales (Fed hawkish, rendimientos en máximos, oro en mínimos)', () => {
  const c = (t) => classify({ title: t }).gold;
  for (const t of [
    'Gold price hits two-month low as oil surge revives rate fears',
    'Gold futures slump to two-month low on stronger dollar, high yields',
    'Treasury Yields Keep Hitting New Highs. Can Savers Still Cash In?',
    'Fed policymakers divided over rate-hike logic in September, minutes show',
    'All Fed officials backed vote to hike benchmark rate: FOMC minutes',
    'The Pound slides back to the bottom of its range as the bond selloff resumes',
    'Gold Analysis: Fed Minutes Keep Pressure on XAU/USD',
  ]) assert.equal(c(t).bias, 'bajista', t);
  assert.equal(c('Equinox Gold (TSX:EQX) Could Be 35% Below Fair Value After Strong Drill Results').relevant, false);
  assert.equal(c('Fed minutes show some officials want to prepare for market stress').bias, 'neutral');
});

test('classify: cada activo tiene su propia lectura del mismo hecho', () => {
  const c = (t) => classify({ title: t });
  const hawk = c('Fed officials signal fewer rate cuts this year');
  for (const a of ['gold', 'sp500', 'nasdaq', 'btc']) assert.equal(hawk[a].bias, 'bajista', a);
  assert.ok(hawk.nasdaq.reasons[0].why.includes('tecnolog')); // texto propio de cada activo
  const dove = c('Fed signals rate cuts could come sooner');
  for (const a of ['gold', 'sp500', 'nasdaq', 'btc']) assert.equal(dove[a].bias, 'alcista', a);
  // petróleo
  assert.equal(c('Oil jumps as OPEC+ agrees to deepen production cuts').oil.bias, 'alcista');
  assert.equal(c('US crude inventories fall by 4 million barrels, EIA says').oil.bias, 'alcista');
  assert.equal(c('Oil prices slide as demand fears mount').oil.bias, 'bajista');
  const hormuz = c('Strait of Hormuz tanker attack lifts Brent');
  assert.equal(hormuz.oil.bias, 'alcista');
  assert.equal(hormuz.sp500.bias, 'bajista');
  // índices
  assert.equal(c('Nasdaq falls as AI bubble worries hit chipmakers').nasdaq.bias, 'bajista');
  assert.equal(c('Wall Street stocks rally to record high as Nvidia surges').sp500.bias, 'alcista');
  // bitcoin
  assert.equal(c('Bitcoin ETF inflows hit record as BTC tops $120,000').btc.bias, 'alcista');
  assert.equal(c('SEC sues crypto exchange over unregistered securities').btc.bias, 'bajista');
  assert.equal(c('Crypto exchange hacked, $200 million stolen').btc.bias, 'bajista');
  assert.equal(c('Bitcoin slumps as liquidations top $1 billion').btc.bias, 'bajista');
  // los ETF de Bitcoin no cuentan como ETF de oro
  assert.equal(c('Bitcoin ETF inflows hit record').gold.bias, 'neutral');
  assert.equal(c('Gold ETF inflows rise as GLD holdings climb').gold.bias, 'alcista');
  // relevancia por activo
  const apple = c('Apple unveils new iPhone');
  for (const a of ['gold', 'oil', 'sp500', 'btc']) assert.equal(apple[a].relevant, false, a);
  assert.equal(c('Oil jumps as OPEC+ agrees to deepen production cuts').gold.relevant, false);
});

test('classify: titulares reales de cripto, petróleo e índices (octubre 2026)', () => {
  const c = (t) => classify({ title: t });
  assert.equal(c('Will a Fed Hold Ease Bitcoin Pressure as Hike Bets Rise Toward December?').btc.bias, 'bajista');
  assert.equal(c('Bitcoin Briefly Dips Below $80,000 as Volatility Roils Markets').btc.bias, 'bajista');
  assert.equal(c('Bitcoin Whipsaws as Crypto Liquidations Near $1 Billion').btc.bias, 'bajista');
  assert.equal(c('Nasdaq slides to near one-month low as AI rout deepens').nasdaq.bias, 'bajista');
  assert.equal(c('Iranian Ship Attacks Threaten Middle East Oil Exports as Tanker Traffic Slows').oil.bias, 'alcista');
  // empresas mineras y notas promocionales no son noticias del oro
  assert.equal(c('New PEA lifts value of Bonterra’s Quebec gold project to $665M').gold.relevant, false);
  assert.equal(c('A money changer arranges US dollar bills at a currency exchange counter in Manila').gold.relevant, false);
});
