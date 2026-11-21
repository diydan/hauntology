/**
 * Selfie ghosts (party-mode 3.10 to 3.13), optional and off by default. Pure parts only: whether a selfie is allowed, how
 * good the frame is, and a holder that keeps the bytes for one call and then zeroes them. Nothing here changes a rule.
 */
export type SelfieSettings = Readonly<{ selfies: boolean }>;
export type SelfiePlayer = Readonly<{ selfieYes: boolean; selfieMade: boolean }>;

/** Only with the Master's switch on, the seat's own yes, and no selfie already made for that seat. */
export const selfieAllowed = (settings: SelfieSettings, player: SelfiePlayer): boolean => settings.selfies === true && player.selfieYes === true && player.selfieMade === false;

export type SelfieReport = Readonly<{
  faces: number;
  /** The face's share of the frame area, 0 to 1. */
  faceAreaShare: number;
  /** 0 is sharp, 1 is blurred. */
  blur: number;
  /** 0 is black, 1 is white. */
  brightness: number;
}>;
export type SelfieProblem = "no_face" | "many_faces" | "too_small" | "blurry" | "dark";
export type SelfieQuality = Readonly<{ ok: true }> | Readonly<{ ok: false; reason: SelfieProblem }>;
export const SELFIE_MIN_FACE_SHARE = 0.1;
export const SELFIE_MAX_BLUR = 0.6;
export const SELFIE_MIN_BRIGHTNESS = 0.2;

/** The first problem in a fixed order. A number that is not a number fails closed, with the reason it belongs to. */
export function selfieQuality(r: SelfieReport): SelfieQuality {
  if (!Number.isFinite(r.faces) || r.faces < 1) return { ok: false, reason: "no_face" };
  if (r.faces > 1) return { ok: false, reason: "many_faces" };
  if (!(r.faceAreaShare >= SELFIE_MIN_FACE_SHARE)) return { ok: false, reason: "too_small" };
  if (!(r.blur <= SELFIE_MAX_BLUR)) return { ok: false, reason: "blurry" };
  if (!(r.brightness >= SELFIE_MIN_BRIGHTNESS)) return { ok: false, reason: "dark" };
  return { ok: true };
}

export type TransientHolder = { ref: Uint8Array | null; clearCount: number };
export const SELFIE_TIMEOUT_MS = 30_000;

/**
 * Runs `use` over the selfie bytes, then zeroes the buffer and drops the reference exactly once, whether `use` returns,
 * throws or takes longer than `timeoutMs`. The bytes go nowhere else: no storage, log or event is passed to `use`.
 */
export async function withTransientSelfie<T>(bytes: Uint8Array, use: (selfie: Uint8Array) => Promise<T>, holder: TransientHolder = { ref: null, clearCount: 0 }, timeoutMs = SELFIE_TIMEOUT_MS): Promise<T> {
  holder.ref = bytes;
  let cleared = false;
  const clearOnce = (): void => {
    if (cleared) return;
    cleared = true;
    holder.ref?.fill(0);
    holder.ref = null;
    holder.clearCount += 1;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { clearOnce(); reject(new Error("selfie_timeout")); }, timeoutMs); });
    return await Promise.race([use(bytes), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    clearOnce();
  }
}
