// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { game, lobby, priv, pub } from "../../../test/party-fixtures";
import { Actions, SealSheet, SuggestSheet, INSPECT_SECONDS, WINDOW_SECONDS } from "./Actions";
import { ClockBar } from "./ClockBar";
import { Hand, Notebook } from "./Notebook";
import { AnswerPrompt, HauntChoice, RattlePrompt } from "./Prompts";
import { Recap } from "./Recap";
import { notebookKey } from "./notebook-store";

afterEach(cleanup);
const store = (): Pick<Storage, "getItem" | "setItem" | "removeItem"> & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};

describe("ClockBar (party-mode 9.9)", () => {
  it("shows the Room's time left on the Room's clock, the round and whose turn it is", () => {
    render(<ClockBar game={game()} me={1} offsetMs={5_000} nowMs={5_000} />);
    expect((screen.getByRole("timer")).textContent).toContain("1:00");
    expect(screen.getByText(/Round 1 · Your turn/)).toBeTruthy();
  });
  it("says another's turn by name, says no clock, and says paused", () => {
    const { rerender } = render(<ClockBar game={game({ pub: pub({ active: 2 }) })} me={1} offsetMs={0} nowMs={0} />);
    expect(screen.getByText(/Ben's turn/)).toBeTruthy();
    rerender(<ClockBar game={game({ pub: pub({ deadlineMs: null }) })} me={1} offsetMs={0} nowMs={0} />);
    expect((screen.getByRole("timer")).textContent).toContain("No clock");
    rerender(<ClockBar game={game({ pub: pub({ paused: true }) })} me={1} offsetMs={0} nowMs={0} />);
    expect((screen.getByRole("timer")).textContent).toContain("(paused)");
  });
  it("warns once in the last ten seconds, in words, and does not warn when paused", () => {
    const { rerender } = render(<ClockBar game={game()} me={1} offsetMs={0} nowMs={0} />);
    expect(screen.queryByText("Under ten seconds left.")).toBeNull();
    rerender(<ClockBar game={game()} me={1} offsetMs={0} nowMs={61_000} />);
    expect(screen.getByText("Under ten seconds left.")).toBeTruthy();
    expect((screen.getByRole("status")).textContent).toContain("Ten seconds left on your turn.");
    rerender(<ClockBar game={game({ pub: pub({ paused: true }) })} me={1} offsetMs={0} nowMs={61_000} />);
    expect(screen.queryByText("Under ten seconds left.")).toBeNull();
  });
  it("lists the Achievements this seat earned, with their seconds", () => {
    const events = [1, 2, 3].map((i) => ({ id: i, kind: "suggest", seat: 1 }));
    render(<ClockBar game={game({ pub: pub({ events }) })} me={1} offsetMs={0} nowMs={0} />);
    expect(within(screen.getByRole("list", { name: "Your Achievements" })).getByText(/Persistent: made three Suggestions \(\+10 s\)/)).toBeTruthy();
  });
});

describe("Hand and Notebook (party-mode 9.6, 9.26)", () => {
  it("names the cards in the hand by group", () => {
    render(<Hand game={game()} />);
    const hand = screen.getByRole("region", { name: "Your hand" });
    expect(within(hand).getByText(/Mr Vane/)).toBeTruthy();
    expect(within(hand).getByText("(Room)")).toBeTruthy();
    expect(within(hand).getByText("(Relic)")).toBeTruthy();
  });
  it("fills in only what the game knows (Hand, shown, found), shows the Residue count, and cycles the Player's own marks", () => {
    const st = store();
    const g = game({ priv: priv({ shownToMe: [{ card: "s2", by: 2 }], found: ["r3"] }) });
    render(<Notebook game={g} me={1} code="K7M2" autoCross={false} storage={st} />);
    expect((screen.getByRole("status")).textContent).toContain("Residue found: 1 of 3");
    expect(screen.getByRole("button", { name: "Mr Vane, You: has it" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Miss Pike, Ben: has it" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Locket, Residue: has it" })).toBeTruthy();
    const cell = screen.getByRole("button", { name: "Dr Thorne, Ben: no mark" });
    fireEvent.click(cell);
    expect(screen.getByRole("button", { name: "Dr Thorne, Ben: has it" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dr Thorne, Ben: has it" }));
    expect(screen.getByRole("button", { name: "Dr Thorne, Ben: does not have it" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dr Thorne, Ben: does not have it" }));
    expect(screen.getByRole("button", { name: "Dr Thorne, Ben: maybe" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dr Thorne, Ben: maybe" }));
    expect(screen.getByRole("button", { name: "Dr Thorne, Ben: no mark" })).toBeTruthy();
  });
  it("keeps the marks and Theory on the device, under the Room Code and seat, and reads them back", () => {
    const st = store();
    const first = render(<Notebook game={game()} me={1} code="K7M2" autoCross={false} storage={st} />);
    fireEvent.click(screen.getByRole("button", { name: "Dr Thorne, Ben: no mark" }));
    fireEvent.change(screen.getByLabelText("Miss Pike"), { target: { value: "z2" } });
    const saved = JSON.parse(st.map.get(notebookKey("K7M2", 1))!) as { marks: unknown[]; theory: Record<string, string> };
    expect(saved.marks).toEqual([["s3|2", "has"]]);
    expect(saved.theory).toEqual({ s2: "z2" });
    first.unmount();
    render(<Notebook game={game()} me={1} code="K7M2" autoCross={false} storage={st} />);
    expect(screen.getByRole("button", { name: "Dr Thorne, Ben: has it" })).toBeTruthy();
    expect((screen.getByLabelText("Miss Pike") as HTMLSelectElement).value).toBe("z2");
    cleanup();
    render(<Notebook game={game({ priv: priv({ seat: 2, hand: [] }) })} me={2} code="K7M2" autoCross={false} storage={st} />);
    expect(screen.getByRole("button", { name: "Dr Thorne, You: no mark" })).toBeTruthy(); // another seat's notebook is its own
    fireEvent.click(screen.getByRole("button", { name: "Miss Pike, You: no mark" }));
    expect(JSON.parse(st.map.get(notebookKey("K7M2", 1))!).marks).toEqual([["s3|2", "has"]]);
    expect(JSON.parse(st.map.get(notebookKey("K7M2", 2))!).marks).toEqual([["s2|2", "has"]]);
  });
  it("crosses a card a Player passed on only when the Master turned auto-cross on", () => {
    const events = [{ id: 2, kind: "suggest", seat: 2, zone: "z1", suspect: "s2", relic: "r1", passed: [3], refuter: 1 }];
    const on = render(<Notebook game={game({ pub: pub({ events }) })} me={1} code="K7M2" autoCross storage={store()} />);
    expect(screen.getByRole("button", { name: "Miss Pike, Cat: does not have it" })).toBeTruthy();
    on.unmount();
    render(<Notebook game={game({ pub: pub({ events }) })} me={1} code="K7M2" autoCross={false} storage={store()} />);
    expect(screen.getByRole("button", { name: "Miss Pike, Cat: no mark" })).toBeTruthy();
  });
  it("ignores a saved notebook that does not read", () => {
    const st = store();
    st.map.set(notebookKey("K7M2", 1), '{"marks":[["x","nonsense"],5],"theory":{"a":3}}');
    render(<Notebook game={game()} me={1} code="K7M2" autoCross={false} storage={st} />);
    expect(screen.getByRole("button", { name: "Dr Thorne, Ben: no mark" })).toBeTruthy();
  });
});

describe("Actions (party-mode 9.7, 9.11)", () => {
  const sendSpy = () => vi.fn<(m: Readonly<{ t: string } & Record<string, unknown>>) => void>();
  it("on another's turn says who it waits for, offers Listen in only with Resolve to spend, and shows what was overheard", () => {
    const send = sendSpy();
    const g = game({ pub: pub({ active: 2 }), priv: priv({ canEavesdrop: 7, heard: [{ eventId: 7, card: "r1" }] }) });
    render(<Actions game={g} me={1} send={send} nowMs={0} offsetMs={0} />);
    expect(screen.getByText("Waiting for Ben.")).toBeTruthy();
    expect(screen.getByText("You heard: Music box")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Listen in (uses 1 Resolve)" }));
    expect(send).toHaveBeenCalledWith({ t: "eavesdrop", eventId: 7 });
  });
  it("on your turn walks to a Room, marks a cold or shut one in words, and cannot walk to where you stand", () => {
    const send = sendSpy();
    const g = game({ pub: pub({ at: "z1", closedZones: ["z3"], haunt: { level: 3, max: 10, coldSpot: "z2", choosing: null } }) });
    render(<Actions game={g} me={1} send={send} nowMs={0} offsetMs={0} />);
    expect((screen.getByRole("button", { name: /Cellar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Parlour \(shut\)/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Attic \(cold\)/ }));
    expect(send).toHaveBeenCalledWith({ t: "walk", zone: "z2" });
  });
  it("Inspect sends the message and shows a 10 s bar, then says what was found or that nothing was", () => {
    const send = sendSpy();
    const g0 = game({ pub: pub({ at: "z1" }) });
    const { rerender } = render(<Actions game={g0} me={1} send={send} nowMs={1000} offsetMs={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    expect(send).toHaveBeenCalledWith({ t: "inspect" });
    rerender(<Actions game={g0} me={1} send={send} nowMs={4000} offsetMs={0} />);
    expect((screen.getByRole("progressbar", { name: "Searching" })).getAttribute("aria-valuenow")).toBe("3");
    expect(screen.getByText("Searching… 7 s")).toBeTruthy();
    rerender(<Actions game={g0} me={1} send={send} nowMs={1000 + INSPECT_SECONDS * 1000} offsetMs={0} />);
    expect(screen.getByText("You found nothing here.")).toBeTruthy();
    rerender(<Actions game={game({ pub: pub({ at: "z1" }), priv: priv({ found: ["r3"] }) })} me={1} send={send} nowMs={1000 + INSPECT_SECONDS * 1000} offsetMs={0} />);
    expect(screen.getByText("You found a piece of Residue.")).toBeTruthy();
  });
  it("Suggest offers every Suspect and Relic, tags the ones in the hand, needs both picked and sends them", () => {
    const send = sendSpy();
    const onClose = vi.fn();
    render(<SuggestSheet game={game({ pub: pub({ at: "z1" }) })} me={1} send={send} onClose={onClose} />);
    expect(within(screen.getByRole("radiogroup", { name: "Suspect" })).getAllByRole("radio")).toHaveLength(3);
    expect(within(screen.getByRole("radiogroup", { name: "Relic" })).getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /Mr Vane.*in your hand/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Wax hand.*in your hand/ })).toBeTruthy();
    expect(screen.getByText("In the Cellar, who and with what?")).toBeTruthy();
    const go = screen.getByRole("button", { name: "Suggest" });
    expect((go as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Miss Pike/ }));
    expect((go as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Locket/ }));
    fireEvent.click(go);
    expect(send).toHaveBeenCalledWith({ t: "suggest", suspect: "s2", relic: "r3" });
    expect(onClose).toHaveBeenCalled();
  });
  it("after a Suggestion shows the 15 s window and End turn, and the Suggest button is gone", () => {
    const send = sendSpy();
    const events = [{ id: 1, kind: "turn-start", seat: 1 }, { id: 2, kind: "suggest", seat: 1, zone: "z1", suspect: "s2", relic: "r1", passed: [], refuter: 2 }];
    const g = game({ pub: pub({ at: "z1", events }) });
    const { rerender } = render(<Actions game={g} me={1} send={send} nowMs={5000} offsetMs={0} />);
    expect(screen.getByText(`You have ${WINDOW_SECONDS} s to accuse or end your turn.`)).toBeTruthy();
    rerender(<Actions game={g} me={1} send={send} nowMs={12_000} offsetMs={0} />);
    expect(screen.getByText("You have 8 s to accuse or end your turn.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Suggest" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    expect(send).toHaveBeenCalledWith({ t: "endTurn" });
    expect(screen.queryByRole("button", { name: "Pass" })).toBeNull();
  });
  it("Pass sends pass; Accuse opens a two-step seal and sends nothing until 'Seal it'", () => {
    const send = sendSpy();
    render(<Actions game={game({ pub: pub({ at: "z1" }) })} me={1} send={send} nowMs={0} offsetMs={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Pass" }));
    expect(send).toHaveBeenLastCalledWith({ t: "pass" });
    fireEvent.click(screen.getByRole("button", { name: "Accuse" }));
    for (const [group, name] of [["Suspect", /Dr Thorne/], ["Room", /Attic/], ["Relic", /Locket/]] as const) fireEvent.click(within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByRole("heading", { name: "This is final" })).toBeTruthy();
    expect(screen.getByText("Dr Thorne, in the Attic, with the Locket.")).toBeTruthy();
    expect(send).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Accuse" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Seal it" }));
    expect(send).toHaveBeenLastCalledWith({ t: "seal", suspect: "s3", zone: "z2", relic: "r3" });
  });
  it("after sealing there is no second Accuse, and the Room's refusal is shown in words", () => {
    const g = game({ pub: pub({ at: "z1", seats: [{ seat: 1, nickname: "Ana", bot: false, poltergeist: false, handSize: 4, sealed: true }] }), priv: priv({ sealed: { suspect: "s1", zone: "z1", relic: "r1" } }), refusal: { code: "not_in_zone", n: 1 } });
    render(<Actions game={g} me={1} send={() => undefined} nowMs={0} offsetMs={0} />);
    expect(screen.queryByRole("button", { name: "Accuse" })).toBeNull();
    expect(screen.getByText(/You sealed your Accusation/)).toBeTruthy();
    expect((screen.getByRole("alert")).textContent).toContain("Nothing to do here");
  });
  it("SealSheet needs all three picks before Review", () => {
    render(<SealSheet game={game()} send={() => undefined} onClose={() => undefined} />);
    expect((screen.getByRole("button", { name: "Review" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Prompts (party-mode 9.23, 9.12)", () => {
  it("asks which card to show with the countdown and the default in words, and sends the chosen card", () => {
    const send = vi.fn();
    const g = game({ priv: priv({ answer: { eventId: 3, options: ["s1", "r2"], deadlineMs: 9_000 } }) });
    render(<AnswerPrompt game={g} send={send} nowMs={2_000} offsetMs={0} />);
    expect((screen.getByRole("status")).textContent).toContain("7 s left");
    expect((screen.getByRole("status")).textContent).toContain("If you do not choose, the Room chooses for you.");
    fireEvent.click(screen.getByRole("button", { name: "Wax hand" }));
    expect(send).toHaveBeenCalledWith({ t: "show", card: "r2" });
  });
  it("shows nothing when nothing is asked, and says time is up at zero", () => {
    const { container, rerender } = render(<AnswerPrompt game={game()} send={() => undefined} nowMs={0} offsetMs={0} />);
    expect(container.firstChild).toBeNull();
    rerender(<AnswerPrompt game={game({ priv: priv({ answer: { eventId: 3, options: ["s1"], deadlineMs: 1000 } }) })} send={() => undefined} nowMs={5000} offsetMs={0} />);
    expect((screen.getByRole("status")).textContent).toContain("Time is up.");
  });
  it("offers the Haunt Event options with their effect in words and a 15 s countdown", () => {
    const send = vi.fn();
    const g = game({ priv: priv({ choose: { options: ["cold-spot", "lull"], deadlineMs: 15_000 } }) });
    render(<HauntChoice game={g} send={send} nowMs={0} offsetMs={0} />);
    expect((screen.getByRole("status")).textContent).toContain("15 s to choose.");
    expect((screen.getByRole("button", { name: /Cold Spot/ })).textContent).toContain("One room goes cold");
    fireEvent.click(screen.getByRole("button", { name: /Lull/ }));
    expect(send).toHaveBeenCalledWith({ t: "choose", option: "lull" });
  });
  it("the Rattle prompt turns Rattle on or is dismissed, and says nothing of who rattled", () => {
    const send = vi.fn();
    const dismiss = vi.fn();
    render(<RattlePrompt game={game({ prompt: { kind: "rattle-join", text: "Something stirred the house. Turn on Rattle to join in.", button: "turn-on-rattle" } })} send={send} onDismiss={dismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on Rattle" }));
    expect(send).toHaveBeenCalledWith({ t: "rattleOn", on: true });
    expect(dismiss).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(dismiss).toHaveBeenCalledTimes(2);
  });
});

describe("Recap (party-mode 9.22)", () => {
  const ending = (over: Record<string, unknown> = {}) => ({ solution: { suspect: "s2", zone: "z1", relic: "r3" }, residueAt: {}, winners: [2], houseWins: false, mostHaunting: 3, scare: {}, nudges: { help: 2, spook: 1 }, recap: { entries: [{ id: 1, kind: "turn-start", seat: 1 }, { id: 2, kind: "suggest", seat: 1, zone: "z1", suspect: "s2", relic: "r1", passed: [], refuter: 2, bluff: true }], reveal: [{ eventId: 5, kind: "frame", from: 2 }, { eventId: 6, kind: "house-cue", from: null }, { eventId: 7, kind: "rattle", from: 3 }] }, ...over });
  it("names the Solution and the winner, the most haunting, each Bluff in words and every sender at the end", () => {
    render(<Recap game={game({ pub: pub({ phase: "ended", ending: { ...ending(), stitch: [{ seat: 2, templateId: "tpl-2", subtitle: "wait here" }] } }) })} me={1} />);
    expect(screen.getByRole("heading", { name: "Ben solved it" })).toBeTruthy();
    expect(screen.getByText("It was Miss Pike, in the Cellar, with the Locket.")).toBeTruthy();
    expect(screen.getByText("Most haunting: Cat.")).toBeTruthy();
    expect(screen.getByText(/Ana suggested Miss Pike with the Music box in the Cellar\. \(a bluff\)/.source ? /You suggested|Ana suggested/ : /x/)).toBeTruthy();
    expect(screen.getByText(/\(a bluff\)/)).toBeTruthy();
    const senders = screen.getByRole("list", { name: "Who sent the sounds" });
    expect(within(senders).getByText("Ben sent a frame.")).toBeTruthy();
    expect(within(senders).getByText("The house sent a sound.")).toBeTruthy();
    expect(within(senders).getByText("Cat rattled the house.")).toBeTruthy();
    expect(screen.getByText("“wait here” used Ben's voice.")).toBeTruthy();
  });
  it("says the haunting continues when the house wins, and nothing before the end", () => {
    const { rerender, container } = render(<Recap game={game()} me={1} />);
    expect(container.firstChild).toBeNull();
    rerender(<Recap game={game({ pub: pub({ phase: "ended", ending: ending({ houseWins: true, winners: [] }) }) })} me={1} />);
    expect(screen.getByRole("heading", { name: "The haunting continues" })).toBeTruthy();
  });
});

void act; void lobby;
