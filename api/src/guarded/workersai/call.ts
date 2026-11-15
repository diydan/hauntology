/** The part of the Workers AI binding (`env.AI`) the guarded wrappers use. */
export interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

/** Why a call to the model or the image service gave nothing: it was busy or limiting (`rate_limited`), or anything else (`failed`). Neither is charged. */
export type CallFailure = "rate_limited" | "failed";

/** Rejects with a plain error when `promise` takes longer than `ms`; the timer never outlives the call. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** A failure whose message says the service is busy or limiting is `rate_limited`, so the caller may say "try again soon"; any other is `failed`. Only the message is read. */
export function failureKind(error: unknown): CallFailure {
  const message = error instanceof Error ? error.message : "";
  return /\b429\b|rate.?limit|too many|capacity|busy|overload/i.test(message) ? "rate_limited" : "failed";
}

/**
 * Whether an answer is to be charged: the call was made and the service answered, even if what it said cannot be used
 * (`unusable`). A call that failed, was refused or timed out (`failed`, `rate_limited`) is not charged and the Ticket is released.
 */
export const wasCharged = (answer: { ok: true } | { ok: false; kind: string }): boolean => answer.ok || answer.kind === "unusable";
