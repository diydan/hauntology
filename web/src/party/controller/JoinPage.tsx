import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ControllerPort } from "./controller-port";
import { CODE_HINT, CODE_LENGTH, NICKNAME_MAX, readJoin, refusalWords, typedCode } from "./join";

/**
 * The join page (party-mode 9.1, Requirements 1.2 and 1.3): a Room Code and a nickname, one Join button, and the Room's refusals in plain
 * words. A code that cannot be a code is told here and never sent. The nickname is cleaned before it is sent, as the Room cleans it, and the
 * box is limited to the length the Room keeps. The page decides nothing about the Room: it asks the port and shows the answer.
 */
export function JoinPage({ port, onSeated, initialCode = "" }: { port: ControllerPort; onSeated?: () => void; initialCode?: string }): ReactNode {
  const ids = { code: useId(), codeHint: useId(), name: useId(), nameHint: useId(), title: useId() };
  const [code, setCode] = useState(typedCode(initialCode));
  const [name, setName] = useState("");
  const [error, setError] = useState<{ title: string; body: string; badCode: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const codeBox = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (busyRef.current) return;
    const ask = readJoin(code, name);
    if (!ask.ok) {
      setError({ title: "That is not a Room Code", body: ask.words, badCode: true });
      codeBox.current?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await port.join(ask.code, ask.nickname);
      if (res.ok) onSeated?.();
      else {
        setError({ ...refusalWords(res.code), badCode: res.code === "room_unknown" });
        if (res.code === "room_unknown") codeBox.current?.focus();
      }
    } catch {
      setError({ ...refusalWords("unreachable"), badCode: false });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <main className="pc-join ui-stack" aria-labelledby={ids.title}>
      <h1 className="ui-heading" id={ids.title}>Join a game</h1>
      <p className="ui-hint">Type the code on the big screen, and a name the others will see.</p>
      <form className="ui-stack" onSubmit={(e) => void submit(e)} noValidate aria-busy={busy}>
        <div>
          <div className="ui-field">
            <label className="ui-field-label" htmlFor={ids.code}>Room Code</label>
            <input
              ref={codeBox} id={ids.code} className="ui-input pc-code" value={code} onChange={(e) => setCode(typedCode(e.target.value))}
              type="text" inputMode="text" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="next"
              maxLength={CODE_LENGTH + 5} aria-invalid={error?.badCode === true} aria-describedby={ids.codeHint}
            />
          </div>
          <p className="ui-hint" id={ids.codeHint}>{CODE_HINT}</p>
        </div>
        <div>
          <div className="ui-field">
            <label className="ui-field-label" htmlFor={ids.name}>Name</label>
            <input
              id={ids.name} className="ui-input" value={name} onChange={(e) => setName(e.target.value)} type="text" autoComplete="nickname"
              autoCapitalize="words" autoCorrect="off" spellCheck={false} enterKeyHint="go" maxLength={NICKNAME_MAX} aria-describedby={ids.nameHint}
            />
          </div>
          <p className="ui-hint" id={ids.nameHint}>Up to {NICKNAME_MAX} letters. Left empty, you are Player.</p>
        </div>
        <div className="pc-answer" aria-live="polite">
          {error ? <p className="ui-notice ui-notice--danger"><b>{error.title}.</b> {error.body}</p> : null}
        </div>
        <button type="submit" className="ui-button ui-button--primary ui-button--block ui-button--main pc-big" aria-disabled={busy}>{busy ? "Joining…" : "Join"}</button>
      </form>
    </main>
  );
}
