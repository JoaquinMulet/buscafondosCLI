// Fixtures derived from the BuscaFondos OpenAPI spec `examples`.
// Keep these in sync with the upstream spec — they are the contract.

export const health = {
  status: 'ok',
  last_scraped_date: '2025-03-07',
  total_records: 1523750,
};

export const providers = {
  data: [
    {
      id: '123456789',
      type: 'asset_provider',
      attributes: { name: 'BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A.' },
    },
    {
      id: '111111111',
      type: 'asset_provider',
      attributes: { name: 'SCOTIABANK CHILE S.A.' },
    },
    {
      id: '222222222',
      type: 'asset_provider',
      attributes: { name: 'FINTUAL ADMINISTRADORA DE FONDOS S.A.' },
    },
  ],
};

export const funds = {
  data: [
    {
      id: '987654321',
      type: 'conceptual_asset',
      attributes: {
        name: 'Fondo Mutuo Banchile Horizonte',
        symbol: '8011-K',
        run: '8011-K',
        category: 'equity',
        currency: 'CLP',
      },
    },
  ],
};

export const series = {
  data: [
    {
      id: '111222333',
      type: 'real_asset',
      attributes: {
        name: '8011-K Serie A',
        serie: 'A',
        run: '8011-K',
        currency: 'CLP',
        investor_class: 'Retail',
        last_day: {
          net_asset_value: 15234.5678,
          total_net_assets: 98765432100,
          shareholders: 12345,
          date: '2025-03-07',
        },
      },
    },
  ],
};

// Generate ~1100 daily prices so `returns` can compute both 1Y and 3Y windows.
function generateDays(count = 1100) {
  const data = [];
  const start = new Date('2022-01-01T00:00:00Z');
  let price = 10000;
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    price *= 1 + 0.0003; // ~12%/yr compound, deterministic
    data.push({
      id: `111222333_${date}`,
      type: 'real_asset_day',
      attributes: { date, price: Math.round(price * 10000) / 10000 },
    });
  }
  return { data };
}

export const days = generateDays();

// Small fixed days fixture for tests that don't need a long history.
export const daysSmall = {
  data: [
    {
      id: '111222333_2025-03-07',
      type: 'real_asset_day',
      attributes: { date: '2025-03-07', price: 15234.5678 },
    },
    {
      id: '111222333_2025-03-06',
      type: 'real_asset_day',
      attributes: { date: '2025-03-06', price: 15200.1234 },
    },
  ],
};

export const expenseRatio = {
  data: {
    id: '111222333',
    type: 'expense_ratio',
    attributes: { expense_ratio: 0.0132, investor_class: 'Retail' },
  },
};

export const riskMetrics = {
  data: {
    id: '71452046',
    type: 'risk_metrics',
    attributes: {
      run: '10058-7',
      serie: 'A',
      as_of_date: '2026-03-31',
      volatility_monthly_12m: 0.0124,
      volatility_monthly_36m: 0.0151,
      volatility_annualized_12m: 0.043,
      volatility_annualized_36m: 0.0523,
      max_drawdown_36m: -0.183,
      risk_level: 'high',
      risk_score: 74,
      method_version: 'risk_v1',
    },
  },
};

export const expenseRatioHistory = {
  data: [
    {
      id: '111222333_20250228',
      type: 'expense_ratio_month',
      attributes: { date: '20250228', expense_ratio: 0.0132 },
    },
    {
      id: '111222333_20250131',
      type: 'expense_ratio_month',
      attributes: { date: '20250131', expense_ratio: 0.013 },
    },
  ],
};

export const ranking = {
  data: [
    {
      id: '123456789',
      type: 'agf_ranking',
      attributes: {
        administrator: 'BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A.',
        total_patrimony: 12345678900000,
        total_shareholders: 543210,
        fund_count: 45,
        rank: 1,
      },
    },
    {
      id: '111111111',
      type: 'agf_ranking',
      attributes: {
        administrator: 'SCOTIABANK CHILE S.A.',
        total_patrimony: 9876543210000,
        total_shareholders: 432100,
        fund_count: 32,
        rank: 2,
      },
    },
  ],
  meta: { date: '2025-03-07', metric: 'patrimony' },
};

