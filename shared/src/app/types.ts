/**
 * Data types of the web shell's pure logic (`shared/src/app/`).
 * Types only, plus the literal lists they are derived from. No I/O.
 */
import type { ErrorCode } from "../errors";

export const SCREEN_IDS = [
  "home", "gallery", "create", "confirm", "haunt", "play", "case", "end", "not_found", "expired",
] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

export type Route = { screen: ScreenId; worldId?: string };

export type FlowState = {
  pickedImageId?: string; // set when a Place Image is chosen
  worldId?: string;       // known world (own or Gallery)
  ghostReady: boolean;    // preset or created ghost chosen
  noticeAcked: boolean;
  playEnded: boolean;
};

export type GuardResult = { allow: true } | { allow: false; redirect: Route };

/** Remaining count per meter, as returned by `GET /api/quota` (world-pipeline 5.7). */
export type QuotaSnapshot = { world: number; image: number; llm: number; tts: number; stt: number; live: number };

/** Server switches the shell reads from `GET /api/session`. */
export type ShellFlags = {
  worldGenEnabled: boolean;
  dayCapReached: boolean;
  totalCapReached: boolean;
  /** `VOICE_ENABLED`: the ghost may speak and listen. Off hides the controls; subtitles and typing remain. */
  voiceEnabled: boolean;
  /** `VOICE_LIVE_ENABLED`: live conversation mode exists (a stretch, off by default). */
  liveEnabled: boolean;
  /** `PARTY_ENABLED`: a Party Room may be made, a solo case included. Off hides "Play a case"; Wander stays. */
  partyEnabled: boolean;
};

export type CapabilityReason = "kill_switch" | "day_cap" | "total_cap" | "quota_image" | "quota_world";
export type Capabilities = {
  canDraw: boolean;
  canUpload: boolean;
  canGallery: true;
  reason?: CapabilityReason;
};

/** The `GET /api/session` payload. Only ids and flags; never photos, sketches or captions. */
export type SessionRecord = {
  lastWorldId?: string | undefined;
  lastPlayId?: string | undefined;
  ackNotice: boolean;
  flags: ShellFlags;
};

/** World job states, as in the world-pipeline design. */
export const JOB_STATES = ["queued", "generating", "ingesting", "ready", "failed"] as const;
export type JobState = (typeof JOB_STATES)[number];

/** Labels the visitor sees; mapped from `JobState` by `stageOf`. */
export const STAGES = ["queued", "dreaming", "stitching", "ready", "failed"] as const;
export type Stage = (typeof STAGES)[number];

/** Input of `pollPlan`. Times are epoch milliseconds. `rateLimitedUntil` is null when not rate limited. */
export type PollInput = {
  now: number;
  lastPollAt: number;
  visible: boolean;
  stage: Stage;
  rateLimitedUntil: number | null;
  startedAt: number;
};

// Confirm Gate
export type ConfirmState =
  | { k: "quoting" }
  | { k: "ready"; imageUrl: string; token: string; quota: QuotaSnapshot; needsTurnstile: boolean }
  | { k: "challenge"; token: string }
  | { k: "creating"; token: string }
  | { k: "created"; worldId: string }
  | { k: "rejected"; code: ErrorCode }
  | { k: "cancelled" };

export type ConfirmEvent =
  | { t: "quote_ok"; imageUrl: string; token: string; quota: QuotaSnapshot; needsTurnstile: boolean }
  | { t: "quote_fail"; code: ErrorCode }
  | { t: "turnstile_ok"; turnstile: string }
  | { t: "enter" } | { t: "back" } | { t: "retry" }
  | { t: "create_ok"; worldId: string } | { t: "create_fail"; code: ErrorCode };

export type ConfirmEffect =
  | { e: "quote"; imageId: string }
  | { e: "create"; imageId: string; token: string; turnstile?: string }
  | { e: "navigate"; to: Route };

export type ConfirmStep = { state: ConfirmState; effects: ConfirmEffect[] };

// Play screen
export const VIEWER_RUNGS = ["pano", "thumb"] as const;
export type ViewerRung = (typeof VIEWER_RUNGS)[number];

export type PlayState = {
  mode: "play" | "chat";
  found: number;
  noticeAcked: boolean;
  ended: boolean;
  degraded?: ViewerRung;
};

export type PlayEvent =
  | { t: "ack_notice" } | { t: "open_chat" } | { t: "close_chat" }
  | { t: "exit"; to?: "home" | "gallery" }
  | { t: "view"; found: number; ended: boolean } | { t: "viewer_degraded"; rung: ViewerRung };

export type PlayEffect =
  | { e: "start_viewer" } | { e: "set_input_mode"; mode: "play" | "chat" }
  | { e: "dispose_viewer" } | { e: "navigate"; to: Route };

export type PlayStep = { state: PlayState; effects: PlayEffect[] };

/** What the API said about the Session's last world and play session, used by `resumeTarget`. */
export type ResumeFacts = {
  /** Status of `lastWorldId`, or `missing` if the API no longer knows it. Absent when there is no `lastWorldId`. */
  worldStatus?: JobState | "missing";
  /** `lastPlayId` names a play session that is still alive. */
  playLive: boolean;
};

export type { Bitmap } from "../sketch";
