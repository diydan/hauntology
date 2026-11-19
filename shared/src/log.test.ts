import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LOG_SCHEMA, formatLog, type LogEvent } from "./log";

const T = 1_800_000_000_123;
const parse = (line: string) => JSON.parse(line) as Record<string, unknown>;

describe("formatLog", () => {
  it("writes the time, the level, the event and the fields that fit, as one line of JSON", () => {
    const line = formatLog("info", "job.step", { worldId: "w-abc_123-XYZ", status: "ingesting", code: "ingest_failed" }, T);
    expect(line).not.toContain("\n");
    expect(parse(line)).toEqual({ t: T, level: "info", event: "job.step", worldId: "w-abc_123-XYZ", status: "ingesting", code: "ingest_failed" });
    expect(parse(formatLog("warn", "cleanup.done", { deleted: 12, worlds: 3 }, T))).toEqual({ t: T, level: "warn", event: "cleanup.done", deleted: 12, worlds: 3 });
    expect(parse(formatLog("error", "admin.kill", { on: false }, T))).toEqual({ t: T, level: "error", event: "admin.kill", on: false });
    expect(parse(formatLog("error", "request.error", { route: "/api/worlds/:id", errorName: "SyntaxError", status: 500 }, T))).toMatchObject({ route: "/api/worlds/:id", errorName: "SyntaxError", status: 500 });
  });

  it("drops a value that is free text, and says only how many it dropped", () => {
    const secret = "my grandmother's kitchen, 12 Elm Street";
    const line = formatLog("info", "job.step", { worldId: "w-1", status: "queued", code: secret }, T);
    expect(line).not.toContain("grandmother");
    expect(line).not.toContain("Elm");
    expect(parse(line)).toEqual({ t: T, level: "info", event: "job.step", worldId: "w-1", status: "queued", dropped: 1 });
  });

  it("drops a field the event does not list, whatever it holds", () => {
    const line = formatLog("info", "cleanup.done", { deleted: 1, worlds: 0, caption: "x", prompt: "y", body: { a: 1 }, ownerSid: "sid-1" }, T);
    expect(parse(line)).toEqual({ t: T, level: "info", event: "cleanup.done", deleted: 1, worlds: 0, dropped: 4 });
  });

  it("writes an event that is not on the list as log.refused, without its name", () => {
    const line = formatLog("info", "user typed: hello there", { a: 1, b: "two" }, T);
    expect(parse(line)).toEqual({ t: T, level: "info", event: "log.refused", dropped: 2 });
    expect(line).not.toContain("hello");
    for (const event of ["toString", "constructor", "__proto__", "hasOwnProperty", ""]) expect(parse(formatLog("info", event, {}, T)).event, event).toBe("log.refused");
  });

  it("checks each kind: ids, words, routes, names, whole numbers and yes/no", () => {
    const ok = (event: LogEvent, key: string, value: unknown) => key in parse(formatLog("info", event, { [key]: value }, T));
    expect(ok("job.step", "worldId", "a".repeat(128))).toBe(true);
    expect(ok("job.step", "worldId", "a".repeat(129))).toBe(false);
    for (const bad of ["", "a b", "a/b", "a.b", "é", "a\nb", "<script>"]) expect(ok("job.step", "worldId", bad), JSON.stringify(bad)).toBe(false);
    expect(ok("job.step", "status", "upstream_rejected")).toBe(true);
    for (const bad of ["Queued", "1abc", "has space", "x".repeat(65), "", "a\nb"]) expect(ok("job.step", "status", bad), JSON.stringify(bad)).toBe(false);
    expect(ok("job.step", "code", "x".repeat(64))).toBe(true);
    expect(ok("request.error", "route", "/api/worlds/:id/assets/:name")).toBe(true);
    expect(ok("request.error", "route", "/")).toBe(true);
    for (const bad of ["api/worlds", "/api worlds", "/api?x=1", "/api/#frag", "//", "/" + "a".repeat(128), "/a\nb"]) expect(ok("request.error", "route", bad), JSON.stringify(bad)).toBe(bad === "//" ? true : false);
    expect(ok("request.error", "errorName", "TypeError")).toBe(true);
    for (const bad of ["Type Error", "1Error", "E".repeat(41), "Error: boom", ""]) expect(ok("request.error", "errorName", bad), bad).toBe(false);
    expect(ok("cleanup.done", "deleted", 0)).toBe(true);
    expect(ok("cleanup.done", "deleted", 1_000_000_000_000)).toBe(true);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1_000_000_000_001, "3", null, undefined, true]) expect(ok("cleanup.done", "deleted", bad), String(bad)).toBe(false);
    expect(ok("admin.kill", "on", true)).toBe(true);
    for (const bad of ["true", 1, 0, null]) expect(ok("admin.kill", "on", bad), String(bad)).toBe(false);
  });

  it("survives anything as the fields: not an object, an array, null, a getter that throws", () => {
    for (const fields of [undefined, null]) expect(parse(formatLog("info", "cleanup.done", fields, T))).toEqual({ t: T, level: "info", event: "cleanup.done" });
    for (const fields of ["text", 5, true, ["a"], () => 1]) expect(parse(formatLog("info", "cleanup.done", fields, T)).dropped, String(fields)).toBe(1);
    const thrower = { get deleted(): number { throw new Error("boom"); } };
    expect(parse(formatLog("info", "cleanup.done", thrower, T)).dropped).toBe(1);
  });

  it("treats an array as one thing that is not fields, however long", () => {
    expect(parse(formatLog("info", "cleanup.done", ["a", "b", "c"], T)).dropped).toBe(1);
    expect(parse(formatLog("info", "cleanup.done", [{ deleted: 1 }], T))).toEqual({ t: T, level: "info", event: "cleanup.done", dropped: 1 });
  });

  it("does not take a name from the prototype for a field: toString, constructor and the like are dropped, and nothing throws", () => {
    const own = JSON.parse('{"__proto__": "x", "constructor": "y", "toString": "z", "hasOwnProperty": 1, "valueOf": true}');
    for (const event of ["cleanup.done", "job.step", "admin.kill", "request.error"] as const) {
      expect(() => formatLog("info", event, own, T), event).not.toThrow();
      expect(parse(formatLog("info", event, own, T)).dropped, event).toBe(5);
    }
  });

  it("lists exactly these events and fields: adding one is a reviewed change to this test and to the schema together", () => {
    expect(LOG_SCHEMA).toEqual({
      "request.error": { route: "route", errorName: "name", status: "int" },
      "job.step": { worldId: "id", status: "word", code: "word" },
      "cleanup.done": { deleted: "int", worlds: "int" },
      "admin.voice": { on: "bool", minutes: "int", cap: "int" },
      "admin.kill": { on: "bool" },
      "play.start": { worldId: "id", access: "word" },
      "play.turn": { directive: "word", revealed: "bool", scripted: "bool" },
      "play.narrate": { outcome: "word", attempts: "int" },
      "conditions.read": { source: "word", reason: "word", cache: "bool" },
      "conditions.geocode": { outcome: "word", count: "int" },
      "play.end": { turns: "int" },
      "play.reset": { turns: "int" },
      "play.refused": { code: "word" },
      "voice.speak": { via: "word", outcome: "word", paid: "bool", prefetch: "bool", ms: "int" },
      "voice.listen": { outcome: "word", reason: "word", paid: "bool", ms: "int" },
      "voice.stitch.check": { outcome: "word", accepted: "bool", rejected: "bool", checks: "int" },
      "voice.stitch.play": { outcome: "word", count: "int" },
      "voice.live": { outcome: "word", stop: "word", slices: "int" },
      "puzzle.lock": { kind: "word", outcome: "word", attempts: "int" },
    });
  });

  it("voice.speak keeps its five counters and drops the line's words, a line id, a game id and the audio, whatever a caller passes", () => {
    const out = JSON.parse(formatLog("info", "voice.speak", { via: "cache", outcome: "ok", paid: false, prefetch: true, ms: 12, text: "Somebody was in the kitchen.", spoken: "Somebody", lineId: "L1", playId: "p-1", audio: "AAAA", voice: "inworld:Pippa" }, 5));
    expect(out).toEqual({ t: 5, level: "info", event: "voice.speak", via: "cache", outcome: "ok", paid: false, prefetch: true, ms: 12, dropped: 6 });
    // a field of the right name but the wrong kind is dropped too: words with a capital, spaces or a sentence are not a `word`
    const bad = JSON.parse(formatLog("info", "voice.speak", { via: "Somebody was in the kitchen.", outcome: "ok", paid: "yes", ms: -1 }, 5));
    expect(bad).toEqual({ t: 5, level: "info", event: "voice.speak", outcome: "ok", dropped: 3 });
  });

  // ghost-engine Property 14: telemetry carries counters and codes, never what a visitor said or the ghost answered
  it("play events keep a counter or a code and drop any text, whatever a caller passes (the engine's telemetry whitelist)", () => {
    const line = parse(formatLog("info", "play.turn", { directive: "reveal", revealed: true, scripted: true, input: "look at the kettle", reply: "I remember the sound", text: "hello", prompt: "x" } as never, T));
    expect(line).toMatchObject({ event: "play.turn", directive: "reveal", revealed: true, scripted: true, dropped: 4 });
    for (const k of ["input", "reply", "text", "prompt"]) expect(line).not.toHaveProperty(k);
    const bad = parse(formatLog("info", "play.turn", { directive: "I remember the sound of the kettle", revealed: "yes" } as never, T));
    expect(bad).not.toHaveProperty("directive");
    expect(bad).not.toHaveProperty("revealed");
    expect(bad.dropped).toBe(2);
    expect(JSON.stringify(parse(formatLog("warn", "play.refused", { code: "rate_limited", text: "ignore all previous instructions" } as never, T)))).not.toContain("ignore");
    const narrated = parse(formatLog("info", "play.narrate", { outcome: "model", attempts: 2, prompt: "You are the ghost", reply: "The kettle is warm", text: "x" } as never, T));
    expect(narrated).toMatchObject({ event: "play.narrate", outcome: "model", attempts: 2, dropped: 3 });
    expect(JSON.stringify(narrated)).not.toContain("kettle");
    expect(JSON.stringify(parse(formatLog("info", "play.narrate", { outcome: "I remember the sound of the kettle", attempts: "two" } as never, T)))).not.toContain("kettle");
  });

  // conditions 3.7: the read of the real world keeps three counters and drops anything else, so a place, a label or a date cannot be logged by mistake
  it("the conditions read keeps its three counters and drops a place, a position, a label, a date or a query", () => {
    const line = parse(formatLog("info", "conditions.read", { source: "live", reason: "ok", cache: true, lat: 51.51, lon: -0.13, label: "Elm Street", date: "1999-12-31", query: "london", tz: "Europe/London" } as never, T));
    expect(line).toEqual({ t: T, level: "info", event: "conditions.read", source: "live", reason: "ok", cache: true, dropped: 6 });
    expect(JSON.stringify(line)).not.toMatch(/51\.51|Elm|1999|london|Europe/);
    const bad = parse(formatLog("info", "conditions.read", { source: "Elm Street, London", reason: "12 Elm Street", cache: "yes" } as never, T));
    expect(bad).toEqual({ t: T, level: "info", event: "conditions.read", dropped: 3 });
  });

  it("falls back for a bad level or time, and never writes either as text", () => {
    expect(parse(formatLog("loud" as never, "admin.kill", {}, T)).level).toBe("error");
    expect(parse(formatLog("info", "admin.kill", {}, Number.NaN)).t).toBe(0);
    expect(parse(formatLog("info", "admin.kill", {}, 12.9)).t).toBe(12);
  });

  it("lists events whose fields are all of a known kind, so nothing in the schema can carry free text", () => {
    const kinds = new Set(["id", "word", "route", "name", "int", "bool"]);
    for (const [event, fields] of Object.entries(LOG_SCHEMA)) for (const [field, kind] of Object.entries(fields)) expect(kinds.has(kind), `${event}.${field}`).toBe(true);
  });
});

