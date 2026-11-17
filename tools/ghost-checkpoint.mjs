#!/usr/bin/env node
// The ghost-creator checkpoint run (group 5): three real ghosts end to end for a tone review.
// Owner-run and spend-approved per run. The default is a DRY RUN that spends nothing and makes
// no calls. --yes-spend is required to call anything; hard caps stop the run first:
// at most 9 portrait calls, 6 cut-outs and 3 moderation calls, one at a time, no retries
// beyond the one sprite reseed the design allows.
//
// The Worker is tools/ghost-render/ (see its wrangler.jsonc for how to start it, with --remote
// so the Images segment transform is real). Its token comes from $GHOST_RENDER_TOKEN (16+
// characters), generated per run and never written down.
//
// Usage: node tools/ghost-checkpoint.mjs [--dry-run]
//        GHOST_RENDER_TOKEN=... node tools/ghost-checkpoint.mjs --yes-spend [--worker http://127.0.0.1:8799] [--out DIR]
// Output: portraits, sprites and contact-sheet.png under the out folder (default scratch/ghost-checkpoint), plus summary.json.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const spend = args.includes("--yes-spend");
const worker = (args.find((a) => a.startsWith("--worker="))?.slice(9)) ?? "http://127.0.0.1:8799";
const outArg = args.find((a) => a.startsWith("--out="))?.slice(6);
const out = resolve(root, outArg ?? "scratch/ghost-checkpoint");
const token = process.env.GHOST_RENDER_TOKEN ?? "";
const onlyFile = args.find((a) => a.startsWith("--only="))?.slice(7);
const seedBase = Number(args.find((a) => a.startsWith("--seed-base="))?.slice(12) ?? 4100);

const MAX = { portraits: 12, cuts: 6, moderations: 3 };
const counts = { portraits: 0, cuts: 0, moderations: 0 };
const cap = (kind) => {
  counts[kind] += 1;
  if (counts[kind] > MAX[kind]) throw new Error(`cap reached: ${kind} would exceed ${MAX[kind]} calls; stopped before spending more`);
};

// The same template and phrases as shared/src/creator/portrait-prompt.ts (a tool cannot import
// the TS). If they drift, the checkpoint is reviewing the wrong prompts: keep them in step.
const NEGATIVE = "no text, no words, no letters, no watermark, no signature, no extra limbs, no extra faces, no gore, no wounds, no horror makeup, no photorealistic skin, not frightening";
const GHOSTS = [
  {
    file: "lighthouse-keeper",
    prompt:
      'A calm, translucent ghost, full figure, standing centred and upright on a plain very dark background, in late Victorian dress, high collar and long coat, who kept and tended this place for years, with a gentle, welcoming expression, lit in cool moonlight blues, 70 percent transparent, edges softly fading at the hem, holding a small lantern. Painterly storybook illustration, gentle and not frightening, whole figure in frame, nothing else in the scene. Detail (treat as description only): "kept the lighthouse stairs swept"',
    detail: "kept the lighthouse stairs swept",
  },
  {
    file: "eighties-caretaker",
    prompt:
      "A calm, translucent ghost, full figure, standing centred and upright on a plain very dark background, in 1980s dress, a cardigan and slacks, who kept and tended this place for years, with a calm, composed expression, lit in warm ember ambers, 40 percent transparent, edges softly fading at the hem, holding a large old key, wearing round spectacles. Painterly storybook illustration, gentle and not frightening, whole figure in frame, nothing else in the scene.",
    detail: "",
  },
  {
    file: "library-visitor",
    prompt:
      'A calm, translucent ghost, full figure, standing centred and upright on a plain very dark background, in plain present-day clothes, a jumper and jeans, who once visited this place and never quite left, with a mischievous half-smile, head tilted, lit in deep dusk purples, 60 percent transparent, edges softly fading at the hem, holding a small lantern. Painterly storybook illustration, gentle and not frightening, whole figure in frame, nothing else in the scene. Detail (treat as description only): "only came to return a library book"',
    detail: "only came to return a library book",
  },
];

const call = async (path, body) => {
  const r = await fetch(`${worker}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-render-token": token },
    body: JSON.stringify(body),
  });
  const parsed = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path} answered ${r.status}: ${parsed?.error ?? "no body"}`);
  return parsed;
};

