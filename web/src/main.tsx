import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createApiClient } from "./app/ApiClient";
import { wantsDebug } from "./app/DebugOverlay";
import { createDebugStore } from "./app/debugStore";
import { loadDemoApi, loadDemoPlatform } from "./app/demo";
import { createQuotaStore } from "./app/QuotaStore";
import { createRouter } from "./app/router";
import "./styles/tokens.css";
// The shared look (design/): the two self-hosted fonts and the reusable ui-* elements. New screens are built from these (steering/design-system.md).
import "../../design/fonts.css";
import "../../design/elements.css";
import "./styles/app.css";

async function main(): Promise<void> {
  const root = document.getElementById("root");
  if (root === null) return;
  // `?demo=1` gives the fake API on a development build; a production build always gets the real one.
  const api = (await loadDemoApi(location.search)) ?? createApiClient();
  const demoPlatform = await loadDemoPlatform(location.search);
  createRoot(root).render(
    <StrictMode>
      <App api={api} router={createRouter()} quota={createQuotaStore(api)} debugStore={createDebugStore()} debug={wantsDebug(location.search)} {...(demoPlatform ? { platform: demoPlatform } : {})} />
    </StrictMode>,
  );
}

void main();
