# BuscaFondos CLI

Herramienta de línea de comandos (CLI) para consultar y analizar fondos mutuos chilenos utilizando datos públicos de la CMF.

## ¿Qué es?

BuscaFondos CLI permite a desarrolladores, analistas e investigadores acceder al instante a los datos del mercado de fondos mutuos chilenos directamente desde la terminal, sin necesidad de usar un navegador o depender de una API REST.

**Datos disponibles:**

- Más de **23 administradoras (AGF)** registradas.
- Más de **1.900 series de fondos** vigentes.
- Más de **6 años de datos históricos**.
- Valor cuota diario, TAC (Tasa Anual de Costos), patrimonio y número de partícipes.
- Métricas de riesgo (volatilidad, _max drawdown_).
- Composición de cartera (_holdings_).

## Instalación

**Instalación global vía npm:**

```bash
npm install -g git+https://github.com/JoaquinMulet/buscafondosCLI.git
```

**Para desarrollo local:**

```bash
git clone https://github.com/JoaquinMulet/buscafondosCLI.git
cd buscafondosCLI
npm install
npm start -- health
```

## Uso rápido

```bash
# Estado del servicio
buscafondos health

# Listar todas las AGF
buscafondos providers

# Listar los fondos de una AGF específica
buscafondos funds <provider_id>

# Ver todas las series de un fondo
buscafondos series <concept_id>

# Ver el TAC de una serie
buscafondos tac <asset_id>

# Ver métricas de riesgo
buscafondos risk <asset_id>

# Serie histórica de valores cuota
buscafondos days <asset_id>
buscafondos days <asset_id> --from-date 2024-01-01

# Rentabilidad anualizada a 1Y y 3Y
buscafondos returns <asset_id>

# Evolución de una o más administradoras
buscafondos evolution -a "BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A." -m patrimony -f 2024-01 -t 2024-12
buscafondos evolution -a "SCOTIABANK CHILE S.A." -a "BANCO DE CHILE" -m shareholders

# Ranking de AGF por patrimonio
buscafondos ranking --metric patrimony

# Listar todos los fondos del mercado
buscafondos all-funds
buscafondos all-funds --category money_market

# Resumen de la cartera de un fondo
buscafondos cartera <run>

# Composición individual de la cartera (holdings)
buscafondos holdings <run> --market E
```

## Comandos disponibles

| Comando                                                            | Descripción                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `buscafondos health`                                               | Estado del servicio y fecha de la última extracción de datos (_scraping_). |
| `buscafondos providers`                                            | Lista todas las Administradoras Generales de Fondos (AGF).                 |
| `buscafondos funds <provider_id>`                                  | Fondos pertenecientes a una AGF.                                           |
| `buscafondos series <concept_id>`                                  | Series de un fondo con su respectivo valor cuota.                          |
| `buscafondos tac <asset_id>`                                       | Tasa Anual de Costos (TAC) de una serie.                                   |
| `buscafondos risk <asset_id>`                                      | Métricas de riesgo (volatilidad, _drawdown_).                              |
| `buscafondos days <asset_id> [--from-date]`                        | Serie histórica de valores cuota.                                          |
| `buscafondos returns <asset_id> [--from-date]`                     | Rentabilidad anualizada a 1Y y 3Y.                                         |
| `buscafondos tac-history <asset_id>`                               | Historial mensual del TAC.                                                 |
| `buscafondos ranking [--metric patrimony\|shareholders]`           | Ranking general de las AGF.                                                |
| `buscafondos all-funds [--category] [--date]`                      | Universo completo de fondos mutuos.                                        |
| `buscafondos cartera <run> [--month]`                              | Resumen de la cartera por instrumento.                                     |
| `buscafondos holdings <run> [--market] [--month]`                  | Activos individuales (_holdings_).                                         |
| `buscafondos evolution -a <admin> [-a <admin2>]... [-m] [-f] [-t]` | Evolución mensual de una o más AGF.                                        |

## _Skill_ para Agentes de IA

El CLI incluye una **skill** (habilidad) lista para integrarse en tu proyecto de agente de Inteligencia Artificial. Esta _skill_ le proporciona al agente todo el contexto de dominio necesario para realizar análisis profesionales de fondos mutuos chilenos, incluyendo: taxonomía de categorías, límites regulatorios, fórmulas de riesgo, beneficios tributarios y el flujo analítico completo.

### Instalar la _skill_

```bash
cp -r skills/buscafondos <tu-proyecto>/.claude/skills/
```

## Fuente de datos

Los datos expuestos por esta herramienta son de carácter público y provienen de la **Comisión para el Mercado Financiero (CMF)** de Chile.

_Nota: Esta herramienta tiene fines informativos y de investigación, y no constituye asesoría financiera._

## Licencia

[MIT](https://choosealicense.com/licenses/mit/)
