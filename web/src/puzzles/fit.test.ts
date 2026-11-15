import { describe, expect, it } from "vitest";
import puzzlesCss from "./puzzles.css?raw";

// Fit. The picture of a puzzle takes the height the screen has left (so a puzzle shows whole without scrolling the page where it can), and a
// phone held sideways gets the picture on the left, the controls beside it and the header in a narrow column. These tests keep the pieces
// that make that work in place: the host knows its kind, each picture is marked, each picture is capped by --pz-h, and the minimums never let
// a finger target fall under 48 px.
const sources = import.meta.glob("./kinds/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const kindCss = import.meta.glob("./kinds/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const host = (import.meta.glob("./PuzzleHost.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>)["./PuzzleHost.tsx"]!;
const allCss = `${puzzlesCss}\n${Object.values(kindCss).join("\n")}`;
const KINDS = ["lockpick", "safe", "wires", "clock", "candles", "maze", "board", "words", "moved", "musicbox", "photo"];
const FILE: Record<string, string> = { lockpick: "LockPick", safe: "Safe", wires: "Wires", clock: "Clock", candles: "Candles", maze: "Maze", board: "Board", words: "Words", moved: "Moved", musicbox: "MusicBox", photo: "Photo" };

describe("puzzle fit", () => {
  it("puts the kind on the host, so the styles can size the picture for it", () => {
    expect(host).toMatch(/className=\{`pz-host\$\{[^`]*`\} data-kind=\{kind\}/);
  });

  it("marks the picture of every puzzle with pz-visual, so the sideways layout knows what goes on the left", () => {
    for (const kind of KINDS) {
      const src = sources[`./kinds/${FILE[kind]}.tsx`]!;
      expect((src.match(/pz-visual/g) ?? []).length, `${kind} has one picture`).toBe(1);
    }
  });

  it("caps the big pictures by --pz-h: the dials, the wires, the boards, the maze and the photo", () => {
    expect(allCss).toMatch(/\.pz-safe-board \{[^}]*var\(--pz-h\)/);
    expect(allCss).toMatch(/\.pz-clock-board \{[^}]*var\(--pz-h\)/);
    expect(allCss).toMatch(/\.pz-wires-board \{[^}]*var\(--pz-h\)/);
    expect(allCss).toMatch(/\.pz-spirit \{[^}]*var\(--pz-h\)/);
    expect(allCss).toMatch(/\.pz-wall \{[^}]*var\(--pz-h\)/);
    expect(allCss).toMatch(/\.pz-maze-board \{[^}]*var\(--pz-h\)/);
    expect(allCss).toMatch(/\.pz-photo-board\[data-cols="2"\] \{[^}]*var\(--pz-h\)/);
    expect(sources["./kinds/Photo.tsx"]).toMatch(/"--pz-ratio": H \/ W/);
  });

  it("tells each of those puzzles how much else is on its screen (--pz-rest), and never lets a picture shrink below a size a finger can use", () => {
    expect(puzzlesCss).toMatch(/--pz-h: max\(var\(--pz-min\), calc\(100dvh - var\(--pz-rest, 0px\)\)\)/);
    for (const kind of ["safe", "clock", "wires", "maze", "board", "words", "photo"]) expect(puzzlesCss, kind).toMatch(new RegExp(`\\.pz-host\\[data-kind='${kind}'\\] \\{ --pz-rest: [\\d.]+rem;`));
    // the wires keep six terminals at least 48 px apart, the interactive canvases stay at 13 rem or more, only the dials may go small
    const fit = puzzlesCss.slice(puzzlesCss.indexOf(" * Fit."), puzzlesCss.indexOf("/* A short screen held upright"));
    const min = (kind: string): number => Number(new RegExp(`\\.pz-host\\[data-kind='${kind}'\\][^{]*\\{[^}]*--pz-min: ([\\d.]+)rem`).exec(fit)?.[1] ?? "15");
    expect(min("wires")).toBeGreaterThanOrEqual(17);
    expect(min("safe")).toBeLessThanOrEqual(11);
    expect(min("clock")).toBeLessThanOrEqual(11);
    const short = /@media \(orientation: portrait\) and \(max-height: 42rem\) \{([\s\S]*?)\n\}/.exec(puzzlesCss)![1]!;
    expect(short).toMatch(/\.pz-host\[data-kind='wires'\] \{ --pz-min: 17\.5rem; \}/);
    expect(short).toMatch(/\.pz-host \{ --pz-min: 13rem; \}/);
  });

  it("gives the spirit board its own short band: one row of four buttons, a one-line clue, no explaining line in sight, and a board that may go down to 13 rem", () => {
    const board = sources["./kinds/Board.tsx"]!;
    const css = kindCss["./kinds/Board.css"]!;
    expect(board).toMatch(/className="pz-boardrow"/); // Clear, Hear, Tilt and Level in one row: a fourth button on a row of its own costs a 48 px line
    expect(css).toMatch(/\.pz-boardrow > \.ui-button \{[^}]*flex: 1 1 auto;[^}]*white-space: nowrap;/);
    const band = /@media \(orientation: portrait\) and \(max-height: 56rem\) \{([\s\S]*?)\n\}/.exec(css)![1]!;
    expect(band).toMatch(/\.pz-clue-line \{ font-size: var\(--text-control\); \}/); // one line at 360 px, where 14 px body text would take two
    expect(band).toMatch(/\.pz-under \{ min-height: 1\.5rem; \}/);
    expect(band).toMatch(/\.pz-board-hint \{ position: absolute;/); // out of sight, still read aloud
    expect(css).toMatch(/@media \(orientation: landscape\) and \(max-height: 32rem\) \{\s*\.pz-board-hint \{ position: absolute;/);
    expect(board).toMatch(/pz-hint pz-board-hint/);
    // what the screen has left is told in three bands: tall, under 56 rem, under 47 rem (the blocks sit closer together there); the floor stays at 13 rem
    expect(puzzlesCss).toMatch(/@media \(orientation: portrait\) and \(max-height: 56rem\) \{\s*\.pz-host\[data-kind='board'\] \{ --pz-rest: 31rem; --pz-min: 13rem; \}/);
    expect(puzzlesCss).toMatch(/@media \(orientation: portrait\) and \(max-height: 47rem\) \{\s*\.pz-host\[data-kind='board'\] \{ --pz-rest: 29rem; \}/);
  });

  it("gives the hidden words a lower row of letters and a thinner readout on a short screen held upright, so the wall keeps its size at 14 px running text", () => {
    const css = kindCss["./kinds/Words.css"]!;
    const band = /@media \(orientation: portrait\) and \(max-height: 47rem\) \{([\s\S]*?)\n\}/.exec(css)![1]!;
    expect(band).toMatch(/\.pz-words \.pz-digits > span \{ height: 2\.75rem; \}/);
    expect(band).toMatch(/\.pz-lit \{ min-height: 1\.5rem; \}/);
  });

  it("gives the smallest screen held upright (320 x 568) its own band: the how-to lines out of sight, the tilt buttons in one row, Give up on the status row, a 12 rem board", () => {
    const tiny = /@media \(orientation: portrait\) and \(max-height: 36rem\) \{([\s\S]*?)\n\}/.exec(puzzlesCss)![1]!;
    expect(tiny).toMatch(/\.pz-stage \.pz-hint:not\(\.pz-clue-line, \[role='status'\]\) \{ position: absolute;/); // out of sight, still read aloud; the Spirit board's clue and the status lines stay
    expect(tiny).toMatch(/\.pz-btnrow \{ flex-wrap: nowrap; \}/);
    expect(tiny).toMatch(/\.pz-btnrow > \.ui-button \{[^}]*flex: 1 1 auto;[^}]*white-space: nowrap;/);
    expect(tiny).toMatch(/\.pz-under, \.pz-lit \{ position: absolute;/); // the Pick button says the same
    expect(tiny).toMatch(/\.pz-st \{ position: absolute;/); // ": on" of the Twist button goes on the smallest screen: the lit button says it
    for (const k of ["Safe", "Clock"]) { // the name stays "Twist: on" for a screen reader
      expect(sources[`./kinds/${k}.tsx`], k).toMatch(/aria-label=\{twist \? "Twist: on" : "Twist"\}/);
      expect(sources[`./kinds/${k}.tsx`], k).toMatch(/Twist<span className="pz-st" aria-hidden="true">: on<\/span>/);
    }
    // Give up goes on the row of the status line; the confirmation and a row of more than one button take a row of their own
    expect(tiny).toMatch(/\.pz-host \{ grid-template-columns: minmax\(0, 1fr\) auto;/);
    expect(tiny).toMatch(/\.pz-host > \* \{ grid-column: 1 \/ -1; \}/);
    expect(tiny).toMatch(/\.pz-host > \.pz-feedback \{ grid-column: 1;/);
    expect(tiny).toMatch(/\.pz-host > \.pz-foot-wrap \{ grid-column: 2; \}/);
    expect(tiny).toMatch(/\.pz-foot-wrap:has\(\.pz-give, \.pz-foot > :nth-child\(2\)\) \{ grid-column: 1 \/ -1; \}/);
    expect(tiny).toMatch(/\.pz-host\[data-kind='board'\] \{ --pz-min: 12rem; \}/);
    // the rows and the lines the band speaks of are marked in the screens
    for (const k of ["LockPick", "Words", "Maze"]) expect(sources[`./kinds/${k}.tsx`], k).toMatch(/ui-row ui-row--center pz-btnrow/);
    for (const k of ["LockPick", "Candles", "MusicBox", "Clock"]) expect(sources[`./kinds/${k}.tsx`], k).toMatch(/ui-hint pz-hint pz-more/);
    expect(sources["./kinds/Board.tsx"]).toMatch(/<span className="pz-left"> left<\/span>/); // "Hear (2)" on the smallest screen, so the four buttons share a row
    expect(sources["./kinds/Board.tsx"]).toMatch(/<span className="pz-n"> · \{view\.length\} letters<\/span>/); // the clue is one line there: the letters boxes say how many
    expect(kindCss["./kinds/Board.css"]).toMatch(/\(max-height: 36rem\) \{\s*\.pz-left \{ display: none; \}\s*\.pz-n \{ position: absolute;/);
  });

  it("keeps two neighbouring buttons 8 px apart on a 320 px phone: the sides take 8 px, the music box 4 px more, and its keys never go under 48 px; the photo's pieces and spots are 14 units apart", () => {
    expect(puzzlesCss).toMatch(/@media \(max-width: 22rem\) \{\s*\.pz-host \{ padding-left: max\(var\(--space-2\), env\(safe-area-inset-left\)\); padding-right: max\(var\(--space-2\), env\(safe-area-inset-right\)\); \}/);
    const mbox = kindCss["./kinds/MusicBox.css"]!;
    expect(mbox).toMatch(/\.pz-keys \{[^}]*repeat\(5, minmax\(var\(--pz-target, 48px\), 1fr\)\);[^}]*gap: var\(--space-2\);/);
    expect(mbox).toMatch(/@media \(max-width: 22rem\) \{ \.pz-mbox \{ padding-left: var\(--space-1\); padding-right: var\(--space-1\); \} \}/);
    // five keys at the target and four gaps: what the box must give them, against what 320 px leaves (320 - 2 x 8 host sides - 2 x 9 stage - 2 x 4 box - 2 x 2 box edge)
    const keys = 5 * 48 + 4 * 8;
    const room = 320 - 2 * 8 - 2 * 9 - 2 * 4 - 2 * 2;
    expect(room).toBeGreaterThanOrEqual(keys);
    // the photo: neighbours are two insets apart, and a board drawn at 0.64 (the smallest) still leaves 8 px
    const inset = Number(/const INSET = (\d+)/.exec(sources["./kinds/Photo.tsx"]!)?.[1]);
    expect(2 * inset * 0.64).toBeGreaterThanOrEqual(8);
    expect((100 - 2 * inset) * 0.64).toBeGreaterThanOrEqual(48); // and a piece is still a finger wide (a cell is 100 units)
  });

  it("lays a phone held sideways out in two columns: the picture left, the controls beside it, the header, the message and Give up in a narrow column", () => {
    const land = /@media \(orientation: landscape\) and \(max-height: 32rem\) \{([\s\S]*?)\n\}\n/.exec(puzzlesCss)![1]!;
    expect(land).toMatch(/grid-template-areas: "stage bar" "stage feedback" "stage foot"/);
    expect(land).toMatch(/\.pz-visual \{ grid-column: 1; grid-row: 1 \/ 8; \}/);
    expect(land).toMatch(/--pz-h: max\(9rem, calc\(100dvh - 5\.5rem\)\)/);
    expect(land).toMatch(/\.pz-host > :not\(\.pz-bar-row, \.pz-stage, \.pz-feedback, \.pz-foot-wrap\) \{ grid-column: 1 \/ -1; \}/); // a help card or the clue spans the width
    expect(land).toMatch(/\.pz-confirm \{ grid-template-columns: 1fr; \}/);
    expect(land).toMatch(/\.pz-st \{ position: absolute;/); // and ": on" of Twist goes there too: the narrow column is 4 buttons wide // the two answers to "Give up?" stack in the narrow column
  });

  it("keeps the tilt explanation out of sight, not out of the page, on a very short screen", () => {
    expect(puzzlesCss).toMatch(/\.pz-twist \.ui-hint \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\); white-space: nowrap; \}/);
    expect(puzzlesCss).not.toMatch(/\.pz-twist \.ui-hint \{[^}]*display: none/);
  });
});
