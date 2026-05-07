// Integration tests for the CLI.
// Spawns `node src/cli.js <cmd>` as a subprocess and asserts on stdout/stderr/exit code.
// All requests go to a local mock server set via BUSCAFONDOS_API_URL — no network.
//
// IMPORTANT: we use execFile (async) instead of spawnSync because the mock server
// runs on the same event loop as the test harness. spawnSync would block that loop,
// preventing the server from answering the subprocess's request → 30s axios timeout.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { startMockServer } from './helpers/mock-server.js';

const execFile = promisify(_execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'src', 'cli.js');

describe('CLI', () => {
  let server;
  let env;

  before(async () => {
    server = await startMockServer();
    env = {
      ...process.env,
      BUSCAFONDOS_API_URL: server.url,
      // Strip ANSI color so regex assertions don't have to fight with chalk.
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    };
  });

  after(async () => {
    await server.close();
  });

  // execFile rejects on non-zero exit, but we want a uniform { stdout, stderr, status }
  // result for both success and expected-error cases.
  async function run(args, opts = {}) {
    try {
      const r = await execFile('node', [CLI, ...args], {
        encoding: 'utf8',
        env: opts.env ?? env,
        cwd: opts.cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout: r.stdout, stderr: r.stderr, status: 0 };
    } catch (err) {
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? '',
        status: typeof err.code === 'number' ? err.code : 1,
      };
    }
  }

  function tmpFile(name = 'out.json') {
    const d = mkdtempSync(join(tmpdir(), 'bf-test-'));
    return {
      path: join(d, name),
      cleanup: () => rmSync(d, { recursive: true, force: true }),
    };
  }

  describe('health', () => {
    test('default output prints status', async () => {
      const r = await run(['health']);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /Status:.*ok/);
      assert.match(r.stdout, /Last scraped:.*2025-03-07/);
      assert.match(r.stdout, /Total records/);
    });

    test('--json outputs valid JSON', async () => {
      const r = await run(['--json', 'health']);
      assert.equal(r.status, 0);
      const data = JSON.parse(r.stdout);
      assert.equal(data.status, 'ok');
      assert.equal(data.last_scraped_date, '2025-03-07');
      assert.equal(data.total_records, 1523750);
    });
  });

  describe('providers', () => {
    test('default output renders a table', async () => {
      const r = await run(['providers']);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /Administradoras/);
      assert.match(r.stdout, /BANCHILE/);
      assert.match(r.stdout, /SCOTIABANK/);
      assert.match(r.stdout, /FINTUAL/);
    });

    test('--json wraps response in meta + data envelope', async () => {
      const r = await run(['--json', 'providers']);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.ok(out.meta, 'has meta');
      assert.equal(out.meta.total_records, 3);
      assert.equal(out.meta.returned_records, 3);
      assert.equal(out.meta.has_more, false);
      assert.ok(Array.isArray(out.data));
    });

    test('--search filters client-side by name', async () => {
      const r = await run(['--json', 'providers', '--search', 'Fintual']);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.data.length, 1);
      assert.match(out.data[0].attributes.name, /FINTUAL/);
    });

    test('--limit + --offset paginate client-side and set has_more', async () => {
      const r = await run(['--json', 'providers', '--limit', '1', '--offset', '0']);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.meta.returned_records, 1);
      assert.equal(out.meta.has_more, true);
      assert.equal(out.meta.total_records, 3);
      assert.equal(out.meta.offset, 0);
    });

    test('last page sets has_more=false', async () => {
      const r = await run(['--json', 'providers', '--limit', '1', '--offset', '2']);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.meta.has_more, false);
      assert.equal(out.meta.returned_records, 1);
    });
  });

  describe('funds', () => {
    test('lists funds for a provider', async () => {
      const r = await run(['--json', 'funds', '123456789']);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.ok(Array.isArray(out.data));
      assert.equal(out.data[0].attributes.run, '8011-K');
    });
  });

  describe('series', () => {
    test('lists series with last_day metrics', async () => {
      const r = await run(['--json', 'series', '987654321']);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.data[0].attributes.serie, 'A');
      assert.equal(out.data[0].attributes.last_day.shareholders, 12345);
    });
  });

  describe('tac', () => {
    test('default output renders TAC as percentage', async () => {
      const r = await run(['tac', '111222333']);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /TAC: 1\.32%/);
      assert.match(r.stdout, /Retail/);
    });

    test('--json passes through the upstream payload', async () => {
      const r = await run(['--json', 'tac', '111222333']);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.data.attributes.expense_ratio, 0.0132);
    });
  });

  describe('risk', () => {
    test('renders all risk fields', async () => {
      const r = await run(['risk', '111222333']);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /Volatilidad 12m: 4\.30%/);
      assert.match(r.stdout, /Volatilidad 36m: 5\.23%/);
      assert.match(r.stdout, /Max Drawdown 36m: -18\.30%/);
      assert.match(r.stdout, /Nivel riesgo: high/);
    });
  });

  describe('ranking', () => {
    test('ranks AGFs by patrimony by default', async () => {
      const r = await run(['ranking']);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /Ranking AGF por patrimony/);
      assert.match(r.stdout, /BANCHILE/);
    });

    test('--metric and --date forwarded to API', async () => {
      server.clearRequests();
      const r = await run(['--json', 'ranking', '--metric', 'shareholders', '--date', '2025-03-07']);
      assert.equal(r.status, 0);
      const req = server.requests.find((x) => x.path === '/api/agf_stats/ranking');
      assert.ok(req);
      assert.equal(req.query.metric, 'shareholders');
      assert.equal(req.query.date, '2025-03-07');
    });
  });

  describe('all-funds', () => {
    test('default output renders all 3 fixture rows', async () => {
      const r = await run(['--json', 'all-funds']);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.meta.total_records, 3);
    });

    test('--max-tac filters client-side', async () => {
      const r = await run(['--json', 'all-funds', '--max-tac', '0.01']);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.data.length, 1);
      assert.equal(out.data[0].run, '9999-1'); // Fintual fund (tac=0.005)
    });

    test('--min-patrimony filters client-side', async () => {
      const r = await run(['--json', 'all-funds', '--min-patrimony', '60000']);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.data.length, 1);
      assert.equal(out.data[0].run, '9999-1'); // patrimony 95000
    });

    test('--agf filters client-side by name (substring, case-insensitive)', async () => {
      const r = await run(['--json', 'all-funds', '--agf', 'fintual']);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.data.length, 1);
      assert.match(out.data[0].agf, /FINTUAL/);
    });

    test('--search filters client-side by fundName', async () => {
      const r = await run(['--json', 'all-funds', '--search', 'agresivo']);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.data.length, 1);
      assert.match(out.data[0].fundName, /AGRESIVO/);
    });

    test('--sort-by tac --order asc sorts ascending', async () => {
      const r = await run(['--json', 'all-funds', '--sort-by', 'tac', '--order', 'asc']);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      const tacs = out.data.map((d) => d.tac);
      const sorted = [...tacs].sort((a, b) => a - b);
      assert.deepEqual(tacs, sorted);
    });

    test('--sort-by patrimony --order desc sorts descending', async () => {
      const r = await run(['--json', 'all-funds', '--sort-by', 'patrimony', '--order', 'desc']);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      const pats = out.data.map((d) => d.patrimony);
      assert.deepEqual(pats, [...pats].sort((a, b) => b - a));
    });

    test('--category forwarded to API as query param', async () => {
      server.clearRequests();
      await run(['--json', 'all-funds', '--category', 'equity']);
      const req = server.requests.find((x) => x.path === '/api/all-funds');
      assert.ok(req);
      assert.equal(req.query.category, 'equity');
    });
  });

  describe('cartera + holdings', () => {
    test('cartera renders summary by tipo_instrumento', async () => {
      const r = await run(['cartera', '9570']);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /Cartera - RUN 9570/);
      assert.match(r.stdout, /ETFA/);
    });

    test('holdings renders rows', async () => {
      const r = await run(['--json', 'holdings', '9570']);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.data.length, 2);
      assert.equal(out.data[0].attributes.nemotecnico, 'ESGV US');
    });

    test('holdings --market forwarded as query param', async () => {
      server.clearRequests();
      await run(['holdings', '9570', '--market', 'E']);
      const req = server.requests.find((x) => x.path === '/api/funds/9570/cartera/holdings');
      assert.ok(req);
      assert.equal(req.query.market, 'E');
    });
  });

  describe('days', () => {
    test('lists historical prices with --limit', async () => {
      const r = await run(['--json', 'days', '111222333', '--limit', '5']);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.meta.returned_records, 5);
      assert.equal(out.meta.has_more, true);
    });

    test('--from-date forwarded to API', async () => {
      server.clearRequests();
      await run(['--json', 'days', '111222333', '--from-date', '2024-01-01', '--limit', '1']);
      const req = server.requests.find((x) => x.path === '/api/real_assets/111222333/days');
      assert.ok(req);
      assert.equal(req.query.from_date, '2024-01-01');
    });
  });

  describe('returns', () => {
    test('computes 1Y and 3Y periods from sufficient history', async () => {
      const r = await run(['--json', 'returns', '111222333']);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.ok(out.currentPrice > 0);
      assert.ok(typeof out.currentDate === 'string');
      const names = out.periods.map((p) => p.name);
      assert.ok(names.includes('1Y'));
      assert.ok(names.includes('3Y'));
      // Annualized return for our deterministic fixture (~0.03%/day) ≈ 11.5%/yr.
      const oneY = out.periods.find((p) => p.name === '1Y');
      assert.ok(oneY.annualizedReturn > 5 && oneY.annualizedReturn < 20);
    });
  });

  describe('tac-history', () => {
    test('lists monthly TAC history', async () => {
      const r = await run(['--json', 'tac-history', '111222333']);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.meta.total_records, 2);
    });
  });

  describe('evolution', () => {
    test('forwards repeated -a flags as a list', async () => {
      server.clearRequests();
      const r = await run([
        '--json',
        'evolution',
        '-a', 'BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A.',
        '-a', 'SCOTIABANK CHILE S.A.',
        '-m', 'patrimony',
        '-f', '2025-01',
        '-t', '2025-12',
      ]);
      assert.equal(r.status, 0, r.stderr);
      const req = server.requests.find((x) => x.path === '/api/agf_stats/evolution');
      assert.ok(req);
      assert.deepEqual(req.queryAll.administrator, [
        'BANCHILE ADMINISTRADORA GENERAL DE FONDOS S.A.',
        'SCOTIABANK CHILE S.A.',
      ]);
      assert.equal(req.query.from_month, '2025-01');
      assert.equal(req.query.to_month, '2025-12');
    });
  });

  describe('describe', () => {
    test('returns the static schema for a known command', async () => {
      const r = await run(['--json', 'describe', 'all-funds']);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.schema, 'all-funds');
      assert.equal(out.fields.tac, 'number');
      assert.equal(out.fields.fundName, 'string');
    });

    test('exits 1 on unknown schema', async () => {
      const r = await run(['describe', 'nope-not-real']);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /not found/i);
    });

    test('every SCHEMAS entry is describable', async () => {
      const names = ['health', 'providers', 'funds', 'series', 'all-funds', 'tac', 'risk', 'ranking', 'days', 'cartera', 'holdings'];
      for (const name of names) {
        const r = await run(['--json', 'describe', name]);
        assert.equal(r.status, 0, `describe ${name} failed: ${r.stderr}`);
        const out = JSON.parse(r.stdout);
        assert.equal(out.schema, name);
        assert.ok(Object.keys(out.fields).length > 0);
      }
    });
  });

  describe('--output writes to file', () => {
    test('--json --output writes the JSON envelope to disk', async () => {
      const f = tmpFile();
      try {
        const r = await run(['--json', '--output', f.path, 'health']);
        assert.equal(r.status, 0, r.stderr);
        const written = JSON.parse(readFileSync(f.path, 'utf8'));
        assert.equal(written.status, 'ok');
      } finally {
        f.cleanup();
      }
    });

    test('--output without --json still writes structured data', async () => {
      const f = tmpFile();
      try {
        const r = await run(['--output', f.path, 'providers']);
        assert.equal(r.status, 0, r.stderr);
        const written = JSON.parse(readFileSync(f.path, 'utf8'));
        // The CLI returns the wrapped envelope from the data extractor.
        assert.ok(written.meta);
        assert.ok(Array.isArray(written.data));
      } finally {
        f.cleanup();
      }
    });
  });

  describe('error handling', () => {
    test('upstream 404 → exit 1, error on stderr', async () => {
      server.overrides.set('/api/conceptual_assets/999/real_assets', { status: 404, body: { detail: 'Not found' } });
      try {
        const r = await run(['series', '999']);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /Error:/);
      } finally {
        server.overrides.delete('/api/conceptual_assets/999/real_assets');
      }
    });

    test('upstream 500 → exit 1, error on stderr', async () => {
      server.overrides.set('/health', { status: 500, body: {} });
      try {
        const r = await run(['health']);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /Error:/);
      } finally {
        server.overrides.delete('/health');
      }
    });

    test('unreachable API → exit 1, no stdout JSON garbage', async () => {
      const offlineEnv = { ...env, BUSCAFONDOS_API_URL: 'http://127.0.0.1:1' };
      const r = await run(['health'], { env: offlineEnv });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /Error:/);
      // stdout must not contain a half-formed JSON object — easier for jq pipelines.
      assert.equal(r.stdout.trim(), '');
    });
  });

  describe('--json envelope contract', () => {
    test('every list command emits {meta, data} with the documented keys', async () => {
      const cmds = [
        ['providers'],
        ['funds', '123456789'],
        ['series', '987654321'],
        ['all-funds'],
        ['holdings', '9570'],
        ['days', '111222333', '--limit', '5'],
        ['tac-history', '111222333'],
      ];
      for (const args of cmds) {
        const r = await run(['--json', ...args]);
        assert.equal(r.status, 0, `${args.join(' ')} failed: ${r.stderr}`);
        const out = JSON.parse(r.stdout);
        assert.ok(out.meta, `${args[0]} missing meta`);
        for (const key of ['total_records', 'returned_records', 'has_more', 'limit', 'offset']) {
          assert.ok(key in out.meta, `${args[0]} envelope missing meta.${key}`);
        }
        assert.ok(Array.isArray(out.data), `${args[0]} data is not array`);
      }
    });
  });
});
