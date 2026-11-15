import type { ScreenId } from "@hauntology/shared/app/types";
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import Confirm from "./Confirm";
import End from "./End";
import Expired from "./Expired";
import Gallery from "./Gallery";
import Haunt from "./Haunt";
import Home from "./Home";
import NotFound from "./NotFound";
import Shared from "./Shared";

/**
 * The Screen for each route. Play and Create are split into their own chunks with a dynamic
 * `import()`, so Home's first load does not carry the Viewer or the Sketch Pad (shell design,
 * "Performance"). The Case Screen is split off the same way: it loads the party Host page only when a case opens.
 */
type Screen = ComponentType | LazyExoticComponent<ComponentType>;

export const SCREENS: Record<ScreenId, Screen> = {
  home: Home,
  gallery: Gallery,
  create: lazy(() => import("./Create")),
  confirm: Confirm,
  haunt: Haunt,
  play: lazy(() => import("./Play")),
  case: lazy(() => import("./Case")),
  end: End,
  shared: Shared,
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
  play: "Wander",
  case: "Play a case",
  end: "The ending",
  shared: "A shared place",
  not_found: "Nothing here",
  expired: "That place is gone",
};
