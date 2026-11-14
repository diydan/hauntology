// The parts of Vite's `import.meta.env` the shell reads. Vite's own `vite/client` types declare the
// same members, so the two merge when Vite is added.
interface ImportMetaEnv {
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly MODE: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
