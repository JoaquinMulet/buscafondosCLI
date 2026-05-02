---
name: buscafondos-cli
description: Guía de análisis profesional para fondos mutuos chilenos. Úsela cuando necesite consultar o analizar fondos mutuos en Chile, incluyendo AGF, TAC, rentabilidad, métricas de riesgo, rankings, carteras o cualquier aspecto del mercado de fondos chilenos.
user-invocable: false
allowed-tools: Bash, Read
---

# Análisis Profesional de Fondos Mutuos en Chile

_Skill_ (guía) para agentes de IA que realizan análisis de fondos mutuos chilenos. Esta _skill_ enseña al agente cómo descubrir y analizar datos vía CLI, y provee el contexto de dominio necesario para interpretar correctamente cada campo de la respuesta.

---

## Arquitectura del CLI y Recursos Disponibles

El CLI `buscafondos` es la única interfaz de acceso a los datos. Todos los comandos devuelven JSON con la estructura `data` + `attributes`. El agente debe tratar cada respuesta como una fuente de datos dinámica, no como valores estáticos.

**Base de descubrimiento:** Antes de cualquier análisis, el agente debe descubrir el universo disponible ejecutando comandos en una secuencia lógica. Nunca asuma que conoce la lista de AGF, categorías o fondos — siempre debe consultarla vía CLI.

**CRÍTICO — Rentabilidad ya incluye TAC:** La rentabilidad que publica el fondo (y que devuelve el CLI) ES la rentabilidad neta después de descontar la TAC. NO restes la TAC nuevamente. Sería un error grave duplicar este descuento. Si necesitas comparar dos fondos, usa directamente su rentabilidad publicada.

**Filtrado de resultados JSON:** Dado que los comandos devuelven JSON, SIEMPRE usa `jq` para filtrar grandes volúmenes de datos directamente en Bash antes de procesarlos. Ejemplo:

```bash
buscafondos all-funds | jq '.data[] | select(.attributes.category == "equity")'
buscafondos all-funds | jq '.data[] | select(.attributes.tac < 0.02)'
buscafondos all-funds | jq '.data | length'
```

````

**NUNCA imprimas el JSON completo de `all-funds` en la terminal.** Filtra primero con `jq` para obtener solo los registros relevantes.

**Cálculos matemáticos:** Para calcular el _Sharpe Ratio_, _downside capture_, o cualquier otra métrica que requiera precisión, NO intentes hacer el cálculo mentalmente. Usa herramientas de Bash:

```bash
# Sharpe Ratio con awk
awk 'BEGIN { Rp=0.07; Rf=0.05; sigma=0.12; printf "%.2f\n", (Rp - Rf) / sigma }'

# node -e para cálculos complejos
node -e "console.log(Math.sqrt(12) * 0.045)"
```

Si ninguna de estas herramientas está disponible, declara explícitamente que no puedes realizar el cálculo y explica la fórmula al usuario.

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

**Retorna:** Lista de todas las administradoras con `id` (CRC32) y `name`.

**Cómo usarlo:** Este comando es el punto de partida de cualquier análisis. No existe una lista fija de AGF — se descubre en _runtime_ (tiempo de ejecución). El agente debe iterar sobre las AGF según el objetivo del análisis.

**Contexto de dominio:** Una AGF (Administradora General de Fondos) es una sociedad anónima regulada bajo la Ley 20.712 que administra fondos por cuenta y riesgo de los partícipes. La solidez patrimonial y la reputación corporativa de la AGF son factores críticos en la selección; una AGF con problemas regulatorios puede poner en riesgo el patrimonio del fondo.

---

### funds <provider_id> — Descubrir fondos de una AGF

```bash
buscafondos funds <provider_id>
```

**Retorna:** Lista de fondos de una AGF con `id` (concept_id), `run`, `name`, `category`.

**Cómo usarlo:** Obtener el `provider_id` de `providers`, y luego iterar sobre los fondos. Cada fondo tiene un `concept_id` necesario para consultar sus series.

