import { ErrorCode, fail, ok } from "../errors";
import type { Anchor, AnchorId } from "./events";
import type { Atmosphere } from "../conditions/types";
import type { ApiResult, Candidate, GalleryItem, GhostPreset, JournalEntry, PlaceMatch, PlayReply, PlayTurn, PlayView, QuoteResult, ShellApi, WorldStatus } from "./api";
import type { JobState, QuotaSnapshot, SessionRecord, ShellFlags } from "./types";

/**
 * A fake backend for demo mode (`?demo=1`) and for tests. It follows the shell's `ShellApi` and
 * the same rules as the real routes (single-use Confirm Token, quotas, kill switch, ownership,
 * hidden memories), and it never makes a network call.
 *
 * It is deterministic: ids come from a counter, and every call takes `now` (epoch milliseconds)
 * as its first argument, so a world created at time T is `ready` at T plus the stage times.
 * Content here (Gallery list, images, memories, ghost lines) is placeholder fixture content for
 * demos and tests; the real Gallery comes from `GET /api/gallery`.
 */

export type FakeOptions = {
  quota?: Partial<QuotaSnapshot>;
  flags?: Partial<ShellFlags>;
  /** The quote asks for a Turnstile result before it will create. */
  needsTurnstile?: boolean;
  /** Time spent in each world stage. Defaults give a world after 9.5 seconds. */
  stageMs?: { queued: number; generating: number; ingesting: number };
  /** `false`: place search answers `conditions_disabled` and no atmosphere is made (CONDITIONS_ENABLED off). */
  conditionsEnabled?: boolean;
  /** `failed`: a created world fails at the end of `generating`, and the world quota comes back. */
  worldOutcome?: "ready" | "failed";
  ackNotice?: boolean;
};

type ShellMethod = keyof ShellApi;
type Sync<T> = { [K in keyof T]: T[K] extends (...args: infer A) => Promise<infer R> ? (now: number, ...args: A) => R : never };

export type FakeBackend = Sync<ShellApi> & {
  /** The next call of `method` fails with `code`, once. */
  failNext(method: ShellMethod, code: ErrorCode): void;
};

export const GALLERY: readonly GalleryItem[] = [
  { id: "kitchen-at-dusk", title: "A kitchen at dusk", description: "Warm tiles, a kettle still warm, a window going blue.", thumbUrl: "/demo/gallery/kitchen-at-dusk.svg", attribution: "Demo fixture" },
  { id: "seaside-porch", title: "The porch by the sea", description: "Salt on the rail, a chair turned toward the water.", thumbUrl: "/demo/gallery/seaside-porch.svg", attribution: "Demo fixture" },
  { id: "attic-room", title: "The attic room", description: "Dust in one slant of light, boxes with names on them.", thumbUrl: "/demo/gallery/attic-room.svg", attribution: "Demo fixture" },
  { id: "night-platform", title: "A platform at night", description: "A bench, a clock one minute slow, the last train gone.", thumbUrl: "/demo/gallery/night-platform.svg", attribution: "Demo fixture" },
  { id: "greenhouse", title: "The greenhouse", description: "Glass fogged from inside, rows of pots, a watering can left mid-task.", thumbUrl: "/demo/gallery/greenhouse.svg", attribution: "Demo fixture" },
  { id: "library-stairs", title: "Library stairs", description: "A reading lamp left on, spiral stairs, the smell of paper.", thumbUrl: "/demo/gallery/library-stairs.svg", attribution: "Demo fixture" },
];

/** Cloudflare's documented dummy site key, which always passes. The demo uses it; the real key comes from the server. */
export const TURNSTILE_DEMO_SITE_KEY = "1x00000000000000000000AA";

/** Six Preset Ghosts for the demo. The real list is `GET /api/ghosts/presets` (ghost-creator). */
export const GHOST_PRESETS: readonly GhostPreset[] = [
  { id: "preset-maren", name: "Maren", spriteUrl: "/demo/ghosts/preset-maren.svg" },
  { id: "preset-alder", name: "Alder", spriteUrl: "/demo/ghosts/preset-alder.svg" },
  { id: "preset-wick", name: "Wick", spriteUrl: "/demo/ghosts/preset-wick.svg" },
  { id: "preset-ines", name: "Ines", spriteUrl: "/demo/ghosts/preset-ines.svg" },
  { id: "preset-tobias", name: "Tobias", spriteUrl: "/demo/ghosts/preset-tobias.svg" },
  { id: "preset-odile", name: "Odile", spriteUrl: "/demo/ghosts/preset-odile.svg" },
];

