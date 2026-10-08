// Lectura automática del impacto de una noticia / evento sobre el ORO (XAUUSD) por reglas de palabras clave.
// Es una heurística explicable y orientativa: confirma siempre con el gráfico.

const W = '(?:\\w+ ){0,2}';
// score > 0: favorece al oro (alcista); score < 0: lo presiona (bajista)
const RULES = [
  // Fed y tasas
  { topic: 'Fed y tasas', score: -2, re: /\b(no|fewer|less|delays?|delayed|rules? out|dims?|pares?|pared|pushes? back on|scal(es|ed) back|fades?|fading)\b ?(?:\w+ ){0,3}(rate[- ])?cuts?\b|\b(rate[- ]cut|cut) (bets|expectations|hopes|odds) (fade|fall|wane|recede|drop|dim|slip)|\bhawkish\b|\b(raise|raises|raising|hike|hikes|hiking) (the |its )?(benchmark |interest |policy )?rates?\b|\brate[- ]hikes?\b|\b(rate|inflation) (hike )?fears\b|\brevives? (rate|inflation|hike)\b|\bhigher[- ]for[- ]longer\b|\btighten(s|ing)?\b/,
    why: 'Tono restrictivo o menos recortes de tasas: sube el rendimiento real y el dólar, presión bajista para el oro.' },
  { topic: 'Fed y tasas', score: 2, re: /\bdovish\b|\b(rate cuts?|cuts? (interest )?rates?|cutting rates|rate-cut)\b|\b(more|further|monetary) easing\b|\bpauses? (rate )?hikes?\b|\bpivot\b/,
    why: 'Expectativa de recortes o tono moderado de la Fed: baja el rendimiento real, favorable al oro.', negatedBy: 0 },
  // Dólar
  { topic: 'Dólar', score: 2, re: new RegExp(`\\b(dollar|dxy|usd|greenback)\\b[^,;.]{0,40}\\b(falls?|fell|drops?|dropped|slips?|slipped|weakens?|weakened|slides?|slid|declines?|declined|retreats?|sinks?|tumbles?|softens?|lower)\\b|\\bweaker (us )?dollar\\b|\\bdollar weakness\\b`),
    why: 'Dólar más débil: el oro, cotizado en USD, se abarata para otras monedas y suele subir.' },
  { topic: 'Dólar', score: -2, re: /\b(dollar|dxy|usd|greenback)\b[^,;.]{0,40}\b(rises?|rose|gains?|gained|jumps?|jumped|strengthens?|surges?|climbs?|rall(y|ies|ied)|firms?|advances?|higher)\b|\bstronger (us )?dollar\b|\bdollar strength\b/,
    why: 'Dólar más fuerte: encarece el oro para el resto del mundo y suele presionarlo.' },
  // Rendimientos
  { topic: 'Rendimientos', score: 2, re: /\b(treasury |bond |us |10-year |2-year )?yields?\b[^,;.]{0,30}\b(fall|falls|fell|drop|drops|dropped|slip|slips|slipped|decline|declines|declined|retreat|retreats|tumble|tumbles|ease|eases|eased|lower)\b/,
    why: 'Caen los rendimientos de los bonos: baja el costo de oportunidad de tener oro.' },
  { topic: 'Rendimientos', score: -2, re: /\b(yields?)\b[^,;.]{0,30}\b(hit|hits|hitting|test|tests|testing|reach|reaches|reaching)\b[^,;.]{0,25}\bhighs?\b|\bbond (sell-?off|rout|slump)\b|\bsell-?off in (treasuries|bonds)\b/,
    why: 'Los rendimientos de los bonos en máximos o con ventas fuertes de bonos: aumenta el costo de oportunidad del oro.' },
  { topic: 'Rendimientos', score: -2, re: /\b(treasury |bond |us |10-year |2-year )?yields?\b[^,;.]{0,30}\b(rise|rises|rose|jump|jumps|jumped|climb|climbs|climbed|surge|surges|surged|spike|spikes|higher|hit highs?)\b/,
    why: 'Suben los rendimientos de los bonos: aumenta el costo de oportunidad del oro.' },
  // Datos EE. UU.: débil = alcista; fuerte = bajista
  { topic: 'Datos EE. UU.', score: 2, re: /\b(payrolls?|jobs|hiring|employment|job growth|adp)\b[^,;.]{0,40}\b(miss(es|ed)?|weaker|slows?|slowed|slump\w*|disappoint\w*|falls?|fell|below|cooling)\b|\bunemployment( rate)?\b[^,;.]{0,30}\b(rises?|rose|climbs?|jumps?|higher|increases?)\b|\bjobless claims\b[^,;.]{0,30}\b(rise|rises|rose|jump|jumps|climb|climbs|higher|increase)\b|\b(cpi|inflation|pce|ppi)\b[^,;.]{0,40}\b(cools?|cooled|eases?|eased|slows?|slowed|softer|lower|falls?|fell|declines?|below)\b|\b(gdp|retail sales|pmi|ism|manufacturing|consumer (confidence|sentiment)|durable goods|factory)\b[^,;.]{0,40}\b(miss(es|ed)?|contracts?|contracted|shrinks?|weaker|falls?|fell|slump\w*|disappoint\w*|below|declines?)\b/,
    why: 'Datos de EE. UU. más débiles de lo esperado: refuerzan apuestas de recortes y debilitan al dólar (alcista para el oro).' },
  { topic: 'Datos EE. UU.', score: -2, re: /\b(payrolls?|jobs|hiring|employment|job growth|adp)\b[^,;.]{0,40}\b(beat|beats|stronger|surge\w*|jump\w*|top\w*|above|solid|robust|exceed\w*)\b|\bunemployment( rate)?\b[^,;.]{0,30}\b(falls?|fell|drops?|dropped|declines?|lower)\b|\bjobless claims\b[^,;.]{0,30}\b(fall|falls|fell|drop|drops|dropped|decline|declines|lower)\b|\b(cpi|inflation|pce|ppi)\b[^,;.]{0,40}\b(hotter|accelerat\w*|rises?|rose|jumps?|higher|surges?|above|sticky|stubborn)\b|\b(gdp|retail sales|pmi|ism|manufacturing|consumer (confidence|sentiment)|durable goods|factory)\b[^,;.]{0,40}\b(beat|beats|expands?|expanded|stronger|rises?|rose|jumps?|above|robust|exceed\w*)\b/,
    why: 'Datos de EE. UU. más fuertes de lo esperado: apoyan al dólar y a los rendimientos, presión bajista para el oro.' },
  // Geopolítica y comercio
  { topic: 'Geopolítica', score: 2, re: /\bsafe[- ]haven\b|\bflight to safety\b|\bhaven (demand|buying|flows?)\b/,
    why: 'Demanda de activos refugio: típicamente favorece al oro.' },
  { topic: 'Geopolítica', score: 1, re: /\b(war|missiles?|airstrikes?|invasion|invades?|escalat\w+|military|tensions?|conflict|attacks?|attacked|sanctions|terror\w*|hostilities|nuclear|coup|blockade)\b/,
    why: 'Tensión geopolítica: aumenta la demanda de refugio.' },
  { topic: 'Geopolítica', score: -1, re: /\b(ceasefire|cease-fire|peace (deal|talks|agreement)|truce|de-?escalat\w*|tensions? (ease|eases|eased|cool|cools|cooled))\b/,
    why: 'Distensión geopolítica: baja la demanda de refugio.' },
  { topic: 'Comercio', score: 1, re: /\btariffs?\b|\btrade war\b/,
    why: 'Incertidumbre comercial: suele reforzar la demanda de refugio (pero también puede fortalecer al dólar).' },
  { topic: 'Comercio', score: -1, re: /\btrade (deal|agreement)\b/,
    why: 'Acuerdo comercial: reduce la incertidumbre y el atractivo de refugio.' },
  // Bancos centrales y demanda
  { topic: 'Bancos centrales', score: 2, re: /\b(central banks?|pboc|people's bank|reserve bank|national bank)\b[^,;.]{0,60}\b(buy(s|ing)?|bought|purchas\w+|add(s|ed)?|accumulat\w+|boost(s|ed)?)\b[^,;.]{0,40}\bgold\b|\bgold reserves?\b[^,;.]{0,30}\b(rise|rose|increase\w*|up|jump\w*|climb\w*)\b|\bcentral[- ]bank gold (buying|demand|purchases)\b/,
    why: 'Compras de oro de bancos centrales: demanda estructural que sostiene el precio.' },
  { topic: 'Bancos centrales', score: -1, re: /\bcentral banks?\b[^,;.]{0,40}\b(sell|sells|selling|sold|cut|reduce\w*)\b[^,;.]{0,30}\bgold\b/,
    why: 'Ventas o menores compras de oro de bancos centrales: resta soporte.' },
  { topic: 'ETF y posicionamiento', score: 1, re: /\b(etf|spdr|gld|ishares|holdings)\b[^,;.]{0,40}\b(inflows?|rise|rises|rose|increase\w*|jump\w*|climb\w*|rebound\w*)\b|\binflows? (into|to) gold\b|\b(speculators?|hedge funds?|money managers?)\b[^,;.]{0,40}\b(boost|raise|increase|add|lift)\w*\b[^,;.]{0,30}\bgold\b/,
    why: 'Entradas en ETF o más posiciones largas especulativas en oro: flujo comprador.' },
  { topic: 'ETF y posicionamiento', score: -1, re: /\b(etf|spdr|gld|ishares|holdings)\b[^,;.]{0,40}\b(outflows?|fall|falls|fell|drop\w*|declin\w*|redemptions?)\b|\boutflows? from gold\b|\b(speculators?|hedge funds?|money managers?)\b[^,;.]{0,40}\b(cut|reduce|trim|slash)\w*\b[^,;.]{0,30}\bgold\b/,
    why: 'Salidas de ETF o recorte de posiciones largas en oro: flujo vendedor.' },
  // Precio (momentum): descripción del movimiento, no una causa
  { topic: 'Precio del oro', score: 1, re: /\b(gold|xau\/?usd|bullion)\b(?! (miners?|stocks?|shares))(?: (?:price|prices|futures|spot))?(?: \w+){0,2} (rises?|rose|jumps?|jumped|surges?|surged|climbs?|climbed|rall(y|ies|ied)|gains?|gained|advances?|hits? (a )?(record|all-time|\w+-?week high|high)|extends gains|rebounds?|soars?|spikes?)\b|\b(record|all-time) high\b[^,;.]{0,25}\bgold\b|\b(supports?|lifts?|boosts?|underpins?)\b[^,;.]{0,15}\b(gold|xau|bullion)\b/,
    why: 'El oro viene subiendo (momentum reciente; describe el movimiento, no su causa).' },
  { topic: 'Precio del oro', score: -1, re: /\b(gold|xau\/?usd|bullion)\b(?! (miners?|stocks?|shares))(?: (?:price|prices|futures|spot))?(?: \w+){0,2} (falls?|fell|slips?|slipped|drops?|dropped|declines?|declined|retreats?|slides?|slid|tumbles?|sinks?|extends losses|pressured|weighs?|plunges?|plunged|slumps?|slumped|crashes|sell-?off)\b|\b(gold|xau\/?usd|bullion)\b[^,;.]{0,40}\b(hits?|reach(es)?|touch(es)?|falls? to|drops? to|sinks? to|slumps? to)\b[^,;.]{0,25}\blows?\b|\b(pressure|weighs?|weighing|drags?|dragging|hurts?)\b[^,;.]{0,15}\b(on )?(gold|xau|bullion)\b|\bprofit[- ]taking\b|\b\w+-?week low\b[^,;.]{0,25}\bgold\b/,
    why: 'El oro viene cayendo (momentum reciente; describe el movimiento, no su causa).' },
  // Apetito por riesgo
  { topic: 'Riesgo (bolsas)', score: -1, re: /\b(stocks?|equities|wall street|s&p 500|nasdaq|dow)\b[^,;.]{0,30}\b(record|rall(y|ies|ied)|surge[sd]?|jump(s|ed)?|climb(s|ed)?)\b/,
    why: 'Apetito por riesgo alto: resta atractivo a los activos refugio.' },
  { topic: 'Riesgo (bolsas)', score: 1, re: /\b(stocks?|equities|wall street|s&p 500|nasdaq|dow)\b[^,;.]{0,30}\b(plunge[sd]?|tumble[sd]?|sell-?off|crash\w*|slump\w*|sink|sinks|slide[sd]?)\b/,
    why: 'Aversión al riesgo: puede impulsar la demanda de refugio.' },
];

const RELEVANT = /\b(gold|xau|bullion|silver|fed|fomc|powell|treasury|treasuries|dollar|dxy|inflation|jobs|payrolls|cpi|pce|tariffs?|opec|oil|ecb|boj|boe|central bank|rate cut|yields?|recession|geopolit\w*)\b/i;

const STOCK_PROMO = /\((?:TSX|TSXV|NYSE|NASDAQ|ASX|LSE|CVE|NYSEAMERICAN)[:\s][A-Z.]+\)|\b(fair value|drill results|price target|analyst ratings?)\b/i;

export function classify(item) {
  const text = `${item.title} ${item.summary || ''}`.toLowerCase().slice(0, 500);
  const hits = [];
  // La regla de recorte "alcista" se anula si hay una negación ("no cuts", "fewer cuts").
  const negated = RULES[0].re.test(text);
  for (const r of RULES) {
    if (r.negatedBy !== undefined && negated) continue;
    if (r.re.test(text)) hits.push(r);
  }
  // Por tema y signo se cuenta solo la regla más fuerte
  const best = new Map();
  for (const r of hits) {
    const k = `${r.topic}|${Math.sign(r.score)}`;
    if (!best.has(k) || Math.abs(r.score) > Math.abs(best.get(k).score)) best.set(k, r);
  }
  const used = [...best.values()];
  const pos = used.filter((r) => r.score > 0).reduce((a, r) => a + r.score, 0);
  const neg = used.filter((r) => r.score < 0).reduce((a, r) => a + r.score, 0);
  const score = pos + neg;
  let bias = 'neutral';
  if (pos >= 1 && neg <= -1 && Math.min(pos, -neg) >= 1 && Math.abs(score) < 2) bias = 'mixto';
  else if (score >= 1) bias = 'alcista';
  else if (score <= -1) bias = 'bajista';
  const strength = Math.min(3, Math.abs(score));
  return {
    bias, score, strength: bias === 'mixto' ? Math.min(3, Math.max(pos, -neg)) : strength,
    topics: [...new Set(used.map((r) => r.topic))],
    reasons: used.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).map((r) => ({ topic: r.topic, score: r.score, why: r.why })),
    relevant: used.length > 0 || (RELEVANT.test(text) && !STOCK_PROMO.test(`${item.title}`)),
  };
}

