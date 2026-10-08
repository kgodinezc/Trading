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
- **Entradas**: las operaciones cerradas dentro de una ventana de 30 min (ajustable) se agrupan como **una entrada**, tal como en tu hoja de Excel; cada entrada se documenta con etiquetas y notas. 
- **Alerta de ALTO**: si dos entradas consecutivas del día cierran en negativo, aparece un aviso para que dejes de operar y completes la bitácora (si seguiste el plan y qué debes mejorar).
- **Noticias**: titulares del día y agenda económica (hora de Costa Rica) con una lectura automática de su impacto en el oro (▲ alcista / ▼ bajista / ◆ mixto), el porqué de cada lectura, un resumen del sesgo de las últimas 12 h, y un aviso en toda la app cuando se acerca una noticia USD de alto impacto. Se refresca sola cada 5 min.
- **Bitácora**: calendario con P/L, plan previo, ¿seguí mi plan?, qué hice bien, qué debo mejorar, notas y etiquetas por operación,
  y cruce de disciplina vs. resultado. Respaldo/restauración en JSON.
- Cuentas **cent (USC)**: se muestran en USD (÷100) o en centavos.

> Los insights son orientativos y educativos, no asesoría financiera. Los reportes de Exness vienen en GMT; la app muestra **horas y fechas en hora de Costa Rica (UTC−6)**, ajustable en Datos → Zona horaria.

## Noticias: cómo se actualizan
Los navegadores no pueden leer los medios directamente (CORS), así que el workflow `Publicar app web` corre **cada 10 min**
(`schedule`), ejecuta `scripts/fetch-news.js` (feeds RSS de Google News, Fed, FXStreet, MarketWatch, CNBC, Investing.com y el
calendario económico de ForexFactory, en UTC), genera `app/data/news.json` y vuelve a publicar la página. La app lee ese archivo
y clasifica el impacto con reglas de palabras clave (`app/js/core/newsimpact.js`). Solo se guardan titulares y enlaces a la fuente.

- GitHub puede retrasar los workflows programados (10–30 min en horas de mucha carga) y los **desactiva tras 60 días sin actividad**
  en el repositorio: si lo notas detenido, ejecútalo a mano en Actions → *Publicar app web* → *Run workflow*.
- Si una fuente falla, las demás siguen funcionando; la pestaña muestra cuáles están activas.
- En local: `npm run news` genera `app/data/news.json` (ignorado por git) y `npm start` lo sirve.
