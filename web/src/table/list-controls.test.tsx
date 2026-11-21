// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableData } from "@hauntology/shared/table/data";
import css from "./table.css?raw";
import { buildModel } from "./model";
import { BoardArrow, PieceCard, TableControls } from "./TableControls";
import { TableList } from "./TableList";

afterEach(cleanup);
const zones = ["library", "study", "nursery", "kitchen", "hall", "cellar"];
const data: TableData = {
  rooms: zones.map((z, i) => ({ zone: z, name: z[0]!.toUpperCase() + z.slice(1), slot: i, coldSpot: z === "nursery", inspected: z === "hall", ...(z === "library" ? { mark: "ruled_out" as const } : {}) })),
  pawns: [{ seat: 0, nickname: "Ada", zone: "hall", active: true, mono: false }, { seat: 1, nickname: "Miles", zone: "door", active: false, mono: true }],
  suspects: ["cora", "vane", "pike"].map((c, i) => ({ card: c, name: ["Cora Bell", "Lady Vane", "Dr. Pike"][i]!, ...(c === "pike" ? { mark: "maybe" as const } : {}) })),
  relics: [{ card: "a", name: "Music Box" }, { card: "b", name: "Locket" }],
  haunt: { level: 3, max: 6 },
};
const model = (theory = {}) => buildModel({ data, roomCode: "AB12", theory, tMs: 0, reducedMotion: true });

describe("TableList", () => {
  it("gives every room with its Pawns and Marks, every Suspect and Relic as text, and the Whisper", () => {
    render(<TableList model={model()} theory={{}} onTheory={() => undefined} />);
    for (const name of ["Library", "Study", "Nursery", "Kitchen", "Hall", "Cellar", "Cora Bell", "Lady Vane", "Dr. Pike", "Music Box", "Locket"]) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    const hall = document.querySelector('[data-piece="room:hall"]')!;
    expect(hall.textContent).toContain("Ada");
    expect(hall.textContent).toContain("You inspected this room.");
    expect(document.querySelector('[data-piece="room:library"]')!.textContent).toContain("ruled out (cross)");
    expect(document.querySelector('[data-piece="suspect:pike"]')!.textContent).toContain("maybe (question mark)");
    expect(screen.getByText(/At the front door: Miles\./)).toBeTruthy();
    expect(screen.getByText(/The Whisper: The Whisper\. Haunt 3 of 6\./)).toBeTruthy();
  });

  it("is the only view with one line of why when it is given a notice, and sets and clears a Theory mark by the room choice", () => {
    const onTheory = vi.fn();
    render(<TableList model={model()} theory={{}} onTheory={onTheory} notice="This phone cannot draw the table, so here it is as a list." />);
    expect(screen.getByRole("status").textContent).toContain("as a list");
    const select = screen.getByLabelText("Cora Bell") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "study" } });
    expect(onTheory).toHaveBeenCalledWith({ cora: "study" });
  });

  it("shows the Player's own Theory mark for a Suspect in the list text and the choice", () => {
    render(<TableList model={model({ cora: "study" })} theory={{ cora: "study" }} onTheory={() => undefined} />);
    expect(document.querySelector('[data-piece="suspect:cora"]')!.textContent).toContain("maybe here");
    expect((screen.getByLabelText("Cora Bell") as HTMLSelectElement).value).toBe("study");
    expect(document.querySelector('[data-piece="room:study"]')!.textContent).toContain("Cora Bell");
  });

  it("makes each row a tap target when it is given onPick", () => {
    const onPick = vi.fn();
    render(<TableList model={model()} theory={{}} onTheory={() => undefined} onPick={onPick} />);
    fireEvent.click(within(document.querySelector('[data-piece="relic:b"]') as HTMLElement).getByRole("button"));
    expect(onPick).toHaveBeenCalledWith("relic:b");
  });
});

describe("TableControls", () => {
  const props = { camera: "off" as const, onCamera: vi.fn(), onPlace: vi.fn(), tilt: "on" as const, onTilt: vi.fn(), clueCount: 2, onClues: vi.fn() };
  it("has the four controls in one group and says each state in words", () => {
    render(<TableControls {...props} />);
    const group = screen.getByRole("group", { name: "Table controls" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.querySelector(".st-control-name")!.textContent)).toEqual(["Camera", "Place", "Tilt", "Clues"]);
    expect(screen.getByRole("button", { name: /Clues, 2 read/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Camera/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /Tilt/ }).textContent).toContain("On");
  });
  it("sends each tap and disables Tilt where there is no sensor", () => {
    const p = { ...props, onCamera: vi.fn(), onPlace: vi.fn(), onTilt: vi.fn(), onClues: vi.fn(), tilt: "unavailable" as const };
    render(<TableControls {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /Camera/ }));
    fireEvent.click(screen.getByRole("button", { name: /Place/ }));
    fireEvent.click(screen.getByRole("button", { name: /Clues/ }));
    expect(p.onCamera).toHaveBeenCalledTimes(1);
    expect(p.onPlace).toHaveBeenCalledTimes(1);
    expect(p.onClues).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: /Tilt/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /Tilt/ }).textContent).toContain("No sensor");
  });
});

describe("PieceCard and BoardArrow", () => {
  it("names the piece, says what the Player may know and closes", () => {
    const m = model();
    const onClose = vi.fn();
    render(<PieceCard model={m} piece={m.rooms.find((r) => r.zone === "hall")!} onClose={onClose} />);
    expect(screen.getByRole("heading", { name: "Hall" })).toBeTruthy();
    expect(screen.getByText(/Pawns here: Ada/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
  it("labels the arrow 'board'", () => {
    render(<BoardArrow angle={0.3} />);
    expect(screen.getByText("board")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("board");
  });
});

describe("table.css", () => {
  it("writes no colour of its own, and keeps its controls at 48 px", () => {
    expect(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(css)).toBe(false);
    expect(css).toMatch(/\.st-control\s*{[^}]*min-height: 48px/);
    expect(css).toMatch(/\.st-close\s*{[^}]*min-height: 48px/);
    expect(css).toMatch(/\.st-stop\s*{[^}]*min-height: 48px/);
    expect(css).toMatch(/grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  });
  it("uses only token gaps and radii, and no animation of its own", () => {
    for (const m of css.matchAll(/(gap|padding[a-z-]*|margin[a-z-]*|border-radius):\s*([^;]+);/g)) expect(m[2]!.trim(), m[0]).toMatch(/^(0|auto|var\(--[a-z0-9-]+\)(\s+var\(--[a-z0-9-]+\))*)$/);
    expect(/(animation|transition)\s*:/.test(css)).toBe(false);
  });
});
