import type { ImageMaker, PlaceBriefer } from "../../worlds/ports";
import type { AiBinding } from "./call";
import { ImagesForegroundCutter, type ForegroundCutter, type ImagesBinding } from "./cutout";
import { LlamaGuardTextGuard, guardModelFromEnv, type TextGuard } from "./guard";
import { DEFAULT_IMAGE_MODEL, FluxImageMaker, FluxPortraitMaker, type PortraitMaker } from "./image";
import { catalogModelFromEnv } from "./model";
import { HaikuNarrator, gatewayIdFromEnv, narratorModelFromEnv, type Narrator } from "./narrator";
import { ScoutPlaceBriefer, scoutModelFromEnv } from "./scout";
import { ScoutTextMaker, type TextMaker } from "./text";

/** What the client reads from the Worker: the two bindings (`AI`, `IMAGES`, both declared by the owner in `wrangler.jsonc`) and the three model ids. */
export type WorkersAiEnv = { AI?: AiBinding; IMAGES?: ImagesBinding; GHOST_MODEL_ID?: string; GUARD_MODEL_ID?: string; IMAGE_MODEL_ID?: string; NARRATOR_MODEL_ID?: string; AI_GATEWAY_ID?: string };

/**
 * The one `WorkersAiClient` (world-pipeline 5.2): every paid Workers AI and Images call the project makes, as the adapters that
 * make them. Each is `null` when its binding is missing or its model id is not one the project accepts (`@cf/<author>/<model>`
 * or blank for the default; a model is also a price), so a feature without its adapter is off, never guessed at. The adapters are
 * used only through the guarded doors beside them (`briefPlace`, `renderCandidate`, `generateText`, `moderateText`,
 * `cutOutForeground`), each of which needs a Ticket from `SpendGuard` for its own meter. No route names a model.
 */
export class WorkersAiClient {
  /** The Place Brief check (5.4) and the ghost's text both use `GHOST_MODEL_ID`. */
  readonly briefer: PlaceBriefer | null;
  readonly text: TextMaker | null;
  /** The ghost's narration (ghost-engine 4.1), proposed: Haiku 5.5 through the AI Gateway. `null` until the owner names a gateway (`AI_GATEWAY_ID`), so the ghost speaks only scripted lines. */
  readonly narrator: Narrator | null;
  /** Free text: Llama Guard 3, `GUARD_MODEL_ID`. */
  readonly guard: TextGuard | null;
  /** The sketch to a picture (5.3): `IMAGE_MODEL_ID`. */
  readonly imager: ImageMaker | null;
  /** A ghost portrait from words alone (ghost-creator task 3): the same image model. */
  readonly portraitist: PortraitMaker | null;
  /** The background of a portrait: Cloudflare Images. */
  readonly cutter: ForegroundCutter | null;

  constructor(env: WorkersAiEnv) {
    const ai = env.AI;
    const scout = scoutModelFromEnv(env.GHOST_MODEL_ID);
    const guard = guardModelFromEnv(env.GUARD_MODEL_ID);
    const image = catalogModelFromEnv(env.IMAGE_MODEL_ID, DEFAULT_IMAGE_MODEL);
    const narrator = narratorModelFromEnv(env.NARRATOR_MODEL_ID);
    const gateway = gatewayIdFromEnv(env.AI_GATEWAY_ID);
    this.briefer = ai !== undefined && scout !== null ? new ScoutPlaceBriefer(ai, scout) : null;
    this.text = ai !== undefined && scout !== null ? new ScoutTextMaker(ai, scout) : null;
    this.narrator = ai !== undefined && narrator !== null && gateway !== null ? new HaikuNarrator(ai, narrator, gateway) : null;
    this.guard = ai !== undefined && guard !== null ? new LlamaGuardTextGuard(ai, guard) : null;
    this.imager = ai !== undefined && image !== null ? new FluxImageMaker(ai, image) : null;
    this.portraitist = ai !== undefined && image !== null ? new FluxPortraitMaker(ai, image) : null;
    this.cutter = env.IMAGES !== undefined ? new ImagesForegroundCutter(env.IMAGES) : null;
  }
}
