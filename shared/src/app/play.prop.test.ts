import * as fc from "fast-check";
import { describe, it } from "vitest";
import { playReduce, playStart } from "./play";
import { playEventsArb } from "./play.arb";
import { propParams } from "./prop-config";
import type { PlayEffect } from "./types";

const W = "w-AbCdEfGhIjKlMnOpQrSt12";

describe("Property 7: Play reducer keeps input mode and Exit consistent", () => {
  // Validates: Requirements 6.1, 6.2, 6.4, 6.5, 6.6
  it("holds for any sequence of play events", () => {
    fc.assert(
      fc.property(fc.boolean(), playEventsArb, (startAcked, events) => {
        const start = playStart(startAcked);
        // A Session that already acknowledged the notice starts the Viewer at once; otherwise nothing yet.
        if (startAcked ? start.effects.length !== 1 || start.effects[0]?.e !== "start_viewer" : start.effects.length !== 0) return false;
        let state = start.state;
        const all: PlayEffect[] = [...start.effects];

        // The oracle: what the visitor's actions mean, written out again.
        let acked = startAcked;
        let chatOpen = false;
        let endSeen = false;
        let viewerMode: "play" | "chat" = "play";
        let starts = start.effects.length;
        let endNavigations = 0;
        let lastFound = 0;

        for (const event of events) {
          const before = state;
          const step = playReduce(before, event, W);
          state = step.state;
          all.push(...step.effects);

          // What the event should do, by the visitor's rules.
          const opens = event.t === "open_chat" && acked && !endSeen && !chatOpen;
          const closes = event.t === "close_chat" && chatOpen && !endSeen;
          const acks = event.t === "ack_notice" && !acked;
          const ends = event.t === "view" && event.ended && !endSeen;
          if (acks) acked = true;
          if (opens) chatOpen = true;
          if (closes) chatOpen = false;
          if (ends) endSeen = true;

          const modes = step.effects.flatMap((e) => (e.e === "set_input_mode" ? [e.mode] : []));
          // One set_input_mode for each real open or close, and none otherwise.
          if (modes.length !== (opens || closes ? 1 : 0)) return false;
          for (const m of modes) viewerMode = m;

          // The Viewer's input mode is chat exactly while the Chat is open, in the state and in the effects.
          if (state.mode !== (chatOpen ? "chat" : "play")) return false;
          if (viewerMode !== state.mode) return false;
          if (state.noticeAcked !== acked) return false;

          // The Viewer starts once, right at the acknowledgement, never before.
          const startsNow = step.effects.filter((e) => e.e === "start_viewer").length;
          if (startsNow !== (acks ? 1 : 0)) return false;
          starts += startsNow;
          if (starts > 1) return false;
          if (startsNow > 0 && !acked) return false;

          // Exit always disposes first, then navigates to Home or the Gallery.
          if (event.t === "exit") {
            const kinds = step.effects.map((e) => e.e);
            if (kinds.length !== 2 || kinds[0] !== "dispose_viewer" || kinds[1] !== "navigate") return false;
            const nav = step.effects[1];
            if (nav?.e !== "navigate" || nav.to.screen !== (event.to ?? "home")) return false;
          }

          // The end disposes first and goes to the Ending, once, with this world.
          const endNav = step.effects.filter((e) => e.e === "navigate" && e.to.screen === "end");
          if (endNav.length !== (ends ? 1 : 0)) return false;
          if (ends) {
            if (step.effects[0]?.e !== "dispose_viewer") return false;
            const nav = endNav[0];
            if (nav?.e !== "navigate" || nav.to.worldId !== W) return false;
          }
          endNavigations += endNav.length;

          // After the end, the disposed Viewer gets no more input-mode changes.
          if (endSeen && !ends && modes.length > 0) return false;

          // Found memories only go up, to at most three.
          if (state.found < lastFound || state.found > 3) return false;
          lastFound = state.found;

          // Nothing that is ignored changes state or emits an effect.
          const ignorable = !(opens || closes || acks || ends || event.t === "exit");
          if (ignorable && step.effects.length > 0) return false;
        }

        const sawEnd = events.some((e) => e.t === "view" && e.ended);
        return endNavigations === (sawEnd ? 1 : 0) && all.filter((e) => e.e === "start_viewer").length <= 1;
      }),
      propParams(),
    );
  });
});