export const evolution = {
  data: [
    {
      month: '2025-01',
      'BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A.': 12345678900000,
      'SCOTIABANK CHILE S.A.': 9876543210000,
    },
    {
      month: '2025-02',
      'BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A.': 12500000000000,
      'SCOTIABANK CHILE S.A.': 9900000000000,
    },
  ],
  meta: {
    metric: 'patrimony',
    administrators: [
      'BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A.',
      'SCOTIABANK CHILE S.A.',
    ],
  },
};

export const allFunds = {
  data: [
    {
      agf: 'BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A.',
      fundName: 'FM BCH AGRESIVO',
      fundId: '926287998',
      run: '10058-7',
      category: 'equity',
      serie: 'A',
      serieId: '71452046',
      currency: 'PESOS',
      tac: 0.0119,
      investorClass: 'Retail',
      dailyChange: -0.23,
      monthlyChange: 1.45,
      patrimony: 28461.17,
      shareholders: 1320,
      volatility_monthly_12m: 0.0124,
      volatility_monthly_36m: 0.0151,
      volatility_annualized_12m: 0.043,
      volatility_annualized_36m: 0.0523,
      max_drawdown_36m: -0.183,
      risk_level: 'high',
      risk_score: 74,
      risk_as_of_date: '2026-03-31',
      risk_method_version: 'risk_v1',
    },
    {
      agf: 'FINTUAL ADMINISTRADORA DE FONDOS S.A.',
      fundName: 'FM FINTUAL CONSERVADOR',
      fundId: '111222333',
      run: '9999-1',
      category: 'money_market',
      serie: 'APV',
      serieId: '11111',
      currency: 'PESOS',
      tac: 0.005,
      investorClass: 'APV',
      dailyChange: 0.01,
      monthlyChange: 0.4,
      patrimony: 95000.0,
      shareholders: 8400,
      volatility_monthly_12m: 0.001,
      volatility_monthly_36m: 0.0012,
      volatility_annualized_12m: 0.003,
      volatility_annualized_36m: 0.004,
      max_drawdown_36m: -0.005,
      risk_level: 'low',
      risk_score: 12,
      risk_as_of_date: '2026-03-31',
      risk_method_version: 'risk_v1',
    },
    {
      agf: 'SCOTIABANK CHILE S.A.',
      fundName: 'FM SCOTIA EQUILIBRADO',
      fundId: '444555666',
      run: '5555-5',
      category: 'balanced',
      serie: 'B',
      serieId: '22222',
      currency: 'PESOS',
      tac: 0.025,
      investorClass: 'Retail',
      dailyChange: 0.12,
      monthlyChange: 0.85,
      patrimony: 50000.0,
      shareholders: 3200,
      volatility_monthly_12m: 0.008,
      volatility_monthly_36m: 0.009,
      volatility_annualized_12m: 0.027,
      volatility_annualized_36m: 0.031,
      max_drawdown_36m: -0.05,
      risk_level: 'medium',
      risk_score: 40,
      risk_as_of_date: '2026-03-31',
      risk_method_version: 'risk_v1',
    },
  ],
};

export const carteraResumen = {
  data: [
    {
      type: 'cartera_resumen',
      attributes: {
        tipo_instrumento: 'ETFA',
        num_holdings: 10,
        valorizacion_nacional: 0,
        valorizacion_extranjera: 154271000,
        pct_activo_fondo: 99.5,
      },
    },
  ],
  meta: { run: '9570', month: '2025-02' },
};

export const carteraHoldings = {
  data: [
    {
      type: 'holding',
      attributes: {
        market: 'extranjera',
        nemotecnico: 'ESGV US',
        emisor: 'Vanguard',
        pais: 'US',
        tipo_instrumento: 'ETFA',
        valorizacion: 119685734,
        pct_activo_fondo: 29.824,
      },
    },
    {
      type: 'holding',
      attributes: {
        market: 'extranjera',
        nemotecnico: 'VWO US',
        emisor: 'Vanguard',
        pais: 'US',
        tipo_instrumento: 'ETFA',
        valorizacion: 34585266,
        pct_activo_fondo: 8.62,
      },
    },
  ],
  meta: { run: '9570', month: '2025-02' },
};
