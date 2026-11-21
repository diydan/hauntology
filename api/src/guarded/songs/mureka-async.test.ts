import { describe, expect, it } from "vitest";
import { MurekaSongMaker, SONG_POLL_MS, songWasCharged } from "./mureka";

// The Mureka JSON field names are UNVERIFIED (see mureka.ts): these tests pin the async flow
// (id, poll every 5 s, ready after ~45 s, two versions) over a fake.
const ticket = { id: "t-1", meter: "song" as const, roomCode: "ABCD", issuedAt: 1 };
const mp3 = (n = 2_000): Uint8Array => new Uint8Array(n).fill(7);
const lyrics = { lyrics: "A lantern burns in the hall.", style: "slow minor waltz" };

function harness(readyAfterPolls: number, opts: { finalStatus?: string; choices?: unknown } = {}) {
  let clock = 0;
  const sleeps: number[] = [];
  const log: string[] = [];
  let polls = 0;
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    log.push(`${init?.method ?? "GET"} ${u}`);
    if (u.endsWith("/generate")) return new Response(JSON.stringify({ id: "abc", status: "preparing" }), { status: 200 });
    if (u.includes("/query/")) {
      polls++;
      if (polls < readyAfterPolls) return new Response(JSON.stringify({ id: "abc", status: "running" }), { status: 200 });
      return new Response(
        JSON.stringify({
          id: "abc",
          status: opts.finalStatus ?? "succeeded",
          choices: opts.choices ?? [
            { url: "https://cdn.example/long.mp3", duration: 150 },
            { url: "https://cdn.example/short.mp3", duration: 118 },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response(mp3(u.includes("short") ? 2_500 : 4_000), { status: 200 });
  }) as typeof fetch;
  const maker = new MurekaSongMaker({
    apiKey: "k",
    fetch: fetchFn,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  return { maker, sleeps, log, polls: () => polls };
}

describe("MurekaSongMaker async flow (game-songs 3.1, spike songs-1)", () => {
  it("submits, polls every 5 s until ready (about 45 s), and downloads the shorter version", async () => {
    const h = harness(9); // 9 polls x 5 s = 45 s
    const ans = await h.maker.make(ticket, lyrics);
    expect(ans.ok).toBe(true);
    if (!ans.ok) return;
    expect(ans.audio.byteLength).toBe(2_500); // the short.mp3
    expect(ans.elapsedMs).toBe(45_000);
    expect(h.polls()).toBe(9);
    expect(h.sleeps.every((m) => m === SONG_POLL_MS)).toBe(true);
    expect(h.log[0]).toBe("POST https://api.mureka.ai/v1/song/generate");
    expect(h.log[1]).toBe("GET https://api.mureka.ai/v1/song/query/abc");
    expect(songWasCharged(ans)).toBe(true);
  });

  it("gives up as slow after the overall wait, and is not charged", async () => {
    const h = harness(10_000);
    const ans = await h.maker.make(ticket, lyrics);
    expect(ans).toMatchObject({ ok: false, kind: "slow" });
    expect(songWasCharged(ans)).toBe(false);
    expect(h.polls()).toBeLessThanOrEqual(25); // 120 s / 5 s
  });

  it("reports a failed task and a ready task with no usable audio as failed", async () => {
    expect(await harness(1, { finalStatus: "failed" }).maker.make(ticket, lyrics)).toMatchObject({ ok: false, kind: "failed" });
    expect(await harness(1, { finalStatus: "timeouted" }).maker.make(ticket, lyrics)).toMatchObject({ ok: false, kind: "failed" });
    expect(await harness(1, { choices: [] }).maker.make(ticket, lyrics)).toMatchObject({ ok: false, kind: "failed" });
    expect(await harness(1, { choices: [{ url: "http://insecure.example/a.mp3" }] }).maker.make(ticket, lyrics)).toMatchObject({
      ok: false,
      kind: "failed",
    });
  });

  it("maps a 429 on submit to rate_limited without retrying", async () => {
    let n = 0;
    const maker = new MurekaSongMaker({
      apiKey: "k",
      sleep: async () => {},
      fetch: (async () => {
        n++;
        return new Response("slow down", { status: 429 });
      }) as typeof fetch,
    });
    expect(await maker.make(ticket, lyrics)).toMatchObject({ ok: false, kind: "rate_limited" });
    expect(n).toBe(1);
  });

  it("survives one failed poll but stops after three in a row", async () => {
    let polls = 0;
    const mk = (okAfter: number) =>
      new MurekaSongMaker({
        apiKey: "k",
        sleep: async () => {},
        fetch: (async (url: string | URL | Request) => {
          const u = String(url);
          if (u.endsWith("/generate")) return new Response(JSON.stringify({ id: "x" }), { status: 200 });
          if (u.includes("/query/")) {
            polls++;
            if (polls <= okAfter) return new Response("bad gateway", { status: 502 });
            return new Response(JSON.stringify({ status: "succeeded", choices: [{ url: "https://cdn.example/a.mp3" }] }), { status: 200 });
          }
          return new Response(mp3(), { status: 200 });
        }) as typeof fetch,
      });
    expect((await mk(1).make(ticket, lyrics)).ok).toBe(true);
    polls = 0;
    expect(await mk(5).make(ticket, lyrics)).toMatchObject({ ok: false, kind: "failed" });
  });
});
