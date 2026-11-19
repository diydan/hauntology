import { describe, expect, it } from "vitest";
import { createEngine, publicSnapshot, step } from "../party/engine";
import { PRESET_GHOST_IDS } from "../party/preset-ghosts";
import { RoomCore } from "../party/server";
import { clueHint } from "./clues";
import { lyricFacts, writeLyrics } from "./lyrics";
import { BALLAD_HAUNT_TRIGGER, initialSongPlan, MAX_MOMENTS_PER_GAME, MAX_MOMENTS_PER_ROUND, songRequests } from "./plan";
import { fallbackStockFor, nextSlot, resolveSlotPlayback } from "./slots";
import { FORBIDDEN_WORDS } from "./stock";

function sampleGame() {
  const seats = [1, 2, 3].map((seat) => ({
    seat,
    nickname: seat === 1 ? "AliceNick" : `BotNick${seat}`,
    bot: seat !== 1,
    botLevel: "standard" as const,
  }));
  let s = createEngine({ seed: 42, seats, settings: { baseSeconds: 60, hauntMax: 10, puzzles: "off" }, presetIds: PRESET_GHOST_IDS });
  s = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 1_000).state;
  return s;
}

describe("songs/lyrics (game-songs 2.1)", () => {
  it("uses role names by default and includes nicknames only with per-seat consent", () => {
    const view = publicSnapshot(sampleGame(), 2_000);
    const noConsent = lyricFacts(view, {});
    expect(noConsent.players.map((p) => p.displayName)).toEqual([
      "Detective in seat 1",
      "Detective in seat 2",
      "Detective in seat 3",
    ]);

    const seatOneOnly = lyricFacts(view, { 1: true, 2: false });
    expect(seatOneOnly.players.map((p) => p.displayName)).toEqual([
      "AliceNick",
      "Detective in seat 2",
      "Detective in seat 3",
    ]);

    const opening = writeLyrics("opening", seatOneOnly, 7);
    expect(opening.lyrics).toContain("AliceNick");
    expect(opening.lyrics).not.toContain("BotNick2");
    expect(opening.lyrics).not.toContain("BotNick3");
  });

  it("includes the Solution only in the Ballad at the ending, and follows house style", () => {
    const s = sampleGame();
    const sol = s.deal!.solution;
    const baseView = publicSnapshot(s, 3_000);
    const endedView = {
      ...baseView,
      phase: "ended" as const,
      ending: { solution: sol, residueAt: {}, winners: [1], houseWins: false, mostHaunting: null, scare: {}, nudges: { help: 0, spook: 0 }, recap: { entries: [], counts: {}, solution: sol, reveal: [] } },
    };

    const factsWithSol = lyricFacts(endedView, { 1: true }, { includeSolution: true });
    expect(factsWithSol.solution).not.toBeNull();

    // Non-ballad songs must never sing the solution line.
    const solSuspect = endedView.suspects.find((x) => x.id === sol.suspect)!.name;
    const moment = writeLyrics("detectives_win", factsWithSol, 9);
    const ballad = writeLyrics("ballad", factsWithSol, 9);
    expect(moment.lyrics).not.toContain(solSuspect);
    expect(ballad.lyrics).toContain(solSuspect);

    for (const song of [moment, ballad]) {
      const text = `${song.title}\n${song.style}\n${song.lyrics}`.toLowerCase();
      for (const bad of FORBIDDEN_WORDS) expect(text).not.toContain(bad);
    }
  });
});

