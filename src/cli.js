#!/usr/bin/env node

import { Command, Option } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import BuscaFondosClient from './api.js';

const client = new BuscaFondosClient();

let globalJson = false;
let globalOutputFile = null;

function output(data) {
  if (globalOutputFile) {
    const content = globalJson ? JSON.stringify(data, null, 2) : data;
    fs.writeFileSync(globalOutputFile, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    console.log(chalk.green(`Saved to ${globalOutputFile}`));
  } else if (globalJson) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    return data;
  }
  return null;
}

function wrapResponse(items, total, limit, offset) {
  return {
    meta: {
      total_records: total,
      returned_records: items.length,
      has_more: (offset || 0) + items.length < total,
      limit: limit ?? null,
      offset: offset || 0
    },
    data: items
  };
}

function printTable(headers, rows) {
  if (globalJson) return;
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

function handleResult(result, dataExtractor) {
  if (!result.success) {
    console.error(chalk.red(`Error: ${result.error.message}`));
    process.exit(1);
  }
  const data = dataExtractor(result.data);
  output(data);
}

async function health() {
  const result = await client.health();
  handleResult(result, (data) => {
    if (globalJson || globalOutputFile) return data;
    console.log(chalk.green('Status:'), data.status);
    console.log('Last scraped:', data.last_scraped_date);
    console.log('Total records:', data.total_records.toLocaleString());
    return data;
  });
}

async function providers(opts) {
  const result = await client.listProviders({
    limit: opts.limit,
    offset: opts.offset
  });
  handleResult(result, (data) => {
    let items = data.data || [];

    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter(item => (item.attributes.name || '').toLowerCase().includes(q));
    }

    const total = items.length;
    const offset = opts.offset || 0;
    items = items.slice(offset, opts.limit ? offset + opts.limit : undefined);

    const response = wrapResponse(items, total, opts.limit, offset);
    if (globalJson || globalOutputFile) return response;
    console.log(chalk.bold(`\nAdministradoras (${items.length})${opts.limit ? ` (of ${total})` : ''}\n`));
    const headers = ['ID', 'Nombre'];
    const rows = items.map(item => [item.id.toString(), item.attributes.name]);
    printTable(headers, rows);
    if (total > items.length) console.log(chalk.dim(`Hint: use --offset ${offset + items.length} to get more`));
    return response;
  });
}

async function funds(providerId, opts) {
  const result = await client.listFunds(parseInt(providerId), opts);
  handleResult(result, (data) => {
    const total = data.data?.length || 0;
    const offset = opts.offset || 0;
    const items = (data.data || []).slice(offset, opts.limit ? offset + opts.limit : undefined);
    const response = wrapResponse(items, total, opts.limit, offset);
    if (globalJson || globalOutputFile) return response;
    console.log(chalk.bold(`\nFondos (${items.length})${opts.limit ? ` (of ${total})` : ''}\n`));
    const headers = ['ID', 'Nombre', 'RUN', 'Categoria'];
    const rows = items.map(item => [
      item.id.toString(),
      item.attributes.name,
      item.attributes.run,
      item.attributes.category
    ]);
    printTable(headers, rows);
    if (total > items.length) console.log(chalk.dim(`Hint: use --offset ${offset + items.length} to get more`));
    return response;
  });
}

async function series(conceptId, opts) {
  const result = await client.listSeries(parseInt(conceptId), opts);
  handleResult(result, (data) => {
    const total = data.data?.length || 0;
    const offset = opts.offset || 0;
    const items = (data.data || []).slice(offset, opts.limit ? offset + opts.limit : undefined);
    const response = wrapResponse(items, total, opts.limit, offset);
    if (globalJson || globalOutputFile) return response;
    console.log(chalk.bold(`\nSeries (${items.length})${opts.limit ? ` (of ${total})` : ''}\n`));
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
    if (total > items.length) console.log(chalk.dim(`Hint: use --offset ${offset + items.length} to get more`));
    return response;
  });
}

async function tac(assetId) {
  const result = await client.getExpenseRatio(parseInt(assetId));
  handleResult(result, (data) => {
    const attrs = data.data.attributes;
    const pct = (attrs.expense_ratio || 0) * 100;
    if (globalJson || globalOutputFile) return data;
    console.log(`TAC: ${chalk.yellow(pct.toFixed(2) + '%')} (${attrs.investor_class})`);
    return data;
  });
}

