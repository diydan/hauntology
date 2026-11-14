import { z } from "zod";
import { AtmosphereSchema } from "../conditions/types";
import { ErrorCode } from "../errors";
import { VIEWER_RUNGS } from "./types";

/**
 * The Shell-to-Viewer contract. Both sides import this file; neither imports the other's internals.
 * Every object is strict, so an extra field (for example a hidden seed) fails validation.
 *
 * `AnchorId` and `Anchor` match the ghost-engine design (`shared/src/ghost/`); they move there
 * when ghost-engine task 2.5 lands, and this file then imports them.
 */

export const Vec3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export type Vec3 = z.infer<typeof Vec3Schema>;

export const AnchorIdSchema = z.enum(["a1", "a2", "a3"]);
export type AnchorId = z.infer<typeof AnchorIdSchema>;

export const AnchorSchema = z.object({ id: AnchorIdSchema, pos: Vec3Schema, radius: z.number().finite().positive() }).strict();
export type Anchor = z.infer<typeof AnchorSchema>;

/** Viewer to Shell. `pose` is sent at most 4 times a second. */
export const ViewerToShellSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("pose"), pos: Vec3Schema, yaw: z.number().finite() }).strict(),
  z.object({ t: z.literal("prompt"), target: z.enum(["anchor", "ghost"]).nullable() }).strict(),
  z.object({ t: z.literal("degraded"), rung: z.enum(VIEWER_RUNGS) }).strict(),
]);
export type ViewerToShell = z.infer<typeof ViewerToShellSchema>;

/** Shell to Viewer. `hauntLevel` is 0 to 1 (world-viewer glossary). */
export const ShellToViewerSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("set_input_mode"), mode: z.enum(["play", "chat"]) }).strict(),
  // The frozen conditions of the place, or null to restore the normal look. Idempotent.
  z.object({ t: z.literal("set_atmosphere"), atmosphere: AtmosphereSchema.nullable() }).strict(),
  z
    .object({
      t: z.literal("apply_view"),
      found: z.array(AnchorIdSchema).max(3),
      anchors: z.array(AnchorSchema).max(3),
      hauntLevel: z.number().finite().min(0).max(1),
      ghostVisible: z.boolean(),
    })
    .strict(),
]);
export type ShellToViewer = z.infer<typeof ShellToViewerSchema>;

/** `null` for anything that is not a valid message. */
export const parseViewerMessage = (input: unknown): ViewerToShell | null => {
  const r = ViewerToShellSchema.safeParse(input);
  return r.success ? r.data : null;
};

export const parseShellMessage = (input: unknown): ShellToViewer | null => {
  const r = ShellToViewerSchema.safeParse(input);
  return r.success ? r.data : null;
};

/**
 * Host to Shell, for "Play a case" (shell Requirement 13; the party Host page is `party-mode` 8.15).
 * The Host page runs the solo Room; the Shell only learns how it is going. Strict, so nothing else
 * (a card, a note, a seed) can come through this door.
 *
 * - `started`: the Room is up and the game has begun.
 * - `refused`: no Room was made. `code` is `world_too_small`, `party_disabled`, `rooms_full` or another API code.
 * - `scripted`: the narration is scripted lines (the indicator of Requirement 5.4).
 * - `ended`: the game is over and the party ending is on screen.
 */
const ERROR_CODES = Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]];
export const HostToShellSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("started") }).strict(),
  z.object({ t: z.literal("refused"), code: z.enum(ERROR_CODES) }).strict(),
  z.object({ t: z.literal("scripted") }).strict(),
  z.object({ t: z.literal("ended") }).strict(),
]);
export type HostToShell = z.infer<typeof HostToShellSchema>;

export const parseHostMessage = (input: unknown): HostToShell | null => {
  const r = HostToShellSchema.safeParse(input);
  return r.success ? r.data : null;
};

/**
 * Ghost Creator to Shell, on Haunt (Requirement 4.2; the Creator is the `ghost-creator` spec). The
 * Creator keeps the profile it made with the API, under the world, so the Shell only needs to know
 * that a ghost is now chosen. Strict, so nothing else can come through this door.
 */
export const CreatorToShellSchema = z.discriminatedUnion("t", [z.object({ t: z.literal("chosen") }).strict()]);
export type CreatorToShell = z.infer<typeof CreatorToShellSchema>;

export const parseCreatorMessage = (input: unknown): CreatorToShell | null => {
  const r = CreatorToShellSchema.safeParse(input);
  return r.success ? r.data : null;
};