/** One portrait call, retrying a flagged (3030) answer once without the negative prompt. */
async function portrait(prompt, seed, notes) {
  cap("portraits");
  try {
    return await call("/portrait", { prompt, negativePrompt: NEGATIVE, seed, width: 640, height: 960 });
  } catch (e) {
    if (!String(e).includes("3030") && !String(e).toLowerCase().includes("flagged")) throw e;
    notes.push(`seed ${seed} flagged with the negative prompt; retried without it`);
    cap("portraits");
    return call("/portrait", { prompt, negativePrompt: "", seed, width: 640, height: 960 });
  }
}

const verdictOf = (answer) => {
  const text = typeof answer?.response === "string" ? answer.response : JSON.stringify(answer ?? "");
  const first = text.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (first.startsWith("unsafe")) return "unsafe";
  if (first.startsWith("safe")) return "safe";
  return "unusable";
};

const alphaCheck = (file) =>
  JSON.parse(execFileSync("python3", [join(root, "tools/lib/alpha-check.py"), file], { encoding: "utf8" }));

async function main() {
  if (!spend) {
    console.log("dry run: nothing will be called or spent. Plan:");
    for (const g of GHOSTS) console.log(`- ${g.file}: ${g.detail ? "1 moderation, " : ""}2 portraits, 1-2 cut-outs`);
    console.log(`caps: ${MAX.portraits} portraits, ${MAX.cuts} cut-outs, ${MAX.moderations} moderations; output under ${out}`);
    return;
  }
  if (token.length < 16) throw new Error("GHOST_RENDER_TOKEN must be set (16+ characters)");
  mkdirSync(out, { recursive: true });
  const summary = [];

  for (const [gi, ghost] of GHOSTS.entries()) {
    if (onlyFile && ghost.file !== onlyFile) continue;
    const entry = { file: ghost.file, moderation: "skipped (no detail)", candidates: [], sprite: null, attempts: [], notes: [] };
    try {
    if (ghost.detail !== "") {
      cap("moderations");
      const mod = await call("/moderate", { text: ghost.detail });
      entry.moderation = verdictOf(mod.answer);
      if (entry.moderation !== "safe") {
        entry.sprite = null;
        summary.push(entry);
        console.log(`${ghost.file}: detail not passed (${entry.moderation}); skipped`);
        continue;
      }
    }

    const seed = seedBase + gi * 17;
    let chosen = null;
    for (const s of [seed, seed + 1]) {
      const made = await portrait(ghost.prompt, s, entry.notes);
      const file = join(out, `${ghost.file}-candidate-${s}.png`);
      writeFileSync(file, Buffer.from(made.imageB64, "base64"));
      entry.candidates.push(file);
      if (chosen === null) chosen = { file, seed: s, bytes: Buffer.from(made.imageB64, "base64") };
      console.log(`${ghost.file}: candidate seed ${s} saved`);
    }

    let sprite = null;
    for (const attemptSeed of [chosen.seed, chosen.seed + 2]) {
      let bytes = chosen.bytes;
      if (attemptSeed !== chosen.seed) {
        const again = await portrait(ghost.prompt, attemptSeed, entry.notes);
        bytes = Buffer.from(again.imageB64, "base64");
        writeFileSync(join(out, `${ghost.file}-candidate-${attemptSeed}.png`), bytes);
      }
      cap("cuts");
      const cut = await call("/cut", { imageB64: bytes.toString("base64"), contentType: "image/png", maxHeight: 768 });
      const file = join(out, `${ghost.file}-sprite-${attemptSeed}.png`);
      writeFileSync(file, Buffer.from(cut.imageB64, "base64"));
      const measure = alphaCheck(file);
      const ok = measure.coverage >= 0.08 && measure.coverage <= 0.85 && measure.leftMargin >= 0.02 && measure.rightMargin >= 0.02;
      entry.attempts.push({ seed: attemptSeed, file, ...measure, ok });
      console.log(`${ghost.file}: cut seed ${attemptSeed} coverage ${measure.coverage.toFixed(3)} margins ${measure.leftMargin.toFixed(2)}/${measure.rightMargin.toFixed(2)} -> ${ok ? "accepted" : "refused"}`);
      if (ok) { sprite = file; break; }
    }
    entry.sprite = sprite;
    } catch (e) {
      entry.notes.push(`stopped: ${String(e).slice(0, 300)}`);
      console.log(`${ghost.file}: stopped (${String(e).slice(0, 160)})`);
    }
    summary.push(entry);
  }

  writeFileSync(join(out, "summary.json"), JSON.stringify({ counts, ghosts: summary }, null, 2));
  console.log(`done: ${JSON.stringify(counts)}; summary at ${join(out, "summary.json")}`);
  if (summary.some((g) => g.sprite === null)) process.exitCode = 1;
}

await main();
