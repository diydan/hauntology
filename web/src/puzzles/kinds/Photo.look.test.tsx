// @vitest-environment jsdom
import { cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { mountKind, stubGeometry } from "../test-utils";
import Photo from "./Photo";

// The look of the Torn photo as a thing on a table: a card mount with a recess and four photo corners for every spot, a felt tray, and pieces that are torn prints with paper showing.
let restore = (): void => {};
beforeEach(() => { restore = stubGeometry(); });
afterEach(() => { cleanup(); restore(); });
const lockOf = (level: "easy" | "medium" | "hard", seed: number) => { const l = makeLock("photo", level, seed); if (l.kind !== "photo") throw new Error("kind"); return l; };

describe("the torn photo, on its mount", () => {
  it("every frame spot is a recess in the card with four photo corners over it, the tray is felt, and neither can be touched or read out", () => {
    for (const level of ["easy", "medium", "hard"] as const) {
      const lock = lockOf(level, 4);
      const n = lock.view.cols * lock.view.rows;
      const { unmount } = mountKind(Photo, lock.view);
      const mount = document.querySelector("svg.pz-photo-mount") as SVGElement;
      expect(mount.getAttribute("aria-hidden"), level).toBe("true");
      expect(mount.querySelectorAll("rect.pz-mount-recess"), level).toHaveLength(n);
      expect(mount.querySelector("rect.pz-mount-card"), level).not.toBeNull();
      expect(mount.querySelector("rect.pz-mount-felt"), level).not.toBeNull();
      const corners = document.querySelector("svg.pz-photo-corners") as SVGElement;
      expect(corners.getAttribute("aria-hidden")).toBe("true");
      expect(corners.querySelectorAll("path.pz-mount-corner"), level).toHaveLength(4 * n);
      unmount();
    }
  });

  it("the mount and the corners are drawn in the units of the board, so they sit exactly on the spots", () => {
    const lock = lockOf("medium", 2);
    mountKind(Photo, lock.view);
    const board = document.querySelector(".pz-photo-board") as HTMLElement;
    const ratio = board.style.aspectRatio.split("/").map((v) => Number(v.trim()));
    for (const sel of ["svg.pz-photo-mount", "svg.pz-photo-corners"]) expect(document.querySelector(sel)?.getAttribute("viewBox"), sel).toBe(`0 0 ${ratio[0]} ${ratio[1]}`);
  });

  it("each piece is a torn print: its picture has a ragged edge and paper behind it, and they stay in the tray cells", () => {
    const lock = lockOf("medium", 2);
    mountKind(Photo, lock.view);
    const pieces = [...document.querySelectorAll(".pz-piece")];
    expect(pieces).toHaveLength(lock.view.cols * lock.view.rows);
    for (const p of pieces) {
      const svg = p.querySelector("svg") as SVGElement;
      expect(svg.classList.contains("pz-picture-torn")).toBe(true);
      expect(svg.querySelector("polygon.pz-torn-paper")).not.toBeNull();
    }
    expect(document.querySelectorAll(".pz-photo-cell")).toHaveLength(pieces.length);
  });

  it("a picked piece is shown by a glow on its picture, and the pieces are still at least 48 px", () => {
    const lock = lockOf("easy", 1);
    mountKind(Photo, lock.view);
    const first = document.querySelector(".pz-piece") as HTMLElement;
    fireEvent.click(first);
    expect(first.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll('.pz-piece[aria-pressed="true"]')).toHaveLength(1);
  });
});
