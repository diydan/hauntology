// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTRIBUTION_WORDS, contributionWords, type ContributionApi, type Result } from "../contribute-api";
import { ContributionPanel, MAX_PROMPT_SKIPS } from "./ContributionPanel";

afterEach(cleanup);
const PROMPTS = (n: number) => ({ round: n, prompts: [{ id: `a${n}`, text: "A doorway", tip: "Stand back so the whole frame shows.", source: "take_now" as const }, { id: `b${n}`, text: "Something blue", tip: "Pick a photo you already have.", source: "camera_roll" as const }, { id: `c${n}`, text: "A staircase", tip: "tip c", source: "take_now" as const }] });
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
function fakeApi(over: Partial<ContributionApi> = {}): ContributionApi & { calls: string[] } {
  const calls: string[] = [];
  let round = 0;
  return Object.assign({
    prompts: async () => { calls.push("prompts"); return ok(PROMPTS(0)); },
    skip: async () => { calls.push("skip"); round += 1; return round > 3 ? ({ ok: false, code: "prompt_skips_used" } as const) : ok(PROMPTS(round)); },
    uploadPhoto: async (_f: Blob, id?: string) => { calls.push(`photo ${id ?? "own"}`); return ok({ status: "accepted" as const }); },
    zoneName: async (n: string) => { calls.push(`zone ${n}`); return ok({ name: n }); },
    suspectPortraits: async () => { calls.push("portraits"); return ok({ fallback: false as const, candidates: [{ candidateId: "c1", imageUrl: "/c1.png" }, { candidateId: "c2", imageUrl: "/c2.png" }] }); },
    suspectSprite: async (id: string, voice?: string) => { calls.push(`sprite ${id} ${voice}`); return ok({ fallback: false, profileId: "g1" }); },
    ...over,
  }, { calls }) as never;
}
const file = () => new File(["x"], "p.png", { type: "image/png" });
const pick = (el: HTMLElement): void => { fireEvent.change(el, { target: { files: [file()] } }); };

