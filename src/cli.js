#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import BuscaFondosClient from './api.js';

const client = new BuscaFondosClient();

function printTable(headers, rows) {
  const colWidths = headers.map((h, i) => {
    const maxRow = rows.reduce((m, r) => Math.max(m, (r[i] || '').toString().length), h.length);
    return maxRow;
  });

  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
  console.log(chalk.bold(headerRow));
  console.log(colWidths.map(w => '-'.repeat(w)).join('-+-'));
  rows.forEach(row => {
    const cells = row.map((c, i) => (c || '').toString().padEnd(colWidths[i]));
    console.log(cells.join(' | '));
  });
}

async function health() {
  const data = await client.health();
  console.log(chalk.green('Status:'), data.status);
  console.log('Last scraped:', data.last_scraped_date);
  console.log('Total records:', data.total_records.toLocaleString());
}

async function providers() {
  const data = await client.listProviders();
  const items = data.data || [];
  console.log(chalk.bold(`\nAdministradoras (${items.length})\n`));
  const headers = ['ID', 'Nombre'];
  const rows = items.map(item => [item.id.toString(), item.attributes.name]);
  printTable(headers, rows);
}

async function funds(providerId) {
  const data = await client.listFunds(parseInt(providerId));
  const items = data.data || [];
  console.log(chalk.bold(`\nFondos (${items.length})\n`));
  const headers = ['ID', 'Nombre', 'RUN', 'Categoria'];
  const rows = items.map(item => [
    item.id.toString(),
    item.attributes.name,
    item.attributes.run,
    item.attributes.category
  ]);
  printTable(headers, rows);
}

async function series(conceptId) {
  const data = await client.listSeries(parseInt(conceptId));
  const items = data.data || [];
  console.log(chalk.bold(`\nSeries (${items.length})\n`));
  const headers = ['ID', 'Nombre', 'Serie', 'Clase', 'Valor Cuota', 'Patrimonio'];
  const rows = items.map(item => {
    const attrs = item.attributes;
    const lastDay = attrs.last_day || {};
    return [
      item.id.toString(),
      attrs.name,
      attrs.serie,
      attrs.investor_class,
      (lastDay.net_asset_value || 0).toFixed(2),
      (lastDay.total_net_assets || 0).toLocaleString()
    ];
  });
  printTable(headers, rows);
}

async function tac(assetId) {
  const data = await client.getExpenseRatio(parseInt(assetId));
  const attrs = data.data.attributes;
  const pct = (attrs.expense_ratio || 0) * 100;
  console.log(`TAC: ${chalk.yellow(pct.toFixed(2) + '%')} (${attrs.investor_class})`);
}

async function risk(assetId) {
  const data = await client.getRiskMetrics(parseInt(assetId));
  const attrs = data.data.attributes;
  console.log(`Serie: ${attrs.serie} - RUN: ${attrs.run}`);
  console.log(`Fecha: ${attrs.as_of_date}`);
  console.log(`Volatilidad 12m: ${(attrs.volatility_annualized_12m * 100).toFixed(2)}%`);
  console.log(`Volatilidad 36m: ${(attrs.volatility_annualized_36m * 100).toFixed(2)}%`);
  console.log(`Max Drawdown 36m: ${(attrs.max_drawdown_36m * 100).toFixed(2)}%`);
  console.log(`Nivel riesgo: ${attrs.risk_level} (score: ${attrs.risk_score})`);
}

async function ranking(metric, date) {
  const data = await client.ranking(metric, date);
  const items = data.data || [];
  const meta = data.meta || {};
  console.log(chalk.bold(`\nRanking AGF por ${meta.metric} (${meta.date})\n`));
  const headers = ['#', 'AGF', 'Patrimonio', 'Participes', 'Fondos'];
  const rows = items.map(item => {
    const attrs = item.attributes;
    return [
      attrs.rank.toString(),
      (attrs.administrator || '').substring(0, 50),
      (attrs.total_patrimony || 0).toLocaleString(),
      (attrs.total_shareholders || 0).toLocaleString(),
      attrs.fund_count.toString()
    ];
  });
  printTable(headers, rows);
}

