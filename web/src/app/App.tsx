import { errorCopy } from "@hauntology/shared/app/errors-copy";
import type { ShellApi } from "@hauntology/shared/app/api";
import { pathFor } from "@hauntology/shared/app/routes";
import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { runBoot } from "./boot";
import { ShellContext, useBoot, useRouterState, useShell, type ShellContextValue } from "./context";
import { DebugOverlay } from "./DebugOverlay";
import { createGalleryStore } from "./GalleryStore";
import { defaultPlatform, type PlatformKit } from "./platform";
import { createPlayMemory, type PlayMemoryStore } from "./play/memory";
import { ScreenBoundary } from "./ErrorBoundary";
import { LiveRegionProvider, useAnnounce } from "./LiveRegion";
import { OfflineBanner } from "./OfflineBanner";
import type { QuotaStore } from "./QuotaStore";
import { FocusProvider } from "./RouteFocus";
import type { Router } from "./router";
import type { DebugStore } from "./debugStore";
import { SCREENS, SCREEN_TITLES } from "./screens";
import { RetryButton } from "./RetryButton";

export type AppProps = {
  api: ShellApi;
  router: Router;
  quota: QuotaStore;
  debugStore: DebugStore;
  /** Show the debug overlay (`?debug=1`). */
  debug?: boolean;
  /** Replaces parts of the browser kit (tests, the demo). */
  platform?: Partial<PlatformKit>;
  /** What the visit remembers between Screens. Tests start it with something in it; the app leaves it empty. */
  memory?: PlayMemoryStore;
};

export function App({ api, router, quota, debugStore, debug = false, platform, memory: given }: AppProps) {
  const gallery = useMemo(() => createGalleryStore(api), [api]);
  const memory = useMemo(() => given ?? createPlayMemory(), [given]);
  const kit = useMemo<PlatformKit>(() => ({ ...defaultPlatform(), ...platform }), [platform]);
  const value = useMemo<ShellContextValue>(
    () => ({ api, router, quota, debug: debugStore, gallery, memory, platform: kit }),
    [api, router, quota, debugStore, gallery, memory, kit],
  );
  return (
    <ShellContext.Provider value={value}>
      <LiveRegionProvider>
        <Gate showDebug={debug} />
      </LiveRegionProvider>
    </ShellContext.Provider>
  );
}

/** Loads the boot data and the resume facts once, then hands over to the Shell. */
function Gate({ showDebug }: { showDebug: boolean }) {
  const { api, router, quota } = useShell();
  const boot = useBoot();
  const route = useRouterState();

  const proceed = useCallback((isCurrent: () => boolean) => runBoot({ api, router, quota }, isCurrent), [api, router, quota]);

  useEffect(() => {
    let current = true;
    void proceed(() => current);
    return () => {
      current = false;
    };
  }, [proceed]);

  if (boot.status === "failed") return <BootFailure code={boot.code} retryAfterSec={boot.retryAfterSec} onRetry={() => void quota.retry().then(() => proceed(() => true))} />;
  if (boot.status !== "ready" || !route.ready) {
    return (
      <main className="screen ui-stack" aria-busy="true">
        <p>Loading…</p>
      </main>
    );
  }
  return <Shell showDebug={showDebug} />;
}

function BootFailure({ code, retryAfterSec, onRetry }: { code: string; retryAfterSec: number | undefined; onRetry: () => void }) {
  const copy = errorCopy(code);
  return (
    <main className="screen ui-stack">
      <h1 className="ui-heading">{copy.title}</h1>
      <p>{copy.body}</p>
      <p>
        Code: <code>{code}</code>
      </p>
      <p>
        <RetryButton retryAfterSec={retryAfterSec} onRetry={onRetry} />
      </p>
    </main>
  );
}

function Shell({ showDebug }: { showDebug: boolean }) {
  const route = useRouterState().route;
  const announce = useAnnounce();
  // False for the first page load and true after it: a heading that mounts later takes focus.
  const focusOnMount = useRef(false);
  const lastPath = useRef<string | null>(null);
  const path = pathFor(route);
  const title = SCREEN_TITLES[route.screen];

  useEffect(() => {
    document.title = `${title} · Hauntology`;
    if (lastPath.current !== null && lastPath.current !== path) announce(title);
    lastPath.current = path;
  }, [path, title, announce]);

  useEffect(() => {
    focusOnMount.current = true;
  }, []);

  const Screen = SCREENS[route.screen];
  return (
    <FocusProvider value={focusOnMount}>
      <OfflineBanner />
      <ScreenBoundary key={path} screenId={route.screen}>
        <Suspense fallback={<main className="screen ui-stack" aria-busy="true"><p>Loading…</p></main>}>
          <Screen />
        </Suspense>
      </ScreenBoundary>
      {showDebug ? <DebugOverlay /> : null}
    </FocusProvider>
  );
}
