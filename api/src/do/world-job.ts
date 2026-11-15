import { StoredWorldSchema } from "@hauntology/shared/world/record";
import {
  DEFAULT_TIMING, isFinished, jobReducer, jobStart, type JobData, type JobEffect, type JobEvent, type JobTiming,
} from "@hauntology/shared/world/job";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import { THROWN, generateWorld, ingestWorld, pollWorld } from "../guarded/worldlabs";
import type { ImageStore, Ingestor, UpstreamFailure, WorldLabsPort } from "../worlds/ports";

const RECORD = "record";
const JOB = "job";
const FLUSH_RETRY_MS = 30_000;
const IMAGE_ID = /^[A-Za-z0-9_-]{1,128}$/;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** What the job settles with `SpendGuard`. `SpendGuardClient` in strict mode fits it. */
export interface JobGuard {
  commit(ticket: SpendTicket): Promise<void>;
  release(ticket: SpendTicket): Promise<void>;
  setKill(on: boolean): Promise<void>;
}

export type JobDeps = { upstream: WorldLabsPort; ingestor: Ingestor; images: ImageStore; guard: JobGuard; timing?: JobTiming };

/** The job as it is kept in storage: the state machine's data, the Ticket, the picture, and effects not yet settled. */
type Stored = { data: JobData; ticket: SpendTicket; imageId: string; pending: JobEffect[] };

/**
 * The `WorldJob` Durable Object, one per world (world-pipeline design).
 *
 * Record side: it keeps the world's owner, state, manifest and the ids of its pictures, and nothing else may.
 * Job side (7.1): `/start` records the job and wakes it at once; each wake (`alarm`) makes one step, calling the
 * world service through `guarded/worldlabs.ts` (generate, then poll, then hand the finished world to the ingestor),
 * feeds the answer to `jobReducer`, saves the new state and the record together, and only then settles the Ticket
 * (`commit` or `release`) and sets the next wake. Effects that could not be settled stay in storage and are tried
 * again at the next wake, so a ticket is settled once even if a call fails. Without `deps` (the real world service
 * and ingest are not wired yet) `/start` answers 503 and nothing is spent. Known gap: if the object stops between a
 * `generate` call returning and the job being saved, the next wake asks for a second operation.
 *
 * Internal addresses, to the Worker only:
 *   /record  GET the record or `null`; PUT create (201, 409 if there is one); PATCH change it (404 if none; `id`, `kind`
 *            and `ownerSid` never change); DELETE forget it and settle an unfinished job (204)
 *   /start   POST {ticket, imageId, ownerSid}: start the job (202); the same call again changes nothing (200)
 */
export class WorldJob {
  constructor(
    private readonly state: DurableObjectState,
    _env?: unknown,
    private readonly deps?: JobDeps,
    private readonly clock: () => number = Date.now,
    private readonly random: () => number = Math.random,
  ) {}

  private get timing(): JobTiming {
    return this.deps?.timing ?? DEFAULT_TIMING;
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/start") return this.start(request);
    if (pathname !== "/record") return new Response(null, { status: 404 });
    const stored = await this.state.storage.get<unknown>(RECORD);

    switch (request.method) {
      case "GET":
        return json(stored ?? null);

      case "PUT": {
        if (stored !== undefined) return json({ ok: false, code: "exists" }, 409);
        const parsed = StoredWorldSchema.safeParse(await readJson(request));
        if (!parsed.success) return json({ ok: false, code: "bad_record" }, 400);
        await this.state.storage.put(RECORD, parsed.data);
        return json(parsed.data, 201);
      }

      case "PATCH": {
        if (stored === undefined) return json({ ok: false, code: "missing" }, 404);
        const patch = await readJson(request);
        if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return json({ ok: false, code: "bad_record" }, 400);
        const current = stored as Record<string, unknown>;
        // Whatever the patch says about who the record is, or who owns it, is ignored.
        const merged = { ...current, ...(patch as Record<string, unknown>), id: current.id, kind: current.kind, ownerSid: current.ownerSid };
        const parsed = StoredWorldSchema.safeParse(merged);
        if (!parsed.success) return json({ ok: false, code: "bad_record" }, 400);
        await this.state.storage.put(RECORD, parsed.data);
        return json(parsed.data);
      }

      case "DELETE":
        await this.abandon();
        await this.state.storage.deleteAll();
        await this.state.storage.deleteAlarm();
        return new Response(null, { status: 204 });

      default:
        return new Response(null, { status: 405 });
    }
  }

