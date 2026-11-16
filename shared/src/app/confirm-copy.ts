import type { QuotaSnapshot } from "./types";

/**
 * The fixed words of the Confirm Gate (Requirements 3.1 to 3.4). It says what will happen and what it
 * uses, in places and never in money, and promises nothing before the visitor presses the button.
 */
export const CONFIRM_QUESTION = "Enter this place?";
export const CONFIRM_IMAGE_ALT = "The picture your place will be made from";
export const CONFIRM_IMAGE_CAPTION = "This is the exact picture your place will be made from.";
export const CONFIRM_NOTHING_YET = "Nothing is made until you press Enter this place. Going back uses nothing.";

export const placesLeftLine = (quota: Pick<QuotaSnapshot, "world">): string => `Places left this visit: ${quota.world}`;

/** `null` when the quote says a place can still be made, else the one line that says why Enter is off. */
export function noPlacesLine(quota: Pick<QuotaSnapshot, "world">): string | null {
  return quota.world >= 1 ? null : "You have no places left this visit. You can still visit the Gallery.";
}

export const TURNSTILE_HEADING = "One quick check";
export const TURNSTILE_ASK = "Please complete the check below to show you are a person. Your place is made right after.";
export const TURNSTILE_LOADING = "Loading the check…";
export const TURNSTILE_LOAD_FAILED = "The check could not load. Try again, or visit the Gallery.";
export const TURNSTILE_NOT_SET_UP = "The check is not set up here. You can still visit the Gallery.";
export const TURNSTILE_DID_NOT_WORK = "The check did not work. Please try it again.";
export const TURNSTILE_RAN_OUT = "The check ran out. Please do it again.";

export const ENTER_BUSY = "Making your place…";
