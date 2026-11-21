#!/usr/bin/env node
// The stdio entry of the dev MCP server (world-pipeline task 0). Reads one JSON-RPC message per line from stdin and writes one
// reply per line to stdout. Refuses to start without WLT_API_KEY, and never prints the key or a picture.
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorldLabsClient } from './api.mjs';
import { handleMessage } from './server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

let client;
try {
  client = createWorldLabsClient({
    apiKey: process.env.WLT_API_KEY,
    apiBase: process.env.WL_API_BASE,
    maxTotal: Number(process.env.WL_MAX_SPEND_CREDITS ?? 6000),
    maxPerCall: Number(process.env.WL_MAX_CREDITS_PER_CALL ?? 300),
    ledgerPath: resolve(here, '..', '.ledger.json'),
    fixtureDir: resolve(repoRoot, process.env.WL_FIXTURE_DIR ?? 'shared/fixtures/worldlabs'),
  });
} catch (e) {
  process.stderr.write(`worldlabs-mcp: ${e.message}\n`);
  process.exit(1);
}

const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (line.trim() === '') return;
  let msg;
  try { msg = JSON.parse(line); } catch { msg = null; }
  const reply = await handleMessage(client, msg);
  if (reply !== null) process.stdout.write(`${JSON.stringify(reply)}\n`);
});
