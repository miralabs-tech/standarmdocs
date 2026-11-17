/**
 * What `mdocs build` emits for a site with `locales: ["en", "fr"]` under `/docs/`.
 *
 * Built once for the unit project by `tests/setup/build-fixture.ts`, from a fixture
 * whose English side has two pages and whose French side has the first of them.
 * The error paths are spawned under Bun from a scratch folder, for the reason
 * `base-build.test.ts` gives.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const fixture = fileURLToPath(new URL("../fixtures/locales", import.meta.url));
const site = fileURLToPath(new URL("../fixtures/site", import.meta.url));
const dist = join(fixture, "dist");
const buildModule = pathToFileURL(fileURLToPath(new URL("../../src/cli/build.ts", import.meta.url))).href;
const devConfigModule = pathToFileURL(
  fileURLToPath(new URL("../../src/cli/dev-config.ts", import.meta.url)),
).href;

function read(file: string): string {
  return readFileSync(join(dist, file), "utf8");
}

describe("the routes", () => {
  it("writes the pages of each locale under its own prefix", () => {
    for (const route of ["en/guide/a", "en/guide/b", "fr/guide/a"]) {
      expect(existsSync(join(dist, route, "index.html")), route).toBe(true);
      expect(existsSync(join(dist, route, "index.md")), route).toBe(true);
    }
    expect(existsSync(join(dist, "fr", "guide", "b"))).toBe(false);
  });

  it("generates a home for each locale", () => {
    expect(read("en/index.html")).toContain("mira-docs__home");
    expect(read("fr/index.html")).toContain("mira-docs__home");
  });

  it("lists the pages of a locale and only those on its home and in its sidebar", () => {
    const home = read("fr/index.html");
    expect(home).toContain('href="/docs/fr/guide/a"');
    expect(home).not.toContain("/guide/b");
    expect(home).not.toContain("/docs/en/guide");
    expect(read("fr/guide/a/index.html")).not.toContain("/guide/b");
    expect(read("en/guide/a/index.html")).toContain('href="/docs/en/guide/b"');
  });
});

describe("the top of the site", () => {
  it("redirects to the first locale", () => {
    const html = read("index.html");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=/docs/en/" />');
    expect(html).toContain('<link rel="canonical" href="/docs/en/" />');
    expect(html).toContain('<a href="/docs/en/">');
  });

  it("writes llms.txt and llms-full.txt of the first locale", () => {
    expect(read("llms.txt")).toBe(read("en/llms.txt"));
    expect(read("llms-full.txt")).toBe(read("en/llms-full.txt"));
  });
});

describe("the language of a page", () => {
  it("is on <html>", () => {
    expect(read("en/guide/a/index.html")).toContain('<html lang="en" data-mdocs-base="/docs/">');
    expect(read("fr/guide/a/index.html")).toContain('<html lang="fr" data-mdocs-base="/docs/">');
    expect(read("fr/index.html")).toContain('<html lang="fr" data-mdocs-base="/docs/">');
  });

  it("selects the French labels on a French page", () => {
    const html = read("fr/guide/a/index.html");
    expect(html).toContain("Sur cette page");
    expect(html).toContain('aria-label="Langue"');
    expect(html).toContain('aria-label="Thème"');
    expect(html).not.toContain("On this page");
  });

  it("keeps the English labels on an English page", () => {
    const html = read("en/guide/a/index.html");
    expect(html).toContain("On this page");
    expect(html).toContain('aria-label="Language"');
    expect(html).toContain("See also");
  });
});

describe("the language switcher", () => {
  it("points at the same page in the other locale when it exists", () => {
    const html = read("en/guide/a/index.html");
    expect(html).toMatch(/<a href="\/docs\/fr\/guide\/a" hrefLang="fr" lang="fr">Français<\/a>/i);
    expect(html).toMatch(/<a href="\/docs\/en\/guide\/a" hrefLang="en" lang="en" aria-current="page">English<\/a>/i);
  });

  it("falls back to the home of the other locale when it does not", () => {
    expect(read("en/guide/b/index.html")).toMatch(
      /<a href="\/docs\/fr\/" hrefLang="fr" lang="fr">Français<\/a>/i,
    );
  });

  it("points a French page at the English one", () => {
    expect(read("fr/guide/a/index.html")).toMatch(/<a href="\/docs\/en\/guide\/a" hrefLang="en"/i);
  });
});

describe("the alternates", () => {
  it("name each existing translation in the head", () => {
    const html = read("en/guide/a/index.html");
    expect(html).toContain('<link rel="alternate" hreflang="en" href="/docs/en/guide/a" />');
    expect(html).toContain('<link rel="alternate" hreflang="fr" href="/docs/fr/guide/a" />');
  });

  it("leave out a page that has no translation", () => {
    expect(read("en/guide/b/index.html")).not.toContain('rel="alternate"');
  });
});

describe("llms.txt of a locale", () => {
  it("links only the pages of that locale", () => {
    const fr = read("fr/llms.txt");
    expect(fr).toContain("(/docs/fr/guide/a/index.md)");
    expect(fr).not.toContain("/docs/en/");
    expect(fr).not.toContain("guide/b");
    expect(read("fr/llms-full.txt")).not.toContain("guide/b");
    expect(read("en/llms.txt")).toContain("(/docs/en/guide/b/index.md)");
  });
});

describe("the category of a locale", () => {
  it("takes the label of that locale in the sidebar, the home and llms.txt", () => {
    for (const file of ["fr/guide/a/index.html", "fr/index.html"]) {
      expect(read(file), file).toContain("Guide d&#x27;utilisation");
    }
    expect(read("fr/llms.txt")).toContain("## Guide d'utilisation");
  });

  it("keeps the default label in the other locale", () => {
    expect(read("en/guide/a/index.html")).not.toContain("Guide d");
    expect(read("en/index.html")).not.toContain("Guide d");
    expect(read("en/llms.txt")).toContain("## Guide\n");
  });
});

describe("the generated Markdown of a locale", () => {
  it("ends a French page on Voir aussi", () => {
    const text = read("fr/guide/a/index.md");
    expect(text).toContain("## Voir aussi\n\n- [Gamma en français](/docs/fr/guide/c/index.md)");
    expect(text).not.toContain("See also");
  });

  it("ends an English page on See also", () => {
    expect(read("en/guide/a/index.md")).toContain("## See also");
  });
});

describe("a site with locales that cannot be built", () => {
  let scratch = "";

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), "mdocs-locales-"));
    mkdirSync(join(scratch, "notes", "en"), { recursive: true });
    mkdirSync(join(scratch, "work", "api"), { recursive: true });
    writeFileSync(join(scratch, "notes", "en", "index.md"), "# Home\n");
    writeFileSync(
      join(scratch, "build.ts"),
      `
import { join } from "node:path";
const [scratch, locales] = process.argv.slice(2);
const { build } = await import(${JSON.stringify(buildModule)});
const { prepareGeneratedRoot } = await import(${JSON.stringify(devConfigModule)});
const work = join(scratch, "work");
prepareGeneratedRoot(work);
await build(
  {
    root: work,
    contentDir: join(scratch, "notes"),
    demosDir: join(work, "demos"),
    apiDir: join(work, "api"),
    outDir: join(scratch, "out"),
    categories: [],
    locales: JSON.parse(locales),
  },
  { chrome: "static", mode: "production" },
);
`,
    );
    writeFileSync(
      join(scratch, "dev.ts"),
      `
import { planDev } from ${JSON.stringify(devConfigModule)};
await planDev(process.argv[2], "notes");
`,
    );
    writeFileSync(
      join(scratch, "mdocs.config.ts"),
      `export default { contentDir: "notes", demosDir: "demos", apiDir: "api", categories: [], locales: ["en"] };\n`,
    );
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  function built(locales: readonly string[]): { status: number | null; stderr: string } {
    const result = spawnSync("bun", [join(scratch, "build.ts"), scratch, JSON.stringify(locales)], {
      cwd: site,
      encoding: "utf8",
    });
    return { status: result.status, stderr: result.stderr };
  }

  it("refuses a locale with no folder, naming it", () => {
    const result = built(["en", "de"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('locale "de" has no content folder');
  }, 60_000);

  it("refuses a malformed, a repeated and an empty list", () => {
    expect(built(["EN"]).stderr).toContain('locale "EN" is not a language code');
    expect(built(["en", "en"]).stderr).toContain('locale "en" is listed twice');
    expect(built([]).stderr).toContain("locales is empty");
  }, 60_000);

  it("builds a single locale", () => {
    expect(built(["en"]).status).toBe(0);
    expect(existsSync(join(scratch, "out", "en", "index.html"))).toBe(true);
    expect(readFileSync(join(scratch, "out", "index.html"), "utf8")).toContain('url=/en/"');
  }, 60_000);

  it("refuses --root together with locales in mdocs dev", () => {
    const result = spawnSync("bun", [join(scratch, "dev.ts"), scratch], { cwd: site, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--root cannot be combined with `locales`");
  }, 60_000);
});
