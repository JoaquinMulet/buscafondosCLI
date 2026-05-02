---
name: buscafondos-cli
description: Guía de análisis profesional para fondos mutuos chilenos. Usar cuando se necesita consultar o analizar fondos mutuos en Chile, incluyendo AGF, TAC, rentabilidad, métricas de riesgo, rankings, carteras o cualquier aspecto del mercado de fondos chilenos.
user-invocable: false
allowed-tools: Bash, Read
---

# Análisis Profesional de Fondos Mutuos en Chile

Skill-guía para agentes IA que realizan análisis de fondos mutuos chilenos. Esta skill enseña al agente cómo descubrir y analizar datos vía CLI, y provee el contexto de dominio necesario para interpretar correctamente cada campo de respuesta.

---

## Arquitectura del CLI y Recursos Disponibles

El CLI `buscafondos` es la única interfaz de acceso a los datos. Todos los comandos devuelven JSON con estructura `data` + `attributes`. El agente debe tratar cada respuesta como una fuente de datos dinámica, no como valores estáticos.

**Base de descubrimiento:** antes de cualquier análisis, el agente debe descubrir el universo disponible ejecutando comandos en secuencia lógica. Nunca asumir que se conoce la lista de AGF, categorías o fondos — siempre consultarla vía CLI.

**CRÍTICO — Rentabilidad ya incluye TAC:** la rentabilidad que publica el fondo (y que devuelve el CLI) ES la rentabilidad neta después de descontar la TAC. NO restaes la TAC nuevamente. Sería un error grave duplicar el descuento. Si necesitas comparar dos fondos, usas directamente su rentabilidad publicada.

**Filtrado de resultados JSON:** dado que los comandos devuelven JSON, SIEMPRE usa `jq` para filtrar grandes volúmenes de datos directamente en Bash antes de procesarlos. Ejemplo:
```bash
buscafondos all-funds | jq '.data[] | select(.attributes.category == "equity")'
buscafondos all-funds | jq '.data[] | select(.attributes.tac < 0.02)'
buscafondos all-funds | jq '.data | length'
```
**NUNCA imprimas el JSON completo de `all-funds` en la terminal.** Filtra primero con jq para obtener solo los registros relevantes.

**Cálculos matemáticos:** para calcular Sharpe Ratio, downside capture, o cualquier otra métrica que requiera precisión, NO intentes el cálculo mentalmente. Usa herramientas de Bash:
```bash
# Sharpe Ratio con awk
awk 'BEGIN { Rp=0.07; Rf=0.05; sigma=0.12; printf "%.2f\n", (Rp - Rf) / sigma }'

# node -e para cálculos complejos
node -e "console.log(Math.sqrt(12) * 0.045)"
```
Si ninguno está disponible, declara explícitamente que no puedes calcular y explica la fórmula al usuario.

---

## Comandos de Descubrimiento

### health — Estado del servicio

```bash
buscafondos health
```

**Retorna:** `status` (ok/error), `last_scraped_date`, `total_records`. Útil para verificar que la API está activa antes de ejecutar comandos de análisis.

---

### providers — Identificar AGF del sistema

```bash
buscafondos providers
```

**Retorna:** lista de todas las administradoras con `id` (CRC32) y `name`.

**Cómo usarlo:** este comando es el punto de partida de cualquier análisis. No existe una lista fija de AGF — se descubre en runtime. El agente debe iterar sobre las AGF según el objetivo del análisis.

**Contexto de dominio:** una AGF (Administradora General de Fondos) es una sociedad anónima regulada bajo Ley 20.712 que administra fondos por cuenta y riesgo de los partícipes. La solidez patrimonial y la reputación corporativa de la AGF son factores críticos en la selección — una AGF con problemas regulatorios puede poner en riesgo el patrimonio del fondo.

---

### funds <provider_id> — Descubrir fondos de una AGF

```bash
buscafondos funds <provider_id>
```

**Retorna:** lista de fondos de una AGF con `id` (concept_id), `run`, `name`, `category`, `currency`.

