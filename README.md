# BuscaFondos CLI

CLI de línea de comandos para consultar y analizar fondos mutuos chilenos con datos públicos de la CMF.

## Qué es

BuscaFondos CLI permite a desarrolladores e investigadores acceder a datos del mercado de fondos mutuos chilenos desde la terminal, sin navegador ni API REST.

Datos disponibles:

- **22+ administradoras (AGF)** registradas
- **1.900+ series de fondos** vigentes
- **6+ años de datos históricos**
- Valor cuota diario, TAC, patrimonio, partícipes
- Métricas de riesgo (volatilidad, max drawdown)
- Composición de cartera (holdings)

## Instalación

### Desde el repo

```bash
pip install git+https://github.com/JoaquinMulet/buscafondosCLI.git
```

### Desarrollo local

```bash
git clone https://github.com/JoaquinMulet/buscafondosCLI.git
cd buscafondosCLI
uv sync
uv run pytest tests/
```

## Uso rápido

```bash
# Estado del servicio
buscafondos health

# Listar todas las AGF
buscafondos providers

# Listar fondos de una AGF
buscafondos funds <provider_id>

# Ver todas las series de un fondo
buscafondos series <concept_id>

# Ver el TAC de una serie
buscafondos tac <asset_id>

# Ver métricas de riesgo
buscafondos risk <asset_id>

# Ranking de AGF por patrimonio
buscafondos ranking --metric patrimony

# Todos los fondos del mercado
buscafondos all-funds
buscafondos all-funds --category equity

# Resumen de cartera de un fondo
buscafondos cartera <run>

# Holdings individuales
buscafondos holdings <run> --market E
```

## Comandos disponibles

| Comando | Descripción |
|---------|-------------|
| `buscafondos health` | Estado del servicio y fecha de último scrapeo |
| `buscafondos providers` | Lista todas las administradoras (AGF) |
| `buscafondos funds <provider_id>` | Fondos de una AGF |
| `buscafondos series <concept_id>` | Series de un fondo con valor cuota |
| `buscafondos tac <asset_id>` | Tasa Anual de Costos de una serie |
| `buscafondos risk <asset_id>` | Métricas de riesgo (volatilidad, drawdown) |
| `buscafondos tac-history <asset_id>` | Historial mensual de TAC |
| `buscafondos ranking [--metric patrimony\|shareholders]` | Ranking de AGF |
| `buscafondos all-funds [--category] [--date]` | Universo completo de fondos |
| `buscafondos cartera <run> [--month]` | Resumen de cartera por instrumento |
| `buscafondos holdings <run> [--market] [--month]` | Holdings individuales |

## Skill para Agentes IA

El CLI viene con una **skill** lista para instalar en tu proyecto de agente IA. Esta skill le da al agente todo el contexto de dominio necesario para realizar análisis profesionales de fondos mutuos chilenos: taxonomía de categorías, límites regulatorios, fórmulas de riesgo, beneficios tributarios y el flujo analítico completo.

### Instalar la skill

```bash
# En tu proyecto de agente IA
cp -r skills/buscafondos <tu-proyecto>/.claude/skills/
```

También puedes clonar directamente:

```bash
git clone https://github.com/JoaquinMulet/buscafondosCLI.git
cp -r skills/buscafondos <tu-proyecto>/.claude/skills/
```

### Qué incluye la skill

- Descripción de todos los comandos CLI y cómo interpretarlos
- Contexto de dominio: Ley 20.712, límites regulatorios, taxonomía de fondos
- Fórmulas de métricas: Sharpe, Treynor, Information Ratio, Downside Capture
- Marco tributario: Art. 108 LIR (traslado entre fondos), Art. 107 LIR (impuesto 10%), APV
- Flujo analítico completo: screening, selección de serie, análisis de cartera, métricas de riesgo
- Reglas anti-alucinación: el agente nunca debe inventar categorías que no estén en la respuesta de la API
- Cálculo obligatorio de **fee drag** al recomendar una serie

## Fuente de datos

Los datos son de carácter público y provienen de la Comisión para el Mercado Financiero (CMF) de Chile. Esta herramienta no constituye asesoría financiera.

## Licencia

MIT