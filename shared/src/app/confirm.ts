import type { ConfirmEvent, ConfirmState, ConfirmStep } from "./types";

/**
 * The Confirm Gate as a pure state machine. It never does I/O: it returns the next state and the
 * effects the screen must run, and the screen feeds the results back as events.
 *
 * `imageId` is the picked Place Image. It stays the same for the life of the screen, so it is a
 * parameter and not part of the state.
 *
 * ```
 * quoting ──quote_ok──▶ ready ──enter──▶ creating ──create_ok──▶ created
 *    │                    │  └─(turnstile)─▶ challenge ─turnstile_ok─▶ creating
 *    └─quote_fail─▶ rejected ◀──create_fail── creating
 *                      └──retry──▶ quoting (new quote, new token)
 * quoting | ready | challenge | rejected ──back──▶ cancelled
 * ```
 * Any event not drawn above is ignored: the same state object comes back with no effects.
 * A Confirm Token is used in at most one `create` effect, and nothing is created after `back`.
 */

/** The first state of the screen, with the `quote` call it needs. */
export function confirmStart(imageId: string): ConfirmStep {
  return { state: { k: "quoting" }, effects: [{ e: "quote", imageId }] };
}

export function confirmReduce(state: ConfirmState, event: ConfirmEvent, imageId: string): ConfirmStep {
  const ignore: ConfirmStep = { state, effects: [] };

  switch (event.t) {
    case "quote_ok":
      if (state.k !== "quoting") return ignore;
      return {
        state: { k: "ready", imageUrl: event.imageUrl, token: event.token, quota: event.quota, needsTurnstile: event.needsTurnstile },
        effects: [],
      };

    case "quote_fail":
      if (state.k !== "quoting") return ignore;
      return { state: { k: "rejected", code: event.code }, effects: [] };

    case "enter":
      if (state.k !== "ready") return ignore;
      if (state.needsTurnstile) return { state: { k: "challenge", token: state.token }, effects: [] };
      return { state: { k: "creating", token: state.token }, effects: [{ e: "create", imageId, token: state.token }] };

    case "turnstile_ok":
      if (state.k !== "challenge") return ignore;
      return {
        state: { k: "creating", token: state.token },
        effects: [{ e: "create", imageId, token: state.token, turnstile: event.turnstile }],
      };

    case "create_ok":
      if (state.k !== "creating") return ignore;
      return {
        state: { k: "created", worldId: event.worldId },
        effects: [{ e: "navigate", to: { screen: "haunt", worldId: event.worldId } }],
      };

    case "create_fail":
      if (state.k !== "creating") return ignore;
      return { state: { k: "rejected", code: event.code }, effects: [] };

    case "retry":
      if (state.k !== "rejected") return ignore;
      return { state: { k: "quoting" }, effects: [{ e: "quote", imageId }] };

    case "back":
      // Not while a creation request is in flight, and not once the world exists.
      if (state.k === "creating" || state.k === "created" || state.k === "cancelled") return ignore;
      return { state: { k: "cancelled" }, effects: [{ e: "navigate", to: { screen: "create" } }] };
  }
}
