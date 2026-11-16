import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../../styles/tokens.css";
// The shared look (design/): the two self-hosted fonts and the reusable ui- elements, as web/src/main.tsx loads them.
import "../../../../../design/fonts.css";
import "../../../../../design/elements.css";
import "./demo.css";
import { Controller } from "../Controller";
import { StandInPort } from "../standin-port";
import { DevBar } from "./DevBar";

// A development page for the phone Controller with a scripted Room: `/controller-demo.html?code=K7M2`. It is not part of the production build
// (the build has one entry, `index.html`). The Player's choices on this page are kept on this phone, as on the real Controller.
const root = document.getElementById("root");
const port = new StandInPort();
const code = new URLSearchParams(location.search).get("code") ?? "";
if (root !== null) createRoot(root).render(<StrictMode><Controller port={port} initialCode={code} /><DevBar port={port} /></StrictMode>);
