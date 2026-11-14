import type { ErrorCode, Fail, Ok } from "../errors";
import type { Atmosphere, ConditionsChoice } from "../conditions/types";
import type { Anchor, AnchorId, Vec3 } from "./events";
import type { JobState, QuotaSnapshot, SessionRecord } from "./types";

/**
 * The shell's view of the API: the routes it calls, with typed results. The real client
 * (`web/src/app/ApiClient.ts`) and the demo client (`FakeApi.ts`) both implement `ShellApi`, so a
 * screen cannot tell them apart. Every call returns an `ApiResult`; none throws.
 *
 * Image and asset URLs are paths on the app's own origin, never an upstream host.
 */

/** A failure, with the advised wait in seconds when the server sent `Retry-After` (a 429). */
export type ApiFail = Fail & { retryAfterSec?: number };
export type ApiResult<T> = Ok<T> | ApiFail;

export type GalleryItem = {
  id: string;
  title: string;
  description: string;
  thumbUrl: string;
  attribution: string;
};

export type Candidate = { imageId: string; imageUrl: string };

export type QuoteResult = {
  /** The exact image the visitor is about to spend on. */
  imageUrl: string;
  quota: QuotaSnapshot;
  confirmToken: string;
  needsTurnstile: boolean;
};

export type WorldStatus = {
  id: string;
  status: JobState;
  title?: string | undefined;
  thumbUrl?: string | undefined;
  /** Present when `status` is `failed`. */
  failure?: { code: ErrorCode; quotaReturned: boolean; retryAllowed: boolean } | undefined;
};

export type JournalEntry = { anchorId: AnchorId; text: string };

/** What the client may know about a play session. Never a hidden seed or an unfound memory's text. */
export type PlayView = {
  found: AnchorId[];
  anchors: Anchor[];
  hauntLevel: number;
  ghostVisible: boolean;
  ended: boolean;
  journal: JournalEntry[];
  /** The frozen conditions of the place for this game, or null for the normal look. */
  atmosphere: Atmosphere | null;
};

/** One city-search match: the position is already rounded to two decimals. */
export type PlaceMatch = { label: string; lat: number; lon: number; tz: string | null };

export type PlayTurn = {
  input: { text: string } | { button: string };
  pose: { pos: Vec3; yaw: number };
};

/** `voice` names the line the server holds for speech (`speak`); absent when voice is off. */
export type PlayReply = { text: string; scripted: boolean; voice?: { lineId: string } | undefined };

export interface ShellApi {
  session(): Promise<ApiResult<SessionRecord>>;
  ackNotice(): Promise<ApiResult<null>>;
  quota(): Promise<ApiResult<QuotaSnapshot>>;
  gallery(): Promise<ApiResult<GalleryItem[]>>;

  uploadPhoto(photo: Blob): Promise<ApiResult<{ imageId: string; imageUrl: string }>>;
  sketchRender(sketch: Blob, caption: string): Promise<ApiResult<{ candidates: Candidate[]; quota: QuotaSnapshot }>>;
  sketchSelect(imageId: string): Promise<ApiResult<{ imageId: string }>>;
  placeBrief(imageId: string): Promise<ApiResult<{ brief: string; safe: boolean }>>;

  quote(imageId: string): Promise<ApiResult<QuoteResult>>;
  createWorld(req: { imageId: string; confirmToken: string; turnstile?: string }): Promise<ApiResult<{ worldId: string; status: JobState }>>;
  world(worldId: string): Promise<ApiResult<WorldStatus>>;
  deleteWorld(worldId: string): Promise<ApiResult<null>>;

  searchPlaces(q: string): Promise<ApiResult<PlaceMatch[]>>;
  /** The audio of a line the server holds. A refusal is `voice_unavailable` and the client falls back quietly to the subtitle. */
  speak(req: { playId: string; lineId: string }): Promise<ApiResult<{ audio: Blob }>>;
  /** A held-button clip (at most 8 seconds). The audio is dropped on the server; only the transcript comes back. */
  listen(clip: Blob): Promise<ApiResult<{ transcript: string }>>;
  /** `conditions` is the visitor's choice from the Set the sky card; the snapshot is frozen once, here. */
  playStart(req: { worldId: string; ghostPreset?: string; conditions?: ConditionsChoice }): Promise<ApiResult<{ playId: string; view: PlayView }>>;
  playTurn(playId: string, turn: PlayTurn): Promise<ApiResult<{ reply: PlayReply; view: PlayView }>>;
  playGet(playId: string): Promise<ApiResult<{ worldId: string; view: PlayView }>>;
}
