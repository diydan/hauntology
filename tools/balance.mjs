// The statistical balance regression (party-mode 9.5, task 2.111): 500 seeded games at each of 3 to 6 Players, every seat a Standard Bot, played by the real
// Engine. It must solve at least 95% of games, take 4 to 7 Rounds on average, and give every seat a win share within 8 points of its fair share.
// Usage: node tools/balance.mjs [games per size]      (default 500, about 20 seconds)
// Exit 0 when every limit holds, 1 when one does not (the report says which), 2 when the run itself could not start.
// A failing run blocks changes to `shared/src/party/`: the repository has no CI workflow yet, so this is the command to run before merging them (`pnpm check-balance`).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shared = resolve(root, 'shared');
const games = process.argv[2] ?? '500';
if (!/^[1-9][0-9]*$/.test(games)) { console.error('games per size must be a whole number of 1 or more'); process.exit(2); }
const vitest = resolve(shared, 'node_modules/vitest/vitest.mjs');
if (!existsSync(vitest)) { console.error(`vitest is not installed at ${vitest}: run the package install first`); process.exit(2); }

const r = spawnSync(process.execPath, [vitest, 'run', 'src/party/balance.test.ts', '--reporter=verbose'], {
  cwd: shared,
  env: { ...process.env, BALANCE_FULL: '1', BALANCE_GAMES: games },
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
const table = out.split('\n').filter((l) => /^(Players|[3-6]\s)/.test(l.trim()) || /points from fair|solved, under|Rounds, outside|did not finish/.test(l));
console.log(table.join('\n'));
if (r.status === 0) { console.log(`\nBalance OK: ${games} games at each of 3 to 6 Players.`); process.exit(0); }
console.error(`\nBalance FAILED (vitest exit ${r.status}).`);
console.error(out.split('\n').filter((l) => /AssertionError|expected|\+ |- /.test(l)).slice(0, 12).join('\n'));
process.exit(r.status === null ? 2 : 1);
