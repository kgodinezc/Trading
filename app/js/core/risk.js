// Cálculo de tamaño de posición según % de riesgo. Todo en la unidad de la cuenta (p. ej. centavos en USC).

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Valor (en unidad de cuenta) de mover 1.00 el precio con 1 lote, deducido de las operaciones pasadas:
// resultado bruto / (lote × movimiento). Usa la mediana para ignorar redondeos y comisiones.
export function inferValuePerLot(trades, symbol) {
  const v = trades
    .filter((t) => t.symbol === symbol && t.volume > 0 && t.move && Math.abs(t.move) > 1e-9)
    .map((t) => t.profit / (t.volume * t.move))
    .filter((x) => Number.isFinite(x) && x > 0);
  return v.length >= 3 ? median(v) : null;
}

export function positionSize({ balance, riskPct, entry, sl, valuePerLot, step = 0.01, min = 0.01, max = Infinity }) {
  const ok = [balance, riskPct, entry, sl, valuePerLot].every((x) => Number.isFinite(x) && x > 0);
  if (!ok) return { error: 'Completa balance, % de riesgo, entrada, Stop Loss y valor por lote.' };
  if (entry === sl) return { error: 'La entrada y el Stop Loss no pueden ser iguales.' };
  const distance = Math.abs(entry - sl);
  const side = sl < entry ? 'buy' : 'sell';
  const riskAmount = balance * (riskPct / 100);
  const rawLot = riskAmount / (distance * valuePerLot);
  const decimals = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
  const stepped = Math.floor(rawLot / step + 1e-9) * step;
  const lot = Math.min(max, Number(stepped.toFixed(decimals)));
  const belowMin = lot < min;
  const finalLot = belowMin ? min : lot;
  const actualRisk = finalLot * distance * valuePerLot;
  return {
    side, distance, riskAmount, rawLot, lot: finalLot, belowMin,
    actualRisk, actualRiskPct: (actualRisk / balance) * 100,
  };
}

// Niveles de Take Profit para ratios R:R y win rate mínimo para no perder con cada uno.
export function targets(entry, sl, ratios = [1, 1.5, 2, 3]) {
  const d = Math.abs(entry - sl), dir = sl < entry ? 1 : -1;
  return ratios.map((r) => ({ ratio: r, tp: entry + dir * d * r, breakevenWinRate: 1 / (1 + r) }));
}