**Cómo usarlo:** obtener el `provider_id` de `providers`, luego iterar sobre los fondos. Cada fondo tiene un `concept_id` necesario para consultar series.

**Descubrimiento de categorías:** el campo `category` indica la clase de activo del fondo. Las categorías posibles NO deben hardcodearse — se obtienen del campo `category` de la respuesta. **Regla estricta:** bajo ninguna circunstancia el agente debe inventar, deducir o asumir categorías que no estén explícitamente listadas en la respuesta del campo `category`. Si el CLI no devuelve una categoría, esa categoría no existe para efectos del análisis. Las principales categorías por contexto de dominio son:

- `money_market`: deuda corto plazo (<90 días), vehículo ultra-conservador
- `equity` / `libre_inversion`: ≥90% en instrumentos de capitalización (acciones)
- `fixed_income`: deuda de mediano-largo plazo, expuesto a riesgo de tasa
- `balanced`: mixto renta fija + renta variable, amplitud máx 50% en capitalización

El agente debe usar estas definiciones para interpretar lo que el CLI devuelve, no asumir una lista cerrada.

---

### series <concept_id> — Series y valores cuota

```bash
buscafondos series <concept_id>
```

**Retorna:** series de un fondo con `id` (asset_id), `serie` (letra), `investor_class`, `last_day` (net_asset_value, total_net_assets, shareholders, date).

**Cómo usarlo:** descubrir todas las series disponibles de un fondo. Cada serie tiene su propio `asset_id` y puede tener diferente TAC. El campo `investor_class` indica si es Retail, Institucional, APV, etc.

**Concepto clave — Serie de Cuotas:** un mismo fondo (misma cartera de activos) puede emitir múltiples series de cuotas (A, B, C, I, APV, etc.) que se diferencian solo en costos y barrera de entrada, NO en el portafolio subyacente. La Serie A es típicamente retail, la Serie I es institucional con alto umbral de capital. La diferencia de TAC entre series de un mismo fondo puede ser de varios puntos porcentuales y erosiona fuertemente el capital compuesto en el tiempo.

---

## Comandos de Análisis de Costos

### tac <asset_id> — Tasa Anual de Costos

```bash
buscafondos tac <asset_id>
```

**Retorna:** `expense_ratio` (fracción decimal, ej: 0.0132 = 1.32%) e `investor_class`.

**Interpretación:** multiplicar `expense_ratio` por 100 para obtener el porcentaje. La TAC es la suma de todas las cargas monetarias del fondo: remuneración de la administradora, gastos operacionales (custodia, auditores) y costos de intermediación. Es un costo determinístico que resta directamente del capital compuesto.

**Contexto de dominio — TAC:** la Tasa Anual de Costos es la métrica de eficiencia en gastos más importante para comparar fondos. Una TAC del 3% vs 1% sobre 20 años puede representar la diferencia de más del 40% del capital final compuesto. El agente debe siempre buscar la serie de menor TAC disponible para el cliente.

**Concepto de benchmark de costos:** la industria provee tres referencias — TAC industria (media del mercado en esa categoría/moneda), TAC mínimo (la más baja de esa AGF), TAC máximo (la más alta). Si un fondo está cerca del TAC máximo de su categoría sin justificación de mayor alpha, es ineficiente.

---

### tac-history <asset_id> --from-date YYYYMMDD — Historial de TAC

```bash
buscafondos tac-history <asset_id>
buscafondos tac-history <asset_id> --from-date 2024-01-01
```

**Retorna:** serie temporal mensual de `expense_ratio` con `date`.

**Formato de fechas:** usar ISO 8601 (`YYYY-MM-DD`). No usar otros formatos como `YYYYMMDD` o `DD/MM/YYYY`.

**Para qué sirve:** detectar tendencias de alzas o bajas de costos en el tiempo. Si un fondo ha subido su TAC progresivamente, puede indicar problemas de escala (patrimonio decreciendo, costos fijos en expansión). Datos de baja de costos pueden indicar competencia o eficiencia operativa de la AGF.

---

## Comandos de Análisis de Riesgo y Performance

### days <asset_id> — Serie histórica de valores cuota

