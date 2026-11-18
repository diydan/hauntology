import { buildPersona } from "@hauntology/shared/creator/persona";
import { buildPortraitPrompt } from "@hauntology/shared/creator/portrait-prompt";
import { PRESET_PROFILES, presetById } from "@hauntology/shared/creator/presets";
import { buildProfile, type GhostProfile } from "@hauntology/shared/creator/profile";
import { sanitizeDetail } from "@hauntology/shared/creator/sanitize";
import { validateSprite } from "@hauntology/shared/creator/sprite";
import { validateTraits, type Traits } from "@hauntology/shared/creator/traits";
import { toBase64Url } from "@hauntology/shared/session-cookie";
import { decodePng } from "@hauntology/shared/world/sketch-png";
import type { SpendGuard, SpendTicket } from "@hauntology/shared/world/spend";
import { prepareUpload, sniffType } from "@hauntology/shared/world/upload";
import { cutOutForeground, type ForegroundCutter } from "../guarded/workersai/cutout";
import { moderateText, type TextGuard } from "../guarded/workersai/guard";
import { renderPortrait, type PortraitMaker } from "../guarded/workersai/image";
import type { CreatorStore } from "./store";

/**
 * The Creator flow (ghost-creator task 3): validate, sanitise, moderate, generate, cut out,
 * validate, store — every paid call through its guarded door with a Ticket, and every failure
 * ending at a Preset Ghost or a field error, never a dead end (Property 7). Error codes are
 * the design's: `trait_invalid` (with fields), `detail_unsafe`, `moderation_unavailable`,
 * `quota_image`, `portrait_failed`, `sprite_invalid` (answered with a preset, marked fallback).
 */
export type CreatorDeps = {
  guard?: SpendGuard;
  portraitist?: PortraitMaker;
  moderator?: TextGuard;
  cutter?: ForegroundCutter;
  store: CreatorStore;
  /** The world's Place Brief, for the Persona. */
  briefFor: (worldId: string) => Promise<string>;
  now?: () => number;
  random?: (n: number) => Uint8Array;
};

export type CreatorFail = {
  ok: false;
  code: "trait_invalid" | "detail_unsafe" | "moderation_unavailable" | "quota_image" | "portrait_failed" | "candidate_missing" | "creator_unavailable";
  fields?: string[];
  quota?: unknown;
};
export type PortraitsResult = { ok: true; candidates: { candidateId: string; imageUrl: string }[]; quota: unknown } | CreatorFail;
export type SpriteResult = { ok: true; profile: GhostProfile; fallback: boolean } | CreatorFail;

export const PORTRAIT_WIDTH = 640;
export const PORTRAIT_HEIGHT = 960;
export const SPRITE_MAX_BYTES = 1024 * 1024;
export const SPRITE_MAX_HEIGHT = 768;

