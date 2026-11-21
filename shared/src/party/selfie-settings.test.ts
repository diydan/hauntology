import { describe, expect, it } from "vitest";
import { createEngine, step, type EngineSeat } from "./engine";
import { parseClientMessage } from "./protocol";
import { selfieAllowed } from "./selfie";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const seats: EngineSeat[] = [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: false, botLevel: "standard" }));
const fresh = () => createEngine({ seed: 7, seats, settings: { baseSeconds: 60, hauntMax: 10 }, presetIds: PRESETS });
const send = (s: ReturnType<typeof fresh>, seat: number, selfies: boolean) => step(s, { kind: "client", seat, msg: { t: "settings", selfies } }, 1000);

describe("settings.selfies (party-mode 3.10, 2.116)", () => {
  it("is off by default, so no seat is allowed a selfie", () => {
    const s = fresh();
    expect(s.settings.selfies ?? false).toBe(false);
    expect(selfieAllowed({ selfies: s.settings.selfies ?? false }, { selfieYes: true, selfieMade: false })).toBe(false);
  });
  it("is changed by the Master's token only, and only in the lobby", () => {
    const s = fresh();
    const denied = send(s, 2, true);
    expect(denied.refused).toBe("not_master");
    expect(denied.state.settings.selfies ?? false).toBe(false);
    const on = send(s, 1, true);
    expect(on.state.settings.selfies).toBe(true);
    expect(send(on.state, 1, false).state.settings.selfies).toBe(false);
    const playing = { ...on.state, phase: "playing" as const };
    expect(send(playing, 1, false).state.settings.selfies).toBe(true); // locked once the game has started
  });
  it("is a boolean on the wire, and a string is refused", () => {
    expect(parseClientMessage(JSON.stringify({ t: "settings", selfies: true })).kind).toBe("game");
    expect(parseClientMessage(JSON.stringify({ t: "settings", selfies: "yes" })).kind).toBe("bad");
  });
});
