import type { CaseSetup } from "@hauntology/shared/app/case-setup";
import type { Route } from "@hauntology/shared/app/types";
import type { ConditionsChoice } from "@hauntology/shared/conditions/types";
import { describe, expect, it } from "vitest";
import { createPlayMemory } from "../play/memory";
import { createCaseController, type HostPort } from "./controller";

const W = "attic-room";
const HAUNT: Route = { screen: "haunt", worldId: W };

type Setup = { caseSetup?: unknown; caseStart?: boolean; conditions?: ConditionsChoice; partyEnabled?: boolean; startFails?: boolean; startGate?: Promise<void> };

function make(o: Setup = {}) {
  const log: string[] = [];
  const memory = createPlayMemory();
  const started: Array<{ setup: CaseSetup; sky: ConditionsChoice | undefined }> = [];
  memory.set({
    caseStart: o.caseStart ?? true,
    ...("caseSetup" in o ? { caseSetup: o.caseSetup as CaseSetup | undefined } : { caseSetup: { preset: "gentle", bots: 3 } as CaseSetup }),
    ...(o.conditions ? { conditions: o.conditions } : {}),
  });
  const port: HostPort = {
    async start(setup, sky) {
      log.push("start");
      started.push({ setup, sky });
      await o.startGate;
      if (o.startFails) throw new Error("no host");
      log.push("started");
    },
    playAgain: () => void log.push("play again"),
    async dispose() {
      log.push("dispose");
      await Promise.resolve();
      log.push("disposed");
    },
  };
  const navigated: Array<{ route: Route; replace: boolean | undefined }> = [];
  const c = createCaseController({
    worldId: W, memory, port, partyEnabled: o.partyEnabled ?? true,
    navigate: (route, options) => {
      log.push(`navigate ${route.screen}`);
      navigated.push({ route, replace: options?.replace });
    },
  });
  return { c, log, memory, started, navigated };
}

describe("CaseController: the main path", () => {
  it("starts the Host once with the setup from memory and the sky the visitor chose", async () => {
    const sky: ConditionsChoice = { memoryDay: { date: "1999-10-31", time: "dusk" } } as unknown as ConditionsChoice;
    const { c, started, log } = make({ conditions: sky });
    expect(c.getSnapshot()).toEqual({ phase: "idle", scripted: false });
    await c.begin();
    await c.begin();
    await c.settled();
    expect(started).toEqual([{ setup: { preset: "gentle", bots: 3 }, sky }]);
    expect(log.filter((l) => l === "start")).toHaveLength(1);
    expect(c.getSnapshot().phase).toBe("starting");
  });

  it("follows what the Host says: started, scripted, ended, and a new game after Play again", async () => {
    const { c, log } = make();
    await c.begin();
    c.onHostMessage({ t: "started" });
    expect(c.getSnapshot()).toEqual({ phase: "playing", scripted: false });
    c.onHostMessage({ t: "scripted" });
    expect(c.getSnapshot().scripted).toBe(true);
    c.playAgain(); // not over yet: nothing happens
    expect(log).not.toContain("play again");
    c.onHostMessage({ t: "ended" });
    expect(c.getSnapshot().phase).toBe("ended");
    c.playAgain();
    expect(log).toContain("play again");
    expect(c.getSnapshot().phase).toBe("playing");
    c.onHostMessage({ t: "started" });
    expect(c.getSnapshot().phase).toBe("playing");
  });

  it("tells subscribers about each change, and stops when they leave", async () => {
    const { c } = make();
    let n = 0;
    const off = c.subscribe(() => n++);
    await c.begin();
    c.onHostMessage({ t: "started" });
    expect(n).toBe(2);
    off();
    c.onHostMessage({ t: "ended" });
    expect(n).toBe(2);
  });

  it("ignores a message that is not exactly one of the four, so nothing else gets through", async () => {
    const { c } = make();
    await c.begin();
    c.onHostMessage({ t: "started" });
    for (const bad of [null, "ended", { t: "ended", solution: ["x"] }, { t: "nope" }, { t: "refused" }, { t: "refused", code: "made_up" }]) c.onHostMessage(bad);
    expect(c.getSnapshot()).toEqual({ phase: "playing", scripted: false });
  });

  it("gives the Host a setup it accepts even if memory holds nonsense", async () => {
    const { c, started } = make({ caseSetup: { preset: "nope", bots: 99 } });
    await c.begin();
    await c.settled();
    expect(started[0]?.setup).toEqual({ preset: "classic", bots: 5 });
  });
});

