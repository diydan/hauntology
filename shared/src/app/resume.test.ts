import { describe, expect, it } from "vitest";
import { resumedFlow, resumeTarget } from "./resume";
import { guardRoute } from "./routes";
import type { ResumeFacts, SessionRecord } from "./types";

const W = "w-AbCdEfGhIjKlMnOpQrSt12";
const P = "p-AbCdEfGhIjKlMnOpQrSt12";
const FLAGS = { worldGenEnabled: true, dayCapReached: false, totalCapReached: false, voiceEnabled: true, liveEnabled: false };
const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({ ackNotice: false, flags: FLAGS, ...over });

describe("resumeTarget", () => {
  it("goes home without a Session, without a last world, or when the world is gone", () => {
    expect(resumeTarget(null, { playLive: true, worldStatus: "ready" })).toEqual({ screen: "home" });
    expect(resumeTarget(session(), { playLive: false, worldStatus: "ready" })).toEqual({ screen: "home" });
    expect(resumeTarget(session({ lastPlayId: P }), { playLive: true })).toEqual({ screen: "home" });
    expect(resumeTarget(session({ lastWorldId: W, lastPlayId: P }), { playLive: true, worldStatus: "missing" })).toEqual({ screen: "home" });
  });

  it("goes to the live play session first", () => {
    expect(resumeTarget(session({ lastWorldId: W, lastPlayId: P }), { playLive: true, worldStatus: "ready" })).toEqual({ screen: "play", worldId: W });
    expect(resumeTarget(session({ lastWorldId: W, lastPlayId: P }), { playLive: true })).toEqual({ screen: "play", worldId: W });
  });

  it("does not treat a live play session as live without a play id", () => {
    expect(resumeTarget(session({ lastWorldId: W }), { playLive: true, worldStatus: "queued" })).toEqual({ screen: "haunt", worldId: W });
  });

  it("goes to Haunt while the world is being made", () => {
    for (const worldStatus of ["queued", "generating", "ingesting"] as const) {
      expect(resumeTarget(session({ lastWorldId: W }), { playLive: false, worldStatus })).toEqual({ screen: "haunt", worldId: W });
    }
  });

  it("goes to Play for a ready world with no live play session, and home for a failed one", () => {
    expect(resumeTarget(session({ lastWorldId: W }), { playLive: false, worldStatus: "ready" })).toEqual({ screen: "play", worldId: W });
    expect(resumeTarget(session({ lastWorldId: W }), { playLive: false, worldStatus: "failed" })).toEqual({ screen: "home" });
    expect(resumeTarget(session({ lastWorldId: W }), { playLive: false })).toEqual({ screen: "home" });
  });
});

describe("resumedFlow", () => {
  it("makes the world known, marks a ghost ready only for Play, and keeps the notice flag", () => {
    const play = resumedFlow(session({ lastWorldId: W, ackNotice: true }), { playLive: false, worldStatus: "ready" });
    expect(play).toEqual({ worldId: W, ghostReady: true, noticeAcked: true, playEnded: false });
    const haunt = resumedFlow(session({ lastWorldId: W }), { playLive: false, worldStatus: "generating" });
    expect(haunt).toEqual({ worldId: W, ghostReady: false, noticeAcked: false, playEnded: false });
    expect(resumedFlow(null, { playLive: false })).toEqual({ ghostReady: false, noticeAcked: false, playEnded: false });
  });

  it("lets the target through the guard", () => {
    const facts: ResumeFacts = { playLive: false, worldStatus: "ready" };
    const s = session({ lastWorldId: W });
    expect(guardRoute(resumeTarget(s, facts), resumedFlow(s, facts))).toEqual({ allow: true });
  });
});