```bash
buscafondos days <asset_id>
buscafondos days <asset_id> --from-date 2024-01-01
```

**Parámetros:**
- `--from-date <date>`: fecha inicio en formato `YYYY-MM-DD`.

**Retorna:** serie temporal diaria de `price` (valor cuota) con `date`. Útil para calcular retornos manualmente o graficar evolución de precio.

---

### returns <asset_id> — Rentabilidad anualizada

```bash
buscafondos returns <asset_id>
buscafondos returns <asset_id> --from-date 2024-01-01
```

**Parámetros:**
- `--from-date <date>`: fecha inicio en formato `YYYY-MM-DD`.

**Retorna:** rentabilidades anualizadas a 1Y y 3Y basadas en la serie de precios. Muestra valor cuota actual, rentabilidad anualizada y variación total.

---

### risk <asset_id> — Métricas de riesgo

```bash
buscafondos risk <asset_id>
```

**Retorna:** `volatility_monthly_12m`, `volatility_monthly_36m`, `volatility_annualized_12m`, `volatility_annualized_36m`, `max_drawdown_36m`, `risk_level` (low/medium/high), `risk_score` (0-100), `as_of_date`.

**Interpretación de volatilidad:** la desviación estándar de los retornos mensuales indica el riesgo total del fondo. Volatilidad alta no es necesariamente mala si el retorno compensado es proporcional — por eso se usan ratios ajustados por riesgo (ver sección de métricas derivadas).

**Interpretación de max_drawdown_36m:** la máxima caída desde un peak en 36 meses. Un drawdown de -18% en 36m es severo para perfiles conservadores. Comparar contra el max_drawdown del benchmark del fondo para evaluar si el gestor protege o amplifica las caídas.

**Interpretación de risk_score:** score numérico 0-100 donde mayor = más arriesgoso. Es un indicador sintético que agrega las distintas métricas de riesgo.

---

## Comandos de Análisis de Mercado

### all-funds — Universo completo de fondos

```bash
buscafondos all-funds
buscafondos all-funds --category equity
buscafondos all-funds --category money_market --date 2026-03-31
```

**Retorna:** lista de todos los fondos vigentes del mercado. Cada registro incluye todos los campos de `series` más `dailyChange` (variación % hoy), `monthlyChange` (variación % mes), `tac` (expense_ratio), `patrimony` (millones de pesos), `shareholders`, métricas de riesgo completas, y `category`.

**Formato de fechas:** ISO 8601 (`YYYY-MM-DD`). No usar otros formatos.

**Cómo usarlo:** este es el comando principal de screening cuantitativo. El agente debe usar `jq` para filtrar los resultados antes de procesarlos. Ejemplo:
```bash
buscafondos all-funds --category equity | jq '.data[] | select(.attributes.tac < 0.025)'
```
**NUNCA打印 el JSON completo** — usar jq para obtener solo los registros relevantes.

**Descubrimiento de categorías:** en lugar de asumir categorías, el agente debe extraerlas de la respuesta de `all-funds` agrupando por el campo `category`. Las categorías posibles se descubren en runtime, no se hardcodifican.

---

### ranking — Ranking de AGF

```bash
buscafondos ranking --metric patrimony
buscafondos ranking --metric shareholders
buscafondos ranking --metric patrimony --date 2026-03-31
```

**Retorna:** lista ordenada de AGF con `rank`, `administrator` (nombre), `total_patrimony`, `total_shareholders`, `fund_count`.

**Interpretación:** el ranking por patrimonio revela concentración de mercado — las 5 mayores AGF suelen acumular la mayoría del AUM. El ranking por partícipes indica qué AGF está captando hogares. Una divergencia entre ambos (alto patrimonio, baja base de partícipes) indica concentración institucional: riesgo de flujos masivos de un solo cliente.

**Contexto de dominio:** la concentración de mercado es relevante para el análisis de competencia. AGF con patrimonios pequeños pueden tener dificultades para lograr economías de escala, elevando su TAC mínima.

---

### evolution — Evolución mensual de AGF

