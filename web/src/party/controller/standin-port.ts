import { makeLock } from "@hauntology/shared/puzzles/make";
import type { Preset } from "@hauntology/shared/puzzles/settings";
import { ATTEMPTS, type Kind, type Level, type Lock, type PuzzleSetting, type Transcript } from "@hauntology/shared/puzzles/types";
import { verify } from "@hauntology/shared/puzzles/verify";
import { worldCluePrompt, type CluePlace, type PublicWorldClue, type Sign } from "@hauntology/shared/puzzles/world-clues";
import type { AttemptReply } from "../../puzzles/PuzzleHost";
import { NOT_SEATED, type ControllerPort, type JoinResult, type LockOffer, type RoomView } from "./controller-port";

/** The codes this Room answers to. Anything else is an unknown Room: the answer never says what exists. */
export const STANDIN_CODES = { open: "K7M2", full: "MAX6", started: "STR4" } as const;

type Listener = (view: RoomView) => void;

/**
 * A scripted Room for the demo page and the tests: no network, no timers, nothing random. `K7M2` seats the phone as the Master,
 * `MAX6` answers "full" and `STR4` "game started"; any other code is unknown. A Lock is put in front of the seat with `offerLock`;
 * the answer is checked with the shared checker, as the real Room will.
 */
export class StandInPort implements ControllerPort {
  private view: RoomView = NOT_SEATED;
  private readonly listeners = new Set<Listener>();
  private lock: Lock | null = null;
  private tries = 0;
  /** What the Room was asked, in order, for a test to read. */
  readonly calls: string[] = [];

  constructor(private readonly opts: { unreachable?: boolean; master?: boolean } = {}) {}

  getView(): RoomView {
    return this.view;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private set(patch: Partial<RoomView>): void {
    this.view = { ...this.view, ...patch };
    for (const l of [...this.listeners]) l(this.view);
  }

  async join(code: string, nickname: string): Promise<JoinResult> {
    this.calls.push(`join ${code} ${nickname}`);
    await Promise.resolve();
    if (this.opts.unreachable) return { ok: false, code: "unreachable" };
    if (code === STANDIN_CODES.full) return { ok: false, code: "room_full" };
    if (code === STANDIN_CODES.started) return { ok: false, code: "game_started" };
    if (code !== STANDIN_CODES.open) return { ok: false, code: "room_unknown" };
    const master = this.opts.master === false ? null : { puzzles: "medium" as PuzzleSetting, preset: "classic" as Preset };
    this.view = { connection: "online", phase: "lobby", code, seat: 1, nickname, master, lock: null };
    for (const l of [...this.listeners]) l(this.view);
    return { ok: true, seat: 1, nickname };
  }

  /** Put a Lock in front of this seat (the Room's side of "Inspect"). */
  offerLock(kind: Kind, level: Level = "easy", seed = 1, faded = true, world?: { sign: Sign; canSeeAgain: boolean }): void {
    const lock = makeLock(kind, level, seed);
    this.lock = lock;
    this.tries = 0;
    const sight = lock.sight === null ? null : { kind, payload: lock.sight, showMs: 8000 };
    const offer: LockOffer = {
      id: `${kind}-${level}-${seed}`, kind, view: lock.view, faded: faded ? sight : null, clue: sight, attempts: ATTEMPTS, capMs: null,
      ...(world ? { sign: world.sign, prompt: worldCluePrompt(kind, world.sign), canSeeAgain: world.canSeeAgain } : {}),
    };
    this.set({ phase: "playing", lock: offer });
  }

  /** Set the World Clues kept on this seat's own Turn (Assist notebook). */
  setWorldClues(worldClues: readonly PublicWorldClue[]): void {
    this.set({ worldClues });
  }

  /** What the connection says (the header shows it in words). */
  setConnection(connection: RoomView["connection"]): void {
    this.set({ connection });
  }

  attempt(lockId: string, transcript: Transcript): AttemptReply {
    this.calls.push(`attempt ${lockId}`);
    if (this.lock === null || this.view.lock?.id !== lockId) return { outcome: "failed", reason: "no_lock" };
    const v = verify(this.lock, transcript);
    if (v.ok) return { outcome: "solved" };
    this.tries += 1;
    return this.tries >= ATTEMPTS ? { outcome: "failed", reason: v.code } : { outcome: "wrong", attemptsLeft: ATTEMPTS - this.tries };
  }

  closeLock(lockId: string, why: "finished" | "gave_up" | "time_up"): void {
    this.calls.push(`closeLock ${lockId} ${why}`);
    if (this.view.lock?.id !== lockId) return;
    this.lock = null;
    this.set({ phase: "lobby", lock: null });
  }

  setPuzzles(setting: PuzzleSetting): void {
    this.calls.push(`setPuzzles ${setting}`);
    if (this.view.master !== null) this.set({ master: { ...this.view.master, puzzles: setting } });
  }

  setCluePlace(place: CluePlace): void {
    this.calls.push(`setCluePlace ${place}`);
    if (this.view.master !== null) this.set({ master: { ...this.view.master, cluePlace: place } });
  }

  async leave(): Promise<void> {
    this.calls.push("leave");
    await Promise.resolve();
    this.lock = null;
    this.view = NOT_SEATED;
    for (const l of [...this.listeners]) l(this.view);
  }
}
