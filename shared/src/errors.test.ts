import { describe, expect, it } from "vitest";
import { ErrorCode, fail, ok } from "./errors";

describe("ErrorCode", () => {
  it("has every value equal to its key", () => {
    for (const [key, value] of Object.entries(ErrorCode)) {
      expect(value).toBe(key);
    }
  });

  it("has the codes the web shell depends on", () => {
    expect(ErrorCode.shell_crash).toBe("shell_crash");
    expect(ErrorCode.session_expired).toBe("session_expired");
    expect(ErrorCode.world_not_found).toBe("world_not_found");
  });

  it("has every code named in the world-pipeline error list", () => {
    const names = [
      "upload_bad_type", "upload_too_large", "upload_too_small", "upload_bad_magic",
      "blank_sketch", "quota_session", "quota_day", "quota_total", "world_gen_disabled",
      "unsafe_image", "moderation_unavailable", "bad_confirm", "confirm_expired",
      "turnstile_failed", "upstream_rate_limited", "upstream_rejected",
      "upstream_no_credits", "ingest_failed", "timeout",
    ];
    for (const name of names) expect(Object.keys(ErrorCode)).toContain(name);
  });

  it("keeps the party meaning of world_too_small apart from the upload size code", () => {
    expect(ErrorCode.world_too_small).not.toBe(ErrorCode.upload_too_small);
  });
});

describe("Result helpers", () => {
  it("ok wraps a value", () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
  });

  it("fail carries the code and omits an empty message", () => {
    expect(fail(ErrorCode.timeout)).toEqual({ ok: false, code: "timeout" });
    expect(fail(ErrorCode.timeout, "slow")).toEqual({ ok: false, code: "timeout", message: "slow" });
  });
});
