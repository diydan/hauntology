import type { ErrorCode } from "../errors";

/**
 * What the visitor reads for each error code. The text is fixed here: the shell never shows a
 * `message` from the server. Copy is plain and gentle, and it makes no claim about money or
 * quota; the screen states that from data it has.
 */
export type ErrorNext = "retry" | "gallery" | "home" | "wait";
export type ErrorCopy = { title: string; body: string; next: ErrorNext };

const c = (title: string, body: string, next: ErrorNext): ErrorCopy => ({ title, body, next });

/** A `Record` over every `ErrorCode`: adding a code without copy is a compile error. */
export const ERROR_COPY: Record<ErrorCode, ErrorCopy> = {
  upload_too_large: c("That photo is too big", "Pick a photo under 10 MB.", "retry"),
  upload_too_small: c("That photo is too small", "Pick a photo at least 512 pixels on its short side.", "retry"),
  upload_bad_type: c("We can't use that file", "Use a JPEG, PNG or WebP photo.", "retry"),
  upload_bad_magic: c("That file isn't a real photo", "It does not look like the type it claims to be. Try another photo.", "retry"),
  upload_rejected: c("We couldn't take that photo", "Try a different one.", "retry"),
  blank_sketch: c("The page is still empty", "Draw a little more, then try again.", "retry"),
  unsafe_image: c("That picture can't be used", "Pick a different one.", "retry"),
  bad_confirm: c("That confirmation didn't work", "Look at your place again and confirm once more.", "retry"),
  confirm_expired: c("That confirmation ran out", "It only lasts a short while. Look at your place again to confirm.", "retry"),
  turnstile_failed: c("We couldn't check you're a person", "Try the check again.", "retry"),
  world_gen_disabled: c("New places are paused", "The gallery is open. Visit a place from there.", "gallery"),
  quota_image: c("No pictures left for now", "Your picture allowance is used up. The gallery needs none.", "gallery"),
  quota_model: c("The ghost is out of words", "It will use its old lines for now.", "gallery"),
  quota_session: c("You've made your places for this visit", "Visit a gallery place instead.", "gallery"),
  quota_day: c("Today's places are all made", "Come back tomorrow, or visit the gallery now.", "gallery"),
  quota_total: c("All the places are made", "Making new places has closed. The gallery is open.", "gallery"),
  spend_denied: c("That can't be made right now", "Visit the gallery instead.", "gallery"),
  upstream_rate_limited: c("The place maker is busy", "Wait a moment, then try again.", "wait"),
  upstream_rejected: c("That place couldn't be made", "Try another picture, or visit the gallery.", "gallery"),
  upstream_no_credits: c("New places are paused", "The gallery is open. Visit a place from there.", "gallery"),
  ingest_failed: c("The place got lost on the way", "Try again, or visit the gallery.", "retry"),
  timeout: c("That took too long", "The place was not ready in time. Try again, or visit the gallery.", "retry"),
  world_not_found: c("That place is gone", "It may have been deleted, or it ran out of time. Visit the gallery.", "gallery"),
  world_too_small: c("That place is too small for a game", "Pick a bigger place from the gallery.", "gallery"),
  network_error: c("We could not reach the server", "Check your connection and try again. Nothing was lost.", "retry"),
  shell_crash: c("Something broke on our side", "Your place is safe. Go home and try again.", "home"),
  session_expired: c("Your visit has ended", "Start again from the home page.", "home"),
  conditions_disabled: c("The sky is fixed for now", "Place search is off, so the default sky is used.", "home"),
  bad_place: c("We couldn't use that place", "Search again and pick one from the list.", "retry"),
  bad_memory_day: c("That day isn't available", "Pick a date from 1940 up to yesterday.", "retry"),
  geocode_unavailable: c("Place search is not answering", "Try again in a moment, or leave the sky as it is.", "retry"),
  voice_unavailable: c("The ghost is quiet", "Its voice is not available right now. Its words are shown below.", "wait"),
  clip_too_long: c("That was too long", "Hold the button for up to 8 seconds, then let go.", "retry"),
  clip_not_heard: c("We did not catch that word", "Say it again, a little clearer.", "retry"),
  stitch_not_on: c("Stitch is not on", "The Master has not turned it on for this room.", "wait"),
  stitch_no_consent: c("Stitch needs your yes", "Say yes for yourself first.", "retry"),
  stitch_check_limit: c("That is all the checks for now", "You have used your word checks for this game.", "wait"),
  live_unavailable: c("Live talk is not available", "Use the hold-to-talk button instead.", "retry"),
  bad_origin: c("That didn't come from this page", "Reload the page and try again.", "retry"),
  session_not_found: c("That walk isn't there any more", "Start a new walk from the home page.", "home"),
  session_ended: c("That walk is over", "Start a new one to haunt again.", "home"),
  not_your_turn: c("Not your turn yet", "Wait for your turn.", "wait"),
  party_disabled: c("Party mode is off", "You can still walk alone.", "home"),
  rooms_full: c("All rooms are busy", "Try again in a little while.", "wait"),
  room_unknown: c("That room code isn't right", "Check the code and try again.", "retry"),
  room_full: c("That room is full", "Ask the host to make space.", "wait"),
  game_started: c("That game has begun", "Wait for the next one.", "wait"),
  bad_token: c("That seat isn't yours", "Join the room again.", "home"),
  rate_limited: c("Slow down a little", "Wait a moment, then try again.", "wait"),
  not_in_zone: c("Nothing to do here", "Walk into a zone first.", "retry"),
  already_suggested: c("Already asked", "That suggestion has been made.", "wait"),
  bad_relic_token: c("We couldn't read that relic", "Try another relic, or pick from the list.", "retry"),
  moderation_unavailable: c("We can't check that picture right now", "Try again soon, or use the gallery.", "retry"),
  photo_rejected: c("We can't use that photo", "Pick another one with no people or faces in it.", "retry"),
  not_master: c("Only the Master can do that", "Ask the Master of the room.", "wait"),
  world_not_set: c("No place chosen yet", "The Master picks a place before the game starts.", "wait"),
  poltergeist: c("The haunting can't do that", "You joined the haunting, so you can't take that turn.", "wait"),
  cold_spot: c("That room is cold", "Nothing can be asked here for now. Try another room.", "retry"),
  already_inspected: c("You searched here already", "Try another room.", "retry"),
  eavesdrop_denied: c("You couldn't listen in", "You need Resolve, and the moment has to still be open.", "wait"),
  nudge_denied: c("The clock won't move", "That nudge isn't allowed right now.", "wait"),
  cue_denied: c("Not yet", "Wait a moment before another sound.", "wait"),
  frame_denied: c("That one stays quiet", "A sound can't go to that phone right now.", "wait"),
  rattle_denied: c("The house stays still", "Rattle isn't available right now.", "wait"),
  stitch_denied: c("No whisper for now", "Stitch isn't available at this moment.", "wait"),
  puzzle_disabled: c("Puzzles are off", "The game plays without them.", "home"),
  puzzle_not_open: c("That lock isn't open", "Go back to the room and try the lock again.", "retry"),
  puzzle_already_open: c("A lock is already open", "Finish it or leave it first.", "retry"),
  puzzle_bad_transcript: c("That try didn't work", "Something went wrong with it. Try the lock again.", "retry"),
  puzzle_too_fast: c("That was too quick", "Take a moment and try again.", "retry"),
  puzzle_rate_limited: c("Slow down a little", "Wait a moment, then try again.", "wait"),
  puzzle_attempts_spent: c("No tries left", "The lock stays shut for now. You can try it again later.", "home"),
  puzzle_bad_placement: c("The locks couldn't be set", "Start the game again.", "home"),
  sight_unknown: c("We can't find that memory", "Look around the room again.", "retry"),
};

