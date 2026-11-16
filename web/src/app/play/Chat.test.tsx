// @vitest-environment jsdom
import { playStart } from "@hauntology/shared/app/play";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Chat, MODEL_NOTE, STAGE_WAITING } from "./Chat";
import { BUTTON_LABELS, QUICK_BUTTONS, type PlayUi } from "./controller";
import type { GhostFace } from "./ghost-face";
import { Journal, JOURNAL_EMPTY } from "./Journal";
import type { VoiceUi } from "./voice";

afterEach(cleanup);

const ui = (over: Partial<PlayUi> = {}): PlayUi => ({
  phase: "ready", failure: null, play: playStart(true).state, view: null, prompt: null, lines: [], busy: false, scripted: false, reply: null, turnFailure: null, journalOpen: false, ...over,
});
const quiet: VoiceUi = { speak: false, speaking: false, mic: "idle", note: null };
const whisper: GhostFace = { name: "Maren", sprite: "/demo/ghosts/preset-maren.svg", speaker: "whisper" };

function show(over: { ui?: Partial<PlayUi>; ghost?: GhostFace; voice?: Partial<VoiceUi>; voiceAvailable?: boolean; modelOn?: boolean } = {}) {
  const calls = { submit: vi.fn(), close: vi.fn(), speak: vi.fn(), press: vi.fn(), release: vi.fn() };
  const r = render(
    <Chat
      ui={ui(over.ui)} voice={{ ...quiet, ...over.voice }} voiceAvailable={over.voiceAvailable ?? false} modelOn={over.modelOn ?? false} ghost={over.ghost ?? whisper}
      onSubmit={calls.submit} onClose={calls.close} onSpeak={calls.speak} onPress={calls.press} onRelease={calls.release}
    />,
  );
  return { ...r, calls };
}

