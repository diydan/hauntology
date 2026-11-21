/**
 * What the phone asks of the Room's contribution routes (party-mode 9.8): the photo prompts and a photo for a frame, a Zone name, and a Suspect in the Ghost
 * Creator's two steps. The Room checks and may refuse, and any failure is a Preset Ghost or a default, so a contribution never stops the lobby.
 */
export type Result<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; code: string; reason?: string }>;
export type PhotoPrompt = Readonly<{ id: string; text: string; tip: string; source: "camera_roll" | "take_now" }>;
export type PromptOffer = Readonly<{ round: number; prompts: readonly PhotoPrompt[] }>;
export type TraitsInput = Readonly<{ epoch: string; temperament: string; relation: string; palette: string; translucency: number; accessories: readonly string[]; voice: string; detail?: string }>;
export type Candidate = Readonly<{ candidateId: string; imageUrl: string }>;
export type PortraitsResult = Readonly<{ fallback: true; reason?: string; profileId: string }> | Readonly<{ fallback: false; candidates: readonly Candidate[] }>;
export type SpriteResult = Readonly<{ fallback: boolean; profileId: string; reason?: string }>;

export interface ContributionApi {
  prompts(): Promise<Result<PromptOffer>>;
  /** Three more prompts, up to three times; the Room says when the skips are used. */
  skip(): Promise<Result<PromptOffer>>;
  uploadPhoto(file: Blob, promptId?: string): Promise<Result<{ status: "accepted" }>>;
  zoneName(name: string): Promise<Result<{ name: string }>>;
  suspectPortraits(traits: TraitsInput): Promise<Result<PortraitsResult>>;
  suspectSprite(candidateId: string, voice?: "lower" | "lighter"): Promise<Result<SpriteResult>>;
}

/** The plain words for a refusal of the contribution routes. A code with no words of its own gets the general line. */
export const CONTRIBUTION_WORDS: Readonly<Record<string, string>> = {
  photo_rejected: "That photo can't be used. Try another one.",
  "photo_rejected:person_visible": "A person can be seen in that photo. Pick a picture without anyone in it.",
  "photo_rejected:unsafe": "That photo can't be used. Try another one.",
  upload_too_large: "That photo is too big. Try a smaller one.", upload_bad_type: "That is not a photo this game can use.", upload_bad_magic: "That is not a photo this game can use.",
  upload_too_small: "That photo is too small. Try a bigger one.", upload_rejected: "That photo can't be used. Try another one.",
  moderation_unavailable: "The photo check is not available right now. You can try again, or skip this.", photo_unavailable: "The photo could not be prepared. Try again, or skip this.",
  quota_image: "This game has used all its picture budget. You can skip this.", quota_model: "This game has used all its checking budget. You can skip this.",
  name_invalid: "That name is not allowed. Use a few plain words.", name_unsafe: "That name can't be used. Try another.",
  prompt_skips_used: "No more new ideas. Pick one of these, or use your own photo.",
  game_started: "The game has started, so it is too late to add this.", contributions_unavailable: "Adding things is not available right now. The game will use ready-made ones.",
  rate_limited: "Too many tries. Wait a moment.", bad_token: "This phone is not in the game any more.", room_unknown: "This game has ended.", unreachable: "The game could not be reached. Check the connection.",
};
export const contributionWords = (code: string, reason?: string): string => CONTRIBUTION_WORDS[reason === undefined ? code : `${code}:${reason}`] ?? CONTRIBUTION_WORDS[code] ?? "That did not work. You can try again, or skip this.";
