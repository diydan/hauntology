import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { Kind } from "@hauntology/shared/puzzles/types";
import type { KindProps } from "./types";

/**
 * Every Kind screen, loaded only when its Lock opens: a phone that never meets a Torn photo never downloads it.
 * Each is a default export of its own file, so the bundler gives each its own small chunk.
 */
export const KIND_SCREENS: { readonly [K in Kind]: LazyExoticComponent<ComponentType<KindProps<K>>> } = {
  lockpick: lazy(() => import("./LockPick")),
  wires: lazy(() => import("./Wires")),
  clock: lazy(() => import("./Clock")),
  safe: lazy(() => import("./Safe")),
  musicbox: lazy(() => import("./MusicBox")),
  candles: lazy(() => import("./Candles")),
  moved: lazy(() => import("./Moved")),
  photo: lazy(() => import("./Photo")),
  words: lazy(() => import("./Words")),
  board: lazy(() => import("./Board")),
  maze: lazy(() => import("./Maze")),
};
