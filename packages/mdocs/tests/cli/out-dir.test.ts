/**
 * The guard in front of the one destructive thing the build does: emptying its
 * output directory, whose path comes straight from `--out`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OUT_MARKER, prepareOutDir } from "../../src/cli/out-dir";

let site = "";
let content = "";

beforeEach(() => {
  site = fs.mkdtempSync(path.join(os.tmpdir(), "mdocs-out-"));
  content = path.join(site, "content");
  fs.mkdirSync(content);
  fs.writeFileSync(path.join(content, "index.md"), "# Home\n");
});

afterEach(() => {
  fs.rmSync(site, { recursive: true, force: true });
});

function guard(outDir: string): void {
  prepareOutDir({ outDir, protect: [site, content] });
}

describe("the output directory", () => {
  it("is created with the marker when it does not exist", () => {
    const out = path.join(site, "dist");
    guard(out);
    expect(fs.readdirSync(out)).toEqual([OUT_MARKER]);
  });

  it("is emptied when a previous build marked it", () => {
    const out = path.join(site, "dist");
    guard(out);
    fs.writeFileSync(path.join(out, "stale.js"), "");
    guard(out);
    expect(fs.readdirSync(out)).toEqual([OUT_MARKER]);
  });

  it("is taken when it exists and is empty", () => {
    const out = path.join(site, "dist");
    fs.mkdirSync(out);
    guard(out);
    expect(fs.readdirSync(out)).toEqual([OUT_MARKER]);
  });

  it("is refused, and left whole, when it holds files mdocs did not write", () => {
    const out = path.join(site, "notes");
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, "keep.md"), "mine");
    expect(() => guard(out)).toThrow(/not written by mdocs/);
    expect(fs.readFileSync(path.join(out, "keep.md"), "utf8")).toBe("mine");
  });

  it("is refused when it is the site root, or a parent of it", () => {
    expect(() => guard(site)).toThrow(/contains/);
    expect(() => guard(path.dirname(site))).toThrow(/contains/);
    expect(fs.existsSync(path.join(content, "index.md"))).toBe(true);
  });

  it("is refused when it is the content directory", () => {
    expect(() => guard(content)).toThrow(/contains/);
  });

  it("is refused when it is the home folder or a drive root", () => {
    expect(() => guard(os.homedir())).toThrow(/contains/);
    expect(() => guard(path.parse(site).root)).toThrow(/root of a drive/);
  });

  it("is refused when it is a file", () => {
    const file = path.join(site, "dist");
    fs.writeFileSync(file, "");
    expect(() => guard(file)).toThrow(/is a file/);
  });
});
