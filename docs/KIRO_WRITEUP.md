# How Kiro was used to build Hauntwalk

Draft for the Devpost "Kiro write-up" field. It follows the eight questions the judges ask.

**How to use this draft.** Text without a tag is true of the repo today. Tags mark what only you or a later build can fill in:

- `[CONFIRM]` a fact about how you worked that I cannot see. Keep it, change it or delete it.
- `[EVIDENCE]` a screenshot, log or file that must exist before you submit. Put it in `docs/evidence/`.
- `[AFTER BUILD]` cannot be true until code exists.

Do not submit with any tag left in. Delete a claim you cannot back up.

## Setup status

| Kiro feature | In the repo now | Still to do |
|---|---|---|
| Specs | 5 specs: 186 criteria, 71 properties, traceability tool | Mark tasks done as they pass |
| Steering | 9 files: 4 always-on, 5 file-scoped | Update world-pipeline and party steering for Workers AI |
| Hooks | 5 standalone hooks in `.kiro/hooks/` | Capture one firing for evidence |
| Custom agents | `spec-reviewer` (read-only), `pbt-writer` (writes tests only) in `.kiro/agents/` | Run each once in the surface you use, capture the result |
| Powers | `powers/hauntwalk-guarded-ai/` (own power, one skill) | Import it in the Powers panel. Install any third-party power you really use |
| MCP | `worldlabs-dev` entry in `.kiro/settings/mcp.json` | **The server is not built yet.** `tools/worldlabs-mcp/` holds only a README. Build it (world-pipeline task 0) before claiming it |
| PBT | 71 properties specified | **No tests exist yet.** Everything in section 7 is `[AFTER BUILD]` |

Changes made while writing this: removed the Nova Canvas MCP entry (the stack moved to Workers AI), and updated the spend-guard hook to audit `env.AI` instead of Bedrock.

## 1. Which Kiro surfaces, and how they differed

Hauntwalk was planned and reviewed in **Kiro Crew**, the dashboard agent layer. It keeps memory across sessions and can run subagents and scheduled jobs. Specs, steering and hooks are plain files in `.kiro/`, so they work the same in every surface.

| Surface | What I used it for | What it was good at | What it was bad at |
|---|---|---|---|
| Crew | Spec reviews, planning, research, repo setup, this write-up | Long-running review work with memory of earlier findings | `[CONFIRM]` |
| IDE | `[CONFIRM: spec authoring, hooks panel, powers panel]` | `[CONFIRM]` | `[CONFIRM]` |
| CLI | `[CONFIRM: not used, or what for]` | `[CONFIRM]` | `[CONFIRM]` |
| Web | `[CONFIRM: not used, or what for]` | `[CONFIRM]` | `[CONFIRM]` |

If you did not try a surface, say so in one line. Judges prefer a true "not used" to a vague claim.

## 2. Custom agents

Two agents live in `.kiro/agents/` as Markdown files. Each has a narrow job and narrow permissions.

| Agent | Job | Permissions |
|---|---|---|
| `spec-reviewer` | Reads specs and reports gaps: ownership, hidden information, spend, time, traceability | `read` only. It cannot write files |
| `pbt-writer` | Turns one correctness property into one fast-check test | Writes only under `shared/src/**` and test files. Denied on `.kiro/specs`, `steering` and `hooks`. Shell limited to `pnpm test`, `pnpm typecheck` and the traceability check |

Why two agents and not one: the reviewer must not be able to "fix" a spec to make a finding go away, and the test writer must not be able to weaken a property to make a test pass. Separating them in permissions enforces both.

- `[CONFIRM]` Which surface you ran them in.
- `[EVIDENCE]` One `spec-reviewer` run and one `pbt-writer` run, saved to `docs/evidence/agents/`.
- `[AFTER BUILD]` What they caught or wrote that you would have missed.

True and already usable: the review process itself found real problems before any code existed. The first review of the four single-player specs found ownership gaps on `POST /api/play/start` and `POST /api/sketch/select`. The review of party mode found 14 issues, seven of them blockers (one Durable Object alarm for five deadlines, a replayable deal seed, a client-side peek rule, out-of-turn local input, no room registry, an undefined camera start, undefined face buttons). Those seven are fixed in the spec.

## 3. Hooks

Five hooks, each tied to a rule that costs money or trust if broken.

| Hook | Trigger | Action | Why |
|---|---|---|---|
| Spec traceability | `PostFileSave` on `.kiro/specs/*.md` | `node tools/check-traceability.mjs` | Keeps criteria, tasks and properties in sync |
| Spend guard audit | `PostFileSave` on `api/src/**/*.ts` | Agent prompt, report only | Flags any paid call outside `api/src/guarded/` or without a `SpendTicket` |
| Property test sync | `PostFileSave` on `shared/src/**` | Agent prompt | Keeps each property's test present and current. It may edit tests, never specs |
| Print validate | `PostFileSave` on `print/**` | `node tools/build-print.mjs --check` | Every STL stays closed, correctly wound and fits the bed |
| Typecheck | `Stop` | `pnpm -r --if-present typecheck` | Type errors surface at the end of every agent turn |

What changed in practice: the traceability hook turns spec drift into an immediate failure instead of a late surprise. The spend guard hook protects the one rule that must never break.

- `[EVIDENCE]` A screenshot of the traceability hook failing, then passing.
- `[EVIDENCE]` The spend guard hook flagging a deliberately unguarded call.
- `[AFTER BUILD]` How many times each fired. Do not guess.