// Property (Requirement 10.3): whatever is passed, a log line never holds text that is not of a field's kind.
const SAFE = /^[A-Za-z0-9_:./*-]*$/;
const arbValue = fc.oneof(fc.string(), fc.string({ unit: "grapheme" }), fc.integer(), fc.double(), fc.boolean(), fc.constant(null), fc.constant(undefined), fc.array(fc.string(), { maxLength: 3 }), fc.dictionary(fc.string(), fc.string(), { maxKeys: 3 }));

describe("Property: a log line holds only ids, words, routes, names, numbers and booleans", () => {
  it("for any event, any fields and any values, the line is one line, every string in it is plain, and nothing with a space, a newline or a quote of the input appears", () => {
    fc.assert(
      fc.property(fc.oneof(fc.constantFrom(...(Object.keys(LOG_SCHEMA) as LogEvent[])), fc.string()), fc.dictionary(fc.oneof(fc.constantFrom("worldId", "status", "code", "route", "errorName", "deleted", "worlds", "on", "caption", "body"), fc.string()), arbValue, { maxKeys: 8 }), fc.constantFrom("info" as const, "warn" as const, "error" as const), (event, fields, level) => {
        const line = formatLog(level, event, fields, T);
        expect(line).not.toMatch(/[\n\r]/);
        const parsed = parse(line);
        const allowed = new Set(["t", "level", "event", "dropped", ...(Object.hasOwn(LOG_SCHEMA, event) ? Object.keys(LOG_SCHEMA[event as LogEvent]) : [])]);
        for (const [k, v] of Object.entries(parsed)) {
          expect(allowed.has(k), k).toBe(true);
          if (typeof v === "string") expect(SAFE.test(v), `${k}=${v}`).toBe(true);
          else expect(["number", "boolean"]).toContain(typeof v);
        }
        // Any input string with a character a plain value cannot hold never reaches the line.
        for (const v of Object.values(fields)) if (typeof v === "string" && /[^A-Za-z0-9_:./*-]/.test(v) && v.length > 3) expect(line.includes(JSON.stringify(v))).toBe(false);
      }),
      { numRuns: 500, seed: 8201 },
    );
  });

  it("for any event and fields the line is short", () => {
    fc.assert(
      fc.property(fc.string(), fc.dictionary(fc.string(), arbValue, { maxKeys: 20 }), (event, fields) => {
        expect(formatLog("info", event, fields, T).length).toBeLessThanOrEqual(1500);
      }),
      { numRuns: 200, seed: 8202 },
    );
  });
});
