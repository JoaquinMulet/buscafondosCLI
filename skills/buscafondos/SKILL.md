---
name: buscafondos-cli
description: Guia de analisis profesional para fondos mutuos chilenos. Usar cuando se necesita consultar o analizar fondos mutuos en Chile, incluyendo AGF, TAC, rentabilidad, metricas de riesgo, rankings, carteras o cualquier aspecto del mercado de fondos chilenos.
user-invocable: false
allowed-tools: Bash, Read
---

# Analisis Profesional de Fondos Mutuos en Chile

Skill-guia para agentes IA que realizan analisis de fondos mutuos chilenos. Esta skill ensena al agente como descubrir y analizar datos via CLI, y provee el contexto de dominio necesario para interpretar correctamente cada campo de respuesta.

---

## Arquitectura de la API y Recursos Disponibles

La API de BuscaFondos provee datos publicos de la CMF. Todos los comandos devuelven JSON con estructura `data` + `attributes`. El agente debe tratar cada respuesta como una fuente de datos dinamica, no como valores estaticos.

**Base de descubrimiento:** antes de cualquier analisis, el agente debe descubrir el universo disponible ejecutando comandos en secuencia logica. Nunca asumir que se conoce la lista de AGF, categorias o fondos — siempre consultarla via API.

---

## Comandos de Descubrimiento

### providers — Identificar AGF del sistema

```bash
buscafondos providers
```

**Retorna:** lista de todas las administradoras con `id` (CRC32) y `name`.

**Como usarlo:** este comando es el punto de partida de cualquier analisis. No existe una lista fija de AGF — se descubre en runtime. El agente debe iterar sobre las AGF segun el objetivo del analisis.

**Contexto de dominio:** una AGF (Administradora General de Fondos) es una sociedad anonima regulada bajo Ley 20.712 que administra fondos por cuenta y riesgo de los participantes. La solidez patrimonial y la reputacion corporativa de la AGF son factores criticos en la seleccion — una AGF con problemas regulatorios puede poner en riesgo el patrimonio del fondo.

---

### funds <provider_id> — Descubrir fondos de una AGF

```bash
buscafondos funds <provider_id>
```

**Retorna:** lista de fondos de una AGF con `id` (concept_id), `run`, `name`, `category`, `currency`.

**Como usarlo:** obtener el `provider_id` de `providers`, luego iterar sobre los fondos. Cada fondo tiene un `concept_id` necesario para consultar series.

**Descubrimiento de categorias:** el campo `category` indica la clase de activo del fondo. Las categorias posibles NO deben hardcodearse — se obtienen del campo `category` de la respuesta. **Regla estricta:** bajo ninguna circunstancia el agente debe inventar, deducir o asumir categorias que no esten explicitamente listadas en la respuesta del campo `category`. Si la API no devuelve una categoria, esa categoria no existe para efectos del analisis. Las principales categorias por contexto de dominio son:

- `money_market`: deuda corto plazo (<90 dias), vehiculo ultra-conservador
- `equity` / `libre_inversion`: >=90% en instrumentos de capitalizacion (acciones)
- `fixed_income`: deuda de mediano-largo plazo, expuesto a riesgo de tasa
- `balanced`: mixto renta fija + renta variable, amplitud max 50% en capitalizacion

El agente debe usar estas definiciones para interpretar lo que la API devuelve, no asumir una lista cerrada.

---

### series <concept_id> — Series y valores cuota

```bash
buscafondos series <concept_id>
```

**Retorna:** series de un fondo con `id` (asset_id), `serie` (letra), `investor_class`, `last_day` (net_asset_value, total_net_assets, shareholders, date).

**Como usarlo:** descubrir todas las series disponibles de un fondo. Cada serie tiene su propio `asset_id` y puede tener diferente TAC. El campo `investor_class` indica si es Retail, Institucional, APV, etc.

**Concepto clave — Serie de Cuotas:** un mismo fondo (misma cartera de activos) puede emitir multiples series de cuotas (A, B, C, I, APV, etc.) que se diferencian solo en costos y barrera de entrada, NO en el portafolio subyacente. La Serie A es tipicamente retail, la Serie I es institucional con alto umbral de capital. La diferencia de TAC entre series de un mismo fondo puede ser de varios puntos porcentuales y erosiona fuertemente el capital compuesto en el tiempo.

---

## Comandos de Analisis de Costos

### tac <asset_id> — Tasa Anual de Costos

```bash
buscafondos tac <asset_id>
```

**Retorna:** `expense_ratio` (fraccion decimal, ej: 0.0132 = 1.32%) e `investor_class`.