async function allFunds(category, date) {
  const data = await client.listAllFunds(category, date);
  const items = data.data || [];
  console.log(chalk.bold(`\nTodos los fondos (${items.length})\n`));
  const headers = ['RUN', 'Nombre', 'AGF', 'Cat', 'TAC', 'Var.Dia%', 'Var.Mes%'];
  const rows = items.map(item => [
    item.run,
    (item.fundName || '').substring(0, 40),
    (item.agf || '').substring(0, 30),
    item.category,
    ((item.tac || 0) * 100).toFixed(2) + '%',
    (item.dailyChange || 0).toFixed(2),
    (item.monthlyChange || 0).toFixed(2)
  ]);
  printTable(headers, rows);
}

async function days(assetId, fromDate) {
  const data = await client.getDays(parseInt(assetId), fromDate);
  const items = data.data || [];
  const meta = data.meta || {};
  console.log(chalk.bold(`\nSerie historica - Asset ${meta.asset_id} (${items.length} dias)\n`));
  const headers = ['Fecha', 'Valor Cuota'];
  const rows = items.slice(-30).reverse().map(item => {
    const attrs = item.attributes || item;
    return [
      attrs.date || '',
      (attrs.price || 0).toFixed(4)
    ];
  });
  printTable(headers, rows);
}

async function returns(assetId, fromDate) {
  const data = await client.getDays(parseInt(assetId), fromDate);
  const items = data.data || [];
  const prices = items
    .map(item => ({ date: item.attributes.date, price: item.attributes.price }))
    .sort((a, b) => a.date.localeCompare(b.date));

  function annualizedReturn(startPrice, endPrice, days) {
    if (!startPrice || !endPrice || days <= 0) return 0;
    return (Math.pow(endPrice / startPrice, 365 / days) - 1) * 100;
  }

  const now = prices[prices.length - 1];
  const periods = [
    { name: '1Y', days: 365 },
    { name: '3Y', days: 365 * 3 }
  ];

  console.log(chalk.bold(`\nRentabilidades anualizadas - Asset ${assetId}\n`));
  console.log(`Valor cuota actual (${now.date}): ${now.price.toFixed(4)}\n`);

  const headers = ['Periodo', 'Rentabilidad Anualizada %', 'Variacion Total %'];
  const rows = [];
  for (const p of periods) {
    const idx = prices.length - 1 - p.days;
    if (idx >= 0) {
      const start = prices[idx];
      const annRet = annualizedReturn(start.price, now.price, p.days);
      const totalRet = ((now.price / start.price) - 1) * 100;
      rows.push([p.name, annRet.toFixed(2) + '%', totalRet.toFixed(2) + '%']);
    }
  }
  printTable(headers, rows);
}

async function tacHistory(assetId, fromDate) {
  const data = await client.getExpenseRatioHistory(parseInt(assetId), fromDate);
  const items = data.data || [];
  console.log(chalk.bold(`\nHistorial TAC - Asset ${assetId} (${items.length} meses)\n`));
  const headers = ['Fecha', 'TAC%'];
  const rows = items.map(item => {
    const attrs = item.attributes || item;
    return [
      attrs.date || '',
      ((attrs.expense_ratio || 0) * 100).toFixed(4) + '%'
    ];
  });
  printTable(headers, rows.reverse());
}

async function cartera(run, month) {
  const data = await client.carteraResumen(run, month);
  const items = data.data || [];
  const meta = data.meta || {};
  console.log(chalk.bold(`\nCartera - RUN ${meta.run} (${meta.month})\n`));
  const headers = ['Tipo', '#Holdings', 'Nac.', 'Ext.', '%Activo'];
  const rows = items.map(item => {
    const attrs = item.attributes;
    return [
      attrs.tipo_instrumento,
      attrs.num_holdings.toString(),
      (attrs.valorizacion_nacional || 0).toLocaleString(),
      (attrs.valorizacion_extranjera || 0).toLocaleString(),
      (attrs.pct_activo_fondo || 0).toFixed(2) + '%'
    ];
  });
  printTable(headers, rows);
}

