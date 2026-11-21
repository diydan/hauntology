// @vitest-environment jsdom
import { createEngine, publicSnapshot, step, type PublicSnapshot } from "@hauntology/shared/party/engine";
import { endingPayload, type RecapEvent, type Source } from "@hauntology/shared/party/ending";
import { PRESET_GHOST_IDS } from "@hauntology/shared/party/preset-ghosts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Ending, RECAP_STEP_MS } from "./Ending";
import { namesOf } from "./words";
import { eventLine, revealLines } from "./words";

afterEach(() => { cleanup(); vi.useRealTimers(); });

/** A real game's public view, given an ending built by the real `endingPayload`. */
function ended(o: { houseWins: boolean; winners: number[]; poltergeist?: number; extraLog?: RecapEvent[]; sources?: Source[] }): PublicSnapshot {
  const seats = [1, 2, 3].map((seat) => ({ seat, nickname: seat === 1 ? "You" : `Bot${seat}`, bot: seat !== 1, botLevel: "standard" as const }));
  const s = step(createEngine({ seed: 3, seats, settings: { baseSeconds: 60, hauntMax: 10 }, presetIds: PRESET_GHOST_IDS }), { kind: "client", seat: 1, msg: { t: "start" } }, 0).state;
  const sol = s.deal!.solution;
  const z = s.pool.zones;
  const log = [
    { id: 1, kind: "turn-start" as const, seat: 1 },
    { id: 2, kind: "suggest" as const, seat: 2, zone: z[0]!.id, suspect: s.pool.suspects[0]!.id, relic: s.pool.relics[0]!.id, passed: [], refuter: 1 },
    { id: 3, kind: "inspect" as const, seat: 3, zone: z[1]!.id },
    ...(o.extraLog ?? []),
  ];
  const players = [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat !== 1, poltergeist: seat === o.poltergeist, suggestions: seat === 2 ? 1 : 0, turnMsUsed: 1000 * seat }));
  const ending = endingPayload({ solution: sol, residueAt: { [z[1]!.id]: s.pool.relics[2]!.id }, winners: o.winners, houseWins: o.houseWins, players, log, sources: o.sources ?? [], bluffs: new Set([2]) });
  const v = publicSnapshot(s, 0);
  return { ...v, phase: "ended", ending, seats: v.seats.map((x) => ({ ...x, poltergeist: x.seat === o.poltergeist })) };
}

