import type { SpendGuard } from "@hauntology/shared/world/spend";
import { DEFAULT_ROOM_CAPS, roomCaps, type RoomCaps } from "@hauntology/shared/party/spend";
import { createCreator } from "../creator/service";
import { R2CreatorStore, type CreatorStore } from "../creator/store";
import type { ForegroundCutter } from "../guarded/workersai/cutout";
import type { TextGuard } from "../guarded/workersai/guard";
import type { PortraitMaker } from "../guarded/workersai/image";
import type { PhotoShrinker, PhotoVetter } from "../guarded/workersai/photo-vet";
import type { PortraitEditor } from "../guarded/workersai/selfie-edit";
import { RoomBudget } from "./budget";
import { roomScope, type NameDeps, type PhotoDeps, type SelfieDeps, type SuspectDeps } from "./contribute";
import { R2PhotoStore, type PartyBucket } from "./photo-store";
import { DoRoomSpendStore } from "./spend-store";

/** Everything the contribution routes need for one Room (party-mode 5, 7). */
export type ContributionServices = Readonly<{
  photo: PhotoDeps;
  names: NameDeps;
  suspect: SuspectDeps & Readonly<{ guard: TextGuard | null }>;
  selfie: SelfieDeps;
}>;

type Stub = { fetch(input: string, init?: RequestInit): Promise<Response> };
export type ContributionParts = Readonly<{
  /** The one global `SpendGuard`; every Room is a session of it. */
  guard: SpendGuard;
  bucket: PartyBucket & ConstructorParameters<typeof R2CreatorStore>[0];
  vetter: PhotoVetter | null;
  shrinker: PhotoShrinker | null;
  moderator: TextGuard | null;
  portraitist: PortraitMaker | null;
  cutter: ForegroundCutter | null;
  /** `null` until the selfie model is confirmed by a spike: the selfie ghost is then off and every Player gets a Preset. */
  editor: PortraitEditor | null;
  caps?: Partial<RoomCaps>;
  killed?: () => boolean;
  styleRef?: () => Promise<{ bytes: Uint8Array; contentType: string } | null>;
  creatorStore?: CreatorStore;
  now?: () => number;
}>;

/** The services for one Room: a `RoomBudget` over the Room's own stored spend, the Ghost Creator and the selfie ghost charged to it. */
export function contributionServices(parts: ContributionParts, code: string, room: Stub): ContributionServices {
  const scope = roomScope(code);
  const caps = roomCaps({ ...DEFAULT_ROOM_CAPS, ...parts.caps });
  const budget = new RoomBudget(parts.guard, scope, caps, new DoRoomSpendStore(room, caps), parts.killed === undefined ? {} : { killed: parts.killed });
  const store = parts.creatorStore ?? new R2CreatorStore(parts.bucket);
  const base = { budget, scope, ...(parts.now !== undefined ? { now: parts.now } : {}) };
  const creator = parts.portraitist === null
    ? null
    : createCreator({
        guard: budget, store, portraitist: parts.portraitist, ...(parts.moderator !== null ? { moderator: parts.moderator } : {}), ...(parts.cutter !== null ? { cutter: parts.cutter } : {}),
        briefFor: async () => "", ...(parts.now !== undefined ? { now: parts.now } : {}),
      });
  return {
    photo: { ...base, vetter: parts.vetter, shrinker: parts.shrinker, photos: new R2PhotoStore(parts.bucket) },
    names: { ...base, guard: parts.moderator },
    suspect: { ...base, creator, store, guard: parts.moderator },
    selfie: { ...base, vetter: parts.vetter, editor: parts.editor, cutter: parts.cutter, store, styleRef: parts.styleRef ?? (async () => null) },
  };
}
