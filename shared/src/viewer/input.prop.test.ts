import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { cardExcerpt, CARD_EXCERPT_MAX } from "../app/memory-card";
import { layoutMemoryCard, type CardMemoryInput } from "./card";
import { inputReduce } from "./input";
import type { InputEvent, InputMode } from "./types";

describe("Property 9: Chat mode suspends movement", () => {
  // Feature: world-viewer, Property 9: Chat mode suspends movement
  // Validates: Requirements 4.2
  it("applies movement if and only if the mode is play, and closing always returns to play", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom<InputEvent>("open_chat", "close_chat", "move"), { maxLength: 60 }), (events) => {
        let mode: InputMode = "play";
        let steps = 0;
        for (const event of events) {
          const wasPlay = mode === "play";
          const r = inputReduce(mode, event);
          mode = r.mode;
          if (r.movementEnabled !== (mode === "play")) return false;
          if (event === "close_chat" && mode !== "play") return false;
          if (event === "open_chat" && mode !== "chat") return false;
          if (event === "move") {
            // The caller applies the step only when enabled; that must match play exactly.
            if (r.movementEnabled) steps += 1;
            if (r.movementEnabled !== wasPlay) return false;
          }
        }
        return steps >= 0;
      }),
      propParams(),
    );
    expect(inputReduce("chat", "close_chat")).toEqual({ mode: "play", movementEnabled: true });
    expect(inputReduce("play", "move")).toEqual({ mode: "play", movementEnabled: true });
    expect(inputReduce("chat", "move")).toEqual({ mode: "chat", movementEnabled: false });
  });
});

describe("Property 11: Memory card contains exactly the found memories", () => {
  // Feature: world-viewer, Property 11: Memory card contains exactly the found memories
  // Validates: Requirements 7.1
  it("lists exactly the found ones, excerpts within the limit, and no other field", () => {
    const memoryArb: fc.Arbitrary<CardMemoryInput> = fc.record(
      {
        title: fc.string({ maxLength: 200 }),
        text: fc.string({ maxLength: 600 }),
        found: fc.boolean(),
      },
      { requiredKeys: ["text", "found"] },
    );
    fc.assert(
      fc.property(fc.array(memoryArb, { maxLength: 8 }), fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: null }), (memories, thumb) => {
        const layout = layoutMemoryCard(memories, thumb);
        if (Object.keys(layout).sort().join(",") !== "entries,thumb") return false;
        if (layout.thumb !== (thumb && thumb.trim() !== "" ? thumb : null)) return false;
        const found = memories.filter((m) => m.found);
        if (layout.entries.length !== found.length) return false;
        return layout.entries.every((entry, i) => {
          const source = found[i] as CardMemoryInput;
          return (
            Object.keys(entry).sort().join(",") === "excerpt,title" &&
            entry.excerpt === cardExcerpt(source.text) &&
            entry.excerpt.length <= CARD_EXCERPT_MAX &&
            entry.title.length > 0
          );
        });
      }),
      propParams(),
    );
  });
});
