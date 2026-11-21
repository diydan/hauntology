// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { game, lobby, pub } from "../../../test/party-fixtures";
import { Hud } from "../../host/Hud";
import { EMPTY_HOST } from "../../host/host-view";
import { SeatPortrait, SeatRow } from "./SeatPortrait";

afterEach(cleanup);
const PRESET = { portraitUrl: "/ghosts/dunmore.webp", monoUrl: "/ghosts/dunmore-mono.webp", preset: true };
const DESIGNED = { portraitUrl: "/api/ghosts/sprite/room-K7M2-2" };
const imgs = (c: HTMLElement) => [...c.querySelectorAll<HTMLImageElement>("img")];

describe("SeatPortrait (party-mode 9.25)", () => {
  it("draws the contributed ghost in colour, and a nickname chip when there is none", () => {
    const a = render(<SeatPortrait seat={2} nickname="Ben" profile={DESIGNED} look="colour" reducedMotion={false} />);
    expect(imgs(a.container).map((i) => i.getAttribute("src"))).toEqual(["/api/ghosts/sprite/room-K7M2-2"]);
    expect(imgs(a.container)[0]!.style.filter).toBe("none");
    cleanup();
    const b = render(<SeatPortrait seat={1} nickname="Ana" profile={null} look="colour" reducedMotion={false} />);
    expect(b.container.querySelector(".pc-chip-portrait")!.textContent).toBe("An");
    expect(imgs(b.container)).toHaveLength(0);
  });
  it("fades a Preset Ghost into its own black and white picture, and any other ghost under a greyscale filter (no second picture), in at most 0.6 s", () => {
    const p = render(<SeatPortrait seat={1} nickname="Ana" profile={PRESET} look="mono" reducedMotion={false} />);
    const [colour, mono] = imgs(p.container);
    expect(colour!.style.opacity).toBe("0");
    expect(mono!.getAttribute("src")).toBe("/ghosts/dunmore-mono.webp");
    expect(mono!.style.opacity).toBe("1");
    expect(colour!.style.transition).toBe("opacity 600ms linear");
    cleanup();
    const d = render(<SeatPortrait seat={2} nickname="Ben" profile={DESIGNED} look="mono" reducedMotion={false} />);
    expect(imgs(d.container)).toHaveLength(1);
    expect(imgs(d.container)[0]!.style.filter).toBe("grayscale(1)");
    expect(imgs(d.container)[0]!.style.transition).toBe("filter 600ms linear");
    cleanup();
    const c = render(<SeatPortrait seat={3} nickname="Cat" profile={null} look="mono" reducedMotion={false} />);
    expect((c.container.querySelector(".pc-chip-portrait") as HTMLElement).style.filter).toBe("grayscale(1)");
  });
  it("is a cut, with no transition, under reduced motion", () => {
    const r = render(<SeatPortrait seat={1} nickname="Ana" profile={PRESET} look="mono" reducedMotion />);
    for (const i of imgs(r.container)) expect(i.style.transition).toBe("none");
    cleanup();
    const d = render(<SeatPortrait seat={2} nickname="Ben" profile={DESIGNED} look="mono" reducedMotion />);
    expect(imgs(d.container)[0]!.style.transition).toBe("none");
  });
  it("never goes back to colour once in the haunting: the look is what the public haunting flag says, in the row too", () => {
    const g = game({ lobby: lobby({ seats: [{ seat: 1, nickname: "Ana", bot: false, connected: true, portrait: PRESET }, { seat: 2, nickname: "Ben", bot: false, connected: true, portrait: DESIGNED }, { seat: 3, nickname: "Cat", bot: false, connected: true }, { seat: 4, nickname: "Agnes", bot: true, connected: true }] }) });
    render(<SeatRow game={g} me={1} reducedMotion={false} />);
    const row = screen.getByRole("list", { name: "At the table" });
    const items = [...row.querySelectorAll("li")];
    expect(items.map((li) => li.lastElementChild!.textContent)).toEqual(["You", "Ben", "Cat · joined the haunting", "Agnes"]);
    expect(items[2]!.querySelector("[data-look]")!.getAttribute("data-look")).toBe("mono");
    expect(items[0]!.querySelector("[data-look]")!.getAttribute("data-look")).toBe("colour");
    expect(document.body.textContent).not.toMatch(/Poltergeist/i);
  });
  it("shows a row from the Public View alone when no lobby view has come, and nothing for an empty game", () => {
    const g = game({ lobby: null });
    render(<SeatRow game={g} reducedMotion={false} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    cleanup();
    const { container } = render(<SeatRow game={game({ pub: null, lobby: null })} reducedMotion={false} />);
    expect(container.firstChild).toBeNull();
  });
  it("appears on the Host HUD too, with the same wording", () => {
    render(<Hud host={{ ...EMPTY_HOST, game: game({ pub: pub() }) }} offsetMs={0} nowMs={0} />);
    expect(screen.getByRole("list", { name: "At the table" })).toBeTruthy();
    expect(screen.getByText("Cat · joined the haunting")).toBeTruthy();
  });
});
