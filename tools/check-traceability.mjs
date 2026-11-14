#!/usr/bin/env node
// Checks that Kiro specs are internally consistent:
//  - every requirement id referenced by tasks.md / design.md exists in requirements.md
//  - every acceptance criterion is covered by at least one task
//  - every design Correctness Property has a matching property-test task (same name, same Validates ids)
//  - steering front matter, hook files and mcp.json are well formed (and contain no literal secrets)
// Usage: node tools/check-traceability.mjs [--verbose]
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const verbose = process.argv.includes('--verbose');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kiro = join(root, '.kiro');
const errors = [];
const note = (msg) => errors.push(msg);
// lookarounds (not \b): the last id in "_Requirements: 1.4, 1.5_" is followed by "_", a word character
const ids = (s) => [...s.matchAll(/(?<!\d)\d+\.\d+(?!\d)/g)].map((m) => m[0]);

function parseRequirements(text) {
  const out = new Set();
  let req = null;
  let inAC = false;
  for (const line of text.split('\n')) {
    const h = line.match(/^###\s+Requirement\s+(\d+)\b/);
    if (h) { req = h[1]; inAC = false; continue; }
    if (/^####\s+Acceptance Criteria/i.test(line)) { inAC = true; continue; }
    if (/^#{1,4}\s/.test(line)) { inAC = false; continue; }
    const m = line.match(/^\s*(\d+)\.\s+\S/);
    if (inAC && req && m) out.add(`${req}.${m[1]}`);
  }
  return out;
}

// Returns [{n, name, validates:Set}] from "**Property N: name**" (tasks) or "### Property N: name" (design)
function parseProperties(text, style) {
  const props = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const p = style === 'design'
      ? line.match(/^###\s+Property\s+(\d+):\s*(.+?)\s*$/)
      : line.match(/\*\*Property\s+(\d+):\s*(.+?)\*\*/);
    if (p) { cur = { n: Number(p[1]), name: p[2].trim(), validates: new Set() }; props.push(cur); continue; }
    const v = line.match(/\*\*Validates:\s*Requirements?\s+([^*]+)\*\*/);
    if (v && cur) ids(v[1]).forEach((i) => cur.validates.add(i));
  }
  return props;
}

function taskRefs(text) {
  const refs = new Set();
  for (const line of text.split('\n')) {
    if (/_Requirements:/.test(line) || /\*\*Validates:/.test(line)) ids(line).forEach((i) => refs.add(i));
  }
  return refs;
}

const specsDir = join(kiro, 'specs');
const summary = [];
for (const name of readdirSync(specsDir).filter((d) => statSync(join(specsDir, d)).isDirectory())) {
  const dir = join(specsDir, name);
  const files = Object.fromEntries(['requirements', 'design', 'tasks'].map((f) => [f, join(dir, `${f}.md`)]));
  const missing = Object.entries(files).filter(([, p]) => !existsSync(p)).map(([f]) => f);
  if (missing.length) { note(`${name}: missing ${missing.join(', ')}.md`); continue; }
  const reqText = readFileSync(files.requirements, 'utf8');
  const designText = readFileSync(files.design, 'utf8');
  const tasksText = readFileSync(files.tasks, 'utf8');

  const criteria = parseRequirements(reqText);
  if (criteria.size === 0) note(`${name}: no acceptance criteria parsed`);

  const taskIds = taskRefs(tasksText);
  const designProps = parseProperties(designText, 'design');
  const taskProps = parseProperties(tasksText, 'tasks');

  for (const i of taskIds) if (!criteria.has(i)) note(`${name}/tasks.md: unknown requirement ${i}`);
  for (const p of designProps) {
    if (p.validates.size === 0) note(`${name}/design.md: Property ${p.n} has no Validates line`);
    for (const i of p.validates) if (!criteria.has(i)) note(`${name}/design.md: Property ${p.n} validates unknown ${i}`);
  }
  const propCovered = new Set(designProps.flatMap((p) => [...p.validates]));

  // property <-> task matching
  const nums = designProps.map((p) => p.n);
  if (new Set(nums).size !== nums.length) note(`${name}/design.md: duplicate property numbers`);
  nums.forEach((n, i) => { if (n !== i + 1) note(`${name}/design.md: property numbering gap at ${n}`); });
  for (const p of designProps) {
    const t = taskProps.filter((x) => x.n === p.n);
    if (t.length !== 1) { note(`${name}/tasks.md: expected exactly one task for Property ${p.n}, found ${t.length}`); continue; }
    if (t[0].name !== p.name) note(`${name}/tasks.md: Property ${p.n} name differs from design ("${t[0].name}" vs "${p.name}")`);
    const a = [...p.validates].sort().join(','), b = [...t[0].validates].sort().join(',');
    if (a !== b) note(`${name}/tasks.md: Property ${p.n} Validates differ from design (${b} vs ${a})`);
  }
  for (const t of taskProps) if (!nums.includes(t.n)) note(`${name}/tasks.md: task references unknown Property ${t.n}`);

  const uncovered = [...criteria].filter((i) => !taskIds.has(i));
  uncovered.forEach((i) => note(`${name}: criterion ${i} is not referenced by any task`));
  const noProp = [...criteria].filter((i) => !propCovered.has(i));
  if (verbose && noProp.length) console.log(`  ${name}: criteria without a property (fine for UI/ops): ${noProp.join(' ')}`);
  summary.push({ name, criteria: criteria.size, tasks: criteria.size - uncovered.length, props: designProps.length, propCrit: criteria.size - noProp.length });
}

// steering
const steeringDir = join(kiro, 'steering');
for (const f of readdirSync(steeringDir).filter((x) => x.endsWith('.md'))) {
  const t = readFileSync(join(steeringDir, f), 'utf8');
  const fm = t.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) { note(`steering/${f}: missing front matter`); continue; }
  const mode = (fm[1].match(/^inclusion:\s*(\S+)/m) || [])[1];
  if (!['always', 'fileMatch', 'manual'].includes(mode)) note(`steering/${f}: bad inclusion "${mode}"`);
  if (mode === 'fileMatch' && !/^fileMatchPattern:\s*\S+/m.test(fm[1])) note(`steering/${f}: fileMatch needs fileMatchPattern`);
}

// hooks
const hooksDir = join(kiro, 'hooks');
for (const f of readdirSync(hooksDir).filter((x) => x.endsWith('.json'))) {
  try {
    const j = JSON.parse(readFileSync(join(hooksDir, f), 'utf8'));
    if (j.version !== 'v1' || !Array.isArray(j.hooks) || j.hooks.length === 0) note(`hooks/${f}: expected {version:"v1", hooks:[...]}`);
    for (const h of j.hooks || []) {
      if (!h.name || !h.trigger || !h.action) note(`hooks/${f}: hook needs name, trigger, action`);
      else if (h.action.type === 'command' && !h.action.command) note(`hooks/${f}: command action needs command`);
      else if (h.action.type === 'agent' && !h.action.prompt) note(`hooks/${f}: agent action needs prompt`);
      else if (!['command', 'agent'].includes(h.action.type)) note(`hooks/${f}: bad action type`);
      if (h.matcher) { try { new RegExp(h.matcher); } catch { note(`hooks/${f}: invalid matcher regex`); } }
    }
  } catch (e) { note(`hooks/${f}: invalid JSON (${e.message})`); }
}

// mcp
const mcpPath = join(kiro, 'settings', 'mcp.json');
try {
  const j = JSON.parse(readFileSync(mcpPath, 'utf8'));
  for (const [srv, cfg] of Object.entries(j.mcpServers || {})) {
    if (!cfg.command && !cfg.url) note(`mcp.json: ${srv} needs command or url`);
    for (const [k, v] of Object.entries(cfg.env || {})) {
      if (/KEY|TOKEN|SECRET|PASSWORD/i.test(k) && !/^\$\{[A-Z0-9_]+\}$/.test(String(v))) note(`mcp.json: ${srv}.env.${k} must be a \${VAR} reference`);
    }
  }
} catch (e) { note(`mcp.json: ${e.message}`); }

console.log('spec            criteria  in-tasks  properties  criteria-with-property');
for (const s of summary) console.log(`${s.name.padEnd(15)} ${String(s.criteria).padStart(8)}  ${String(s.tasks).padStart(8)}  ${String(s.props).padStart(10)}  ${String(s.propCrit).padStart(10)}`);
if (errors.length) { console.error(`\n${errors.length} problem(s):`); errors.forEach((e) => console.error(` - ${e}`)); process.exit(1); }
console.log('\nOK: specs, steering, hooks and MCP config are consistent.');
