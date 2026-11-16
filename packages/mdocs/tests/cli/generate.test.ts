/**
 * The specifiers the generated entry writes, which the bundler has to resolve.
 *
 * The cross-drive case only exists on Windows: `mdocs dev --root` builds under the
 * OS temp folder, often on C:, while the UI package it imports sits on D:.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generate, specifier } from "../../src/cli/generate";

describe("specifier", () => {
  it("is relative and dot-led on the same tree", () => {
    const from = process.platform === "win32" ? "D:\\a\\.mdocs" : "/a/.mdocs";
    const to = process.platform === "win32" ? "D:\\a\\demos\\x" : "/a/demos/x";
    expect(specifier(from, to)).toBe("../demos/x");
  });

  it.runIf(process.platform === "win32")("stays absolute across two drives", () => {
    expect(specifier("C:\\Temp\\mdocs-dev\\work\\.mdocs", "D:\\ui\\src\\ask.ts")).toBe(
      "D:/ui/src/ask.ts",
    );
  });
});

describe("generate", () => {
  function entryOf(ui?: { ui?: string; asks?: boolean }): string {
    const root = mkdtempSync(join(tmpdir(), "mdocs-generate-"));
    try {
      const { entry } = generate(root, join(root, "demos"), [], [], ui);
      return readFileSync(entry, "utf8");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it("wires the drawer from the ui package when it resolves", () => {
    const source = entryOf({ ui: join(tmpdir(), "ui", "index.ts"), asks: false });
    expect(source).toContain("import { wireNavDrawer, wireSearch } from ");
    expect(source).toContain("wireNavDrawer(document);");
    expect(source).not.toContain("hydrateAsks");
    expect(source).not.toContain("kit/react/drawer");
  });

  it("adds the ask islands after the demos when they are hydrated", () => {
    const source = entryOf({ ui: join(tmpdir(), "ui", "index.ts"), asks: true });
    expect(source).toContain("import { wireNavDrawer, wireSearch, hydrateAsks } from ");
    expect(source.indexOf("wireNavDrawer(document);")).toBeLessThan(
      source.indexOf("hydrateIslands(document"),
    );
    expect(source.indexOf("hydrateIslands(document")).toBeLessThan(
      source.indexOf("hydrateAsks(document);"),
    );
  });

  it("wires the search palette after the drawer and before the islands hydrate", () => {
    const source = entryOf({ ui: join(tmpdir(), "ui", "index.ts"), asks: false });
    expect(source).toContain("wireSearch(document);");
    expect(source.indexOf("wireNavDrawer(document);")).toBeLessThan(
      source.indexOf("wireSearch(document);"),
    );
    expect(source.indexOf("wireSearch(document);")).toBeLessThan(
      source.indexOf("hydrateIslands(document"),
    );
  });

  it("leaves the drawer and the palette out without the ui package", () => {
    const source = entryOf();
    expect(source).not.toContain("wireNavDrawer");
    expect(source).not.toContain("wireSearch");
    expect(source).not.toContain("drawer");
    expect(source).toContain("wireToc(document);\nvoid hydrateIslands");
  });
});
