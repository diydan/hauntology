import { buildPersona } from "@hauntology/shared/creator/persona";
import { PRESET_PROFILES } from "@hauntology/shared/creator/presets";
import { buildProfile, type GhostProfile } from "@hauntology/shared/creator/profile";
import { validateSprite } from "@hauntology/shared/creator/sprite";
import { validateTraits, type Traits } from "@hauntology/shared/creator/traits";
import type { ErrorCode } from "@hauntology/shared/errors";
import { cleanZoneName } from "@hauntology/shared/party/pool";
import { SELFIE_EDIT_OPTIONS } from "@hauntology/shared/party/photo-verdict";
import { selfieAllowed, selfieQuality, withTransientSelfie, type SelfieReport } from "@hauntology/shared/party/selfie";
import { toBase64Url } from "@hauntology/shared/session-cookie";
import { decodePng } from "@hauntology/shared/world/sketch-png";
import type { SpendGuard, SpendTicket } from "@hauntology/shared/world/spend";
import { prepareUpload } from "@hauntology/shared/world/upload";
import type { Creator } from "../creator/service";
import type { CreatorStore } from "../creator/store";
import { cutOutForeground, type ForegroundCutter } from "../guarded/workersai/cutout";
import { moderateText, type TextGuard } from "../guarded/workersai/guard";
import { vetPhoto, vetSelfie, type PhotoShrinker, type PhotoVetter } from "../guarded/workersai/photo-vet";
import { editPortrait, type PortraitEditor } from "../guarded/workersai/selfie-edit";

/**
 * The contribution services of a Room (party-mode 5.1 to 5.5): a photo for a frame, a Suspect, a Zone name and an optional
 * selfie ghost. Every paid call is charged to the Room's budget (`RoomBudget`, a `SpendGuard`) through its guarded door,
 * every check fails closed, and every failure ends at a Preset Ghost or a default: **a contribution never stops the lobby**.
 * The Room (its Durable Object) keeps what these return; nothing here holds Room state. No Player text reaches a model except
 * a Suspect detail, which is cleaned, moderated first and placed inside the Ghost Creator's own delimited block.
 */
export type ContributeDeps = Readonly<{
  /** The Room's budget as a `SpendGuard`, with the Room as the scope. */
  budget: SpendGuard;
  scope: string;
  now?: () => number;
  random?: (n: number) => Uint8Array;
}>;

/** The scope a Room has in `SpendGuard`: its code as a session name (letters, digits, `_` and `-` only, as the ledger requires). */
export const roomScope = (code: string): string => `room-${code}`;

/** A refusal: an `ErrorCode` the client knows, or a local reason of this service. `reason` goes after the code (`photo_rejected:person_visible`). */
export type LocalCode = "name_invalid" | "name_unsafe" | "selfie_not_allowed" | "selfie_unusable" | "prompt_skips_used" | "photo_unavailable";
export type Fail = Readonly<{ ok: false; code: ErrorCode | LocalCode; reason?: string }>;
const fail = (code: Fail["code"], reason?: string): Fail => ({ ok: false, code, ...(reason !== undefined ? { reason } : {}) });

const nowOf = (d: ContributeDeps): number => (d.now ?? Date.now)();
const settle = async (budget: SpendGuard, ticket: SpendTicket, how: "commit" | "release"): Promise<void> => {
  try { await budget[how](ticket); } catch { /* the reservation lapses by itself */ }
};
const denied = (meter: "llm" | "image"): Fail => (meter === "llm" ? fail("quota_model") : fail("quota_image"));

// ---------------------------------------------------------------- 5.1 photos
export interface PhotoStore {
  put(photoId: string, bytes: Uint8Array, meta: { contentType: string; room: string; seat: number; promptId?: string }): Promise<void>;
  /** Reads a stored photo back, for the Host's frame (party-mode 8.4); `null` when there is none. Optional so a store that cannot read simply has no frames. */
  get?(room: string, photoId: string): Promise<Readonly<{ bytes: ArrayBuffer; contentType: string }> | null>;
  /** Removes a stored photo; used when the Room ends, so nothing outlives it. */
  deleteRoom(room: string): Promise<void>;
}
export type PhotoDeps = ContributeDeps & Readonly<{ vetter: PhotoVetter | null; shrinker: PhotoShrinker | null; photos: PhotoStore }>;
export type PhotoOk = Readonly<{ ok: true; photoId: string; status: "accepted" }>;

