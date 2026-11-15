import { describe, expect, it } from "vitest";
import { isAllowedOrigin, parseOriginList } from "./origin";

const URL_ = "https://hauntology.example/api/worlds";

describe("isAllowedOrigin", () => {
  it("allows exactly the origin the request was sent to", () => {
    expect(isAllowedOrigin("https://hauntology.example", URL_)).toBe(true);
    expect(isAllowedOrigin("http://localhost:8787", "http://localhost:8787/api/x")).toBe(true);
  });

  it("refuses a missing header, null and every near miss", () => {
    for (const o of [
      undefined, "", "null", "https://hauntology.example/", "http://hauntology.example", "https://hauntology.example:8443",
      "https://evil.example", "https://hauntology.example.evil.example", "HTTPS://HAUNTOLOGY.EXAMPLE", "https://sub.hauntology.example",
      " https://hauntology.example", "https://hauntology.example ", "*",
    ]) {
      expect(isAllowedOrigin(o, URL_), JSON.stringify(o)).toBe(false);
    }
  });

  it("allows an extra origin only when it matches exactly", () => {
    const extra = ["http://localhost:5173"];
    expect(isAllowedOrigin("http://localhost:5173", URL_, extra)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5174", URL_, extra)).toBe(false);
    expect(isAllowedOrigin("http://localhost:5173/", URL_, extra)).toBe(false);
  });

  it("refuses when the request URL cannot be read", () => {
    expect(isAllowedOrigin("https://hauntology.example", "not a url")).toBe(false);
  });
});

describe("parseOriginList", () => {
  it("splits on commas, trims and drops blanks", () => {
    expect(parseOriginList("http://a, http://b ,, ")).toEqual(["http://a", "http://b"]);
    expect(parseOriginList(undefined)).toEqual([]);
    expect(parseOriginList("")).toEqual([]);
  });
});
