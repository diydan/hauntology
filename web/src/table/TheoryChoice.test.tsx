// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Theory } from "@hauntology/shared/party/theory";
import css from "./TheoryChoice.css?raw";
import { TheoryChoice } from "./TheoryChoice";

afterEach(cleanup);
const suspects = [{ id: "cora", name: "Cora Bell" }, { id: "vane", name: "Lady Vane" }, { id: "pike", name: "Dr. Pike" }];
const zones = ["Library", "Study", "Nursery", "Kitchen", "Hall", "Cellar"].map((n) => ({ id: n.toLowerCase(), name: n }));

describe("TheoryChoice", () => {
  it("offers each Suspect a choice of the six Zones or No mark, labelled with the Suspect's name", () => {
    render(<TheoryChoice suspects={suspects} zones={zones} theory={{}} onChange={() => undefined} />);
    for (const s of suspects) {
      const select = screen.getByLabelText(s.name) as HTMLSelectElement;
      expect([...select.options].map((o) => o.textContent)).toEqual(["No mark", ...zones.map((z) => z.name)]);
      expect(select.value).toBe("");
    }
  });

  it("shows the marks the Player already made", () => {
    render(<TheoryChoice suspects={suspects} zones={zones} theory={{ cora: "kitchen" }} onChange={() => undefined} />);
    expect((screen.getByLabelText("Cora Bell") as HTMLSelectElement).value).toBe("kitchen");
    expect((screen.getByLabelText("Lady Vane") as HTMLSelectElement).value).toBe("");
  });

  it("makes a mark with the same rules as the table, changes only that Suspect, and takes it back with No mark", () => {
    const onChange = vi.fn<(t: Theory) => void>();
    const theory: Theory = { vane: "hall" };
    render(<TheoryChoice suspects={suspects} zones={zones} theory={theory} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Cora Bell"), { target: { value: "library" } });
    expect(onChange).toHaveBeenLastCalledWith({ vane: "hall", cora: "library" });
    fireEvent.change(screen.getByLabelText("Lady Vane"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith({});
    expect(theory).toEqual({ vane: "hall" }); // the Player's marks are never changed in place
  });

  it("says the marks are the Player's own, and every control is 48 pixels or taller", () => {
    render(<TheoryChoice suspects={suspects} zones={zones} theory={{}} onChange={() => undefined} />);
    expect(screen.getByText(/Only you see this/)).toBeTruthy();
    expect(css).toMatch(/\.th-select \{[^}]*min-height: 48px/);
    for (const s of document.querySelectorAll("select")) expect(s.className).toContain("th-select");
  });
});
