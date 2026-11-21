/**
 * The seam between Haunt and the Ghost Creator (the `ghost-creator` spec, not built yet). The shell
 * hands a container to `mountCreator`, listens for `chosen` (checked with `parseCreatorMessage`), and
 * awaits `dispose()` before it unmounts the container. The real Creator and the stand-in both
 * implement it. The Creator keeps the profile it made with the API, under the world.
 */
export type CreatorSetup = {
  container: HTMLElement;
  worldId: string;
  onMessage: (message: unknown) => void;
};

export type CreatorHandle = { dispose(): Promise<void> };

export type CreatorModule = {
  mountCreator(setup: CreatorSetup): CreatorHandle | Promise<CreatorHandle>;
};

export type LoadCreator = () => Promise<CreatorModule>;

/** Loaded only when the visitor opens the Creator, so Haunt's first load does not carry it. */
export const defaultLoadCreator: LoadCreator = () => import("./creator-ui");