```bash
buscafondos evolution -a "BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A." -m patrimony -f 2024-01 -t 2025-12
buscafondos evolution -a "SCOTIABANK CHILE S.A." -a "BANCO DE CHILE" -m shareholders
```

**Parámetros:**
- `-a, --admin <name>` (requerido): nombre de la administradora. Repetir `-a` para comparar varias.
- `-m, --metric <metric>`: `patrimony` (default) o `shareholders`.
- `-f, --from <month>`: mes inicio en formato `YYYY-MM`.
- `-t, --to <month>`: mes fin en formato `YYYY-MM`.

**Retorna:** serie temporal mensual pivotada por AGF con valores de `patrimony` o `shareholders` según `metric`.

**Para qué sirve:** analizar tendencias de crecimiento o contracción patrimonial de una o varias AGF en el tiempo. Permite identificar cuáles AGF están ganando o perdiendo tamaño y si existen correlaciones entre flujos de distintas AGF.

---

## Comandos de Análisis de Cartera

### cartera <run> — Resumen de cartera

```bash
buscafondos cartera 10058-7
buscafondos cartera 9570 --month 2025-02
```

**Retorna:** resumen agrupado por `tipo_instrumento` con `num_holdings`, `valorizacion_nacional`, `valorizacion_extranjera`, `pct_activo_fondo`.

**Interpretación:** el campo `pct_activo_fondo` indica el peso de cada tipo de instrumento sobre el total del fondo. Esta vista macro permite verificar la composición general (renta fija vs renta variable vs internacional) según el mandato del fondo.

---

### holdings <run> — Holdings individuales

```bash
buscafondos holdings 9570
buscafondos holdings 9570 --market E
buscafondos holdings 9570 --market N
```

**Retorna:** lista de instrumentos en cartera con `market` (nacional/extranjera), `nemotecnico`, `emisor`, `pais`, `tipo_instrumento`, `valorizacion`, `pct_activo_fondo`.

**Interpretación:** cada holding tiene su peso relativo `pct_activo_fondo`. **El límite regulatorio de la Ley 20.712 aplica al EMISOR, no al tipo de instrumento.** Esto significa que un fondo puede tener el 100% de su cartera en "Acciones" si su mandato es de renta variable, pero NO puede tener más del 25% invertido en las acciones o deuda de una sola empresa (ej: no puede tener el 30% del fondo solo en SQM o Banco de Chile). El campo `emisor` es el que debe verificarse contra este límite. El campo `pais` permite verificar concentración geográfica. Holdings extranjeros (market=E) implican riesgo cambiario que debe evaluarse según el horizonte del cliente.

**Verificación ESG (concepto):** si el análisis incluye criterios ESG, el agente puede cruzar los nemotécnicos de los holdings con bases de datos de controversias ambientales/sociales. Holdings en sectores penalizados (minería sin gestión hídrica, empresas con violaciones de derechos humanos) son señales de alerta para carteras que declaran enfoque ESG.

---

## Conceptos de Dominio para Interpretación

### Peer Groups y Comparabilidad

No es válido comparar el rendimiento de un fondo money market con uno accionario. Los peer groups se definen por la combinación de:

- **Categoría** del fondo (money_market, equity, balanced, etc.)
- **Denominación monetaria** (CLP, USD, EUR)
- **Serie** (Retail, Institucional, APV)

El agente debe siempre asegurar que los fondos comparados pertenezcan al mismo peer group antes de emitir juicios relativos de desempeño.

### Benchmark y Valorización

Los fondos de deuda en Chile se valorizan con precios de proveedores como RiskAmerica o LVA Índices, no con precios de mercado directo. Esto es relevante porque el mercado secundario de deuda corporativa chileno adolece de problemas de liquidez. El agente debe saber que los valores cuota diarios reflejan mark-to-market según curvas de rendimiento de estos proveedores, no necesariamente precios de transacción real.

Para fondos de renta variable, el benchmark es típicamente un índice de LVA Índices o RiskAmerica (ej: LVAZCS3B para deuda corporativa corto plazo BBB).

