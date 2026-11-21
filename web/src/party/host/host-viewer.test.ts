import { describe, expect, it } from "vitest";
import { parseShellMessage } from "@hauntology/shared/app/events";
import { remoteInputMessage, remoteMove } from "./host-viewer";

describe("remoteInputMessage (party-mode 8.3)", () => {
  it("turns the active Detective's stick and look into a message the Viewer accepts", () => {
    const m = remoteInputMessage(remoteMove({ move: [0.5, -1], look: [10, -4] }));
    expect(parseShellMessage(m)).toEqual(m);
    expect(m).toMatchObject({ t: "remote_input", forward: 1, strafe: 0.5 });
    expect(m.yawDelta).toBeCloseTo(-0.075);
  });
  it("holds every number inside the contract, so a hostile phone cannot make the screen spin", () => {
    const m = remoteInputMessage({ forward: 50, strafe: -50, sprint: false, yawDelta: 1e9, pitchDelta: Number.NaN });
    expect(m).toEqual({ t: "remote_input", forward: 1, strafe: -1, yawDelta: 0.5, pitchDelta: 0 });
    expect(parseShellMessage(m)).toEqual(m);
  });
});
