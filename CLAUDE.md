This is the BuscaFondos CLI repository — a Node.js command-line tool that exposes the BuscaFondos public REST API for Chilean mutual funds (CMF data) as a Unix-friendly terminal interface. It's a thin client: ES modules, Commander for arg parsing, Axios for HTTP, Chalk for color. There is no build step.

The CLI's primary audience is **LLM agents** consuming it as a tool. Human operators are secondary. Every design decision filters through that lens — so the CLI is *not* a 1:1 mirror of the upstream API. It's a **perfect copy with deliberate abstraction layers** layered on top to make agent consumption robust:

1. **`meta` + `data` envelope** on every list command — agents check `meta.has_more` to decide whether to paginate without re-reading the data array.
2. **Client-side filters** for `all-funds` (`--max-tac`, `--min-patrimony`, `--agf`, `--search`, `--sort-by`, `--order`) — fewer round trips, smaller payloads, predictable filter semantics.
3. **`describe <schema>`** — static schema registry (`SCHEMAS` in `src/cli.js`) so agents can introspect field names/types before piping through `jq`, eliminating hallucinated field references.
4. **Stable error envelope** from `BuscaFondosClient._get` — `{success, data}` or `{success, error: {type, message, status?}}`, never throws. The CLI translates errors to exit code 1 + `Error:` on stderr.
5. **`--json` / `--output`** — every command short-circuits pretty-printing for machine consumption; output is either pure JSON to stdout or written to a file.

These five layers are **the contract**. Breaking any of them — letting a command throw, returning a list without `meta`, removing a client-side filter, missing a `SCHEMAS` entry, leaking a table into `--json` mode — is a regression even if the change is functionally correct. Update [skills/buscafondos/SKILL.md](skills/buscafondos/SKILL.md) in the same commit so downstream agents stay in sync.

## Self-Verification First

The repo's working philosophy: **verify every step before claiming it works.** Code that compiles is not code that works; tests that exist are not tests that pass; a green diff is not a green build. At each stage, the question is "what would prove this?" and you run that proof before moving on.

Concretely, this means at minimum:

- After editing `src/api.js` or `src/cli.js`: smoke-test the affected command with `npm start -- <cmd>` against the real API (or a mock) and read the actual output.
- After writing or modifying a test: run the file (`node --test test/<file>.test.js`) and read the result. "I added a test" without running it is not a finished step.
- After changing the response envelope, `SCHEMAS`, or any list command: run the `--json` envelope contract test in [test/cli.test.js](test/cli.test.js) (the suite that asserts every list command emits `{meta, data}` with the documented keys).
- Before claiming a feature is done: re-read the diff with the question "what assumption did I make that I haven't verified?"
- Status updates and commit messages report what you ran, not what you intend. "Tests pass (`node --test test/api.test.js` → 25/25)" is a self-verification statement; "Should work now" is not.

When a verification step is impossible in the current environment (e.g. you can't reach the live API, or a flag's effect is only visible in a TTY), say so explicitly. Don't paper over it with vague language.

## Running BuscaFondos

### Run Commands

- **Run the CLI from source**: `npm start -- <command> [...args]`
  - `npm start` is just `node src/cli.js`. The `--` is required so npm passes args through.
- **Run a specific command directly**: `node src/cli.js <command> [...args]`
- **Health check (smoke test)**: `npm start -- health`
- **Run as installed binary** (after `npm install -g .`): `buscafondos <command>`
- **Point at a non-default API**: `BUSCAFONDOS_API_URL=https://staging.buscafondos.com npm start -- health`
  - Default base URL is `https://api.buscafondos.com` (see [src/api.js:3](src/api.js:3)). The env var is the only knob — there is no config file.

There is **no compile step and no bundler**. Edits to `.js` files take effect on the next invocation. Don't add a build pipeline "for consistency" — the project is intentionally a runnable script.

### Node version

Requires Node `>=18` (declared in [package.json:19](package.json:19)). The code uses native `fetch`-era assumptions, top-level ES modules (`"type": "module"`), and modern syntax. Do not downlevel or add CommonJS shims.

## Testing

The suite uses **Node's built-in `node:test`** runner — no Jest/Vitest/Mocha. The project has three runtime dependencies and that's the value proposition. A new dev dep needs explicit justification.

### Layout