// ---- Calendario económico ----
const HIGHER_BEARISH = /non-?farm|nfp|employment change|average hourly earnings|retail sales|cpi|ppi|pce|gdp|ism|pmi|durable goods|consumer (confidence|sentiment)|jolts|housing starts|industrial production|adp|core/i;
const LOWER_BEARISH = /unemployment (rate|claims)|jobless claims/i;
const SPEECH = /speaks|testifies|press conference|statement|rate decision|interest rate|federal funds|fomc|minutes|monetary policy/i;

const parseNum = (s) => {
  if (s == null || s === '') return null;
  const m = /(-?\d+(?:[.,]\d+)?)\s*([kmbt%]?)/i.exec(String(s).replace(/\s/g, ''));
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2].toLowerCase()] ?? 1;
  return parseFloat(m[1].replace(',', '.')) * mult;
};

export function classifyEvent(ev) {
  const t = ev.title || '';
  let kind = 'otro', how = '';
  if (LOWER_BEARISH.test(t)) { kind = 'inverso'; how = 'Si la cifra sale por debajo de lo previsto (menos desempleo/solicitudes) → dólar al alza → bajista para el oro; si sale por encima → alcista.'; }
  else if (SPEECH.test(t)) { kind = 'discurso'; how = 'Depende del tono: restrictivo (hawkish) → bajista para el oro; moderado (dovish) → alcista. Espera volatilidad y spreads altos.'; }
  else if (HIGHER_BEARISH.test(t)) { kind = 'directo'; how = 'Si la cifra supera lo previsto → dólar y rendimientos al alza → bajista para el oro; si queda por debajo → alcista.'; }
  else if (ev.country && ev.country !== 'USD') how = 'No es de EE. UU., pero puede mover al dólar por correlación (EUR, GBP, JPY) y afectar indirectamente al oro.';
  const a = parseNum(ev.actual), f = parseNum(ev.forecast);
  let surprise = null;
  if (a != null && f != null && a !== f) {
    const above = a > f;
    const bearish = kind === 'directo' ? above : kind === 'inverso' ? !above : null;
    if (bearish !== null) surprise = { above, bias: bearish ? 'bajista' : 'alcista' };
  }
  return { kind, how, surprise };
}

