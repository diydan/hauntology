import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Lint rules for `web/` (Requirement 9). Two are about privacy and safety:
 *
 * - No `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML` or
 *   `document.write`: user text is shown only through React text nodes.
 * - No `console.*` outside `src/app/logger.ts`, which writes only an error code and a Screen id.
 */

const NO_HTML_STRINGS = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: "Never insert HTML. Show user text as a React text node.",
  },
  {
    selector: "MemberExpression[property.name=/^(innerHTML|outerHTML|insertAdjacentHTML)$/]",
    message: "Never insert HTML. Show user text as a text node.",
  },
  {
    selector: "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
    message: "document.write is banned.",
  },
];

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-console": "error",
      "no-restricted-syntax": ["error", ...NO_HTML_STRINGS],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // The one place that may write to the console.
    files: ["src/app/logger.ts"],
    rules: { "no-console": "off" },
  },
);