**Descubrimiento de categorías:** El campo `category` indica la clase de activo del fondo. Las categorías posibles NO deben _hardcodearse_ (fijarse en código) — se obtienen del campo `category` de la respuesta. **Regla estricta:** Bajo ninguna circunstancia el agente debe inventar, deducir o asumir categorías que no estén explícitamente listadas en la respuesta del campo `category`. Si el CLI no devuelve una categoría, esa categoría no existe para efectos del análisis. Las principales categorías por contexto de dominio son:

- `money_market`: Deuda a corto plazo (<90 días), vehículo ultraconservador.
- `equity` / `libre_inversion`: ≥90% en instrumentos de capitalización (acciones).
- `fixed_income`: Deuda de mediano-largo plazo, expuesto a riesgo de tasa.
- `balanced`: Mixto (renta fija + renta variable), amplitud máxima del 50% en capitalización.

El agente debe usar estas definiciones para interpretar lo que el CLI devuelve, y no asumir una lista cerrada.

---

### series <concept_id> — Series y valores cuota

```bash
buscafondos series <concept_id>
```

**Retorna:** Series de un fondo con `id` (asset_id), `name`, `serie` (letra), `investor_class`, `last_day` (net_asset_value, total_net_assets, shareholders, date).

**Cómo usarlo:** Descubrir todas las series disponibles de un fondo. Cada serie tiene su propio `asset_id` y puede tener un TAC diferente. El campo `investor_class` indica si es _Retail_, Institucional, APV, etc.

**Concepto clave — Serie de Cuotas:** Un mismo fondo (misma cartera de activos) puede emitir múltiples series de cuotas (A, B, C, I, APV, etc.) que se diferencian solo en costos y barreras de entrada, NO en el portafolio subyacente. La Serie A es típicamente _retail_, la Serie I es institucional con un alto umbral de capital. La diferencia de TAC entre series de un mismo fondo puede ser de varios puntos porcentuales y erosiona fuertemente el capital compuesto a lo largo del tiempo.

---

## Comandos de Análisis de Costos

### tac <asset_id> — Tasa Anual de Costos

```bash
buscafondos tac <asset_id>
```

**Retorna:** `expense_ratio` (fracción decimal, ej: 0.0132 = 1.32%) e `investor_class`.

**Interpretación:** Multiplicar `expense_ratio` por 100 para obtener el porcentaje. La TAC es la suma de todas las cargas monetarias del fondo: remuneración de la administradora, gastos operacionales (custodia, auditores) y costos de intermediación. Es un costo determinístico que se resta directamente del capital compuesto.

**Contexto de dominio — TAC:** La Tasa Anual de Costos es la métrica de eficiencia en gastos más importante para comparar fondos. Una TAC del 3% vs. 1% en un periodo de 20 años puede representar una diferencia de más del 40% del capital final compuesto. El agente debe buscar SIEMPRE la serie con la menor TAC disponible para el perfil del cliente.

**Concepto de benchmark de costos:** La industria provee tres referencias — TAC industria (media del mercado en esa categoría/moneda), TAC mínimo (la más baja de esa AGF) y TAC máximo (la más alta). Si un fondo está cerca del TAC máximo de su categoría sin justificación de un mayor _alpha_, es ineficiente.

---

### tac-history <asset_id> --from-date YYYY-MM-DD — Historial de TAC

```bash
buscafondos tac-history <asset_id>
buscafondos tac-history <asset_id> --from-date 2024-01-01
```

**Retorna:** Serie temporal mensual de `expense_ratio` con `date`.

**Formato de fechas:** Usar ISO 8601 (`YYYY-MM-DD`). No usar otros formatos como `YYYYMMDD` o `DD/MM/YYYY`.

**Para qué sirve:** Detectar tendencias al alza o a la baja en los costos a lo largo del tiempo. Si un fondo ha subido su TAC progresivamente, puede indicar problemas de escala (patrimonio decreciendo, costos fijos en expansión). Las bajas de costos pueden indicar mayor competencia o eficiencia operativa de la AGF.

---

## Comandos de Análisis de Riesgo y Performance

### days <asset_id> — Serie histórica de valores cuota

```bash
buscafondos days <asset_id>
buscafondos days <asset_id> --from-date 2024-01-01
```

**Parámetros:**

- `--from-date <date>`: Fecha de inicio en formato `YYYY-MM-DD`.

