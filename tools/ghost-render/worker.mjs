// A throwaway local Worker for the ghost-creator checkpoint: one validated request becomes one
// FLUX.2 text-to-image call, one Llama Guard check, or one Images foreground cut. It is a spend
// limit as much as a tool: only those models and shapes, a per-run token, bounded sizes. The
// budget and one-at-a-time rules live in tools/ghost-checkpoint.mjs. Nothing is logged here.

const IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";
const GUARD_MODEL = "@cf/meta/llama-guard-3-8b";
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

const json = (status, body) => Response.json(body, { status });
const isIntIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

function fromBase64(text) {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_IMAGE_BYTES * 1.4) return null;
  const clean = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  try {
    return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}
const toBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
};

export default {
  async fetch(request, env) {
    if (typeof env.RENDER_TOKEN !== "string" || env.RENDER_TOKEN.length < 16) return json(500, { error: "RENDER_TOKEN is not set (16+ characters)" });
    if (request.headers.get("x-render-token") !== env.RENDER_TOKEN) return json(401, { error: "bad token" });
    if (request.method !== "POST") return json(405, { error: "POST only" });
    let body;
    try { body = await request.json(); } catch { return json(400, { error: "the body is not JSON" }); }
    const path = new URL(request.url).pathname;

    try {
      if (path === "/portrait") {
        const { prompt, negativePrompt, seed, width, height } = body ?? {};
        if (typeof prompt !== "string" || prompt.length === 0 || prompt.length > 900) return json(400, { error: "prompt must be 1..900 characters" });
        if (typeof negativePrompt !== "string" || negativePrompt.length > 300) return json(400, { error: "negativePrompt must be a string of at most 300 characters" });
        if (!isIntIn(seed, 0, 2_147_483_646) || !isIntIn(width, 64, 2048) || !isIntIn(height, 64, 2048)) return json(400, { error: "seed/width/height out of bounds" });
        const form = new FormData();
        form.append("prompt", prompt);
        form.append("negative_prompt", negativePrompt);
        form.append("width", String(width));
        form.append("height", String(height));
        form.append("seed", String(seed));
        const serialized = new Response(form);
        const out = await env.AI.run(IMAGE_MODEL, { multipart: { body: serialized.body, contentType: serialized.headers.get("content-type") } });
        const image = typeof out?.image === "string" ? fromBase64(out.image) : null;
        if (image === null) return json(502, { error: "the image answer held no picture" });
        return json(200, { imageB64: toBase64(image) });
      }

      if (path === "/moderate") {
        const { text } = body ?? {};
        if (typeof text !== "string" || text.trim() === "" || text.length > 140) return json(400, { error: "text must be 1..140 characters" });
        const out = await env.AI.run(GUARD_MODEL, { messages: [{ role: "user", content: text }] });
        return json(200, { answer: out });
      }

      if (path === "/cut") {
        const { imageB64, contentType, maxHeight } = body ?? {};
        const image = fromBase64(imageB64);
        if (image === null || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) return json(400, { error: "imageB64/contentType not accepted" });
        if (!isIntIn(maxHeight, 64, 2048)) return json(400, { error: "maxHeight out of bounds" });
        let handle = env.IMAGES.input(new Response(image).body);
        handle = handle.transform({ height: maxHeight, fit: "scale-down" });
        const out = await handle.transform({ segment: "foreground" }).output({ format: "image/png" });
        const bytes = new Uint8Array(await out.response().arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return json(502, { error: "the cut-out came back empty or huge" });
        return json(200, { imageB64: toBase64(bytes) });
      }

      return json(404, { error: "no such door" });
    } catch (e) {
      return json(502, { error: String(e).slice(0, 300) });
    }
  },
};