- [test/api.test.js](test/api.test.js) — unit tests for `BuscaFondosClient`. Each method tested for path, query-param wiring, and error envelope (404, 500, 502, 503, ECONNREFUSED).
- [test/cli.test.js](test/cli.test.js) — integration tests that spawn `node src/cli.js <cmd>` as a subprocess and assert on stdout/stderr/exit code. Covers every command, every flag mode (default/JSON/--output), client-side filters of `all-funds`, and the `--json envelope contract` suite which guarantees every list command emits `{meta, data}` with the documented keys.
- [test/helpers/fixtures.js](test/helpers/fixtures.js) — Spec-derived fixtures (one per endpoint). Keep these in sync with the upstream OpenAPI `examples`.
- [test/helpers/mock-server.js](test/helpers/mock-server.js) — `node:http` server on `127.0.0.1:0`. Tests inject overrides via `server.overrides.set(path, { status, body })` and inspect captured requests via `server.requests`. Normalizes axios's `key[]` array-param style to bare `key`.

### Running

```bash
# Whole suite
npm test

# Single file (faster iteration)
node --test test/api.test.js
node --test test/cli.test.js

# Filter by test name within a file
node --test --test-name-pattern="envelope" test/cli.test.js
```

The `npm test` script lists files explicitly (`node --test test/api.test.js test/cli.test.js`) rather than passing `test/` — Node ≥18 interprets a bare directory as a module path and errors out (`MODULE_NOT_FOUND`). When you add a test file, append it to the `test` script.

### Where new tests go

Mirror the file you're changing. A bug in `tac` belongs in the existing `tac` describe block in [test/cli.test.js](test/cli.test.js), not in a new file. If `cli.test.js` grows past ~600 lines, split per-command into `test/cli/<command>.test.js`.

### The mock-server pattern

The CLI tests never hit the real API. The flow is:

1. `before()` starts the mock server, sets `BUSCAFONDOS_API_URL` in the subprocess env to point at it.
2. Each test runs `await execFile('node', [CLI, ...args], { env })` (promisified) and asserts on stdout/stderr/exit code. **Use `execFile` (async), not `spawnSync`.** The mock server runs on the same event loop as the test harness; `spawnSync` would block that loop and the server would never answer the subprocess's request, deadlocking on the 30s axios timeout. The wrapper in [test/cli.test.js](test/cli.test.js) catches `execFile`'s rejection-on-non-zero-exit and returns a uniform `{stdout, stderr, status}` for both success and expected-error cases.
3. For error-path tests, install an override before running and clear it in `finally`:

```javascript
test('upstream 404 → exit 1', async () => {
  server.overrides.set('/api/conceptual_assets/999/real_assets', { status: 404, body: { detail: 'Not found' } });
  try {
    const r = await run(['series', '999']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Error:/);
  } finally {
    server.overrides.delete('/api/conceptual_assets/999/real_assets');
  }
});
```

### Test rules

- **CRITICAL**: Never hit the real `https://api.buscafondos.com` from tests. Tests must be deterministic, offline, and free.
- **CRITICAL**: Don't write tests that only check "no panic / no uncaught exception". They never fail and are dead weight.
- Don't use `setTimeout` to wait for things. Await the actual condition — `await` the `execFile` promise, await the process exit, etc.
- Assert on `stdout` **before** asserting on exit code — when an assertion blows up, the stdout/stderr diff is what tells you what went wrong.
- For JSON-mode commands, parse `stdout` and assert on the object, not the string. Whitespace/key-order assertions rot.
- For `chalk`-colored output, set `NO_COLOR=1` and `FORCE_COLOR=0` in the subprocess env so regex assertions don't fight ANSI escapes.
- After every change, **run the relevant test file before claiming the change is done.** A test that exists but was never run is a liability, not an asset.

## Code Architecture

This is a small codebase (~3 files of real code). The architecture is "thin client + presentation layer," and the layering matters more than the size suggests.

### Files

- [src/api.js](src/api.js) — `BuscaFondosClient`: pure transport. One method per endpoint, all returning `{ success, data }` or `{ success, error: { type, message, status? } }`. **No formatting, no console output, no `process.exit`.** Errors are translated, not thrown.
- [src/cli.js](src/cli.js) — Commander command definitions, presentation (table rendering via `printTable`), output dispatch (`output` / `handleResult`), and the `SCHEMAS` registry that powers `describe`.
- [skills/buscafondos/SKILL.md](skills/buscafondos/SKILL.md) — Domain knowledge for LLM agents (taxonomy, regulatory limits, risk formulas, analytical workflow). Not consumed by the runtime; copied into a downstream agent's `.claude/skills/` directory.

