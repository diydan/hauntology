import type { GhostPreset } from "@hauntology/shared/app/api";
import { parseCreatorMessage } from "@hauntology/shared/app/events";
import { errorCopy } from "@hauntology/shared/app/errors-copy";
import type { ErrorCode } from "@hauntology/shared/errors";
import { useEffect, useRef, useState } from "react";
import { useRouterState, useShell } from "../context";
import { useAnnounce } from "../LiveRegion";
import { RetryButton } from "../RetryButton";
import type { CreatorHandle } from "./creator";

/**
 * The ghost choice on Haunt (Requirements 4.2, 5.2): the Ghost Creator, offered while the visitor
 * waits, and a "Use a preset ghost" action. Either one makes a ghost ready, which is what lets
 * Wander start (a case needs none). Nothing here starts a game, a Room or the Viewer.
 *
 * - The Creator loads only when it is opened, and keeps its profile with the API; the shell only
 *   learns that a ghost is chosen (`chosen`).
 * - The preset list is asked for when it is first opened. If it cannot be loaded, the Creator and a
 *   retry are still there: nothing is blocked.
 */
type Open = "none" | "presets" | "creator";

export function GhostChoice({ worldId }: { worldId: string }) {
  const { api, router, memory, platform } = useShell();
  const { flow } = useRouterState();
  const announce = useAnnounce();
  const [open, setOpen] = useState<Open>("none");
  const [presets, setPresets] = useState<{ status: "idle" } | { status: "loading" } | { status: "ready"; items: GhostPreset[] } | { status: "failed"; code: ErrorCode; retryAfterSec?: number }>({ status: "idle" });
  const [creatorNote, setCreatorNote] = useState<string | null>(null);
  const holder = useRef<HTMLDivElement>(null);

  const chosenName = memory.get().ghostName;

  const loadPresets = () => {
    setPresets({ status: "loading" });
    void api.ghostPresets().then((r) => {
      setPresets(r.ok ? { status: "ready", items: r.value.slice(0, 12) } : { status: "failed", code: r.code, ...(r.retryAfterSec === undefined ? {} : { retryAfterSec: r.retryAfterSec }) });
    });
  };

  const openPresets = () => {
    setOpen("presets");
    if (presets.status === "idle" || presets.status === "failed") loadPresets();
  };

  const pick = (g: GhostPreset) => {
    memory.set({ ghostPreset: g.id, ghostName: g.name, ghostSprite: g.spriteUrl });
    router.setFlow({ ghostReady: true });
    setOpen("none");
    announce(`${g.name} is your ghost.`);
  };

  // The Creator: loaded on open, unmounted (and awaited) on close or when this card goes away.
  useEffect(() => {
    if (open !== "creator") return;
    let handle: CreatorHandle | null = null;
    let live = true;
    setCreatorNote(null);
    void (async () => {
      try {
        const mod = await platform.loadCreator();
        if (!live || holder.current === null) return;
        const h = await mod.mountCreator({
          container: holder.current,
          worldId,
          onMessage: (m) => {
            if (parseCreatorMessage(m) === null || !live) return;
            memory.set({ ghostPreset: undefined, ghostName: undefined, ghostSprite: undefined });
            router.setFlow({ ghostReady: true });
            setOpen("none");
            announce("Your ghost is ready.");
          },
        });
        if (live) handle = h;
        else await h.dispose();
      } catch {
        if (live) {
          setCreatorNote("The Ghost Creator could not load. You can use a preset ghost instead.");
          setOpen("none");
        }
      }
    })();
    return () => {
      live = false;
      void handle?.dispose();
    };
  }, [open, platform, worldId, memory, router, announce]);

  const label = flow.ghostReady ? (chosenName ? `Your ghost: ${chosenName}.` : "Your ghost is ready.") : "No ghost chosen yet.";

  return (
    <section className="ghost-choice ui-stack" aria-labelledby="ghost-choice-title">
      <h2 className="ui-heading" id="ghost-choice-title">Your ghost</h2>
      <p data-ghost-state>{label}</p>
      <p className="ui-row">
        <button className="ui-button" type="button" aria-expanded={open === "creator"} onClick={() => setOpen(open === "creator" ? "none" : "creator")}>
          Make a ghost
        </button>{" "}
        <button className="ui-button" type="button" aria-expanded={open === "presets"} onClick={() => (open === "presets" ? setOpen("none") : openPresets())}>
          Use a preset ghost
        </button>
      </p>
      {creatorNote ? <p className="ui-note is-warn">{creatorNote}</p> : null}
      {open === "creator" ? <div ref={holder} className="creator-host" data-creator /> : null}
      {open === "presets" ? (
        <div className="preset-list ui-stack" data-presets>
          {presets.status === "loading" || presets.status === "idle" ? <p aria-busy="true">Fetching the ghosts…</p> : null}
          {presets.status === "failed" ? (
            <p className="ui-row">
              <span className="ui-note is-warn">{errorCopy(presets.code).title}. {errorCopy(presets.code).body}</span>{" "}
              <RetryButton retryAfterSec={presets.retryAfterSec} onRetry={loadPresets} />
            </p>
          ) : null}
          {presets.status === "ready" ? (
            <ul className="presets ui-row">
              {presets.items.map((g) => (
                <li key={g.id}>
                  <button className="ui-button preset" type="button" aria-pressed={memory.get().ghostPreset === g.id} onClick={() => pick(g)}>
                    <img src={g.spriteUrl} alt="" width={48} height={72} /> {g.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