**Retorna:** Serie temporal diaria de `price` (valor cuota) con `date`. Útil para calcular retornos manualmente o graficar la evolución del precio.

---

### returns <asset_id> — Rentabilidad anualizada

```bash
buscafondos returns <asset_id>
buscafondos returns <asset_id> --from-date 2024-01-01
```

**Parámetros:**

- `--from-date <date>`: Fecha de inicio en formato `YYYY-MM-DD`.

**Retorna:** Rentabilidades anualizadas a 1Y y 3Y basadas en la serie de precios. Muestra el valor cuota actual, la rentabilidad anualizada y la variación total.

---

### risk <asset_id> — Métricas de riesgo

```bash
buscafondos risk <asset_id>
```

**Retorna:** `serie`, `run`, `volatility_annualized_12m`, `volatility_annualized_36m`, `max_drawdown_36m`, `risk_level` (low/medium/high), `risk_score` (0-100), `as_of_date`.

**Interpretación de volatilidad:** La desviación estándar de los retornos mensuales indica el riesgo total del fondo. Una volatilidad alta no es necesariamente mala si el retorno compensado es proporcional — por eso se usan ratios ajustados por riesgo (ver sección de métricas derivadas).

**Interpretación de max_drawdown_36m:** La máxima caída desde un _peak_ (pico máximo) en 36 meses. Un _drawdown_ de -18% en 36m es severo para perfiles conservadores. Compara contra el _max_drawdown_ del _benchmark_ del fondo para evaluar si el gestor protege o amplifica las caídas.

**Interpretación de risk_score:** Puntuación numérica de 0 a 100 donde mayor = más riesgoso. Es un indicador sintético que agrupa las distintas métricas de riesgo.

---

## Comandos de Análisis de Mercado

### all-funds — Universo completo de fondos

```bash
buscafondos all-funds
buscafondos all-funds --category equity
buscafondos all-funds --category money_market --date 2026-03-31
```

**Retorna:** Lista de todos los fondos vigentes del mercado. Cada registro incluye `run`, `fundName`, `agf`, `category`, `tac` (expense_ratio), `dailyChange` (variación % de hoy), `monthlyChange` (variación % del mes), `patrimony` (millones de pesos), `shareholders`.

**Formato de fechas:** ISO 8601 (`YYYY-MM-DD`). No usar otros formatos.

**Cómo usarlo:** Este es el comando principal de _screening_ cuantitativo. El agente debe usar `jq` para filtrar los resultados antes de procesarlos. Ejemplo:

```bash
buscafondos all-funds --category equity | jq '.data[] | select(.tac < 0.025)'
```

**NUNCA imprimas el JSON completo** — usa `jq` para obtener solo los registros relevantes.

**Descubrimiento de categorías:** En lugar de asumir categorías, el agente debe extraerlas de la respuesta de `all-funds` agrupando por el campo `category`. Las categorías posibles se descubren en _runtime_, no se _hardcodean_.

---

### ranking — Ranking de AGF

```bash
buscafondos ranking --metric patrimony
buscafondos ranking --metric shareholders
buscafondos ranking --metric patrimony --date 2026-03-31
```

**Retorna:** Lista ordenada de AGF con `rank`, `administrator` (nombre), `total_patrimony`, `total_shareholders`, `fund_count`.

**Interpretación:** El ranking por patrimonio revela la concentración de mercado — las 5 mayores AGF suelen acumular la mayoría del _AUM_ (activos bajo administración). El ranking por partícipes indica qué AGF está captando más clientes/hogares. Una divergencia entre ambos (alto patrimonio, baja base de partícipes) indica concentración institucional: riesgo de flujos masivos de un solo cliente.

**Contexto de dominio:** La concentración de mercado es relevante para el análisis de competencia. Las AGF con patrimonios pequeños pueden tener dificultades para lograr economías de escala, elevando su TAC mínima.

---

### evolution — Evolución mensual de AGF

```bash
buscafondos evolution -a "BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A." -m patrimony -f 2024-01 -t 2025-12
buscafondos evolution -a "SCOTIABANK CHILE S.A." -a "BANCO DE CHILE" -m shareholders
```

**Parámetros:**

