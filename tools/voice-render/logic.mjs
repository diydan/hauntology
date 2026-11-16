// The validation of tools/voice-render/worker.mjs, in its own file because a Worker module may export only its handler.
// It decides what may be sent to the model: only the cast's voices, only the two Steering Tags (or none), at most 240 characters,
// no markup, and sane numbers.
export const VOICES = ['Pippa', 'Ronald', 'Mark', 'Conrad', 'Arjun', 'Chloe', 'Eleanor', 'Victoria'];
export const TAGS = ['', '[whisper] ', '[speak nervously] '];
export const MAX_TEXT = 240;
const MARKUP = /[[\]<>`*#{}]/;

/** @returns {{ ok: true, input: object } | { ok: false, error: string }} */
export function validate(body) {
  if (body === null || typeof body !== 'object') return { ok: false, error: 'the body must be a JSON object' };
  const { voice_id: voice, tag, text, temperature, speaking_rate: rate } = body;
  if (!VOICES.includes(voice)) return { ok: false, error: 'voice_id is not in the cast' };
  if (!TAGS.includes(tag)) return { ok: false, error: 'tag is not an allowed Steering Tag' };
  if (typeof text !== 'string' || text.trim().length === 0) return { ok: false, error: 'text must be a non-empty string' };
  if (text.length > MAX_TEXT) return { ok: false, error: `text is longer than ${MAX_TEXT} characters` };
  if (MARKUP.test(text)) return { ok: false, error: 'text holds markup or a bracket; the tag goes in "tag"' };
  if (typeof temperature !== 'number' || !(temperature >= 0 && temperature <= 2)) return { ok: false, error: 'temperature must be a number from 0 to 2' };
  if (typeof rate !== 'number' || !(rate >= 0.5 && rate <= 1.5)) return { ok: false, error: 'speaking_rate must be a number from 0.5 to 1.5' };
  return { ok: true, input: { text: tag + text, voice_id: voice, output_format: 'mp3', temperature, timestamp_type: 'none', speaking_rate: rate } };
}

