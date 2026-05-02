# BuscaFondos CLI

CLI de linea de comandos para consultar y analizar fondos mutuos chilenos, consumiendo la API publica de [BuscaFondos](https://buscafondos.com) basada en datos de la CMF.

## Que es

BuscaFondos CLI permite a agentes IA, desarrolladores e investigadores acceder a datos del mercado de fondos mutuos chilenos sin necesidad de usar el navegador ni consumir la API REST directamente. Todo se hace desde la terminal.

Datos disponibles:

- **22+ administradoras (AGF)** registradas
- **1.900+ series de fondos** vigentes
- **6+ anos de datos historicos**
- Valor cuota diario, TAC, patrimonio, participes
- Metricas de riesgo (volatilidad, max drawdown)
- Composicion de cartera (holdings)

## Instalacion

### Desde PyPI (proximo)

```bash
pip install buscafondos
```

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

## Uso rapido

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

# Ver metricas de riesgo
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

## Integracion con Agentes IA

Para agentes IA que consumen la API como libreria Python:

```python
from buscafondos.api import BuscaFondosClient

client = BuscaFondosClient()

# Estado del servicio
health = client.health()

# Todas las AGF
providers = client.list_providers()

# Todos los fondos del mercado
all_funds = client.list_all_funds(category="equity")

# Ranking AGF
ranking = client.ranking(metric="patrimony")

# Cartera de un fondo
cartera = client.cartera_resumen("9570")

client.close()
```

Todos los metodos retornan diccionarios Python con la respuesta JSON de la API.

## Comandos disponibles

| Comando | Descripcion |
|---------|-------------|
| `buscafondos health` | Estado del servicio y fecha de ultimo scrapeo |
| `buscafondos providers` | Lista todas las administradoras (AGF) |
| `buscafondos funds <provider_id>` | Fondos de una AGF |
| `buscafondos series <concept_id>` | Series de un fondo con valor cuota |
| `buscafondos tac <asset_id>` | Tasa Anual de Costos de una serie |
| `buscafondos risk <asset_id>` | Metricas de riesgo (volatilidad, drawdown) |
| `buscafondos tac-history <asset_id>` | Historial mensual de TAC |
| `buscafondos ranking [--metric patrimony\|shareholders]` | Ranking de AGF |
| `buscafondos all-funds [--category] [--date]` | Universo completo de fondos |
| `buscafondos cartera <run> [--month]` | Resumen de cartera por instrumento |
| `buscafondos holdings <run> [--market] [--month]` | Holdings individuales |

## Skill para Agentes IA (Claude Code, Kilo, etc.)

El CLI viene con una **skill** lista para instalar en tu proyecto de agente IA. Esta skill le da al agente todo el contexto de dominio necesario para realizar analisis profesionales de fondos mutuos chilenos — taxonomia de categorias, limites regulatorios, formulas de riesgo, beneficios tributarios, y el flujo analitico completo.

### Instalar la skill

**Para Kilo / Claude Code** — copia la carpeta `skills/buscafondos/` a tu directorio de skills del proyecto:

```bash
# En tu proyecto de agente IA
cp -r skills/buscafondos <tu-proyecto>/.claude/skills/
```

Tambien puedes clonar directamente:

```bash
git clone https://github.com/JoaquinMulet/buscafondosCLI.git
cp -r skills/buscafondos <tu-proyecto>/.claude/skills/
```

### Que incluye la skill

- Descripcion de todos los comandos CLI y como interpretarlos
- Contexto de dominio: Ley 20.712, limites regulatorios, taxonomia de fondos
- Formulas de metricas: Sharpe, Treynor, Information Ratio, Downside Capture
- Marco tributario: Art. 108 LIR (traslado entre fondos), Art. 107 LIR (impuesto 10%), APV
- Flujo analitico completo: screening → seleccion de serie → analisis de cartera → metricas de riesgo
- Reglas anti-alucinacion: el agente nunca debe inventar categorias que no esten en la respuesta de la API
- Calculo obligatorio de **fee drag** al recomendar una serie

## Fuente de datos

Los datos son de caracter publico y provienen de la Comision para el Mercado Financiero (CMF) de Chile. Esta herramienta no constituye asesoria financiera.

## Licencia

MIT