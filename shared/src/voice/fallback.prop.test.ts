import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { startSession, type WorldFacts } from "../ghost/play";
import { resolveSpeech, runWithVoice, type AttemptStep, type Outcome } from "./fallback";
import { SPEECH_DEADLINE_MS } from "./limits";

const WORLD: WorldFacts = {
  spawn: [0, 0, 0],
  yaw: 0,
  bounds: { min: [-12, -1, -12], max: [12, 4, 12] },
  floorY: 0,
  brief: "A narrow kitchen with a window over the sink.",
};

const outcomeArb: fc.Arbitrary<Outcome> = fc.constantFrom("ok", "miss", "error", "slow", "denied");
const stepResultArb = fc.record({ outcome: outcomeArb, ms: fc.integer({ min: 0, max: 6500 }) });

describe("Property 2: The fallback chain always ends in a subtitle", () => {
  // Feature: ghost-voice, Property 2: The fallback chain always ends in a subtitle
  // Validates: Requirements 1.2, 1.3, 4.2, 4.3
  it("always reports subtitle: true with no error member, respects order, skips paid steps on kill or no ticket, and never uses audio after 5000 ms", () => {
    const steps: readonly AttemptStep[] = ["library", "cache", "inworld", "aura", "browser"];
    fc.assert(
      fc.property(
        fc.record({
          library: stepResultArb,
          cache: stepResultArb,
          inworld: stepResultArb,
          aura: stepResultArb,
          browser: stepResultArb,
        }),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (outcomes, kill, ticket, browserVoice) => {
          const called: AttemptStep[] = [];
          const res = resolveSpeech({ kill, ticket, browserVoice }, (s) => {
            called.push(s);
            return outcomes[s];
          });

          // Never has an error member; always shows Subtitle.
          expect(res.subtitle).toBe(true);
          expect("error" in res).toBe(false);
          expect(["library", "cache", "inworld", "aura", "browser", "subtitle"]).toContain(res.via);

          // Order of attempted steps strictly follows the chain.
          const indices = called.map((s) => steps.indexOf(s));
          for (let i = 1; i < indices.length; i++) expect(indices[i]!).toBeGreaterThan(indices[i - 1]!);

          // No paid step when kill is on or ticket is absent.
          if (kill || !ticket) {
            expect(called).not.toContain("inworld");
            expect(called).not.toContain("aura");
            expect(res.paidCalls).toBe(0);
          }

          // Browser is only called when browserVoice is true.
          if (!browserVoice) expect(called).not.toContain("browser");

          // If audio was returned (not subtitle), total elapsed time up to that step is <= 5000 ms and its outcome was ok.
          if (res.via !== "subtitle") {
            expect(outcomes[res.via].outcome).toBe("ok");
            expect(res.elapsedMs).toBeLessThanOrEqual(SPEECH_DEADLINE_MS);
          }

          // No step was started once cumulative elapsed time reached 5000 ms.
          let t = 0;
          for (const s of called) {
            expect(t).toBeLessThan(SPEECH_DEADLINE_MS);
            t += outcomes[s].ms;
          }
        },
      ),
      propParams(),
    );
  });

  it("free reads (library and cache) still run and succeed when kill is on and no ticket is granted", () => {
    fc.assert(
      fc.property(fc.constantFrom("library" as const, "cache" as const), fc.integer({ min: 0, max: 4999 }), (hitStep, ms) => {
        const res = resolveSpeech({ kill: true, ticket: false, browserVoice: false }, (s) => ({
          outcome: s === hitStep ? "ok" : "miss",
          ms: s === hitStep ? ms : 1,
        }));
        expect(res.via).toBe(hitStep);
        expect(res.paidCalls).toBe(0);
        expect(res.subtitle).toBe(true);
      }),
      propParams(),
    );
  });

  it("with every meter at zero (kill on, no ticket, all steps failing), the engine Progress sequence equals the one with working voice", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.array(
          fc.record({
            kind: fc.constantFrom("look" as const, "listen" as const, "ask" as const, "hint" as const),
            nearIdx: fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (seed, actions) => {
          const initial = startSession({ id: "p-voice", worldId: "w-1", ownerSid: "sid", world: WORLD, seed, now: 1_000_000 });
          let now = 1_000_000;
          const turns = actions.map((a) => {
            now += 2_000;
            const pos = a.nearIdx === null ? ([11, 0, 11] as [number, number, number]) : initial.anchors[a.nearIdx]!.pos;
            return { input: { button: a.kind }, pose: { pos, yaw: 0 }, now };
          });

          const working = runWithVoice(initial, turns, WORLD, { kill: false, ticket: true, browserVoice: true }, (s) => ({
            outcome: s === "inworld" ? "ok" : "miss",
            ms: 200,
          }));
          const zeroMeters = runWithVoice(initial, turns, WORLD, { kill: true, ticket: false, browserVoice: false }, () => ({
            outcome: "denied",
            ms: 5,
          }));

          expect(zeroMeters.progress).toEqual(working.progress);
          expect(zeroMeters.speechResults.every((r) => r.via === "subtitle" && r.paidCalls === 0 && r.subtitle)).toBe(true);
        },
      ),
      propParams(),
    );
  });
});
