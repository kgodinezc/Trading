// Lectura automática del impacto de una noticia / evento sobre varios activos por reglas de palabras clave.
// Es una heurística explicable y orientativa: confirma siempre con el gráfico.
// Cada regla trae el efecto (−3…+3) en [oro, petróleo, S&P 500, Nasdaq 100, Bitcoin]: el mismo hecho afecta distinto a cada activo.

export const ASSETS = [
  { id: 'gold', name: 'Oro', code: 'XAU/USD' },
  { id: 'oil', name: 'Petróleo', code: 'WTI / Brent' },
  { id: 'sp500', name: 'S&P 500', code: 'US500' },
  { id: 'nasdaq', name: 'Nasdaq 100', code: 'US100' },
  { id: 'btc', name: 'Bitcoin', code: 'BTC/USD' },
];
export const ASSET_IDS = ASSETS.map((a) => a.id);
export const assetName = (id) => ASSETS.find((a) => a.id === id)?.name || id;

const UP = String.raw`(?:rises?|rose|jumps?|jumped|surges?|surged|climbs?|climbed|rall(?:y|ies|ied)|gains?|gained|advances?|advanced|soars?|soared|spikes?|spiked|rebounds?|rebounded|extends gains)`;
const DOWN = String.raw`(?:falls?|fell|slips?|slipped|drops?|dropped|declines?|declined|retreats?|retreated|slides?|slid|tumbles?|tumbled|sinks?|sank|plunges?|plunged|slumps?|slumped|crashes|crashed|extends losses|sell-?off)`;
const R = (strings, ...v) => new RegExp(String.raw(strings, ...v));

