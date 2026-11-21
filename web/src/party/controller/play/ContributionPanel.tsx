import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ACCESSORIES, EPOCHS, PALETTES, RELATIONS, TEMPERAMENTS, TRANSLUCENCIES, VOICES } from "@hauntology/shared/creator/traits";
import { contributionWords, type Candidate, type ContributionApi, type PhotoPrompt, type PromptOffer, type TraitsInput } from "../contribute-api";

/** The most skips of the three photo ideas a Player gets (party-mode 3.8). */
export const MAX_PROMPT_SKIPS = 3;
const DETAIL_MAX = 140;
const NAME_MAX = 24;

function PhotoStep({ api }: { api: ContributionApi }): ReactNode {
  const [offer, setOffer] = useState<PromptOffer | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [skips, setSkips] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const take = useRef<HTMLInputElement>(null);
  const own = useRef<HTMLInputElement>(null);
  useEffect(() => { void api.prompts().then((r) => { if (r.ok) setOffer(r.value); else setNote(contributionWords(r.code, r.reason)); }); }, [api]);
  const prompt: PhotoPrompt | undefined = offer?.prompts.find((p) => p.id === chosen);
  const upload = async (file: File | undefined, promptId?: string): Promise<void> => {
    if (file === undefined) return;
    setBusy(true); setNote(null);
    const r = await api.uploadPhoto(file, promptId);
    setBusy(false);
    if (r.ok) { setDone(true); setNote("Thank you. Your photo will hang in the house."); } else setNote(contributionWords(r.code, r.reason));
  };
  const more = async (): Promise<void> => {
    const r = await api.skip();
    if (r.ok) { setOffer(r.value); setChosen(null); setSkips((n) => n + 1); setNote(null); } else setNote(contributionWords(r.code, r.reason));
  };
  const left = MAX_PROMPT_SKIPS - skips;
  return (
    <section className="ui-card ui-stack" aria-label="A photo for the house">
      <h3 className="ui-heading">A photo for the house</h3>
      <p className="ui-hint">A picture of a place or a thing, with no people in it. It hangs near a room in the game. You can skip this.</p>
      {offer === null && note === null ? <p className="ui-hint" role="status">Looking for ideas…</p> : null}
      {offer !== null && !done ? (
        <div className="ui-stack--tight" role="radiogroup" aria-label="Photo ideas">
          {offer.prompts.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={chosen === p.id} className="ui-button ui-button--block" onClick={() => setChosen(p.id)}>{p.text}</button>
          ))}
        </div>
      ) : null}
      {prompt !== undefined && !done ? (
        <div className="ui-stack--tight">
          <p className="ui-hint">{prompt.tip}</p>
          {prompt.source === "take_now" ? (
            <>
              <input ref={take} type="file" accept="image/*" capture="environment" className="ui-sr-only" tabIndex={-1} aria-label="Take a photo" onChange={(e) => void upload(e.currentTarget.files?.[0], prompt.id)} />
              <button type="button" className="ui-button" disabled={busy} onClick={() => take.current?.click()}>Take a photo</button>
            </>
          ) : (
            <>
              <input ref={own} type="file" accept="image/*" className="ui-sr-only" tabIndex={-1} aria-label="Choose a photo" onChange={(e) => void upload(e.currentTarget.files?.[0], prompt.id)} />
              <button type="button" className="ui-button" disabled={busy} onClick={() => own.current?.click()}>Choose a photo</button>
            </>
          )}
        </div>
      ) : null}
      {offer !== null && !done ? (
        <div className="ui-row">
          <button type="button" className="ui-button" disabled={left <= 0 || busy} onClick={() => void more()}>Show me three more ({left} left)</button>
          <input id="pc-own" type="file" accept="image/*" className="ui-sr-only" tabIndex={-1} aria-label="Use my own photo" onChange={(e) => void upload(e.currentTarget.files?.[0])} />
          <button type="button" className="ui-button" disabled={busy} onClick={() => document.getElementById("pc-own")?.click()}>Use my own photo</button>
        </div>
      ) : null}
      {busy ? <p className="ui-hint" role="status">Checking the photo…</p> : null}
      {note !== null ? <p className={done ? "ui-hint" : "ui-notice"} role={done ? "status" : "alert"}>{note}</p> : null}
    </section>
  );
}

