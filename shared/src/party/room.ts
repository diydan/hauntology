import { z } from "zod";

/**
 * The saved state of one Room (party-mode 1.5, 10.4): what the `PartyRoom` Durable Object keeps between messages.
 * This slice holds the lobby: code, tokens, seats and the Master. The game state joins it in later slices.
 * Tokens are random 128-bit values in hex, held only by the server and the device that owns them.
 */
export const SEATS = [1, 2, 3, 4, 5, 6] as const;
export type Seat = (typeof SEATS)[number];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
/** A Room idle this long is deleted (1.5). */
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
/** A Master away this long hands the role on (1.7). */
export const MASTER_TIMEOUT_MS = 60_000;

const TokenSchema = z.string().regex(/^[0-9a-f]{32}$/);
const SeatSchema = z.number().int().min(1).max(6) as unknown as z.ZodType<Seat>;

export const SeatStateSchema = z.object({
  seat: SeatSchema,
  nickname: z.string().min(1).max(16),
  /** Null for a Bot: a Bot has no device and no token. */
  token: TokenSchema.nullable(),
  bot: z.boolean(),
  connected: z.boolean(),
  /** When the seat last lost its connection, or null while connected. */
  awaySinceMs: z.number().finite().nullable(),
}).strict();
export type SeatState = z.infer<typeof SeatStateSchema>;

export const RoomStateSchema = z.object({
  v: z.literal(1),
  code: z.string().length(4),
  seed: z.number().int(),
  createdMs: z.number().finite(),
  lastActiveMs: z.number().finite(),
  ttlMs: z.number().int().positive(),
  hostToken: TokenSchema,
  displayToken: TokenSchema,
  started: z.boolean(),
  masterSeat: SeatSchema.nullable(),
  seats: z.array(SeatStateSchema).max(MAX_PLAYERS),
}).strict();
export type RoomState = z.infer<typeof RoomStateSchema>;

/** 128 random bits as hex, from a source of random bytes (the Room passes `crypto.getRandomValues`). */
export function newToken(fill: (bytes: Uint8Array) => Uint8Array): string {
  return [...fill(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A new, empty Room. No world is chosen yet (1.1). */
export function createRoomState(code: string, seed: number, nowMs: number, hostToken: string, displayToken: string, ttlMs = ROOM_TTL_MS): RoomState {
  return { v: 1, code, seed, createdMs: nowMs, lastActiveMs: nowMs, ttlMs, hostToken, displayToken, started: false, masterSeat: null, seats: [] };
}

export const serializeRoom = (state: RoomState): string => JSON.stringify(state);

/** The Room from its saved text, or null for anything that is not a valid saved Room. Never throws. */
export function parseRoom(text: string): RoomState | null {
  try {
    const res = RoomStateSchema.safeParse(JSON.parse(text));
    return res.success ? res.data : null;
  } catch {
    return null;
  }
}

/** A Room idle for its time to live is expired (1.5). */
export const isRoomExpired = (state: RoomState, nowMs: number): boolean => nowMs - state.lastActiveMs >= state.ttlMs;
export const touch = (state: RoomState, nowMs: number): RoomState => ({ ...state, lastActiveMs: Math.max(state.lastActiveMs, nowMs) });

/** The storage a Room lives in: the Durable Object's storage, or a Map in tests. Keys of one Room share its prefix. */
export type RoomStore = {
  get(key: string): Promise<string | undefined>;
  put(key: string, value: string): Promise<void>;
  delete(keys: string[]): Promise<void>;
  list(prefix: string): Promise<string[]>;
};
export const roomPrefix = (code: string): string => `room:${code}:`;
export const stateKey = (code: string): string => `${roomPrefix(code)}state`;

/** Delete a Room with all of its Contributions: state, photos, Sprites, nicknames, everything under its prefix (1.5, 10.4). */
export async function deleteRoomData(store: RoomStore, code: string): Promise<number> {
  const keys = await store.list(roomPrefix(code));
  if (keys.length > 0) await store.delete(keys);
  return keys.length;
}
