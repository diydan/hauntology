import { singleFlight } from "@hauntology/shared/voice/flight";
import { retentionFromEnv } from "@hauntology/shared/world/retention";
import { createApp } from "./app";
import { conditionsFromEnv } from "./conditions/snapshot-store";
import { PartyDirectory } from "./do/party-directory";
import { PartyRoom } from "./do/party-room";
import { PlayIndex } from "./do/play-index";
import { PlaySession } from "./do/play-session";
import { SpendGuard } from "./do/spend-guard";
import { WorldJob } from "./do/live-world-job";
import type { AiBinding } from "./guarded/workersai/call";
import { WorkersAiClient } from "./guarded/workersai/client";
import type { ImagesBinding } from "./guarded/workersai/cutout";
import { WorkersAiSpeaker, voiceModelsFromEnv } from "./guarded/workersai/speak";
import { worldLabsFromEnv, type WorldLabsEnv } from "./guarded/worldlabs-live";
import type { AssetsPort } from "./http/assets";
import type { Bindings } from "./http/env";
import { createLogger } from "./log";
import { adminTokenFrom } from "./routes/admin";
import { CloudflarePlaySessions } from "./play/cloudflare";
import { SpendGuardClient } from "./spend/client";
import { R2SpeechCache } from "./voice/cache";
import { R2SpeechLibrary } from "./voice/library";
import { PlayVoiceLines } from "./voice/lines";
import { SpendGuardVoiceWindow, windowedSpend } from "./voice/window";
import { cleanupExpired } from "./worlds/cleanup";
import { CloudflareCandidateStore } from "./worlds/cloudflare-candidates";
import { CloudflareImageStore } from "./worlds/cloudflare-images";
import { CloudflareUploadStore } from "./worlds/cloudflare-uploads";
import { CloudflareWorldStore } from "./worlds/cloudflare-store";
import { CloudflareImageVerdicts } from "./worlds/cloudflare-verdicts";
import { WorldJobStarter } from "./worlds/job-starter";
import { CloudflareTurnstile } from "./worlds/turnstile";

/** The bindings of `wrangler.jsonc`: the one R2 bucket, the `WorldJob` and `SpendGuard` Durable Object namespaces and the built web app (`ASSETS`), besides the vars and secrets (and the world service's settings, `WorldLabsEnv`). */
export type WorkerEnv = Bindings & WorldLabsEnv & { ASSETS?: AssetsPort; AI?: AiBinding; IMAGES?: ImagesBinding; GHOST_MODEL_ID?: string; NARRATOR_MODEL_ID?: string; AI_GATEWAY_ID?: string; GHOST_NARRATION_ENABLED?: string; CONDITIONS_ENABLED?: string; WEATHER_BASE_URL?: string; GUARD_MODEL_ID?: string; IMAGE_MODEL_ID?: string; BUCKET: R2Bucket; WORLD_JOB: DurableObjectNamespace; SPEND_GUARD: DurableObjectNamespace; PARTY_ROOM: DurableObjectNamespace; PARTY_DIRECTORY: DurableObjectNamespace; PLAY_SESSION?: DurableObjectNamespace; PLAY_INDEX?: DurableObjectNamespace };

/** The Worker's one logger: ids, codes and counters only (`shared/src/log.ts`). */
const logger = createLogger();

/** The games (`PlaySession`, one for each, and the `PlayIndex` of which belong to which world), or `null` when the Worker has no such objects. */
export const playsFor = (env: WorkerEnv): CloudflarePlaySessions | null => (env.PLAY_SESSION !== undefined && env.PLAY_INDEX !== undefined ? new CloudflarePlaySessions(env.PLAY_SESSION, env.PLAY_INDEX) : null);

/** Deleting a world deletes its games with it (`PlaySessionPurger`), so the store is given the games. */
export const storeFor = (env: WorkerEnv): CloudflareWorldStore => {
  const plays = playsFor(env);
  return new CloudflareWorldStore({ bucket: env.BUCKET, jobs: env.WORLD_JOB, ...(plays !== null ? { playSessions: plays } : {}) });
};