## 4. Spec-driven development, and how it compared to vibe coding

Structure: five specs, each with `requirements.md` in EARS form, `design.md` with numbered correctness properties, and `tasks.md` ordered spikes first, then pure logic with tests, then Durable Objects, then routes, then UI. Each property says which requirements it validates, and each task says which requirements it covers.

| Spec | Criteria | Properties |
|---|---|---|
| world-pipeline | 50 | 14 |
| world-viewer | 29 | 11 |
| ghost-creator | 21 | 8 |
| ghost-engine | 30 | 14 |
| party-mode | 56 | 24 |

What it bought, with real examples:

- **Review before code.** Because the rules were written down, a reviewer could find the replayable seed and the client-side peek rule on paper. In a vibe-coded build those become live bugs.
- **A review that corrected itself.** An early note said the `SpendGuard` ticket (30 min) could expire before a `WorldJob` (20 min). Checking the numbers showed there was no race. The note was withdrawn in `docs/PLAN.md`. Written numbers make a wrong claim cheap to disprove.
- **Spikes first.** The unverified assumptions (World Labs response shape, FLUX sketch quality, TTS latency, phone latency) are listed in `.kiro/steering/tech.md`. Each has a spike that must write `docs/spikes/<id>.md` before code depends on it.
- **Scope control.** `docs/IMPLEMENTATION.md` and the party-mode cut line let the project shrink without breaking the core.

Comparison to vibe coding: `[CONFIRM: a concrete moment where you used a quick prompt instead of a spec, and what happened]`. `[AFTER BUILD]` A measured example, such as how many tasks passed on the first run.

## 5. Steering

Nine files, split by when they load.

| Loads | Files | Purpose |
|---|---|---|
| Always | `product`, `tech`, `structure`, `security-and-cost` | The product rules, the stack, the layout, and the spend and secrecy rules |
| Only when matching files are open | `ghost-safety` (`**/ghost/**/*.ts`), `testing` (`**/*.test.ts`), `visual-style` (`web/**/*.tsx`), `worldlabs-api` (`api/src/worldlabs/**`), `party-mode` (`**/party/**`) | Deep rules that only matter in one place |

The strategy: keep the always-on set small and about *rules that must never break*, and push everything else into file-scoped steering. Context stays lean and the right rule shows up at the right file.

A second strategy: steering lists its own unknowns. `tech.md` has an "Unverified assumptions" list, so the agent is told what not to build on.

- `[EVIDENCE]` One before-and-after of a response that changed because of a steering file.
- `[CONFIRM]` Which steering file made the biggest difference. My guess is `security-and-cost.md`, but only you saw the responses.

## 6. MCP

Planned server: `worldlabs-dev`, a **spend-capped** World Labs server with a ledger, secret scrubbing and fixture recording. Generation tools are never auto-approved. Only read-only tools are. `WL_MAX_SPEND_CREDITS` caps total spend.

What it enables that would otherwise be hard: Kiro can inspect real World Labs responses and record them as test fixtures without ever holding an unbounded key.

Status: **not built.** `tools/worldlabs-mcp/` has only a README. `[AFTER BUILD]` Write this section from the built server. `[EVIDENCE]` A recorded fixture the server produced, and one denied call that hit the spend cap.

Related and real: the World Labs CLI and its skills were installed and used for a first Atlas API request (`images2PosedRGBD`, succeeded). `[CONFIRM]` Whether you want that in the write-up.

## 7. Property-based testing

71 properties are specified across five specs. They cover:

- **Hidden information.** Views never leak secrets, using a fuzz that plants unique tokens in every hand and the Solution and checks that none appears in any public output (party Property 8).
- **Fair play.** The deal is a valid partition. Turn order is fair. Suggestions resolve to the first holder clockwise. Games terminate.
- **Time.** `nextWake` returns the earliest of all deadlines, and a turn ends exactly once (party Property 13).
- **Money.** Spend never exceeds a cap, and no upstream call follows a denial. Narration never changes game state (party Property 23).
- **Geometry.** Printed meshes are watertight and QR plates round-trip (party Property 20).

Status: **no tests exist yet.** `[AFTER BUILD]` Fill in:

- `[EVIDENCE]` One property where fast-check found a counter-example, the shrunk case, and the fix.
- Which requirements did not get a property, and why. Honest gaps score well.
- What unit tests alone would have missed.

## 8. Powers and third-party tools

Own power: `powers/hauntwalk-guarded-ai/`, a `plugin.json` plus one skill, `add-guarded-call`. It encodes the one procedure that must never be done wrong: how to add a paid call behind `SpendGuard`. Keywords include `spendguard`, `workers ai` and `guarded call`, so it loads when you talk about adding a paid call.

- `[CONFIRM]` Import it through Powers panel, Add Custom Power, Import power from a folder, and say whether it activated.
- `[CONFIRM]` Any curated power you installed. I could not check the registry. If you installed none, say you built one instead.

Third-party tools in the build, all real and in the plan: Cloudflare Workers, Durable Objects, R2 and Workers AI; World Labs; three.js and Spark; fast-check; OpenSCAD (optional). `[CONFIRM]` Which of these you would not have used without Kiro.

## Closing: what worked, what did not

`[CONFIRM]` Write three honest lines at the end, after the build:

1. The thing Kiro did that you would have skipped.
2. The thing that did not work and what you changed.
3. What you would do first next time.