**Interpretacion:** multiplicar `expense_ratio` por 100 para obtener el porcentaje. La TAC es la suma de todas las cargas monetarias del fondo: remuneracion de la administradora, gastos operacionales (custodia, auditores) y costos de intermediacion. Es un costo deterministico que resta directamente del capital compuesto.

**Contexto de dominio — TAC:** la Tasa Anual de Costos es la metrica de eficiencia en gastos mas importante para comparar fondos. Una TAC del 3% vs 1% sobre 20 anos puede representar la diferencia de mas del 40% del capital final compuesto. El agente debe siempre buscar la serie de menor TAC disponible para el cliente.

**Concepto de benchmark de costos:** la industria provee tres referencias — TAC industria (media del mercado en esa categoria/moneda), TAC minimo (la mas baja de esa AGF), TAC maximo (la mas alta). Si un fondo esta cerca del TAC maximo de su categoria sin justificacion de mayor alpha, es ineficiente.

---

### tac-history <asset_id> --from-date YYYYMMDD — Historial de TAC

```bash
buscafondos tac-history <asset_id>
buscafondos tac-history <asset_id> --from-date 20240101
```

**Retorna:** serie temporal mensual de `expense_ratio` con `date`.

**Para que sirve:** detectar tendencias de alzas o bajas de costos en el tiempo. Si un fondo ha subido su TAC progresivamente, puede indicar problemas de escala (patrimonio decreciendo, costos fijos en expansion). Datos de baja de costos pueden indicar competencia o eficiencia operativa de la AGF.

---

## Comandos de Analisis de Riesgo y Performance

### risk <asset_id> — Metricas de riesgo

```bash
buscafondos risk <asset_id>
```

**Retorna:** `volatility_monthly_12m`, `volatility_monthly_36m`, `volatility_annualized_12m`, `volatility_annualized_36m`, `max_drawdown_36m`, `risk_level` (low/medium/high), `risk_score` (0-100), `as_of_date`.

**Interpretacion de volatilidad:** la desviacion estandar de los retornos mensuales indica el riesgo total del fondo. Volatilidad alta no es necesariamente mala si el retorno compensado es proporcional — por eso se usan ratios ajustados por riesgo (ver seccion de metricas derivadas).

**Interpretacion de max_drawdown_36m:** la maxima caida desde un peak en 36 meses. Un drawdown de -18% en 36m es severo para perfiles conservadores. Comparar contra el max_drawdown del benchmark del fondo para evaluar si el gestor protege o amplifica las caidas.

**Interpretacion de risk_score:** score numerico 0-100 donde mayor = mas riesgoso. Es un indicador sintetico que agrega las distintas metricas de riesgo.

---

## Comandos de Analisis de Mercado

### all-funds — Universo completo de fondos

```bash
buscafondos all-funds
buscafondos all-funds --category equity
buscafondos all-funds --category money_market --date 2026-03-31
```

**Retorna:** lista de todos los fondos vigentes del mercado. Cada registro incluye todos los campos de `series` mas `dailyChange` (variacion % hoy), `monthlyChange` (variacion % mes), `tac` (expense_ratio), `patrimony` (millones de pesos), `shareholders`, metricas de riesgo completas, y `category`.

**Como usarlo:** este es el comando principal de screening cuantitativo. El agente puede filtrar mentalmente los resultados por los criterios del analisis: TAC aceptable, categoria objetivo, nivel de riesgo, variacion diaria/mensual. El resultado es una lista de candidatos para analisis profundo posterior.

**Descubrimiento de categorias:** en lugar de asumir categorias, el agente debe extraerlas de la respuesta de `all-funds` agrupando por el campo `category`. Las categorias posibles se descubren en runtime, no se hardcodifican.

---

### ranking — Ranking de AGF

```bash
buscafondos ranking --metric patrimony
buscafondos ranking --metric shareholders
buscafondos ranking --metric patrimony --date 2026-03-31
```

**Retorna:** lista ordenada de AGF con `rank`, `administrator` (nombre), `total_patrimony`, `total_shareholders`, `fund_count`.

**Interpretacion:** el ranking por patrimonio revela concentracion de mercado — las 5 mayores AGF suelen acumular la mayoria del AUM. El ranking por participantes indica que AGF esta captando hogares. Una divergencia entre ambos (alto patrimonio, baja base de participantes) indica concentracion institucional: riesgo de flujos masivos de un solo cliente.

**Contexto de dominio:** la concentracion de mercado es relevante para el analisis de competencia. AGF con patrimonios pequenos pueden tener dificultades para lograr economias de escala, elevando su TAC minima.

---

### evolution — Evolucion mensual de AGF

```bash
buscafondos evolution "BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A." "SCOTIABANK CHILE S.A." --metric patrimony --from-month 2024-01 --to-month 2025-12
```

**Retorna:** serie temporal mensual pivotada por AGF con valores de `patrimony` o `shareholders` segun `metric`.

