import type { ImageMaker, PlaceBriefer } from "../../worlds/ports";
import type { AiBinding } from "./call";
import { ImagesForegroundCutter, type ForegroundCutter, type ImagesBinding } from "./cutout";
import { LlamaGuardTextGuard, guardModelFromEnv, type TextGuard } from "./guard";
import { DEFAULT_IMAGE_MODEL, FluxImageMaker } from "./image";
import { catalogModelFromEnv } from "./model";
import { ScoutPlaceBriefer, scoutModelFromEnv } from "./scout";
import { ScoutTextMaker, type TextMaker } from "./text";

/** What the client reads from the Worker: the two bindings (`AI`, `IMAGES`, both declared by the owner in `wrangler.jsonc`) and the three model ids. */
export type WorkersAiEnv = { AI?: AiBinding; IMAGES?: ImagesBinding; GHOST_MODEL_ID?: string; GUARD_MODEL_ID?: string; IMAGE_MODEL_ID?: string };

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
  /** Free text: Llama Guard 3, `GUARD_MODEL_ID`. */
  readonly guard: TextGuard | null;
  /** The sketch to a picture (5.3): `IMAGE_MODEL_ID`. */
  readonly imager: ImageMaker | null;
  /** The background of a portrait: Cloudflare Images. */
  readonly cutter: ForegroundCutter | null;

  constructor(env: WorkersAiEnv) {
    const ai = env.AI;
    const scout = scoutModelFromEnv(env.GHOST_MODEL_ID);
    const guard = guardModelFromEnv(env.GUARD_MODEL_ID);
    const image = catalogModelFromEnv(env.IMAGE_MODEL_ID, DEFAULT_IMAGE_MODEL);
    this.briefer = ai !== undefined && scout !== null ? new ScoutPlaceBriefer(ai, scout) : null;
    this.text = ai !== undefined && scout !== null ? new ScoutTextMaker(ai, scout) : null;
    this.guard = ai !== undefined && guard !== null ? new LlamaGuardTextGuard(ai, guard) : null;
    this.imager = ai !== undefined && image !== null ? new FluxImageMaker(ai, image) : null;
    this.cutter = env.IMAGES !== undefined ? new ImagesForegroundCutter(env.IMAGES) : null;
  }
}
