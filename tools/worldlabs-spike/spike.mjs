#!/usr/bin/env node
// World-pipeline Spike 1.1: make one world from one picture on the World Labs World API and record what it answers.
//
//   WLT_API_KEY=... node tools/worldlabs-spike/spike.mjs --image photo.jpg                      # checks the balance, prints the plan, sends nothing
//   WLT_API_KEY=... node tools/worldlabs-spike/spike.mjs --image photo.jpg --yes-spend          # makes a draft world (about 230 credits)
//   ... --model marble-1.1 --max-credits 1600 --yes-spend                                       # makes a standard world (about 1,580 credits)
//
// Options: --image FILE  --model NAME (default marble-1.0-draft)  --max-credits N (default 300)  --yes-spend  --pano
//          --delete-after (delete the world upstream when done, and record whether its files go)  --download DIR  --out DIR
// Environment: WLT_API_KEY (a World API key from platform.worldlabs.ai), WL_MAX_SPEND_CREDITS (total cap over all runs, default 6000),
//              WL_FIXTURE_DIR (default shared/fixtures/worldlabs).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSpike } from '../lib/worldlabs-spike.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

try {
  await runSpike({
    image: value('--image'),
    model: value('--model'),
    maxCredits: value('--max-credits') === undefined ? undefined : Number(value('--max-credits')),
    maxTotal: Number(process.env.WL_MAX_SPEND_CREDITS ?? 6000),
    spend: flag('--yes-spend'),
    isPano: flag('--pano'),
    deleteAfter: flag('--delete-after'),
    downloadDir: value('--download'),
    outDir: resolve(root, value('--out') ?? process.env.WL_FIXTURE_DIR ?? 'shared/fixtures/worldlabs'),
    ledgerPath: resolve(root, 'tools/worldlabs-mcp/.ledger.json'),
    apiKey: process.env.WLT_API_KEY,
    apiBase: process.env.WL_API_BASE,
    log: (line) => console.log(line),
  });
} catch (e) {
  console.error(`spike: ${e.message}`);
  process.exitCode = 1;
}