/**
 * A photo for a frame near a Zone. Upload rules of the world pipeline (type, magic bytes, size, metadata stripped), shrunk to
 * 512 px, checked by the vision model (`safe` and `personVisible`, fail closed), stored privately under an opaque id for the Room.
 * A rejection says why (`photo_rejected` with `unsafe` or `person_visible`); a check that cannot be made is `moderation_unavailable`.
 */
export async function intakePhoto(d: PhotoDeps, input: Readonly<{ seat: number; bytes: Uint8Array; declaredType: unknown; promptId?: string }>): Promise<PhotoOk | Fail> {
  const prepared = prepareUpload(input.bytes, input.declaredType);
  if (!prepared.ok) return fail(prepared.code);
  if (d.vetter === null) return fail("moderation_unavailable");
  if (d.shrinker === null) return fail("photo_unavailable");
  const small = await d.shrinker.shrink({ image: prepared.bytes, contentType: prepared.type }).catch(() => ({ ok: false as const }));
  if (!small.ok) return fail("photo_unavailable");

  let reserved;
  try { reserved = await d.budget.reserve({ meter: "llm", sessionId: d.scope, ipHash: "party", now: nowOf(d) }); } catch { return fail("moderation_unavailable"); }
  if (!reserved.ok) return reserved.reason === "killed" ? fail("moderation_unavailable") : denied("llm");
  const answer = await vetPhoto(d.vetter, reserved.ticket, { image: small.image, contentType: small.contentType }).catch((): { ok: false; kind: "failed" } => ({ ok: false, kind: "failed" }));
  await settle(d.budget, reserved.ticket, answer.ok ? "commit" : "release");
  if (!answer.ok || answer.verdict.kind === "unusable") return fail("moderation_unavailable");
  if (answer.verdict.kind === "unsafe") return fail("photo_rejected", "unsafe");
  if (answer.verdict.kind === "person_visible") return fail("photo_rejected", "person_visible");

  const photoId = toBase64Url((d.random ?? ((n) => crypto.getRandomValues(new Uint8Array(n))))(16));
  try {
    await d.photos.put(photoId, small.image, { contentType: small.contentType, room: d.scope, seat: input.seat, ...(input.promptId !== undefined ? { promptId: input.promptId } : {}) });
  } catch {
    return fail("photo_unavailable");
  }
  return { ok: true, photoId, status: "accepted" };
}

// ---------------------------------------------------------------- 5.3 names and details
export type NameDeps = ContributeDeps & Readonly<{ guard: TextGuard | null }>;

/** Free text is checked by Llama Guard 3 on the Room's `llm` meter, and fails closed: no check, no text. */
async function checked(d: NameDeps, text: string): Promise<"safe" | "unsafe" | Fail> {
  if (d.guard === null) return fail("moderation_unavailable");
  let reserved;
  try { reserved = await d.budget.reserve({ meter: "llm", sessionId: d.scope, ipHash: "party", now: nowOf(d) }); } catch { return fail("moderation_unavailable"); }
  if (!reserved.ok) return reserved.reason === "killed" ? fail("moderation_unavailable") : denied("llm");
  const answer = await moderateText(d.guard, reserved.ticket, text).catch((): { ok: false; kind: "failed" } => ({ ok: false, kind: "failed" }));
  await settle(d.budget, reserved.ticket, answer.ok ? "commit" : "release");
  if (!answer.ok || answer.verdict.kind === "unusable") return fail("moderation_unavailable");
  return answer.verdict.kind === "safe" ? "safe" : "unsafe";
}

/** A Zone name: cleaned (3 to 24 characters, no markup), then checked. Never sent to a model unchecked, never used unchecked. */
export async function contributeZoneName(d: NameDeps, raw: unknown): Promise<Readonly<{ ok: true; name: string }> | Fail> {
  const name = typeof raw === "string" ? cleanZoneName(raw) : null;
  if (name === null) return fail("name_invalid");
  const verdict = await checked(d, name);
  if (verdict === "safe") return { ok: true, name };
  return verdict === "unsafe" ? fail("name_unsafe") : verdict;
}

// ---------------------------------------------------------------- 5.2 the Suspect flow
export type SuspectDeps = ContributeDeps & Readonly<{ creator: Creator | null; store: CreatorStore }>;
export type LodgerPick = "lower" | "lighter";
export const lodgerVoiceFromPick = (pick: LodgerPick | undefined): NonNullable<GhostProfile["lodgerVoice"]> => (pick === "lighter" ? "chloe" : "mark");