function ZoneStep({ api }: { api: ContributionApi }): ReactNode {
  const id = useId();
  const [name, setName] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (): Promise<void> => {
    setBusy(true);
    const r = await api.zoneName(name.trim());
    setBusy(false);
    setNote(r.ok ? { ok: true, text: `“${r.value.name}” may name a room in the house.` } : { ok: false, text: contributionWords(r.code, r.reason) });
  };
  return (
    <section className="ui-card ui-stack" aria-label="Name a room">
      <h3 className="ui-heading">Name a room</h3>
      <div className="ui-field">
        <label className="ui-field-label" htmlFor={id}>A name for one room</label>
        <input id={id} className="ui-input" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </div>
      <p className="ui-hint">Plain words, like “The blue stairs”. Up to {NAME_MAX} letters. Optional.</p>
      <button type="button" className="ui-button" disabled={busy || name.trim() === ""} onClick={() => void send()}>Send the name</button>
      {note !== null ? <p className={note.ok ? "ui-hint" : "ui-notice"} role={note.ok ? "status" : "alert"}>{note.text}</p> : null}
    </section>
  );
}

const first = <T,>(a: readonly T[]): T => a[0] as T;
const DEFAULT_TRAITS: TraitsInput = { epoch: first(EPOCHS), temperament: first(TEMPERAMENTS), relation: first(RELATIONS), palette: first(PALETTES), translucency: 50, accessories: [], voice: first(VOICES) };

function SelectField({ label, value, options, onChange }: { label: string; value: string | number; options: readonly (string | number)[]; onChange: (v: string) => void }): ReactNode {
  const id = useId();
  return (
    <div className="ui-field">
      <label className="ui-field-label" htmlFor={id}>{label}</label>
      <select id={id} className="ui-select" value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
      </select>
    </div>
  );
}

/**
 * The Suspect step (party-mode 9.8, 9.24): a ready-made ghost (nothing to do: the Room gives one), or a designed one in the Ghost Creator's two steps
 * (traits, then one portrait). Any failure is a ready-made ghost and the Room says why in words. The voice is a plain pick, never guessed, and a Player is
 * never pushed one way. (The selfie ghost is a separate screen and is not offered here.)
 */
