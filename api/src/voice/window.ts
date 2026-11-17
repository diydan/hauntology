import type { TakeResult, VoiceWindowStatus } from "@hauntology/shared/voice/window";
import type { ReserveResult, SpendGuard } from "@hauntology/shared/world/spend";
import type { JobNamespaceLike } from "../worlds/cloudflare-store";

/**
 * The voice window as the Worker sees it (`shared/src/voice/window.ts`): speech that costs money is off until the operator opens a window for some minutes with a
 * line cap, and it closes by itself. The window lives in the `SpendGuard` Durable Object, so every instance of the Worker sees the same one.
 *
 * Two faces. `VoiceWindow` is what a visitor's request uses, and it FAILS CLOSED: an object that cannot be reached, answers an error or answers something that does not
 * fit reads as closed, with no line to take. `VoiceWindowAdmin` is for the operator's route and is strict: a failure throws, so "closed" and "cannot tell" never look alike.
 */
export interface VoiceWindow {
  /** Whether a window is open now (it may have no lines left: cached and Library audio still plays). */
  isOpen(): Promise<boolean>;
  /** A line of the open window, taken before a paid call. */
  take(): Promise<TakeResult>;
  /** The line back, when the call cost nothing. Never throws. */
  give(id: number): Promise<void>;
}

export interface VoiceWindowAdmin {
  status(): Promise<VoiceWindowStatus>;
  open(minutes: number, cap: number): Promise<VoiceWindowStatus>;
  close(): Promise<VoiceWindowStatus>;
}

const URL_ = "https://spend-guard";

function readStatus(v: unknown): VoiceWindowStatus | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;
  if (typeof o["open"] !== "boolean" || !num(o["remainingMs"]) || !num(o["cap"]) || !num(o["used"]) || !num(o["remainingLines"])) return null;
  if (o["until"] !== null && !(typeof o["until"] === "number" && Number.isFinite(o["until"]))) return null;
  return { open: o["open"], until: o["until"] as number | null, remainingMs: o["remainingMs"], cap: o["cap"], used: o["used"], remainingLines: o["remainingLines"] };
}

export class SpendGuardVoiceWindow implements VoiceWindow, VoiceWindowAdmin {
  constructor(private readonly namespace: JobNamespaceLike) {}

  private call(path: string, method: "GET" | "POST", body: unknown = {}): Promise<Response> {
    const stub = this.namespace.get(this.namespace.idFromName("global"));
    return stub.fetch(`${URL_}${path}`, { method, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
  }

  private async strict(path: string, method: "GET" | "POST", body?: unknown): Promise<VoiceWindowStatus> {
    const res = await this.call(path, method, body);
    if (!res.ok) throw new Error(`SpendGuard refused the voice window (${res.status})`);
    const status = readStatus(await res.json());
    if (status === null) throw new Error("SpendGuard answered a voice window that does not fit");
    return status;
  }

  async isOpen(): Promise<boolean> {
    try {
      return (await this.strict("/voice-window", "GET")).open;
    } catch {
      return false;
    }
  }

  async take(): Promise<TakeResult> {
    try {
      const res = await this.call("/voice-window/take", "POST");
      if (!res.ok) return { ok: false, reason: "closed" };
      const b = (await res.json()) as { ok?: unknown; id?: unknown; reason?: unknown };
      if (b.ok === true && typeof b.id === "number" && Number.isSafeInteger(b.id)) return { ok: true, id: b.id };
      return { ok: false, reason: b.reason === "cap" ? "cap" : "closed" };
    } catch {
      return { ok: false, reason: "closed" };
    }
  }

  async give(id: number): Promise<void> {
    try {
      await this.call("/voice-window/give", "POST", { id });
    } catch {
      // a line that is not given back is a line spent: it can only make the window stricter
    }
  }

  status(): Promise<VoiceWindowStatus> {
    return this.strict("/voice-window", "GET");
  }
  open(minutes: number, cap: number): Promise<VoiceWindowStatus> {
    return this.strict("/voice-window/open", "POST", { minutes, cap });
  }
  close(): Promise<VoiceWindowStatus> {
    return this.strict("/voice-window/close", "POST");
  }
}

/**
 * The spend guard with the window in front of the paid speech call. Only the `tts` meter is windowed; every other meter is the guard's own, untouched.
 *
 * A `tts` reservation first takes a line of the window (closed window: refused like the kill switch; lines spent: refused like a cap), and then asks the guard. If the guard
 * refuses, the line goes back. When the call was charged (`commit`) the line stays spent; when it cost nothing (`release`) the line goes back, to the window it came from.
 * The tickets are held here between the reservation and its settlement, which happen in one request in one instance.
 */
export function windowedSpend(spend: Pick<SpendGuard, "reserve" | "commit" | "release">, window: Pick<VoiceWindow, "take" | "give">): Pick<SpendGuard, "reserve" | "commit" | "release"> {
  const held = new Map<string, number>();
  return {
    async reserve(req): Promise<ReserveResult> {
      if (req.meter !== "tts") return spend.reserve(req);
      const slot = await window.take();
      if (!slot.ok) return { ok: false, reason: slot.reason === "cap" ? "total" : "killed" };
      let granted: ReserveResult;
      try {
        granted = await spend.reserve(req);
      } catch (e) {
        await window.give(slot.id);
        throw e;
      }
      if (!granted.ok) {
        await window.give(slot.id);
        return granted;
      }
      held.set(granted.ticket.id, slot.id);
      return granted;
    },
    async commit(ticket) {
      held.delete(ticket.id);
      return spend.commit(ticket);
    },
    async release(ticket) {
      const slot = held.get(ticket.id);
      held.delete(ticket.id);
      try {
        await spend.release(ticket);
      } finally {
        if (slot !== undefined) await window.give(slot);
      }
    },
  };
}
