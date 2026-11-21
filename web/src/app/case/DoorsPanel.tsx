import { useEffect, useRef, useState } from "react";
import { KNOCK_READ, readKnocks } from "@hauntology/shared/puzzles/knock";
import type { PublicSnapshot } from "@hauntology/shared/party/engine";
import { EMPTY_DOOR_FEED, type RoomClient, type RoomSnapshot } from "./room-client";
import { doorLine, doorName, doorResultLine, doorStatus, knockLine, knockMarks, type Names } from "./words";
import "./DoorsPanel.css";

/**
 * A knock pad for the touch path (knock-door 7.2): tap once for each knock, pause between groups, and the knocks go in by
 * themselves after a quiet moment (`KNOCK_READ.quietMs`), or at once with Done. Times are milliseconds from the first tap.
 * Each tap shows as a mark, so the knocking can be followed with the sound off. The motion sensor and microphone are not
 * wired in here: the Tap control is the path that always works.
 */
export function KnockPad({ label, onSend, quietMs = KNOCK_READ.quietMs, clock = () => performance.now() }: {
  label: string;
  onSend: (times: number[]) => void;
  quietMs?: number;
  clock?: () => number;
}) {
  const [times, setTimes] = useState<number[]>([]);
  const live = useRef({ times: [] as number[], start: 0, timer: 0 as ReturnType<typeof setTimeout> | 0 });
  const send = useRef(onSend);
  send.current = onSend;

  const finish = (): void => {
    const cur = live.current;
    if (cur.timer !== 0) clearTimeout(cur.timer);
    cur.timer = 0;
    if (cur.times.length === 0) return;
    const out = cur.times;
    cur.times = [];
    setTimes([]);
    send.current(out);
  };
  useEffect(() => () => { if (live.current.timer !== 0) clearTimeout(live.current.timer); }, []);

  const tap = (): void => {
    const cur = live.current;
    const t = clock();
    if (cur.times.length === 0) cur.start = t;
    cur.times = [...cur.times, Math.max(0, t - cur.start)];
    setTimes(cur.times);
    if (cur.timer !== 0) clearTimeout(cur.timer);
    cur.timer = setTimeout(finish, quietMs);
  };

  const groups = readKnocks(times).groups;
  return (
    <div className="case-knockpad ui-stack">
      <div className="ui-row">
        <button type="button" className="ui-button ui-button--primary" aria-label={`${label}: tap once for each knock`} onClick={tap}>{label}</button>
        <button type="button" className="ui-button" disabled={times.length === 0} onClick={finish}>Done</button>
      </div>
      <p className="case-knock-marks" role="img" aria-label={groups.length ? `Knocked so far: ${groups.join(", ")}` : "No knocks yet"}>{groups.length ? knockMarks(groups) : "·"}</p>
      <p className="ui-hint">Tap once for each knock. Pause between groups. It sends by itself after a quiet moment.</p>
    </div>
  );
}

/**
 * The doors on the solo table (knock-door 2.4, 3.2 to 3.5, 4.4, 5.3, 7.2, 7.3, 9.2, 9.3): each door in words, and as a
 * small door that swings slowly (not at all with reduced motion); Push for a heavy door with its count; the Knock pad for
 * a knock door when you stand beside it; the ghost's knock this phone heard (once, with Got it); the knock at the TV after a
 * Slam. The latest change is in a polite live line. Shows nothing when the world has no doors.
 */
export function DoorsPanel({ client, snap, view, n, reducedMotion }: { client: RoomClient; snap: RoomSnapshot; view: PublicSnapshot; n: Names; reducedMotion: boolean }) {
  const [knocking, setKnocking] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const feed = snap.doors ?? EMPTY_DOOR_FEED;
  const tv = view.tvKnock ?? null;
  if (view.doors.length === 0 && tv === null) return null;

  const heard = feed.heard.filter((h) => !dismissed.includes(h.doorId) && view.doors.some((d) => d.id === h.doorId && !d.open));
  const me = view.seats.find((s) => s.seat === snap.seat);
  const mine = view.active !== null && view.active === snap.seat;
  const detective = me !== undefined && !me.poltergeist;
  const last = feed.events.at(-1);
  const door = knocking === null ? undefined : view.doors.find((d) => d.id === knocking);

  return (
    <section className="ui-panel ui-stack case-doors" aria-label="Doors">
      <p className="ui-status" aria-live="polite" data-testid="door-live">{last ? doorLine(last, view.doors, n) : ""}</p>

      {heard.map((h) => {
        const d = view.doors.find((x) => x.id === h.doorId);
        return (
          <div key={h.doorId} className="ui-stack case-heard" role="group" aria-label="The ghost's knock you heard">
            <p>You heard the ghost knock at {d ? doorName(d, n) : "a door"}: {knockLine(h.groups, h.long)}.</p>
            <p className="case-knock-marks" aria-hidden="true">{knockMarks(h.groups)}</p>
            <button type="button" className="ui-button ui-button--quiet" onClick={() => { setDismissed([...dismissed, h.doorId]); client.send({ t: "sightAck", sightId: `door-${h.doorId}` }); }}>Got it</button>
          </div>
        );
      })}

      <ul className="case-door-list">
        {view.doors.map((d) => {
          const beside = view.at !== null && (view.at === d.a || view.at === d.b);
          return (
            <li key={d.id} className="case-door ui-row" data-open={d.open ? "true" : "false"} data-still={reducedMotion ? "true" : "false"}>
              <span className="case-door-glyph" aria-hidden="true" />
              <span className="case-door-text">{doorStatus(d, n)}</span>
              {d.lock === "heavy" && !d.open ? (
                <button type="button" className="ui-button" aria-label={`Push ${doorName(d, n)}`} disabled={!mine} onClick={() => client.send({ t: "doorAct", doorId: d.id })}>Push</button>
              ) : null}
              {d.lock === "knock" && !d.open && mine && detective ? (
                beside
                  ? <button type="button" className="ui-button" aria-label={`Knock on ${doorName(d, n)}`} aria-pressed={knocking === d.id} onClick={() => setKnocking(knocking === d.id ? null : d.id)}>Knock</button>
                  : <span className="ui-hint">Go to a room beside it to knock.</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {door !== undefined && !door.open ? (
        <KnockPad label="Knock" onSend={(times) => client.send({ t: "doorKnock", doorId: door.id, times })} />
      ) : null}
      {feed.result ? <p className="ui-notice" role="status">{doorResultLine(feed.result)}</p> : null}

      {tv !== null ? (
        <div className="ui-stack case-tvknock" role="group" aria-label="The ghost knocks at the TV">
          <p>The ghost knocks at the TV: {knockLine(tv.groups, tv.long)}.</p>
          <p className="case-knock-marks" aria-hidden="true">{knockMarks(tv.groups)}</p>
          {tv.answeredBy === null ? (
            <>
              <KnockPad label="Knock it back" onSend={(times) => client.send({ t: "tvKnock", times })} />
              {feed.tvResult?.outcome === "wrong" ? <p className="ui-notice">{feed.tvResult.heard} Not that one. Try again.</p> : null}
            </>
          ) : (
            <p>{tv.answeredBy === snap.seat ? "You knocked it back first. You get a Help: 10 more seconds on your next turn." : `${n.seat(tv.answeredBy)} knocked it back first and gets a Help.`}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