/** For any string the table does not know, including text a network could send. */
export const GENERIC_COPY: ErrorCopy = c("Something went wrong", "Please try again. If it keeps happening, go home.", "retry");

// A Map, not a property lookup: names like "toString" or "__proto__" must not find anything.
const COPY_BY_CODE: ReadonlyMap<string, ErrorCopy> = new Map(Object.entries(ERROR_COPY));

export function errorCopy(code: string): ErrorCopy {
  return COPY_BY_CODE.get(code) ?? GENERIC_COPY;
}

/**
 * The reasons that go with a denial (`nudge_denied:spook_round_limit`). A denial arrives as `code:reason`; the code has
 * its copy above and the reason a short plain line here, so the table can say why. Nothing is spent on a refusal.
 */
export const DENIAL_REASONS = {
  // nudge_denied
  no_clock: "There is no running clock to change.", own_turn: "You can't do that on your own turn.", bot: "A Bot can't do that.",
  spook_off: "The Master turned Spook off.", nudges_off: "The Master turned nudges off.", no_resolve: "You need more Resolve.",
  help_turn_limit: "This turn already had a Help.", spook_turn_limit: "This turn already had a Spook.", clock_at_cap: "The clock is already as long as it goes.",
  spook_time_left: "Too little time is left to Spook.", spook_turn_too_short: "That would leave the turn too short.",
  spook_round_limit: "A Spook was already used this round.", spook_gap: "A Spook was used too recently.", spook_repeat: "You Spooked on the last turn.",
  // cue_denied and rattle_denied
  cue_gap: "Wait a few seconds between sounds.", too_many_playing: "Three sounds are already playing.", turn_cue_limit: "That is all the sounds for this turn.",
  // frame_denied
  frames_off: "The Master turned Frames off.", self: "You can't pick yourself.", no_consent: "That phone hasn't said yes to sound.", phone_busy: "That phone has had its sounds this round.",
  sender_round_limit: "You already sent one this round.", target_round_limit: "That phone already had one this round.", cue_limit: "Wait a few seconds between sounds.",
  // rattle_denied
  rattle_off: "The Master turned Rattle off.", not_poltergeist: "Only the haunting can rattle.", rattle_not_on: "Turn Rattle on first.",
  // stitch_denied
  disabled: "Stitch is off.", wrong_moment: "Not at this moment.", too_early: "It is too early in the game.", accusation_active: "Not while accusations are read.",
  round_cap: "One whisper a round is enough.", game_cap: "That is all the whispers for this game.", no_eligible_seat: "Nobody has recorded enough words.",
} as const satisfies Record<string, string>;
export type DenialReason = keyof typeof DENIAL_REASONS;

/** The copy for `code:reason`: the code's own copy, with the reason's line as the body when the reason is known. */
export function denialCopy(raw: string): ErrorCopy {
  const [code, reason] = raw.split(":") as [string, string | undefined];
  const base = errorCopy(code);
  const line = reason !== undefined && Object.prototype.hasOwnProperty.call(DENIAL_REASONS, reason) ? DENIAL_REASONS[reason as DenialReason] : undefined;
  return line === undefined ? base : { ...base, body: line };
}

export const RETRY_MIN_SEC = 1;
export const RETRY_MAX_SEC = 120;

/**
 * When a control may be used again after a 429. The advised delay is clamped to 1 to 120 seconds.
 * A value that is not a number counts as the minimum; the API client passes a default when the
 * header is missing.
 */
export function retryGate(retryAfterSec: number, now: number): { enabledAt: number } {
  const sec = Number.isNaN(retryAfterSec) ? RETRY_MIN_SEC : Math.min(RETRY_MAX_SEC, Math.max(RETRY_MIN_SEC, retryAfterSec));
  return { enabledAt: now + sec * 1000 };
}

export const controlEnabled = (gate: { enabledAt: number }, now: number): boolean => now >= gate.enabledAt;
