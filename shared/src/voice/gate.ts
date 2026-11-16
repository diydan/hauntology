/**
 * The budget gate for every paid voice call (ghost-voice design, "Budget gate"; task 2.14). Pure: it does no I/O of its own, its ports are injected,
 * so it is tested with a fake `SpendGuard`.
 *
 * No call without a granted Ticket. One call per Ticket. The Ticket is committed when the call was charged and released when it was not. Whatever
 * a port does (throws, rejects, answers nonsense), the answer is a refusal and never a call that was not paid for. A commit or a release that
 * cannot be delivered is dropped: `SpendGuard` takes the unit back by itself when the reservation runs out.
 */
import type { Meter, SpendTicket } from "../world/spend";

export type GateMeter = Extract<Meter, "tts" | "stt" | "live">;

export interface GatePorts {
  /** A Ticket for one unit of this meter, or `null` when it is refused (a cap is spent, the guard is killed or cannot answer). */
  reserve(meter: GateMeter): Promise<SpendTicket | null>;
  commit(ticket: SpendTicket): Promise<void>;
  release(ticket: SpendTicket): Promise<void>;
  /** The kill switch. When it is on, nothing is reserved and nothing is called. */
  kill(): boolean;
}

export type GateResult<T> = { ok: true; value: T } | { ok: false; reason: "killed" | "denied" | "failed" };

/**
 * Reserves a Ticket, makes `call` once, and settles the Ticket.
 * - `killed`: the kill switch is on (or could not be read). No Ticket was asked for and `call` was not made.
 * - `denied`: no Ticket was granted (or the one granted was not for this meter, and it is released). `call` was not made.
 * - `failed`: `call` threw. The Ticket is released.
 * - `ok`: `call` answered. The Ticket is committed when `charged(value)` is true (the default) and released when it is false, so a call that
 *   gave nothing and cost nothing is not counted. A `charged` that throws counts as charged: when in doubt the unit is spent, never forgotten.
 */
export async function withTicket<T>(
  ports: GatePorts,
  meter: GateMeter,
  call: (ticket: SpendTicket) => Promise<T>,
  charged: (value: T) => boolean = () => true,
): Promise<GateResult<T>> {
  let killed = true;
  try {
    killed = ports.kill();
  } catch {
    killed = true; // fail closed
  }
  if (killed) return { ok: false, reason: "killed" };

  let ticket: SpendTicket | null = null;
  try {
    ticket = await ports.reserve(meter);
  } catch {
    ticket = null;
  }
  if (ticket === null || ticket === undefined) return { ok: false, reason: "denied" };
  if (ticket.meter !== meter) {
    await drop(() => ports.release(ticket as SpendTicket));
    return { ok: false, reason: "denied" };
  }

  let value: T;
  try {
    value = await call(ticket);
  } catch {
    await drop(() => ports.release(ticket as SpendTicket));
    return { ok: false, reason: "failed" };
  }
  let spend = true;
  try {
    spend = charged(value);
  } catch {
    spend = true;
  }
  await drop(() => (spend ? ports.commit(ticket as SpendTicket) : ports.release(ticket as SpendTicket)));
  return { ok: true, value };
}

async function drop(settle: () => Promise<void>): Promise<void> {
  try {
    await settle();
  } catch {
    // dropped: the reservation runs out by itself
  }
}
