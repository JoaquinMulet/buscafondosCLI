import typer
from rich.console import Console
from rich.table import Table
from rich import print as rprint
from buscafondos.api import BuscaFondosClient

app = typer.Typer(help="CLI para fondos mutuos chilenos via BuscaFondos API")
console = Console()


@app.command()
def health():
    """Ver estado del servicio."""
    client = BuscaFondosClient()
    data = client.health()
    console.print(f"[green]Status:[/green] {data.get('status')}")
    console.print(f"Last scraped: {data.get('last_scraped_date')}")
    console.print(f"Total records: {data.get('total_records'):,}")
    client.close()


@app.command()
def providers():
    """Listar todas las administradoras (AGF)."""
    client = BuscaFondosClient()
    data = client.list_providers()
    items = data.get("data", [])
    table = Table(title=f"Administradoras ({len(items)})")
    table.add_column("ID", style="dim")
    table.add_column("Nombre")
    for item in items:
        attrs = item.get("attributes", {})
        table.add_row(str(item["id"]), attrs.get("name", ""))
    console.print(table)
    client.close()


@app.command()
def funds(provider_id: int):
    """Listar fondos de una administradora."""
    client = BuscaFondosClient()
    data = client.list_funds(provider_id)
    items = data.get("data", [])
    table = Table(title=f"Fondos ({len(items)})")
    table.add_column("ID", style="dim")
    table.add_column("Nombre")
    table.add_column("RUN")
    table.add_column("Categoria")
    for item in items:
        attrs = item.get("attributes", {})
        table.add_row(
            str(item["id"]),
            attrs.get("name", ""),
            attrs.get("run", ""),
            attrs.get("category", ""),
        )
    console.print(table)
    client.close()


@app.command()
def series(concept_id: int):
    """Listar series de un fondo."""
    client = BuscaFondosClient()
    data = client.list_series(concept_id)
    items = data.get("data", [])
    table = Table(title=f"Series ({len(items)})")
    table.add_column("ID", style="dim")
    table.add_column("Nombre")
    table.add_column("Serie")
    table.add_column("Clase")
    table.add_column("Valor Cuota", style="green")
    table.add_column("Patrimonio", style="cyan")
    for item in items:
        attrs = item.get("attributes", {})
        last_day = attrs.get("last_day", {})
        table.add_row(
            str(item["id"]),
            attrs.get("name", ""),
            attrs.get("serie", ""),
            attrs.get("investor_class", ""),
            f"{last_day.get('net_asset_value', 0):,.2f}",
            f"{last_day.get('total_net_assets', 0):,.0f}",
        )
    console.print(table)
    client.close()


@app.command()
def tac(asset_id: int):
    """Ver TAC de una serie."""
    client = BuscaFondosClient()
    data = client.get_expense_ratio(asset_id)
    attrs = data.get("data", {}).get("attributes", {})
    pct = attrs.get("expense_ratio", 0) * 100
    console.print(f"TAC: [yellow]{pct:.2f}%[/yellow] ({attrs.get('investor_class', '')})")
    client.close()


@app.command()
def risk(asset_id: int):
    """Ver metricas de riesgo de una serie."""
    client = BuscaFondosClient()
    data = client.get_risk_metrics(asset_id)
    attrs = data.get("data", {}).get("attributes", {})
    console.print(f"Serie: {attrs.get('serie')} - RUN: {attrs.get('run')}")
    console.print(f"Fecha: {attrs.get('as_of_date')}")
    console.print(f"Volatilidad 12m: {attrs.get('volatility_annualized_12m', 0)*100:.2f}%")
    console.print(f"Volatilidad 36m: {attrs.get('volatility_annualized_36m', 0)*100:.2f}%")
    console.print(f"Max Drawdown 36m: {attrs.get('max_drawdown_36m', 0)*100:.2f}%")
    console.print(f"Nivel riesgo: {attrs.get('risk_level')} (score: {attrs.get('risk_score')})")
    client.close()


