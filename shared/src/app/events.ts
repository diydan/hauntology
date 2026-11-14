import { z } from "zod";
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
