// Loads the project's shared TypeScript (shared/src/) into a plain Node script, so a tool uses the SAME code as the app instead of
// a copy of it. Node (22.18 or newer) strips types by itself; the shared sources import each other without a `.ts` ending, which Node
// does not resolve, so a one-function resolve hook adds it. Nothing is compiled, written or installed. The hook is registered once.
import { register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOOK = `
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); }
  catch (error) {
    if ((specifier.startsWith('.') || specifier.startsWith('/')) && !/\\.[A-Za-z]+$/.test(specifier)) {
      try { return await next(specifier + '.ts', context); } catch { /* try the folder */ }
      try { return await next(specifier + '/index.ts', context); } catch { /* give up */ }
    }
    throw error;
  }
}`;

let registered = false;
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The shared modules a tool needs, by short name. */
export async function loadShared(root = defaultRoot) {
  if (!registered) {
    register(`data:text/javascript,${encodeURIComponent(HOOK)}`, import.meta.url);
    registered = true;
  }
  const at = (path) => import(pathToFileURL(join(root, 'shared', 'src', path)).href);
  try {
    const [gallery, ingest, manifest] = await Promise.all([at('world/gallery.ts'), at('world/ingest.ts'), at('world/manifest.ts')]);
    return { gallery, ingest, manifest };
  } catch (error) {
    throw new Error(`could not load the shared TypeScript (this needs Node 22.18 or newer; this is ${process.version}): ${error.message}`);
  }
}