describe("the ending screen", () => {
  it("ranks the winners, names the answer, the Residue and who joined the haunting, never the word Poltergeist", () => {
    const view = ended({ houseWins: false, winners: [2, 1], poltergeist: 3 });
    const n = namesOf(view, 1);
    render(<Ending view={view} n={n} reducedMotion />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("The case is solved");
    const text = document.body.textContent ?? "";
    expect(text).toContain("First DetectiveYou"); // fewer Suggestions ranks first: seat 1 made none
    expect(text).toContain("Also rightBot2");
    expect(text).toContain("Joined the hauntingBot3");
    expect(text).toContain(`The ${n.card(view.relics[2]!.id)}, in the ${view.zones[1]!.name}.`);
    expect(text).toContain("It was a bluff.");
    expect(text).not.toMatch(/poltergeist/i);
  });

  it("says the haunting continues when the house wins, with no winners", () => {
    const view = ended({ houseWins: true, winners: [] });
    render(<Ending view={view} n={namesOf(view, 1)} reducedMotion />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("The haunting continues");
    expect(document.body.textContent).not.toContain("First Detective");
    expect(document.body.textContent).toContain("Joined the hauntingNobody");
  });

  it("tells the recap one entry at a time, and Skip shows the rest at once", () => {
    vi.useFakeTimers();
    const view = ended({ houseWins: false, winners: [1] });
    render(<Ending view={view} n={namesOf(view, 1)} />);
    const rows = () => document.querySelectorAll(".ui-log-row").length;
    expect(rows()).toBe(0);
    act(() => { vi.advanceTimersByTime(RECAP_STEP_MS); });
    expect(rows()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Skip to the end" }));
    expect(rows()).toBe(3);
    expect(screen.queryByRole("button", { name: "Skip to the end" })).toBeNull();
  });
  it("plays the matching ending song only on a tap, and always shows its words", async () => {
    const made: string[] = [];
    const play = vi.fn(() => Promise.resolve());
    vi.stubGlobal("Audio", class { onended = null; onerror = null; pause() {} play = play; constructor(src: string) { made.push(src); } });
    for (const [houseWins, id] of [[false, "fb-detectives"], [true, "fb-house"]] as const) {
      const view = ended({ houseWins, winners: houseWins ? [] : [1] });
      render(<Ending view={view} n={namesOf(view, 1)} />);
      expect(made).not.toContain(`/songs/${id}.mp3`);
      expect(document.querySelector(".ui-lyrics")!.textContent!.length).toBeGreaterThan(40);
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play the song" })); });
      expect(made).toContain(`/songs/${id}.mp3`);
      expect(screen.getByRole("button", { name: "Stop the song" })).toBeTruthy();
      cleanup();
    }
    vi.unstubAllGlobals();
  });

  it("keeps the words and says so when the song will not play", async () => {
    vi.stubGlobal("Audio", class { onended = null; onerror = null; pause() {} play() { return Promise.reject(new Error("no")); } });
    const view = ended({ houseWins: false, winners: [1] });
    render(<Ending view={view} n={namesOf(view, 1)} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play the song" })); });
    expect(screen.getByRole("status").textContent).toContain("would not play");
    expect(document.querySelector(".ui-lyrics")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("renders the ending song line using design-system ui-speech ui-hint when provided (game-songs 4.1)", () => {
    const view = ended({ houseWins: false, winners: [1] });
    render(<Ending view={view} n={namesOf(view, 1)} reducedMotion songLine={{ title: "Ballad of the Case", captions: "The lanterns went out together." }} />);
    const line = document.querySelector("[data-ending-song-line]")!;
    expect(line.classList.contains("ui-speech")).toBe(true);
    expect(line.classList.contains("ui-hint")).toBe(true);
    expect(line.textContent).toBe("Ballad of the Case: The lanterns went out together.");
  });

  it("formats errand public log lines without the sender and lists every Errand in the ending recap (errands 2.2, 2.4)", () => {
    const view = ended({ houseWins: false, winners: [1] });
    const n = namesOf(view, 1);
    expect(eventLine({ id: 9, kind: "errand-done", target: 2, object: "spoon" }, n)).toBe(`${n.seat(2)} was made to hold a spoon`);
    expect(eventLine({ id: 10, kind: "errand-caught", seat: 3 }, n)).toBe(`${n.seat(3)} caught a haunting`);

    const withErrands: PublicSnapshot = {
      ...view,
      ending: {
        ...view.ending!,
        recap: {
          ...view.ending!.recap,
          errands: [{ id: "1:0", from: 1, target: 2, object: "spoon", givenRound: 1, doneTriedRound: 1, status: "done" }],
        },
      },
    };
    render(<Ending view={withErrands} n={n} reducedMotion />);
    const sec = screen.getByRole("region", { name: "Haunting errands" });
    expect(sec.textContent).toContain(`You tried to get ${n.seat(2)} to hold a spoon: done`);
  });

  it("reveals who sent every Frame, House Cue, Rattle and Haunting puzzle, and the Scare points, in words (party-mode 8.5)", () => {
    const view = ended({
      houseWins: true, winners: [], poltergeist: 3,
      extraLog: [
        { id: 4, kind: "phone-cue", target: 1, cue: "bell" }, { id: 5, kind: "phone-cue", target: 2, cue: "creak" },
        { id: 6, kind: "rattle", target: 1, turn: 2 },
      ],
      sources: [
        { eventId: 4, kind: "frame", from: 3 }, { eventId: 5, kind: "house-cue", from: null },
        { eventId: 6, kind: "rattle", from: 3, turn: 2 }, { eventId: 9, kind: "haunting-puzzle", from: 3 },
      ],
    });
    const n = namesOf(view, 1);
    render(<Ending view={view} n={n} reducedMotion />);
    const sec = screen.getByRole("region", { name: "Who was behind it" });
    const items = [...sec.querySelectorAll("li")].map((li) => li.textContent);
    expect(items).toEqual([
      "Bot3 sent the bell to You, and it looked like the house.",
      "The house itself sent the creak to Bot2.",
      "Bot3 rattled your phone.",
      "Bot3 solved a haunting puzzle.",
    ]);
    expect(document.body.textContent).toContain("Bot3, 3 Scare points"); // 1 frame + 1 rattle + 1 puzzle; the Rattle Turn did not end by the clock
    expect(sec.textContent).not.toMatch(/poltergeist/i);
  });

  it("shows no 'Who was behind it' section when nothing was sent, and lists each player's counts", () => {
    const view = ended({ houseWins: false, winners: [1] });
    render(<Ending view={view} n={namesOf(view, 1)} reducedMotion />);
    expect(screen.queryByRole("region", { name: "Who was behind it" })).toBeNull();
    const table = screen.getByRole("table", { name: "Each player's turn" });
    const row = [...table.querySelectorAll("tbody tr")].find((r) => r.querySelector("th")?.textContent === "Bot2")!;
    expect([...row.querySelectorAll("td")].map((c) => c.textContent)).toEqual(["1", "0", "0", "0"]); // asked, searched, nudges, ran out of time
  });

  it("revealLines skips a source whose public entry is missing instead of guessing", () => {
    const view = ended({ houseWins: true, winners: [], extraLog: [], sources: [{ eventId: 77, kind: "frame", from: 2 }] });
    expect(revealLines(view.ending!.recap, namesOf(view, 1))).toEqual([]);
  });

  it("a House Cue alone still gets its section (no Scare points), and an Errand source is left to the Errands section", () => {
    const view = ended({
      houseWins: true, winners: [],
      extraLog: [{ id: 4, kind: "phone-cue", target: 2, cue: "bell" }],
      sources: [{ eventId: 4, kind: "house-cue", from: null }, { eventId: 4, kind: "errand", from: 3 }],
    });
    render(<Ending view={view} n={namesOf(view, 1)} reducedMotion />);
    const sec = screen.getByRole("region", { name: "Who was behind it" });
    expect([...sec.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["The house itself sent the bell to Bot2."]);
    expect(sec.querySelector("p")).toBeNull();
  });

  it("has no solid yellow button of its own: Play again is the Case screen's one main button (integration 8.3)", () => {
    const view = ended({ houseWins: false, winners: [1] });
    render(<Ending view={view} n={namesOf(view, 1)} reducedMotion />);
    expect(document.querySelectorAll(".ui-button--primary")).toHaveLength(0);
  });
});

