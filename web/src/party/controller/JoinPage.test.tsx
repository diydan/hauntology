// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ControllerPort, JoinResult } from "./controller-port";
import { JoinPage } from "./JoinPage";
import { StandInPort, STANDIN_CODES } from "./standin-port";

afterEach(cleanup);

const codeBox = (): HTMLInputElement => screen.getByLabelText("Room Code") as HTMLInputElement;
const nameBox = (): HTMLInputElement => screen.getByLabelText("Name") as HTMLInputElement;
const type = (box: HTMLInputElement, value: string): void => { fireEvent.change(box, { target: { value } }); };
const join = async (): Promise<void> => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Join|Joining/ })); await Promise.resolve(); await Promise.resolve(); }); };
const live = (): HTMLElement => document.querySelector(".pc-answer") as HTMLElement;

describe("JoinPage", () => {
  it("has a Room Code and a name, both named, with their hints, and one main button", () => {
    render(<JoinPage port={new StandInPort()} />);
    expect(codeBox().getAttribute("aria-describedby")).toBeTruthy();
    expect(nameBox().getAttribute("maxlength")).toBe("16");
    expect(document.querySelectorAll(".ui-button--primary").length).toBe(1);
    expect(screen.getByRole("button", { name: "Join" })).toBeTruthy();
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull(); // the answer is read out when it comes
    expect(document.getElementById(codeBox().getAttribute("aria-describedby") ?? "")?.textContent).toMatch(/No 0, O, 1, I or L/);
  });

  it("puts what is typed in the code box in capitals, and fills it from the join link", () => {
    const { unmount } = render(<JoinPage port={new StandInPort()} />);
    type(codeBox(), "k7m2");
    expect(codeBox().value).toBe("K7M2");
    unmount();
    render(<JoinPage port={new StandInPort()} initialCode="k7m2" />);
    expect(codeBox().value).toBe("K7M2");
  });

  it("asks the Room with the canonical code and the cleaned nickname, and says when the seat is taken", async () => {
    const port = new StandInPort();
    let seated = 0;
    render(<JoinPage port={port} onSeated={() => { seated++; }} />);
    type(codeBox(), "k7-m2");
    type(nameBox(), "<b>Ann</b> www.example.com");
    await join();
    expect(port.calls).toEqual(["join K7M2 Ann"]);
    expect(seated).toBe(1);
    expect(live().textContent).toBe("");
    expect(port.getView().nickname).toBe("Ann");
  });

  it("sends Player when no name was typed", async () => {
    const port = new StandInPort();
    render(<JoinPage port={port} />);
    type(codeBox(), STANDIN_CODES.open);
    await join();
    expect(port.calls).toEqual(["join K7M2 Player"]);
  });

  it("tells a code that cannot be a code at once, asks the Room nothing, and puts the cursor back in the code box", async () => {
    const port = new StandInPort();
    render(<JoinPage port={port} />);
    type(codeBox(), "K7MO");
    nameBox().focus();
    await join();
    expect(port.calls).toEqual([]);
    expect(live().textContent).toMatch(/That is not a Room Code/);
    expect(live().textContent).toMatch(/4 letters or numbers/);
    expect(document.activeElement).toBe(codeBox());
    expect(codeBox().getAttribute("aria-invalid")).toBe("true");
  });

  it.each([
    [STANDIN_CODES.full, /That room is full/],
    [STANDIN_CODES.started, /That game has begun/],
    ["ZZZ9", /That room code isn't right/],
  ])("says what a refusal of %s means in plain words, in the live region, and lets the Player try again", async (code, words) => {
    const port = new StandInPort();
    let seated = 0;
    render(<JoinPage port={port} onSeated={() => { seated++; }} />);
    type(codeBox(), code);
    await join();
    expect(live().textContent).toMatch(words);
    expect(seated).toBe(0);
    expect(port.getView().seat).toBeNull();
    type(codeBox(), STANDIN_CODES.open);
    await join();
    expect(seated).toBe(1);
    expect(live().textContent).toBe(""); // the old answer is gone
  });

  it("puts the cursor back in the code box only when the code is the trouble", async () => {
    render(<JoinPage port={new StandInPort()} />);
    type(codeBox(), "ZZZ9");
    await join();
    expect(document.activeElement).toBe(codeBox());
    cleanup();
    render(<JoinPage port={new StandInPort()} />);
    type(codeBox(), STANDIN_CODES.full);
    nameBox().focus();
    await join();
    expect(document.activeElement).not.toBe(codeBox());
  });

  it("says the Room could not be reached when the port fails, without a word of the failure", async () => {
    const port: ControllerPort = { ...new StandInPort(), join: () => Promise.reject(new Error("socket 500 at 10.0.0.7")) } as unknown as ControllerPort;
    render(<JoinPage port={port} />);
    type(codeBox(), STANDIN_CODES.open);
    await join();
    expect(live().textContent).toMatch(/We could not reach the server/);
    expect(live().textContent).not.toMatch(/socket|500|10\.0/);
  });

  it("asks once for a double tap, and shows that it is working", async () => {
    let calls = 0;
    let release: (r: JoinResult) => void = () => undefined;
    const port = Object.assign(new StandInPort(), { join: () => { calls++; return new Promise<JoinResult>((res) => { release = res; }); } });
    render(<JoinPage port={port} />);
    type(codeBox(), STANDIN_CODES.open);
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    fireEvent.click(screen.getByRole("button", { name: /Joining/ }));
    expect(calls).toBe(1);
    expect(screen.getByRole("button", { name: /Joining/ }).getAttribute("aria-disabled")).toBe("true");
    await act(async () => { release({ ok: true, seat: 1, nickname: "Player" }); await Promise.resolve(); });
    expect(screen.getByRole("button", { name: "Join" }).getAttribute("aria-disabled")).toBe("false");
  });
});
