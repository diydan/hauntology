import { SELFIE_EDIT_OPTIONS, SELFIE_GHOST_PROMPT } from "@hauntology/shared/party/photo-verdict";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import { assertTicket } from "../ticket";
import type { CallFailure } from "./call";

/**
 * The selfie ghost's picture (party-mode 3.12, 5.5): one image-edit call with the selfie and a narrator style reference, a
 * fixed server-built prompt with no Player text, 1:1, 1K, PNG. This file holds the port and its only door; **there is no
 * adapter yet** (the model, `google/nano-banana-2.1`, is called through the AI Gateway and its data retention is unconfirmed:
 * a spike decides, and `WorkersAiClient` has no `editor` until then, so the selfie ghost is off and every Player gets a Preset).
 */
export type EditRequest = { selfie: Uint8Array; selfieType: string; styleRef: Uint8Array; styleType: string; prompt: string; options: typeof SELFIE_EDIT_OPTIONS };
export type EditAnswer = { ok: true; image: Uint8Array } | { ok: false; kind: CallFailure };
export interface PortraitEditor {
  edit(req: EditRequest): Promise<EditAnswer>;
}

/** The only door to the editor: it needs a Ticket for the `image` meter, and the prompt is always the fixed one. */
export function editPortrait(editor: PortraitEditor, ticket: SpendTicket, req: Omit<EditRequest, "prompt" | "options">): Promise<EditAnswer> {
  assertTicket(ticket, "image");
  return editor.edit({ ...req, prompt: SELFIE_GHOST_PROMPT, options: SELFIE_EDIT_OPTIONS });
}
