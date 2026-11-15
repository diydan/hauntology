import type { SessionState } from "@hauntology/shared/session-cookie";

/** Bindings the HTTP layer reads. Names only: values come from the Worker's secrets and vars. */
export type Bindings = {
  /** Signs the Session cookie. At least 16 characters. */
  HMAC_SECRET?: string;
  /** `false`, `0` or `off` is the kill switch for new world creation. Anything else, or unset, is on. */
  WORLD_GEN_ENABLED?: string;
  /** `false`, `0` or `off` stops speech, listening, Stitch and live mode (the ghost-voice spec). Unset is on. */
  VOICE_ENABLED?: string;
  /** `true` or `1` turns live conversation mode on (a stretch). Unset is off. */
  VOICE_LIVE_ENABLED?: string;
  /** `false`, `0` or `off` stops new Party Rooms, a solo case included; Wander stays (party-mode). Unset is on. */
  PARTY_ENABLED?: string;
  /** When set (not empty), Turnstile is configured and its origin is allowed by the page policy. */
  TURNSTILE_SECRET?: string;
  /** How long an upload and a candidate are kept, in hours. Default 24. */
  UPLOAD_TTL_HOURS?: string;
  /** How long a user's world is kept, in days. Default 7. A Gallery world is kept for ever. */
  WORLD_TTL_DAYS?: string;
  /** Extra allowed `Origin` values, comma-separated (development only). */
  ALLOWED_ORIGINS?: string;
};

export type Variables = {
  session: SessionState;
  /** The request came without a valid Session cookie, so this Session is new. */
  sessionFresh: boolean;
  /** A route changed the Session and the cookie must be written. */
  sessionDirty: boolean;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