/** Three authored anchors, the same in every world. */
export const ANCHORS: readonly Anchor[] = [
  { id: "a1", pos: [3, 0, 0], radius: 2.5 },
  { id: "a2", pos: [-2, 0, 3.5], radius: 2.5 },
  { id: "a3", pos: [-1, 0, -4], radius: 2.5 },
];

/** The three memories: a sound, a person, a promise. Shown only once found. */
export const MEMORIES: Readonly<Record<AnchorId, string>> = {
  a1: "A low hum comes back to you: a kettle, a door, someone humming in the next room. You have heard this before.",
  a2: "Someone stood here once, close enough to share a coat. You never learned their name, only the warmth of it.",
  a3: "A promise was made in this spot: \"I will come back before the light goes.\" The light is going.",
};

const FAR = ["Not here. Somewhere further in.", "The air is still. Try another corner."];
const NEAR = ["Closer. Something here remembers.", "You are on the right side of the room."];
const CLOSE = ["You are almost standing in it.", "Right here. Look again."];
const ECHO = "It remembers that one too. Nothing more to find here.";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const TOKEN_LIFETIME_MS = 30 * 60_000;

type WorldRecord = { id: string; title: string; createdAt: number; outcome: "ready" | "failed"; refunded: boolean; shared: boolean };
type PlayRecord = { id: string; worldId: string; found: AnchorId[]; journal: JournalEntry[]; turns: number; atmosphere: Atmosphere | null; lines: Set<string> };

/** A clip over this many bytes counts as longer than 8 seconds. */
const MAX_CLIP_BYTES = 400_000;

/** A few cities for the demo search. Positions are already rounded to two decimals. */
const CITIES: readonly PlaceMatch[] = [
  { label: "Luxembourg, Luxembourg", lat: 49.61, lon: 6.13, tz: "Europe/Luxembourg" },
  { label: "Lisbon, Portugal", lat: 38.72, lon: -9.14, tz: "Europe/Lisbon" },
  { label: "Lima, Peru", lat: -12.04, lon: -77.03, tz: "America/Lima" },
  { label: "Lille, France", lat: 50.63, lon: 3.06, tz: "Europe/Paris" },
  { label: "Limerick, Ireland", lat: 52.66, lon: -8.63, tz: "Europe/Dublin" },
  { label: "Lyon, France", lat: 45.76, lon: 4.84, tz: "Europe/Paris" },
  { label: "Reykjavik, Iceland", lat: 64.15, lon: -21.94, tz: "Atlantic/Reykjavik" },
  { label: "Kyoto, Japan", lat: 35.01, lon: 135.77, tz: "Asia/Tokyo" },
];

const WEATHER_CYCLE = ["clear", "cloud", "fog", "rain", "snow", "storm"] as const;
const bucketOf = (hour: number): Atmosphere["timeOfDay"] => (hour >= 5 && hour <= 7 ? "dawn" : hour >= 8 && hour <= 17 ? "day" : hour >= 18 && hour <= 20 ? "dusk" : "night");

