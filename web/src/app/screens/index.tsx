import type { ScreenId } from "@hauntology/shared/app/types";
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import Confirm from "./Confirm";
import End from "./End";
import Expired from "./Expired";
import Gallery from "./Gallery";
import Haunt from "./Haunt";
import Home from "./Home";
import NotFound from "./NotFound";

/**
 * The Screen for each route. Play and Create are split into their own chunks with a dynamic
 * `import()`, so Home's first load does not carry the Viewer or the Sketch Pad (shell design,
 * "Performance"). Their files are stand-ins until tasks 6.1 and 7.1.
 */
type Screen = ComponentType | LazyExoticComponent<ComponentType>;

export const SCREENS: Record<ScreenId, Screen> = {
  home: Home,
  gallery: Gallery,
  create: lazy(() => import("./Create")),
  confirm: Confirm,
  haunt: Haunt,
  play: lazy(() => import("./Play")),
  end: End,
  not_found: NotFound,
  expired: Expired,
};

/** The heading text of each Screen, for the page title and the announcement on a route change. */
export const SCREEN_TITLES: Record<ScreenId, string> = {
  home: "Home",
  gallery: "Gallery",
  create: "Make a place",
  confirm: "Confirm",
  haunt: "Your place",
  play: "Play",
  end: "The ending",
  not_found: "Nothing here",
  expired: "That place is gone",
};