**Para que sirve:** analizar tendencias de crecimiento o contraction patrimonial de una o varias AGF en el tiempo. Permite identificar quais AGF estan ganando o perdiendo tamano y si existen correlaciones entre flujos de distintas AGF.

---

## Comandos de Analisis de Cartera

### cartera <run> — Resumen de cartera

```bash
buscafondos cartera 10058-7
buscafondos cartera 9570 --month 2025-02
```

**Retorna:** resumen agrupado por `tipo_instrumento` con `num_holdings`, `valorizacion_nacional`, `valorizacion_extranjera`, `pct_activo_fondo`.

**Interpretacion:** el campo `pct_activo_fondo` indica el peso de cada tipo de instrumento sobre el total del fondo. Esta vista macro permite verificar la composicion general (renta fija vs renta variable vs internacional) segun el mandato del fondo.

---

### holdings <run> — Holdings individuales

```bash
buscafondos holdings 9570
buscafondos holdings 9570 --market E
buscafondos holdings 9570 --market N
```

**Retorna:** lista de instrumentos en cartera con `market` (nacional/extranjera), `nemotecnico`, `emisor`, `pais`, `tipo_instrumento`, `valorizacion`, `pct_activo_fondo`.

**Interpretacion:** cada holding tiene su peso relativo `pct_activo_fondo`. **El limite regulatorio de la Ley 20.712 aplica al EMISOR, no al tipo de instrumento.** Esto significa que un fondo puede tener el 100% de su cartera en "Acciones" si su mandato es de renta variable, pero NO puede tener mas del 25% invertido en las acciones o deuda de una sola empresa (ej: no puede tener el 30% del fondo solo en SQM o Banco de Chile). El campo `emisor` es el que debe verificarse contra este limite. El campo `pais` permite verificar concentracion geografica. Holdings extranjeros (market=E) implican riesgo cambiario que debe evaluarse segun el horizonte del cliente.

**Verificacion ESG (concepto):** si el analisis incluye criterios ESG, el agente puede cruzar los nemotecnicos de los holdings con bases de datos de controversias ambientales/sociales. Holdings en sectores penalizados (mineria sin gestion hidrica, empresas con violaciones de derechos humanos) son senales de alerta para carteras que declaran enfoque ESG.

---

## Conceptos de Dominio para Interpretacion

### Peer Groups y Comparabilidad

No es valido comparar el rendimiento de un fondo money market con uno accionario. Los peer groups se definen por la combinacion de:

- **Categoria** del fondo (money_market, equity, balanced, etc.)
- **Denominacion monetaria** (CLP, USD, EUR)
- **Serie** (Retail, Institucional, APV)

El agente debe siempre asegurar que los fondos comparados pertenezcan al mismo peer group antes de emitir juicios relativos de desempeno.

### Benchmark y Valorizacion

Los fondos de deuda en Chile se valorizan con precios de proveedores como RiskAmerica o LVA Indices, no con precios de mercado directo. Esto es relevante porque el mercado secundario de deuda corporativa chileno adolece de problemas de liquidez. El agente debe saber que los valores cuota diarios reflejan mark-to-market segun curvas de rendimiento de estos proveedores, no necesariamente precios de transaccion real.

Para fondos de renta variable, el benchmark es tipicamente un indice de LVA Indices o RiskAmerica (ej: LVAZCS3B para deuda corporativa corto plazo BBB).

### Retorno y Riesgo: Ratios Derivados

La API devuelve metricas de riesgo en bruto. El agente debe saber calcular o interpretar las siguientes metricas derivadas:

**Sharpe Ratio:**
$$\text{Sharpe} = \frac{R_p - R_f}{\sigma_p}$$

Donde $R_p$ = retorno promedio anualizado del fondo, $R_f$ = tasa libre de riesgo (en Chile usar TPM del Banco Central de Chile o rendimiento de bonos BCU/BCP segun el horizonte), $\sigma_p$ = desviacion estandar anualizada de los retornos del fondo. Un Sharpe > 1.0 es excelente. Sharpe < 0.5 indica que el fondo no es recompensado adecuadamente por el riesgo asumido.

**Downside Capture:**
$$\text{DownsideCapture} = \frac{R_{\text{gestor}}(R_{\text{bench}} < 0)}{R_{\text{bench}}(R_{\text{bench}} < 0)}$$

Si el resultado es < 100%, el gestor protege mejor que el benchmark en caidas. Si es > 100%, amplifica las caidas.

**Tracking Error e Information Ratio:**
El tracking error ($\text{TE}$) es la volatilidad del exceso de rendimiento del fondo sobre su benchmark. Un fondo con tracking error alto diverge fuertemente del indice. El Information Ratio divide ese exceso de retorno por el tracking error:
$$\text{IR} = \frac{R_p - R_b}{\text{TE}}$$
Mientras mayor el IR, mas consistentemente el gestor genera alpha sobre el benchmark.

