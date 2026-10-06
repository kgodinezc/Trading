# 📈 Bitácora de Trading

Aplicación web para subir el **reporte de historial de Exness (MetaTrader 5)** y obtener estadísticas,
insights, recomendaciones y una **bitácora diaria** de tus operaciones.

**Privacidad:** todo se procesa en tu navegador (el .xlsx no se envía a ningún servidor) y se guarda en
`localStorage`. Este repositorio es público: **no subas tus reportes**; `.gitignore` ya excluye `.xlsx`.

## Uso
1. En MT5: pestaña *Historial* → clic derecho → *Informe* → *Abrir XML (MS Excel)*.
2. Abre la app → pestaña **Datos** → sube el .xlsx (puedes subir reportes nuevos; no se duplican operaciones).
3. Explora **Resumen**, **Estadísticas**, **Insights**, **Operaciones**, **Calculadora** y **Bitácora**.

Local: `npm start` (http://localhost:8080) · Pruebas: `npm test`.
Publicación: Settings → Pages → Source: *GitHub Actions* (el workflow publica la carpeta `app/` desde `main`).

## Qué calcula
- Resultado neto, win rate, factor de beneficio, ratio ganancia/pérdida, esperanza, win rate mínimo, drawdown, rachas.
- Desglose por hora, día de la semana, duración, dirección, lote, tipo de entrada, motivo de cierre, con/sin SL y etiquetas.
- **Insights**: esperanza negativa, falta de Stop Loss, efecto disposición, trading de revancha, subir lote tras perder,
  exceso de posiciones simultáneas, sobreoperación, mejores/peores horas, drawdown y riesgo por operación.
- **Calculadora de lote**: lote según % de riesgo, precio de entrada y Stop Loss (valor por lote deducido de tus operaciones), con TP por ratio R:B y win rate mínimo.
- **Entradas**: las operaciones cerradas dentro de una ventana de 30 min (ajustable) se agrupan como **una entrada**, tal como en tu hoja de Excel; cada entrada se documenta con etiquetas y notas. El día de trading se calcula en hora local (servidor Exness = GMT; Costa Rica = −6).
- **Alerta de ALTO**: si dos entradas consecutivas del día cierran en negativo, aparece un aviso para que dejes de operar y completes la bitácora (estado emocional, si seguiste el plan y la lección).
- **Bitácora**: calendario con P/L, plan previo, estado emocional, ¿seguí mi plan?, lecciones, notas y etiquetas por operación,
  y cruce de disciplina vs. resultado. Respaldo/restauración en JSON.
- Cuentas **cent (USC)**: se muestran en USD (÷100) o en centavos.

> Los insights son orientativos y educativos, no asesoría financiera. Las horas son las del servidor MT5.