describe("songs/clues (game-songs 2.3)", () => {
  it("picks deterministically from empty searched zones or unshown relics, excluding secrets", () => {
    const s = sampleGame();
    const view = publicSnapshot(s, 2_000);
    const z1 = view.zones[0]!;
    const z2 = view.zones[1]!;
    const r1 = view.relics[0]!;
    const r2 = view.relics[1]!;

    const input = {
      events: [
        { id: 1, kind: "inspect" as const, seat: 1, zone: z1.id },
        { id: 2, kind: "inspect" as const, seat: 2, zone: z2.id },
        { id: 3, kind: "suggest" as const, seat: 1, zone: z1.id, suspect: view.suspects[0]!.id, relic: r1.id, passed: [2], refuter: 2 },
        { id: 4, kind: "suggest" as const, seat: 2, zone: z1.id, suspect: view.suspects[0]!.id, relic: r2.id, passed: [1, 3], refuter: null },
      ],
      zones: view.zones,
      relics: view.relics,
      emptyZones: [z1.id],
      excludeIds: [z2.id], // z2 had Residue; only z1 (empty) or r2 (unshown) are fair
    };

    const a = clueHint(input, 99);
    const b = clueHint(input, 99);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect([z1.id, r2.id]).toContain(a!.id);
    expect(a!.id).not.toBe(z2.id);
    expect(a!.id).not.toBe(r1.id);
  });

  it("returns null when no safe zone or unshown relic candidate exists", () => {
    const view = publicSnapshot(sampleGame(), 2_000);
    expect(clueHint({ events: [], zones: view.zones, relics: view.relics }, 1)).toBeNull();
  });
});

describe("songs/plan & slots (game-songs 2.5)", () => {
  it("enforces at most 1 Moment per Round, 3 per game, triggers Ballad at Haunt 8 or lastRound, and never asks when off/stock", () => {
    const base = publicSnapshot(sampleGame(), 2_000);

    // Off or stock asks for nothing.
    expect(songRequests(base, initialSongPlan("off")).requests).toEqual([]);
    expect(songRequests(base, initialSongPlan("stock")).requests).toEqual([]);

    // On: asks opening, enforces 1 moment/round across multiple same-round events, and max 3/game across rounds.
    let plan = initialSongPlan("on");
    let res = songRequests({ ...base, round: 1, events: [{ id: 1, kind: "accuse", seat: 1, right: false }, { id: 2, kind: "accuse", seat: 2, right: false }] }, plan);
    expect(res.requests.map((r) => r.kind)).toEqual(["opening", "wrong_accuse"]);
    plan = res.state;

    // Round 2, 3, 4 moments: 2 and 3 allowed; 4 blocked by MAX_MOMENTS_PER_GAME (3).
    res = songRequests({ ...base, round: 2, events: [{ id: 3, kind: "accuse", seat: 1, right: false }] }, plan);
    expect(res.requests.map((r) => r.kind)).toEqual(["wrong_accuse"]);
    plan = res.state;

    res = songRequests({ ...base, round: 3, events: [{ id: 4, kind: "accuse", seat: 2, right: false }] }, plan);
    expect(res.requests.map((r) => r.kind)).toEqual(["wrong_accuse"]);
    plan = res.state;
    expect(plan.momentCountGame).toBe(MAX_MOMENTS_PER_GAME);
    expect(MAX_MOMENTS_PER_ROUND).toBe(1);

    // Round 4 moment + Haunt reaches 8 -> Moment rejected (already 3), Ballad triggered!
    res = songRequests(
      { ...base, round: 4, haunt: { ...base.haunt, level: BALLAD_HAUNT_TRIGGER }, events: [{ id: 5, kind: "accuse", seat: 1, right: false }] },
      plan,
    );
    expect(res.requests.map((r) => r.kind)).toEqual(["ballad"]);
  });

  it("never overlaps speech, cues, or reveals, restricts Clue Songs to calm non-turn scenes, and falls back to Stock at once", () => {
    const quiet = { phase: "playing" as const, betweenTurns: false, roundEnded: false, quietScene: true, speechPlaying: false, cuePlaying: false, revealPlaying: false };
    expect(nextSlot({ ...quiet, speechPlaying: true }, "becoming")).toBeNull();
    expect(nextSlot({ ...quiet, cuePlaying: true }, "becoming")).toBeNull();
    expect(nextSlot({ ...quiet, revealPlaying: true }, "becoming")).toBeNull();

    // Clue song requires quietScene or roundEnded (not plain betweenTurns during active round).
    expect(nextSlot({ ...quiet, quietScene: false, betweenTurns: true }, "clue")).toBeNull();
    expect(nextSlot(quiet, "clue")).toBe("quiet_scene");
    expect(nextSlot({ ...quiet, quietScene: false, betweenTurns: true }, "wrong_accuse")).toBe("between_turns");

    // Immediate stock fallback when setting is stock or when custom song is absent.
    const fb = resolveSlotPlayback({ setting: "on", slotInput: quiet, kind: "wrong_accuse", readyCustom: null });
    expect(fb).toEqual({ source: "stock", slot: "quiet_scene", song: fallbackStockFor("wrong_accuse") });
    expect(resolveSlotPlayback({ setting: "off", slotInput: quiet, kind: "wrong_accuse", readyCustom: { id: "x" } })).toBeNull();
  });
});

