import type { PlaceMatch } from "@hauntology/shared/app/api";
import { errorCopy } from "@hauntology/shared/app/errors-copy";
import {
  LOCATION_FAILED_LINE, MEMORY_DAY_ERROR_COPY, MEMORY_DAY_MIN, SUGGESTED_DAY_LINE, TIMES_OF_DAY, TIME_LABELS,
  conditionsChoice, memoryDayError, memoryDayMax, placeFromMatch, placeFromPosition,
} from "@hauntology/shared/app/sky";
import type { MemoryDay, PlaceInput, TimeOfDay } from "@hauntology/shared/conditions/types";
import { useState, type FormEvent } from "react";
import { useShell } from "../context";
import { useAnnounce } from "../LiveRegion";

/**
 * "Set the sky" (Requirement 12.1): an optional card with a city search (up to five matches), a "Use
 * my location" action that asks the browser only after a tap, and a Memory Day. The choice lives in
 * `PlayMemory.conditions`, never in storage, and goes with `POST /api/play/start`. With nothing
 * chosen there is no choice at all and the default sky applies. Nothing waits for this card: Wander
 * and a case never depend on it. The chosen place is shown as a label only.
 */
export function SkyCard() {
  const { api, memory, platform } = useShell();
  const announce = useAnnounce();
  const today = platform.now();

  const start = memory.get();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<PlaceInput | undefined>(start.conditions?.place);
  const suggested = start.suggestedDay;
  const initialDay = start.conditions?.memoryDay ?? suggested;
  const [date, setDate] = useState(initialDay?.date ?? "");
  const [time, setTime] = useState<TimeOfDay>(initialDay?.timeOfDay ?? "dusk");
  const [fromPhoto, setFromPhoto] = useState(start.conditions?.memoryDay === undefined && suggested !== undefined);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<PlaceMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const dateError = date === "" ? null : memoryDayError(date, today);

  /** Keeps memory in step with the card. A bad or empty date is no Memory Day. */
  const commit = (nextPlace: PlaceInput | undefined, nextDate: string, nextTime: TimeOfDay) => {
    const memoryDay: MemoryDay | undefined = nextDate !== "" && memoryDayError(nextDate, today) === null ? { date: nextDate, timeOfDay: nextTime } : undefined;
    memory.set({ conditions: conditionsChoice({ place: nextPlace, memoryDay, hostHour: today.getHours() }) });
  };

  const search = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    setSearching(true);
    void api.searchPlaces(query).then((r) => {
      setSearching(false);
      if (r.ok) {
        const list = r.value.slice(0, 5);
        setMatches(list);
        announce(list.length === 0 ? "No places found." : `${list.length} ${list.length === 1 ? "place" : "places"} found.`);
      } else {
        setMatches(null);
        const c = errorCopy(r.code);
        setNote(`${c.title}. ${c.body}`);
      }
    });
  };

  const choose = (p: PlaceInput) => {
    setPlace(p);
    setMatches(null);
    setNote(null);
    setQuery("");
    commit(p, date, time);
    announce(`Sky place set to ${p.label ?? "your choice"}.`);
  };

  const locate = () => {
    setNote(null);
    void platform.locate().then(
      (pos) => choose(placeFromPosition(pos.lat, pos.lon)),
      () => setNote(LOCATION_FAILED_LINE),
    );
  };

  return (
    <section className="sky-card" aria-labelledby="sky-title">
      <h2 id="sky-title">Set the sky</h2>
      <p>
        <button className="button" type="button" aria-expanded={open} aria-controls="sky-body" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide the sky card" : "Set the sky (optional)"}
        </button>{" "}
        <small data-sky-state>{place || date !== "" ? `Sky: ${[place?.label, date !== "" && dateError === null ? date : null].filter(Boolean).join(", ")}` : "The usual sky."}</small>
      </p>

      {open ? (
        <div id="sky-body" className="sky-body">
          <form onSubmit={search} role="search" aria-label="Find a city">
            <label>
              City <input type="search" value={query} maxLength={60} onChange={(e) => setQuery(e.target.value)} />
            </label>{" "}
            <button className="button" type="submit" disabled={searching || query.trim().length < 2}>
              Search
            </button>{" "}
            <button className="button" type="button" onClick={locate}>
              Use my location
            </button>
          </form>
          {note ? <p className="reason">{note}</p> : null}
          {matches !== null ? (
            matches.length === 0 ? (
              <p>No places found. Try another name.</p>
            ) : (
              <ul className="matches" aria-label="Matches">
                {matches.map((m) => (
                  <li key={`${m.label}${m.lat}${m.lon}`}>
                    <button className="button" type="button" onClick={() => choose(placeFromMatch(m))}>
                      {m.label}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {place ? (
            <p>
              Place: <strong data-sky-place>{place.label}</strong>{" "}
              <button
                className="button"
                type="button"
                onClick={() => {
                  setPlace(undefined);
                  commit(undefined, date, time);
                }}
              >
                Remove place
              </button>
            </p>
          ) : null}

          <fieldset className="memory-day">
            <legend>A Memory Day</legend>
            <label>
              Date{" "}
              <input
                type="date"
                value={date}
                min={MEMORY_DAY_MIN}
                max={memoryDayMax(today)}
                aria-invalid={dateError !== null}
                aria-describedby={dateError !== null ? "sky-date-error" : fromPhoto ? "sky-date-photo" : undefined}
                onChange={(e) => {
                  setDate(e.target.value);
                  setFromPhoto(false);
                  commit(place, e.target.value, time);
                }}
              />
            </label>{" "}
            <label>
              Time{" "}
              <select
                value={time}
                onChange={(e) => {
                  const t = e.target.value as TimeOfDay;
                  setTime(t);
                  commit(place, date, t);
                }}
              >
                {TIMES_OF_DAY.map((t) => (
                  <option key={t} value={t}>
                    {TIME_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>{" "}
            {date !== "" ? (
              <button
                className="button"
                type="button"
                onClick={() => {
                  setDate("");
                  setFromPhoto(false);
                  commit(place, "", time);
                }}
              >
                Clear the date
              </button>
            ) : null}
            {dateError !== null ? (
              <p id="sky-date-error" className="reason">
                {MEMORY_DAY_ERROR_COPY[dateError]}
              </p>
            ) : null}
            {fromPhoto && date !== "" ? <p id="sky-date-photo">{SUGGESTED_DAY_LINE}</p> : null}
          </fieldset>
        </div>
      ) : null}
    </section>
  );
}
