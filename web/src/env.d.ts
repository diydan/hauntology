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

// Vite's `?raw` import, used by the style tests.
declare module "*.css?raw" {
  const css: string;
  export default css;
}
