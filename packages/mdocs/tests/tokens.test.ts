/**
 * Every `--docs-*` this sheet spends must be a name it defines itself, and it
 * spends nothing else.
 *
 * `docs.css` once spent `--mira-color-focus-ring` in its three `:focus-visible`
 * rules, and the library has no such token — it is `--mira-focus-ring-color`.
 * None of the names carried a fallback, so an invalid one took the whole
 * `outline` shorthand down with it at computed-value time: the ring resolved to
 * `outline-style: none` and never painted, on all forty-one pages, with no error
 * anywhere. A typo in a custom property is silent by construction — a stylesheet
 * that names nothing is indistinguishable from one that names something absent —
 * so only a test can say it.
 *
 * The sheet now owns its vocabulary: it spends `--docs-*` and defines a default
 * for each, and the theme package is the one place that points those names at
 * the library. So the guard moved with the risk. Here, a name spent and not
 * defined is the typo; the library's side of the mapping is checked in the theme
 * package, against the sheet the library actually ships.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const docsCss = join(here, "../src/styles/docs.css");

function read(file: string, what: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    throw new Error(`${what} not readable at ${file}`);
  }
}

/** Comments name tokens in prose, and a prose mention is neither a use nor a definition. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

/** `--name:` is a definition; `var(--name)` is a use. Neither shape matches the other. */
function definitions(css: string, prefix: string): Set<string> {
  const pattern = new RegExp(`(--${prefix}-[a-zA-Z0-9-]+)\\s*:`, "g");
  return new Set([...css.matchAll(pattern)].map((m) => m[1] as string));
}

function uses(
  css: string,
  prefix: string,
): { name: string; fallback: boolean; line: number }[] {
  const pattern = new RegExp(`var\\(\\s*(--${prefix}-[a-zA-Z0-9-]+)\\s*([,)])`, "g");
  return css.split("\n").flatMap((text, index) =>
    [...text.matchAll(pattern)].map((m) => ({
      name: m[1] as string,
      fallback: m[2] === ",",
      line: index + 1,
    })),
  );
}

describe("the tokens docs.css spends", () => {
  const sheet = withoutComments(read(docsCss, "docs.css"));
  const defined = definitions(sheet, "docs");
  const spent = uses(sheet, "docs");

  it("is not an empty check", () => {
    // A regex that silently stops matching would make every assertion below pass.
    expect(spent.length).toBeGreaterThan(0);
    expect(defined.size).toBeGreaterThan(0);
  });

  it("spends no library token", () => {
    expect(uses(sheet, "mira")).toEqual([]);
  });

  it("defines no library token, so the theme package is the only place that names one", () => {
    expect([...definitions(sheet, "mira")]).toEqual([]);
  });

  it("defines every --docs-* it spends", () => {
    const orphans = spent
      .filter((use) => !defined.has(use.name))
      .map((use) => `${use.name} (docs.css:${use.line})`);
    expect(orphans).toEqual([]);
  });

  it("carries no fallback, which is why an orphan is fatal rather than degraded", () => {
    // Documents the blast radius: change this and the assertion above stops being
    // about a blank page and starts being about a wrong colour.
    expect(spent.filter((use) => use.fallback)).toEqual([]);
  });
});
