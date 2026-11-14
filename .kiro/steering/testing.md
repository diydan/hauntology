---
inclusion: fileMatch
fileMatchPattern: "**/*.test.ts"
---
# Testing conventions

- Runner: Vitest. Property-based tests: fast-check, `numRuns >= 100`, seeded (`seed` printed on failure).
- Every property in a spec's `design.md` ("Correctness Properties") has exactly one property test. Tag it with a comment:
  `// Feature: <spec-name>, Property <N>: <name>` and a second line `// Validates: Requirements X.Y, X.Z`.
- The task in `tasks.md` that adds the test repeats the same `**Property N: ...**` and `**Validates: Requirements ...**` lines. `tools/check-traceability.mjs` enforces this.
- Unit tests cover concrete examples and edge cases; property tests cover the universal rule. Do not duplicate one as the other.
- Pure logic is tested in `shared/`. Durable Objects are tested with an in-memory storage fake plus fast-check command sequences (model-based testing).
- Contract tests parse recorded fixtures in `shared/fixtures/**`. Fixtures are real upstream responses with secrets and ids scrubbed.
- No test calls World Labs or Workers AI. A test that needs network is a bug.
- Inject time and randomness (`now: () => number`, seeded rng). Never call `Date.now()` or `Math.random()` in logic under test.
- Generators live next to the logic they test in `*.arb.ts` files and are reused across specs.
- When a property test fails, minimise the counter-example, add it as a unit-test regression, then fix the code (not the property) unless the requirement is wrong — if so, update `requirements.md` first.