@app.command()
def ranking(metric: str = "patrimony", date: str = None):
    """Ranking de AGF por patrimonio o partícipes."""
    client = BuscaFondosClient()
    data = client.ranking(metric=metric, date=date)
    items = data.get("data", [])
    meta = data.get("meta", {})
    table = Table(title=f"Ranking AGF por {meta.get('metric')} ({meta.get('date')})")
    table.add_column("#", style="dim")
    table.add_column("AGF")
    table.add_column("Patrimonio", style="green")
    table.add_column("Participes", style="cyan")
    table.add_column("Fondos")
    for item in items:
        attrs = item.get("attributes", {})
        table.add_row(
            str(attrs.get("rank", "")),
            attrs.get("administrator", "")[:50],
            f"{attrs.get('total_patrimony', 0):,.0f}",
            f"{attrs.get('total_shareholders', 0):,}",
            str(attrs.get("fund_count", "")),
        )
    console.print(table)
    client.close()


@app.command()
def all_funds(category: str = None, date: str = None):
    """Listar todos los fondos del mercado."""
    client = BuscaFondosClient()
    data = client.list_all_funds(category=category, date=date)
    items = data.get("data", [])
    table = Table(title=f"Todos los fondos ({len(items)})")
    table.add_column("RUN")
    table.add_column("Nombre")
    table.add_column("AGF")
    table.add_column("Cat")
    table.add_column("TAC")
    table.add_column("Var.Dia%", style="green")
    table.add_column("Var.Mes%", style="cyan")
    for item in items:
        table.add_row(
            item.get("run", ""),
            item.get("fundName", "")[:40],
            item.get("agf", "")[:30],
            item.get("category", ""),
            f"{item.get('tac', 0)*100:.2f}%",
            f"{item.get('dailyChange', 0):.2f}",
            f"{item.get('monthlyChange', 0):.2f}",
        )
    console.print(table)
    client.close()


@app.command()
def cartera(run: str, month: str = None):
    """Resumen de cartera de un fondo (por RUN)."""
    client = BuscaFondosClient()
    data = client.cartera_resumen(run, month)
    items = data.get("data", [])
    meta = data.get("meta", {})
    console.print(f"[bold]Cartera - RUN {meta.get('run')} ({meta.get('month')})[/bold]")
    table = Table()
    table.add_column("Tipo")
    table.add_column("#Holdings")
    table.add_column("Nac.", style="green")
    table.add_column("Ext.", style="cyan")
    table.add_column("%Activo")
    for item in items:
        attrs = item.get("attributes", {})
        table.add_row(
            attrs.get("tipo_instrumento", ""),
            str(attrs.get("num_holdings", "")),
            f"{attrs.get('valorizacion_nacional', 0):,.0f}",
            f"{attrs.get('valorizacion_extranjera', 0):,.0f}",
            f"{attrs.get('pct_activo_fondo', 0):.2f}%",
        )
    console.print(table)
    client.close()


@app.command()
def holdings(run: str, month: str = None, market: str = "all"):
    """Holdings individuales de un fondo (por RUN)."""
    client = BuscaFondosClient()
    data = client.cartera_holdings(run, month, market)
    items = data.get("data", [])
    meta = data.get("meta", {})
    console.print(f"[bold]Holdings - RUN {meta.get('run')} ({meta.get('month')})[/bold]")
    table = Table(title=f"Holdings ({len(items)})")
    table.add_column("Emisor")
    table.add_column("Nemotecnico")
    table.add_column("Pais")
    table.add_column("Tipo")
    table.add_column("Valorizacion", style="green")
    table.add_column("%Activo", style="cyan")
    for item in items:
        attrs = item.get("attributes", {})
        table.add_row(
            attrs.get("emisor", "")[:30],
            attrs.get("nemotecnico", ""),
            attrs.get("pais", ""),
            attrs.get("tipo_instrumento", ""),
            f"{attrs.get('valorizacion', 0):,.0f}",
            f"{attrs.get('pct_activo_fondo', 0):.2f}%",
        )
    console.print(table)
    client.close()


if __name__ == "__main__":
    app()