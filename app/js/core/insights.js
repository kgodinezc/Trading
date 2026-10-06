// Motor de insights: reglas simples y explicables sobre las estadísticas. No es asesoría financiera.
import { toMs } from './parser.js';
import { day, hourOf, weekdayOf, summarize } from './stats.js';

export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const MIN_GROUP = 8; // muestra mínima para sacar conclusiones de un subgrupo

export function fmtDuration(sec) {
  if (sec < 90) return `${Math.round(sec)} s`;
  if (sec < 5400) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
}

export function buildInsights(trades, stats, { fmt = (x) => x.toFixed(2), startBalance = null } = {}) {
  const out = [];
  const add = (level, id, title, detail, tip) => out.push({ level, id, title, detail, tip });
  const s = stats.all;
  if (!s.n) return out;

  if (s.n < 30) {
    add('info', 'muestra', 'Muestra pequeña',
      `Solo hay ${s.n} operaciones: las conclusiones pueden cambiar mucho con más datos.`,
      'Sigue subiendo tus reportes; los patrones se vuelven fiables a partir de ~100 operaciones.');
  }

  // 1. Matemática del sistema: win rate vs. payoff
  if (s.payoff != null) {
    if (s.winRate < s.breakevenWinRate) {
      add('alta', 'edge', 'Tu sistema tiene esperanza matemática negativa',
        `Aciertas el ${pct(s.winRate, 1)} de las veces, pero tu ganancia media (${fmt(s.avgWin)}) es ${s.payoff.toFixed(2)}× tu pérdida media (${fmt(Math.abs(s.avgLoss))}). Con ese ratio necesitarías acertar al menos el ${pct(s.breakevenWinRate, 1)} para no perder. Esperanza por operación: ${fmt(s.expectancy)}.`,
        `Acerca el ratio a 1:1 o más: cierra las perdedoras antes (SL fijo) o deja correr las ganadoras hasta un TP mayor. Con un win rate de ${pct(s.winRate)} bastaría un ratio de ${((1 - s.winRate) / s.winRate).toFixed(2)}.`);
    } else {
      add('ok', 'edge', 'Esperanza matemática positiva',
        `Win rate ${pct(s.winRate, 1)} con ratio ganancia/pérdida ${s.payoff.toFixed(2)} (mínimo requerido: ${pct(s.breakevenWinRate, 1)}). Esperanza por operación: ${fmt(s.expectancy)}.`,
        'Mantén el proceso y verifica que se sostenga en una muestra mayor.');
    }
  }

  // 2. Pérdidas mucho mayores que ganancias
  if (s.payoff != null && s.payoff < 0.6 && s.winRate >= 0.5) {
    add('media', 'asimetria', 'Muchas ganancias pequeñas, pocas pérdidas grandes',
      `Ganas ${pct(s.winRate)} de las veces, pero la pérdida media es ${(1 / s.payoff).toFixed(1)}× la ganancia media. Una sola operación mala borra varias buenas (mayor pérdida: ${fmt(s.largestLoss)}; mayor ganancia: ${fmt(s.largestWin)}).`,
      'Define el SL antes de entrar y respétalo; no muevas el SL ni "esperes a que vuelva".');
  }

  // 3. Stop loss
  const withSL = trades.filter((t) => t.sl), noSL = trades.filter((t) => !t.sl);
  if (noSL.length / trades.length > 0.3) {
    const a = summarize(withSL), b = summarize(noSL);
    const worstNoSL = noSL.length ? Math.min(...noSL.map((t) => t.net)) : 0;
    add('alta', 'sl', `${pct(noSL.length / trades.length)} de tus operaciones se cerraron sin Stop Loss`,
      `Sin SL: ${noSL.length} operaciones, resultado ${fmt(b.net)}, pérdida media ${fmt(b.avgLoss)}, peor ${fmt(worstNoSL)}.` +
      (withSL.length >= MIN_GROUP ? ` Con SL: ${withSL.length} operaciones, resultado ${fmt(a.net)}, pérdida media ${fmt(a.avgLoss)}.` : ''),
      'Opera siempre con un SL colocado al abrir. Es la protección principal contra una racha mala o un movimiento de noticias.');
  }

  // 4. Efecto disposición: aguanta más las perdedoras
  if (s.losses >= MIN_GROUP && s.wins >= MIN_GROUP && s.avgDurationLossSec > s.avgDurationWinSec * 1.4) {
    add('media', 'disposicion', 'Mantienes las perdedoras más tiempo que las ganadoras',
      `Duración media de las ganadoras: ${fmtDuration(s.avgDurationWinSec)}; de las perdedoras: ${fmtDuration(s.avgDurationLossSec)}. Es el "efecto disposición": cerrar rápido lo que gana y aguantar lo que pierde.`,
      'Aplica la regla inversa: si la operación no funciona en el tiempo que le diste, ciérrala; deja correr las ganadoras con un trailing stop.');
  } else if (s.losses >= MIN_GROUP && s.wins >= MIN_GROUP && s.avgDurationWinSec > s.avgDurationLossSec * 1.4) {
    add('ok', 'disposicion', 'Cortas las pérdidas más rápido de lo que cierras las ganancias',
      `Ganadoras: ${fmtDuration(s.avgDurationWinSec)}; perdedoras: ${fmtDuration(s.avgDurationLossSec)}.`, 'Buen hábito: consérvalo.');
  }

  // 5. Operar justo después de una pérdida (revancha) y subir el tamaño
  const byOpen = [...trades].sort((a, b) => a.openTime.localeCompare(b.openTime));
  const afterLoss = [], afterWin = [], upsized = [];
  for (const t of byOpen) {
    const prev = trades.filter((p) => p.closeTime <= t.openTime && toMs(t.openTime) - toMs(p.closeTime) <= 10 * 60e3)
      .sort((a, b) => b.closeTime.localeCompare(a.closeTime))[0];
    if (!prev) continue;
    if (prev.net < 0) { afterLoss.push(t); if (t.volume > prev.volume) upsized.push(t); } else if (prev.net > 0) afterWin.push(t);
  }
  if (afterLoss.length >= MIN_GROUP && afterWin.length >= MIN_GROUP) {
    const L = summarize(afterLoss), W = summarize(afterWin);
    if (L.expectancy < W.expectancy && L.net < 0) {
      add('alta', 'revancha', 'Resultados peores cuando operas justo después de perder',
        `Entradas dentro de los 10 min posteriores a una pérdida: ${L.n} operaciones, ${fmt(L.net)} (media ${fmt(L.expectancy)}). Tras una ganancia: ${W.n} operaciones, media ${fmt(W.expectancy)}.`,
        'Impón una pausa obligatoria (p. ej. 15-30 min) después de cada pérdida. Es la defensa más efectiva contra el "trading de revancha".');
    }
  }
  if (upsized.length >= MIN_GROUP) {
    const U = summarize(upsized);
    if (U.net < 0) {
      add('alta', 'martingala', 'Subes el tamaño de posición tras una pérdida',
        `${upsized.length} entradas aumentaron el lote respecto a la operación perdedora inmediata anterior; resultado conjunto: ${fmt(U.net)}.`,
        'Fija el lote según un % de riesgo del balance, no según cuánto quieres recuperar. Aumentar el tamaño tras perder (martingala) multiplica el riesgo de ruina.');
    }
  }

  // 6. Promediar / varias posiciones simultáneas
  const hi = trades.filter((t) => (stats.concurrentByTrade.get(t) || 1) >= 4);
  const lo = trades.filter((t) => (stats.concurrentByTrade.get(t) || 1) < 4);
  if (hi.length >= MIN_GROUP && lo.length >= MIN_GROUP) {
    const H = summarize(hi), Lo = summarize(lo);
    if (H.net < 0 && H.expectancy < Lo.expectancy) {
      add('alta', 'simultaneas', 'Abrir muchas posiciones a la vez te está costando dinero',
        `Máximo simultáneo: ${stats.maxConcurrent} posiciones. Operaciones que coincidieron con ≥4 abiertas: ${H.n}, resultado ${fmt(H.net)} (media ${fmt(H.expectancy)}); el resto: media ${fmt(Lo.expectancy)}.`,
        'Limita el número de posiciones abiertas en la misma dirección (p. ej. máx. 2-3) y evita promediar en contra. El riesgo se suma aunque cada lote sea pequeño.');
    }
  }

  // 7. Sobreoperación
  const days = stats.daily;
  if (days.length >= 6) {
    const med = days.map((d) => d.n).sort((a, b) => a - b)[days.length >> 1];
    const busy = days.filter((d) => d.n > med), calm = days.filter((d) => d.n <= med);
    const bN = busy.reduce((a, d) => a + d.net, 0) / busy.length, cN = calm.reduce((a, d) => a + d.net, 0) / calm.length;
    if (busy.length >= 3 && bN < cN && bN < 0) {
      add('media', 'sobreoperacion', 'Los días con más operaciones rinden peor',
        `Días con más de ${med} operaciones (${busy.length} días): media diaria ${fmt(bN)}. Días más tranquilos (${calm.length}): ${fmt(cN)}.`,
        `Pon un tope diario de operaciones (p. ej. ${Math.max(3, med)}) y detente al alcanzarlo.`);
    }
  }

  // 8. Mejores y peores horas / días (hora del servidor MT5)
  const hrs = stats.byHour.filter((h) => h.n >= MIN_GROUP);
  if (hrs.length >= 2) {
    const worst = [...hrs].sort((a, b) => a.net - b.net)[0], best = [...hrs].sort((a, b) => b.net - a.net)[0];
    if (worst.net < 0) {
      add('media', 'hora-mala', `Evita operar a las ${String(worst.key).padStart(2, '0')}:00 (hora del servidor)`,
        `Esa hora acumula ${worst.n} operaciones con resultado ${fmt(worst.net)} y win rate ${pct(worst.winRate)}.`,
        'Revisa si coincide con una sesión o publicación de noticias en la que tu estrategia no funciona; considera no operar en esa franja.');
    }
    if (best.net > 0) {
      add('ok', 'hora-buena', `Tu mejor franja: ${String(best.key).padStart(2, '0')}:00 (hora del servidor)`,
        `${best.n} operaciones, resultado ${fmt(best.net)}, win rate ${pct(best.winRate)}.`, 'Concentra tu operativa donde tienes ventaja demostrada.');
    }
  }
  const wds = stats.byWeekday.filter((d) => d.n >= MIN_GROUP);
  if (wds.length >= 2) {
    const worst = [...wds].sort((a, b) => a.net - b.net)[0];
    if (worst.net < 0) {
      add('info', 'dia-malo', `El ${WEEKDAYS[worst.key]} es tu peor día de la semana`,
        `${worst.n} operaciones, resultado ${fmt(worst.net)}, win rate ${pct(worst.winRate)}.`, 'Verifica si es casualidad o un patrón (liquidez, noticias, fatiga) antes de excluirlo.');
    }
  }

  // 9. Compra vs. venta
  const buy = stats.bySide.find((g) => g.key === 'buy'), sell = stats.bySide.find((g) => g.key === 'sell');
  if (buy && sell && buy.n >= MIN_GROUP && sell.n >= MIN_GROUP && Math.abs(buy.net - sell.net) > Math.abs(s.net) * 0.3 + 1) {
    const [w, l, wn, ln] = buy.net > sell.net ? [buy, sell, 'compras', 'ventas'] : [sell, buy, 'ventas', 'compras'];
    add('info', 'sesgo', `Rindes mejor en ${wn} que en ${ln}`,
      `${wn}: ${w.n} operaciones, ${fmt(w.net)} (win rate ${pct(w.winRate)}). ${ln}: ${l.n} operaciones, ${fmt(l.net)} (win rate ${pct(l.winRate)}).`,
      `Revisa si tienes un sesgo direccional o si tu criterio de entrada en ${ln} es más débil.`);
  }

  // 10. Entrada a mercado vs. orden pendiente
  const mk = stats.byEntry.find((g) => g.key === 'market'), lm = stats.byEntry.find((g) => g.key === 'limit');
  if (mk && lm && mk.n >= MIN_GROUP && lm.n >= MIN_GROUP && Math.abs(mk.expectancy - lm.expectancy) > Math.abs(s.expectancy) * 0.5 + 0.01) {
    const better = mk.expectancy > lm.expectancy ? 'a mercado' : 'con órdenes límite';
    add('info', 'entrada', `Tus entradas ${better} funcionan mejor`,
      `A mercado: ${mk.n} operaciones, media ${fmt(mk.expectancy)}. Con límite: ${lm.n} operaciones, media ${fmt(lm.expectancy)}.`, 'Prioriza el tipo de entrada con mejor esperanza, o revisa los niveles que usas para las órdenes límite.');
  }

  // 11. Drawdown y riesgo por operación
  const eq = stats.equity;
  if (eq.maxDDPct >= 0.2) {
    add('alta', 'drawdown', `Drawdown máximo de ${pct(eq.maxDDPct, 1)} (${fmt(eq.maxDD)})`,
      `Para recuperar una caída del ${pct(eq.maxDDPct)} necesitas ganar ${pct(eq.maxDDPct / (1 - eq.maxDDPct))} sobre el balance restante. Pico de balance: ${fmt(eq.peak)}.`,
      'Reduce el tamaño de posición hasta que el drawdown baje del 10-15% y define un límite de pérdida máxima (diaria/semanal) tras el cual dejas de operar.');
  }
  const refBalance = startBalance || eq.deposits || eq.peak;
  if (refBalance > 0 && s.largestLoss < 0 && Math.abs(s.largestLoss) / refBalance > 0.03) {
    add('media', 'riesgo-operacion', `Tu mayor pérdida fue ${pct(Math.abs(s.largestLoss) / refBalance, 1)} del capital depositado`,
      `${fmt(s.largestLoss)} en una sola operación. La regla habitual es arriesgar entre 0,5% y 2% por operación.`,
      'Calcula el lote a partir del SL: lote = (balance × % riesgo) ÷ (distancia al SL × valor del punto).');
  }

  // 12. Peor día
  const worstDay = [...stats.daily].sort((a, b) => a.net - b.net)[0];
  if (worstDay && worstDay.net < 0 && refBalance > 0 && Math.abs(worstDay.net) / refBalance > 0.08) {
    add('media', 'peor-dia', `Tu peor día (${worstDay.key}) perdió ${pct(Math.abs(worstDay.net) / refBalance, 1)} del capital depositado`,
      `${worstDay.n} operaciones ese día, resultado ${fmt(worstDay.net)}.`,
      'Establece una pérdida diaria máxima (p. ej. 2-3%) y apaga la plataforma al alcanzarla.');
  }

  // 13. Rachas
  const st = stats.streaks;
  if (st.maxLosses.count >= 6) {
    add('info', 'rachas', `Racha máxima de ${st.maxLosses.count} pérdidas seguidas (${fmt(st.maxLosses.sum)})`,
      `Tu racha ganadora más larga fue de ${st.maxWins.count} (${fmt(st.maxWins.sum)}).`,
      'Con tu tamaño de posición, pregúntate si soportarías una racha aún peor. Si no, reduce el lote.');
  }

  // 14. Concentración de beneficios
  const top = [...trades].sort((a, b) => b.net - a.net).slice(0, 5);
  if (s.grossProfit > 0 && trades.length >= 30) {
    const share = top.reduce((a, t) => a + t.net, 0) / s.grossProfit;
    if (share > 0.35) {
      add('info', 'concentracion', `Tus 5 mejores operaciones suman el ${pct(share)} de todas tus ganancias`,
        'Los resultados dependen de pocas operaciones grandes; si te las pierdes, el sistema cambia de signo.', 'Busca consistencia: mismo criterio de entrada y salida en todas las operaciones.');
    }
  }

  // 15. Comisión + swap
  if (s.net !== 0 && Math.abs(s.commission + s.swap) / Math.max(Math.abs(s.grossProfit), 1) > 0.1) {
    add('info', 'costos', 'Comisiones y swaps pesan en tu resultado',
      `Comisión ${fmt(s.commission)} y swap ${fmt(s.swap)} acumulados.`, 'Si operas muy corto plazo, comprueba que el costo por operación no se coma tu ventaja.');
  }

  const rank = { alta: 0, media: 1, info: 2, ok: 3 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

// Resumen de un día para la bitácora.
export function daySummary(trades, date) {
  const ts = trades.filter((t) => day(t.closeTime) === date);
  return { trades: ts, ...summarize(ts) };
}

export { hourOf, weekdayOf };