async function holdings(run, month, market) {
  const data = await client.carteraHoldings(run, month, market);
  const items = data.data || [];
  const meta = data.meta || {};
  console.log(chalk.bold(`\nHoldings - RUN ${meta.run} (${meta.month})\n`));
  const headers = ['Emisor', 'Nemotecnico', 'Pais', 'Tipo', 'Valorizacion', '%Activo'];
  const rows = items.map(item => {
    const attrs = item.attributes;
    return [
      (attrs.emisor || '').substring(0, 30),
      attrs.nemotecnico || '',
      attrs.pais || '',
      attrs.tipo_instrumento,
      (attrs.valorizacion || 0).toLocaleString(),
      (attrs.pct_activo_fondo || 0).toFixed(2) + '%'
    ];
  });
  printTable(headers, rows);
}

const program = new Command();

program
  .name('buscafondos')
  .description('CLI para fondos mutuos chilenos via API de BuscaFondos')
  .version('1.0.0');

program.command('health').description('Ver estado del servicio').action(health);

program.command('providers').description('Listar todas las administradoras (AGF)').action(providers);

program.command('funds').description('Listar fondos de una administradora').argument('<provider_id>', 'ID de la AGF').action(funds);

program.command('series').description('Listar series de un fondo').argument('<concept_id>', 'ID del concepto').action(series);

program.command('tac').description('Ver TAC de una serie').argument('<asset_id>', 'ID de la serie').action(tac);

program.command('risk').description('Ver metricas de riesgo de una serie').argument('<asset_id>', 'ID de la serie').action(risk);

program.command('ranking')
  .description('Ranking de AGF por patrimonio o participantes')
  .option('-m, --metric <metric>', 'Metrica (patrimony|shareholders)', 'patrimony')
  .option('-d, --date <date>', 'Fecha (YYYY-MM-DD)')
  .action((opts) => ranking(opts.metric, opts.date));

program.command('all-funds')
  .description('Listar todos los fondos del mercado')
  .option('-c, --category <category>', 'Categoria del fondo')
  .option('-d, --date <date>', 'Fecha (YYYY-MM-DD)')
  .action((opts) => allFunds(opts.category, opts.date));

program.command('cartera')
  .description('Resumen de cartera de un fondo')
  .argument('<run>', 'RUN del fondo')
  .option('-m, --month <month>', 'Mes (YYYY-MM)')
  .action((run, opts) => cartera(run, opts.month));

program.command('holdings')
  .description('Holdings individuales de un fondo')
  .argument('<run>', 'RUN del fondo')
  .option('-m, --month <month>', 'Mes (YYYY-MM)')
  .option('-mkt, --market <market>', 'Mercado (all|N|E)', 'all')
  .action((run, opts) => holdings(run, opts.month, opts.market));

program.command('days')
  .description('Serie historica de valores cuota')
  .argument('<asset_id>', 'ID de la serie')
  .option('-f, --from-date <date>', 'Fecha inicio (YYYYMMDD)')
  .action((assetId, opts) => days(assetId, opts.fromDate));

program.command('returns')
  .description('Rentabilidad anualizada a 1Y, 3Y')
  .argument('<asset_id>', 'ID de la serie')
  .option('-f, --from-date <date>', 'Fecha inicio (YYYYMMDD)')
  .action((assetId, opts) => returns(assetId, opts.fromDate));

program.command('tac-history')
  .description('Historial de TAC de una serie')
  .argument('<asset_id>', 'ID de la serie')
  .option('-f, --from-date <date>', 'Fecha inicio (YYYYMMDD)')
  .action((assetId, opts) => tacHistory(assetId, opts.fromDate));

program.parse();