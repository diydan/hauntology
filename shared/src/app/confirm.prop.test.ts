import * as fc from "fast-check";
import { describe, it } from "vitest";
import { confirmReduce, confirmStart } from "./confirm";
import { confirmEventsArb } from "./confirm.arb";
import { propParams } from "./prop-config";
import type { ConfirmEffect, ConfirmEvent, ConfirmState } from "./types";

const IMG = "img-12345678";

type Oracle = {
  /** Accepted `quote_ok` events so far, and the tokens they carried. */
  tokens: string[];
  /** The token that may still be used for a create, and the step where it was entered. */
  entered: boolean;
  cancelled: boolean;
  usedTokens: Set<string>;
};

describe("Property 3: World creation fires at most once and only after consent", () => {
  // Validates: Requirements 3.2, 3.3, 3.4, 3.6
  it("holds for any sequence of confirm events", () => {
    fc.assert(
      fc.property(confirmEventsArb, (events) => {
        let { state, effects: startEffects } = confirmStart(IMG);
        const all: ConfirmEffect[] = [...startEffects];
        const o: Oracle = { tokens: [], entered: false, cancelled: false, usedTokens: new Set() };
        let quotes = 1; // the `quote` effect of confirmStart
        let acceptedRetries = 0;
        let needsTurnstileOf: Record<string, boolean> = {};

        for (const event of events) {
          const before: ConfirmState = state;
          const step = confirmReduce(before, event, IMG);
          state = step.state;
          all.push(...step.effects);

          // An ignored event leaves the very same state and no effects.
          if (step.state === before && step.effects.length > 0) return false;
          if (step.state !== before && JSON.stringify(step.state) === JSON.stringify(before)) return false;

          if (event.t === "quote_ok" && step.state !== before) {
            o.tokens.push(event.token);
            needsTurnstileOf[event.token] = event.needsTurnstile;
            o.entered = false;
          }
          if (event.t === "retry" && step.state !== before) acceptedRetries++;
          if (event.t === "enter" && before.k === "ready") o.entered = true;
          if (event.t === "back" && step.state !== before) o.cancelled = true;

          for (const eff of step.effects) {
            if (eff.e === "quote") quotes++;
            if (eff.e !== "create") continue;
            // Only after an accepted enter on the current quote, never after back.
            if (!o.entered || o.cancelled) return false;
            // A token is used once, and it is one a quote handed out.
            if (o.usedTokens.has(eff.token) || !o.tokens.includes(eff.token)) return false;
            o.usedTokens.add(eff.token);
            // A quote that needs Turnstile never creates without the widget's result.
            if (needsTurnstileOf[eff.token] && !eff.turnstile) return false;
            if (!needsTurnstileOf[eff.token] && eff.turnstile !== undefined) return false;
            if (eff.imageId !== IMG) return false;
          }
          // Once created or failed, the next create needs a new quote and a new enter.
          if ((event.t === "create_ok" || event.t === "create_fail") && step.state !== before) o.entered = false;
          // After back, nothing moves again.
          if (o.cancelled && state.k !== "cancelled") return false;
        }

        const creates = all.filter((e) => e.e === "create").length;
        // At most one create per accepted quote, so at most one per token.
        if (creates > o.tokens.length) return false;
        if (new Set(all.filter((e): e is Extract<ConfirmEffect, { e: "create" }> => e.e === "create").map((e) => e.token)).size !== creates) return false;
        // One quote at the start and one per accepted retry, nothing else.
        if (quotes !== 1 + acceptedRetries) return false;
        // Navigation only leaves for Create (back) or goes to the new world's Haunt screen.
        return all.every(
          (e) => e.e !== "navigate" || e.to.screen === "create" || (e.to.screen === "haunt" && typeof e.to.worldId === "string"),
        );
      }),
      propParams(),
    );
  });

  it("leaves the machine alone for events it ignores, whatever the history", () => {
    const eventsAfter: fc.Arbitrary<{ prefix: ConfirmEvent[]; tail: ConfirmEvent }> = fc.record({
      prefix: confirmEventsArb,
      tail: fc.constantFrom<ConfirmEvent>({ t: "enter" }, { t: "retry" }, { t: "back" }),
    });
    fc.assert(
      fc.property(eventsAfter, ({ prefix, tail }) => {
        let state = confirmStart(IMG).state;
        for (const e of prefix) state = confirmReduce(state, e, IMG).state;
        const step = confirmReduce(state, tail, IMG);
        const acceptsEnter = state.k === "ready";
        const acceptsRetry = state.k === "rejected";
        const acceptsBack = state.k === "quoting" || state.k === "ready" || state.k === "challenge" || state.k === "rejected";
        const accepted = tail.t === "enter" ? acceptsEnter : tail.t === "retry" ? acceptsRetry : acceptsBack;
        return accepted ? step.state !== state : step.state === state && step.effects.length === 0;
      }),
      propParams(),
    );
  });
});