describe("Chat: built from the design elements (ghost-engine 6.1, Requirement 10.3)", () => {
  it("is a sheet with a head and a title, and names itself", () => {
    show();
    const chat = screen.getByRole("complementary", { name: "Chat with the ghost" });
    expect(chat.classList.contains("ui-sheet")).toBe(true);
    expect(chat.classList.contains("is-open")).toBe(true);
    expect(chat.querySelector(".ui-sheet-head > .ui-sheet-title")?.textContent).toBe("The ghost");
  });

  it("has the five quick buttons, in order, as quiet buttons in one choices row", () => {
    show();
    const row = screen.getByRole("group", { name: "Quick actions" });
    expect(row.classList.contains("ui-choices")).toBe(true);
    const buttons = [...row.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual(QUICK_BUTTONS.map((b) => BUTTON_LABELS[b]));
    expect(buttons.map((b) => b.className)).toEqual(QUICK_BUTTONS.map(() => "ui-button ui-button--quiet"));
  });

  it("presses a quick button and sends text through the field, with Send as the one main button", () => {
    const { calls } = show();
    fireEvent.click(screen.getByRole("button", { name: "Listen" }));
    expect(calls.submit).toHaveBeenCalledWith({ button: "listen" });
    const box = screen.getByLabelText("Say something") as HTMLInputElement;
    expect(box.closest(".ui-field")?.querySelector(".ui-field-label")?.textContent).toBe("Say something");
    expect(box.maxLength).toBe(200);
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.submit(box.closest("form")!);
    expect(calls.submit).toHaveBeenCalledWith({ text: "hello" });
    expect(document.querySelectorAll(".ui-button--primary")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Send" }).classList.contains("ui-button--primary")).toBe(true);
  });

  it("holds the buttons and Send while a turn is on its way", () => {
    show({ ui: { busy: true } });
    for (const b of QUICK_BUTTONS) expect((screen.getByRole("button", { name: BUTTON_LABELS[b] }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector("[data-stage]")?.getAttribute("aria-busy")).toBe("true");
  });

  it("closes from its own button and from Escape", () => {
    const { calls } = show();
    fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
    fireEvent.keyDown(screen.getByLabelText("Say something"), { key: "Escape" });
    expect(calls.close).toHaveBeenCalledTimes(2);
    // Not a `ui-sheet-close`: that one is hidden from 900 px, and the side panel must still close.
    expect(document.querySelector(".ui-sheet-close")).toBeNull();
  });

  it("keeps every line in the log as a row with who said it, and the log's own live region off", () => {
    show({ ui: { lines: [{ id: 1, who: "you", text: "Look" }, { id: 2, who: "ghost", text: "A low hum." }, { id: 3, who: "system", text: "Try again." }] } });
    const log = screen.getByRole("log", { name: "Conversation" });
    expect(log.classList.contains("ui-log")).toBe(true);
    expect(log.getAttribute("aria-live")).toBe("off");
    const rows = [...log.querySelectorAll(".ui-log-row")];
    expect(rows.map((r) => r.querySelector(".ui-log-who")?.textContent)).toEqual(["You: ", "Ghost: ", "Note: "]);
    expect(rows.map((r) => r.getAttribute("data-who"))).toEqual(["you", "ghost", "system"]);
    expect(rows.map((r) => r.textContent)).toEqual(["You: Look", "Ghost: A low hum.", "Note: Try again."]);
  });

  it("writes no style of its own and no raw colour (the production policy is style-src self)", () => {
    show({ voiceAvailable: true, ui: { lines: [{ id: 1, who: "ghost", text: "x" }], reply: { n: 1, text: "x" } } });
    expect(document.querySelectorAll("[style]")).toHaveLength(0);
    const classes = new Set([...document.querySelectorAll("[class]")].flatMap((e) => [...e.classList]));
    for (const c of classes) expect(c === "chat" || c === "chat-stage" || c === "chat-quick" || c === "transcript" || c === "is-open" || c === "is-speaking" || c.startsWith("ui-")).toBe(true);
  });
});

describe("Chat: the note that typed words go to a model (Requirement 2.4)", () => {
  it("when the server says a model is on, says it once, in one line, under the text box, and ties it to the box", () => {
    show({ modelOn: true });
    const notes = document.querySelectorAll("[data-model-note]");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.textContent).toBe(MODEL_NOTE);
    expect(MODEL_NOTE).toMatch(/what you type/i);
    expect(MODEL_NOTE).toMatch(/AI model/);
    expect(MODEL_NOTE).not.toContain("\n");
    const box = screen.getByLabelText("Say something");
    expect(box.getAttribute("aria-describedby")).toBe(notes[0]!.id);
    expect(notes[0]!.closest("form")).not.toBeNull();
  });

  it("says nothing of a model when none is on, so it never tells a visitor something that is not so", () => {
    show({ modelOn: false });
    expect(document.querySelectorAll("[data-model-note]")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/AI model/);
    expect(screen.getByLabelText("Say something").hasAttribute("aria-describedby")).toBe(false);
  });

  it("is there with the voice controls on and with them off", () => {
    show({ modelOn: true, voiceAvailable: true });
    expect(document.querySelectorAll("[data-model-note]")).toHaveLength(1);
    cleanup();
    show({ modelOn: true, voiceAvailable: false });
    expect(document.querySelectorAll("[data-model-note]")).toHaveLength(1);
  });
});

describe("Chat: the ghost on the stage", () => {
  it("shows the ghost's latest words as its speech, and a quiet prompt before it has said anything", () => {
    const { rerender, calls } = show();
    const speech = () => document.querySelector("[data-dialogue] .ui-speech") as HTMLElement;
    expect(speech().textContent).toBe(STAGE_WAITING);
    expect(speech().classList.contains("ui-speech-tail")).toBe(true);
    rerender(
      <Chat ui={ui({ reply: { n: 1, text: "Something was here." }, lines: [{ id: 1, who: "ghost", text: "Something was here." }] })} voice={quiet} voiceAvailable={false} modelOn={false} ghost={whisper}
        onSubmit={calls.submit} onClose={calls.close} onSpeak={calls.speak} onPress={calls.press} onRelease={calls.release} />,
    );
    expect(speech().textContent).toBe("Something was here.");
    expect(speech().classList.contains("ui-speech-tail")).toBe(false);
  });

  it("speaks as the Whisper (green) or as the Keeper (yellow), on the stage, the portrait and the nameplate", () => {
    for (const speaker of ["whisper", "keeper"] as const) {
      cleanup();
      show({ ghost: { name: "Alder", sprite: null, speaker } });
      expect(document.querySelector("[data-stage]")!.classList.contains(`ui-stage--${speaker}`)).toBe(true);
      expect(document.querySelector("[data-portrait]")!.classList.contains(`ui-portrait--${speaker}`)).toBe(true);
      const plate = document.querySelector("[data-nameplate]")!;
      expect(plate.classList.contains(`ui-nameplate--${speaker}`)).toBe(true);
      expect(plate.textContent).toBe("Alder");
      const other = speaker === "whisper" ? "keeper" : "whisper";
      expect(document.querySelector("[data-stage]")!.classList.contains(`ui-stage--${other}`)).toBe(false);
    }
  });

  it("shows the chosen ghost's picture, or the lantern orb when there is none", () => {
    show();
    const img = document.querySelector("[data-portrait] img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/demo/ghosts/preset-maren.svg");
    expect(img.getAttribute("alt")).toBe("");
    cleanup();
    show({ ghost: { name: "The ghost", sprite: null, speaker: "whisper" } });
    expect(document.querySelector("[data-portrait] img")).toBeNull();
    expect(document.querySelector("[data-portrait] .ui-orb.ui-orb--whisper")).not.toBeNull();
    cleanup();
    show({ ghost: { name: "The ghost", sprite: null, speaker: "keeper" } });
    expect(document.querySelector("[data-portrait] .ui-orb")).not.toBeNull();
    expect(document.querySelector("[data-portrait] .ui-orb--whisper")).toBeNull();
  });

  it("lights the portrait only while a line is being spoken", () => {
    show();
    expect(document.querySelector("[data-portrait]")!.classList.contains("is-speaking")).toBe(false);
    cleanup();
    show({ voice: { speaking: true } });
    expect(document.querySelector("[data-portrait]")!.classList.contains("is-speaking")).toBe(true);
  });
});

describe("Journal: a panel with a log (ghost-engine 6.2, Requirement 10.3)", () => {
  it("lists the memories in the order found, each with its number", () => {
    render(<Journal entries={[{ anchorId: "a1", text: "A low hum." }, { anchorId: "a2", text: "A name, almost." }]} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Journal" });
    const list = dialog.querySelector(".ui-panel > ol.ui-log")!;
    expect(list.getAttribute("aria-label")).toBe("The memories you found");
    expect([...list.querySelectorAll(".ui-log-row")].map((r) => r.textContent)).toEqual(["Memory 1: A low hum.", "Memory 2: A name, almost."]);
    expect(dialog.querySelectorAll(".ui-log-who")).toHaveLength(2);
  });

  it("says so when nothing is found yet, with no panel", () => {
    render(<Journal entries={[]} onClose={() => {}} />);
    expect(screen.getByText(JOURNAL_EMPTY)).toBeTruthy();
    expect(document.querySelector(".ui-panel")).toBeNull();
  });
});
