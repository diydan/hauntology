import { describe, expect, it } from "vitest";
import { altFor } from "./Candidates";

describe("altFor", () => {
  it("numbers the option from 1 and quotes the caption, without its outer spaces", () => {
    expect(altFor("an attic at dusk", 0)).toBe('Option 1: "an attic at dusk", made into a picture');
    expect(altFor("  an attic  ", 1)).toBe('Option 2: "an attic", made into a picture');
  });

  it("says it is the visitor's sketch when there is no caption, or only spaces", () => {
    expect(altFor("", 0)).toBe("Option 1: your sketch, made into a picture");
    expect(altFor("   ", 1)).toBe("Option 2: your sketch, made into a picture");
  });
});
