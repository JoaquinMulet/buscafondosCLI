## Summary

<!-- 1-3 bullet points: what changed and why -->

## Self-verification (run before requesting review)

- [ ] `npm test` ran green locally — paste the count: **__/__ tests passed**
- [ ] Smoke-tested the affected command(s): `npm start -- <cmd>` and read the rendered output
- [ ] Diff respects the 5 abstraction layers (envelope, client-side filters, `describe`/`SCHEMAS`, error envelope, `--json`/`--output`)
- [ ] If a list-command shape changed: `SCHEMAS`, `skills/buscafondos/SKILL.md`, and `README.md` are in sync
- [ ] If flags or commands changed: `README.md` usage block + commands table updated
- [ ] No new runtime dependencies (or one is added with explicit justification)
- [ ] No `?.` / `|| 0` defensive chains added to silence crashes (root cause investigated instead)

## Test plan

<!-- Concrete commands a reviewer can run, with expected outcomes. Replace these examples with checks specific to this PR. -->

- [ ] `npm test` — expected: 64+/64+ tests pass on Node 18, 20, 22
- [ ] `npm start -- <affected-command>` — expected: rendered output matches the change description above