// ---- Resumen del sesgo reciente ----
export function summarizeBias(items, nowMs, { hours = 12, halfLifeH = 6 } = {}) {
  const from = nowMs - hours * 3600e3;
  const recent = items.filter((i) => Date.parse(`${i.published}Z`) >= from && i.impact);
  let net = 0, bull = 0, bear = 0, mixed = 0;
  const topics = new Map();
  for (const i of recent) {
    const ageH = Math.max(0, (nowMs - Date.parse(`${i.published}Z`)) / 3600e3);
    const w = Math.pow(0.5, ageH / halfLifeH);
    if (i.impact.bias === 'alcista') bull++; else if (i.impact.bias === 'bajista') bear++; else if (i.impact.bias === 'mixto') mixed++;
    net += i.impact.score * w;
    for (const r of i.impact.reasons) {
      const t = topics.get(r.topic) || { topic: r.topic, net: 0, bull: 0, bear: 0 };
      t.net += r.score * w; if (r.score > 0) t.bull++; else t.bear++;
      topics.set(r.topic, t);
    }
  }
  const label = net >= 6 ? 'alcista' : net >= 2 ? 'ligeramente alcista' : net <= -6 ? 'bajista' : net <= -2 ? 'ligeramente bajista' : 'neutral / dividido';
  return { net, label, bull, bear, mixed, total: recent.length, topics: [...topics.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)) };
}