function SuspectStep({ api }: { api: ContributionApi }): ReactNode {
  const [mode, setMode] = useState<"preset" | "design">("preset");
  const [traits, setTraits] = useState<TraitsInput>(DEFAULT_TRAITS);
  const [detail, setDetail] = useState("");
  const [cands, setCands] = useState<readonly Candidate[] | null>(null);
  const [voice, setVoice] = useState<"lower" | "lighter">("lower");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(false);
  const set = (patch: Partial<TraitsInput>): void => setTraits((t) => ({ ...t, ...patch }));
  const design = async (): Promise<void> => {
    setBusy(true); setNote(null);
    const r = await api.suspectPortraits({ ...traits, ...(detail.trim() !== "" ? { detail: detail.trim().slice(0, DETAIL_MAX) } : {}) });
    setBusy(false);
    if (!r.ok) { setNote({ ok: false, text: contributionWords(r.code, r.reason) }); return; }
    if (r.value.fallback) { setNote({ ok: true, text: "A ready-made ghost will stand in for yours." }); setMade(true); return; }
    setCands(r.value.candidates);
  };
  const choose = async (c: Candidate): Promise<void> => {
    setBusy(true);
    const r = await api.suspectSprite(c.candidateId, voice);
    setBusy(false);
    if (!r.ok) { setNote({ ok: false, text: contributionWords(r.code, r.reason) }); return; }
    setMade(true); setCands(null);
    setNote({ ok: true, text: r.value.fallback ? "A ready-made ghost will stand in for yours." : "Your ghost is in the house." });
  };
  return (
    <section className="ui-card ui-stack" aria-label="Your ghost">
      <h3 className="ui-heading">Your ghost</h3>
      <div className="ui-segments" role="radiogroup" aria-label="Where your ghost comes from">
        <button type="button" role="radio" aria-checked={mode === "preset"} className="ui-button" onClick={() => setMode("preset")}>A ready-made ghost</button>
        <button type="button" role="radio" aria-checked={mode === "design"} className="ui-button" onClick={() => setMode("design")}>Design one</button>
      </div>
      {mode === "preset" ? <p className="ui-hint">The game gives you one of its own ghosts. Nothing to do.</p> : made ? null : (
        <div className="ui-stack">
          <SelectField label="Time it comes from" value={traits.epoch} options={EPOCHS} onChange={(epoch) => set({ epoch })} />
          <SelectField label="Mood" value={traits.temperament} options={TEMPERAMENTS} onChange={(temperament) => set({ temperament })} />
          <SelectField label="Who it was to the house" value={traits.relation} options={RELATIONS} onChange={(relation) => set({ relation })} />
          <SelectField label="Colours" value={traits.palette} options={PALETTES} onChange={(palette) => set({ palette })} />
          <SelectField label="How see-through, in percent" value={traits.translucency} options={TRANSLUCENCIES} onChange={(v) => set({ translucency: Number(v) })} />
          <SelectField label="Something it carries" value={traits.accessories[0] ?? ""} options={["", ...ACCESSORIES]} onChange={(a) => set({ accessories: a === "" ? [] : [a] })} />
          <div className="ui-field">
            <label className="ui-field-label" htmlFor="pc-detail">One more detail (optional)</label>
            <input id="pc-detail" className="ui-input" value={detail} maxLength={DETAIL_MAX} onChange={(e) => setDetail(e.target.value)} autoComplete="off" />
          </div>
          <div className="ui-stack--tight" role="radiogroup" aria-label="Its voice">
            <p className="ui-field-label">Its voice</p>
            <div className="ui-segments">
              <button type="button" role="radio" aria-checked={voice === "lower"} className="ui-button" onClick={() => setVoice("lower")}>A lower voice</button>
              <button type="button" role="radio" aria-checked={voice === "lighter"} className="ui-button" onClick={() => setVoice("lighter")}>A lighter voice</button>
            </div>
          </div>
          {cands === null ? <button type="button" className="ui-button" disabled={busy} onClick={() => void design()}>Show me pictures</button> : (
            <div className="ui-stack--tight" role="group" aria-label="Pick a picture">
              <p className="ui-hint">Pick the one you like.</p>
              <div className="ui-choices">
                {cands.map((c, i) => <button key={c.candidateId} type="button" className="ui-button ui-choice" disabled={busy} onClick={() => void choose(c)}><img src={c.imageUrl} alt={`Ghost picture ${i + 1}`} width={96} height={128} /></button>)}
              </div>
            </div>
          )}
        </div>
      )}
      {busy ? <p className="ui-hint" role="status">Working…</p> : null}
      {note !== null ? <p className={note.ok ? "ui-hint" : "ui-notice"} role={note.ok ? "status" : "alert"}>{note.text}</p> : null}
    </section>
  );
}

/** The three things a Player may add before the game starts, each optional and each skippable: a photo, a room's name, and their ghost (party-mode 9.8). */
export function ContributionPanel({ api }: { api: ContributionApi | null }): ReactNode {
  if (api === null) return null;
  return (
    <section className="pc-contribute ui-stack" aria-label="Add your own touch">
      <h2 className="ui-heading">Add your own touch</h2>
      <p className="ui-hint">All of this is optional. If you skip it, the game uses its own.</p>
      <PhotoStep api={api} />
      <ZoneStep api={api} />
      <SuspectStep api={api} />
    </section>
  );
}