// e = [oro, petróleo, S&P 500, Nasdaq 100, Bitcoin]
const RULES = [
  // ---- Fed y tasas ----
  { id: 'hawk', topic: 'Fed y tasas', e: [-2, -1, -2, -2, -2],
    re: /\b(no|fewer|less|delays?|delayed|rules? out|dims?|pares?|pared|pushes? back on|scal(es|ed) back|fades?|fading)\b ?(?:\w+ ){0,3}(rate[- ])?cuts?\b|\b(rate[- ]cut|cut) (bets|expectations|hopes|odds) (fade|fall|wane|recede|drop|dim|slip)|\bhawkish\b|\b(raise|raises|raising|hike|hikes|hiking) (the |its )?(benchmark |interest |policy )?rates?\b|\brate[- ]hikes?\b|\b(rate|inflation) (hike )?fears\b|\brevives? (rate|inflation|hike)\b|\bhigher[- ]for[- ]longer\b|\btighten(s|ing)?\b/,
    why: { gold: 'Tono restrictivo o menos recortes de tasas: sube el rendimiento real y el dólar, presión bajista para el oro.',
      oil: 'Tasas más altas frenan el crecimiento y la demanda esperada de crudo (efecto débil).',
      sp500: 'Tasas más altas encarecen el financiamiento y reducen el valor de las acciones.',
      nasdaq: 'La tecnología es la más sensible a tasas altas: suele caer más que el resto del mercado.',
      btc: 'Menos liquidez y tasas más altas restan atractivo a Bitcoin como activo de riesgo.' } },
  { id: 'dove', topic: 'Fed y tasas', e: [2, 1, 2, 2, 2], unless: 'hawk',
    re: /\bdovish\b|\b(rate cuts?|cuts? (interest )?rates?|cutting rates|rate-cut)\b|\b(more|further|monetary) easing\b|\bpauses? (rate )?hikes?\b|\bpivot\b/,
    why: { gold: 'Expectativa de recortes o tono moderado de la Fed: baja el rendimiento real, favorable al oro.',
      oil: 'Tasas más bajas apoyan el crecimiento y la demanda esperada de crudo (efecto débil).',
      sp500: 'Recortes de tasas abaratan el financiamiento y apoyan las valuaciones de las acciones.',
      nasdaq: 'La tecnología se beneficia más que nadie de tasas más bajas.',
      btc: 'Más liquidez y tasas más bajas favorecen a Bitcoin como activo de riesgo.' } },
  // ---- Dólar ----
  { id: 'usd-down', topic: 'Dólar', e: [2, 1, 1, 1, 1],
    re: R`\b(dollar|dxy|usd|greenback)\b[^,;.]{0,40}\b(falls?|fell|drops?|dropped|slips?|slipped|weakens?|weakened|slides?|slid|declines?|declined|retreats?|sinks?|tumbles?|softens?|lower)\b|\bweaker (us )?dollar\b|\bdollar weakness\b`,
    why: { gold: 'Dólar más débil: el oro, cotizado en USD, se abarata para otras monedas y suele subir.',
      oil: 'Dólar débil abarata el crudo para otras monedas y suele apoyar su precio.',
      sp500: 'Dólar débil mejora las ganancias de las multinacionales (efecto leve).',
      nasdaq: 'Dólar débil mejora las ganancias en el exterior de las tecnológicas (efecto leve).',
      btc: 'Dólar débil suele acompañar más liquidez y apoyo a Bitcoin.' } },
  { id: 'usd-up', topic: 'Dólar', e: [-2, -1, -1, -1, -1],
    re: /\b(dollar|dxy|usd|greenback)\b[^,;.]{0,40}\b(rises?|rose|gains?|gained|jumps?|jumped|strengthens?|surges?|climbs?|rall(y|ies|ied)|firms?|advances?|higher)\b|\bstronger (us )?dollar\b|\bdollar strength\b/,
    why: { gold: 'Dólar más fuerte: encarece el oro para el resto del mundo y suele presionarlo.',
      oil: 'Dólar fuerte encarece el crudo para otras monedas y suele presionarlo.',
      sp500: 'Dólar fuerte resta valor a las ganancias de las multinacionales (efecto leve).',
      nasdaq: 'Dólar fuerte resta valor a las ganancias en el exterior de las tecnológicas (efecto leve).',
      btc: 'Dólar fuerte suele acompañar menos liquidez y presionar a Bitcoin.' } },
  // ---- Rendimientos de bonos ----
  { id: 'y-down', topic: 'Rendimientos', e: [2, 0, 1, 2, 1],
    re: /\b(treasury |bond |us |10-year |2-year )?yields?\b[^,;.]{0,30}\b(fall|falls|fell|drop|drops|dropped|slip|slips|slipped|decline|declines|declined|retreat|retreats|tumble|tumbles|ease|eases|eased|lower)\b/,
    why: { gold: 'Caen los rendimientos de los bonos: baja el costo de oportunidad de tener oro.',
      sp500: 'Rendimientos más bajos hacen más atractivas las acciones frente a los bonos.',
      nasdaq: 'Rendimientos más bajos benefician sobre todo a las tecnológicas, de valuaciones largas.',
      btc: 'Rendimientos más bajos mejoran el apetito por activos de riesgo como Bitcoin.' } },
  { id: 'y-up', topic: 'Rendimientos', e: [-2, 0, -1, -2, -1],
    re: /\b(yields?)\b[^,;.]{0,30}\b(hit|hits|hitting|test|tests|testing|reach|reaches|reaching)\b[^,;.]{0,25}\bhighs?\b|\bbond (sell-?off|rout|slump)\b|\bsell-?off in (treasuries|bonds)\b|\b(treasury |bond |us |10-year |2-year )?yields?\b[^,;.]{0,30}\b(rise|rises|rose|jump|jumps|jumped|climb|climbs|climbed|surge|surges|surged|spike|spikes|higher|hit highs?)\b/,
    why: { gold: 'Suben los rendimientos de los bonos: aumenta el costo de oportunidad del oro.',
      sp500: 'Rendimientos más altos hacen menos atractivas las acciones frente a los bonos.',
      nasdaq: 'Rendimientos más altos castigan sobre todo a las tecnológicas, de valuaciones largas.',
      btc: 'Rendimientos más altos restan apetito por activos de riesgo como Bitcoin.' } },
  // ---- Inflación (menor = alcista para todos salvo petróleo) ----
  { id: 'cpi-cool', topic: 'Inflación', e: [2, 0, 2, 2, 2],
    re: /\b(cpi|inflation|pce|ppi)\b[^,;.]{0,40}\b(cools?|cooled|eases?|eased|slows?|slowed|softer|lower|falls?|fell|declines?|below)\b/,
    why: { gold: 'Inflación más baja de lo esperado: refuerza apuestas de recortes y debilita al dólar (alcista para el oro).',
      sp500: 'Inflación más baja alimenta la expectativa de recortes de tasas: favorable para las acciones.',
      nasdaq: 'Inflación más baja alimenta la expectativa de recortes: muy favorable para la tecnología.',
      btc: 'Inflación más baja mejora la liquidez esperada y el apetito por Bitcoin.' } },
  { id: 'cpi-hot', topic: 'Inflación', e: [-2, 0, -2, -2, -2],
    re: /\b(cpi|inflation|pce|ppi)\b[^,;.]{0,40}\b(hotter|accelerat\w*|rises?|rose|jumps?|higher|surges?|above|sticky|stubborn)\b/,
    why: { gold: 'Inflación más alta de lo esperado: Fed más restrictiva, dólar y rendimientos al alza (bajista para el oro).',
      sp500: 'Inflación más alta aleja los recortes de tasas: presión para las acciones.',
      nasdaq: 'Inflación más alta aleja los recortes: presión fuerte para la tecnología.',
      btc: 'Inflación más alta apunta a tasas altas por más tiempo: presión para Bitcoin.' } },
  // ---- Empleo y crecimiento EE. UU. ----
  { id: 'data-weak', topic: 'Datos EE. UU.', e: [2, -1, -1, 0, 0],
    re: /\b(payrolls?|jobs|hiring|employment|job growth|adp)\b[^,;.]{0,40}\b(miss(es|ed)?|weaker|slows?|slowed|slump\w*|disappoint\w*|falls?|fell|below|cooling)\b|\bunemployment( rate)?\b[^,;.]{0,30}\b(rises?|rose|climbs?|jumps?|higher|increases?)\b|\bjobless claims\b[^,;.]{0,30}\b(rise|rises|rose|jump|jumps|climb|climbs|higher|increase)\b|\b(gdp|retail sales|pmi|ism|manufacturing|consumer (confidence|sentiment)|durable goods|factory)\b[^,;.]{0,40}\b(miss(es|ed)?|contracts?|contracted|shrinks?|weaker|falls?|fell|slump\w*|disappoint\w*|below|declines?)\b|\brecession (fears?|worries|risk|concerns?)\b/,
    why: { gold: 'Datos de EE. UU. más débiles de lo esperado: refuerzan apuestas de recortes y debilitan al dólar (alcista para el oro).',
      oil: 'Datos débiles anticipan menor demanda de crudo.',
      sp500: 'Datos débiles reducen la expectativa de ganancias (aunque pueden traer recortes de tasas): efecto leve a la baja.' } },
  { id: 'data-strong', topic: 'Datos EE. UU.', e: [-2, 1, 1, 0, -1],
    re: /\b(payrolls?|jobs|hiring|employment|job growth|adp)\b[^,;.]{0,40}\b(beat|beats|stronger|surge\w*|jump\w*|top\w*|above|solid|robust|exceed\w*)\b|\bunemployment( rate)?\b[^,;.]{0,30}\b(falls?|fell|drops?|dropped|declines?|lower)\b|\bjobless claims\b[^,;.]{0,30}\b(fall|falls|fell|drop|drops|dropped|decline|declines|lower)\b|\b(gdp|retail sales|pmi|ism|manufacturing|consumer (confidence|sentiment)|durable goods|factory)\b[^,;.]{0,40}\b(beat|beats|expands?|expanded|stronger|rises?|rose|jumps?|above|robust|exceed\w*)\b/,
    why: { gold: 'Datos de EE. UU. más fuertes de lo esperado: apoyan al dólar y a los rendimientos, presión bajista para el oro.',
      oil: 'Datos fuertes anticipan mayor demanda de crudo.',
      sp500: 'Datos fuertes apoyan las ganancias (aunque pueden alejar los recortes de tasas): efecto leve al alza.',
      btc: 'Datos fuertes suben los rendimientos y restan liquidez esperada: leve presión para Bitcoin.' } },
  // ---- Geopolítica y comercio ----
  { id: 'haven', topic: 'Geopolítica', e: [2, 0, -1, -1, 0],
    re: /\bsafe[- ]haven\b|\bflight to safety\b|\bhaven (demand|buying|flows?)\b/,
    why: { gold: 'Demanda de activos refugio: típicamente favorece al oro.', sp500: 'Fuga hacia refugios: señal de aversión al riesgo para las acciones.', nasdaq: 'Fuga hacia refugios: señal de aversión al riesgo para la tecnología.' } },
  { id: 'tension', topic: 'Geopolítica', e: [1, 1, -1, -1, -1],
    re: /\b(war|missiles?|airstrikes?|invasion|invades?|escalat\w+|military|tensions?|conflict|attacks?|attacked|sanctions|terror\w*|hostilities|nuclear|coup|blockade)\b/,
    why: { gold: 'Tensión geopolítica: aumenta la demanda de refugio.', oil: 'Tensión geopolítica: riesgo para el suministro de crudo.',
      sp500: 'Tensión geopolítica: aversión al riesgo, presión para las acciones.', nasdaq: 'Tensión geopolítica: aversión al riesgo, presión para la tecnología.', btc: 'Tensión geopolítica: aversión al riesgo (Bitcoin se comporta como activo de riesgo).' } },
  { id: 'calm', topic: 'Geopolítica', e: [-1, -1, 1, 1, 1],
    re: /\b(ceasefire|cease-fire|peace (deal|talks|agreement)|truce|de-?escalat\w*|tensions? (ease|eases|eased|cool|cools|cooled))\b/,
    why: { gold: 'Distensión geopolítica: baja la demanda de refugio.', oil: 'Distensión geopolítica: baja la prima de riesgo del crudo.', sp500: 'Distensión: mayor apetito por riesgo.', nasdaq: 'Distensión: mayor apetito por riesgo.', btc: 'Distensión: mayor apetito por riesgo.' } },
  { id: 'tariff', topic: 'Comercio', e: [1, -1, -1, -2, -1],
    re: /\btariffs?\b|\btrade war\b/,
    why: { gold: 'Incertidumbre comercial: suele reforzar la demanda de refugio (pero también puede fortalecer al dólar).', oil: 'Aranceles y guerra comercial restan demanda esperada de crudo.',
      sp500: 'Los aranceles encarecen costos y reducen ganancias: presión para las acciones.', nasdaq: 'Las tecnológicas dependen de cadenas de suministro y ventas globales: muy expuestas a aranceles.', btc: 'Incertidumbre comercial: aversión al riesgo.' } },
  { id: 'trade-deal', topic: 'Comercio', e: [-1, 1, 1, 1, 1],
    re: /\btrade (deal|agreement)\b/,
    why: { gold: 'Acuerdo comercial: reduce la incertidumbre y el atractivo de refugio.', oil: 'Acuerdo comercial: mejora la demanda esperada.', sp500: 'Acuerdo comercial: reduce la incertidumbre y apoya las acciones.', nasdaq: 'Acuerdo comercial: alivia a las tecnológicas.', btc: 'Acuerdo comercial: mayor apetito por riesgo.' } },
  // ---- Oro ----
  { id: 'gold-cb-buy', topic: 'Bancos centrales', e: [2, 0, 0, 0, 0],
    re: /\b(central banks?|pboc|people's bank|reserve bank|national bank)\b[^,;.]{0,60}\b(buy(s|ing)?|bought|purchas\w+|add(s|ed)?|accumulat\w+|boost(s|ed)?)\b[^,;.]{0,40}\bgold\b|\bgold reserves?\b[^,;.]{0,30}\b(rise|rose|increase\w*|up|jump\w*|climb\w*)\b|\bcentral[- ]bank gold (buying|demand|purchases)\b/,
    why: { gold: 'Compras de oro de bancos centrales: demanda estructural que sostiene el precio.' } },
  { id: 'gold-cb-sell', topic: 'Bancos centrales', e: [-1, 0, 0, 0, 0],
    re: /\bcentral banks?\b[^,;.]{0,40}\b(sell|sells|selling|sold|cut|reduce\w*)\b[^,;.]{0,30}\bgold\b/,
    why: { gold: 'Ventas o menores compras de oro de bancos centrales: resta soporte.' } },
  { id: 'gold-etf-in', topic: 'ETF y posicionamiento', e: [1, 0, 0, 0, 0],
    re: /\b(gold (etfs?|holdings)|gld|spdr gold|ishares gold)\b[^,;.]{0,40}\b(inflows?|rise|rises|rose|increase\w*|jump\w*|climb\w*|rebound\w*)\b|\binflows? (into|to) gold\b|\b(speculators?|hedge funds?|money managers?)\b[^,;.]{0,40}\b(boost|raise|increase|add|lift)\w*\b[^,;.]{0,30}\bgold\b/,
    why: { gold: 'Entradas en ETF o más posiciones largas especulativas en oro: flujo comprador.' } },
  { id: 'gold-etf-out', topic: 'ETF y posicionamiento', e: [-1, 0, 0, 0, 0],
    re: /\b(gold (etfs?|holdings)|gld|spdr gold|ishares gold)\b[^,;.]{0,40}\b(outflows?|fall|falls|fell|drop\w*|declin\w*|redemptions?)\b|\boutflows? from gold\b|\b(speculators?|hedge funds?|money managers?)\b[^,;.]{0,40}\b(cut|reduce|trim|slash)\w*\b[^,;.]{0,30}\bgold\b/,
    why: { gold: 'Salidas de ETF o recorte de posiciones largas en oro: flujo vendedor.' } },
  { id: 'gold-up', topic: 'Precio del oro', e: [1, 0, 0, 0, 0],
    re: R`\b(gold|xau\/?usd|bullion)\b(?! (miners?|stocks?|shares))(?: (?:price|prices|futures|spot))?(?: \w+){0,2} ${UP}\b|\bhits? (a )?(record|all-time) high\b[^,;.]{0,25}\bgold\b|\b(record|all-time) high\b[^,;.]{0,25}\bgold\b|\b(supports?|lifts?|boosts?|underpins?)\b[^,;.]{0,15}\b(gold|xau|bullion)\b`,
    why: { gold: 'El oro viene subiendo (momentum reciente; describe el movimiento, no su causa).' } },
  { id: 'gold-down', topic: 'Precio del oro', e: [-1, 0, 0, 0, 0],
    re: R`\b(gold|xau\/?usd|bullion)\b(?! (miners?|stocks?|shares))(?: (?:price|prices|futures|spot))?(?: \w+){0,2} ${DOWN}\b|\b(gold|xau\/?usd|bullion)\b[^,;.]{0,40}\b(hits?|reach(es)?|touch(es)?|falls? to|drops? to|sinks? to|slumps? to)\b[^,;.]{0,25}\blows?\b|\b(pressure|weighs?|weighing|drags?|dragging|hurts?)\b[^,;.]{0,15}\b(on )?(gold|xau|bullion)\b|\bprofit[- ]taking\b|\b\w+-?week low\b[^,;.]{0,25}\bgold\b`,
    why: { gold: 'El oro viene cayendo (momentum reciente; describe el movimiento, no su causa).' } },
  // ---- Petróleo ----
  { id: 'oil-cut', topic: 'Oferta de crudo', e: [0, 2, 0, 0, 0],
    re: /\b(opec\+?|saudi)\b[^,;.]{0,50}\b(cut|cuts|cutting|curb|curbs|reduce|reduces|lower)\b[^,;.]{0,30}\b(output|production|supply|supplies)\b|\b(production|output|supply) cuts?\b/,
    why: { oil: 'Recortes de producción de la OPEP+ reducen la oferta: alcista para el crudo.' } },
  { id: 'oil-raise', topic: 'Oferta de crudo', e: [0, -2, 0, 0, 0],
    re: /\b(opec\+?|saudi|russia)\b[^,;.]{0,50}\b(increase|raise|boost|hike|ramp up|add|lift)\w*\b[^,;.]{0,30}\b(output|production|supply)\b|\boversupply\b|\bsupply glut\b/,
    why: { oil: 'Más producción u oferta excedente: presión bajista para el crudo.' } },
  { id: 'oil-draw', topic: 'Inventarios de crudo', e: [0, 2, 0, 0, 0],
    re: /\b(crude|oil|gasoline|distillate)\b[^,;.]{0,30}\b(inventories|stockpiles|stocks)\b[^,;.]{0,25}\b(fall|falls|fell|drop|drops|dropped|decline\w*|draw\w*|down|plunge\w*|shrink\w*)\b|\b(inventor\w+|stockpiles?)\b[^,;.]{0,25}\bdraws?\b/,
    why: { oil: 'Los inventarios de crudo bajan (retiros): señal de demanda firme, alcista.' } },
  { id: 'oil-build', topic: 'Inventarios de crudo', e: [0, -2, 0, 0, 0],
    re: /\b(crude|oil|gasoline|distillate)\b[^,;.]{0,30}\b(inventories|stockpiles|stocks)\b[^,;.]{0,25}\b(rise|rises|rose|jump\w*|build\w*|increase\w*|climb\w*|surge\w*|swell\w*)\b|\b(inventor\w+|stockpiles?)\b[^,;.]{0,25}\bbuilds?\b/,
    why: { oil: 'Los inventarios de crudo suben (acumulación): señal de demanda débil o exceso de oferta, bajista.' } },
  { id: 'oil-demand-down', topic: 'Demanda de crudo', e: [0, -2, 0, 0, 0],
    re: /\b(oil|crude|brent|wti)\b[^,;.]{0,30}\bdemand\b[^,;.]{0,25}\b(fears?|worries|concerns?|weak\w*|slow\w*|drop\w*|falls?|declin\w*)\b|\bdemand (fears|worries|concerns|slowdown)\b[^,;.]{0,30}\b(oil|crude)\b/,
    why: { oil: 'Preocupación por la demanda de crudo: presión bajista.' } },
  { id: 'oil-demand-up', topic: 'Demanda de crudo', e: [0, 1, 0, 0, 0],
    re: /\b(china|india)\b[^,;.]{0,40}\b(oil|crude)\b[^,;.]{0,25}\b(demand|imports?)\b[^,;.]{0,25}\b(rise|rises|rose|surge\w*|jump\w*|strong\w*|record|increase\w*)\b/,
    why: { oil: 'Demanda de crudo de China/India al alza: apoyo para el precio.' } },
  { id: 'oil-disrupt', topic: 'Oferta de crudo', e: [0, 2, 0, 0, 0],
    re: /\b(strait of hormuz|oil (facility|facilities|field|fields|refinery|refineries|tanker|tankers|pipeline|terminal)|refiner\w+|red sea|houthi\w*)\b[^,;.]{0,40}\b(attack\w*|strike\w*|drone\w*|disrupt\w*|halt\w*|shut\w*|block\w*|seiz\w*|sanction\w*|explo\w+|fire)\b|\bsanctions? on (russian|iran\w*|venezuela\w*) (oil|crude)\b|\bsupply (disruption|concerns|fears|risks?)\b/,
    why: { oil: 'Riesgo de interrupción del suministro de crudo: alcista para el precio.' } },
  { id: 'oil-up', topic: 'Precio del petróleo', e: [0, 1, 0, 0, 0],
    re: R`\b(oil|crude|brent|wti)\b(?! (?:inventories|stockpiles|stocks|demand|exports|imports|output|production|supply|supplies))(?: (?:prices?|futures))?(?: \w+){0,2} ${UP}\b`,
    why: { oil: 'El crudo viene subiendo (momentum reciente; describe el movimiento, no su causa).' } },
  { id: 'oil-down', topic: 'Precio del petróleo', e: [0, -1, 0, 0, 0],
    re: R`\b(oil|crude|brent|wti)\b(?! (?:inventories|stockpiles|stocks|demand|exports|imports|output|production|supply|supplies))(?: (?:prices?|futures))?(?: \w+){0,2} ${DOWN}\b`,
    why: { oil: 'El crudo viene cayendo (momentum reciente; describe el movimiento, no su causa).' } },
  // ---- Bolsas (S&P 500 / Nasdaq 100) ----
  { id: 'stocks-up', topic: 'Bolsas', e: [-1, 1, 2, 2, 1],
    re: /\b(stocks?|equities|wall street|s&p 500|nasdaq|dow)\b[^,;.]{0,30}\b(record|rall(y|ies|ied)|surge[sd]?|jump(s|ed)?|climb(s|ed)?)\b/,
    why: { gold: 'Apetito por riesgo alto: resta atractivo a los activos refugio.', oil: 'Bolsas al alza reflejan optimismo sobre el crecimiento y la demanda.',
      sp500: 'Las bolsas suben (momentum reciente; describe el movimiento, no su causa).', nasdaq: 'Las bolsas suben (momentum reciente; describe el movimiento, no su causa).', btc: 'Apetito por riesgo alto: apoya a Bitcoin.' } },
  { id: 'stocks-down', topic: 'Bolsas', e: [1, -1, -2, -2, -1],
    re: /\b(stocks?|equities|wall street|s&p 500|nasdaq|dow)\b[^,;.]{0,30}\b(plunge[sd]?|tumble[sd]?|sell-?off|crash\w*|slump\w*|sink|sinks|slide[sd]?|fall|falls|fell|drop(s|ped)?|lower)\b/,
    why: { gold: 'Aversión al riesgo: puede impulsar la demanda de refugio.', oil: 'Bolsas a la baja reflejan temor por el crecimiento y la demanda.',
      sp500: 'Las bolsas caen (momentum reciente; describe el movimiento, no su causa).', nasdaq: 'Las bolsas caen (momentum reciente; describe el movimiento, no su causa).', btc: 'Aversión al riesgo: presiona a Bitcoin.' } },
  { id: 'tech-up', topic: 'Tecnología e IA', e: [0, 0, 1, 2, 1],
    re: R`\b(nasdaq( 100| composite)?|tech stocks?|big tech|technology (stocks?|sector)|chip(maker)?s?|semiconductors?|nvidia|apple|microsoft|alphabet|google|amazon|meta|tesla|broadcom|ai (stocks?|rally|boom))\b[^,;.]{0,35}\b(rall(y|ies|ied)|surge\w*|jump\w*|gains?|climb\w*|record|soar\w*|advance\w*)\b`,
    why: { sp500: 'Las tecnológicas pesan mucho en el S&P 500: su alza lo arrastra.', nasdaq: 'Rally de tecnología y semiconductores: apoyo directo al Nasdaq 100.', btc: 'Optimismo en tecnología suele acompañar apetito por riesgo.' } },
  { id: 'tech-down', topic: 'Tecnología e IA', e: [0, 0, -1, -2, -1],
    re: R`\b(nasdaq( 100| composite)?|tech stocks?|big tech|technology (stocks?|sector)|chip(maker)?s?|semiconductors?|nvidia|apple|microsoft|alphabet|google|amazon|meta|tesla|broadcom|ai (stocks?|bubble|spending))\b[^,;.]{0,35}\b(slump\w*|plunge\w*|tumble\w*|sell-?off|slide\w*|sink\w*|fall|falls|fell|drop\w*|bubble|doubts?)\b|\bai (bubble|selloff)\b`,
    why: { sp500: 'Las tecnológicas pesan mucho en el S&P 500: su caída lo arrastra.', nasdaq: 'Caída de tecnología y semiconductores: presión directa sobre el Nasdaq 100.', btc: 'Debilidad en tecnología suele acompañar aversión al riesgo.' } },
  { id: 'earn-up', topic: 'Resultados corporativos', e: [0, 0, 1, 1, 0],
    re: /\b(earnings|profits?|revenue|sales|results)\b[^,;.]{0,30}\b(beat|beats|top|tops|topped|surge\w*|jump\w*|strong|stronger|exceed\w*|above)\b|\bbeats? (earnings|estimates|expectations|forecasts)\b|\braises? (guidance|outlook|forecast)\b/,
    why: { sp500: 'Resultados por encima de lo esperado: apoyo para las acciones.', nasdaq: 'Resultados por encima de lo esperado: apoyo para las tecnológicas.' } },
  { id: 'earn-down', topic: 'Resultados corporativos', e: [0, 0, -1, -1, 0],
    re: /\b(earnings|profits?|revenue|sales|results)\b[^,;.]{0,30}\b(miss(es|ed)?|disappoint\w*|weak\w*|below|falls? short|slump\w*)\b|\bmisses? (earnings|estimates|expectations|forecasts)\b|\b(cuts?|lowers?|slashes) (guidance|outlook|forecast)\b|\bprofit warning\b/,
    why: { sp500: 'Resultados por debajo de lo esperado: presión para las acciones.', nasdaq: 'Resultados por debajo de lo esperado: presión para las tecnológicas.' } },
  // ---- Bitcoin ----
  { id: 'btc-etf-in', topic: 'ETF y flujos cripto', e: [0, 0, 0, 0, 2],
    re: /\b(bitcoin|btc|crypto\w*|ether\w*|spot)\b[^,;.]{0,30}\betfs?\b[^,;.]{0,30}\b(inflows?|net inflows?|rise|rises|record|attract\w*)\b|\betfs?\b[^,;.]{0,30}\binflows?\b[^,;.]{0,30}\b(bitcoin|btc|crypto\w*)\b/,
    why: { btc: 'Entradas de dinero en ETF de Bitcoin: flujo comprador institucional.' } },
  { id: 'btc-etf-out', topic: 'ETF y flujos cripto', e: [0, 0, 0, 0, -2],
    re: /\b(bitcoin|btc|crypto\w*|ether\w*|spot)\b[^,;.]{0,30}\betfs?\b[^,;.]{0,30}\b(outflows?|net outflows?|redemptions?|bleed\w*)\b|\betfs?\b[^,;.]{0,30}\boutflows?\b[^,;.]{0,30}\b(bitcoin|btc|crypto\w*)\b/,
    why: { btc: 'Salidas de dinero de ETF de Bitcoin: flujo vendedor institucional.' } },
  { id: 'btc-reg-up', topic: 'Regulación cripto', e: [0, 0, 0, 0, 2],
    re: /\b(sec|cftc|congress|senate|house|trump|white house)\b[^,;.]{0,50}\b(approv\w+|clear\w*|pass\w*|support\w*|friendly|advances?)\b[^,;.]{0,40}\b(bitcoin|crypto\w*|stablecoin\w*|digital assets?|etf)\b|\b(strategic bitcoin reserve)\b/,
    why: { btc: 'Avance regulatorio favorable para las criptomonedas: reduce el riesgo legal y atrae capital.' } },
  { id: 'btc-reg-down', topic: 'Regulación cripto', e: [0, 0, 0, 0, -2],
    re: /\b(sec|cftc|doj|congress|senate|china|regulators?)\b[^,;.]{0,50}\b(ban\w*|crack\w*|sues?|lawsuit|reject\w*|block\w*|charges?|probe|investigat\w+)\b[^,;.]{0,40}\b(bitcoin|crypto\w*|stablecoin\w*|digital assets?|exchange)\b/,
    why: { btc: 'Acciones regulatorias duras contra las criptomonedas: aumentan el riesgo legal.' } },
  { id: 'btc-hack', topic: 'Seguridad y quiebras cripto', e: [0, 0, 0, 0, -2],
    re: /^(?=.*\b(bitcoin|btc|crypto\w*|defi|exchange)\b).*\b(hack\w*|exploit\w*|stolen|breach|insolven\w*|bankrupt\w*|collapse\w*)\b/,
    why: { btc: 'Hackeo, quiebra o colapso en el ecosistema cripto: golpe a la confianza.' } },
  { id: 'btc-buy', topic: 'Compras institucionales', e: [0, 0, 0, 0, 2],
    re: /\b(microstrategy|strategy|treasury|corporate|institutional|sovereign|whale)\w*\b[^,;.]{0,40}\b(buy\w*|bought|purchas\w+|accumulat\w+|adds?|added)\b[^,;.]{0,30}\b(bitcoin|btc)\b/,
    why: { btc: 'Compras de Bitcoin por empresas, instituciones o grandes tenedores: demanda estructural.' } },
  { id: 'btc-liq', topic: 'Liquidaciones y ventas', e: [0, 0, 0, 0, -1],
    re: /^(?=.*\b(bitcoin|btc|crypto\w*)\b).*\b(liquidations?|liquidated|long squeeze|whales? (sell|dump)\w*|miners? (sell|dump)\w*)\b/,
    why: { btc: 'Liquidaciones forzadas o ventas de grandes tenedores/mineros: presión vendedora.' } },
  { id: 'btc-up', topic: 'Precio de Bitcoin', e: [0, 0, 0, 0, 1],
    re: R`\b(bitcoin|btc)\b(?: (?:price|prices))?(?: \w+){0,2} ${UP}\b|\b(bitcoin|btc)\b[^,;.]{0,30}\b(hits?|tops?|breaks? above|reclaims?)\b[^,;.]{0,20}\b(record|all-time|\$\d)`,
    why: { btc: 'Bitcoin viene subiendo (momentum reciente; describe el movimiento, no su causa).' } },
  { id: 'btc-down', topic: 'Precio de Bitcoin', e: [0, 0, 0, 0, -1],
    re: R`\b(bitcoin|btc)\b(?: (?:price|prices))?(?: \w+){0,2} ${DOWN}\b|\b(bitcoin|btc)\b[^,;.]{0,30}\b(breaks? below|drops? below|falls? below|loses?)\b`,
    why: { btc: 'Bitcoin viene cayendo (momentum reciente; describe el movimiento, no su causa).' } },
];

// Palabras que hacen que una noticia concierna a un activo aunque ninguna regla puntúe.
const KEYWORDS = {
  gold: /\b(gold|xau|bullion|safe[- ]haven|fed|fomc|powell|treasury|treasuries|dollar|dxy|inflation|jobs|payrolls|cpi|pce|tariffs?|central bank|rate cut|yields?|recession|geopolit\w*)\b/i,
  oil: /\b(oil|crude|brent|wti|opec\+?|petroleum|gasoline|refiner\w*|energy prices?|hormuz)\b/i,
  sp500: /\b(s&p 500|s&p|sp500|spx|wall street|dow jones|stocks?|equities|stock market|earnings)\b/i,
  nasdaq: /\b(nasdaq|tech stocks?|big tech|technology (stocks?|sector)|chipmakers?|semiconductors?|nvidia|artificial intelligence)\b|\bai\b/i,
  btc: /\b(bitcoin|btc|crypto\w*|ether(eum)?|stablecoins?|spot (bitcoin )?etfs?|binance|coinbase)\b/i,
};
const STOCK_PROMO = /\((?:TSX|TSXV|NYSE|NASDAQ|ASX|LSE|CVE|NYSEAMERICAN)[:\s][A-Z.]+\)|\b(fair value|drill results|price target|analyst ratings?)\b/i;

const IDX = { gold: 0, oil: 1, sp500: 2, nasdaq: 3, btc: 4 };

function evaluate(asset, hits, text, promo) {
  const i = IDX[asset];
  // por tema y signo cuenta solo la regla más fuerte
  const best = new Map();
  for (const r of hits) {
    if (!r.e[i]) continue;
    const k = `${r.topic}|${Math.sign(r.e[i])}`;
    if (!best.has(k) || Math.abs(r.e[i]) > Math.abs(best.get(k).e[i])) best.set(k, r);
  }
  const used = [...best.values()];
  const pos = used.filter((r) => r.e[i] > 0).reduce((a, r) => a + r.e[i], 0);
  const neg = used.filter((r) => r.e[i] < 0).reduce((a, r) => a + r.e[i], 0);
  const score = pos + neg;
  let bias = 'neutral';
  if (pos >= 1 && neg <= -1 && Math.abs(score) < 2) bias = 'mixto';
  else if (score >= 1) bias = 'alcista';
  else if (score <= -1) bias = 'bajista';
  const strength = bias === 'mixto' ? Math.min(3, Math.max(pos, -neg)) : Math.min(3, Math.abs(score));
  const kw = KEYWORDS[asset].test(text);
  // El oro conserva su criterio amplio (macro); el resto exige una palabra propia o al menos una regla fuerte (|efecto| ≥ 2)
  const strongest = used.reduce((m, r) => Math.max(m, Math.abs(r.e[i])), 0);
  const relevant = !promo && (asset === 'gold' ? used.length > 0 || kw : kw || strongest >= 2) || (promo && used.length > 0);
  return {
    bias, score, strength,
    topics: [...new Set(used.map((r) => r.topic))],
    reasons: used.sort((a, b) => Math.abs(b.e[i]) - Math.abs(a.e[i])).map((r) => ({ topic: r.topic, score: r.e[i], why: r.why[asset] || r.why.any || '' })).filter((r) => r.why),
    relevant,
  };
}

// Devuelve { gold, oil, sp500, nasdaq, btc }, cada uno con { bias, score, strength, topics, reasons, relevant }.
export function classify(item) {
  const text = `${item.title} ${item.summary || ''}`.toLowerCase().slice(0, 500);
  const promo = STOCK_PROMO.test(`${item.title}`);
  const hits = [];
  const matched = new Set();
  for (const r of RULES) {
    if (r.unless && matched.has(r.unless)) continue;
    if (r.re.test(text)) { hits.push(r); matched.add(r.id); }
  }
  const out = {};
  for (const a of ASSET_IDS) out[a] = evaluate(a, hits, text, promo);
  return out;
}

// ---- Calendario económico ----
const INFLATION = /\b(cpi|ppi|pce|inflation|core (cpi|ppi|pce))\b/i;
const GROWTH = /non-?farm|nfp|employment change|average hourly earnings|retail sales|gdp|ism|pmi|durable goods|consumer (confidence|sentiment)|jolts|housing starts|industrial production|adp/i;
const INVERSE = /unemployment (rate|claims)|jobless claims/i;
const CRUDE = /crude oil inventories|crude inventories|eia (crude|petroleum|weekly)|opec/i;
const SPEECH = /speaks|testifies|press conference|statement|rate decision|interest rate|federal funds|fomc|minutes|monetary policy/i;

// 'above' = efecto de que el dato real supere al pronóstico: +1 alcista, −1 bajista, 0 sin efecto claro
const EVENT = {
  inflacion: { above: [-1, 0, -1, -1, -1], how: {
    gold: 'Inflación por encima de lo previsto → Fed más restrictiva, dólar y rendimientos al alza → bajista para el oro; por debajo → alcista.',
    oil: 'Efecto indirecto vía dólar y expectativas de crecimiento; suele ser débil.',
    sp500: 'Inflación alta aleja los recortes de tasas → bajista para las acciones; baja → alcista.',
    nasdaq: 'Inflación alta → tasas más altas por más tiempo → bajista, sobre todo para la tecnología; baja → alcista.',
    btc: 'Inflación alta → tasas altas por más tiempo → bajista para Bitcoin; baja → alcista.' } },
  crecimiento: { above: [-1, 1, 0, 0, -1], how: {
    gold: 'Dato por encima de lo previsto → dólar y rendimientos al alza → bajista para el oro; por debajo → alcista.',
    oil: 'Dato fuerte → mayor demanda esperada → alcista para el crudo; débil → bajista.',
    sp500: 'Efecto mixto: dato fuerte apoya las ganancias pero puede alejar los recortes de tasas; débil → temor de recesión o esperanza de recortes.',
    nasdaq: 'Efecto mixto y muy sensible a tasas: un dato fuerte puede ser bajista si sube los rendimientos.',
    btc: 'Dato fuerte → rendimientos al alza → leve presión para Bitcoin; débil → leve apoyo si implica recortes.' } },
  inverso: { above: [1, -1, 0, 0, 1], how: {
    gold: 'Más desempleo/solicitudes de lo previsto (dato débil) → dólar a la baja → alcista para el oro; menos → bajista.',
    oil: 'Más desempleo/solicitudes → menor demanda esperada → bajista para el crudo; menos → alcista.',
    sp500: 'Efecto mixto: mercado laboral débil resta crecimiento pero acerca recortes de tasas.',
    nasdaq: 'Efecto mixto: un mercado laboral débil puede traer recortes de tasas (favorable) pero resta crecimiento.',
    btc: 'Dato laboral débil → expectativa de recortes → leve apoyo para Bitcoin; fuerte → leve presión.' } },
  crudo: { above: [0, -1, 0, 0, 0], how: {
    gold: 'Sin efecto directo.', oil: 'Inventarios por encima de lo previsto (acumulación) → bajista para el crudo; por debajo (retiros) → alcista.',
    sp500: 'Sin efecto directo.', nasdaq: 'Sin efecto directo.', btc: 'Sin efecto directo.' } },
  discurso: { above: [0, 0, 0, 0, 0], how: {
    gold: 'Depende del tono: restrictivo (hawkish) → bajista para el oro; moderado (dovish) → alcista. Espera volatilidad y spreads altos.',
    oil: 'Tono restrictivo resta crecimiento esperado (bajista, débil); moderado lo apoya.',
    sp500: 'Tono restrictivo → bajista para las acciones; moderado → alcista. Espera volatilidad.',
    nasdaq: 'Tono restrictivo → bajista, sobre todo para la tecnología; moderado → alcista. Espera volatilidad.',
    btc: 'Tono restrictivo → bajista para Bitcoin; moderado → alcista. Espera volatilidad.' } },
};
const OTHER_HOW = 'No es un dato clave de EE. UU., pero puede mover al dólar o al apetito por riesgo y afectar indirectamente a este activo.';

const parseNum = (s) => {
  if (s == null || s === '') return null;
  const m = /(-?\d+(?:[.,]\d+)?)\s*([kmbt%]?)/i.exec(String(s).replace(/\s/g, ''));
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2].toLowerCase()] ?? 1;
  return parseFloat(m[1].replace(',', '.')) * mult;
};

