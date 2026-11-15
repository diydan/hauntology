// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { placeClues, readAll } from "@hauntology/shared/puzzles/clues";
import css from "./ClueList.css?raw";
import { ClueList } from "./ClueList";

afterEach(cleanup);
const clues = placeClues(5, [4, 7, 1, 9]);
const codeClue = (place: number) => clues.find((c) => c.form === "code" && c.place === place)!;

describe("ClueList", () => {
  it("names every clue and shows the text only of a clue that was read", () => {
    const read = new Set([codeClue(2).id, "date"]);
    render(<ClueList clues={clues} read={read} onShowAll={() => undefined} />);
    expect(document.querySelectorAll(".cl-rows li").length).toBe(clues.length);
    expect(screen.getByText("2 of 7", { exact: false })).toBeTruthy();
    const unread = clues.filter((c) => !read.has(c.id));
    for (const c of unread.filter((x) => x.form !== "code")) expect(document.body.textContent ?? "", `${c.id} leaked`).not.toContain(c.text);
    expect(document.querySelectorAll('[data-found="0"]').length).toBe(unread.length);
    expect(document.querySelectorAll('[data-found="0"] span')[0]?.textContent).toBe("Not found yet");
  });

  it("says Code so far with a question mark for each digit not read, in the order of the code", () => {
    render(<ClueList clues={clues} read={new Set([codeClue(1).id, codeClue(3).id])} onShowAll={() => undefined} />);
    expect(screen.getByLabelText("Code so far").textContent).toBe("Code so far: 4 ? 1 ?");
  });

  it("reads everything at once from Show all as text, which then has nothing left to do", () => {
    const onShowAll = vi.fn();
    const { rerender } = render(<ClueList clues={clues} read={new Set()} onShowAll={onShowAll} />);
    fireEvent.click(screen.getByRole("button", { name: "Show all as text" }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
    rerender(<ClueList clues={clues} read={readAll(clues)} onShowAll={onShowAll} />);
    expect(screen.getByLabelText("Code so far").textContent).toBe("Code so far: 4 7 1 9");
    expect((screen.getByRole("button", { name: "Show all as text" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelectorAll('[data-found="0"]').length).toBe(0);
  });

  it("has a Close button only when asked, and every control is 48 pixels or taller", () => {
    const { rerender } = render(<ClueList clues={clues} read={new Set()} onShowAll={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    const onClose = vi.fn();
    rerender(<ClueList clues={clues} read={new Set()} onShowAll={() => undefined} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    expect(css).toMatch(/\.cl-button \{[^}]*min-height: 48px/);
    for (const b of document.querySelectorAll("button")) expect(b.className).toContain("cl-button");
  });
});