### The two-layer rule

`api.js` is the boundary. `cli.js` calls it. Anything that talks to the network must live in `api.js`; anything that touches `console`, `chalk`, `process.exit`, or filesystem output must live in `cli.js`. Don't merge them "for convenience" — keeping them split is what makes `BuscaFondosClient` reusable from a future programmatic API or test harness.

### Response envelope: `meta` + `data`

Every list-style command goes through `wrapResponse(items, total, limit, offset)` ([src/cli.js:26](src/cli.js:26)). The output shape is:

```json
{
  "meta": { "total_records": N, "returned_records": M, "has_more": bool, "limit": L, "offset": O },
  "data": [ ... ]
}
```

This envelope is **load-bearing for LLM consumers** — agents check `has_more` to decide whether to paginate without re-reading the array. When you add a new list command, route it through `wrapResponse` even if the upstream API already returns metadata. Inconsistency here breaks the skill's pagination contract.

### Pagination: server-side vs client-side

Some commands paginate on the server (`limit`/`offset` go in the request) and some paginate client-side (the API returns everything, the CLI slices locally). Look at the existing command before deciding:

- **Server-side**: `funds`, `series`, `days`, `holdings`, `tac-history` — pass `limit`/`offset` in the Axios `params`.
- **Client-side**: `providers`, `all-funds` (because filters and sort run *after* fetch). The CLI fetches, filters/sorts in JS, then slices.

Don't switch a command from one mode to the other without a reason — `all-funds` is client-side because the filtering happens in the CLI, and moving it server-side would silently change which records the filters apply to.

### `describe` and the `SCHEMAS` registry

[src/cli.js:441](src/cli.js:441) defines `SCHEMAS` — a static map of command name → field types. The `describe` command reads it. **When you add a new list command or change the shape of an existing one, update `SCHEMAS`.** Agents call `describe` to learn field names before piping through `jq`; out-of-date schemas cause hallucinated field references downstream.

### Output dispatch

Three global flags govern output: `--json` (machine-readable), `--output <file>` (write to disk), and per-command `--limit`/`--offset`. They are wired through module-level `globalJson` and `globalOutputFile` set in the `preAction` hook ([src/cli.js:492](src/cli.js:492)). Every command's data extractor checks `if (globalJson || globalOutputFile) return data;` before pretty-printing. **Always honor this short-circuit** — printing tables in JSON mode breaks `jq` pipelines, which is the whole point of the flag.

### Error handling

`BuscaFondosClient._get` ([src/api.js:11](src/api.js:11)) catches every Axios error and returns a tagged result. The CLI's `handleResult` ([src/cli.js:54](src/cli.js:54)) is the **only** place that prints `Error:` and calls `process.exit(1)`. Don't sprinkle `process.exit` through commands; route through `handleResult`. Don't `throw` from `api.js` — the contract is "always resolves to `{ success, ... }`."

## Adding a New Command

The pattern is small enough to follow by example, but easy to break. The full checklist:

1. **Add a method to `BuscaFondosClient`** in `src/api.js`. Follow the naming of neighbors (`getX`, `listX`). Return `this._get(path, params)` — don't add custom error handling.
2. **Add a command in `src/cli.js`** via `program.command(...)`. Use `parseInt` for numeric arguments, mirror neighboring commands' option flag style (`-l`/`--limit`, `-o`/`--offset`, `-f`/`--from-date`).
3. **Write the action handler.** Call the client, then `handleResult(result, dataExtractor)`. The data extractor *must* return data when `globalJson || globalOutputFile`, and pretty-print otherwise.
4. **Wrap list responses in `wrapResponse`** so `meta.has_more` is correct.
5. **Add an entry to `SCHEMAS`** if the command returns a new shape.
6. **Update `README.md`** — both the usage block and the commands table.
7. **Update `skills/buscafondos/SKILL.md`** if the command is something an agent should call. The skill is the agent-facing contract.
8. **Add tests** per Testing above.

## Code Review

Code review is the spine of this project. It is not a tail-end ritual after the work is "done"; it is a continuous discipline running through every step. Two flavors apply: **self-review before pushing** and **peer/AI review after pushing**. Both are non-negotiable.

### Self-Review (before any push)

