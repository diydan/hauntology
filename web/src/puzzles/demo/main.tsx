import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../styles/tokens.css";
// The shared look (design/): the two self-hosted fonts and the reusable ui- elements, as web/src/main.tsx loads them.
import "../../../../design/fonts.css";
import "../../../../design/elements.css";
import "./demo.css";
import { PersistedPuzzleDemo } from "../../device/PersistedPuzzleDemo";

// A development page for playing every Kind on a phone: `/puzzles-demo.html?kind=safe&level=easy&seed=3`.
// It is not part of the production build (the build has one entry, `index.html`).
const root = document.getElementById("root");
if (root !== null) createRoot(root).render(<StrictMode><PersistedPuzzleDemo search={location.search} /></StrictMode>);