// `env` is the same object for the life of an isolate, so the app is built once per isolate.
const apps = new WeakMap<object, ReturnType<typeof createApp>>();

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Response | Promise<Response> {
    let app = apps.get(env);
    if (app === undefined) {
      // A world is made only when the Worker has a key for the world service (a secret; `WorldLabsEnv`) and every setting
      // about it is acceptable (`worldLabsFromEnv`). Without one there is no job starter, the create call answers
      // `world_gen_disabled` and the Home flags say worlds are closed, as before. With one, a create call reserves a unit
      // from `SpendGuard` and starts the `WorldJob`, which makes the world through the guarded calls (world-pipeline 6.1, 7.1, 7.3).
      const live = worldLabsFromEnv(env) !== null;
      const guard = new SpendGuardClient(env.SPEND_GUARD);
      // Every Workers AI and Images adapter (world-pipeline 5.2), each `null` without its binding or with a model id it does not accept.
      const ai = new WorkersAiClient(env);
      // The ghost's voice (ghost-voice 3.6 and 3.12): `POST /api/voice/speak`, served only when the Worker has the games, the Workers AI binding and speech model ids it accepts.
      // The `AI` binding is not declared in `wrangler.jsonc` until the owner decides to spend, so until then there is no voice route and no reply names a line. The Library and the
      // cache are read first, so a scripted line and a line already heard cost nothing; one `singleFlight` for the isolate makes two requests for one line one paid call.
      // Even with the binding the voice is OFF until the operator opens a window (`POST /admin/voice`, minutes and a line cap, closing by itself): a paid `tts` reservation takes
      // a line of the window first, and the speech route, the replies and the Home flag all say "off" while it is closed (`voice/window.ts`).
      const plays = playsFor(env);
      const voiceModels = voiceModelsFromEnv(env);
      const voiceWindow = new SpendGuardVoiceWindow(env.SPEND_GUARD);
      const voice =
        plays !== null && env.AI !== undefined && voiceModels !== null
          ? { speak: { lines: new PlayVoiceLines(plays), cache: new R2SpeechCache(env.BUCKET), library: new R2SpeechLibrary(env.BUCKET), maker: new WorkersAiSpeaker(env.AI, voiceModels), spend: windowedSpend(guard, voiceWindow), flights: singleFlight(), log: logger }, window: voiceWindow }
          : null;
      app = createApp({
        log: logger,
        // The web app: with the `ASSETS` binding the Worker serves the pages too (`servePage`); without it, only the API.
        ...(env.ASSETS !== undefined ? { assets: env.ASSETS } : {}),
        worldGenAvailable: live,
        // The operator's routes exist only when `ADMIN_TOKEN` is set to a token of at least 32 characters.
        // The voice window's route is there only when the voice can be served at all.
        ...(adminTokenFrom(env.ADMIN_TOKEN) !== null ? { admin: { token: adminTokenFrom(env.ADMIN_TOKEN) as string, spend: guard, worldGenAvailable: live, ...(voice !== null ? { voice: voiceWindow } : {}) } } : {}),
        // Uploads are taken only where a world can be made from them: with no key there is nothing to keep a picture for.
        ...(live ? { uploads: { store: new CloudflareUploadStore(env.BUCKET) } } : {}),
        spend: () => guard.status(),
        ...(voice !== null ? { voice } : {}),
        // Party mode (integration 3.2): one `PartyRoom` per Room Code, one `PartyDirectory` for the caps.
        party: { rooms: env.PARTY_ROOM, directory: env.PARTY_DIRECTORY },
        // The ghost's games (ghost-engine 3 and 5): one `PlaySession` for each, so a reader of a shared place can play it.
        ...(playsFor(env) !== null
          ? {
              play: {
                sessions: playsFor(env) as CloudflarePlaySessions,
                // The ghost's words (ghost-engine 4): the model narrator, off (a `null` narrator) until the owner declares the `AI` binding and names a gateway (`AI_GATEWAY_ID`), and off while `GHOST_NARRATION_ENABLED` is `false` (the kill switch).
                narration: { narrator: ai.narrator, spend: guard, enabled: env.GHOST_NARRATION_ENABLED !== "false" },
                // The real world (conditions 3.3 and 3.4; ghost-engine 3.1): read once when a game starts and kept with it. Free and unpaid (Open-Meteo, only from `api/src/conditions/open-meteo.ts`);
                // on unless `CONDITIONS_ENABLED` is `false`, and no call at all unless the visitor chose a Place.
                conditions: conditionsFromEnv(env, { log: logger }),
              },
            }
          : {}),
        worlds: {
          store: storeFor(env),
          creation: {
            images: new CloudflareImageStore(env.BUCKET),
            guard,
            ...(live ? { starter: new WorldJobStarter(env.WORLD_JOB) } : {}),
            // The Place Brief check (5.4) needs the Workers AI binding (`AI`, which the owner adds to the Worker's configuration)
            // and a model id it accepts; without either, no picture can pass and the route says `moderation_unavailable`.
            // The sketch (5.3) needs the same binding and a model id it accepts (`IMAGE_MODEL_ID`); without either, a sketch cannot be rendered.
            candidates: new CloudflareCandidateStore(env.BUCKET),
            ...(live && ai.imager !== null ? { imager: ai.imager } : {}),
            verdicts: new CloudflareImageVerdicts(env.BUCKET),
            ...(live && ai.briefer !== null ? { briefer: ai.briefer } : {}),
            ...(typeof env.TURNSTILE_SECRET === "string" && env.TURNSTILE_SECRET !== "" ? { turnstile: new CloudflareTurnstile(env.TURNSTILE_SECRET) } : {}),
          },
        },
      });
      apps.set(env, app);
    }
    return app.fetch(request, env, ctx);
  },

  /** The cron trigger: delete what is past its retention (world-pipeline 8.1). */
  async scheduled(controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(cleanupExpired(storeFor(env), controller.scheduledTime, retentionFromEnv(env)).then((done) => logger.info("cleanup.done", { deleted: done.objects, worlds: done.worlds })));
  },
};

export { PartyDirectory, PartyRoom, PlayIndex, PlaySession, SpendGuard, WorldJob };