Read your own diff with adversarial eyes. The goal is not "does this look clean" — it is "what assumption did I make that I haven't verified, and what would break if it's wrong?"

Run these checks every time, in order. Don't skip steps because the change "feels small":

1. **Smoke-test the affected command** end-to-end against the mock or real API. Read the *rendered output*, not just the exit code. A command can exit 0 and still print garbage.
2. **Run the relevant test file**, not just the one you just wrote. If you touched the response envelope or any list command, run the full envelope contract test (the `--json envelope contract` suite in [test/cli.test.js](test/cli.test.js)).
3. **Re-read the diff line by line** asking, for each change:
   - Does this respect the five abstraction layers (envelope, client-side filters, `describe` schemas, error envelope, `--json`/`--output` short-circuit)?
   - Is there any place I now `throw` from `api.js`, or `process.exit` from outside `handleResult`? Both are layering violations.
   - Did I add `?.` / `|| 0` defaults to make a command stop crashing? If so, **stop**: the upstream shape probably changed and the right fix is at the data-extraction layer, not at the rendering layer.
4. **Diff `SKILL.md` and `SCHEMAS` against the change.** If a list command's shape moved, both must move. Stale schemas are silent corruption — the agent gets wrong field names with no error.
5. **Diff `README.md`.** If you added/renamed a command or flag, the README's usage block and commands table must reflect it. Out-of-date README is a documented regression.
6. **Look for what isn't there.** Are there error paths you didn't think about? A command that uses `parseInt` on a non-numeric arg? A `--from-date` validated against the API's actual format requirements (note `expense_ratio/history` uses `YYYYMMDD` while `days` uses `YYYY-MM-DD`)?
7. **Check for new dependencies.** This project ships with three runtime deps. Anything new requires explicit justification — "I needed it" is not justification, "the alternative is 50 lines I'd have to maintain forever" is.

### Anti-rationalization checklist

These are the thoughts that mean **stop and re-examine**, not "ship anyway":

| Thought | Reality |
|---|---|
| "It's just a small change" | Small changes break the envelope contract just as easily as big ones. Run the contract test. |
| "The test is flaky, it'll pass next time" | Flaky tests are bugs. Find the race or the unverified condition; don't retry. |
| "The bug report's fix sounds right, let me just apply it" | The reporter's fix is a hint about the symptom. Find the layer where the fix actually belongs. |
| "Neighboring code does X but Y is cleaner here" | Neighbors' choices are usually load-bearing. If you can't articulate why X was wrong, follow X. |
| "I'll add the test after I confirm it works manually" | Manual confirmation rots the moment you walk away. Write the test first or alongside. |
| "It works on my machine, the CI failure is unrelated" | CI failures are never unrelated until you've read the actual log. |

### Peer / AI review (after pushing)

After pushing, get an independent read. The point is not validation; it's catching the things you couldn't see because you wrote them.

- Open a PR. Don't merge your own work without at least one external eye, even if the eye is an AI reviewer.
- When you receive review feedback, distinguish "I disagree because…" from "I disagree because I don't want to redo this." Only the first is a valid response.
- Inline comments require an inline response *or* a follow-up commit. Do not ignore them by merging.
- For substantial changes, request review on the abstraction-layer impact specifically: "does this break the envelope contract?", "are the SCHEMAS still accurate?", "does the error path still translate cleanly?"
- If a reviewer requests a change you don't understand, your job is to either understand it before pushing back, or do it. "I think you're wrong but I'll do it" is fine. "I'm ignoring this" is not.

### Reading PR feedback

`gh pr view --comments` only returns issue-stream comments — it silently omits review summaries and line-level comments. To see the full picture (including inline review comments and review verdicts), use the GitHub API directly:

```bash
# All issue comments + review verdicts + line-level review comments, chronological
PR=<number>
echo "--- Issue comments ---"
gh api repos/:owner/:repo/issues/$PR/comments --jq '.[] | "\(.user.login) [\(.created_at)]: \(.body)"'
echo "--- Review verdicts ---"
gh api repos/:owner/:repo/pulls/$PR/reviews --jq '.[] | "\(.user.login) [\(.state) @ \(.submitted_at)]: \(.body)"'
echo "--- Line comments ---"
gh api repos/:owner/:repo/pulls/$PR/comments --jq '.[] | "\(.user.login) on \(.path):\(.line) [\(.created_at)]: \(.body)"'
```

