// Lightweight mock server for the BuscaFondos API.
// Listens on 127.0.0.1:0 (random free port). Use `server.url` as BUSCAFONDOS_API_URL.
//
// Defaults respond with the spec-derived fixtures. Tests can:
//   - Inject per-path overrides via `server.overrides.set(path, { status, body })`.
//   - Inspect captured requests via `server.requests` (cleared with `server.clearRequests()`).

import { createServer } from 'node:http';
import * as fx from './fixtures.js';

const routes = [
  { pattern: /^\/health$/, body: () => fx.health },
  { pattern: /^\/api\/asset_providers$/, body: () => fx.providers },
  { pattern: /^\/api\/asset_providers\/(\d+)\/conceptual_assets$/, body: () => fx.funds },
  { pattern: /^\/api\/conceptual_assets\/(\d+)\/real_assets$/, body: () => fx.series },
  { pattern: /^\/api\/real_assets\/(\d+)\/days$/, body: () => fx.days },
  { pattern: /^\/api\/real_assets\/(\d+)\/expense_ratio$/, body: () => fx.expenseRatio },
  { pattern: /^\/api\/real_assets\/(\d+)\/risk_metrics$/, body: () => fx.riskMetrics },
  { pattern: /^\/api\/real_assets\/(\d+)\/expense_ratio\/history$/, body: () => fx.expenseRatioHistory },
  { pattern: /^\/api\/agf_stats\/ranking$/, body: () => fx.ranking },
  { pattern: /^\/api\/agf_stats\/evolution$/, body: () => fx.evolution },
  { pattern: /^\/api\/all-funds$/, body: () => fx.allFunds },
  { pattern: /^\/api\/funds\/([^/]+)\/cartera\/resumen$/, body: () => fx.carteraResumen },
  { pattern: /^\/api\/funds\/([^/]+)\/cartera\/holdings$/, body: () => fx.carteraHoldings },
];

export async function startMockServer() {
  const overrides = new Map();
  const requests = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    // Normalize axios-style array keys (`key[]`) to the bare key.
    // FastAPI / most Python backends accept both forms; we treat them as equivalent.
    const norm = (k) => (k.endsWith('[]') ? k.slice(0, -2) : k);
    const queryAll = {};
    for (const [rawKey, value] of url.searchParams.entries()) {
      const key = norm(rawKey);
      (queryAll[key] ??= []).push(value);
    }
    const query = {};
    for (const [k, vs] of Object.entries(queryAll)) {
      query[k] = vs[vs.length - 1]; // last-write-wins for scalar access
    }
    requests.push({ method: req.method, path, query, queryAll });

    // Override takes precedence.
    if (overrides.has(path)) {
      const ovr = overrides.get(path);
      const status = ovr.status ?? 200;
      const body = ovr.body;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(body === undefined ? '' : JSON.stringify(body));
      return;
    }

    for (const route of routes) {
      if (route.pattern.test(path)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(route.body()));
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ detail: 'Not Found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    overrides,
    requests,
    clearRequests() {
      requests.length = 0;
    },
    close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