describe("CaseController: leaving", () => {
  it("Exit ends the Room and releases the Viewer before the next Screen mounts, and goes to Haunt", async () => {
    const { c, log, navigated, memory } = make();
    await c.begin();
    c.onHostMessage({ t: "started" });
    await c.exit();
    expect(log.slice(-3)).toEqual(["dispose", "disposed", "navigate haunt"]);
    expect(navigated.at(-1)).toEqual({ route: HAUNT, replace: undefined });
    expect(memory.get().caseStart).toBe(false);
  });

  it("goes Home or to the Gallery from the ending, again after the Host is gone", async () => {
    for (const [to, screen] of [["home", "home"], ["gallery", "gallery"]] as const) {
      const { c, log, navigated } = make();
      await c.begin();
      c.onHostMessage({ t: "ended" });
      await c.exit(to);
      expect(log.slice(-3)).toEqual(["dispose", "disposed", `navigate ${screen}`]);
      expect(navigated.at(-1)?.route).toEqual({ screen });
    }
  });

  it("does not dispose twice when the Screen then unmounts", async () => {
    const { c, log } = make();
    await c.begin();
    await c.exit("home");
    await c.destroy();
    expect(log.filter((l) => l === "dispose")).toHaveLength(1);
  });

  it("listens to nothing after leaving", async () => {
    const { c } = make();
    await c.begin();
    await c.exit();
    const before = c.getSnapshot();
    c.onHostMessage({ t: "ended" });
    c.onHostMessage({ t: "scripted" });
    expect(c.getSnapshot()).toBe(before);
  });

  it("destroy disposes the Host and clears the start, so Back or a reload shows the setup and opens no Room", async () => {
    const first = make();
    await first.c.begin();
    await first.c.destroy();
    expect(first.log.slice(-2)).toEqual(["dispose", "disposed"]);
    expect(first.memory.get().caseStart).toBe(false);
    // The next visit to the Screen, with the same memory.
    const log2: string[] = [];
    const second = createCaseController({
      worldId: W, memory: first.memory, partyEnabled: true,
      port: { start: async () => void log2.push("start"), playAgain: () => {}, dispose: async () => void log2.push("dispose") },
      navigate: (route, options) => log2.push(`navigate ${route.screen} ${options?.replace}`),
    });
    await second.begin();
    expect(log2).toEqual(["navigate haunt true"]);
    expect(second.getSnapshot().phase).toBe("idle");
  });

  it("lets the Host finish starting, then disposes it, when the Screen goes away first", async () => {
    let open!: () => void;
    const startGate = new Promise<void>((r) => (open = r));
    const { c, log } = make({ startGate });
    const began = c.begin();
    await Promise.resolve();
    const gone = c.destroy();
    open();
    await Promise.all([began, gone]);
    expect(log).toEqual(["start", "started", "dispose", "disposed"]);
  });

  it("can start again after a StrictMode mount, cleanup, mount", async () => {
    const { c, log, started } = make();
    await c.begin();
    await c.destroy();
    await c.begin();
    await c.settled();
    expect(started).toHaveLength(2);
    expect(log.filter((l) => l === "dispose")).toHaveLength(1);
    expect(c.getSnapshot().phase).toBe("starting");
  });
});

describe("CaseController: no Room by itself, and refusals are not errors", () => {
  it("goes back to Haunt without starting anything when Start was not pressed (a reload, or Back)", async () => {
    const { c, log, navigated } = make({ caseStart: false });
    await c.begin();
    expect(log).toEqual(["navigate haunt"]);
    expect(navigated).toEqual([{ route: HAUNT, replace: true }]);
  });

  it("does the same when there is no setup in memory, even if Start is set", async () => {
    const { c, log } = make({ caseSetup: undefined, caseStart: true });
    await c.begin();
    expect(log).toEqual(["navigate haunt"]);
  });

  it("asks for no Room when party mode is off, and tells Haunt why", async () => {
    const { c, log, memory, navigated } = make({ partyEnabled: false });
    await c.begin();
    await c.settled();
    expect(log).toEqual(["navigate haunt"]);
    expect(memory.get().caseRefusal).toEqual({ worldId: W, code: "party_disabled" });
    expect(navigated[0]?.replace).toBe(true);
    expect(memory.get().caseStart).toBe(false);
  });

  it("sends the visitor back to Haunt with the reason when the Host refuses the world, after the Host is released", async () => {
    const { c, log, memory, navigated } = make();
    await c.begin();
    c.onHostMessage({ t: "refused", code: "world_too_small" });
    await c.settled();
    expect(memory.get().caseRefusal).toEqual({ worldId: W, code: "world_too_small" });
    expect(log.slice(-3)).toEqual(["dispose", "disposed", "navigate haunt"]);
    expect(navigated.at(-1)).toEqual({ route: HAUNT, replace: true });
  });

  it("treats a Host that cannot load, or cannot make a Room, as a quiet refusal too", async () => {
    const { c, memory, navigated, log } = make({ startFails: true });
    await c.begin();
    await c.settled();
    expect(memory.get().caseRefusal).toEqual({ worldId: W, code: "case_failed" });
    expect(navigated.at(-1)).toEqual({ route: HAUNT, replace: true });
    // Nothing was up, so nothing is released.
    expect(log).not.toContain("dispose");
  });
});
