/**
 * What `mdocs build` emits when the site is served under a base path.
 *
 * Spawned under Bun for the same reason as `public-build.test.ts`, from a made-up
 * root in a scratch folder with the cwd on the engine's fixture site, under the
 * static chrome.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const HOME = [
  "---",
  "title: Notes home",
  "description: Where the notes start",
  "related: [/guide/setup]",
  "---",
  "",
  "Welcome. Read [the setup](guide/setup.md#top) or [by route](/guide/setup).",
  "",
  "```index guide",
  "```",
  "",
].join("\n");

const SETUP = [
  "---",
  "title: Setup",
  "description: Getting set up",
  "related: [/]",
  "---",
  "",
  "Back to [home](../index.md).",
  "",
].join("\n");

const SCRIPT = `
import { join } from "node:path";
const [scratch, out, base = ""] = process.argv.slice(2);
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
    outDir: out,
    siteName: "Notes",
    categories: [{ slug: "guide", label: "Guide" }],
    stylesheets: ["@standarx/mdocs/styles/docs.css"],
    ...(base === "" ? {} : { base }),
  },
  { chrome: "static", mode: "production" },
);
`;

let scratch = "";
let out = "";

function read(file: string): string {
  return readFileSync(join(out, file), "utf8");
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(full);
    return entry.name.endsWith(".html") ? [full] : [];
  });
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "mdocs-base-"));
  mkdirSync(join(scratch, "notes", "guide"), { recursive: true });
  mkdirSync(join(scratch, "work", "api"), { recursive: true });
  writeFileSync(join(scratch, "notes", "index.md"), HOME);
  writeFileSync(join(scratch, "notes", "guide", "setup.md"), SETUP);
  writeFileSync(join(scratch, "build.ts"), SCRIPT);

  out = join(scratch, "out");
  execFileSync("bun", [join(scratch, "build.ts"), scratch, out, "standarui"], { cwd: site, stdio: "pipe" });
}, 120_000);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("a build with base /standarui/", () => {
  it("keeps the layout of the output", () => {
    expect(existsSync(join(out, "index.html"))).toBe(true);
    expect(existsSync(join(out, "guide", "setup", "index.html"))).toBe(true);
  });

  it("starts every root-absolute href and src of every page with the base", () => {
    const files = htmlFiles(out);
    expect(files.length).toBe(2);
    for (const file of files) {
      const html = readFileSync(file, "utf8");
      const urls = [...html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)].map((match) => match[1] ?? "");
      expect(urls.length, file).toBeGreaterThan(0);
      for (const url of urls) expect(url.startsWith("/standarui/"), `${file}: ${url}`).toBe(true);
    }
  });

  it("links the script, the stylesheets, the sidebar and the links of the prose under the base", () => {
    const html = read("guide/setup/index.html");
    expect(html).toMatch(/<script type="module" src="\/standarui\/assets\/[^"]+"><\/script>/);
    expect(html).toMatch(/<link rel="stylesheet" href="\/standarui\/assets\/[^"]+" \/>/);
    expect(html).toContain('<a href="/standarui/guide/setup" aria-current="page">');
    expect(html).toContain('href="/standarui/"');
    expect(read("index.html")).toContain('href="/standarui/guide/setup#top"');
    expect(read("index.html")).toContain('href="/standarui/guide/setup"');
  });

  it("writes the base on <html>", () => {
    for (const file of htmlFiles(out)) {
      expect(readFileSync(file, "utf8")).toContain('<html lang="en" data-mdocs-base="/standarui/">');
    }
  });

  it("links the pages' Markdown under the base in llms.txt, llms-full.txt and index.md", () => {
    expect(read("llms.txt")).toContain("- [Notes home](/standarui/index.md)");
    expect(read("llms.txt")).toContain("- [Setup](/standarui/guide/setup/index.md)");
    expect(read("llms.txt")).not.toMatch(/\]\(\/(?!standarui\/)/);
    expect(read("llms-full.txt")).toContain("Source: /standarui/guide/setup/index.md");
    expect(read("llms-full.txt")).not.toMatch(/^Source: \/(?!standarui\/)/m);
    expect(read("index.md")).toContain("[the setup](/standarui/guide/setup/index.md#top)");
    expect(read("index.md")).toContain("[by route](/standarui/guide/setup)");
    expect(read("index.md")).toContain("- [Setup](/standarui/guide/setup/index.md): Getting set up");
  });
});

describe("mdocs build --base", () => {
  it("refuses a URL, a query and a fragment, exit 2", () => {
    for (const bad of ["--base=https://host/x/", "--base=/x/?a=1", "--base=/x/#a"]) {
      const result = spawnSync("bun", [mdocs, "build", bad], { cwd: site, encoding: "utf8" });
      expect(result.status, bad).toBe(2);
      expect(result.stderr, bad).toContain("--base");
    }
  }, 60_000);
});
