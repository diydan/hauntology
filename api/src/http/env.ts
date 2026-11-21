import type { SessionState } from "@hauntology/shared/session-cookie";

/** Bindings the HTTP layer reads. Names only: values come from the Worker's secrets and vars. */
export type Bindings = {
  /** Signs the Session cookie. At least 16 characters. */
  HMAC_SECRET?: string;
  /** `false`, `0` or `off` is the kill switch for new world creation. Anything else, or unset, is on. */
  WORLD_GEN_ENABLED?: string;
  /** `false`, `0` or `off` stops speech, listening, Stitch and live mode (the ghost-voice spec). Unset is on. */
  VOICE_ENABLED?: string;
  /** The speech model (a model is also a price): blank is `inworld/tts-2`, which is the only id accepted; anything else turns the voice off (`voiceModelsFromEnv`). */
  VOICE_TTS_MODEL_ID?: string;
  /** The fallback speech model: blank is `@cf/deepgram/aura-2-en`, which is the only id accepted; anything else turns the voice off. */
  VOICE_TTS_FALLBACK_MODEL_ID?: string;
  /** The transcription model: blank is `@cf/openai/whisper-large-v3-turbo`, the only id accepted (`sttModelFromEnv`). */
  VOICE_STT_MODEL_ID?: string;
  /** `true` or `1` turns live conversation mode on (a stretch). Unset is off. */
  VOICE_LIVE_ENABLED?: string;
  /** `false`, `0` or `off` turns off the Stitch (joined word clips). Unset is on. Read only by the quota flags today. */
  VOICE_STITCH_ENABLED?: string;
  /** `true`, `1` or `on` adds `flags: { voice, stitch, live }` to `GET /api/quota` (ghost-voice 3.2). Unset is off: the answer is then exactly the six counts. */
  VOICE_QUOTA_FLAGS?: string;
  /** `false` turns the real-world conditions (weather, sky, stars) off everywhere. Anything else, or unset, is on (conditions spec). */
  CONDITIONS_ENABLED?: string;
  /** The page origin, read by tests and local runs only. Not a secret. */
  ORIGIN?: string;
  /** `false`, `0` or `off` stops new Party Rooms, a solo case included; Wander stays (party-mode). Unset is on. */
  PARTY_ENABLED?: string;
  /** `false`, `0` or `off` turns off puzzles (Party runs plain Inspect; Wander hides the Locks switch). Unset is on. */
  PUZZLES_ENABLED?: string;
  /** When set (not empty), Turnstile is configured and its origin is allowed by the page policy. */
  TURNSTILE_SECRET?: string;
  /** The Turnstile widget's public site key, sent in the Quote when Turnstile is on. Public; not a secret. */
  TURNSTILE_SITE_KEY?: string;
  /** How long an upload and a candidate are kept, in hours. Default 24. */
  UPLOAD_TTL_HOURS?: string;
  /** How long a user's world is kept, in days. Default 7. A Gallery world is kept for ever. */
  WORLD_TTL_DAYS?: string;
  /** The operator's token (a secret of at least 32 characters). Without a valid one the `/admin` routes do not exist. */
  ADMIN_TOKEN?: string;
  /** Extra allowed `Origin` values, comma-separated (development only). */
  ALLOWED_ORIGINS?: string;
};

export type Variables = {
  session: SessionState;
  /** The request came without a valid Session cookie, so this Session is new. */
  sessionFresh: boolean;
  /** A route changed the Session and the cookie must be written. */
  sessionDirty: boolean;
  /** A route sets this when its response may be cached by anyone (a public asset): no Session cookie is written on it, even for a new Session. */
  sessionNoCookie?: boolean;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
