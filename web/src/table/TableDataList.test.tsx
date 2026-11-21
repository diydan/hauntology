// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TableData } from "@hauntology/shared/table/data";
import css from "./TableDataList.css?raw";
import { TableDataList } from "./TableDataList";

afterEach(cleanup);

const data: TableData = {
  rooms: [
    { zone: "library", name: "Library", slot: 0, coldSpot: false, inspected: true, mark: "maybe" },
    { zone: "kitchen", name: "Kitchen", slot: 1, coldSpot: true, inspected: false },
  ],
  pawns: [
    { seat: 0, nickname: "Ada", zone: "library", active: true, mono: false },
    { seat: 1, nickname: "Bo", zone: "door", active: false, mono: true },
  ],
  suspects: [{ card: "cora", name: "Cora Bell", placedIn: "kitchen", mark: "ruled_out" }],
  relics: [{ card: "key", name: "The brass key" }],
  haunt: { level: 2, max: 5 },
};

describe("TableDataList", () => {
  it("lists every room with its Pawns, the Cold Spot and the Player's marks", () => {
    render(<TableDataList data={data} playerSeat={0} />);
    const library = screen.getByText("Library").closest("li") as HTMLElement;
    expect(within(library).getByText("Ada")).toBeTruthy();
    expect(within(library).getByText(/their turn/)).toBeTruthy();
    expect(within(library).getByText(/your mark: maybe/)).toBeTruthy();
    expect(within(library).getByText(/you have read it/)).toBeTruthy();
    const kitchen = screen.getByText("Kitchen").closest("li") as HTMLElement;
    expect(within(kitchen).getByText(/Cold Spot/)).toBeTruthy();
    expect(within(kitchen).getByText("No one here")).toBeTruthy();
    expect(within(kitchen).getByText(/Cora Bell: your theory puts them here/)).toBeTruthy();
  });

  it("names the door Pawns and every Suspect and Relic with its mark", () => {
    render(<TableDataList data={data} />);
    expect(screen.getByText("At the door")).toBeTruthy();
    expect(screen.getByText(/Bo/).textContent).toContain("poltergeist");
    expect(screen.getByText("Suspects").nextElementSibling?.textContent).toBe("Cora Bell (ruled out)");
    expect(screen.getByText("The brass key")).toBeTruthy();
    expect(screen.getByText("Haunt 2 of 5.")).toBeTruthy();
  });

  it("says the answer only when the game has ended, with names rather than card ids", () => {
    const { unmount } = render(<TableDataList data={data} />);
    expect(screen.queryByText(/The answer:/)).toBeNull();
    unmount();
    render(<TableDataList data={{ ...data, ended: { zone: "kitchen", suspect: "cora", relic: "key" } }} />);
    expect(screen.getByRole("status").textContent).toBe("The answer: Cora Bell, with The brass key, in the Kitchen.");
  });

  it("keeps every line inside a 320 px column with no sideways scroll", () => {
    expect(css).toMatch(/\.tl-room \{[^}]*overflow-wrap: anywhere/);
    expect(css).not.toMatch(/white-space:\s*nowrap/);
  });
});
