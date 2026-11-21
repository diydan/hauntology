import type { SpendGuard, SpendTicket, Meter } from "@hauntology/shared/world/spend";
import { briefPlace } from "../guarded/workersai/place-brief";
import type { WorkersAiClient } from "../guarded/workersai/client";
import { cutOutForeground } from "../guarded/workersai/cutout";
import { moderateText } from "../guarded/workersai/guard";
import { renderCandidate, renderPortrait } from "../guarded/workersai/image";
import { outpaintView, type Outpainter } from "../guarded/workersai/outpaint";
import { generateText } from "../guarded/workersai/text";
import type { EnhanceView } from "@hauntology/shared/world/enhance";

/**
 * The runner for Spike 1.2 (Workers AI and Cloudflare Images from a Worker, `docs/spikes/1.2.md`) and the image half of Spike 1.3 (does outpainting continue a photo).
 * It is the rehearsed, spend-limited part of both spikes; **it has only been run over fakes**. Every call goes through the guarded door of its adapter with a Ticket
 * from `SpendGuard`, so the meter caps apply, one call at a time, no retry, and it stops at the first thing that looks wrong. It records only ids, outcomes, latencies and
 * byte counts: never a photo, a prompt, a text, a picture or a place. Turning it into a real run needs the owner to declare the `AI` and `IMAGES` bindings and say go.
 */
export type SpikeKind = "brief" | "sketch" | "text" | "guard" | "portrait" | "cutout" | "outpaint";
export const METER_OF: Readonly<Record<SpikeKind, Meter>> = { brief: "llm", text: "llm", guard: "llm", sketch: "image", portrait: "image", cutout: "image", outpaint: "image" };

export type CaseResult = { ok: boolean; /** The failure kind or reason when `ok` is false. */ failure?: string; /** The service answered, so the unit stays used. */ charged: boolean; outBytes?: number; note?: string };
export type SpikeCase = { id: string; kind: SpikeKind; run(ticket: SpendTicket): Promise<CaseResult> };

export type SpikeInputs = {
  photos: { id: string; bytes: Uint8Array; contentType: string }[];
  sketches: { id: string; bytes: Uint8Array; prompt: string }[];
  ghostPrompts: { id: string; system: string; user: string }[];
  guardTexts: { id: string; text: string; expect: "safe" | "unsafe" }[];
  portraits: { id: string; prompt: string; negativePrompt: string }[];
  /** Pictures to cut the background from (three portraits the owner already has). */
  cutouts?: { id: string; bytes: Uint8Array; contentType: string }[];
  /** For the outpaint arm of Spike 1.3. */
  outpaints?: { id: string; bytes: Uint8Array; contentType: string; view: EnhanceView; width: number; height: number }[];
};

/** The planned calls, in the order the runner makes them: the cheap text calls first, the images last. */
export function buildSpikeCases(client: Pick<WorkersAiClient, "briefer" | "text" | "guard" | "imager" | "portraitist" | "cutter">, inputs: SpikeInputs, outpainter: Outpainter | null = null): SpikeCase[] {
  const cases: SpikeCase[] = [];
  const unavailable = (id: string, kind: SpikeKind): SpikeCase => ({ id, kind, run: async () => ({ ok: false, failure: "adapter_missing", charged: false }) });
  for (const p of inputs.photos) {
    cases.push(client.briefer === null ? unavailable(p.id, "brief") : { id: p.id, kind: "brief", run: async (ticket) => {
      const a = await briefPlace(client.briefer!, ticket, { image: p.bytes, contentType: p.contentType });
      return a.ok ? { ok: true, charged: true, note: `verdict ${a.verdict.kind}${a.verdict.kind === "safe" ? `, brief ${a.verdict.brief.length} chars` : ""}` } : { ok: false, failure: "no_answer", charged: false };
    } });
  }
  for (const g of inputs.ghostPrompts) {
    cases.push(client.text === null ? unavailable(g.id, "text") : { id: g.id, kind: "text", run: async (ticket) => {
      const a = await generateText(client.text!, ticket, { system: g.system, user: g.user, maxTokens: 120 });
      return a.ok ? { ok: true, charged: true, outBytes: a.text.length, note: `${a.text.length} chars` } : { ok: false, failure: a.kind, charged: a.kind === "unusable" };
    } });
  }
  for (const t of inputs.guardTexts) {
    cases.push(client.guard === null ? unavailable(t.id, "guard") : { id: t.id, kind: "guard", run: async (ticket) => {
      const a = await moderateText(client.guard!, ticket, t.text);
      if (!a.ok) return { ok: false, failure: a.kind, charged: false };
      const got = a.verdict.kind === "unsafe" ? `unsafe ${a.verdict.categories.join("+")}` : a.verdict.kind;
      return { ok: true, charged: true, note: `expected ${t.expect}, got ${got}${(a.verdict.kind === "safe") === (t.expect === "safe") ? "" : "  <-- differs"}` };
    } });
  }
  for (const s of inputs.sketches) {
    cases.push(client.imager === null ? unavailable(s.id, "sketch") : { id: s.id, kind: "sketch", run: async (ticket) => {
      const a = await renderCandidate(client.imager!, ticket, { sketch: s.bytes, prompt: s.prompt, seed: 1, width: 512, height: 512 });
      return a.ok ? { ok: true, charged: true, outBytes: a.image.byteLength } : { ok: false, failure: a.kind, charged: false };
    } });
  }
  for (const p of inputs.portraits) {
    cases.push(client.portraitist === null ? unavailable(p.id, "portrait") : { id: p.id, kind: "portrait", run: async (ticket) => {
      const a = await renderPortrait(client.portraitist!, ticket, { prompt: p.prompt, negativePrompt: p.negativePrompt, seed: 1, width: 512, height: 512 });
      return a.ok ? { ok: true, charged: true, outBytes: a.image.byteLength } : { ok: false, failure: a.kind, charged: false };
    } });
  }
  for (const c of inputs.cutouts ?? []) {
    cases.push(client.cutter === null ? unavailable(c.id, "cutout") : { id: c.id, kind: "cutout", run: async (ticket) => {
      const a = await cutOutForeground(client.cutter!, ticket, { image: c.bytes, contentType: c.contentType, maxHeight: 1024 });
      return a.ok ? { ok: true, charged: true, outBytes: a.image.byteLength, note: `${a.width}x${a.height}, coverage ${a.coverage.toFixed(2)}` } : { ok: false, failure: "reason" in a ? a.reason : a.kind, charged: a.kind === "unusable" };
    } });
  }
  for (const o of inputs.outpaints ?? []) {
    cases.push(outpainter === null ? unavailable(o.id, "outpaint") : { id: o.id, kind: "outpaint", run: async (ticket) => {
      const a = await outpaintView(outpainter, ticket, { photo: o.bytes, contentType: o.contentType, view: o.view, seed: 1, width: o.width, height: o.height });
      return a.ok ? { ok: true, charged: true, outBytes: a.image.byteLength } : { ok: false, failure: a.kind, charged: false };
    } });
  }
  return cases;
}