### Estructura Legal y Regulatoria

**Limites regulatorios (Ley 20.712):** la legislacion chilena establece que un fondo no puede:

- Poseer mas del 25% del capital suscrito y pagado de un emisor
- Representar mas del 25% del total de activos de un emisor
- Concentrar mas del 25% en deuda soberana (Chile o extranjero)

Estos limites son de cumplimiento obligatorio y el agente debe detectarlos en el analisis de cartera (comando `cartera` y `holdings`).

**CMF como regulador:** la Comision para el Mercado Financiero es el ente fiscalizador. Los reglamentos internos de cada fondo deben estar depositados en el Registro Publico de Deposito de Reglamentos Internos. La CMF puede revocar la autorizacion de existencia de una AGF por infracciones graves.

### Beneficios Tributarios

El agente debe conocer el marco tributario para orientar analisis y comparaciones:

**Art. 108 LIR — Traslado entre fondos:** las ganancias de capital se arrastran contablemente al nuevo fondo cuando se traspasa entre fondos (incluso de distintas AGF), sin tributar hasta el rescate final. Esto permite rebalancear portafolios sin costo fiscal intermedio.

**Art. 107 LIR (modificado por Ley 21.420):** las ganancias en fondos mutuos con presencia bursatil tributan a un impuesto unico y definitivo del 10%, en lugar de la tasa marginal del IGC que puede llegar al 40%. Este es un arbitraje fiscal significativo para inversionistas de alto patrimonio.

**Art. 57 LIR:** las ganancias en fondos mutuos estan exentas del IGC si el rescate anual es menor a 30 UTM.

**APV:** series exclusivas de ahorro previsional voluntario. El regimen Letra A otorga bonificacion estatal del 15% sobre el ahorro. El regimen Letra B permite rebajar la base imponible.

---

## Guia de Flujo Analitico

### Objetivo: Screening Inicial de Candidatos

1. Ejecutar `all-funds --category <cat>` para obtener el universo en la categoria objetivo
2. Filtrar mentalmente por TAC aceptable, nivel de riesgo, patrimonio minimo
3. Seleccionar 3-5 candidatos para analisis profundo

### Objetivo: Seleccion de Serie Optima

1. Para cada candidato, ejecutar `series <concept_id>` para ver todas las series disponibles
2. Para cada serie, ejecutar `tac <asset_id>` para comparar costos
3. **Siempre recomendar la serie de menor TAC** disponible para el perfil del cliente. **Calcular el fee drag:** mostrar al usuario la diferencia monetaria en 10 y 20 anos entre elegir la serie de menor TAC vs la de mayor TAC. Ejemplo: si la Serie A tiene TAC 3.5% y la Serie APV tiene TAC 1.2%, sobre un capital de $10.000.000 con retorno bruto anual del 7%, la diferencia de fees (2.3%) erosiona aproximadamente el 31% del capital final compuesto en 20 anos. Este calculo es obligatorio para ilustrar el costo de oportunidad.

### Objetivo: Analisis de Cartera y Diversificacion

1. Para el fondo seleccionado, ejecutar `cartera <run>` para ver la composicion macro por tipo de instrumento (renta fija, renta variable, internacional)
2. Ejecutar `holdings <run>` y verificar que **ningun emisor individual** supere el 25% del `pct_activo_fondo`. Este es el limite regulatorio de la Ley 20.712: aplica al emisor, no al tipo de instrumento
3. Verificar exposition extranjero con `holdings <run> --market E` para evaluar riesgo cambiario

### Objetivo: Analisis de AGF

1. Ejecutar `ranking --metric patrimony` y `ranking --metric shareholders`
2. Comparar posicion relativa de la AGF en ambos rankings
3. Divergencia entre patrimonio alto y participantes bajos = riesgo de concentracion institucional

### Objetivo: Analisis de Evolucion Historica

1. Ejecutar `evolution` para una o varias AGF
2. Analizar tendencias de patrimonio o participantes en el tiempo
3. Identificar si hay contracciones patrimoniales sostenidas (senal de problemas)

---

## Notas sobre la API

- Los IDs que usa la API son CRC32 de identificadores originales de la CMF: no son arbitrarios, son derivables
- Los datos son publicos y provenance de la CMF Chile
- Las metricas de riesgo son snapshots: verificar `as_of_date` para confirmar vigencia
- Para due diligence cualitativa de una AGF (gobierno corporativo, conflictos de agencia, rotacion de equipo), se requiere informacion adicional fuera de esta API (cuestionarios DDQ, infos publicas de la CMF)