**Regla de oro — Priorizar mayor rentabilidad neta:** al recomendar un fondo, USA directamente la rentabilidad que publica el fondo (que ya incluye el descuento de la TAC). No calcules "rentabilidad neta restando la TAC" porque sería un error grave (estarias descontando dos veces). Un fondo con 4% TAC y 12% de rentabilidad publicada supera a uno con 1% TAC y 6% de rentabilidad publicada: la diferencia de 6 puntos de rentabilidad neta compensa con creces la mayor TAC. **Siempre favorece mayor rentabilidad neta publicada, ajustada por riesgo.**

### Retorno y Riesgo: Ratios Derivados

Los datos de riesgo se obtienen del CLI. El agente debe saber calcular o interpretar las siguientes métricas derivadas:

**Tasa Libre de Riesgo (Rf):** para Chile, usar la TPM del Banco Central de Chile (verificar valor actual) o rendimiento de bonos BCU/BCP según el horizonte del fondo. Si no se tiene acceso a datos en tiempo real de la TPM, declarar explícitamente el valor asumido (ej: "Asumiendo Rf = 5.5% basado en TPM abril 2026") y usar ese valor consistente en todos los cálculos de Sharpe Ratio del análisis. **No mezclar tasas ni inventar valores.**

**Sharpe Ratio:**
$$\text{Sharpe} = \frac{R_p - R_f}{\sigma_p}$$

Donde $R_p$ = retorno promedio anualizado del fondo, $R_f$ = tasa libre de riesgo (en Chile usar TPM del Banco Central de Chile o rendimiento de bonos BCU/BCP según el horizonte), $\sigma_p$ = desviación estándar anualizada de los retornos del fondo. Un Sharpe > 1.0 es excelente. Sharpe < 0.5 indica que el fondo no es recompensado adecuadamente por el riesgo asumido.

**Downside Capture:**
$$\text{DownsideCapture} = \frac{R_{\text{gestor}}(R_{\text{bench}} < 0)}{R_{\text{bench}}(R_{\text{bench}} < 0)}$$

Si el resultado es < 100%, el gestor protege mejor que el benchmark en caídas. Si es > 100%, amplifica las caídas.

**Tracking Error e Information Ratio:**
El tracking error ($\text{TE}$) es la volatilidad del exceso de rendimiento del fondo sobre su benchmark. Un fondo con tracking error alto diverge fuertemente del índice. El Information Ratio divide ese exceso de retorno por el tracking error:
$$\text{IR} = \frac{R_p - R_b}{\text{TE}}$$
Mientras mayor el IR, más consistentemente el gestor genera alpha sobre el benchmark.

### Estructura Legal y Regulatoria

**Límites regulatorios (Ley 20.712):** la legislación chilena establece que un fondo no puede:

- Poseer más del 25% del capital suscrito y pagado de un emisor
- Representar más del 25% del total de activos de un emisor
- Concentrar más del 25% en deuda soberana (Chile o extranjero)

Estos límites son de cumplimiento obligatorio y el agente debe detectarlos en el análisis de cartera (comando `cartera` y `holdings`).

**CMF como regulador:** la Comisión para el Mercado Financiero es el ente fiscalizador. Los reglamentos internos de cada fondo deben estar depositados en el Registro Público de Depósito de Reglamentos Internos. La CMF puede revocar la autorización de existencia de una AGF por infracciones graves.

### Beneficios Tributarios

El agente debe conocer el marco tributario para orientar análisis y comparaciones:

**Art. 108 LIR — Traslado entre fondos:** las ganancias de capital se arrastran contablemente al nuevo fondo cuando se traspasa entre fondos (incluso de distintas AGF), sin tributar hasta el rescate final. Esto permite rebalancear portafolios sin costo fiscal intermedio.

**Art. 107 LIR (modificado por Ley 21.420):** las ganancias en fondos mutuos con presencia bursátil tributan a un impuesto único y definitivo del 10%, en lugar de la tasa marginal del IGC que puede llegar al 40%. Este es un arbitraje fiscal significativo para inversionistas de alto patrimonio.

**Art. 57 LIR:** las ganancias en fondos mutuos están exentas del IGC si el rescate anual es menor a 30 UTM.

