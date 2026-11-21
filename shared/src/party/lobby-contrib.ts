import type { Contribution } from "./pool";
import type { LodgerVoice } from "../voice/voices";

/**
 * What the lobby has collected (party-mode 4.2, 5): per seat, the Suspect's Ghost Profile id (or that its making failed), the
 * photo and its verdict, the Zone name, how many Photo Prompt skips are used, and the seat's own yes to a selfie ghost. Kept by
 * the Room, read by `buildPool` when the game starts. None of it is needed to start (3.1): an empty record gives a full pool of
 * Preset Ghosts and curated Zone names. Pure: every change returns a new record.
 */
export type LobbyContrib = Readonly<{
  ghosts: Readonly<Record<number, Readonly<{ profileId: string; status: "ok" | "failed"; /** The Voice its maker picked (public, as fixed as the portrait). */ lodgerVoice?: LodgerVoice }>>>;
  photos: Readonly<Record<number, Readonly<{ photoId: string; status: "accepted" | "rejected" }>>>;
  zoneNames: Readonly<Record<number, string>>;
  promptRound: Readonly<Record<number, number>>;
  selfieYes: Readonly<Record<number, boolean>>;
  selfieMade: Readonly<Record<number, boolean>>;
}>;

export const emptyContrib = (): LobbyContrib => ({ ghosts: {}, photos: {}, zoneNames: {}, promptRound: {}, selfieYes: {}, selfieMade: {} });

export type ContribPatch =
  | Readonly<{ kind: "ghost"; profileId: string; status: "ok" | "failed"; lodgerVoice?: LodgerVoice }>
  | Readonly<{ kind: "photo"; photoId: string; status: "accepted" | "rejected" }>
  | Readonly<{ kind: "zone"; name: string }>
  | Readonly<{ kind: "promptRound"; round: number }>
  | Readonly<{ kind: "selfieYes"; yes: boolean }>
  | Readonly<{ kind: "selfieMade" }>;

/** The record with one seat's patch applied. A seat holds at most one of each; a later one replaces the earlier. */
export function applyPatch(c: LobbyContrib, seat: number, p: ContribPatch): LobbyContrib {
  switch (p.kind) {
    case "ghost": return { ...c, ghosts: { ...c.ghosts, [seat]: { profileId: p.profileId, status: p.status, ...(p.lodgerVoice !== undefined ? { lodgerVoice: p.lodgerVoice } : {}) } } };
    case "photo": return { ...c, photos: { ...c.photos, [seat]: { photoId: p.photoId, status: p.status } } };
    case "zone": return { ...c, zoneNames: { ...c.zoneNames, [seat]: p.name } };
    case "promptRound": return { ...c, promptRound: { ...c.promptRound, [seat]: p.round } };
    case "selfieYes": return { ...c, selfieYes: { ...c.selfieYes, [seat]: p.yes } };
    case "selfieMade": return { ...c, selfieMade: { ...c.selfieMade, [seat]: true } };
  }
}

/** A seat that leaves takes its contributions with it. */
export function dropSeat(c: LobbyContrib, seat: number): LobbyContrib {
  const without = <T>(r: Readonly<Record<number, T>>): Record<number, T> => Object.fromEntries(Object.entries(r).filter(([k]) => Number(k) !== seat)) as Record<number, T>;
  return { ghosts: without(c.ghosts), photos: without(c.photos), zoneNames: without(c.zoneNames), promptRound: without(c.promptRound), selfieYes: without(c.selfieYes), selfieMade: without(c.selfieMade) };
}

/** The `buildPool` input, one entry per seat that contributed anything. */
export function toContributions(c: LobbyContrib): Contribution[] {
  const seats = new Set([...Object.keys(c.ghosts), ...Object.keys(c.photos), ...Object.keys(c.zoneNames)].map(Number));
  return [...seats].sort((a, b) => a - b).map((seat) => ({
    seat,
    ...(c.ghosts[seat] !== undefined ? { ghost: c.ghosts[seat] } : {}),
    ...(c.photos[seat] !== undefined ? { photo: c.photos[seat] } : {}),
    ...(c.zoneNames[seat] !== undefined ? { zoneName: c.zoneNames[seat] } : {}),
  }));
}