- `-a, --admin <name>` (requerido): Nombre de la administradora. Repetir `-a` para comparar varias.
- `-m, --metric <metric>`: `patrimony` (por defecto) o `shareholders`.
- `-f, --from <month>`: Mes de inicio en formato `YYYY-MM`.
- `-t, --to <month>`: Mes de fin en formato `YYYY-MM`.

**Retorna:** Serie temporal mensual pivotada por AGF con valores de `patrimony` o `shareholders` según la métrica (`metric`) elegida.

**Para qué sirve:** Analizar tendencias de crecimiento o contracción patrimonial de una o varias AGF a lo largo del tiempo. Permite identificar qué AGF están ganando o perdiendo tamaño y si existen correlaciones entre los flujos de distintas administradoras.

---

## Comandos de Análisis de Cartera

### cartera <run> — Resumen de cartera

```bash
buscafondos cartera 10058-7
buscafondos cartera 9570 --month 2025-02
```

**Retorna:** Resumen agrupado por `tipo_instrumento` con `num_holdings`, `valorizacion_nacional`, `valorizacion_extranjera`, `pct_activo_fondo`.

**Interpretación:** El campo `pct_activo_fondo` indica el peso de cada tipo de instrumento sobre el total del fondo. Esta vista macro permite verificar la composición general (renta fija vs. renta variable vs. internacional) según el mandato del fondo.

---

### holdings <run> — Holdings individuales

```bash
buscafondos holdings 9570
buscafondos holdings 9570 --market E
buscafondos holdings 9570 --market N
```

**Retorna:** Lista de instrumentos en cartera con `market` (nacional/extranjera), `nemotecnico`, `emisor`, `pais`, `tipo_instrumento`, `valorizacion`, `pct_activo_fondo`.

**Interpretación:** Cada activo (_holding_) tiene su peso relativo `pct_activo_fondo`. **El límite regulatorio de la Ley 20.712 aplica al EMISOR, no al tipo de instrumento.** Esto significa que un fondo puede tener el 100% de su cartera en "Acciones" si su mandato es de renta variable, pero NO puede tener más del 25% invertido en las acciones o deuda de una sola empresa (ej: no puede tener el 30% del fondo solo en SQM o Banco de Chile). El campo `emisor` es el que debe verificarse contra este límite. El campo `pais` permite verificar la concentración geográfica. Los _holdings_ extranjeros (market=E) implican riesgo cambiario que debe evaluarse según el horizonte del cliente.

**Verificación ESG (concepto):** Si el análisis incluye criterios ESG, el agente puede cruzar los nemotécnicos de los _holdings_ con bases de datos de controversias ambientales/sociales. Activos en sectores penalizados (minería sin gestión hídrica, empresas con violaciones de derechos humanos) son señales de alerta para carteras que declaran un enfoque ESG.

---

## Conceptos de Dominio para Interpretación

### Peer Groups y Comparabilidad

No es válido comparar el rendimiento de un fondo _money market_ con uno accionario. Los _peer groups_ (grupos de pares) se definen por la combinación de:

- **Categoría** del fondo (money_market, equity, balanced, etc.).
- **Denominación monetaria** (CLP, USD, EUR).
- **Serie** (Retail, Institucional, APV).

El agente debe asegurar siempre que los fondos comparados pertenezcan al mismo _peer group_ antes de emitir juicios relativos de desempeño.

### Benchmark y Valorización

Los fondos de deuda en Chile se valorizan con precios de proveedores como RiskAmerica o LVA Índices, no con precios de mercado directo. Esto es relevante porque el mercado secundario de deuda corporativa chileno adolece de problemas de liquidez. El agente debe saber que los valores cuota diarios reflejan _mark-to-market_ según curvas de rendimiento de estos proveedores, y no necesariamente precios de transacción real.

Para fondos de renta variable, el _benchmark_ es típicamente un índice de LVA Índices o RiskAmerica (ej: LVAZCS3B para deuda corporativa a corto plazo BBB).