**APV:** series exclusivas de ahorro previsional voluntario. El régimen Letra A otorga bonificación estatal del 15% sobre el ahorro. El régimen Letra B permite rebajar la base imponible.

---

## Guía de Flujo Analítico

### Objetivo: Screening Inicial de Candidatos

1. Ejecutar `all-funds --category <cat>` para obtener el universo en la categoría objetivo
2. Filtrar mentalmente por TAC aceptable, nivel de riesgo, patrimonio mínimo
3. Seleccionar 3-5 candidatos para análisis profundo

### Objetivo: Selección de Serie Óptima

1. Para cada candidato, ejecutar `series <concept_id>` para ver todas las series disponibles
2. Para cada serie, ejecutar `tac <asset_id>` para comparar costos
3. **Usar directamente la rentabilidad que publica cada serie** (ya incluye descuento de TAC — NO restar la TAC nuevamente). **Siempre recomendar la serie de mayor rentabilidad neta publicada.** La diferencia de TAC entre series de un mismo fondo puede ser de varios puntos porcentuales y erosiona fuertemente el capital compuesto en el tiempo: sobre un capital de $10.000.000 y retorno bruto anual del 7%, una diferencia de 2.3% en TAC (ej: Serie A 3.5% vs Serie APV 1.2%) erosiona aproximadamente el 31% del capital final compuesto en 20 años. Ilustrar este cálculo al usuario. Usar `bc`, `awk` o `node -e` en Bash para cálculos precisos de interés compuesto.
4. Si `all-funds` devuelve error, array vacío o datos incompletos, verificar: formato de fechas (usar ISO 8601: YYYY-MM-DD), IDs正确os, y conexión. No inventar ni estimar datos faltantes — declarar la falla y sugerir el comando corregido.

### Objetivo: Análisis de Cartera y Diversificación

1. Para el fondo seleccionado, ejecutar `cartera <run>` para ver la composición macro por tipo de instrumento (renta fija, renta variable, internacional)
2. Ejecutar `holdings <run>` y verificar que **ningún emisor individual** supere el 25% del `pct_activo_fondo`. Este es el límite regulatorio de la Ley 20.712: aplica al emisor, no al tipo de instrumento
3. Verificar exposición extranjera con `holdings <run> --market E` para evaluar riesgo cambiario

### Objetivo: Análisis de AGF

1. Ejecutar `ranking --metric patrimony` y `ranking --metric shareholders`
2. Comparar posición relativa de la AGF en ambos rankings
3. Divergencia entre patrimonio alto y partícipes bajos = riesgo de concentración institucional

### Objetivo: Análisis de Evolución Histórica

1. Ejecutar `evolution` para una o varias AGF
2. Analizar tendencias de patrimonio o partícipes en el tiempo
3. Identificar si hay contracciones patrimoniales sostenidas (señal de problemas)

---

## Manejo de Errores y Edge Cases

Si un comando devuelve error, array vacío o datos incompletos:

1. **Verificar sintaxis del comando**: especialmente formato de fechas y IDs
2. **Usar ISO 8601** para fechas: `YYYY-MM-DD` (ej: `2026-03-31`)
3. **Verificar que el ID exista**: ejecutar `providers` o `all-funds` para confirmar IDs válidos
4. **No inventar datos faltantes**: si el CLI no retorna información, declararlo explícitamente
5. **Reintentar con parámetros corregidos**: si el formato era el problema, el segundo intento suele funcionar
6. **Reportar falla clara**: indicar qué comando falló, qué error se obtuvo, y qué acción correctiva se tomó

---

## Notas sobre los Datos

- Los IDs que usa el CLI son CRC32 de identificadores originales de la CMF: no son arbitrarios, son derivables
- Los datos son públicos y provienen de la CMF Chile
- Las métricas de riesgo son snapshots: verificar `as_of_date` para confirmar vigencia
- Para due diligence cualitativa de una AGF (gobierno corporativo, conflictos de agencia, rotación de equipo), se requiere información adicional fuera de esta CLI (cuestionarios DDQ, infos públicas de la CMF)