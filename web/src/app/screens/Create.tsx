import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { reasonCopy } from "@hauntology/shared/app/home-copy";
import { emptyHistory, type PadHistory } from "@hauntology/shared/app/sketch-pad";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useBoot, useShell } from "../context";
import { Candidates } from "../create/Candidates";
import { createCreateController } from "../create/controller";
import { PhotoPicker } from "../create/PhotoPicker";
import { SketchPad } from "../create/SketchPad";
import { Link } from "../Link";
import { useAnnounce } from "../LiveRegion";
import { capabilitiesOf } from "../QuotaStore";
import { ScreenHeading } from "../RouteFocus";
import { useRetryGate } from "../useRetryGate";

/**
 * Create (Requirements 2.1 to 2.8, 3.1): upload a photo, visit the Gallery, or draw. Upload and Gallery come
 * before the pad, so Tab reaches them without crossing its tools. Everything that can be refused
 * stays on this Screen with its typed message and the Gallery as the next step, and the sketch is kept: it
 * lives only in this component's memory. `CreateController` does the calls; nothing here is paid until
 * "Make it real", and no world is made before the Confirm Gate.
 */
export default function Create() {
  const { api, router, quota, memory } = useShell();
  const boot = useBoot();
  const announce = useAnnounce();
  const caps = capabilitiesOf(boot);
  const images = boot.status === "ready" ? boot.quota.image : 0;

  const [controller] = useState(() =>
    createCreateController({
      api,
      setQuota: (q) => quota.setQuota(q),
      setPicked: (imageId) => router.setFlow({ pickedImageId: imageId }),
      navigate: (route) => router.navigate(route),
    }),
  );
  const ui = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  const [history, setHistory] = useState<PadHistory>(emptyHistory);
  const [caption, setCaption] = useState("");
  const gate = useRetryGate();

  // A rate limit holds the buttons for the advised time; any error is said once in the live region.
  const said = useRef<unknown>(null);
  useEffect(() => {
    if (ui.error === null || said.current === ui.error) return;
    said.current = ui.error;
    const c = errorCopy(ui.error.code);
    announce(`${c.title}. ${c.body}`);
    if (ui.error.retryAfterSec !== undefined) gate.arm(ui.error.retryAfterSec);
  }, [ui.error, announce, gate]);

  const drawReason = caps !== null && !caps.canDraw && caps.reason !== undefined ? reasonCopy(caps.reason) : null;
  const photoReason = caps !== null && !caps.canUpload && caps.reason !== undefined ? reasonCopy(caps.reason) : null;
  const busy = ui.phase === "rendering" || ui.phase === "uploading" || ui.phase === "briefing";

  const make = (sketch: Blob, text: string) => {
    // A date suggested by a photo belongs to that photo: drawing instead drops it.
    memory.set({ suggestedDay: undefined });
    void controller.makeItReal(sketch, text);
  };

  return (
    <main className="screen ui-stack create">
      <ScreenHeading>Make a place</ScreenHeading>

      {ui.error !== null ? (
        <section className="create-error ui-notice ui-notice--danger ui-stack" aria-labelledby="create-error-title">
          <h2 className="ui-heading" id="create-error-title">{errorCopy(ui.error.code).title}</h2>
          <p>{errorCopy(ui.error.code).body}</p>
          <p className="ui-row">
            <Link className="ui-button" to={{ screen: "gallery" }}>
              Visit a gallery place
            </Link>{" "}
            <button className="ui-button" type="button" onClick={() => controller.clearError()}>
              Close this
            </button>
          </p>
        </section>
      ) : null}

      <PhotoPicker disabledReason={photoReason} busy={busy || !gate.enabled} onUse={(photo) => void controller.uploadPhoto(photo)} />

      <p className="gallery-link ui-row">
        No photo, and no wish to draw?{" "}
        <Link className="ui-button" to={{ screen: "gallery" }}>
          Visit a gallery place
        </Link>
      </p>

      {ui.candidates.length > 0 ? (
        <Candidates
          candidates={ui.candidates}
          caption={ui.caption}
          picturesLeft={images}
          busy={busy}
          onPick={(id) => void controller.pick(id)}
          onBack={() => controller.backToSketch()}
          onRedraw={() => {
            setHistory(emptyHistory);
            controller.backToSketch();
          }}
        />
      ) : (
        <SketchPad
          history={history}
          onHistory={setHistory}
          caption={caption}
          onCaption={setCaption}
          drawReason={drawReason}
          busy={busy}
          waitSeconds={gate.secondsLeft}
          onMake={make}
        />
      )}
    </main>
  );
}
