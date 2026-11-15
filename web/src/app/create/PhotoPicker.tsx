import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { EXIF_HEAD_BYTES, JPEG_QUALITIES, PHOTO_MAX_BYTES, PHOTO_NOTICE, PHOTO_TYPES, PHOTO_UNREADABLE_LINE, photoDateLine, photoFileError, photoSizeError } from "@hauntology/shared/app/photo";
import { readCaptureDate } from "@hauntology/shared/conditions/exif";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useShell } from "../context";
import { useAnnounce } from "../LiveRegion";

/**
 * The photo picker (Requirements 2.6 and 12.2). The retention notice is on the page before any file is
 * chosen. A chosen file is checked in the browser (type, size, then its pixels), shown as a preview, and
 * sent nowhere until the visitor presses "Use this photo". Then it is re-encoded through a canvas, which
 * drops EXIF, GPS and XMP, and only that new picture goes to `onUse`.
 *
 * Before the re-encode, and only for a JPEG, it reads the capture date and time with `readCaptureDate`
 * (nothing else from the file) and offers it as a suggested Memory Day through `PlayMemory.suggestedDay`,
 * which the sky card on Haunt shows and the visitor can change or clear. A file with no date, or a
 * different file, takes the old suggestion away.
 */
export function PhotoPicker({ disabledReason, busy, onUse }: { disabledReason: string | null; busy: boolean; onUse: (photo: Blob) => void }) {
  const { memory, platform } = useShell();
  const kit = platform.photo;
  const announce = useAnnounce();
  const [chosen, setChosen] = useState<{ file: File; url: string; date: string | undefined } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  // The newest choice wins: an answer for an older file is dropped.
  const run = useRef(0);
  const url = useRef<string | null>(null);

  const release = () => {
    if (url.current !== null) kit.revokePreview(url.current);
    url.current = null;
  };
  useEffect(() => () => release(), []);

  const fail = (text: string) => {
    setProblem(text);
    announce(text);
  };
  const failCode = (code: string) => {
    const c = errorCopy(code);
    fail(`${c.title}. ${c.body}`);
  };

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const mine = ++run.current;
    release();
    setChosen(null);
    setProblem(null);
    memory.set({ suggestedDay: undefined });
    if (file === undefined) return;

    const fileError = photoFileError(file);
    if (fileError !== null) return failCode(fileError);

    setWorking(true);
    const size = await kit.inspect(file);
    if (mine !== run.current) return;
    if (size === null) {
      setWorking(false);
      return fail(PHOTO_UNREADABLE_LINE);
    }
    const sizeError = photoSizeError(size.width, size.height);
    if (sizeError !== null) {
      setWorking(false);
      return failCode(sizeError);
    }

    let date: string | undefined;
    if (file.type === "image/jpeg") {
      try {
        const found = readCaptureDate(await kit.head(file, EXIF_HEAD_BYTES), platform.now());
        if (mine !== run.current) return;
        if (found !== undefined) {
          memory.set({ suggestedDay: found });
          date = found.date;
        }
      } catch {
        // No date is no suggestion; the photo can still be used.
      }
    }
    const preview = kit.previewUrl(file);
    url.current = preview;
    setChosen({ file, url: preview, date });
    setWorking(false);
  };

  const use = async () => {
    // The button is off while a photo is being made or sent, so a second press cannot get here.
    if (chosen === null) return;
    setWorking(true);
    setProblem(null);
    // The re-encode makes a new picture from pixels alone. Try the best quality that fits the limit.
    let out: Blob | null = null;
    let tooBig = false;
    for (const q of JPEG_QUALITIES) {
      const attempt = await kit.reencode(chosen.file, q);
      if (attempt === null) break;
      if (attempt.size <= PHOTO_MAX_BYTES) {
        out = attempt;
        break;
      }
      tooBig = true;
    }
    setWorking(false);
    if (out === null) return failCode(tooBig ? "upload_too_large" : "upload_rejected");
    onUse(out);
  };

  const off = disabledReason !== null;
  return (
    <section className="photo-picker ui-stack" aria-labelledby="photo-title">
      <h2 className="ui-heading" id="photo-title">Upload a photo</h2>
      <p id="photo-notice">{PHOTO_NOTICE}</p>
      <p>
        <label className="ui-stack ui-stack--tight">
          Choose a photo
          <input className="ui-input" type="file" accept={PHOTO_TYPES.join(",")} disabled={off || busy} aria-describedby={off ? "photo-reason" : "photo-notice"} onChange={(e) => void choose(e)} />
        </label>
      </p>
      {off ? (
        <p id="photo-reason" className="ui-note is-warn">
          {disabledReason}
        </p>
      ) : null}
      {problem ? (
        <p className="ui-note is-warn" data-photo-problem>
          {problem}
        </p>
      ) : null}
      {working && chosen === null ? <p aria-busy="true">Looking at your photo…</p> : null}
      {chosen !== null ? (
        <div className="photo-chosen ui-stack">
          <figure className="ui-figure">
            <img className="photo-preview" src={chosen.url} alt="The photo you chose" />
          </figure>
          {chosen.date !== undefined ? <p data-photo-date>{photoDateLine(chosen.date)}</p> : null}
          <p>
            <button className="ui-button" type="button" disabled={busy || working} onClick={() => void use()}>
              {working || busy ? "Working…" : "Use this photo"}
            </button>
          </p>
        </div>
      ) : null}
    </section>
  );
}
