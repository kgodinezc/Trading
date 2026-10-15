# 📈 Bitácora de Trading

Aplicación web para subir el **reporte de historial de Exness (MetaTrader 5)** y obtener estadísticas,
insights, recomendaciones y una **bitácora diaria** de tus operaciones.

**Privacidad:** todo se procesa en tu navegador (el .xlsx no se envía a ningún servidor) y se guarda en
`localStorage`. Este repositorio es público: **no subas tus reportes**; `.gitignore` ya excluye `.xlsx`.

## Uso
1. En MT5: pestaña *Historial* → clic derecho → *Informe* → *Abrir XML (MS Excel)*.
2. Abre la app → pestaña **Datos** → sube el .xlsx (puedes subir reportes nuevos; no se duplican operaciones).
3. Explora **Resumen**, **Estadísticas**, **Insights**, **Noticias** y **Bitácora**.
4. Si operas varias cuentas de Exness, sube el reporte de cada una y cambia entre ellas con el selector **Cuenta** (arriba a la derecha); en *Datos* puedes ponerles un nombre. Cada cuenta tiene sus propias estadísticas, entradas, notas y bitácora diaria.

Local: `npm start` (http://localhost:8080) · Pruebas: `npm test`.
Publicación: Settings → Pages → Source: *GitHub Actions* (el workflow publica la carpeta `app/` desde `main`).

## Qué calcula
- Resultado neto, win rate, factor de beneficio, ratio ganancia/pérdida, esperanza, win rate mínimo, drawdown, rachas.
- Desglose por hora, día de la semana, duración, dirección, lote, tipo de entrada, motivo de cierre, con/sin SL y etiquetas.
- **Insights**: esperanza negativa, falta de Stop Loss, efecto disposición, trading de revancha, subir lote tras perder,
  exceso de posiciones simultáneas, sobreoperación, mejores/peores horas, drawdown y riesgo por operación.
- **Entradas**: las operaciones cerradas dentro de una ventana de 30 min (ajustable) se agrupan como **una entrada**, tal como en tu hoja de Excel; cada entrada se documenta con etiquetas y notas. 
- **Noticias** de **oro, petróleo, S&P 500, Nasdaq 100 y Bitcoin**: titulares del día y agenda económica (hora de Costa Rica) con una lectura automática de su impacto en cada activo (▲ alcista / ▼ bajista / ◆ mixto) y el porqué (el mismo hecho afecta distinto a cada activo: p. ej. tasas altas pesan más en el Nasdaq que en el petróleo). Incluye una perspectiva de las últimas 12 h con los factores a favor y en contra, un panorama de los cinco activos y un aviso en toda la app cuando se acerca una noticia USD de alto impacto. Se refresca sola cada 5 min.
- **Bitácora**: calendario con P/L, plan previo, ¿seguí mi plan?, qué hice bien, qué debo mejorar, notas y etiquetas por operación,
  y cruce de disciplina vs. resultado. Respaldo/restauración en JSON.
- Cuentas **cent (USC)**: se muestran en USD (÷100) o en centavos.

> Los insights son orientativos y educativos, no asesoría financiera. Los reportes de Exness vienen en GMT; la app muestra **horas y fechas en hora de Costa Rica (UTC−6)**, ajustable en Datos → Zona horaria.

## Noticias: cómo se actualizan
Los navegadores no pueden leer los medios directamente (CORS), así que el workflow `Publicar app web` corre **cada 10 min**
(`schedule`), ejecuta `scripts/fetch-news.js` (feeds RSS de Google News, Fed, FXStreet, MarketWatch, CNBC, Investing.com y el
calendario económico de ForexFactory, en UTC; además OilPrice.com, CoinDesk, Cointelegraph y Yahoo Finance para petróleo y cripto), genera `app/data/news.json` y vuelve a publicar la página. La app lee ese archivo
y clasifica el impacto con reglas de palabras clave (`app/js/core/newsimpact.js`). Solo se guardan titulares y enlaces a la fuente.

- GitHub ejecuta los workflows programados de forma **irregular**: en este repositorio el cron de 10 min llegó a correr solo cada
  3–8 h. Por eso el botón **Actualizar ahora** puede pedir la actualización al instante (API de GitHub, ≈1 min): hace falta un
  token fine-grained **solo de este repositorio con permiso "Actions: Read and write"**, que se pega una vez en la pestaña
  Noticias → *Actualización a demanda*. El token se guarda solo en el navegador (no entra en los respaldos). Con token guardado,
  abrir la pestaña con datos de más de 30 min pide la actualización sola (máx. una vez cada 10 min).
- GitHub también **desactiva** los workflows programados tras 60 días sin actividad en el repositorio.
- Manual: Actions → *Publicar app web* → *Run workflow*.
- Si una fuente falla, las demás siguen funcionando; la pestaña muestra cuáles están activas.
- En local: `npm run news` genera `app/data/news.json` (ignorado por git) y `npm start` lo sirve.
