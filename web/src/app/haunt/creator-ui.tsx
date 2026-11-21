import { PRESET_PROFILES } from "@hauntology/shared/creator/presets";
import { DETAIL_MAX } from "@hauntology/shared/creator/sanitize";
import {
  ACCESSORIES, EPOCHS, PALETTES, RELATIONS, TEMPERAMENTS, VOICES,
  defaultTraits, randomTraits, validateTraits, type Traits,
} from "@hauntology/shared/creator/traits";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CreatorHandle, CreatorSetup } from "./creator";

/**
 * The Ghost Creator (ghost-creator group 4): the trait form, two portrait candidates to
 * pick between, and the meeting. It talks to its own API routes (the seam gives it only a
 * container, a world and the `chosen` message). Nothing here can block the game: quota
 * gone, generation failed or the sprite refused all land on Presets or the default ghost.
 * The form is built from the design elements only (Shared look, Requirement 7).
 */

type Candidate = { candidateId: string; imageUrl: string };
type ProfileView = { name: string; spriteUrl: string; voice: "soft" | "dry" };
type Phase =
  | { k: "form" }
  | { k: "generating" }
  | { k: "candidates"; candidates: Candidate[]; quotaLeft: number | null }
  | { k: "cutting" }
  | { k: "done"; name: string; spriteUrl: string; voice: "soft" | "dry"; fallback: boolean };

const MEET: Readonly<Record<"soft" | "dry", string>> = {
  soft: "I have been practising how to be found. Do stay a little while.",
  dry: "You may begin. The house and I will keep up.",
};

const NOTES: Readonly<Record<string, string>> = {
  quota_image: "No pictures are left today. A preset ghost below will do very well.",
  portrait_failed: "The portrait would not come. A preset ghost below will do very well.",
  creator_unavailable: "Making a ghost is not available just now. A preset ghost below will do very well.",
  detail_unsafe: "Those words cannot be used for a ghost. Try plainer ones, or leave the detail empty.",
  moderation_unavailable: "The detail could not be checked just now. Clear it, or try again in a moment.",
  candidate_missing: "That picture is gone. Generate again, or take a preset ghost.",
};

async function call<T>(path: string, body?: unknown): Promise<{ ok: true; value: T } | { ok: false; code: string; fields?: string[]; quota?: { image?: number } }> {
  try {
    const r = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const parsed: unknown = await r.json().catch(() => null);
    if (r.ok) return { ok: true, value: parsed as T };
    const o = (typeof parsed === "object" && parsed !== null ? parsed : {}) as { code?: string; fields?: string[]; quota?: { image?: number } };
    return { ok: false, code: o.code ?? "portrait_failed", ...(o.fields ? { fields: o.fields } : {}), ...(o.quota ? { quota: o.quota } : {}) };
  } catch {
    return { ok: false, code: "portrait_failed" };
  }
}

const words = (values: readonly string[]) => values.map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }));