async function risk(assetId) {
  const result = await client.getRiskMetrics(parseInt(assetId));
  handleResult(result, (data) => {
    const attrs = data.data.attributes;
    if (globalJson || globalOutputFile) return data;
    console.log(`Serie: ${attrs.serie} - RUN: ${attrs.run}`);
    console.log(`Fecha: ${attrs.as_of_date}`);
    console.log(`Volatilidad 12m: ${(attrs.volatility_annualized_12m * 100).toFixed(2)}%`);
    console.log(`Volatilidad 36m: ${(attrs.volatility_annualized_36m * 100).toFixed(2)}%`);
    console.log(`Max Drawdown 36m: ${(attrs.max_drawdown_36m * 100).toFixed(2)}%`);
    console.log(`Nivel riesgo: ${attrs.risk_level} (score: ${attrs.risk_score})`);
    return data;
  });
}

async function ranking(opts) {
  const result = await client.ranking(opts.metric, opts.date, opts);
  handleResult(result, (data) => {
    const items = data.data || [];
    const meta = data.meta || {};
    if (globalJson || globalOutputFile) return data;
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
    return data;
  });
}

async function allFunds(opts) {
  const result = await client.listAllFunds({
    category: opts.category,
    date: opts.date
  });
  handleResult(result, (data) => {
    let items = data.data || [];

    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter(item => (item.fundName || '').toLowerCase().includes(q));
    }
    if (opts.agf) {
      const q = opts.agf.toLowerCase();
      items = items.filter(item => (item.agf || '').toLowerCase().includes(q));
    }
    if (opts.maxTac != null) {
      items = items.filter(item => item.tac != null && item.tac <= opts.maxTac);
    }
    if (opts.minPatrimony != null) {
      items = items.filter(item => (item.patrimony || 0) >= opts.minPatrimony);
    }

    const total = items.length;

    if (opts.sortBy) {
      const field = opts.sortBy;
      const dir = opts.order === 'desc' ? -1 : 1;
      items = [...items].sort((a, b) => {
        const va = a[field];
        const vb = b[field];
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'string') {
          return dir * va.localeCompare(vb);
        }
        return dir * ((va < vb) ? -1 : (va > vb) ? 1 : 0);
      });
    }

    const offset = opts.offset || 0;
    items = items.slice(offset, opts.limit ? offset + opts.limit : undefined);

    const response = wrapResponse(items, total, opts.limit, offset);
    if (globalJson || globalOutputFile) return response;
    const filterDesc = [];
    if (opts.search) filterDesc.push(`search:"${opts.search}"`);
    if (opts.agf) filterDesc.push(`agf:"${opts.agf}"`);
    if (opts.maxTac) filterDesc.push(`maxTac:${opts.maxTac}`);
    if (opts.minPatrimony) filterDesc.push(`minPatrimony:${opts.minPatrimony}`);
    if (opts.sortBy) filterDesc.push(`sort:${opts.sortBy}`);
    const filterStr = filterDesc.length ? ` [${filterDesc.join(', ')}]` : '';
    console.log(chalk.bold(`\nTodos los fondos${filterStr} (${items.length})${opts.limit ? ` (of ${total})` : ''}\n`));
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
    if (total > items.length) console.log(chalk.dim(`Hint: use --offset ${offset + items.length} to get more`));
    return response;
  });
}

async function days(assetId, opts) {
  const result = await client.getDays(parseInt(assetId), opts.fromDate, opts);
  handleResult(result, (data) => {
    const meta = data.meta || {};
    const allItems = (data.data || []).reverse();
    const offset = opts.offset || 0;
    const sliced = allItems.slice(offset, opts.limit ? offset + opts.limit : undefined);
    const total = allItems.length;
    const response = wrapResponse(sliced, total, opts.limit, offset);
    if (globalJson || globalOutputFile) return response;
    console.log(chalk.bold(`\nSerie historica - Asset ${meta.asset_id || assetId} (${sliced.length})${opts.limit ? ` (of ${total})` : ''}\n`));
    const headers = ['Fecha', 'Valor Cuota'];
    const rows = sliced.map(item => {
      const attrs = item.attributes || item;
      return [attrs.date || '', (attrs.price || 0).toFixed(4)];
    });
    printTable(headers, rows);
    if (total > sliced.length) console.log(chalk.dim(`Hint: use --offset ${offset + sliced.length} to get more`));
    return response;
  });
}

