import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { routeForApiError } from "@hauntology/shared/app/routes";
import { useEffect, useState } from "react";
import { useGallery, useShell } from "../context";
import { Dialog } from "../Dialog";
import { useAnnounce } from "../LiveRegion";

/**
 * "Delete my place" (Requirements 3.8 and 7.6), on Haunt, Play and the Ending, for the visitor's own
 * place only. It asks first, in an accessible dialog (never `confirm()`), then calls the delete
 * route. On success it leaves for Home through `leave` (the Play screen passes a way that releases the
 * Viewer first), and only then forgets the place: the world, the picked image, the ghost, the sky and
 * the play session, all in memory. A world that is already gone, or a Session that ended, is the
 * Expired Screen; any other failure says why and leaves the dialog open.
 *
 * A Gallery world is not the visitor's to delete, so the action is not shown for one. The Shell tells
 * them apart by the public Gallery list (a world that is not in it is the visitor's own), and shows
 * nothing until it knows.
 */
export function DeletePlace({ worldId, leave }: { worldId: string; leave: () => Promise<void> | void }) {
  const { api, router, memory, gallery } = useShell();
  const list = useGallery();
  const announce = useAnnounce();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void gallery.load();
  }, [gallery]);

  if (list.status !== "ready" || list.items.some((g) => g.id === worldId)) return null;

  const forget = () => {
    memory.clear();
    router.clearPlace();
  };

  const confirm = async () => {
    setBusy(true);
    setProblem(null);
    const r = await api.deleteWorld(worldId);
    if (r.ok) {
      setAsking(false);
      await leave();
      forget();
      announce("Your place was deleted.");
      return;
    }
    const gone = routeForApiError(r.code);
    if (gone !== null) {
      setAsking(false);
      forget();
      router.navigate(gone);
      return;
    }
    const c = errorCopy(r.code);
    setProblem(`${c.title}. ${c.body}`);
    setBusy(false);
  };

  return (
    <>
      <p>
        <button className="button" type="button" onClick={() => setAsking(true)}>
          Delete my place
        </button>
      </p>
      {asking ? (
        <Dialog title="Delete this place?" closeLabel="Keep it" onClose={() => (busy ? undefined : setAsking(false))}>
          <p>This removes your place, its ghost and your game right now. It cannot be undone.</p>
          {problem ? <p className="reason">{problem}</p> : null}
          <p>
            <button className="button" type="button" disabled={busy} onClick={() => void confirm()}>
              {busy ? "Deleting…" : "Delete my place"}
            </button>
          </p>
        </Dialog>
      ) : null}
    </>
  );
}