/** The key a seat's ghost is stored under: the Room and the seat, so it goes when the Room goes. */
export const ghostKey = (scope: string, seat: number): string => `${scope}-${seat}`;
/** The Preset a seat falls back to: the same seat always gets the same Preset, and two seats never share one while there are six. */
export const presetFor = (seat: number): GhostProfile => PRESET_PROFILES[(((seat - 1) % PRESET_PROFILES.length) + PRESET_PROFILES.length) % PRESET_PROFILES.length] as GhostProfile;
export type FellBack = Readonly<{ ok: true; fallback: true; profile: GhostProfile; reason: string }>;
const fellBack = (seat: number, reason: string): FellBack => ({ ok: true, fallback: true, profile: presetFor(seat), reason });

export type SuspectPortraits = Readonly<{ ok: true; fallback: false; candidates: readonly { candidateId: string; imageUrl: string }[] }>;
/** Step one: the traits (and a checked detail) become portrait candidates, charged to the Room. Any failure is a Preset for the seat, with the reason. */
export async function suspectPortraits(d: SuspectDeps & Readonly<{ guard: TextGuard | null }>, seat: number, traitsInput: unknown): Promise<SuspectPortraits | FellBack> {
  if (d.creator === null) return fellBack(seat, "creator_unavailable");
  const valid = validateTraits(traitsInput);
  if (!valid.ok) return fellBack(seat, "trait_invalid");
  const r = await d.creator.portraits({ traits: valid.traits, worldId: ghostKey(d.scope, seat) }, ghostKey(d.scope, seat), "party").catch(() => null);
  if (r === null || !r.ok) return fellBack(seat, r === null ? "portrait_failed" : r.code);
  return { ok: true, fallback: false, candidates: r.candidates };
}

export type SuspectMade = Readonly<{ ok: true; fallback: boolean; profile: GhostProfile; reason?: string }>;
/**
 * Step two: the chosen candidate becomes a Sprite (cut out, checked) and the Ghost Profile, with the Lodger Voice the Player
 * picked (Mark when nothing is picked). A refused cut-out or any failure is a Preset for the seat.
 */
export async function suspectSprite(d: SuspectDeps, seat: number, candidateId: string, pick?: LodgerPick): Promise<SuspectMade> {
  if (d.creator === null) return fellBack(seat, "creator_unavailable");
  const key = ghostKey(d.scope, seat);
  const r = await d.creator.sprite({ candidateId, worldId: key }, ghostKey(d.scope, seat), "party").catch(() => null);
  if (r === null || !r.ok) return fellBack(seat, r === null ? "sprite_failed" : r.code);
  if (r.fallback) return fellBack(seat, "sprite_invalid");
  const profile: GhostProfile = { ...r.profile, lodgerVoice: lodgerVoiceFromPick(pick) };
  await d.store.saveProfile(key, profile).catch(() => undefined);
  return { ok: true, fallback: false, profile };
}

// ---------------------------------------------------------------- 5.5 the selfie ghost
export type SelfieDeps = ContributeDeps & Readonly<{
  vetter: PhotoVetter | null; editor: PortraitEditor | null; cutter: ForegroundCutter | null; store: CreatorStore;
  /** An approved narrator portrait used as the style reference, or `null` when there is none. */
  styleRef: () => Promise<Readonly<{ bytes: Uint8Array; contentType: string }> | null>;
  /** Where the transient selfie holder is kept for the zeroing check in tests. */
  holder?: { ref: Uint8Array | null; clearCount: number };
}>;
export const SELFIE_SPRITE_MAX_HEIGHT = 768;
export const SELFIE_SPRITE_MAX_BYTES = 1024 * 1024;

/**
 * An optional selfie ghost. In order: the Master's switch and the seat's yes (`selfieAllowed`), the browser's own quality
 * report (`selfieQuality`), the vision model's safety verdict (one face, in frame, safe, fail closed), then, with the selfie held
 * only inside `withTransientSelfie`, one image edit with the fixed prompt, a cut-out with the 8% to 85% alpha rule and one retry.
 * Each edit takes one image unit from the Room. Any failure gives a Preset, with no error screen and no block on starting. The
 * selfie is written to no storage, log, event or prompt, and is zeroed when the call ends.
 */