async function returns(assetId, opts) {
  // 1500 trading days ≈ 6 calendar years, comfortable headroom for 3Y lookback.
  const result = await client.getDays(parseInt(assetId), opts.fromDate, { limit: 1500 });
  handleResult(result, (data) => {
    const items = data.data || [];
    const prices = items
      .map(item => ({ date: item.attributes.date, price: item.attributes.price }))
      .filter(p => p.date && p.price > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (prices.length === 0) {
      const empty = { currentPrice: null, currentDate: null, periods: [] };
      if (globalJson || globalOutputFile) return empty;
      console.log(chalk.yellow('Sin precios disponibles.'));
      return empty;
    }

    const now = prices[prices.length - 1];
    const earliest = prices[0].date;

    function subtractCalendarDays(isoDate, days) {
      const d = new Date(isoDate + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - days);
      return d.toISOString().slice(0, 10);
    }

    function priceOnOrBefore(targetISO) {
      // The `days` endpoint returns trading days only, so the exact targetISO may
      // not exist (weekends/holidays). Take the most recent price on or before.
      let result = null;
      for (const p of prices) {
        if (p.date <= targetISO) result = p;
        else break;
      }
      return result;
    }

    function yearsBetween(startISO, endISO) {
      const ms = new Date(endISO + 'T00:00:00Z') - new Date(startISO + 'T00:00:00Z');
      return ms / (365.25 * 24 * 3600 * 1000);
    }

    const periods = [
      { name: '1Y', calendarDays: 365 },
      { name: '3Y', calendarDays: 365 * 3 }
    ];

    const computed = [];
    for (const p of periods) {
      const targetISO = subtractCalendarDays(now.date, p.calendarDays);
      // Require history to extend back to (or before) the target calendar date.
      if (earliest > targetISO) continue;
      const start = priceOnOrBefore(targetISO);
      if (!start || !start.price) continue;
      const years = yearsBetween(start.date, now.date);
      if (years <= 0) continue;
      const totalReturn = ((now.price / start.price) - 1) * 100;
      const annualizedReturn = (Math.pow(now.price / start.price, 1 / years) - 1) * 100;
      computed.push({ name: p.name, annualizedReturn, totalReturn });
    }

    if (globalJson || globalOutputFile) {
      return { currentPrice: now.price, currentDate: now.date, periods: computed };
    }

    console.log(chalk.bold(`\nRentabilidades anualizadas - Asset ${assetId}\n`));
    console.log(`Valor cuota actual (${now.date}): ${now.price.toFixed(4)}\n`);
    if (computed.length === 0) {
      console.log(chalk.yellow('Sin historial suficiente para 1Y/3Y.'));
    } else {
      const headers = ['Periodo', 'Rentabilidad Anualizada %', 'Variacion Total %'];
      const rows = computed.map(p => [p.name, p.annualizedReturn.toFixed(2) + '%', p.totalReturn.toFixed(2) + '%']);
      printTable(headers, rows);
    }
    return { currentPrice: now.price, currentDate: now.date, periods: computed };
  });
}

async function tacHistory(assetId, opts) {
  const result = await client.getExpenseRatioHistory(parseInt(assetId), opts);
  handleResult(result, (data) => {
    const items = data.data || [];
    const total = items.length;
    const offset = opts.offset || 0;
    const sliced = items.slice(offset, opts.limit ? offset + opts.limit : undefined);
    const response = wrapResponse(sliced, total, opts.limit, offset);
    if (globalJson || globalOutputFile) return response;
    console.log(chalk.bold(`\nHistorial TAC - Asset ${assetId} (${sliced.length})${opts.limit ? ` (of ${total})` : ''}\n`));
    const headers = ['Fecha', 'TAC%'];
    const rows = sliced.map(item => {
      const attrs = item.attributes || item;
      return [attrs.date || '', ((attrs.expense_ratio || 0) * 100).toFixed(4) + '%'];
    });
    printTable(headers, rows.reverse());
    if (total > sliced.length) console.log(chalk.dim(`Hint: use --offset ${offset + sliced.length} to get more`));
    return response;
  });
}

async function cartera(run, month) {
  const result = await client.carteraResumen(run, month);
  handleResult(result, (data) => {
    const items = data.data || [];
    const meta = data.meta || {};
    if (globalJson || globalOutputFile) return data;
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
    return data;
  });
}

async function evolution(administrators, metric, fromMonth, toMonth) {
  const result = await client.evolution(administrators, metric, fromMonth, toMonth);
  handleResult(result, (data) => {
    const items = data.data || [];
    const meta = data.meta || {};
    if (globalJson || globalOutputFile) return data;
    console.log(chalk.bold(`\nEvolucion AGF - ${meta.metric}\n`));
    console.log('Administradoras:', meta.administrators.join(', '), '\n');
    const headers = ['Mes', ...meta.administrators.map(a => a.substring(0, 30))];
    const rows = items.map(item => {
      const row = [item.month];
      for (const admin of meta.administrators) {
        const val = item[admin];
        row.push(val != null ? val.toLocaleString() : '-');
      }
      return row;
    });
    printTable(headers, rows);
    return data;
  });
}

async function holdings(run, opts) {
  const result = await client.carteraHoldings(run, opts.month, opts.market, opts);
  handleResult(result, (data) => {
    const total = data.data?.length || 0;
    const offset = opts.offset || 0;
    const items = (data.data || []).slice(offset, opts.limit ? offset + opts.limit : undefined);
    const meta = data.meta || {};
    const response = wrapResponse(items, total, opts.limit, offset);
    response.meta.run = meta.run;
    response.meta.month = meta.month;
    if (globalJson || globalOutputFile) return response;
    console.log(chalk.bold(`\nHoldings - RUN ${meta.run} (${meta.month})${opts.limit ? ` (${items.length} of ${total})` : ''}\n`));
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
    if (total > items.length) console.log(chalk.dim(`Hint: use --offset ${offset + items.length} to get more`));
    return response;
  });
}

const SCHEMAS = {
  health: { fields: { status: 'string', last_scraped_date: 'string', total_records: 'number' } },
  providers: { fields: { id: 'number', name: 'string' } },
  funds: { fields: { id: 'number', name: 'string', run: 'string', category: 'string' } },
  series: { fields: { id: 'number', name: 'string', serie: 'string', investor_class: 'string', net_asset_value: 'number', total_net_assets: 'number' } },
  'all-funds': {
    fields: {
      run: 'string', fundName: 'string', agf: 'string', category: 'string',
      tac: 'number', dailyChange: 'number', monthlyChange: 'number', patrimony: 'number',
      fundId: 'string', serie: 'string', serieId: 'string', currency: 'string',
      investorClass: 'string', shareholders: 'number',
      volatility_monthly_12m: 'number', volatility_monthly_36m: 'number',
      volatility_annualized_12m: 'number', volatility_annualized_36m: 'number',
      max_drawdown_36m: 'number', risk_level: 'string', risk_score: 'number',
      risk_as_of_date: 'string', risk_method_version: 'string'
    }
  },
  tac: { fields: { expense_ratio: 'number', investor_class: 'string' } },
  risk: { fields: { serie: 'string', run: 'string', as_of_date: 'string', volatility_annualized_12m: 'number', volatility_annualized_36m: 'number', max_drawdown_36m: 'number', risk_level: 'string', risk_score: 'number' } },
  ranking: { fields: { rank: 'number', administrator: 'string', total_patrimony: 'number', total_shareholders: 'number', fund_count: 'number' } },
  days: { fields: { date: 'string', price: 'number' } },
  cartera: { fields: { tipo_instrumento: 'string', num_holdings: 'number', valorizacion_nacional: 'number', valorizacion_extranjera: 'number', pct_activo_fondo: 'number' } },
  holdings: { fields: { emisor: 'string', nemotecnico: 'string', pais: 'string', tipo_instrumento: 'string', valorizacion: 'number', pct_activo_fondo: 'number' } }
};

async function describe(schemaName) {
  const schema = SCHEMAS[schemaName];
  if (!schema) {
    console.error(chalk.red(`Schema '${schemaName}' not found. Available: ${Object.keys(SCHEMAS).join(', ')}`));
    process.exit(1);
  }
  const result = { schema: schemaName, fields: schema.fields };
  if (globalJson || globalOutputFile) {
    output(result);
  } else {
    console.log(chalk.bold(`\nSchema: ${schemaName}\n`));
    const headers = ['Field', 'Type'];
    const rows = Object.entries(schema.fields).map(([k, v]) => [k, v]);
    printTable(headers, rows);
  }
  return null;
}

const program = new Command();

program
  .name('buscafondos')
  .description('CLI para fondos mutuos chilenos via API de BuscaFondos')
  .version('1.1.2')
  .addOption(new Option('-j, --json').hideHelp())
  .addOption(new Option('-o, --output <file>').hideHelp())
  .hook('preAction', (thisCommand) => {
    globalJson = thisCommand.opts().json || false;
    globalOutputFile = thisCommand.opts().output || null;
  });

program.command('health').description('Ver estado del servicio').action(health);

program.command('providers')
  .description('Listar todas las administradoras (AGF)')
  .option('-l, --limit <n>', 'Limitar numero de resultados', parseInt)
  .option('-o, --offset <n>', 'Desplazamiento (para paginar)', parseInt)
  .option('-s, --search <text>', 'Buscar por nombre')
  .action((opts) => providers(opts));

program.command('funds')
  .description('Listar fondos de una administradora')
  .argument('<provider_id>', 'ID de la AGF')
  .option('-l, --limit <n>', 'Limitar numero de resultados', parseInt)
  .option('-o, --offset <n>', 'Desplazamiento (para paginar)', parseInt)
  .action((providerId, opts) => funds(providerId, opts));

program.command('series')
  .description('Listar series de un fondo')
  .argument('<concept_id>', 'ID del concepto')
  .option('-l, --limit <n>', 'Limitar numero de resultados', parseInt)
  .option('-o, --offset <n>', 'Desplazamiento (para paginar)', parseInt)
  .action((conceptId, opts) => series(conceptId, opts));

program.command('tac').description('Ver TAC de una serie').argument('<asset_id>', 'ID de la serie').action(tac);

program.command('risk').description('Ver metricas de riesgo de una serie').argument('<asset_id>', 'ID de la serie').action(risk);

program.command('ranking')
  .description('Ranking de AGF por patrimonio o participantes')
  .option('-m, --metric <metric>', 'Metrica (patrimony|shareholders)', 'patrimony')
  .option('-d, --date <date>', 'Fecha (YYYY-MM-DD)')
  .option('-l, --limit <n>', 'Limitar numero de resultados', parseInt)
  .option('-o, --offset <n>', 'Desplazamiento (para paginar)', parseInt)
  .action((opts) => ranking(opts));

program.command('all-funds')
  .description('Listar todos los fondos del mercado con filtros avanzados')
  .option('-c, --category <category>', 'Categoria del fondo')
  .option('-d, --date <date>', 'Fecha (YYYY-MM-DD)')
  .option('-l, --limit <n>', 'Limitar numero de resultados', parseInt)
  .option('-o, --offset <n>', 'Desplazamiento (para paginar)', parseInt)
  .option('-s, --search <text>', 'Buscar por nombre de fondo')
  .option('--agf <name>', 'Filtrar por nombre de AGF')
  .option('--max-tac <number>', 'TAC maximo (ej: 0.02)')
  .option('--min-patrimony <number>', 'Patrimonio minimo (en miles)')
  .option('--sort-by <field>', 'Campo para ordenar (tac|patrimony|fundName|agf)')
  .option('--order <direction>', 'Orden (asc|desc)', 'asc')
  .action((opts) => allFunds(opts));

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
  .option('-l, --limit <n>', 'Limitar numero de resultados', parseInt)
  .option('-o, --offset <n>', 'Desplazamiento (para paginar)', parseInt)
  .action((run, opts) => holdings(run, opts));

program.command('days')
  .description('Serie historica de valores cuota')
  .argument('<asset_id>', 'ID de la serie')
  .option('-f, --from-date <date>', 'Fecha inicio (YYYY-MM-DD)')
  .option('-l, --limit <n>', 'Limitar numero de resultados', parseInt)
  .option('-o, --offset <n>', 'Desplazamiento (para paginar)', parseInt)
  .action((assetId, opts) => days(assetId, opts));

program.command('returns')
  .description('Rentabilidad anualizada a 1Y, 3Y')
  .argument('<asset_id>', 'ID de la serie')
  .option('-f, --from-date <date>', 'Fecha inicio (YYYY-MM-DD)')
  .action((assetId, opts) => returns(assetId, opts));

program.command('tac-history')
  .description('Historial de TAC de una serie')
  .argument('<asset_id>', 'ID de la serie')
  .option('-l, --limit <n>', 'Limitar numero de resultados', parseInt)
  .option('-o, --offset <n>', 'Desplazamiento (para paginar)', parseInt)
  .action((assetId, opts) => tacHistory(assetId, opts));

program.command('evolution')
  .description('Evolucion mensual de administradoras (patrimonio o participantes)')
  .requiredOption(
    '-a, --admin <name>',
    'Nombre de administradora (repetir -a para varias)',
    (val, prev) => (Array.isArray(prev) ? [...prev, val] : [val])
  )
  .option('-m, --metric <metric>', 'Metrica: patrimony | shareholders', 'patrimony')
  .option('-f, --from <month>', 'Mes inicio (YYYY-MM)')
  .option('-t, --to <month>', 'Mes fin (YYYY-MM)')
  .action((opts) => evolution(
    opts.admin,
    opts.metric,
    opts.from,
    opts.to
  ));

program.command('describe')
  .description('Ver esquema de campos disponibles para un tipo de consulta')
  .argument('<schema>', `Schema a describir. Opciones: ${Object.keys(SCHEMAS).join(', ')}`)
  .action((schema) => describe(schema));

program.parse();