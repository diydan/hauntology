#!/usr/bin/env node
// World-pipeline Spike 1.3, arm C ("dark first"): one dark version of a photo. The world from it is a separate step (spike.mjs --image <the dark picture>, draft model, 230 credits).
//
//   node tools/worldlabs-spike/dark-first.mjs --photo p1.jpg                    # DRY RUN: strips the metadata into .dark-first/stripped/, prints the plan, sends nothing
//   DARK_FIRST_TOKEN=... node tools/worldlabs-spike/dark-first.mjs --photo p1.jpg --yes-spend [--worker http://127.0.0.1:8803]
//
// The edit is made by a LOCAL Worker (api/wrangler.darkedit.jsonc: Workers AI `google/nano-banana-2` through the AI Gateway, from prepaid credits). Start it with the command in that
// file, only after the owner's go. The product config api/wrangler.jsonc keeps no `AI` binding. The Worker's image meter is capped at 3 (one edit for each of the 3 photos), and so is this
// script's own count (.dark-first/count.json), so a fourth edit is refused twice. About 3 cents an edit (an estimate; the first call is what measures it).
// Privacy: the photo is stripped of EXIF/GPS/XMP first with the app's own `prepareUpload`, and only the stripped copy is sent, only to a loopback address. Everything this writes goes in
// .dark-first/ (git-ignored): never commit a personal photo or its edit.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { darkFirst, MAX_IMAGES } from '../lib/dark-first.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const photo = value('--photo');
if (!photo) { console.error('dark-first: --photo FILE is required'); process.exit(2); }
const outDir = resolve(root, value('--out') ?? '.dark-first');
const countFile = `${outDir}/count.json`;

const io = {
  read: (path) => readFile(resolve(path)),
  write: async (path, bytes) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); },
  fetch: (url, init) => fetch(url, init),
  count: async () => { try { return JSON.parse(await readFile(countFile, 'utf8')).images ?? 0; } catch { return 0; } },
  bump: async () => { const n = await io.count(); await io.write(countFile, JSON.stringify({ images: n + 1 })); },
};

try {
  const r = await darkFirst({
    photo, name: basename(photo), outDir,
    worker: value('--worker') ?? 'http://127.0.0.1:8803',
    token: process.env.DARK_FIRST_TOKEN,
    spend: flag('--yes-spend'),
    max: value('--max-images') === undefined ? MAX_IMAGES : Number(value('--max-images')),
  }, io);
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exitCode = 3;
  else if (!r.sent) console.log('dry run: nothing sent. The metadata is stripped; the copy to be sent is the one named above.');
} catch (e) {
  console.error(`dark-first: ${e.message}`);
  process.exitCode = 1;
}