describe("RoomCore song protocol & cleanup (game-songs 3.2, 3.3)", () => {
  it("enforces Master-only songsSetting/songMute/songSkip, per-seat singMyName consent, plans songs, and deletes songs on end", async () => {
    let saved: string | undefined;
    const sent: Array<{ sid: string; msg: unknown }> = [];
    const deletedRooms: string[] = [];
    let rand = 1;
    const core = new RoomCore({
      load: async () => saved,
      save: async (t) => { saved = t; },
      deleteAll: async () => { saved = undefined; },
      setAlarm: async () => {},
      send: (sid, msg) => sent.push({ sid, msg }),
      close: () => {},
      now: () => 5_000,
      randomBytes: (n) => new Uint8Array(n).fill(rand++),
      deleteSongs: async (code) => { deletedRooms.push(code); },
    });

    const created = await core.create("ABCD");
    const master = await core.join("Alice");
    const guest = await core.join("Bob");
    expect(master.ok && guest.ok).toBe(true);
    if (!master.ok || !guest.ok) return;

    await core.message("h", JSON.stringify({ t: "hello", token: created.hostToken }));
    await core.message("p1", JSON.stringify({ t: "hello", token: master.token }));
    await core.message("p2", JSON.stringify({ t: "hello", token: guest.token }));

    // Non-Master cannot change Songs setting or mute/skip.
    await core.message("p2", JSON.stringify({ t: "songsSetting", setting: "on" }));
    expect(sent.filter((x) => (x.msg as { t?: string }).t === "refused" && x.sid === "p2").length).toBe(1);

    // Master switches Songs on and mutes/unmutes; Host receives state.
    await core.message("p1", JSON.stringify({ t: "songsSetting", setting: "on" }));
    expect(sent.some((x) => x.sid === "h" && (x.msg as { t?: string; setting?: string }).t === "songsState" && (x.msg as { setting?: string }).setting === "on")).toBe(true);
    await core.message("p1", JSON.stringify({ t: "songMute", muted: true }));
    expect(sent.some((x) => x.sid === "h" && (x.msg as { muted?: boolean }).muted === true)).toBe(true);

    // Guest cannot set another seat's singMyName consent; can set their own.
    await core.message("p1", JSON.stringify({ t: "singMyName", seat: 2, yes: true }));
    expect(sent.filter((x) => (x.msg as { t?: string }).t === "refused" && x.sid === "p1").length).toBe(1);
    await core.message("p2", JSON.stringify({ t: "singMyName", yes: true }));

    // planRoomSongs exposes consent={2:true} and requests opening once; sendRoomSong reaches Host & hint log reaches all.
    const view = publicSnapshot(sampleGame(), 6_000);
    const planned = await core.planRoomSongs(view);
    expect(planned.setting).toBe("on");
    expect(planned.consent).toEqual({ 2: true });
    expect(planned.requests.map((r) => r.kind)).toEqual(["opening"]);

    await core.sendRoomSong({ key: "clue-1", title: "Quiet", captions: "Dust.", hintLogLine: "A song drifted: Attic is clear." });
    expect(sent.some((x) => x.sid === "h" && (x.msg as { t?: string }).t === "song")).toBe(true);
    expect(sent.filter((x) => (x.msg as { t?: string }).t === "songHint").length).toBeGreaterThanOrEqual(2);

    // Ending room deletes all room songs via ports.deleteSongs.
    await core.endRoom();
    expect(deletedRooms).toEqual(["ABCD"]);
  });
});