export async function contributeSelfie(d: SelfieDeps, input: Readonly<{ seat: number; settings: { selfies: boolean }; player: { selfieYes: boolean; selfieMade: boolean }; bytes: Uint8Array; declaredType: unknown; report: SelfieReport; traits: unknown; pick?: LodgerPick }>): Promise<SuspectMade | Fail> {
  if (!selfieAllowed(input.settings, input.player)) { input.bytes.fill(0); return fail("selfie_not_allowed"); }
  const q = selfieQuality(input.report);
  if (!q.ok) { input.bytes.fill(0); return fail("selfie_unusable", q.reason); }
  const prepared = prepareUpload(input.bytes, input.declaredType);
  if (!prepared.ok) { input.bytes.fill(0); return fail("selfie_unusable", "format"); }
  const traits = validateTraits(input.traits);
  if (!traits.ok || d.vetter === null || d.editor === null || d.cutter === null) { input.bytes.fill(0); return fellBack(input.seat, !traits.ok ? "trait_invalid" : "selfie_unavailable"); }
  const { vetter, editor, cutter } = d;
  const key = ghostKey(d.scope, input.seat);

  const made = await withTransientSelfie(prepared.bytes, async (selfie) => {
    input.bytes.fill(0);
    // the vision safety verdict, fail closed
    let reserved;
    try { reserved = await d.budget.reserve({ meter: "llm", sessionId: d.scope, ipHash: "party", now: nowOf(d) }); } catch { return fellBack(input.seat, "moderation_unavailable"); }
    if (!reserved.ok) return fellBack(input.seat, "quota_model");
    const verdict = await vetSelfie(vetter, reserved.ticket, { image: selfie, contentType: prepared.type }).catch((): { ok: false; kind: "failed" } => ({ ok: false, kind: "failed" }));
    await settle(d.budget, reserved.ticket, verdict.ok ? "commit" : "release");
    if (!verdict.ok || verdict.verdict.kind !== "ok") return fellBack(input.seat, verdict.ok ? `selfie_${verdict.verdict.kind}` : "moderation_unavailable");
    const style = await d.styleRef().catch(() => null);
    if (style === null) return fellBack(input.seat, "selfie_unavailable");

    // one edit, one cut-out, one retry
    for (let attempt = 0; attempt < 2; attempt++) {
      let image;
      try { image = await d.budget.reserve({ meter: "image", sessionId: d.scope, ipHash: "party", now: nowOf(d) }); } catch { return fellBack(input.seat, "quota_image"); }
      if (!image.ok) return fellBack(input.seat, "quota_image");
      const edit = await editPortrait(editor, image.ticket, { selfie, selfieType: prepared.type, styleRef: style.bytes, styleType: style.contentType }).catch((): { ok: false; kind: "failed" } => ({ ok: false, kind: "failed" }));
      if (!edit.ok) { await settle(d.budget, image.ticket, "release"); continue; }
      const png = await cutAndCheck(cutter, image.ticket, edit.image);
      await settle(d.budget, image.ticket, png === null ? "release" : "commit");
      if (png !== null) return { png };
    }
    return fellBack(input.seat, "sprite_invalid");
  }, d.holder).catch(() => fellBack(input.seat, "selfie_failed"));

  if (!("png" in made)) return made;
  const persona = buildPersona(traits.traits, "");
  const profile: GhostProfile = { ...buildProfile({ traits: traits.traits as Traits, spriteUrl: `/api/ghosts/sprite/${encodeURIComponent(key)}`, persona }), lodgerVoice: lodgerVoiceFromPick(input.pick) };
  try { await d.store.saveGhost(key, profile, made.png); } catch { return fellBack(input.seat, "selfie_failed"); }
  return { ok: true, fallback: false, profile };
}

async function cutAndCheck(cutter: ForegroundCutter, ticket: SpendTicket, image: Uint8Array): Promise<Uint8Array | null> {
  const cut = await cutOutForeground(cutter, ticket, { image, contentType: "image/png", maxHeight: SELFIE_SPRITE_MAX_HEIGHT }).catch(() => ({ ok: false as const, kind: "failed" as const }));
  if (!cut.ok || cut.image.byteLength === 0 || cut.image.byteLength > SELFIE_SPRITE_MAX_BYTES) return null;
  const decoded = await decodePng(cut.image);
  if (!decoded.ok) return null;
  const { width, height, data } = decoded.bitmap;
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) alpha[i] = data[i * 4 + 3] ?? 0;
  return validateSprite({ width, height, alpha }) ? cut.image : null;
}