If you find yourself doing this often, write a `scripts/pr-comments.sh` and add it to `package.json` as `"pr:comments": "bash scripts/pr-comments.sh"` — a thin script you can fix when GitHub's response shape shifts is better than memorizing flags.

## CI

GitHub Actions is configured for this repo:

- [.github/workflows/test.yml](.github/workflows/test.yml) — runs `npm test` on Node 18, 20, and 22 for every PR against `main` and every push to `main`. Matrix is `fail-fast: false`, so one Node version failing doesn't mask the others.
- **CodeRabbit** — free GitHub App for public repos. Configured by [.coderabbit.yaml](.coderabbit.yaml). Auto-reviews every PR against `main` using project-specific instructions anchored to the 5 abstraction layers. Setup is one-time: install the App at https://github.com/marketplace/coderabbit-ai. After install, no per-PR action needed — the review just appears as inline comments + a top-level summary.

The two together mean: every PR gets (a) tests run on three Node versions and (b) an AI review that flags abstraction-layer violations, stale `SCHEMAS`/`SKILL.md`/`README.md`, defensive `?.`/`|| 0` chains, and unjustified new dependencies — without you doing anything. **CodeRabbit is the canonical "external eye"** required by the Code Review section below; no further reviewer is needed before merge.

## Debugging CI Failures

### Read the actual log first

When CI fails, your first move is to read the failing job's log — not to guess, not to push another commit, not to "rerun and see." The cost of reading is two minutes; the cost of guess-fix-push loops is hours.

```bash
# Get the failing job's log directly
gh run list --branch $(git branch --show-current) --limit 5
gh run view <run-id> --log-failed
```

If the log is truncated or unhelpful, download artifacts (`gh run download <run-id>`) and inspect locally. The log is the source of truth — your local mental model of "what should be happening" is not.

### Reproduce locally before pushing a fix

A CI failure that you cannot reproduce locally is a CI failure you do not understand. Before pushing any fix:

1. Run the exact command CI ran (`npm test`, or whatever the job invokes).
2. If it passes locally, find the *environmental* difference — Node version, locale, timezone, line endings, missing env var, network — and reproduce it. Do not push "let's see if this fixes it." That is gambling.
3. If it's a flaky test, find the race or the unverified condition. The fix is to make the test deterministic, not to add a retry.

### Don't take destructive shortcuts

When CI is angry, the temptation is to make the anger go away. Resist:

- **Never** `--no-verify` to skip pre-commit hooks. If a hook fails, fix the underlying issue.
- **Never** `git push --force` to rewrite a published branch unless explicitly authorized.
- **Never** `git reset --hard` or `git checkout .` to discard "weird" local state without first inspecting it. That state may be your own in-progress work.
- **Never** silence a failing test by skipping it (`it.skip`, `t.skip`) without filing an issue and adding a comment with the issue link. Skipped tests rot.
- **Never** delete or downgrade a dependency to make a build error go away without understanding the underlying compatibility issue.

### When a CI helper script gets in the way

If output from a CI-debugging helper looks wrong — mis-parsed log, confusing wording, a field GitHub changed shape on — fix the helper directly rather than working around it. Helpers are thin presenters over `gh`; keep them accurate.

## Important Development Notes

1. **Self-verify every step.** Run the test, run the command, read the actual output before claiming the work is done. See "Self-Verification First" above.
2. **Honor the five abstraction layers.** Envelope, client-side filters, `describe` schemas, error envelope, `--json`/`--output`. Breaking any of them is a regression.
3. **No build step.** Edits are live. Don't introduce one.
4. **`api.js` is the only network layer.** `cli.js` never calls Axios directly.
5. **All list commands wrap with `wrapResponse`.** The `meta.has_more` field is part of the agent contract.
6. **Update `SCHEMAS`, `SKILL.md`, and `README.md` together with command changes.** Stale schemas cause downstream agent hallucinations; stale READMEs mislead human users; stale skills break agent installations.
7. **Never hit production API from tests.** Mock at the Axios layer or use a local server with `BUSCAFONDOS_API_URL`.
8. **Use ES modules everywhere.** `import`/`export`, no `require`. The package is `"type": "module"`.
9. **Use absolute paths in file operations** — particularly `--output` should resolve relative to `process.cwd()`, never to the script directory.
10. **Be cross-platform.** The CLI runs on Windows, macOS, and Linux. Avoid shelling out to `find`/`grep`; use Node's `fs`. Don't hardcode `/` separators in user-visible paths.
11. **Be humble & honest.** Don't claim a command works because it didn't crash. NEVER overstate what was tested in commit messages or PRs.
12. **Branch names must start with `claude/`** when worked on by Claude — matches the existing branch convention.
13. **Never take destructive shortcuts to silence errors.** No `--no-verify`, no `git reset --hard` on unfamiliar state, no skipping tests to make CI green. See "Debugging CI Failures" above.

