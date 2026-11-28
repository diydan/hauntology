import { z } from "zod";
import { AtmosphereSchema } from "../conditions/types";
import { ErrorCode } from "../errors";
import { DOOR_ID_PATTERN, MAX_DOORS } from "../party/doors";
import { SIGNS } from "../puzzles/world-clues";
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

const PictureShapeSchema = z.object({
  t: z.enum(["circle", "rect", "tri"]),
  x: z.number().finite(),
  y: z.number().finite(),
  s: z.number().finite(),
  c: z.string().min(1),
  a: z.number().finite(),
}).strict();

const SightPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("wires"), order: z.array(z.number().int().nonnegative()).max(8) }).strict(),
  z.object({ kind: z.literal("clock"), h: z.number().int().min(1).max(12), m: z.number().int().min(0).max(59) }).strict(),
  z.object({ kind: z.literal("safe"), code: z.array(z.number().int().min(0).max(99)).max(8) }).strict(),
  z.object({ kind: z.literal("moved"), shelf: z.array(z.number().int().nonnegative()).max(16) }).strict(),
  z.object({
    kind: z.literal("photo"),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    picture: z.object({ top: z.string().min(1), bottom: z.string().min(1), shapes: z.array(PictureShapeSchema).max(32) }).strict(),
  }).strict(),
  z.object({ kind: z.literal("knock"), groups: z.array(z.number().int().positive()).max(8), long: z.number().int().nonnegative().nullable() }).strict(),
]);

export const PublicWorldClueSchema = z.object({ zone: z.string().min(1), sign: z.enum(SIGNS), sight: SightPayloadSchema }).strict();

/** Viewer to Shell. `pose` is sent at most 4 times a second; `fps` about once a second, for the debug overlay. */
export const ViewerToShellSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("pose"), pos: Vec3Schema, yaw: z.number().finite() }).strict(),
  z.object({ t: z.literal("prompt"), target: z.enum(["anchor", "ghost"]).nullable() }).strict(),
  z.object({ t: z.literal("clue_seen"), sign: z.enum(SIGNS) }).strict(),
  z.object({ t: z.literal("degraded"), rung: z.enum(VIEWER_RUNGS) }).strict(),
  z.object({ t: z.literal("fps"), fps: z.number().finite().nonnegative() }).strict(),
]);
export type ViewerToShell = z.infer<typeof ViewerToShellSchema>;

const ViewerDoorSchema = z.object({
  id: z.string().regex(DOOR_ID_PATTERN),
  x: z.number().finite(),
  z: z.number().finite(),
  width: z.number().finite().positive(),
  yaw: z.number().finite(),
  open: z.boolean(),
}).strict();

/** A free-standing photo frame (party-mode 8.4): where it stands, which way it faces, and the Room's own photo address (or none, an empty frame). */
const ViewerFrameSchema = z.object({
  zone: z.string().regex(/^[a-z][a-z0-9-]{0,15}$/),
  pos: Vec3Schema,
  yaw: z.number().finite(),
  // the Room's own photo address, or a `blob:` address the Host made from it (the photo route needs the Host's token, which a texture load cannot send)
  url: z.string().regex(/^(\/api\/party\/[A-Za-z0-9]{4}\/photo\/[A-Za-z0-9_-]{1,64}|blob:https?:\/\/[A-Za-z0-9.:\[\]-]{1,80}\/[0-9a-f-]{36})$/).nullable(),
}).strict();
export const MAX_FRAMES = 6;

/** Shell to Viewer. `hauntLevel` is 0 to 1 (world-viewer glossary). */
export const ShellToViewerSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("set_input_mode"), mode: z.enum(["play", "chat"]) }).strict(),
  // The frozen conditions of the place, or null to restore the normal look. Idempotent.
  z.object({ t: z.literal("set_atmosphere"), atmosphere: AtmosphereSchema.nullable() }).strict(),
  // The doors of the world (knock-door 8.1): where each stands, how wide, the wall's angle and whether it is open. Never the lock or a pattern. Empty for a world with no doors.
  z.object({ t: z.literal("set_doors"), doors: z.array(ViewerDoorSchema).max(MAX_DOORS) }).strict(),
  z.object({ t: z.literal("set_world_clues"), clues: z.array(PublicWorldClueSchema).max(6) }).strict(),
  // The active Detective's walk, from their phone through the Host (party-mode 8.3): one frame of the same stick and look for everyone. Axes are -1 to 1; the look
  // is a turn in radians for this message. The Viewer holds the axes for a quarter of a second, so a Host that stops sending stops the walk.
  z.object({ t: z.literal("remote_input"), forward: z.number().finite().min(-1).max(1), strafe: z.number().finite().min(-1).max(1), yawDelta: z.number().finite().min(-0.5).max(0.5), pitchDelta: z.number().finite().min(-0.5).max(0.5) }).strict(),
  // The photo frames near the Zones (party-mode 8.4): pictures on stands, never walls, no collision. Idempotent: the whole set each time.
  z.object({ t: z.literal("set_frames"), frames: z.array(ViewerFrameSchema).max(MAX_FRAMES) }).strict(),
  // The Restless ghost's Sprite moves to this spot (party-mode 8.9), or back to its usual place with null.
  z.object({ t: z.literal("ghost_to"), pos: Vec3Schema.nullable() }).strict(),
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