export function createFakeBackend(options: FakeOptions = {}): FakeBackend {
  const stage = { queued: 1500, generating: 5000, ingesting: 3000, ...options.stageMs };
  const quota: QuotaSnapshot = { world: 2, image: 8, llm: 40, tts: 40, stt: 20, live: 30, ...options.quota };
  const flags: ShellFlags = { worldGenEnabled: true, dayCapReached: false, totalCapReached: false, voiceEnabled: true, liveEnabled: false, partyEnabled: true, ...options.flags };
  let ackNotice = options.ackNotice ?? false;
  let lastWorldId: string | undefined;
  let lastPlayId: string | undefined;

  let counter = 0;
  const nextId = (prefix: string): string => `${prefix}-${++counter}`;
  const images = new Set<string>();
  const tokens = new Map<string, { imageId: string; issuedAt: number; used: boolean }>();
  const worlds = new Map<string, WorldRecord>();
  const plays = new Map<string, PlayRecord>();
  const forced = new Map<ShellMethod, ErrorCode>();

  const guarded = <T>(method: ShellMethod, run: () => ApiResult<T>): ApiResult<T> => {
    const code = forced.get(method);
    if (code !== undefined) {
      forced.delete(method);
      return fail(code);
    }
    return run();
  };

  const statusAt = (w: WorldRecord, now: number): JobState => {
    const t = now - w.createdAt;
    if (t < stage.queued) return "queued";
    if (t < stage.queued + stage.generating) return "generating";
    if (w.outcome === "failed") return "failed";
    if (t < stage.queued + stage.generating + stage.ingesting) return "ingesting";
    return "ready";
  };

  const isGallery = (id: string): boolean => GALLERY.some((g) => g.id === id);
  const readyWorld = (id: string, now: number): boolean => {
    if (isGallery(id)) return true;
    const w = worlds.get(id);
    return w !== undefined && statusAt(w, now) === "ready";
  };

  const viewOf = (p: PlayRecord): PlayView => ({
    found: [...p.found],
    anchors: ANCHORS.map((a) => ({ ...a, pos: [...a.pos] as Anchor["pos"] })),
    hauntLevel: Math.round((0.15 + (0.85 * p.found.length) / 3) * 100) / 100,
    ghostVisible: true,
    ended: p.found.length === 3,
    journal: p.journal.map((j) => ({ ...j })),
    atmosphere: p.atmosphere === null ? null : { ...p.atmosphere },
  });

  const copyQuota = (): QuotaSnapshot => ({ ...quota });

  const backend: FakeBackend = {
    failNext(method, code) {
      forced.set(method, code);
    },

    session(_now) {
      return guarded("session", () => {
        const s: SessionRecord = { ackNotice, flags: { ...flags } };
        if (lastWorldId !== undefined) s.lastWorldId = lastWorldId;
        if (lastPlayId !== undefined) s.lastPlayId = lastPlayId;
        return ok(s);
      });
    },

    ackNotice(_now) {
      return guarded("ackNotice", () => {
        ackNotice = true;
        return ok(null);
      });
    },

    quota(_now) {
      return guarded("quota", () => ok(copyQuota()));
    },

    gallery(_now) {
      return guarded("gallery", () => ok(GALLERY.map((g) => ({ ...g }))));
    },

    uploadPhoto(_now, photo) {
      return guarded("uploadPhoto", () => {
        if (!ACCEPTED_TYPES.includes(photo.type)) return fail(ErrorCode.upload_bad_type);
        if (photo.size > MAX_UPLOAD_BYTES) return fail(ErrorCode.upload_too_large);
        const imageId = nextId("demo-img");
        images.add(imageId);
        return ok({ imageId, imageUrl: `/demo/uploads/${imageId}.svg` });
      });
    },

    sketchRender(_now, _sketch, _caption) {
      return guarded("sketchRender", () => {
        if (quota.image < 2) return fail(ErrorCode.quota_image);
        quota.image -= 2;
        const candidates: Candidate[] = [0, 1].map(() => {
          const imageId = nextId("demo-img");
          images.add(imageId);
          return { imageId, imageUrl: `/demo/candidates/${imageId}.svg` };
        });
        return ok({ candidates, quota: copyQuota() });
      });
    },

    sketchSelect(_now, imageId) {
      return guarded("sketchSelect", () => (images.has(imageId) ? ok({ imageId }) : fail(ErrorCode.upload_rejected)));
    },

    placeBrief(_now, imageId) {
      return guarded("placeBrief", () =>
        images.has(imageId) ? ok({ brief: "A quiet room, lit from one side.", safe: true }) : fail(ErrorCode.upload_rejected),
      );
    },

    quote(now, imageId) {
      return guarded("quote", () => {
        if (!images.has(imageId)) return fail(ErrorCode.upload_rejected);
        const confirmToken = nextId("demo-token");
        tokens.set(confirmToken, { imageId, issuedAt: now, used: false });
        const q: QuoteResult = {
          imageUrl: `/demo/uploads/${imageId}.svg`,
          quota: copyQuota(),
          confirmToken,
          needsTurnstile: options.needsTurnstile ?? false,
          ...(options.needsTurnstile === true ? { turnstileSiteKey: TURNSTILE_DEMO_SITE_KEY } : {}),
        };
        return ok(q);
      });
    },

    createWorld(now, req) {
      return guarded("createWorld", () => {
        const token = tokens.get(req.confirmToken);
        if (token === undefined || token.used || token.imageId !== req.imageId) return fail(ErrorCode.bad_confirm);
        if (now - token.issuedAt > TOKEN_LIFETIME_MS) return fail(ErrorCode.confirm_expired);
        if (options.needsTurnstile === true && (req.turnstile === undefined || req.turnstile === "")) {
          return fail(ErrorCode.turnstile_failed);
        }
        if (!flags.worldGenEnabled) return fail(ErrorCode.world_gen_disabled);
        if (flags.totalCapReached) return fail(ErrorCode.quota_total);
        if (flags.dayCapReached) return fail(ErrorCode.quota_day);
        if (quota.world < 1) return fail(ErrorCode.quota_session);

        token.used = true;
        quota.world -= 1;
        const id = nextId("demo-world");
        worlds.set(id, { id, title: "Your place", createdAt: now, outcome: options.worldOutcome ?? "ready", refunded: false, shared: false });
        lastWorldId = id;
        return ok({ worldId: id, status: "queued" as JobState });
      });
    },

    world(now, worldId) {
      return guarded("world", () => {
        const g = GALLERY.find((x) => x.id === worldId);
        if (g !== undefined) return ok<WorldStatus>({ id: g.id, status: "ready", title: g.title, thumbUrl: g.thumbUrl });
        const w = worlds.get(worldId);
        if (w === undefined) return fail(ErrorCode.world_not_found);
        const status = statusAt(w, now);
        const result: WorldStatus = { id: w.id, status, title: w.title, thumbUrl: `/demo/worlds/${w.id}.svg`, shared: w.shared };
        if (status === "failed") {
          if (!w.refunded) {
            w.refunded = true;
            quota.world += 1;
          }
          result.failure = { code: ErrorCode.upstream_rejected, quotaReturned: true, retryAllowed: false };
        }
        return ok(result);
      });
    },

    deleteWorld(_now, worldId) {
      return guarded("deleteWorld", () => {
        // Gallery worlds are not the visitor's to delete, and a foreign or missing id looks the same.
        if (!worlds.has(worldId)) return fail(ErrorCode.world_not_found);
        worlds.delete(worldId);
        for (const [id, p] of plays) if (p.worldId === worldId) plays.delete(id);
        if (lastWorldId === worldId) lastWorldId = undefined;
        if (lastPlayId !== undefined && !plays.has(lastPlayId)) lastPlayId = undefined;
        return ok(null);
      });
    },

    shareWorld(now, worldId, on) {
      return guarded("shareWorld", () => {
        // As on the server: only the visitor's own, ready place; a Gallery place, a place still being made and a missing one look the same.
        const w = worlds.get(worldId);
        if (w === undefined || statusAt(w, now) !== "ready") return fail(ErrorCode.world_not_found);
        w.shared = on;
        return ok({ shared: on });
      });
    },

    ghostPresets(_now) {
      return guarded("ghostPresets", () => ok(GHOST_PRESETS.map((g) => ({ ...g }))));
    },

    searchPlaces(_now, q) {
      return guarded("searchPlaces", () => {
        if (options.conditionsEnabled === false) return fail(ErrorCode.conditions_disabled);
        const query = q.trim().toLowerCase();
        if (query.length < 2 || query.length > 60) return fail(ErrorCode.bad_place);
        return ok(CITIES.filter((c) => c.label.toLowerCase().includes(query)).slice(0, 5).map((c) => ({ ...c })));
      });
    },

    playStart(now, req) {
      return guarded("playStart", () => {
        if (!readyWorld(req.worldId, now)) return fail(ErrorCode.world_not_found);
        const choice = options.conditionsEnabled === false ? undefined : req.conditions;
        let atmosphere: Atmosphere | null = null;
        if (choice !== undefined) {
          const seed = Math.abs(Math.round((choice.place?.lat ?? 0) * 100) + (choice.memoryDay ? Number(choice.memoryDay.date.slice(0, 4)) : 0));
          atmosphere = {
            timeOfDay: choice.memoryDay?.timeOfDay ?? bucketOf(choice.hostHour),
            weather: choice.place === undefined && choice.memoryDay === undefined ? "clear" : WEATHER_CYCLE[seed % WEATHER_CYCLE.length]!,
            tempBand: "mild", windBand: "calm", moon: "full moon",
          };
        }
        const record: PlayRecord = { id: nextId("demo-play"), worldId: req.worldId, found: [], journal: [], turns: 0, atmosphere, lines: new Set() };
        plays.set(record.id, record);
        lastPlayId = record.id;
        lastWorldId = req.worldId; // the real route calls setLastWorld and setLastPlay
        return ok({ playId: record.id, view: viewOf(record) });
      });
    },

    playTurn(_now, playId, turn: PlayTurn) {
      return guarded("playTurn", () => {
        const p = plays.get(playId);
        if (p === undefined) return fail(ErrorCode.session_not_found);
        if (p.found.length === 3) return fail(ErrorCode.session_ended);
        p.turns += 1;

        const pos = turn.pose.pos;
        const x = Number.isFinite(pos[0]) ? pos[0] : 0;
        const z = Number.isFinite(pos[2]) ? pos[2] : 0;
        const distance = (a: Anchor): number => Math.hypot(x - a.pos[0], z - a.pos[2]);

        const nearest = [...ANCHORS].sort((a, b) => distance(a) - distance(b))[0] as Anchor;
        const unfound = ANCHORS.filter((a) => !p.found.includes(a.id));
        const nearestUnfound = [...unfound].sort((a, b) => distance(a) - distance(b))[0];

        let text: string;
        if (nearestUnfound !== undefined && distance(nearestUnfound) <= nearestUnfound.radius) {
          p.found.push(nearestUnfound.id);
          text = MEMORIES[nearestUnfound.id];
          p.journal.push({ anchorId: nearestUnfound.id, text });
        } else if (p.found.includes(nearest.id) && distance(nearest) <= nearest.radius) {
          text = ECHO;
        } else {
          const d = nearestUnfound === undefined ? Number.POSITIVE_INFINITY : distance(nearestUnfound);
          const lines = d <= 5 ? CLOSE : d <= 8 ? NEAR : FAR;
          text = lines[p.turns % lines.length] as string;
        }
        const reply: PlayReply = { text, scripted: true };
        if (flags.voiceEnabled) {
          const lineId = `line-${p.id}-${p.turns}`;
          p.lines.add(lineId);
          reply.voice = { lineId };
        }
        return ok({ reply, view: viewOf(p) });
      });
    },

    speak(_now, req) {
      return guarded("speak", () => {
        const p = plays.get(req.playId);
        if (p === undefined) return fail(ErrorCode.session_not_found);
        if (!flags.voiceEnabled || !p.lines.has(req.lineId) || quota.tts < 1) return fail(ErrorCode.voice_unavailable);
        quota.tts -= 1;
        return ok({ audio: new Blob([new Uint8Array(32)], { type: "audio/mp4" }) });
      });
    },

    listen(_now, clip) {
      return guarded("listen", () => {
        if (!flags.voiceEnabled || quota.stt < 1) return fail(ErrorCode.voice_unavailable);
        if (clip.size > MAX_CLIP_BYTES) return fail(ErrorCode.clip_too_long);
        if (clip.size === 0) return fail(ErrorCode.clip_not_heard);
        quota.stt -= 1;
        return ok({ transcript: "look" });
      });
    },

    playGet(_now, playId) {
      return guarded("playGet", () => {
        const p = plays.get(playId);
        return p === undefined ? fail(ErrorCode.session_not_found) : ok({ worldId: p.worldId, view: viewOf(p) });
      });
    },
  };

  return backend;
}
