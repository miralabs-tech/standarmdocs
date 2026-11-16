/**
 * What a build ships for the `ask` fences when no UI package resolves.
 *
 * Spawned under Bun, because `Bun.build` exists only there. The build runs from a
 * made-up root in a scratch folder, the shape `mdocs dev --root` gives a folder of
 * plain markdown, with the cwd on that folder too, so nothing resolves beside the
 * kit and the questions stay static.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const buildModule = pathToFileURL(fileURLToPath(new URL("../../src/cli/build.ts", import.meta.url))).href;
const devConfigModule = pathToFileURL(
  fileURLToPath(new URL("../../src/cli/dev-config.ts", import.meta.url)),
).href;

const NOTES = ["# Plan", "", "```ask id=store", "kind: choice", "question: Which store?", "options:", "  - sqlite", "  - files", "```", ""].join("\n");

const SCRIPT = `
import { join } from "node:path";
const [scratch, out, asks, notes = "notes"] = process.argv.slice(2);
const { build } = await import(${JSON.stringify(buildModule)});
const { prepareGeneratedRoot } = await import(${JSON.stringify(devConfigModule)});
const work = join(scratch, "work");
prepareGeneratedRoot(work);
await build(
  {
    root: work,
    contentDir: join(scratch, notes),
    demosDir: join(work, "demos"),
    apiDir: join(work, "api"),
    outDir: out,
    siteName: "notes",
    categories: [],
  },
  { chrome: "live", mode: "production", asks },
);
`;

let scratch = "";

function buildInto(
  name: string,
  asks: "static" | "island",
  notes = "notes",
): { html: string; scripts: string; assets: string[] } {
  const out = join(scratch, name);
  execFileSync("bun", [join(scratch, "build.ts"), scratch, out, asks, notes], {
    cwd: scratch,
    stdio: "pipe",
  });
  const assets = readdirSync(join(out, "assets"));
  return {
    html: readFileSync(join(out, "index.html"), "utf8"),
    scripts: assets
      .filter((file) => file.endsWith(".js"))
      .map((file) => readFileSync(join(out, "assets", file), "utf8"))
      .join("\n"),
    assets,
  };
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "mdocs-ask-island-"));
  mkdirSync(join(scratch, "notes"));
  writeFileSync(join(scratch, "notes", "index.md"), NOTES);
  mkdirSync(join(scratch, "bare"));
  writeFileSync(join(scratch, "bare", "plan.md"), NOTES);
  writeFileSync(join(scratch, "build.ts"), SCRIPT);
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("a build that keeps the questions static", () => {
  it("ships the static question and nothing of the island", () => {
    const { html, scripts, assets } = buildInto("plain", "static");

    expect(html).toContain('data-ask-id="store"');
    expect(html).not.toContain("data-mira-ask");
    expect(html).not.toContain("__MDOCS_WRITE__");
    expect(scripts).not.toContain("data-mira-ask");
    expect(scripts).not.toContain("__MDOCS_WRITE__");
    expect(assets).not.toContain("ask.css");
  }, 120_000);
});

describe("the banner of a live build with no UI package", () => {
  it("says the package is not installed", () => {
    const { html } = buildInto("banner-missing", "static");
    expect(html).toContain("mira-docs__banner");
    expect(html).toMatch(/is not installed\./);
  }, 120_000);
});

describe("a folder with no index.md", () => {
  it("gets a generated front page that links every page by title", () => {
    const { html } = buildInto("home", "static", "bare");
    expect(html).toContain('<main class="mira-docs__main">');
    expect(html).toContain('class="mira-docs__card" href="/plan"');
    expect(html).not.toContain("mdocs-home");
  }, 120_000);
});
