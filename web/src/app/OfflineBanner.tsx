import { useEffect, useRef } from "react";
import { useAnnounce } from "./LiveRegion";
import { useOnline } from "./useOnline";

/**
 * Says so when the network is gone, and clears when it is back (Requirement 7.4). Nothing the
 * visitor has done is lost: the Screen keeps its state, and reads are retried by the API client.
 */
export const OFFLINE_TEXT = "You are offline. What you have done is kept here. We will try again when the network is back.";

export function OfflineBanner() {
  const online = useOnline();
  const announce = useAnnounce();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (online) return;
    }
    announce(online ? "You are back online." : OFFLINE_TEXT);
  }, [online, announce]);

  if (online) return null;
  return (
    <p className="banner" data-offline-banner>
      {OFFLINE_TEXT}
    </p>
  );
}
