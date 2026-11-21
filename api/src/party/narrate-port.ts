import type { Ports } from "@hauntology/shared/party/server";
import { partyScripted, speakerFor } from "@hauntology/shared/party/narrate";
import { narratePartyEvent, type PartyNarrationDeps } from "./narrate";

/**
 * The Room's narrator port (party-mode 6.1): `narratePartyEvent` behind the shape `RoomCore` asks for. The Room's budget is made per Room
 * code (`deps`), the ids already narrated are kept here so one event never makes two model calls, and any failure answers `null`, so the
 * Room falls back to the scripted bank. Nothing here is awaited by a rule: the Room speaks only while the Master has speech on.
 */
export function makeNarratePort(deps: (code: string) => PartyNarrationDeps | null): NonNullable<Ports["narrate"]> {
  const narrated = new Set<string>();
  return async (view, event, rng) => {
    const d = deps(event.code);
    const key = `${event.code}:${event.id}`;
    if (d === null) return { text: partyScripted(event.kind, speakerFor(event.kind), rng), speaker: speakerFor(event.kind) };
    const seen = new Set<number>([...narrated].filter((k) => k.startsWith(`${event.code}:`)).map((k) => Number(k.split(":")[1])));
    const line = await narratePartyEvent(d, view, event, rng, seen);
    if (line.calls > 0) narrated.add(key);
    return { text: line.text, speaker: line.speaker };
  };
}