export function createCreator(deps: CreatorDeps) {
  const now = deps.now ?? Date.now;
  const random = deps.random ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n)));
  const newSeed = (): number => {
    const b = random(8);
    return 1 + ((((b[0] as number) << 24) | ((b[1] as number) << 16) | ((b[2] as number) << 8) | (b[3] as number)) >>> 1) % 2_147_483_646;
  };
  const settle = async (ticket: SpendTicket, how: "commit" | "release"): Promise<void> => {
    try { await deps.guard?.[how](ticket); } catch { /* the reservation lapses by itself */ }
  };
  // A Preset stands in deterministically (Requirement 1.4's spirit): the same world always
  // falls back to the same ghost, and nothing is stored — its sprite is the shipped static file.
  const fallbackProfile = async (worldId: string): Promise<GhostProfile> => {
    let hash = 0;
    for (const ch of worldId) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
    return PRESET_PROFILES[hash % PRESET_PROFILES.length] as GhostProfile;
  };

  async function portraits(input: { traits: unknown; worldId: string }, sid: string, ipHash: string): Promise<PortraitsResult> {
    const checked = validateTraits(input.traits);
    if (!checked.ok) return { ok: false, code: "trait_invalid", fields: checked.fields };
    const traits = checked.traits;
    const { guard, portraitist, moderator } = deps;
    if (!guard || !portraitist) return { ok: false, code: "creator_unavailable" };

    // Free text is moderated first and fails closed (Req 2.2); an empty detail needs no call.
    const detail = traits.detail === undefined ? "" : sanitizeDetail(traits.detail);
    if (detail !== "") {
      if (!moderator) return { ok: false, code: "moderation_unavailable" };
      const reserved = await guard.reserve({ meter: "llm", sessionId: sid, ipHash, now: now() });
      if (!reserved.ok) return { ok: false, code: "moderation_unavailable" };
      const answer = await moderateText(moderator, reserved.ticket, detail).catch(() => ({ ok: false as const, kind: "failed" as const }));
      await settle(reserved.ticket, answer.ok ? "commit" : "release");
      if (!answer.ok || answer.verdict.kind === "unusable") return { ok: false, code: "moderation_unavailable" };
      if (answer.verdict.kind === "unsafe") return { ok: false, code: "detail_unsafe" };
    }

    const reserved = await guard.reserve({ meter: "image", sessionId: sid, ipHash, now: now() });
    if (!reserved.ok) {
      return reserved.reason === "killed"
        ? { ok: false, code: "creator_unavailable" }
        : { ok: false, code: "quota_image", quota: await guard.remaining(sid, ipHash) };
    }
    const ticket = reserved.ticket;
    const cleanTraits: Traits = detail ? { ...traits, detail } : { ...traits, detail: undefined };
    const seed = newSeed();
    const prompt = buildPortraitPrompt(cleanTraits, seed);
    const renderSeed = async (s: number) => {
      const req = { prompt: prompt.text, negativePrompt: prompt.negativeText, seed: s, width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT };
      const first = await renderPortrait(portraitist, ticket, req).catch((): { ok: false; kind: "failed" } => ({ ok: false, kind: "failed" }));
      // The model's own filter sometimes refuses an output over the negative prompt's words
      // (seen in the checkpoint run, docs/spikes/3.1.md): once more without it, same seed.
      if (!first.ok && first.kind === "flagged") {
        return renderPortrait(portraitist, ticket, { ...req, negativePrompt: "" }).catch((): { ok: false; kind: "failed" } => ({ ok: false, kind: "failed" }));
      }
      return first;
    };
    const answers = await Promise.all([seed, seed + 1].map(renderSeed));
    if (!answers.some((a) => a.ok)) {
      await settle(ticket, "release");
      return { ok: false, code: "portrait_failed" };
    }
    await settle(ticket, "commit");

    const candidates: { candidateId: string; imageUrl: string }[] = [];
    for (const [i, answer] of answers.entries()) {
      if (!answer.ok) continue;
      const type = sniffType(answer.image);
      const prepared = type === null ? null : prepareUpload(answer.image, type);
      if (!prepared?.ok) continue;
      const candidateId = toBase64Url(random(16));
      try {
        await deps.store.putCandidate(candidateId, prepared.bytes, { contentType: prepared.type, ownerSid: sid, traits: cleanTraits, seed: seed + i });
        candidates.push({ candidateId, imageUrl: `/api/images/${candidateId}` });
      } catch { /* this one is left out */ }
    }
    if (candidates.length === 0) return { ok: false, code: "portrait_failed" };
    return { ok: true, candidates, quota: await guard.remaining(sid, ipHash) };
  }

  async function cutAndValidate(image: Uint8Array, contentType: string, ticket: SpendTicket): Promise<Uint8Array | null> {
    const { cutter } = deps;
    if (!cutter) return null;
    const cut = await cutOutForeground(cutter, ticket, { image, contentType, maxHeight: SPRITE_MAX_HEIGHT }).catch(() => ({ ok: false as const, kind: "failed" as const }));
    if (!cut.ok || cut.image.byteLength === 0 || cut.image.byteLength > SPRITE_MAX_BYTES) return null;
    const decoded = await decodePng(cut.image);
    if (!decoded.ok) return null;
    const { width, height, data } = decoded.bitmap;
    const alpha = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) alpha[i] = data[i * 4 + 3] ?? 0;
    return validateSprite({ width, height, alpha }) ? cut.image : null;
  }

  async function sprite(input: { candidateId: string; worldId: string }, sid: string, ipHash: string): Promise<SpriteResult> {
    const { guard, portraitist } = deps;
    if (!guard) return { ok: false, code: "creator_unavailable" };
    const stored = await deps.store.readCandidate(input.candidateId).catch(() => null);
    if (!stored || stored.ownerSid !== sid) return { ok: false, code: "candidate_missing" };

    const reserved = await guard.reserve({ meter: "image", sessionId: sid, ipHash, now: now() });
    if (!reserved.ok) return { ok: true, profile: await fallbackProfile(input.worldId), fallback: true };
    const ticket = reserved.ticket;

    let png = await cutAndValidate(stored.bytes, stored.contentType, ticket);
    if (png === null && portraitist) {
      // One retry with a different seed (Req 4.2), then a Preset stands in.
      const prompt = buildPortraitPrompt(stored.traits, stored.seed + 2);
      const again = await renderPortrait(portraitist, ticket, { prompt: prompt.text, negativePrompt: prompt.negativeText, seed: stored.seed + 2, width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT })
        .catch((): { ok: false; kind: "failed" } => ({ ok: false, kind: "failed" }));
      if (again.ok) {
        const type = sniffType(again.image);
        const prepared = type === null ? null : prepareUpload(again.image, type);
        if (prepared?.ok) png = await cutAndValidate(prepared.bytes, prepared.type, ticket);
      }
    }
    await settle(ticket, png === null ? "release" : "commit");
    if (png === null) return { ok: true, profile: await fallbackProfile(input.worldId), fallback: true };

    const persona = buildPersona(stored.traits, await deps.briefFor(input.worldId).catch(() => ""));
    const profile = buildProfile({ traits: stored.traits, spriteUrl: `/api/ghosts/sprite/${encodeURIComponent(input.worldId)}`, persona });
    await deps.store.saveGhost(input.worldId, profile, png);
    return { ok: true, profile, fallback: false };
  }

  /** A chosen Preset, kept under the world like a made ghost (its sprite is the shipped file). */
  async function assignPreset(worldId: string, presetId: string): Promise<SpriteResult> {
    const preset = presetById(presetId);
    if (!preset) return { ok: false, code: "candidate_missing" };
    await deps.store.saveProfile(worldId, preset);
    return { ok: true, profile: preset, fallback: true };
  }

  return {
    portraits,
    sprite,
    assignPreset,
    profileFor: async (worldId: string) => (await deps.store.readProfile(worldId)) ?? fallbackProfile(worldId),
    spriteFor: (worldId: string) => deps.store.readSprite(worldId),
  };
}

export type Creator = ReturnType<typeof createCreator>;
