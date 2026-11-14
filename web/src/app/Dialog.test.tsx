// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

afterEach(() => cleanup());

function Host({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      {open ? (
        <Dialog title="Delete this place?" onClose={() => { setOpen(false); onClose(); }} closeLabel="Keep it">
          <button>Delete</button>
        </Dialog>
      ) : null}
    </>
  );
}

describe("Dialog", () => {
  it("is a labelled modal dialog with the focus moved into it", () => {
    render(<Host />);
    fireEvent.click(screen.getByText("open"));
    const dialog = screen.getByRole("dialog", { name: "Delete this place?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep it" }));
  });

  it("keeps Tab and Shift+Tab inside, wrapping from the last control to the first and back", () => {
    render(<Host />);
    fireEvent.click(screen.getByText("open"));
    const del = screen.getByRole("button", { name: "Delete" });
    const keep = screen.getByRole("button", { name: "Keep it" });
    // Order in the dialog: Delete, then Keep it (the close button is last).
    del.focus();
    expect(fireEvent.keyDown(del, { key: "Tab", shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(keep);
    expect(fireEvent.keyDown(keep, { key: "Tab" })).toBe(false);
    expect(document.activeElement).toBe(del);
    // Away from the ends Tab is left to the browser.
    del.focus();
    expect(fireEvent.keyDown(del, { key: "Tab" })).toBe(true);
    keep.focus();
    expect(fireEvent.keyDown(keep, { key: "Tab", shiftKey: true })).toBe(true);
  });

  it("closes on Escape, calls onClose once, and gives focus back to what had it", () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    const opener = screen.getByText("open");
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it("closes from its close button", () => {
    render(<Host />);
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
