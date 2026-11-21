import type { RoomSpend } from "@hauntology/shared/party/spend";
import type { RoomSpendStore } from "./budget";

type Stub = { fetch(input: string, init?: RequestInit): Promise<Response> };

/** The Room's spend, kept in the Room itself (its Durable Object), so it ends with it. Reads fail closed: an unreadable answer reads as everything spent. */
export class DoRoomSpendStore implements RoomSpendStore {
  constructor(private readonly room: Stub, private readonly caps: { images: number; models: number }) {}

  async load(): Promise<RoomSpend> {
    try {
      const r = await this.room.fetch("https://party/spend/load", { method: "POST", body: "{}" });
      const b = (await r.json()) as Partial<RoomSpend>;
      if (r.ok && Number.isInteger(b.images) && Number.isInteger(b.models) && (b.images as number) >= 0 && (b.models as number) >= 0) return { images: b.images as number, models: b.models as number };
    } catch { /* below */ }
    return { images: this.caps.images, models: this.caps.models };
  }

  async save(spend: RoomSpend): Promise<void> {
    const r = await this.room.fetch("https://party/spend/save", { method: "POST", body: JSON.stringify({ spend }) });
    if (!r.ok) throw new Error("the Room did not take its spend");
  }
}