**Regla de oro — Priorizar mayor rentabilidad neta:** Al recomendar un fondo, USA directamente la rentabilidad que publica el fondo (que ya incluye el descuento de la TAC). No calcules una "rentabilidad neta restando la TAC" porque sería un error grave (estarías descontando dos veces). Un fondo con 4% de TAC y 12% de rentabilidad publicada supera a uno con 1% de TAC y 6% de rentabilidad publicada: la diferencia de 6 puntos de rentabilidad neta compensa con creces la mayor TAC. **Siempre favorece la mayor rentabilidad neta publicada, ajustada por riesgo.**

### Retorno y Riesgo: Ratios Derivados

Los datos de riesgo se obtienen del CLI. El agente debe saber calcular o interpretar las siguientes métricas derivadas:

**Tasa Libre de Riesgo (Rf):** Para Chile, usar la TPM (Tasa de Política Monetaria) del Banco Central de Chile (verificar valor actual) o el rendimiento de bonos BCU/BCP según el horizonte del fondo. Si no se tiene acceso a datos en tiempo real de la TPM, declarar explícitamente el valor asumido (ej: "Asumiendo Rf = 5.5% basado en TPM de abril de 2026") y usar ese valor de manera consistente en todos los cálculos de _Sharpe Ratio_ del análisis. **No mezclar tasas ni inventar valores.**

**Sharpe Ratio:**
$$\text{Sharpe} = \frac{R_p - R_f}{\sigma_p}$$

Donde $R_p$ = retorno promedio anualizado del fondo, $R_f$ = tasa libre de riesgo (en Chile usar TPM o rendimiento de bonos BCU/BCP), y $\sigma_p$ = desviación estándar anualizada de los retornos del fondo. Un _Sharpe_ > 1.0 es excelente. Un _Sharpe_ < 0.5 indica que el fondo no es recompensado adecuadamente por el riesgo asumido.

**Downside Capture:**
$$\text{DownsideCapture} = \frac{R_{\text{gestor}}(R_{\text{bench}} < 0)}{R_{\text{bench}}(R_{\text{bench}} < 0)}$$

Si el resultado es < 100%, el gestor protege mejor que el _benchmark_ en caídas. Si es > 100%, amplifica las caídas.

**Tracking Error e Information Ratio:**
El _tracking error_ ($\text{TE}$) es la volatilidad del exceso de rendimiento del fondo sobre su _benchmark_. Un fondo con _tracking error_ alto diverge fuertemente del índice. El _Information Ratio_ divide ese exceso de retorno por el _tracking error_:
$$\text{IR} = \frac{R_p - R_b}{\text{TE}}$$
Mientras mayor sea el IR, más consistentemente el gestor genera _alpha_ sobre el _benchmark_.

### Estructura Legal y Regulatoria

**Límites regulatorios (Ley 20.712):** La legislación chilena establece que un fondo no puede:

- Poseer más del 25% del capital suscrito y pagado de un emisor.
- Representar más del 25% del total de activos de un emisor.
- Concentrar más del 25% en deuda soberana (de Chile o del extranjero).

Estos límites son de cumplimiento obligatorio y el agente debe detectarlos en el análisis de cartera (comandos `cartera` y `holdings`).

**CMF como regulador:** La Comisión para el Mercado Financiero es el ente fiscalizador. Los reglamentos internos de cada fondo deben estar depositados en el Registro Público de Depósito de Reglamentos Internos. La CMF puede revocar la autorización de existencia de una AGF por infracciones graves.

### Beneficios Tributarios

El agente debe conocer el marco tributario para orientar análisis y comparaciones:

**Art. 108 LIR — Traslado entre fondos:** Las ganancias de capital se arrastran contablemente al nuevo fondo cuando se traspasa el capital entre fondos mutuos (incluso de distintas AGF), sin tributar hasta el rescate final. Esto permite rebalancear portafolios sin costo fiscal intermedio.

**Art. 107 LIR (modificado por Ley 21.420):** Las ganancias en fondos mutuos con presencia bursátil tributan a un impuesto único y definitivo del 10%, en lugar de la tasa marginal del IGC que puede llegar al 40%. Este es un arbitraje fiscal significativo para inversionistas de alto patrimonio.

**Art. 57 LIR:** Las ganancias en fondos mutuos están exentas del IGC si el rescate anual es menor a 30 UTM.

