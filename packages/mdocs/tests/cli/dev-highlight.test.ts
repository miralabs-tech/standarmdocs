/**
 * `mdocs dev` makes one highlighter and every rebuild reuses it.
 *
 * The count is asserted in-process with an injected factory and a build that writes
 * one page. The byte comparison needs `Bun.build`, so it is spawned under Bun: two
 * development builds sharing one highlighter against a build that made its own.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { HighlightHandle } from "../../src/index";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BuildOptions } from "../../src/cli/build";
import { type DevServer, startDev } from "../../src/cli/dev";

const site = fileURLToPath(new URL("../fixtures/site", import.meta.url));
const buildModule = pathToFileURL(fileURLToPath(new URL("../../src/cli/build.ts", import.meta.url))).href;
const devConfigModule = pathToFileURL(
  fileURLToPath(new URL("../../src/cli/dev-config.ts", import.meta.url)),
).href;
const kitModule = pathToFileURL(
  fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
).href;

const PAGE = [
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
  "```tsx",
  "export const a = <div className=\"x\">{1 + 1}</div>;",
  "```",
  "",
].join("\n");

const SCRIPT = `
import { join } from "node:path";
const [scratch] = process.argv.slice(2);
const { build } = await import(${JSON.stringify(buildModule)});
const { prepareGeneratedRoot } = await import(${JSON.stringify(devConfigModule)});
const { createHighlight } = await import(${JSON.stringify(kitModule)});
const work = join(scratch, "work");
prepareGeneratedRoot(work);
const config = (outDir) => ({
  root: work,
  contentDir: join(scratch, "notes"),
  demosDir: join(work, "demos"),
  apiDir: join(work, "api"),
  outDir,
  siteName: "Notes",
  categories: [],
});
const shared = await createHighlight();
const base = { chrome: "static", mode: "development", asks: "island" };
await build(config(join(scratch, "first")), { ...base, highlight: shared });
await build(config(join(scratch, "second")), { ...base, highlight: shared });
shared.dispose();
await build(config(join(scratch, "fresh")), base);
`;

let scratch = "";
let server: DevServer | undefined;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "mdocs-dev-hl-"));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(scratch, { recursive: true, force: true });
});

describe("the dev highlighter", () => {
  it("is created once across rebuilds, handed to each, and disposed on close", async () => {
    const content = join(scratch, "content");
    mkdirSync(content);
    writeFileSync(join(content, "notes.md"), "# Notes\n");

    let created = 0;
    let disposed = 0;
    const handle = Object.assign((): string => "", {
      dispose: () => {
        disposed += 1;
      },
    }) as HighlightHandle;
    const seen: BuildOptions[] = [];

    server = await startDev({
      cwd: scratch,
      root: content,
      write: false,
      port: 0,
      chrome: "static",
      createHighlight: async () => {
        created += 1;
        return handle;
      },
      build: async (config, options) => {
        seen.push(options);
        mkdirSync(config.outDir, { recursive: true });
        writeFileSync(join(config.outDir, "index.html"), `<html><body>${seen.length}</body></html>`);
        return 1;
      },
    });

    for (let n = 2; n <= 5; n++) {
      writeFileSync(join(content, "notes.md"), `# Notes ${n}\n`);
      const end = Date.now() + 5000;
      while (seen.length < n && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
    }

    expect(seen.length).toBeGreaterThanOrEqual(5);
    expect(created).toBe(1);
    expect(new Set(seen.map((options) => options.highlight))).toEqual(new Set([handle]));
    expect(disposed).toBe(0);

    await server.close();
    server = undefined;
    expect(disposed).toBe(1);
  }, 30_000);

  it("rebuilds to the same bytes as a build with a highlighter of its own", () => {
    mkdirSync(join(scratch, "notes"), { recursive: true });
    mkdirSync(join(scratch, "work", "api"), { recursive: true });
    writeFileSync(join(scratch, "notes", "index.md"), PAGE);
    writeFileSync(join(scratch, "build.ts"), SCRIPT);
    execFileSync("bun", [join(scratch, "build.ts"), scratch], { cwd: site, stdio: "pipe" });

    const read = (dir: string): string => readFileSync(join(scratch, dir, "index.html"), "utf8");
    const fresh = read("fresh");
    expect(fresh).toContain("shiki");
    expect(read("first")).toBe(fresh);
    expect(read("second")).toBe(fresh);
  }, 120_000);
});