**ONLY** push changes after (a) smoke-testing the affected command (`npm start -- <cmd>`), (b) running the relevant test file (`node --test test/<file>.test.js`), and (c) running through the Self-Review checklist in "Code Review" above.

## Releases

The CLI ships via `npm install -g .` (and the README documents `npm install -g git+...` for end users). Two places hold the version string and **must move together**:

- [package.json:3](package.json:3) — `"version"` field
- [src/cli.js](src/cli.js) — the `.version(...)` call on the Commander program

When releasing:

1. **Decide the bump (semver):**
   - **patch** (1.1.1 → 1.1.2): bug fix, doc-only change, internal refactor.
   - **minor** (1.1.1 → 1.2.0): new command, new flag, new optional capability — backwards-compatible additions.
   - **major** (1.1.1 → 2.0.0): breaking change to a command, a flag, or the JSON envelope shape (envelope changes are user-facing for LLM consumers — even removing a key is breaking).

2. **Update both `package.json` and `src/cli.js` in the same commit.** A version mismatch between the two means `buscafondos --version` lies.

3. **Open the PR with the bump included** — don't separate it into its own PR. Reviewers benefit from seeing the bump alongside the change that motivated it.

4. **After merge, tag the merge commit on `main`:**

   ```bash
   git checkout main && git pull
   git tag -a v<version> -m "Release v<version>"
   git push origin v<version>
   ```

5. **(Optional) Create a GitHub release from the tag** with notes pulled from the merged PR description. `gh release create v<version> --generate-notes` does this in one shot.

The version is duplicated across two files for now because Commander needs the string at definition time. If this becomes a maintenance burden, replace the hardcoded value in `src/cli.js` with `import pkg from '../package.json' with { type: 'json' }` and read from `pkg.version`.

## The Skill (`skills/buscafondos/SKILL.md`)

The skill is not project documentation — it's a **deliverable**. It teaches a downstream LLM agent how to analyze Chilean mutual funds using this CLI: domain taxonomy, regulatory limits, risk formulas, the canonical analytical workflow. Two consequences:

- **Treat it as a public API.** Renaming a command, changing flag semantics, or altering the JSON envelope is a breaking change for every agent that has the skill installed. Update `SKILL.md` in the same commit.
- **Don't put implementation details there.** The skill describes *how to use* the CLI, not how the CLI is built. Internal refactors should leave it untouched.

## Domain Quick Reference

Some terms recur in commands and code; misreading them produces wrong analyses:

- **AGF** (*Administradora General de Fondos*) — Fund management company. Top of the hierarchy. `providers` lists them.
- **Fondo / Concepto** — A mutual fund (one strategy, one prospectus). `funds` lists them per AGF.
- **Serie** — A share class within a fund (different fees, minimums, investor types). `series` lists them per fund. Most metrics (TAC, risk, value) are *per series*, not per fund.
- **RUN** — Chilean fund registry ID. Used for `cartera` and `holdings` (which are reported at the *fund* level, not series level).
- **TAC** (*Tasa Anual de Costos*) — Total annual expense ratio, expressed as a decimal (`0.0123` = 1.23%). Always render as percentage in human output.
- **Patrimonio** — Total net assets. Reported in CLP thousands in some endpoints, in CLP in others — check the upstream field name before assuming units.
- **Holdings vs Cartera** — `cartera` is the per-instrument-type summary; `holdings` is the row-level positions list. Don't conflate them in code or in user-facing labels.

The full taxonomy and analytical workflow live in [skills/buscafondos/SKILL.md](skills/buscafondos/SKILL.md). Read it before making domain-level changes.

## Data Source

All data is sourced from Chile's **Comisión para el Mercado Financiero (CMF)** via the upstream `https://api.buscafondos.com` service (this CLI does not scrape). The CMF publishes a `last_scraped_date` — `health` surfaces it, and many endpoints' freshness depends on it. If a user reports stale data, check `buscafondos health` first; the issue is usually upstream, not in this repo.
