/** Records one word, at most `maxMs`, and returns the bytes and their type, or null when this phone cannot or the Player said no (party-mode 9.20). */
export type Recorder = (maxMs: number) => Promise<{ bytes: Uint8Array; contentType: string; durationMs: number } | null>;

/** The real recorder of a phone: the microphone for up to `maxMs`, asked for only when a Player taps Record. The stream is stopped the moment the word is done. */
export const browserRecorder: Recorder = async (maxMs) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const started = Date.now();
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
    rec.start();
    setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, maxMs);
    await done;
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: rec.mimeType });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), contentType: rec.mimeType || "audio/webm", durationMs: Math.min(maxMs, Date.now() - started) };
  } catch { return null; }
};
