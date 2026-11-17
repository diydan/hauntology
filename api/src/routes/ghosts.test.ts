import { GhostPresetSchema } from "@hauntology/shared/app/api-schemas";
import { PRESET_PROFILES } from "@hauntology/shared/creator/presets";
import { describe, expect, it } from "vitest";
import { worldsKit } from "../worlds/test-kit";

describe("GET /api/ghosts/presets (ghost-creator task 2)", () => {
  it("lists the six Preset Ghosts as valid profiles, publicly and with no Session cookie", async () => {
    const kit = worldsKit(() => 1_800_000_000_000, {});
    const r = await kit.send("/api/ghosts/presets", { headers: kit.anonymous() });
    expect(r.status).toBe(200);
    const list = r.json as unknown[];
    expect(list).toHaveLength(6);
    for (const p of list) expect(GhostPresetSchema.parse(p)).toEqual(p);
    expect(list).toEqual(PRESET_PROFILES.map((p) => ({ id: p.id, name: p.persona.name, spriteUrl: p.spriteUrl })));
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(r.headers.get("Set-Cookie")).toBeNull();
  });
});
