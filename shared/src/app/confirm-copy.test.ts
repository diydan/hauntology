import { describe, expect, it } from "vitest";
import {
  CONFIRM_IMAGE_ALT, CONFIRM_NOTHING_YET, CONFIRM_QUESTION, TURNSTILE_ASK, TURNSTILE_DID_NOT_WORK, TURNSTILE_LOADING, TURNSTILE_LOAD_FAILED, TURNSTILE_NOT_SET_UP, TURNSTILE_RAN_OUT,
  noPlacesLine, placesLeftLine,
} from "./confirm-copy";

describe("Confirm Gate copy", () => {
  it("asks the question of Requirement 3.1", () => {
    expect(CONFIRM_QUESTION).toBe("Enter this place?");
  });

  it("counts the places left from the quote", () => {
    expect(placesLeftLine({ world: 2 })).toBe("Places left this visit: 2");
    expect(placesLeftLine({ world: 0 })).toBe("Places left this visit: 0");
  });

  it("turns Enter off, with a line, only when no place is left, and keeps the Gallery in it", () => {
    expect(noPlacesLine({ world: 1 })).toBeNull();
    expect(noPlacesLine({ world: 5 })).toBeNull();
    expect(noPlacesLine({ world: 0 })).toMatch(/no places left/);
    expect(noPlacesLine({ world: 0 })).toMatch(/Gallery/);
    expect(noPlacesLine({ world: -1 })).not.toBeNull();
  });

  it("promises nothing about money, and says that nothing is made before the button", () => {
    for (const line of [CONFIRM_IMAGE_ALT, CONFIRM_NOTHING_YET, TURNSTILE_ASK, TURNSTILE_LOADING, TURNSTILE_LOAD_FAILED, TURNSTILE_NOT_SET_UP, TURNSTILE_DID_NOT_WORK, TURNSTILE_RAN_OUT]) {
      expect(line).not.toMatch(/[$€£]|\bfree\b|\bcost|\bpay|\bcredit/i);
      expect(line).not.toMatch(/\n/);
    }
    expect(CONFIRM_NOTHING_YET).toMatch(/Nothing is made until/);
    expect(CONFIRM_NOTHING_YET).toMatch(/Going back uses nothing/);
  });
});
