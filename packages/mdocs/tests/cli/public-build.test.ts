/**
 * What `mdocs build` publishes from a small site, and what it refuses to.
 *
 * Spawned under Bun, because `Bun.build` exists only there. The build runs from a
 * made-up root in a scratch folder with the cwd on the engine's fixture site, so
 * nothing is written into it. The
 * refusal is asserted on the real `mdocs` entry, since an exit code is a property
 * of the process and not of the function.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const site = fileURLToPath(new URL("../fixtures/site", import.meta.url));
const mdocs = fileURLToPath(new URL("../../src/cli/mdocs.ts", import.meta.url));
const buildModule = pathToFileURL(fileURLToPath(new URL("../../src/cli/build.ts", import.meta.url))).href;
const devConfigModule = pathToFileURL(
  fileURLToPath(new URL("../../src/cli/dev-config.ts", import.meta.url)),
).href;

const ASK = ["```ask id=store", "kind: choice", "question: Which store?", "options:", "  - sqlite", "  - files", "```"];

const HOME = [
  "---",
  "title: Notes home",
  "description: Where the notes start",
  "---",
  "",
  "Welcome.",
  "",
  ...ASK,
  "",
  "```index guide",
  "```",
  "",
].join("\n");

const SETUP = [
  "---",
  "title: Setup",
  "description: Getting set up",
  "---",
  "",
  "Install it.",
  "",
  "```sh",
  "bun add thing",
  "```",
  "",
  "## Answers",
  "",
  ...ASK.map((line) => line.replace("store", "tabbed")),
  "",
  "## Props",
  "",
  "```props thing",
  "```",
  "",
].join("\n");

const API = [
  { name: "ThingProps", extends: null, definition: null, rows: [{ name: "size?", type: "number", notes: "How big", source: null }] },
];

const SCRIPT = `
import { join } from "node:path";
const [scratch, out, asks, slugs = "standardoc", notes = "notes"] = process.argv.slice(2);
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
    siteName: "Notes",
    categories: [{ slug: "guide", label: "Guide" }],
    tabs: ["Answers", "Props"],
    ...(slugs === "standardoc" ? {} : { headingSlugs: slugs }),
  },
  { chrome: "static", mode: "production", ...(asks === "default" ? {} : { asks }) },
);
`;

let scratch = "";
let out = "";

function read(file: string): string {
  return readFileSync(join(out, file), "utf8");
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "mdocs-public-"));
  mkdirSync(join(scratch, "notes", "guide", ".miralabs"), { recursive: true });
  mkdirSync(join(scratch, "notes", ".miralabs"));
  mkdirSync(join(scratch, "work", "api"), { recursive: true });
  writeFileSync(join(scratch, "notes", "index.md"), HOME);
  writeFileSync(join(scratch, "notes", "guide", "setup.md"), SETUP);
  writeFileSync(join(scratch, "notes", ".miralabs", "plan.md"), "---\ntitle: Private plan\n---\n\nSecret.\n");
  writeFileSync(join(scratch, "notes", "guide", ".miralabs", "more.md"), "---\ntitle: More\n---\n");
  writeFileSync(join(scratch, "work", "api", "thing.json"), JSON.stringify(API));
  writeFileSync(join(scratch, "build.ts"), SCRIPT);

  out = join(scratch, "out");
  execFileSync("bun", [join(scratch, "build.ts"), scratch, out, "default"], { cwd: site, stdio: "pipe" });
}, 120_000);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("a public build", () => {
  it("ships no question, in the page or in a tab panel", () => {
    for (const file of ["index.html", "guide/setup/index.html"]) {
      const html = read(file);
      expect(html, file).not.toContain("mira-ask");
      expect(html, file).not.toContain("data-ask-id");
      expect(html, file).not.toContain("data-mira-ask");
      expect(html, file).not.toContain("Which store?");
      expect(html, file).not.toContain("Which tabbed?");
    }
    expect(read("guide/setup/index.html")).toContain("data-mira-tabs");
  });

  it("writes an index.md beside each index.html", () => {
    expect(read("index.md")).toBe(
      [
        "# Notes home",
        "",
        "> Where the notes start",
        "",
        "Welcome.",
        "",
        "- [Setup](/guide/setup/index.md): Getting set up",
        "",
      ].join("\n"),
    );
    const setup = read("guide/setup/index.md");
    expect(setup).toContain("# Setup\n\n> Getting set up\n\nInstall it.");
    expect(setup).toContain("```sh\nbun add thing\n```");
    expect(setup).toContain("### ThingProps\n\n| Name | Type | Notes |");
    expect(setup).toContain("| `size?` | `number` | How big |");
    expect(setup).not.toContain("Which store?");
    expect(setup).not.toContain("```props");
  });

  it("writes llms.txt in sidebar order", () => {
    expect(read("llms.txt")).toBe(
      [
        "# Notes",
        "",
        "- [Notes home](/index.md): Where the notes start",
        "",
        "## Guide",
        "",
        "- [Setup](/guide/setup/index.md): Getting set up",
        "",
      ].join("\n"),
    );
  });

  it("writes llms-full.txt with every page behind its source line", () => {
    const full = read("llms-full.txt");
    expect(full).toBe(`Source: /index.md\n\n${read("index.md")}\n---\n\nSource: /guide/setup/index.md\n\n${read("guide/setup/index.md")}`);
  });

  it("writes no search index and links no search stylesheet under the static chrome", () => {
    expect(existsSync(join(out, "search-index.json"))).toBe(false);
    expect(read("index.html")).not.toContain("search.css");
  });

  it("skips a .miralabs folder at any depth", () => {
    expect(existsSync(join(out, ".miralabs"))).toBe(false);
    expect(existsSync(join(out, "guide", ".miralabs"))).toBe(false);
    expect(read("llms-full.txt")).not.toContain("Secret.");
    expect(read("llms.txt")).not.toContain("Private plan");
  });
});

describe("a build that keeps the questions", () => {
  it("still shows the static block and leaves it out of index.md", () => {
    const kept = join(scratch, "kept");
    execFileSync("bun", [join(scratch, "build.ts"), scratch, kept, "static"], { cwd: site, stdio: "pipe" });
    expect(readFileSync(join(kept, "index.html"), "utf8")).toContain('data-ask-id="store"');
    expect(readFileSync(join(kept, "index.md"), "utf8")).not.toContain("Which store?");
  }, 120_000);
});

const SLUGGED = ["---", "title: Slugs", "---", "", "## 2.1 Graphe de dépendances", "", "#### Deep", "", "Text.", ""].join("\n");

describe("heading ids", () => {
  it("stay the engine's by default and become GitHub's with headingSlugs", () => {
    mkdirSync(join(scratch, "slugged", "guide"), { recursive: true });
    writeFileSync(join(scratch, "slugged", "guide", "slugs.md"), SLUGGED);
    const plain = join(scratch, "plain-slugs");
    const github = join(scratch, "github-slugs");
    execFileSync("bun", [join(scratch, "build.ts"), scratch, plain, "default", "standardoc", "slugged"], { cwd: site, stdio: "pipe" });
    execFileSync("bun", [join(scratch, "build.ts"), scratch, github, "default", "github", "slugged"], { cwd: site, stdio: "pipe" });
    const before = readFileSync(join(plain, "guide", "slugs", "index.html"), "utf8");
    const after = readFileSync(join(github, "guide", "slugs", "index.html"), "utf8");
    expect(before).toContain('id="2-1-graphe-de-dependances"');
    expect(before).not.toContain('id="deep"');
    expect(after).toContain('id="21-graphe-de-dépendances"');
    expect(after).toContain('<h4 id="deep">Deep</h4>');
  }, 120_000);

  it("are refused by mdocs build --slug with a value it does not know, exit 2", () => {
    const result = spawnSync("bun", [mdocs, "build", "--slug=gitlab"], { cwd: site, encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--slug");
  }, 60_000);
});

describe("mdocs build on a .miralabs folder", () => {
  it("refuses, says why and exits non-zero without writing the output", () => {
    const project = join(scratch, "private-project");
    mkdirSync(join(project, ".miralabs", "notes"), { recursive: true });
    writeFileSync(join(project, ".miralabs", "notes", "index.md"), "---\ntitle: Plan\n---\n");
    writeFileSync(
      join(project, "mdocs.config.ts"),
      'export default { contentDir: ".miralabs/notes", demosDir: "demos", apiDir: "api", categories: [] };\n',
    );

    const result = spawnSync("bun", [mdocs, "build"], { cwd: project, encoding: "utf8" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(".miralabs");
    expect(existsSync(join(project, "dist"))).toBe(false);
  }, 60_000);
});