  private async start(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    if (this.deps === undefined) return json({ ok: false, code: "world_gen_disabled" }, 503);
    const body = (await readJson(request)) as { ticket?: Partial<SpendTicket>; imageId?: unknown; ownerSid?: unknown } | null;
    const t = body?.ticket;
    if (body === null || typeof body !== "object" || t === undefined || t === null || typeof t !== "object" || t.meter !== "world" || typeof t.id !== "string" || t.id === "" || typeof t.sessionId !== "string" || typeof t.issuedAt !== "number" || typeof body.imageId !== "string" || !IMAGE_ID.test(body.imageId)) {
      return json({ ok: false, code: "bad_request" }, 400);
    }
    const record = StoredWorldSchema.safeParse(await this.state.storage.get(RECORD));
    if (!record.success || record.data.ownerSid !== body.ownerSid) return json({ ok: false, code: "bad_request" }, 400);
    if ((await this.state.storage.get(JOB)) !== undefined) return json({ ok: true }, 200);

    const stored: Stored = { data: jobStart(this.clock()), ticket: { id: t.id, meter: "world", sessionId: t.sessionId, issuedAt: t.issuedAt }, imageId: body.imageId, pending: [] };
    await this.state.storage.put(JOB, stored);
    await this.state.storage.setAlarm(this.clock());
    return json({ ok: true }, 202);
  }

  /** One wake: settle what is owed, then make one step. */
  async alarm(): Promise<void> {
    const deps = this.deps;
    const stored = await this.state.storage.get<Stored>(JOB);
    if (deps === undefined || stored === undefined) return;

    if (!(await this.settle(stored))) return;
    if (isFinished(stored.data)) return;

    const now = this.clock();
    const event = now - stored.data.startedAt >= this.timing.timeoutMs ? ({ t: "timeout" } as JobEvent) : await this.observe(deps, stored);
    const step = jobReducer(stored.data, event, now, this.random, this.timing);

    const next: Stored = { ...stored, data: step.job, pending: step.effects.filter((e) => e.t === "commit" || e.t === "release" || e.t === "tripKill") };
    await this.state.storage.put(JOB, next);
    await this.mirror(next.data);
    if (!(await this.settle(next))) return;
    for (const e of step.effects) if (e.t === "scheduleNext") await this.state.storage.setAlarm(e.at);
  }