function Creator({ worldId, onChosen }: { worldId: string; onChosen: () => void }) {
  const [traits, setTraits] = useState<Traits>(() => defaultTraits(worldId));
  const [detail, setDetail] = useState("");
  const [phase, setPhase] = useState<Phase>({ k: "form" });
  const [note, setNote] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ReadonlySet<string>>(new Set());
  const [existing, setExisting] = useState<ProfileView | null>(null);

  // Restore: a ghost already made for this world is shown first (Requirement 6.2).
  useEffect(() => {
    let live = true;
    void call<ProfileView>(`/api/worlds/${encodeURIComponent(worldId)}/ghost`).then((r) => {
      if (live && r.ok) setExisting(r.value);
    });
    return () => { live = false; };
  }, [worldId]);

  const set = <K extends keyof Traits>(key: K, value: Traits[K]) => setTraits((t) => ({ ...t, [key]: value }));
  const asTraits = (): Traits => ({ ...traits, ...(detail.trim() === "" ? {} : { detail }) });

  const generate = async () => {
    const candidate = asTraits();
    const checked = validateTraits({ ...candidate, detail: detail.trim() === "" ? undefined : detail });
    if (!checked.ok) {
      setFieldErrors(new Set(checked.fields));
      setNote("One of the choices needs another look — marked below.");
      return;
    }
    setFieldErrors(new Set());
    setNote(null);
    setPhase({ k: "generating" });
    const r = await call<{ candidates: Candidate[]; quota: { image?: number } }>("/api/ghosts/portraits", { traits: checked.traits, worldId });
    if (!r.ok) {
      if (r.code === "trait_invalid") setFieldErrors(new Set(r.fields ?? ["detail"]));
      setNote(NOTES[r.code] ?? "The portrait would not come. A preset ghost below will do very well.");
      setPhase({ k: "form" });
      return;
    }
    setPhase({ k: "candidates", candidates: r.value.candidates, quotaLeft: r.value.quota?.image ?? null });
  };

  const finishWith = (profile: { persona: { name: string; voice: "soft" | "dry" }; spriteUrl: string }, fallback: boolean) => {
    setPhase({ k: "done", name: profile.persona.name, spriteUrl: profile.spriteUrl, voice: profile.persona.voice, fallback });
  };

  const pick = async (candidateId: string) => {
    setPhase({ k: "cutting" });
    const r = await call<{ profile: { persona: { name: string; voice: "soft" | "dry" }; spriteUrl: string }; fallback: boolean }>("/api/ghosts/sprite", { candidateId, worldId });
    if (!r.ok) {
      setNote(NOTES[r.code] ?? NOTES.portrait_failed!);
      setPhase({ k: "form" });
      return;
    }
    finishWith(r.value.profile, r.value.fallback);
  };

  const pickPreset = async (presetId: string) => {
    const preset = PRESET_PROFILES.find((p) => p.id === presetId);
    if (!preset) return;
    const r = await call<{ profile: typeof preset }>("/api/ghosts/preset", { worldId, presetId });
    if (r.ok) finishWith(r.value.profile, true);
    else finishWith(preset, true); // the shipped picture is enough on its own
  };

  const err = (field: string) => (fieldErrors.has(field) ? { "aria-invalid": true as const } : {});
  const selectField = (label: string, field: keyof Traits, values: readonly string[]) => (
    <label className="ui-field" key={field}>
      <span className="ui-field-label">{label}</span>
      <select className="ui-select" value={String(traits[field])} {...err(field)} onChange={(e) => set(field, e.target.value as Traits[typeof field])}>
        {words(values).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );

  if (existing !== null && phase.k === "form") {
    return (
      <div className="ui-stack" data-creator>
        <div className={`ui-portrait ui-portrait--${existing.voice === "soft" ? "whisper" : "keeper"}`}>
          <img src={existing.spriteUrl} alt={`The ghost ${existing.name}`} />
        </div>
        <p>{existing.name} already haunts this place.</p>
        <p className="ui-row">
          <button type="button" className="ui-button ui-button--primary" onClick={onChosen}>Keep {existing.name}</button>
          <button type="button" className="ui-button" onClick={() => setExisting(null)}>Make a different ghost</button>
        </p>
      </div>
    );
  }

  if (phase.k === "done") {
    return (
      <div className="ui-stack" data-creator>
        <div className={`ui-portrait ui-portrait--${phase.voice === "soft" ? "whisper" : "keeper"}`}>
          <img src={phase.spriteUrl} alt={`The ghost ${phase.name}`} />
        </div>
        <p className="ui-line ui-line--whisper"><span className="ui-line-who">{phase.name}</span><br />{MEET[phase.voice]}</p>
        {phase.fallback ? <p className="ui-note">This is a preset ghost, standing in for one of your own.</p> : null}
        <p><button type="button" className="ui-button ui-button--primary" onClick={onChosen}>Meet {phase.name}</button></p>
      </div>
    );
  }

  return (
    <div className="ui-stack" data-creator>
      <form className="ui-card ui-stack" onSubmit={(e) => { e.preventDefault(); void generate(); }}>
        {selectField("Era", "epoch", EPOCHS)}
        {selectField("Temperament", "temperament", TEMPERAMENTS)}
        {selectField("To this place", "relation", RELATIONS)}
        {selectField("Palette", "palette", PALETTES)}
        {selectField("Voice", "voice", VOICES)}
        <label className="ui-field">
          <span className="ui-field-label">Translucency {traits.translucency}%</span>
          <input className="ui-range" type="range" min={30} max={80} step={10} value={traits.translucency}
            onChange={(e) => set("translucency", Number(e.target.value) as Traits["translucency"])} />
        </label>
        <fieldset className="ui-stack ui-stack--tight">
          <legend className="ui-field-label">Accessories (up to two)</legend>
          {ACCESSORIES.map((a) => (
            <label key={a} className="ui-field ui-field--check">
              <input
                className="ui-check" type="checkbox" checked={traits.accessories.includes(a)}
                disabled={!traits.accessories.includes(a) && traits.accessories.length >= 2}
                onChange={(e) => set("accessories", e.target.checked ? [...traits.accessories, a] : traits.accessories.filter((x) => x !== a))}
              />
              <span className="ui-field-label">{a[0]!.toUpperCase() + a.slice(1)}</span>
            </label>
          ))}
        </fieldset>
        <label className="ui-field">
          <span className="ui-field-label">Who were they to this place?</span>
          <input className="ui-input" type="text" maxLength={DETAIL_MAX} value={detail} {...err("detail")}
            onChange={(e) => setDetail(e.target.value)} placeholder="Optional, one short line" />
        </label>
        <p className="ui-hint">{detail.length} / {DETAIL_MAX}</p>
        {note ? <p className="ui-note is-warn" role="alert">{note}</p> : null}
        <p className="ui-row">
          <button type="submit" className="ui-button ui-button--primary" disabled={phase.k === "generating" || phase.k === "cutting"}>
            {phase.k === "generating" ? "Calling the ghost…" : phase.k === "cutting" ? "Cutting out…" : "Generate"}
          </button>
          <button type="button" className="ui-button" onClick={() => setTraits(randomTraits(Date.now()))}>Randomise</button>
          <button type="button" className="ui-button" onClick={onChosen}>Use the default ghost</button>
        </p>
      </form>

      {phase.k === "candidates" ? (
        <div className="ui-stack" data-candidates>
          <p className="ui-hint">{phase.quotaLeft === null ? "Pick the face that fits." : `Pick the face that fits. Pictures left today: ${phase.quotaLeft}.`}</p>
          <div className="ui-row">
            {phase.candidates.map((c) => (
              <button key={c.candidateId} type="button" className="ui-button" onClick={() => void pick(c.candidateId)}>
                <img src={c.imageUrl} alt="A possible ghost" width={160} />
              </button>
            ))}
          </div>
          <p><button type="button" className="ui-button" onClick={() => void generate()}>Generate again (uses quota)</button></p>
        </div>
      ) : null}

      <div className="ui-stack ui-stack--tight" data-presets>
        <p className="ui-hint">Or take a ghost who is already made:</p>
        <div className="ui-row">
          {PRESET_PROFILES.map((p) => (
            <button key={p.id} type="button" className="ui-button" onClick={() => void pickPreset(p.id)}>
              <img src={p.spriteUrl} alt="" width={36} height={54} /> {p.persona.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function mountCreator({ container, worldId, onMessage }: CreatorSetup): CreatorHandle {
  const root = createRoot(container);
  root.render(<Creator worldId={worldId} onChosen={() => onMessage({ t: "chosen" })} />);
  let up = true;
  return {
    async dispose() {
      if (!up) return;
      up = false;
      root.unmount();
    },
  };
}