describe("ContributionPanel (party-mode 9.8)", () => {
  it("shows nothing without a client, and says everything is optional with one", async () => {
    const { container } = render(<ContributionPanel api={null} />);
    expect(container.firstChild).toBeNull();
    cleanup();
    await act(async () => { render(<ContributionPanel api={fakeApi()} />); });
    expect(screen.getByText("All of this is optional. If you skip it, the game uses its own.")).toBeTruthy();
  });
  it("shows the three photo ideas with a tip for the chosen one, opens the camera for take-now and the picker for camera-roll, and sends the idea's id", async () => {
    const api = fakeApi();
    await act(async () => { render(<ContributionPanel api={api} />); });
    const ideas = screen.getByRole("radiogroup", { name: "Photo ideas" });
    expect(ideas.querySelectorAll('[role="radio"]')).toHaveLength(3);
    fireEvent.click(screen.getByRole("radio", { name: "A doorway" }));
    expect(screen.getByText("Stand back so the whole frame shows.")).toBeTruthy();
    const cam = screen.getByLabelText("Take a photo") as HTMLInputElement;
    expect(cam.getAttribute("capture")).toBe("environment");
    expect(cam.getAttribute("accept")).toBe("image/*");
    fireEvent.click(screen.getByRole("radio", { name: "Something blue" }));
    const roll = screen.getByLabelText("Choose a photo") as HTMLInputElement;
    expect(roll.getAttribute("capture")).toBeNull();
    await act(async () => { pick(roll); });
    expect(api.calls).toContain("photo b0");
    expect(screen.getByText("Thank you. Your photo will hang in the house.")).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: "Photo ideas" })).toBeNull();
  });
  it("offers three more up to three times with the count left, then says no more; and 'use my own photo' sends no idea", async () => {
    const api = fakeApi();
    await act(async () => { render(<ContributionPanel api={api} />); });
    for (let i = 0; i < MAX_PROMPT_SKIPS; i++) {
      expect(screen.getByRole("button", { name: `Show me three more (${MAX_PROMPT_SKIPS - i} left)` })).toBeTruthy();
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Show me three more/ })); });
    }
    expect((screen.getByRole("button", { name: "Show me three more (0 left)" }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.calls.filter((c) => c === "skip")).toHaveLength(3);
    expect(screen.getByText("A doorway")).toBeTruthy();
    await act(async () => { pick(screen.getByLabelText("Use my own photo")); });
    expect(api.calls).toContain("photo own");
  });
  it("says in words why a photo was refused, and keeps the ideas so another can be tried", async () => {
    const api = fakeApi({ uploadPhoto: async () => ({ ok: false, code: "photo_rejected", reason: "person_visible" }) });
    await act(async () => { render(<ContributionPanel api={api} />); });
    fireEvent.click(screen.getByRole("radio", { name: "Something blue" }));
    await act(async () => { pick(screen.getByLabelText("Choose a photo")); });
    expect(screen.getByRole("alert").textContent).toBe("A person can be seen in that photo. Pick a picture without anyone in it.");
    expect(screen.getByRole("radiogroup", { name: "Photo ideas" })).toBeTruthy();
  });
  it("names a room: sends the trimmed name, shows what the Room kept, and says why a name was refused", async () => {
    const api = fakeApi();
    await act(async () => { render(<ContributionPanel api={api} />); });
    const send = screen.getByRole("button", { name: "Send the name" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("A name for one room"), { target: { value: "  The blue stairs " } });
    await act(async () => { fireEvent.click(send); });
    expect(api.calls).toContain("zone The blue stairs");
    expect(screen.getByText("“The blue stairs” may name a room in the house.")).toBeTruthy();
    cleanup();
    const bad = fakeApi({ zoneName: async () => ({ ok: false, code: "name_unsafe" }) });
    await act(async () => { render(<ContributionPanel api={bad} />); });
    fireEvent.change(screen.getByLabelText("A name for one room"), { target: { value: "x" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send the name" })); });
    expect(screen.getByText("That name can't be used. Try another.")).toBeTruthy();
  });
  it("a ready-made ghost needs nothing; Design one asks for the traits, a detail and a plain voice pick, shows pictures, and sends the chosen one with the voice", async () => {
    const api = fakeApi();
    await act(async () => { render(<ContributionPanel api={api} />); });
    expect(screen.getByText("The game gives you one of its own ghosts. Nothing to do.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Design one" }));
    fireEvent.change(screen.getByLabelText("Mood"), { target: { value: "stern" } });
    fireEvent.click(screen.getByRole("radio", { name: "A lighter voice" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show me pictures" })); });
    expect(api.calls).toContain("portraits");
    expect(screen.getAllByRole("img")).toHaveLength(2);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Ghost picture 2/ })); });
    expect(api.calls).toContain("sprite c2 lighter");
    expect(screen.getByText("Your ghost is in the house.")).toBeTruthy();
  });
  it("says a ready-made ghost will stand in when the Creator falls back, and why a call was refused", async () => {
    const fallback = fakeApi({ suspectPortraits: async () => ok({ fallback: true as const, profileId: "preset-2", reason: "unsafe" }) });
    await act(async () => { render(<ContributionPanel api={fallback} />); });
    fireEvent.click(screen.getByRole("radio", { name: "Design one" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show me pictures" })); });
    expect(screen.getByText("A ready-made ghost will stand in for yours.")).toBeTruthy();
    cleanup();
    const quota = fakeApi({ suspectPortraits: async () => ({ ok: false, code: "quota_image" }) });
    await act(async () => { render(<ContributionPanel api={quota} />); });
    fireEvent.click(screen.getByRole("radio", { name: "Design one" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show me pictures" })); });
    expect(screen.getByRole("alert").textContent).toBe(CONTRIBUTION_WORDS.quota_image);
  });
  it("has words for every refusal the routes send, and a general line for one it does not know", () => {
    for (const code of ["photo_rejected", "upload_too_large", "moderation_unavailable", "name_invalid", "prompt_skips_used", "game_started", "contributions_unavailable", "rate_limited", "bad_token", "room_unknown", "unreachable"]) expect(contributionWords(code).length, code).toBeGreaterThan(10);
    expect(contributionWords("photo_rejected", "person_visible")).toContain("person");
    expect(contributionWords("never_heard_of_it")).toBe("That did not work. You can try again, or skip this.");
    vi.fn();
    void waitFor;
  });
});