  /** What the world service says now, as one event. */
  private async observe(deps: JobDeps, stored: Stored): Promise<JobEvent> {
    const { data, ticket } = stored;
    try {
      if (data.status === "queued") {
        const record = StoredWorldSchema.safeParse(await this.state.storage.get(RECORD));
        const image = await deps.images.read(stored.imageId);
        if (image === null || !record.success) return { t: "upstream_error", status: 404 };
        const bytes = new Uint8Array(await new Response(image.body as BodyInit).arrayBuffer());
        // The name sent upstream is the world's own id: nothing the visitor wrote leaves with the picture. The content type is the one the bytes were stored with.
        const res = await generateWorld(deps.upstream, ticket, { image: bytes, contentType: image.contentType, name: record.data.id });
        return res.ok ? { t: "started", operationId: res.operationId } : failureEvent(res);
      }
      if (data.status === "generating") {
        const res = await pollWorld(deps.upstream, ticket, data.operationId as string);
        if (!res.ok) return failureEvent(res);
        return res.state === "pending" ? { t: "poll_pending" } : res.state === "done" ? { t: "poll_done" } : { t: "upstream_error", status: 422 };
      }
      // ingesting
      const record = StoredWorldSchema.safeParse(await this.state.storage.get(RECORD));
      if (!record.success) return { t: "ingest_failed", code: "ingest_failed" };
      const res = await ingestWorld(deps.ingestor, ticket, {
        worldId: record.data.id,
        operationId: data.operationId as string,
        ownerSid: record.data.ownerSid,
        title: record.data.title ?? "A place",
        brief: record.data.brief ?? "",
        source: record.data.source ?? "upload",
        createdAt: this.clock(),
      });
      if (!res.ok) return "code" in res ? { t: "ingest_failed", code: res.code } : failureEvent(res);
      const merged = StoredWorldSchema.safeParse({ ...record.data, manifest: res.manifest });
      if (!merged.success) return { t: "ingest_failed", code: "ingest_failed" };
      await this.state.storage.put(RECORD, merged.data);
      return { t: "ingest_ok" };
    } catch {
      const thrown: UpstreamFailure = THROWN;
      return failureEvent(thrown);
    }
  }

  /** Keeps the record's state and failure in step with the job. */
  private async mirror(data: JobData): Promise<void> {
    const record = StoredWorldSchema.safeParse(await this.state.storage.get(RECORD));
    if (!record.success) return;
    const { failure: _old, ...rest } = record.data;
    const next = StoredWorldSchema.safeParse({ ...rest, status: data.status, ...(data.failure !== undefined ? { failure: data.failure } : {}) });
    if (next.success) await this.state.storage.put(RECORD, next.data);
  }

  /** Runs the Ticket effects still owed. `true` when all are done; otherwise they stay and the job wakes again soon. */
  private async settle(stored: Stored): Promise<boolean> {
    const deps = this.deps;
    if (deps === undefined || stored.pending.length === 0) return true;
    try {
      for (const e of stored.pending) {
        if (e.t === "commit") await deps.guard.commit(stored.ticket);
        else if (e.t === "release") await deps.guard.release(stored.ticket);
        else if (e.t === "tripKill") await deps.guard.setKill(true);
      }
    } catch {
      await this.state.storage.setAlarm(this.clock() + FLUSH_RETRY_MS);
      return false;
    }
    stored.pending = [];
    await this.state.storage.put(JOB, stored);
    return true;
  }

  /**
   * The world is being deleted while its job is unfinished. A job that has not yet asked the world service for anything
   * gives its unit back; one that has keeps it spent, because the service may already have charged for the world.
   */
  private async abandon(): Promise<void> {
    const deps = this.deps;
    const stored = await this.state.storage.get<Stored>(JOB);
    if (deps === undefined || stored === undefined) return;
    try {
      for (const e of stored.pending) {
        if (e.t === "commit") await deps.guard.commit(stored.ticket);
        else if (e.t === "release") await deps.guard.release(stored.ticket);
        else if (e.t === "tripKill") await deps.guard.setKill(true);
      }
      if (!isFinished(stored.data)) {
        if (stored.data.status === "queued") await deps.guard.release(stored.ticket);
        else await deps.guard.commit(stored.ticket);
      }
    } catch {
      // The reservation runs out by itself.
    }
  }
}

function failureEvent(f: UpstreamFailure): JobEvent {
  switch (f.kind) {
    case "rate_limited":
      return f.retryAfterMs === undefined ? { t: "rate_limited" } : { t: "rate_limited", retryAfterMs: f.retryAfterMs };
    case "no_credits":
      return { t: "upstream_error", status: 402 };
    case "rejected":
      return { t: "upstream_error", status: 400 };
    default:
      return { t: "upstream_error", status: 503 };
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