// Devuelve { kind, how: {activo: texto}, surprise: {activo: {above, bias} | null} }
export function classifyEvent(ev) {
  const t = ev.title || '';
  const kind = CRUDE.test(t) ? 'crudo' : INVERSE.test(t) ? 'inverso' : SPEECH.test(t) ? 'discurso' : INFLATION.test(t) ? 'inflacion' : GROWTH.test(t) ? 'crecimiento' : 'otro';
  const a = parseNum(ev.actual), f = parseNum(ev.forecast);
  const how = {}, surprise = {};
  for (const id of ASSET_IDS) {
    how[id] = kind === 'otro' ? (ev.country && ev.country !== 'USD' ? OTHER_HOW : '') : EVENT[kind].how[id];
    surprise[id] = null;
    if (kind !== 'otro' && a != null && f != null && a !== f) {
      const eff = EVENT[kind].above[IDX[id]];
      if (eff) { const above = a > f; surprise[id] = { above, bias: (above ? eff : -eff) > 0 ? 'alcista' : 'bajista' }; }
    }
  }
  return { kind, how, surprise };
}

// ---- Resumen del sesgo reciente de un activo ----
export function summarizeBias(items, nowMs, { hours = 12, halfLifeH = 6, asset = 'gold' } = {}) {
  const from = nowMs - hours * 3600e3;
  const recent = items.filter((i) => Date.parse(`${i.published}Z`) >= from && i.impacts && i.impacts[asset] && i.impacts[asset].relevant);
  let net = 0, bull = 0, bear = 0, mixed = 0;
  const topics = new Map();
  for (const it of recent) {
    const imp = it.impacts[asset];
    const ageH = Math.max(0, (nowMs - Date.parse(`${it.published}Z`)) / 3600e3);
    const w = Math.pow(0.5, ageH / halfLifeH);
    if (imp.bias === 'alcista') bull++; else if (imp.bias === 'bajista') bear++; else if (imp.bias === 'mixto') mixed++;
    net += imp.score * w;
    for (const r of imp.reasons) {
      const t = topics.get(r.topic) || { topic: r.topic, net: 0, bull: 0, bear: 0, example: null };
      t.net += r.score * w; if (r.score > 0) t.bull++; else t.bear++;
      if (!t.example || Math.abs(r.score) > t.exScore) { t.example = it.title; t.exScore = Math.abs(r.score); }
      topics.set(r.topic, t);
    }
  }
  const label = net >= 6 ? 'alcista' : net >= 2 ? 'ligeramente alcista' : net <= -6 ? 'bajista' : net <= -2 ? 'ligeramente bajista' : 'neutral / dividido';
  return { net, label, bull, bear, mixed, total: recent.length, topics: [...topics.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)) };
}
