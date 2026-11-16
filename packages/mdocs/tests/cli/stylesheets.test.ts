/**
 * Which sheets a build links when no theme package resolves: the config's own,
 * in order, and no complaint.
 *
 * Spawned under Bun, because `Bun.build` exists only there. The build runs from a
 * made-up root in a scratch folder, with the cwd on that folder, where nothing
 * else resolves.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const buildModule = pathToFileURL(fileURLToPath(new URL("../../src/cli/build.ts", import.meta.url))).href;
const devConfigModule = pathToFileURL(
  fileURLToPath(new URL("../../src/cli/dev-config.ts", import.meta.url)),
).href;

const SCRIPT = `
import { join } from "node:path";
const [scratch, out, ...stylesheets] = process.argv.slice(2);
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
    siteName: "notes",
    categories: [],
    stylesheets,
  },
  { chrome: "static", mode: "production" },
);
`;

const KIT_SHEET = "@standarx/mdocs/styles/docs.css";

let scratch = "";

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "mdocs-stylesheets-"));
  mkdirSync(join(scratch, "notes"));
  writeFileSync(join(scratch, "notes", "index.md"), "# Home\n\nText.\n");
  writeFileSync(join(scratch, "build.ts"), SCRIPT);
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("a build where no theme package resolves", () => {
  it("links the config's sheets and says nothing", () => {
    const out = join(scratch, "bare");
    const result = spawnSync("bun", [join(scratch, "build.ts"), scratch, out, KIT_SHEET], {
      cwd: scratch,
      encoding: "utf8",
    });
    if (result.status !== 0) throw new Error(`the build failed:\n${result.stderr}`);
    const html = readFileSync(join(out, "index.html"), "utf8");
    const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => match[1] ?? "");
    expect(sheets).toEqual(["/assets/docs.css"]);
    expect(result.stderr).not.toContain("not resolved");
  }, 120_000);
});
