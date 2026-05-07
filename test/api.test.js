// Unit tests for BuscaFondosClient.
// All requests are routed at a local mock server — these tests never hit the real API.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import BuscaFondosClient from '../src/api.js';
import { startMockServer } from './helpers/mock-server.js';

describe('BuscaFondosClient', () => {
  let server;
  let client;

  before(async () => {
    server = await startMockServer();
    client = new BuscaFondosClient(server.url);
  });

  after(async () => {
    await server.close();
  });

  describe('happy path', () => {
    test('health() returns ok', async () => {
      server.clearRequests();
      const result = await client.health();
      assert.equal(result.success, true);
      assert.equal(result.data.status, 'ok');
      assert.equal(result.data.last_scraped_date, '2025-03-07');
      assert.equal(server.requests.at(-1).path, '/health');
    });

    test('listProviders() forwards limit/offset/search', async () => {
      server.clearRequests();
      const result = await client.listProviders({ limit: 10, offset: 5, search: 'Banchile' });
      assert.equal(result.success, true);
      const req = server.requests.at(-1);
      assert.equal(req.path, '/api/asset_providers');
      assert.equal(req.query.limit, '10');
      assert.equal(req.query.offset, '5');
      assert.equal(req.query.search, 'Banchile');
    });

    test('listProviders() omits null params', async () => {
      server.clearRequests();
      await client.listProviders();
      const req = server.requests.at(-1);
      assert.deepEqual(req.query, {});
    });

    test('listFunds() builds path with provider id', async () => {
      server.clearRequests();
      await client.listFunds(123, { limit: 5 });
      const req = server.requests.at(-1);
      assert.equal(req.path, '/api/asset_providers/123/conceptual_assets');
      assert.equal(req.query.limit, '5');
    });

    test('listSeries() builds path with concept id', async () => {
      server.clearRequests();
      await client.listSeries(456);
      const req = server.requests.at(-1);
      assert.equal(req.path, '/api/conceptual_assets/456/real_assets');
    });

    test('getDays() forwards from_date and pagination', async () => {
      server.clearRequests();
      await client.getDays(789, '2024-01-01', { limit: 100, offset: 0 });
      const req = server.requests.at(-1);
      assert.equal(req.path, '/api/real_assets/789/days');
      assert.equal(req.query.from_date, '2024-01-01');
      assert.equal(req.query.limit, '100');
      assert.equal(req.query.offset, '0');
    });

    test('getExpenseRatio() returns nested attributes', async () => {
      const result = await client.getExpenseRatio(789);
      assert.equal(result.success, true);
      assert.equal(result.data.data.attributes.expense_ratio, 0.0132);
      assert.equal(result.data.data.attributes.investor_class, 'Retail');
    });

    test('getRiskMetrics() returns risk snapshot', async () => {
      const result = await client.getRiskMetrics(789);
      assert.equal(result.success, true);
      const attrs = result.data.data.attributes;
      assert.equal(attrs.risk_level, 'high');
      assert.equal(attrs.risk_score, 74);
      assert.equal(attrs.max_drawdown_36m, -0.183);
    });

    test('getExpenseRatioHistory() returns monthly series', async () => {
      const result = await client.getExpenseRatioHistory(789);
      assert.equal(result.success, true);
      assert.equal(result.data.data.length, 2);
    });

    test('ranking() defaults metric to patrimony', async () => {
      server.clearRequests();
      await client.ranking();
      const req = server.requests.at(-1);
      assert.equal(req.path, '/api/agf_stats/ranking');
      assert.equal(req.query.metric, 'patrimony');
    });

    test('ranking() forwards explicit metric and date', async () => {
      server.clearRequests();
      await client.ranking('shareholders', '2025-03-07', { limit: 10 });
      const req = server.requests.at(-1);
      assert.equal(req.query.metric, 'shareholders');
      assert.equal(req.query.date, '2025-03-07');
      assert.equal(req.query.limit, '10');
    });

    test('evolution() repeats administrator query param', async () => {
      server.clearRequests();
      const admins = ['BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A.', 'SCOTIABANK CHILE S.A.'];
      await client.evolution(admins, 'patrimony', '2025-01', '2025-12');
      const req = server.requests.at(-1);
      assert.equal(req.path, '/api/agf_stats/evolution');
      assert.deepEqual(req.queryAll.administrator, admins);
      assert.equal(req.query.metric, 'patrimony');
      assert.equal(req.query.from_month, '2025-01');
      assert.equal(req.query.to_month, '2025-12');
    });

    test('listAllFunds() forwards every advanced filter', async () => {
      server.clearRequests();
      await client.listAllFunds({
        category: 'equity',
        date: '2025-03-07',
        limit: 50,
        offset: 0,
        search: 'horizonte',
        maxTac: 0.02,
        minPatrimony: 1000,
        agf: 'Banchile',
        sortBy: 'tac',
        order: 'asc',
      });
      const req = server.requests.at(-1);
      assert.equal(req.path, '/api/all-funds');
      assert.equal(req.query.category, 'equity');
      assert.equal(req.query.date, '2025-03-07');
      assert.equal(req.query.limit, '50');
      assert.equal(req.query.search, 'horizonte');
      assert.equal(req.query.max_tac, '0.02');
      assert.equal(req.query.min_patrimony, '1000');
      assert.equal(req.query.agf, 'Banchile');
      assert.equal(req.query.sort_by, 'tac');
      assert.equal(req.query.order, 'asc');
    });

    test('listAllFunds() with no options sends an empty query', async () => {
      server.clearRequests();
      await client.listAllFunds();
      const req = server.requests.at(-1);
      assert.deepEqual(req.query, {});
    });

    test('carteraResumen() forwards month when given', async () => {
      server.clearRequests();
      await client.carteraResumen('9570', '2025-02');
      const req = server.requests.at(-1);
      assert.equal(req.path, '/api/funds/9570/cartera/resumen');
      assert.equal(req.query.month, '2025-02');
    });

    test('carteraResumen() omits month when null', async () => {
      server.clearRequests();
      await client.carteraResumen('9570');
      const req = server.requests.at(-1);
      assert.deepEqual(req.query, {});
    });

    test('carteraHoldings() defaults market to "all"', async () => {
      server.clearRequests();
      await client.carteraHoldings('9570');
      const req = server.requests.at(-1);
      assert.equal(req.path, '/api/funds/9570/cartera/holdings');
      assert.equal(req.query.market, 'all');
    });

    test('carteraHoldings() forwards market/month/limit', async () => {
      server.clearRequests();
      await client.carteraHoldings('9570', '2025-02', 'E', { limit: 20, offset: 10 });
      const req = server.requests.at(-1);
      assert.equal(req.query.market, 'E');
      assert.equal(req.query.month, '2025-02');
      assert.equal(req.query.limit, '20');
      assert.equal(req.query.offset, '10');
    });
  });

  describe('error handling', () => {
    test('404 response → { type: "http", status: 404 }', async () => {
      server.overrides.set('/api/asset_providers/999/conceptual_assets', { status: 404, body: { detail: 'Not found' } });
      try {
        const result = await client.listFunds(999);
        assert.equal(result.success, false);
        assert.equal(result.error.type, 'http');
        assert.equal(result.error.status, 404);
        assert.match(result.error.message, /not found/i);
      } finally {
        server.overrides.delete('/api/asset_providers/999/conceptual_assets');
      }
    });

    test('500 response → { type: "http", status: 500 }', async () => {
      server.overrides.set('/health', { status: 500, body: { detail: 'boom' } });
      try {
        const result = await client.health();
        assert.equal(result.success, false);
        assert.equal(result.error.type, 'http');
        assert.equal(result.error.status, 500);
        assert.match(result.error.message, /server error/i);
      } finally {
        server.overrides.delete('/health');
      }
    });

    test('502 response → { type: "http", status: 502 }', async () => {
      server.overrides.set('/health', { status: 502, body: {} });
      try {
        const result = await client.health();
        assert.equal(result.success, false);
        assert.equal(result.error.type, 'http');
        assert.equal(result.error.status, 502);
        assert.match(result.error.message, /gateway/i);
      } finally {
        server.overrides.delete('/health');
      }
    });

    test('503 response → { type: "http", status: 503 }', async () => {
      server.overrides.set('/health', { status: 503, body: {} });
      try {
        const result = await client.health();
        assert.equal(result.success, false);
        assert.equal(result.error.status, 503);
        assert.match(result.error.message, /unavailable/i);
      } finally {
        server.overrides.delete('/health');
      }
    });

    test('connection refused → error result (not thrown)', async () => {
      // Loopback on a port nobody is listening on.
      const offline = new BuscaFondosClient('http://127.0.0.1:1');
      const result = await offline.health();
      assert.equal(result.success, false);
      // Will be 'unknown' (ECONNREFUSED) or 'network' — both acceptable; what matters
      // is that the client never throws.
      assert.ok(['unknown', 'network'].includes(result.error.type));
      assert.ok(typeof result.error.message === 'string');
    });

    test('always returns an envelope (never throws)', async () => {
      // Whatever the upstream does, the contract is { success, data?|error }.
      const offline = new BuscaFondosClient('http://127.0.0.1:1');
      const r1 = await offline.listProviders();
      const r2 = await offline.listAllFunds({ category: 'equity' });
      for (const r of [r1, r2]) {
        assert.equal(r.success, false);
        assert.ok(r.error && typeof r.error.type === 'string');
      }
    });
  });

  describe('default base url', () => {
    test('uses BUSCAFONDOS_API_URL env or production default', async () => {
      // Just verify the constructor honors the override; real env-var resolution
      // is tested implicitly by the CLI tests (which set the env var).
      const c = new BuscaFondosClient('http://example.test');
      assert.equal(c.baseUrl, 'http://example.test');
    });
  });
});
