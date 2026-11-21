import { describe, expect, it } from "vitest";

// Source-level and access checks of the Spirit clues layer (puzzles task 10.9, Requirements 15.8, 15.9, 15.10).
const mine = import.meta.glob(["./*.ts", "./*.tsx", "!./*.test.ts", "!./*.test.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const table = import.meta.glob(["../../table/camera.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const room = import.meta.glob(["../../../../shared/src/party/*.ts", "!../../../../shared/src/party/*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const files = Object.entries(mine).map(([p, s]) => [p, strip(s)] as const);

describe("the Spirit clues layer: source and access checks (puzzles 10.9)", () => {
  it("finds the layer's files", () => {
    expect(files.map(([p]) => p).sort()).toEqual(expect.arrayContaining(["./ClueList.tsx", "./ClueRing.tsx", "./ringScene.ts", "./SpiritCluesSwitch.tsx", "./SpiritSight.tsx"]));
  });
  it("uses the camera only through the one camera hook, whose only call is one getUserMedia with audio off, started by the Camera tap", () => {
    for (const [p, s] of files) expect(/getUserMedia/.test(s), `${p} calls getUserMedia itself`).toBe(false);
    const cam = strip(Object.values(table)[0] ?? "");
    expect(cam.match(/getUserMedia\s*\(/g)).toHaveLength(1);
    expect(cam).toMatch(/getUserMedia\(\{ video: \{ facingMode: "environment" \}, audio: false \}\)/);
    const ring = strip(mine["./ClueRing.tsx"] ?? "");
    expect(ring).toMatch(/useRearCamera/);
    expect(ring.match(/cam\.start\(\)/g)).toHaveLength(1); // started from the Camera button's click and nowhere else
    expect(ring).toMatch(/onClick=\{\(\) => void cam\.start\(\)\}/);
  });
  it("never records, captures or analyses the picture: no MediaRecorder, ImageCapture, getDisplayMedia, captureStream or drawImage of the video", () => {
    for (const [p, s] of files) for (const re of [/MediaRecorder/, /ImageCapture/, /getDisplayMedia/, /captureStream/, /drawImage/, /getImageData|toDataURL|toBlob|readPixels/, /new\s+VideoFrame|createImageBitmap/]) expect(re.test(s), `${p} uses ${re}`).toBe(false);
  });
  it("lets no Player type, choose or send a clue: no text input, no network, no storage, no message to the Room", () => {
    for (const [p, s] of files) for (const re of [/<input\b/, /<textarea\b/, /contentEditable/, /\bfetch\s*\(/, /WebSocket/, /sendBeacon/, /localStorage|sessionStorage|indexedDB|document\.cookie/, /port\.(send|act)\b/, /\bconsole\./]) expect(re.test(s), `${p} uses ${re}`).toBe(false);
  });
  it("adds nothing to the Room's messages or the telemetry: no Room file knows the ring, and the counters hold only Kind and outcome", () => {
    for (const [p, s] of Object.entries(room)) {
      if (/\.(arb|prop)\./.test(p)) continue;
      expect(/puzzles\/ring|clues\/Clue|spirit-sight|SpiritClue|clueRing/i.test(strip(s)), `${p} knows the Clue ring`).toBe(false);
    }
    const inspect = strip(Object.entries(room).find(([p]) => p.endsWith("/protocol.ts"))?.[1] ?? "");
    expect(inspect.length).toBeGreaterThan(100);
    expect(/spirit/i.test(inspect)).toBe(false);
  });
  it("draws with a 30 frame cap and a still ring under reduced motion, through the pure plan", () => {
    const ring = strip(mine["./ClueRing.tsx"] ?? "");
    expect(ring).toMatch(/ringPlan\(/);
    expect(ring).toMatch(/plan\.still/);
    expect(ring).toMatch(/plan\.draw/);
    expect(ring).toMatch(/useFrame\(/); // the shared frame loop, which stops while the page is hidden
    expect(/requestAnimationFrame/.test(ring)).toBe(false);
  });
});
