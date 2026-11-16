// A throwaway local Worker that turns one validated request into one Inworld TTS 2 call and returns the MP3 bytes.
// It exists so tools/prerender-voice.mjs can render the Voice Library with the account's Workers AI binding, with no deployed
// route and no secret in a file. It is a spend limit as much as a tool: only the Inworld model, only the cast's voices, only the
// two Steering Tags (or none), at most 240 characters with no markup, and a token the Node tool generates for each run.
// The budget and the "one at a time, no retries" rules live in the Node tool; this Worker only refuses what it should never send.
import { validate } from './logic.mjs';

const MODEL = 'inworld/tts-2';

const json = (status, body) => Response.json(body, { status });

export default {
  async fetch(request, env) {
    if (typeof env.RENDER_TOKEN !== 'string' || env.RENDER_TOKEN.length < 16) return json(500, { error: 'RENDER_TOKEN is not set (16+ characters)' });
    if (request.headers.get('x-render-token') !== env.RENDER_TOKEN) return json(401, { error: 'bad token' });
    if (request.method !== 'POST') return json(405, { error: 'POST only' });

    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'the body is not JSON' }); }
    const v = validate(body);
    if (!v.ok) return json(400, { error: v.error });

    try {
      const out = await env.AI.run(MODEL, v.input);
      const audio = out?.result?.audio ?? out?.audio;
      if (typeof audio !== 'string') return json(502, { error: `unknown response shape: ${JSON.stringify(out).slice(0, 200)}` });
      if (!/^https:\/\//.test(audio)) return new Response(Uint8Array.from(atob(audio), (c) => c.charCodeAt(0)), { headers: { 'content-type': 'audio/mpeg' } });
      // Inworld returns a temporary link: download it at once, here, so the caller never needs it.
      const dl = await fetch(audio);
      if (!dl.ok) return json(502, { error: `the audio link answered ${dl.status}` });
      return new Response(await dl.arrayBuffer(), { headers: { 'content-type': 'audio/mpeg' } });
    } catch (e) {
      return json(502, { error: String(e).slice(0, 300) });
    }
  },
};
