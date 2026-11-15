import { RELICS } from "./pool";

/**
 * Relic Token QR payload parser (party-mode 6.4).
 * Accepts strictly `hw:<relic id>` where `<relic id>` is one of the six canonical relic ids (`r1` to `r6`).
 * Rejects any other payload, prefix, whitespace or type.
 */
export type RelicId = (typeof RELICS)[number]["id"];

export type ParseRelicTokenResult =
  | Readonly<{ ok: true; relicId: RelicId }>
  | Readonly<{ ok: false; code: "bad_relic_token" }>;

const VALID_RELIC_IDS: ReadonlySet<string> = new Set(RELICS.map((r) => r.id));

export function parseRelicToken(raw: unknown): ParseRelicTokenResult {
  if (typeof raw !== "string") return { ok: false, code: "bad_relic_token" };
  if (!raw.startsWith("hw:")) return { ok: false, code: "bad_relic_token" };
  const id = raw.slice(3);
  if (!VALID_RELIC_IDS.has(id)) return { ok: false, code: "bad_relic_token" };
  return { ok: true, relicId: id as RelicId };
}

export function encodeRelicToken(relicId: RelicId): string {
  if (!VALID_RELIC_IDS.has(relicId)) throw new Error(`Unknown relic id: ${String(relicId)}`);
  return `hw:${relicId}`;
}