**APV:** Series exclusivas de Ahorro Previsional Voluntario. El régimen Letra A otorga una bonificación estatal del 15% sobre el ahorro. El régimen Letra B permite rebajar la base imponible.

---

## Guía de Flujo Analítico

### Objetivo: _Screening_ Inicial de Candidatos

1. Ejecutar `all-funds --category <cat>` para obtener el universo en la categoría objetivo.
2. Filtrar mentalmente por TAC aceptable, nivel de riesgo y patrimonio mínimo.
3. Seleccionar 3 a 5 candidatos para un análisis profundo.

### Objetivo: Selección de la Serie Óptima

1. Para cada candidato, ejecutar `series <concept_id>` para ver todas las series disponibles.
2. Para cada serie, ejecutar `tac <asset_id>` para comparar los costos.
3. **Usar directamente la rentabilidad que publica cada serie** (ya incluye el descuento de la TAC — NO restar la TAC nuevamente). **Siempre recomendar la serie de mayor rentabilidad neta publicada.** La diferencia de TAC entre series de un mismo fondo puede ser de varios puntos porcentuales y erosiona fuertemente el capital compuesto en el tiempo: sobre un capital de $10.000.000 y un retorno bruto anual del 7%, una diferencia de 2.3% en la TAC (ej: Serie A 3.5% vs Serie APV 1.2%) erosiona aproximadamente el 31% del capital final compuesto en 20 años. Ilustra este cálculo al usuario usando `bc`, `awk` o `node -e` en Bash para cálculos precisos de interés compuesto.
4. Si `all-funds` devuelve error, un array vacío o datos incompletos, verifica: formato de fechas (usar ISO 8601: YYYY-MM-DD), IDs correctos y conexión. No inventes ni estimes datos faltantes — declara la falla y sugiere el comando corregido.

### Objetivo: Análisis de Cartera y Diversificación

1. Para el fondo seleccionado, ejecutar `cartera <run>` para ver la composición macro por tipo de instrumento (renta fija, renta variable, internacional).
2. Ejecutar `holdings <run>` y verificar que **ningún emisor individual** supere el 25% del `pct_activo_fondo`. Este es el límite regulatorio de la Ley 20.712: aplica al emisor, no al tipo de instrumento.
3. Verificar la exposición extranjera con `holdings <run> --market E` para evaluar el riesgo cambiario.

### Objetivo: Análisis de AGF

1. Ejecutar `ranking --metric patrimony` y `ranking --metric shareholders`.
2. Comparar la posición relativa de la AGF en ambos rankings.
3. Divergencia entre patrimonio alto y partícipes bajos = riesgo de concentración institucional.

### Objetivo: Análisis de Evolución Histórica

1. Ejecutar `evolution` para una o varias AGF.
2. Analizar las tendencias de patrimonio o partícipes en el tiempo.
3. Identificar si hay contracciones patrimoniales sostenidas (señal de problemas).

---

## Manejo de Errores y _Edge Cases_

Si un comando devuelve error, un array vacío o datos incompletos:

1. **Verificar la sintaxis del comando**: Especialmente el formato de fechas y los IDs.
2. **Usar ISO 8601** para fechas: `YYYY-MM-DD` (ej: `2026-03-31`).
3. **Verificar que el ID exista**: Ejecutar `providers` o `all-funds` para confirmar que los IDs son válidos.
4. **No inventar datos faltantes**: Si el CLI no retorna información, declararlo explícitamente.
5. **Reintentar con parámetros corregidos**: Si el formato era el problema, el segundo intento suele funcionar.
6. **Reportar la falla de forma clara**: Indicar qué comando falló, qué error se obtuvo y qué acción correctiva se tomó.

---

## Notas sobre los Datos

- Los IDs que usa el CLI son CRC32 de los identificadores originales de la CMF: no son arbitrarios, son derivables.
- Los datos son públicos y provienen de la CMF Chile.
- Las métricas de riesgo son _snapshots_ (capturas en un momento dado): verificar `as_of_date` para confirmar su vigencia.
- Para realizar _due diligence_ cualitativa de una AGF (gobierno corporativo, conflictos de agencia, rotación de equipo), se requiere información adicional externa a este CLI (cuestionarios _DDQ_, información pública de la CMF).
````
