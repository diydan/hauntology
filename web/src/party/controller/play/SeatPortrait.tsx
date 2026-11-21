import type { CSSProperties, ReactNode } from "react";
import { seatFadeMs, seatPortrait, type SeatLook } from "@hauntology/shared/party/seatLook";
import type { GameView } from "../game-view";

/**
 * A Player's Seat Portrait (party-mode 9.25): their contributed ghost in colour, or a nickname chip; once they join the haunting it fades to black and
 * white over at most 0.6 s (a plain cut under reduced motion). A Preset Ghost fades into its own black and white picture; any other ghost goes under a
 * greyscale filter, so no second picture is ever made. It reads only the public haunting flag, never a Suspect card, and Suspect cards never change colour.
 */
export function SeatPortrait({ seat, nickname, profile, look, reducedMotion }: { seat: number; nickname: string; profile?: { portraitUrl: string; monoUrl?: string; preset?: boolean } | null; look: SeatLook; reducedMotion: boolean }): ReactNode {
  const ms = seatFadeMs(reducedMotion);
  const colour = seatPortrait({ seat, nickname, profile: profile ?? null }, "colour");
  const mono = seatPortrait({ seat, nickname, profile: profile ?? null }, "mono");
  const fade = (prop: string): CSSProperties => ({ transition: ms === 0 ? "none" : `${prop} ${ms}ms linear` });
  if (colour.kind === "chip") {
    return <span className="pc-chip-portrait ui-chip" data-look={look} aria-hidden="true" style={{ filter: look === "mono" ? "grayscale(1)" : "none", ...fade("filter") }}>{nickname.slice(0, 2)}</span>;
  }
  // a Preset Ghost has its own black and white picture: both are drawn and one fades into the other
  const twin = mono.kind === "image" && mono.url !== colour.url;
  return (
    <span className="pc-portrait" data-look={look} aria-hidden="true">
      <img className="pc-portrait-img" src={colour.url} alt="" width={40} height={40} style={{ opacity: twin && look === "mono" ? 0 : 1, filter: !twin && look === "mono" ? "grayscale(1)" : "none", ...fade(twin ? "opacity" : "filter") }} />
      {twin && mono.kind === "image" ? <img className="pc-portrait-img pc-portrait-mono" src={mono.url} alt="" width={40} height={40} style={{ opacity: look === "mono" ? 1 : 0, ...fade("opacity") }} /> : null}
    </span>
  );
}

/** The Players at the table, each with their Seat Portrait and their name; whoever joined the haunting says so in words, never the word Poltergeist. */
export function SeatRow({ game, reducedMotion, me }: { game: GameView; reducedMotion: boolean; me?: number }): ReactNode {
  const seats = game.lobby?.seats ?? game.pub?.seats.map((s) => ({ seat: s.seat, nickname: s.nickname, bot: s.bot, connected: true })) ?? [];
  if (seats.length === 0) return null;
  const haunting = new Set((game.pub?.seats ?? []).filter((s) => s.poltergeist).map((s) => s.seat));
  return (
    <ul className="pc-seat-row ui-chips" aria-label="At the table">
      {seats.map((s) => {
        const look: SeatLook = haunting.has(s.seat) ? "mono" : "colour";
        return (
          <li key={s.seat} className="ui-chip">
            <SeatPortrait seat={s.seat} nickname={s.nickname} profile={"portrait" in s ? s.portrait ?? null : null} look={look} reducedMotion={reducedMotion} />
            <span>{s.seat === me ? "You" : s.nickname}{haunting.has(s.seat) ? " · joined the haunting" : ""}</span>
          </li>
        );
      })}
    </ul>
  );
}
