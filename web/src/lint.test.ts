import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// The folder of `web/`, with a trailing slash (this file is `web/src/lint.test.ts`).
const cwd = decodeURIComponent(new URL("..", import.meta.url).pathname);
const eslint = new ESLint({ cwd });

/** The rule ids that fire on `code` when it sits at `filePath`. */
async function rulesFor(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${cwd}${filePath}` });
  return result!.messages.map((m) => m.ruleId ?? `parse error: ${m.message}`);
}

describe("lint rules for web/", () => {
  it("bans dangerouslySetInnerHTML", async () => {
    const code = 'export const A = ({ t }: { t: string }) => <div dangerouslySetInnerHTML={{ __html: t }} />;';
    expect(await rulesFor(code, "src/app/A.tsx")).toEqual(["no-restricted-syntax"]);
  });

  it("bans innerHTML, outerHTML, insertAdjacentHTML and document.write", async () => {
    const cases = [
      "el.innerHTML = text;",
      "el.outerHTML = text;",
      "el.insertAdjacentHTML('beforeend', text);",
      "document.write(text);",
      "document.writeln(text);",
      "export const read = el.innerHTML;",
    ];
    for (const body of cases) {
      const rules = await rulesFor(`export declare const el: HTMLElement; export declare const text: string;\n${body}`, "src/app/b.ts");
      expect(rules, body).toEqual(["no-restricted-syntax"]);
    }
  });

  it("bans every console method outside the logger", async () => {
    for (const m of ["log", "error", "warn", "info", "debug", "trace"]) {
      expect(await rulesFor(`console.${m}("x");`, "src/app/c.ts"), m).toEqual(["no-console"]);
    }
    expect(await rulesFor('console.log("x");', "src/screens/Home.tsx")).toEqual(["no-console"]);
  });

  it("lets the logger, and only the logger, use the console", async () => {
    expect(await rulesFor('console.error("x");', "src/app/logger.ts")).toEqual([]);
    expect(await rulesFor('console.error("x");', "src/app/logger2.ts")).toEqual(["no-console"]);
    expect(await rulesFor('console.error("x");', "src/other/logger.ts")).toEqual(["no-console"]);
  });

  it("allows user text through React text nodes and textContent", async () => {
    expect(await rulesFor("export const A = ({ t }: { t: string }) => <p>{t}</p>;", "src/app/A.tsx")).toEqual([]);
    expect(await rulesFor("export declare const el: HTMLElement; el.textContent = 'x';", "src/app/d.ts")).toEqual([]);
  });

  it("the real source of web/ passes", async () => {
    const results = await eslint.lintFiles(["src"]);
    const problems = results.flatMap((r) => r.messages.map((m) => `${r.filePath}:${m.line} ${m.ruleId}: ${m.message}`));
    expect(problems).toEqual([]);
    expect(results.length).toBeGreaterThan(5);
  });
});
