import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { OVERDUE_LINE, STAGE_COPY, STAGE_STEPS, quotaLine, stageStep } from "@hauntology/shared/app/haunt-copy";
import type { HauntUi } from "./controller";
import { useShell } from "../context";
import { Link } from "../Link";

/**
 * The Stage display (Requirements 4.1, 4.4, 4.6, 4.7): the current Stage with its label, a list of
 * the steps with the current one marked and a `<progress>` that says the same in words, so it never
 * relies on a spinner alone. A failed place says why, whether the allowance came back, and offers the
 * Gallery and, only if the API says a retry is allowed, another go at the Confirm Gate.
 */
export function StagePanel({ ui }: { ui: HauntUi }) {
  const { router } = useShell();
  const stage = ui.stage;

  if (stage === null) {
    return (
      <section className="stage" aria-labelledby="stage-title" aria-busy="true">
        <h2 id="stage-title">Checking on your place</h2>
        <p>One moment.</p>
      </section>
    );
  }

  if (stage === "failed") {
    const copy = errorCopy(ui.failure?.code ?? "");
    return (
      <section className="stage stage-failed" aria-labelledby="stage-title">
        <h2 id="stage-title">{STAGE_COPY.failed.label}</h2>
        <p>{STAGE_COPY.failed.line}</p>
        <p>
          <strong>{copy.title}.</strong> {copy.body}
        </p>
        {ui.failure ? <p>{quotaLine(ui.failure.quotaReturned)}</p> : null}
        <p>
          <Link className="button" to={{ screen: "gallery" }}>
            Visit a gallery place
          </Link>{" "}
          {ui.failure?.retryAllowed ? (
            <button className="button" type="button" onClick={() => router.navigate({ screen: "confirm" })}>
              Try again
            </button>
          ) : null}
        </p>
      </section>
    );
  }

  const step = stageStep(stage) ?? 1;
  return (
    <section className="stage" aria-labelledby="stage-title">
      <h2 id="stage-title">{STAGE_COPY[stage].label}</h2>
      <p>{STAGE_COPY[stage].line}</p>
      <progress className="stage-bar" max={STAGE_STEPS.length} value={step} aria-label={`Step ${step} of ${STAGE_STEPS.length}: ${STAGE_COPY[stage].label}`} />
      <ol className="stage-steps" aria-label="Steps">
        {STAGE_STEPS.map((s, i) => (
          <li key={s} aria-current={i + 1 === step ? "step" : undefined} data-done={i + 1 < step ? "true" : undefined}>
            {STAGE_COPY[s].label}
          </li>
        ))}
      </ol>
      {ui.stale ? <p className="reason">We could not check just now. We will try again.</p> : null}
      {ui.overdue ? (
        <p className="reason" data-overdue>
          {OVERDUE_LINE}{" "}
          <Link className="button" to={{ screen: "gallery" }}>
            Visit a gallery place
          </Link>
        </p>
      ) : null}
    </section>
  );
}
