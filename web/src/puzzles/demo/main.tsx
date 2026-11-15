import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../styles/tokens.css";
import "./demo.css";
import { PuzzleDemo } from "./PuzzleDemo";

// A development page for playing every Kind on a phone: `/puzzles-demo.html?kind=safe&level=easy&seed=3`.
// It is not part of the production build (the build has one entry, `index.html`).
const root = document.getElementById("root");
if (root !== null) createRoot(root).render(<StrictMode><PuzzleDemo search={location.search} /></StrictMode>);