export type SpikeRow = { id: string; kind: SpikeKind; meter: Meter; ok: boolean; failure?: string; ms: number; charged: boolean; outBytes?: number; note?: string };
export type SpikeReport = { rows: SpikeRow[]; calls: number; stoppedBy: "done" | "cap" | "failures" | "denied" | "threw" };

export type RunDeps = {
  cases: SpikeCase[];
  guard: SpendGuard;
  sessionId?: string;
  now: () => number;
  /** A clock in ms for latency; `performance.now` in a Worker. */
  clock: () => number;
  /** At most this many calls, whatever the plan holds. */
  maxCalls: number;
  /** Stop after this many failures in a row (default 3). */
  stopAfterFailures?: number;
};

export async function runAiSpike(d: RunDeps): Promise<SpikeReport> {
  const session = d.sessionId ?? "ai-spike";
  const stopAt = d.stopAfterFailures ?? 3;
  const rows: SpikeRow[] = [];
  let failuresInARow = 0;
  for (const c of d.cases) {
    if (rows.length >= d.maxCalls) return { rows, calls: rows.length, stoppedBy: "cap" };
    const meter = METER_OF[c.kind];
    const reserved = await d.guard.reserve({ meter, sessionId: session, ipHash: session, now: d.now() });
    if (!reserved.ok) return { rows, calls: rows.length, stoppedBy: "denied" };
    const t0 = d.clock();
    let result: CaseResult;
    let threw = false;
    try {
      result = await c.run(reserved.ticket);
    } catch (e) {
      threw = true;
      result = { ok: false, failure: e instanceof Error ? e.name : "threw", charged: false };
    }
    const ms = Math.round(d.clock() - t0);
    if (result.charged) await d.guard.commit(reserved.ticket);
    else await d.guard.release(reserved.ticket);
    rows.push({ id: c.id, kind: c.kind, meter, ok: result.ok, ...(result.failure === undefined ? {} : { failure: result.failure }), ms, charged: result.charged,
      ...(result.outBytes === undefined ? {} : { outBytes: result.outBytes }), ...(result.note === undefined ? {} : { note: result.note }) });
    if (threw) return { rows, calls: rows.length, stoppedBy: "threw" };
    failuresInARow = result.ok ? 0 : failuresInARow + 1;
    if (failuresInARow >= stopAt) return { rows, calls: rows.length, stoppedBy: "failures" };
  }
  return { rows, calls: rows.length, stoppedBy: "done" };
}

const pct = (xs: number[], p: number): number => (xs.length === 0 ? 0 : [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!);

/** A markdown table per kind for `docs/spikes/1.2.md`: counts, outcomes, p50 and p95 latency, and what each guard text did. Nothing a visitor typed or made. */
export function renderSpikeReport(r: SpikeReport): string {
  const out: string[] = [`Calls made: ${r.calls}. Stopped by: ${r.stoppedBy}.`, "", "| Kind | Calls | Answered | Failed (kinds) | Units kept | p50 ms | p95 ms |", "|---|---|---|---|---|---|---|"];
  for (const kind of Object.keys(METER_OF) as SpikeKind[]) {
    const rows = r.rows.filter((x) => x.kind === kind);
    if (rows.length === 0) continue;
    const failed = rows.filter((x) => !x.ok);
    const kinds = [...new Set(failed.map((x) => x.failure ?? "?"))].join(", ");
    out.push(`| ${kind} | ${rows.length} | ${rows.length - failed.length} | ${failed.length}${kinds === "" ? "" : ` (${kinds})`} | ${rows.filter((x) => x.charged).length} | ${pct(rows.map((x) => x.ms), 0.5)} | ${pct(rows.map((x) => x.ms), 0.95)} |`);
  }
  const guardRows = r.rows.filter((x) => x.kind === "guard");
  if (guardRows.length > 0) out.push("", "Llama Guard, one line per text (ids only):", ...guardRows.map((x) => `- ${x.id}: ${x.ok ? x.note ?? "" : `no answer (${x.failure ?? "?"})`}`));
  out.push("", "Neurons per call are not visible from the binding: read them from the Workers AI dashboard for the run's window and record them by hand.");
  return out.join("\n");
}
